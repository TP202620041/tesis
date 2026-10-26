"""Raíz de composición: con un modelo válido arma el servicio; sin modelo, no arranca."""

from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.infrastructure.configuracion import Configuracion
from app.infrastructure.onnx_modelo import ErrorDeCargaDelModelo
from app.main import crear_app
from tests.dobles import imagen_sintetica
from tests.onnx_sintetico import escribir_modelo


def configuracion(directorio) -> Configuracion:
    return replace(Configuracion.desde_entorno({}), dir_modelo=directorio, hilos=1)


def test_sin_modelo_el_servicio_no_arranca(tmp_path):
    with pytest.raises(ErrorDeCargaDelModelo):
        crear_app(configuracion(tmp_path))


def test_arma_el_servicio_completo_con_los_adaptadores_reales(tmp_path):
    escribir_modelo(tmp_path)
    cliente = TestClient(crear_app(configuracion(tmp_path)))

    salud = cliente.get("/salud").json()
    respuesta = cliente.post("/v1/detecciones", files={"imagen": ("a.jpg", imagen_sintetica(200, 100), "image/jpeg")})

    assert salud["version_modelo"].startswith("sintetico-")
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["version_modelo"] == salud["version_modelo"]
    assert [(d["clase"], round(d["confianza"], 2)) for d in cuerpo["detecciones"]] == [
        ("bache", 0.9),
        ("grieta", 0.7),
        ("grieta", 0.3),
    ]
    assert cuerpo["detecciones"][0]["caja"] == pytest.approx([80.0, 30.0, 120.0, 70.0])


def test_la_fabrica_lee_la_configuracion_del_entorno(tmp_path, monkeypatch):
    escribir_modelo(tmp_path)
    monkeypatch.setenv("INFERENCIA_MODELO_DIR", str(tmp_path))
    monkeypatch.setenv("INFERENCIA_HILOS", "1")
    monkeypatch.setenv("INFERENCIA_CONFIANZA_MINIMA", "0.5")
    cliente = TestClient(crear_app())

    respuesta = cliente.post("/v1/detecciones", files={"imagen": ("a.png", imagen_sintetica(formato="PNG"), "image/png")})

    assert [d["confianza"] for d in respuesta.json()["detecciones"]] == pytest.approx([0.9, 0.7])
