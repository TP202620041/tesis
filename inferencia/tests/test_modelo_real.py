"""Integración con los modelos reales (``modelos/*.onnx``).

Cada prueba se **omite** si faltan los pesos que necesita: no se versionan, así
que la CI corre sin ellos. Con los pesos (local o dentro de la imagen Docker)
comprueba que el servicio reproduce las huellas que dejaron PyTorch en
``modelo.json`` (RF-DETR) y timm en ``moderacion.json`` (moderación) al exportar:
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
from app.infrastructure.onnx_moderacion import OnnxModeracion
from app.main import crear_app
from scripts.sinteticas import TAMANOS_MODERACION, imagenes_de_color, imagenes_sinteticas
from tests.dobles import imagen_sintetica

DIRECTORIO = Path(os.environ.get("INFERENCIA_MODELO_DIR") or DIR_MODELO_POR_DEFECTO)


def _metadatos(nombre: str) -> dict:
    ruta = DIRECTORIO / nombre
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.is_file() else {}


METADATOS = _metadatos("modelo.json")
METADATOS_MODERACION = _metadatos("moderacion.json")
HAY_PESOS = bool(METADATOS) and (DIRECTORIO / METADATOS.get("archivo", "-")).is_file()
HAY_PESOS_MODERACION = bool(METADATOS_MODERACION) and (DIRECTORIO / METADATOS_MODERACION.get("archivo", "-")).is_file()

pytestmark = pytest.mark.modelo_real
requiere_deteccion = pytest.mark.skipif(
    not HAY_PESOS,
    reason=f"Sin pesos en {DIRECTORIO} (no se versionan): genera el .onnx con scripts/exportar_onnx.py",
)
requiere_moderacion = pytest.mark.skipif(
    not HAY_PESOS_MODERACION,
    reason=f"Sin pesos de moderación en {DIRECTORIO} (no se versionan): genera el .onnx con scripts/exportar_moderacion.py",
)

CONFIANZA_MINIMA = 0.10
TOLERANCIA_PUNTAJE = 1e-3  # la de la paridad registrada en moderacion.json (aceptación de NC-10a)


@pytest.fixture(scope="module")
def modelo() -> OnnxModelo:
    return OnnxModelo.cargar(DIRECTORIO, hilos=2, confianza_minima=CONFIANZA_MINIMA, max_detecciones=100)


@pytest.fixture(scope="module")
def moderacion() -> OnnxModeracion:
    return OnnxModeracion.cargar(DIRECTORIO, hilos=1)


def _a_imagen_rgb(nombre_imagen) -> tuple[str, ImagenRGB]:
    nombre, imagen = nombre_imagen
    return nombre, ImagenRGB(imagen.width, imagen.height, imagen.tobytes())


@pytest.fixture(scope="module")
def sinteticas() -> list[tuple[str, ImagenRGB]]:
    return [_a_imagen_rgb(i) for i in imagenes_sinteticas()]


@pytest.fixture(scope="module")
def sinteticas_moderacion() -> list[tuple[str, ImagenRGB]]:
    return [_a_imagen_rgb(i) for i in (*imagenes_sinteticas(TAMANOS_MODERACION), *imagenes_de_color())]


# --------------------------------------------------------------------------- detección (RF-DETR)


@requiere_deteccion
def test_la_version_es_la_registrada_al_exportar(modelo):
    assert str(modelo.version) == METADATOS["version"]
    assert str(modelo.version).startswith("rdd2022-rfdetr-nano-66429f3-")


@requiere_deteccion
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


@requiere_deteccion
def test_las_detecciones_cumplen_el_contrato(modelo, sinteticas):
    for nombre, imagen in sinteticas:
        for d in modelo.detectar(imagen):
            assert d.clase in (ClaseDano.BACHE, ClaseDano.GRIETA)
            assert CONFIANZA_MINIMA <= d.confianza <= 1.0
            assert d.caja.x2 <= imagen.ancho and d.caja.y2 <= imagen.alto, nombre


@requiere_deteccion
def test_es_determinista(modelo, sinteticas):
    _, imagen = sinteticas[3]  # 2048 x 1536, como las fotos saneadas por el backend
    inicio = time.perf_counter()
    primera = modelo.detectar(imagen)
    milisegundos = (time.perf_counter() - inicio) * 1000
    assert primera == modelo.detectar(imagen)
    print(f"\n2048x1536 con 2 hilos: {milisegundos:.0f} ms, {len(primera)} detecciones")


# --------------------------------------------------------------------------- moderación (Marqo, NC-10a)


@requiere_moderacion
def test_la_version_de_moderacion_es_la_registrada_al_exportar(moderacion):
    assert str(moderacion.version) == METADATOS_MODERACION["version"]
    assert str(moderacion.version).startswith("nsfw-vit-tiny-384-0c26ec2-")
    assert len(str(moderacion.version)) <= 40
    assert METADATOS_MODERACION["fuente"]["revision"] == "0c26ec22111b83f106d72a55f611ec35962bcb65"
    assert METADATOS_MODERACION["fuente"]["licencia_pesos"] == "Apache-2.0"


@requiere_moderacion
def test_la_paridad_registrada_cumple_la_tolerancia():
    paridad = METADATOS_MODERACION["paridad"]
    assert paridad["max_dif_puntajes"] <= TOLERANCIA_PUNTAJE
    assert paridad["max_dif_logits"] <= TOLERANCIA_PUNTAJE


@requiere_moderacion
def test_reproduce_la_huella_de_timm(moderacion, sinteticas_moderacion):
    huella = METADATOS_MODERACION["huella_timm"]["imagenes"]
    assert set(huella) == {nombre for nombre, _ in sinteticas_moderacion}
    for nombre, imagen in sinteticas_moderacion:
        por_recorte = moderacion.puntajes_por_recorte(imagen)
        assert por_recorte == pytest.approx(huella[nombre]["recortes"], abs=TOLERANCIA_PUNTAJE), nombre
        assert moderacion.moderar(imagen) == pytest.approx(huella[nombre]["puntaje"], abs=TOLERANCIA_PUNTAJE), nombre


@requiere_moderacion
def test_la_moderacion_es_determinista(moderacion, sinteticas_moderacion):
    _, imagen = sinteticas_moderacion[3]  # 2048 x 1536
    inicio = time.perf_counter()
    primero = moderacion.moderar(imagen)
    milisegundos = (time.perf_counter() - inicio) * 1000
    assert {moderacion.moderar(imagen) for _ in range(3)} == {primero}
    assert 0.0 <= primero <= 1.0
    print(f"\nModeración 2048x1536 con 1 hilo: {milisegundos:.0f} ms, puntaje {primero:.4f}")


# --------------------------------------------------------------------------- servicio completo


@requiere_deteccion
@requiere_moderacion
def test_el_servicio_completo_responde_con_los_modelos_reales():
    cliente = TestClient(crear_app(Configuracion.desde_entorno({"INFERENCIA_MODELO_DIR": str(DIRECTORIO)})))
    foto = imagen_sintetica(640, 480)

    detecciones = cliente.post("/v1/detecciones", files={"imagen": ("a.jpg", foto, "image/jpeg")})
    moderaciones = [cliente.post("/v1/moderacion", files={"imagen": ("a.jpg", foto, "image/jpeg")}) for _ in range(2)]

    assert detecciones.status_code == 200
    assert detecciones.json()["version_modelo"] == METADATOS["version"]
    assert [m.status_code for m in moderaciones] == [200, 200]
    assert moderaciones[0].json() == moderaciones[1].json()  # la misma foto da el mismo puntaje
    assert moderaciones[0].json()["version_modelo"] == METADATOS_MODERACION["version"]
    assert cliente.get("/salud").json() == {
        "estado": "ok",
        "version_modelo": METADATOS["version"],
        "version_moderacion": METADATOS_MODERACION["version"],
    }
