"""Arma la aplicación FastAPI a partir de los casos de uso ya construidos.

No conoce la infraestructura: ``app.main`` le pasa ``DetectarDanos`` y
``ModerarImagen`` con sus adaptadores, y los tests le pasan unos con dobles.
"""

from __future__ import annotations

from anyio import CapacityLimiter
from fastapi import FastAPI

from app.api import detecciones, moderacion, salud
from app.api.errores import registrar_manejadores
from app.api.limite_cuerpo import LimiteDeCuerpo
from app.application.detectar import DetectarDanos
from app.application.moderar import ModerarImagen

MARGEN_MULTIPART = 64 * 1024
"""Bytes extra que se permiten en el cuerpo por los encabezados y separadores del multipart."""

PROCESOS_SIMULTANEOS = 2
"""Solicitudes de detección que decodifican o infieren a la vez; el resto espera con solo sus bytes en memoria.

El modelo ya corre de a una inferencia (``OnnxModelo`` las serializa). Con 2, la
siguiente foto se decodifica mientras la anterior está en el modelo, y la
memoria queda acotada a dos imágenes decodificadas aunque lleguen muchas
solicitudes juntas.
"""

PROCESOS_SIMULTANEOS_MODERACION = 2
"""Lo mismo para la moderación, con un limitador **aparte** (y un candado aparte en
``OnnxModeracion``): una moderación nunca espera detrás de las detecciones. El tope de
conexiones de uvicorn (``INFERENCIA_MAX_CONCURRENCIA``), en cambio, es uno solo para
todo el proceso y cuenta las de los dos endpoints."""


def construir_api(detectar: DetectarDanos, moderar: ModerarImagen) -> FastAPI:
    app = FastAPI(
        title="Ciudad Viva · inferencia",
        version="1",
        summary=(
            "Detección de daños viales (bache, grieta) para sugerir la categoría de un reporte, "
            "y moderación de la foto (contenido sexual explícito)."
        ),
    )
    app.state.detectar = detectar
    app.state.limitador = CapacityLimiter(PROCESOS_SIMULTANEOS)
    app.state.moderar = moderar
    app.state.limitador_moderacion = CapacityLimiter(PROCESOS_SIMULTANEOS_MODERACION)
    app.include_router(detecciones.router)
    app.include_router(moderacion.router)
    app.include_router(salud.router)
    registrar_manejadores(app)
    max_bytes = max(detectar.limites.max_bytes, moderar.limites.max_bytes)
    app.add_middleware(LimiteDeCuerpo, max_bytes=max_bytes + MARGEN_MULTIPART)
    return app
