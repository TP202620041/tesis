"""Dependencias de FastAPI: los routers reciben lo que armaron ``app.main`` y ``construir_api``."""

from __future__ import annotations

from anyio import CapacityLimiter
from fastapi import Request

from app.application.detectar import DetectarDanos


def caso_detectar(request: Request) -> DetectarDanos:
    return request.app.state.detectar


def limitador(request: Request) -> CapacityLimiter:
    return request.app.state.limitador
