"""Traducción de errores a HTTP. Es el único lugar que conoce los códigos de estado.

Todas las respuestas de error tienen la forma ``{"codigo": str, "mensaje": str}``:

| Error | Estado | ``codigo`` |
|---|---|---|
| ``ImagenInvalida`` (vacía, dañada, formato no permitido) | 400 | ``imagen_invalida`` |
| Falta el campo ``imagen`` o la solicitud no es multipart | 400 | ``solicitud_invalida`` |
| ``ImagenDemasiadoGrande`` o cuerpo por encima del límite | 413 | ``imagen_demasiado_grande`` |
| ``ErrorDeInferencia`` | 500 | ``error_de_inferencia`` |
| Cualquier otro error | 500 | ``error_interno`` |
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.errores import ErrorDeInferencia, ImagenDemasiadoGrande, ImagenInvalida

registro = logging.getLogger("inferencia.api")

_CODIGOS_HTTP = {
    400: "solicitud_invalida",
    404: "no_encontrado",
    405: "metodo_no_permitido",
    413: "imagen_demasiado_grande",
}


def respuesta_de_error(estado: int, codigo: str, mensaje: str) -> JSONResponse:
    return JSONResponse(status_code=estado, content={"codigo": codigo, "mensaje": mensaje})


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ImagenInvalida)
    async def _imagen_invalida(_: Request, error: ImagenInvalida) -> JSONResponse:
        return respuesta_de_error(400, "imagen_invalida", str(error))

    @app.exception_handler(ImagenDemasiadoGrande)
    async def _imagen_grande(_: Request, error: ImagenDemasiadoGrande) -> JSONResponse:
        return respuesta_de_error(413, "imagen_demasiado_grande", str(error))

    @app.exception_handler(ErrorDeInferencia)
    async def _inferencia(_: Request, error: ErrorDeInferencia) -> JSONResponse:
        registro.error("Falló la inferencia: %s", error, exc_info=error)
        return respuesta_de_error(500, "error_de_inferencia", "El modelo no pudo analizar la imagen.")

    @app.exception_handler(RequestValidationError)
    async def _validacion(_: Request, error: RequestValidationError) -> JSONResponse:
        falta_imagen = any(tuple(e.get("loc", ()))[-1:] == ("imagen",) for e in error.errors())
        mensaje = (
            "Falta el archivo «imagen» (multipart/form-data)."
            if falta_imagen
            else "La solicitud no tiene la forma esperada (multipart/form-data con el campo «imagen»)."
        )
        return respuesta_de_error(400, "solicitud_invalida", mensaje)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, error: StarletteHTTPException) -> JSONResponse:
        codigo = _CODIGOS_HTTP.get(error.status_code, "error_http")
        respuesta = respuesta_de_error(error.status_code, codigo, str(error.detail))
        if error.headers:
            respuesta.headers.update(error.headers)
        return respuesta

    @app.exception_handler(Exception)
    async def _inesperado(_: Request, error: Exception) -> JSONResponse:
        registro.error("Error no controlado", exc_info=error)
        return respuesta_de_error(500, "error_interno", "Error interno del servicio de inferencia.")
