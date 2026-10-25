"""Caso de uso ``DetectarDanos`` con dobles de los puertos (sin pesos)."""

from __future__ import annotations

import pytest

from app.application.detectar import DetectarDanos
from app.domain.deteccion import ClaseDano
from app.domain.errores import ErrorDeInferencia, ImagenDemasiadoGrande, ImagenInvalida
from app.domain.imagen import CabeceraDeImagen, LimitesDeImagen
from tests.dobles import VERSION_FALSA, DecodificadorFalso, ModeloFalso, deteccion

LIMITES = LimitesDeImagen(max_bytes=100, max_pixeles=1_000)


def caso(decodificador=None, modelo=None, limites=LIMITES):
    decodificador = decodificador or DecodificadorFalso()
    modelo = modelo or ModeloFalso()
    return DetectarDanos(decodificador, modelo, limites), decodificador, modelo


def test_devuelve_las_detecciones_del_modelo_ordenadas_y_con_su_version():
    modelo = ModeloFalso(respuesta=[deteccion(confianza=0.3), deteccion(ClaseDano.GRIETA, 0.8)])
    detectar, _, _ = caso(modelo=modelo)

    resultado = detectar(b"x" * 10)

    assert resultado.version_modelo == VERSION_FALSA
    assert [(d.clase, d.confianza) for d in resultado.detecciones] == [(ClaseDano.GRIETA, 0.8), (ClaseDano.BACHE, 0.3)]


def test_pasa_al_modelo_la_imagen_decodificada():
    decodificador = DecodificadorFalso(CabeceraDeImagen("PNG", 5, 2))
    detectar, _, modelo = caso(decodificador=decodificador)

    detectar(b"x")

    assert [(i.ancho, i.alto) for i in modelo.recibidas] == [(5, 2)]


def test_sin_detecciones_devuelve_una_lista_vacia():
    detectar, _, _ = caso()
    assert detectar(b"x").detecciones == ()


def test_rechaza_un_archivo_vacio_sin_decodificar():
    detectar, decodificador, modelo = caso()
    with pytest.raises(ImagenInvalida, match="vacía"):
        detectar(b"")
    assert decodificador.decodificadas == 0 and modelo.recibidas == []


def test_rechaza_por_bytes_antes_de_leer_la_cabecera():
    class SinCabecera(DecodificadorFalso):
        def leer_cabecera(self, datos):
            raise AssertionError("no debía leer la cabecera")

    detectar, _, modelo = caso(decodificador=SinCabecera())
    with pytest.raises(ImagenDemasiadoGrande, match="101 bytes"):
        detectar(b"x" * 101)
    assert modelo.recibidas == []


def test_acepta_justo_el_maximo_de_bytes():
    detectar, decodificador, _ = caso()
    detectar(b"x" * 100)
    assert decodificador.decodificadas == 1


@pytest.mark.parametrize("formato", ["GIF", "BMP", "TIFF", ""])
def test_rechaza_formatos_no_permitidos_sin_decodificar(formato):
    detectar, decodificador, modelo = caso(decodificador=DecodificadorFalso(CabeceraDeImagen(formato, 2, 2)))
    with pytest.raises(ImagenInvalida, match="Formato de imagen no permitido"):
        detectar(b"x")
    assert decodificador.decodificadas == 0 and modelo.recibidas == []


@pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
def test_acepta_los_formatos_del_backend(formato):
    detectar, decodificador, _ = caso(decodificador=DecodificadorFalso(CabeceraDeImagen(formato, 2, 2)))
    detectar(b"x")
    assert decodificador.decodificadas == 1


def test_rechaza_por_pixeles_sin_decodificar():
    # 40 x 26 = 1040 > 1000: una «bomba de descompresión» no llega a ocupar memoria.
    detectar, decodificador, modelo = caso(decodificador=DecodificadorFalso(CabeceraDeImagen("JPEG", 40, 26)))
    with pytest.raises(ImagenDemasiadoGrande, match="40x26"):
        detectar(b"x")
    assert decodificador.decodificadas == 0 and modelo.recibidas == []


def test_acepta_justo_el_maximo_de_pixeles():
    detectar, decodificador, _ = caso(decodificador=DecodificadorFalso(CabeceraDeImagen("JPEG", 40, 25)))
    detectar(b"x")
    assert decodificador.decodificadas == 1


def test_propaga_el_fallo_del_modelo():
    detectar, _, _ = caso(modelo=ModeloFalso(falla=True))
    with pytest.raises(ErrorDeInferencia):
        detectar(b"x")


def test_expone_limites_y_version_para_la_presentacion():
    detectar, _, _ = caso()
    assert detectar.limites is LIMITES
    assert detectar.version_modelo == "modelo-falso-1"
