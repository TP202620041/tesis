"""``POST /v1/detecciones``: detecta daños viales en una imagen (contrato §6)."""

from __future__ import annotations

import logging
import time
from typing import Annotated

from anyio import CapacityLimiter, to_thread
from fastapi import APIRouter, Depends, File, UploadFile

from app.api.dependencias import caso_detectar, limitador
from app.api.esquemas import DeteccionesRespuesta, ErrorRespuesta
from app.application.detectar import DetectarDanos

registro = logging.getLogger("inferencia.api")

router = APIRouter(prefix="/v1", tags=["detecciones"])


@router.post(
    "/detecciones",
    response_model=DeteccionesRespuesta,
    summary="Detectar daños viales en una foto",
    description=(
        "Recibe una imagen JPEG, PNG o WEBP y devuelve **todas** las detecciones de `bache` y `grieta` "
        "por encima de un piso técnico de confianza. El servicio solo detecta: el umbral de sugerencia "
        "y la clase dominante los aplica el backend."
    ),
    responses={
        400: {"model": ErrorRespuesta, "description": "Imagen inválida o solicitud sin el campo `imagen`."},
        413: {"model": ErrorRespuesta, "description": "La imagen supera el máximo de bytes o de píxeles."},
        500: {"model": ErrorRespuesta, "description": "El modelo falló."},
    },
)
async def detectar(
    imagen: Annotated[UploadFile, File(description="Foto del daño (JPEG, PNG o WEBP).")],
    caso: Annotated[DetectarDanos, Depends(caso_detectar)],
    procesos: Annotated[CapacityLimiter, Depends(limitador)],
) -> DeteccionesRespuesta:
    # Lee como máximo un byte más que el límite: basta para que el caso de uso
    # detecte el exceso sin cargar en memoria un archivo arbitrario.
    datos = await imagen.read(caso.limites.max_bytes + 1)
    inicio = time.perf_counter()
    # Decodificar e inferir es CPU intensivo y bloqueante: va a un hilo (el bucle
    # de eventos sigue respondiendo /salud), con a lo sumo PROCESOS_SIMULTANEOS a la vez.
    resultado = await to_thread.run_sync(caso, datos, limiter=procesos)
    registro.info(
        "detecciones=%d bytes=%d ms=%.0f (con la espera) version=%s",
        len(resultado.detecciones),
        len(datos),
        (time.perf_counter() - inicio) * 1000,
        resultado.version_modelo,
    )
    return DeteccionesRespuesta.desde(resultado)
