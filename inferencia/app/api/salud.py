"""``GET /salud``: el servicio está arriba y con los dos modelos cargados.

Los modelos se cargan al arrancar y, si alguno falta o no coincide su hash, el
proceso no arranca (``app.main``). Por eso, si esta ruta responde, el servicio
puede detectar y moderar.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencias import caso_detectar, caso_moderar
from app.api.esquemas import SaludRespuesta
from app.application.detectar import DetectarDanos
from app.application.moderar import ModerarImagen

router = APIRouter(tags=["salud"])


@router.get("/salud", response_model=SaludRespuesta, summary="Estado del servicio y versión de cada modelo")
async def salud(
    detectar: Annotated[DetectarDanos, Depends(caso_detectar)],
    moderar: Annotated[ModerarImagen, Depends(caso_moderar)],
) -> SaludRespuesta:
    return SaludRespuesta(version_modelo=detectar.version_modelo, version_moderacion=moderar.version_modelo)
