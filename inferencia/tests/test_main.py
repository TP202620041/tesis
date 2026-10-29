"""Raíz de composición: con los dos modelos válidos arma el servicio; si falta cualquiera, no arranca."""

from __future__ import annotations

import io
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.infrastructure.configuracion import Configuracion
from app.infrastructure.onnx_modelo import ErrorDeCargaDelModelo
from app.main import crear_app
from tests.dobles import imagen_sintetica
from tests.onnx_moderacion_sintetico import escribir_modelo_moderacion, puntaje_esperado
from tests.onnx_sintetico import escribir_modelo


def configuracion(directorio) -> Configuracion:
    return replace(Configuracion.desde_entorno({}), dir_modelo=directorio, hilos=1)


def escribir_modelos(directorio) -> None:
    escribir_modelo(directorio)
    escribir_modelo_moderacion(directorio)


def test_sin_modelo_el_servicio_no_arranca(tmp_path):
    with pytest.raises(ErrorDeCargaDelModelo):
        crear_app(configuracion(tmp_path))


def test_sin_el_modelo_de_moderacion_el_servicio_no_arranca(tmp_path):
    escribir_modelo(tmp_path)
    with pytest.raises(ErrorDeCargaDelModelo, match="moderacion.json"):
        crear_app(configuracion(tmp_path))


def test_sin_el_modelo_de_deteccion_el_servicio_no_arranca(tmp_path):
    escribir_modelo_moderacion(tmp_path)
    with pytest.raises(ErrorDeCargaDelModelo, match="modelo.json"):
        crear_app(configuracion(tmp_path))


def test_si_el_hash_de_la_moderacion_no_coincide_no_arranca(tmp_path):
    escribir_modelo(tmp_path)
    escribir_modelo_moderacion(tmp_path, sha256="f" * 64)
    with pytest.raises(ErrorDeCargaDelModelo, match="no coincide"):
        crear_app(configuracion(tmp_path))


def test_arma_el_servicio_completo_con_los_adaptadores_reales(tmp_path):
    escribir_modelos(tmp_path)
    cliente = TestClient(crear_app(configuracion(tmp_path)))

    salud = cliente.get("/salud").json()
    respuesta = cliente.post("/v1/detecciones", files={"imagen": ("a.jpg", imagen_sintetica(200, 100), "image/jpeg")})

    assert salud["version_modelo"].startswith("sintetico-")
    assert salud["version_moderacion"].startswith("moderacion-sintetica-")
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["version_modelo"] == salud["version_modelo"]
    assert [(d["clase"], round(d["confianza"], 2)) for d in cuerpo["detecciones"]] == [
        ("bache", 0.9),
        ("grieta", 0.7),
        ("grieta", 0.3),
    ]
    assert cuerpo["detecciones"][0]["caja"] == pytest.approx([80.0, 30.0, 120.0, 70.0])


def test_modera_de_punta_a_punta_con_los_adaptadores_reales(tmp_path):
    escribir_modelos(tmp_path)
    cliente = TestClient(crear_app(configuracion(tmp_path)))
    # Apaisada de 64x32 a 32 px: la mitad izquierda blanca es el primer recorte; la derecha, el segundo.
    imagen = Image.new("RGB", (64, 32), (0, 0, 0))
    imagen.paste((255, 255, 255), (0, 0, 32, 32))
    salida = io.BytesIO()
    imagen.save(salida, format="PNG")

    respuesta = cliente.post("/v1/moderacion", files={"imagen": ("a.png", salida.getvalue(), "image/png")})

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert set(cuerpo) == {"version_modelo", "puntaje"}
    assert cuerpo["version_modelo"] == cliente.get("/salud").json()["version_moderacion"]
    assert cuerpo["puntaje"] == pytest.approx(puntaje_esperado(1.0), abs=1e-6)


def test_la_fabrica_lee_la_configuracion_del_entorno(tmp_path, monkeypatch):
    escribir_modelos(tmp_path)
    monkeypatch.setenv("INFERENCIA_MODELO_DIR", str(tmp_path))
    monkeypatch.setenv("INFERENCIA_HILOS", "1")
    monkeypatch.setenv("INFERENCIA_MODERACION_HILOS", "1")
    monkeypatch.setenv("INFERENCIA_CONFIANZA_MINIMA", "0.5")
    cliente = TestClient(crear_app())

    respuesta = cliente.post("/v1/detecciones", files={"imagen": ("a.png", imagen_sintetica(formato="PNG"), "image/png")})

    assert [d["confianza"] for d in respuesta.json()["detecciones"]] == pytest.approx([0.9, 0.7])
