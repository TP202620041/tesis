"""Arma la aplicación FastAPI a partir de un caso de uso ya construido.

No conoce la infraestructura: ``app.main`` le pasa el ``DetectarDanos`` con sus
adaptadores, y los tests le pasan uno con dobles.
"""

from __future__ import annotations

from anyio import CapacityLimiter
from fastapi import FastAPI

from app.api import detecciones, salud
from app.api.errores import registrar_manejadores
from app.api.limite_cuerpo import LimiteDeCuerpo
from app.application.detectar import DetectarDanos

MARGEN_MULTIPART = 64 * 1024
"""Bytes extra que se permiten en el cuerpo por los encabezados y separadores del multipart."""

PROCESOS_SIMULTANEOS = 2
"""Solicitudes que decodifican o infieren a la vez; el resto espera con solo sus bytes en memoria.

El modelo ya corre de a una inferencia (``OnnxModelo`` las serializa). Con 2, la
siguiente foto se decodifica mientras la anterior está en el modelo, y la
memoria queda acotada a dos imágenes decodificadas aunque lleguen muchas
solicitudes juntas.
"""


def construir_api(caso: DetectarDanos) -> FastAPI:
    app = FastAPI(
        title="Ciudad Viva · inferencia",
        version="1",
        summary="Detección de daños viales (bache, grieta) en una foto, para sugerir la categoría de un reporte.",
    )
    app.state.detectar = caso
    app.state.limitador = CapacityLimiter(PROCESOS_SIMULTANEOS)
    app.include_router(detecciones.router)
    app.include_router(salud.router)
    registrar_manejadores(app)
    app.add_middleware(LimiteDeCuerpo, max_bytes=caso.limites.max_bytes + MARGEN_MULTIPART)
    return app
