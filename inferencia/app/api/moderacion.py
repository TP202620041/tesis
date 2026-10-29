"""``POST /v1/moderacion``: mide la probabilidad de contenido sexual explícito de una foto (D-15)."""

from __future__ import annotations

import logging
import time
from typing import Annotated

from anyio import CapacityLimiter, to_thread
from fastapi import APIRouter, Depends, File, UploadFile

from app.api.dependencias import caso_moderar, limitador_moderacion
from app.api.esquemas import ErrorRespuesta, ModeracionRespuesta
from app.application.moderar import ModerarImagen

registro = logging.getLogger("inferencia.api")

router = APIRouter(prefix="/v1", tags=["moderacion"])


@router.post(
    "/moderacion",
    response_model=ModeracionRespuesta,
    summary="Medir si una foto tiene contenido sexual explícito",
    description=(
        "Recibe una imagen JPEG, PNG o WEBP y devuelve la probabilidad de contenido sexual explícito "
        "(el máximo de dos recortes de 384 px que cubren toda la foto). El servicio solo mide: el umbral "
        "de rechazo lo aplica el backend. Mismos errores y validación que `/v1/detecciones`."
    ),
    responses={
        400: {"model": ErrorRespuesta, "description": "Imagen inválida o solicitud sin el campo `imagen`."},
        413: {"model": ErrorRespuesta, "description": "La imagen supera el máximo de bytes o de píxeles."},
        500: {"model": ErrorRespuesta, "description": "El modelo falló."},
    },
)
async def moderar(
    imagen: Annotated[UploadFile, File(description="Foto del reporte (JPEG, PNG o WEBP).")],
    caso: Annotated[ModerarImagen, Depends(caso_moderar)],
    procesos: Annotated[CapacityLimiter, Depends(limitador_moderacion)],
) -> ModeracionRespuesta:
    # Igual que /v1/detecciones: como máximo un byte más que el límite.
    datos = await imagen.read(caso.limites.max_bytes + 1)
    inicio = time.perf_counter()
    # Con su propio limitador: una moderación no espera detrás de las detecciones.
    resultado = await to_thread.run_sync(caso, datos, limiter=procesos)
    registro.info(
        "moderacion puntaje=%.3f bytes=%d ms=%.0f (con la espera) version=%s",
        resultado.puntaje,
        len(datos),
        (time.perf_counter() - inicio) * 1000,
        resultado.version_modelo,
    )
    return ModeracionRespuesta.desde(resultado)
