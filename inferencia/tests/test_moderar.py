"""Caso de uso ``ModerarImagen`` con dobles de los puertos (sin pesos)."""

from __future__ import annotations

import math

import pytest

from app.application.detectar import DetectarDanos
from app.application.moderar import ModerarImagen
from app.domain.errores import ErrorDeInferencia, ImagenDemasiadoGrande, ImagenInvalida
from app.domain.imagen import CabeceraDeImagen, LimitesDeImagen
from app.domain.moderacion import PuntajeModeracion
from tests.dobles import VERSION_MODERACION_FALSA, DecodificadorFalso, ModeloFalso, ModeradorFalso

LIMITES = LimitesDeImagen(max_bytes=100, max_pixeles=1_000)


def caso(decodificador=None, moderador=None, limites=LIMITES):
    decodificador = decodificador or DecodificadorFalso()
    moderador = moderador or ModeradorFalso()
    return ModerarImagen(decodificador, moderador, limites), decodificador, moderador


def test_devuelve_el_puntaje_del_modelo_con_su_version():
    moderar, _, _ = caso(moderador=ModeradorFalso(puntaje=0.83))

    resultado = moderar(b"x" * 10)

    assert resultado == PuntajeModeracion(VERSION_MODERACION_FALSA, 0.83)


@pytest.mark.parametrize("puntaje", [0.0, 1.0])
def test_los_bordes_del_rango_son_validos(puntaje):
    moderar, _, _ = caso(moderador=ModeradorFalso(puntaje=puntaje))
    assert moderar(b"x").puntaje == puntaje


def test_pasa_al_modelo_la_imagen_decodificada():
    moderar, _, moderador = caso(decodificador=DecodificadorFalso(CabeceraDeImagen("WEBP", 7, 3)))
    moderar(b"x")
    assert [(i.ancho, i.alto) for i in moderador.recibidas] == [(7, 3)]


def test_rechaza_un_archivo_vacio_sin_decodificar():
    moderar, decodificador, moderador = caso()
    with pytest.raises(ImagenInvalida, match="vacía"):
        moderar(b"")
    assert decodificador.decodificadas == 0 and moderador.recibidas == []


def test_rechaza_por_bytes_antes_de_leer_la_cabecera():
    class SinCabecera(DecodificadorFalso):
        def leer_cabecera(self, datos):
            raise AssertionError("no debía leer la cabecera")

    moderar, _, moderador = caso(decodificador=SinCabecera())
    with pytest.raises(ImagenDemasiadoGrande, match="101 bytes"):
        moderar(b"x" * 101)
    assert moderador.recibidas == []


def test_acepta_justo_el_maximo_de_bytes():
    moderar, decodificador, _ = caso()
    moderar(b"x" * 100)
    assert decodificador.decodificadas == 1


@pytest.mark.parametrize("formato", ["GIF", "BMP", "TIFF", ""])
def test_rechaza_formatos_no_permitidos_sin_decodificar(formato):
    moderar, decodificador, moderador = caso(decodificador=DecodificadorFalso(CabeceraDeImagen(formato, 2, 2)))
    with pytest.raises(ImagenInvalida, match="Formato de imagen no permitido"):
        moderar(b"x")
    assert decodificador.decodificadas == 0 and moderador.recibidas == []


def test_rechaza_por_pixeles_sin_decodificar():
    moderar, decodificador, moderador = caso(decodificador=DecodificadorFalso(CabeceraDeImagen("JPEG", 40, 26)))
    with pytest.raises(ImagenDemasiadoGrande, match="40x26"):
        moderar(b"x")
    assert decodificador.decodificadas == 0 and moderador.recibidas == []


def test_acepta_justo_el_maximo_de_pixeles():
    moderar, decodificador, _ = caso(decodificador=DecodificadorFalso(CabeceraDeImagen("JPEG", 40, 25)))
    moderar(b"x")
    assert decodificador.decodificadas == 1


@pytest.mark.parametrize(
    "datos, cabecera",
    [
        (b"", CabeceraDeImagen("JPEG", 2, 2)),
        (b"x" * 101, CabeceraDeImagen("JPEG", 2, 2)),
        (b"x", CabeceraDeImagen("GIF", 2, 2)),
        (b"x", CabeceraDeImagen("PNG", 50, 50)),
    ],
    ids=["vacia", "bytes", "formato", "pixeles"],
)
def test_la_validacion_es_la_misma_que_la_de_detectar(datos, cabecera):
    moderar = ModerarImagen(DecodificadorFalso(cabecera), ModeradorFalso(), LIMITES)
    detectar = DetectarDanos(DecodificadorFalso(cabecera), ModeloFalso(), LIMITES)

    with pytest.raises((ImagenInvalida, ImagenDemasiadoGrande)) as al_moderar:
        moderar(datos)
    with pytest.raises((ImagenInvalida, ImagenDemasiadoGrande)) as al_detectar:
        detectar(datos)

    assert type(al_moderar.value) is type(al_detectar.value)
    assert str(al_moderar.value) == str(al_detectar.value)


def test_propaga_el_fallo_del_modelo():
    moderar, _, _ = caso(moderador=ModeradorFalso(falla=True))
    with pytest.raises(ErrorDeInferencia):
        moderar(b"x")


@pytest.mark.parametrize("puntaje", [1.5, -0.1, math.nan])
def test_un_puntaje_fuera_de_rango_del_adaptador_no_sale_del_caso_de_uso(puntaje):
    moderar, _, _ = caso(moderador=ModeradorFalso(puntaje=puntaje))
    with pytest.raises(ValueError, match="puntaje"):
        moderar(b"x")


def test_expone_limites_y_version_para_la_presentacion():
    moderar, _, _ = caso()
    assert moderar.limites is LIMITES
    assert moderar.version_modelo == "moderacion-falsa-1"
