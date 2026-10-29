"""Dependencias de FastAPI: los routers reciben lo que armaron ``app.main`` y ``construir_api``."""

from __future__ import annotations

from anyio import CapacityLimiter
from fastapi import Request

from app.application.detectar import DetectarDanos
from app.application.moderar import ModerarImagen


def caso_detectar(request: Request) -> DetectarDanos:
    return request.app.state.detectar


def limitador(request: Request) -> CapacityLimiter:
    return request.app.state.limitador


def caso_moderar(request: Request) -> ModerarImagen:
    return request.app.state.moderar


def limitador_moderacion(request: Request) -> CapacityLimiter:
    """Propio de la moderación: una moderación no espera detrás de las detecciones."""
    return request.app.state.limitador_moderacion
