"""Integración con el modelo real (``modelos/*.onnx``).

Se **omite** si los pesos no están: no se versionan, así que la CI corre sin
ellos. Con los pesos (local o dentro de la imagen Docker) comprueba que el
servicio reproduce la huella que PyTorch dejó en ``modelo.json`` al exportar:
mismo preprocesado, mismo modelo y misma decodificación.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.domain.deteccion import ClaseDano
from app.domain.imagen import ImagenRGB
from app.infrastructure.configuracion import DIR_MODELO_POR_DEFECTO, Configuracion
from app.infrastructure.onnx_modelo import OnnxModelo, pares_crudos, preprocesar
from app.main import crear_app
from scripts.sinteticas import imagenes_sinteticas
from tests.dobles import imagen_sintetica

DIRECTORIO = Path(os.environ.get("INFERENCIA_MODELO_DIR") or DIR_MODELO_POR_DEFECTO)
RUTA_METADATOS = DIRECTORIO / "modelo.json"
METADATOS = json.loads(RUTA_METADATOS.read_text(encoding="utf-8")) if RUTA_METADATOS.is_file() else {}
HAY_PESOS = bool(METADATOS) and (DIRECTORIO / METADATOS.get("archivo", "-")).is_file()

pytestmark = [
    pytest.mark.modelo_real,
    pytest.mark.skipif(
        not HAY_PESOS,
        reason=f"Sin pesos en {DIRECTORIO} (no se versionan): genera el .onnx con scripts/exportar_onnx.py",
    ),
]

CONFIANZA_MINIMA = 0.10


@pytest.fixture(scope="module")
def modelo() -> OnnxModelo:
    return OnnxModelo.cargar(DIRECTORIO, hilos=2, confianza_minima=CONFIANZA_MINIMA, max_detecciones=100)


@pytest.fixture(scope="module")
def sinteticas() -> list[tuple[str, ImagenRGB]]:
    return [(nombre, ImagenRGB(i.width, i.height, i.tobytes())) for nombre, i in imagenes_sinteticas()]


def test_la_version_es_la_registrada_al_exportar(modelo):
    assert str(modelo.version) == METADATOS["version"]
    assert str(modelo.version).startswith("rdd2022-rfdetr-nano-66429f3-")


def test_reproduce_la_huella_de_pytorch(modelo, sinteticas):
    huella = METADATOS["huella_pytorch"]["imagenes"]
    assert set(huella) == {nombre for nombre, _ in sinteticas}
    for nombre, imagen in sinteticas:
        cajas, logits = modelo.inferir(preprocesar(imagen, METADATOS["resolucion"]))
        nuestros = {
            (p.consulta, p.columna): p
            for p in pares_crudos(
                cajas, logits, imagen.ancho, imagen.alto, indice_fondo=METADATOS["indice_fondo"],
                confianza_minima=0.0, max_pares=50,
            )
        }
        for consulta, columna, confianza, *caja in huella[nombre]:
            par = nuestros.get((consulta, columna))
            assert par is not None, f"{nombre}: falta el par ({consulta}, {columna}) de PyTorch"
            assert par.confianza == pytest.approx(confianza, abs=1e-3), nombre
            assert list(par.xyxy) == pytest.approx(caja, abs=0.5), nombre


def test_las_detecciones_cumplen_el_contrato(modelo, sinteticas):
    for nombre, imagen in sinteticas:
        for d in modelo.detectar(imagen):
            assert d.clase in (ClaseDano.BACHE, ClaseDano.GRIETA)
            assert CONFIANZA_MINIMA <= d.confianza <= 1.0
            assert d.caja.x2 <= imagen.ancho and d.caja.y2 <= imagen.alto, nombre


def test_es_determinista(modelo, sinteticas):
    _, imagen = sinteticas[3]  # 2048 x 1536, como las fotos saneadas por el backend
    inicio = time.perf_counter()
    primera = modelo.detectar(imagen)
    milisegundos = (time.perf_counter() - inicio) * 1000
    assert primera == modelo.detectar(imagen)
    print(f"\n2048x1536 con 2 hilos: {milisegundos:.0f} ms, {len(primera)} detecciones")


def test_el_servicio_completo_responde_con_el_modelo_real():
    cliente = TestClient(crear_app(Configuracion.desde_entorno({"INFERENCIA_MODELO_DIR": str(DIRECTORIO)})))
    respuesta = cliente.post("/v1/detecciones", files={"imagen": ("a.jpg", imagen_sintetica(640, 480), "image/jpeg")})
    assert respuesta.status_code == 200
    assert respuesta.json()["version_modelo"] == METADATOS["version"]
    assert cliente.get("/salud").json() == {"estado": "ok", "version_modelo": METADATOS["version"]}
