"""Raíz de composición: arma los adaptadores, el caso de uso y la app FastAPI.

Es el único módulo que conoce a la vez la infraestructura y la presentación
(el equivalente a lo que hace Spring en el backend). Se arranca como fábrica,
así importar este módulo no carga el modelo:

    uvicorn app.main:crear_app --factory --host 0.0.0.0 --port 8000

Si el modelo falta, está incompleto o su hash no coincide con ``modelo.json``,
``crear_app`` lanza una excepción y el proceso no arranca (falla rápido: mejor
un despliegue rojo que un servicio que responde sin poder detectar).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.api.servidor import construir_api
from app.application.detectar import DetectarDanos
from app.infrastructure.configuracion import Configuracion
from app.infrastructure.onnx_modelo import OnnxModelo
from app.infrastructure.pillow_decodificador import PillowDecodificador


def crear_app(configuracion: Configuracion | None = None) -> FastAPI:
    _configurar_registro()
    configuracion = configuracion or Configuracion.desde_entorno()
    modelo = OnnxModelo.cargar(
        configuracion.dir_modelo,
        hilos=configuracion.hilos,
        confianza_minima=configuracion.confianza_minima,
        max_detecciones=configuracion.max_detecciones,
    )
    caso = DetectarDanos(PillowDecodificador(), modelo, configuracion.limites)
    logging.getLogger("inferencia").info(
        "Modelo %s cargado (hilos=%d, confianza_minima=%.2f, max_bytes=%d, max_pixeles=%d)",
        modelo.version,
        configuracion.hilos,
        configuracion.confianza_minima,
        configuracion.limites.max_bytes,
        configuracion.limites.max_pixeles,
    )
    return construir_api(caso)


def _configurar_registro() -> None:
    raiz = logging.getLogger()
    if not raiz.handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
