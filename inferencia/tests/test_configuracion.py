"""Configuración desde variables de entorno."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.infrastructure.configuracion import DIR_MODELO_POR_DEFECTO, Configuracion


def test_valores_por_defecto():
    c = Configuracion.desde_entorno({})
    assert c.hilos == 2
    assert c.hilos_moderacion == 1  # INFERENCIA_MODERACION_HILOS: fijo, deja la otra vCPU a RF-DETR
    assert c.limites.max_bytes == 10 * 1024 * 1024  # el mismo máximo que el backend (10 MB)
    assert c.limites.max_pixeles == 8_000_000  # peor caso de RAM ~505 MiB con los dos modelos (NC-10a)
    assert 2048 * 2048 <= c.limites.max_pixeles  # la foto saneada del backend (≤ 2048 px) nunca es 413
    assert c.confianza_minima == pytest.approx(0.10)
    assert c.max_detecciones == 100
    assert c.dir_modelo == DIR_MODELO_POR_DEFECTO
    assert DIR_MODELO_POR_DEFECTO.name == "modelos" and DIR_MODELO_POR_DEFECTO.parent.name == "inferencia"


def test_lee_cada_variable():
    c = Configuracion.desde_entorno(
        {
            "INFERENCIA_HILOS": "4",
            "INFERENCIA_MODERACION_HILOS": "3",
            "INFERENCIA_MAX_BYTES": "1000",
            "INFERENCIA_MAX_MEGAPIXELES": "2.5",
            "INFERENCIA_CONFIANZA_MINIMA": "0.05",
            "INFERENCIA_MAX_DETECCIONES": "7",
            "INFERENCIA_MODELO_DIR": "/opt/modelos",
        }
    )
    assert (c.hilos, c.limites.max_bytes, c.limites.max_pixeles) == (4, 1000, 2_500_000)
    assert c.hilos_moderacion == 3
    assert (c.confianza_minima, c.max_detecciones, c.dir_modelo) == (0.05, 7, Path("/opt/modelos"))


def test_una_variable_vacia_usa_el_valor_por_defecto():
    assert Configuracion.desde_entorno({"INFERENCIA_HILOS": " "}).hilos == 2


@pytest.mark.parametrize(
    "nombre, valor",
    [
        ("INFERENCIA_HILOS", "0"),
        ("INFERENCIA_HILOS", "dos"),
        ("INFERENCIA_MODERACION_HILOS", "0"),
        ("INFERENCIA_MODERACION_HILOS", "uno"),
        ("INFERENCIA_MAX_BYTES", "-1"),
        ("INFERENCIA_CONFIANZA_MINIMA", "1.5"),
        ("INFERENCIA_CONFIANZA_MINIMA", "alta"),
        ("INFERENCIA_MAX_MEGAPIXELES", "0"),
        ("INFERENCIA_MAX_DETECCIONES", "0"),
    ],
)
def test_un_valor_invalido_impide_arrancar_con_un_mensaje_claro(nombre, valor):
    with pytest.raises(ValueError, match=nombre):
        Configuracion.desde_entorno({nombre: valor})
