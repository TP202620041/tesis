"""``GET /salud``: el servicio está arriba y con el modelo cargado.

El modelo se carga al arrancar y, si falta o no coincide su hash, el proceso no
arranca (``app.main``). Por eso, si esta ruta responde, el servicio puede detectar.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencias import caso_detectar
from app.api.esquemas import SaludRespuesta
from app.application.detectar import DetectarDanos

router = APIRouter(tags=["salud"])


@router.get("/salud", response_model=SaludRespuesta, summary="Estado del servicio y versión del modelo")
async def salud(caso: Annotated[DetectarDanos, Depends(caso_detectar)]) -> SaludRespuesta:
    return SaludRespuesta(version_modelo=caso.version_modelo)
