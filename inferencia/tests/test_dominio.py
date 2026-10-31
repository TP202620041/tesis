"""Reglas puras del dominio."""

from __future__ import annotations

import math

import pytest

from app.domain.deteccion import Caja, ClaseDano, Deteccion, Detecciones, VersionModelo
from app.domain.imagen import FORMATOS_PERMITIDOS, CabeceraDeImagen, ImagenRGB, LimitesDeImagen
from app.domain.moderacion import PuntajeModeracion
from tests.dobles import VERSION_FALSA, VERSION_MODERACION_FALSA, deteccion


class TestClaseDano:
    def test_el_vocabulario_del_contrato_es_bache_y_grieta(self):
        # Decisión del 21/10 (opción A): coincide con categoria_dano.clase_modelo del backend.
        assert {c.value for c in ClaseDano} == {"bache", "grieta"}

    def test_se_serializa_como_texto(self):
        assert str(ClaseDano.BACHE) == "bache"


class TestCaja:
    def test_acepta_una_caja_degenerada_de_un_punto(self):
        assert Caja(5, 5, 5, 5).como_lista() == [5, 5, 5, 5]

    @pytest.mark.parametrize(
        "coordenadas",
        [(10, 0, 5, 5), (0, 10, 5, 5), (-1, 0, 5, 5), (0, 0, math.inf, 5), (0, 0, math.nan, 5)],
    )
    def test_rechaza_coordenadas_invalidas(self, coordenadas):
        with pytest.raises(ValueError):
            Caja(*coordenadas)


class TestDeteccion:
    @pytest.mark.parametrize("confianza", [0.0, 0.5, 1.0])
    def test_acepta_confianzas_en_el_rango(self, confianza):
        assert deteccion(confianza=confianza).confianza == confianza

    @pytest.mark.parametrize("confianza", [-0.01, 1.01, math.nan])
    def test_rechaza_confianzas_fuera_de_rango(self, confianza):
        with pytest.raises(ValueError):
            deteccion(confianza=confianza)

    def test_rechaza_una_clase_que_no_es_del_vocabulario(self):
        with pytest.raises(ValueError):
            Deteccion(clase="pothole", confianza=0.5, caja=Caja(0, 0, 1, 1))  # type: ignore[arg-type]


class TestVersionModelo:
    def test_acepta_hasta_40_caracteres(self):
        assert str(VersionModelo("a" * 40)) == "a" * 40

    @pytest.mark.parametrize("valor", ["", "a" * 41, "con espacio", "tilde-ñ", "barra/no"])
    def test_rechaza_valores_que_no_caben_o_no_son_un_identificador(self, valor):
        with pytest.raises(ValueError):
            VersionModelo(valor)


class TestDetecciones:
    def test_ordena_de_mayor_a_menor_confianza(self):
        resultado = Detecciones.de(
            VERSION_FALSA,
            [deteccion(confianza=0.2), deteccion(ClaseDano.GRIETA, 0.9), deteccion(confianza=0.5)],
        )
        assert [d.confianza for d in resultado.detecciones] == [0.9, 0.5, 0.2]

    def test_el_desempate_es_estable_por_clase_y_caja(self):
        a = deteccion(ClaseDano.GRIETA, 0.5, (0, 0, 1, 1))
        b = deteccion(ClaseDano.BACHE, 0.5, (9, 9, 10, 10))
        c = deteccion(ClaseDano.BACHE, 0.5, (1, 1, 2, 2))
        assert Detecciones.de(VERSION_FALSA, [a, b, c]).detecciones == (c, b, a)
        assert Detecciones.de(VERSION_FALSA, [c, a, b]).detecciones == (c, b, a)

    def test_admite_cero_detecciones(self):
        assert Detecciones.de(VERSION_FALSA, []).detecciones == ()


class TestPuntajeModeracion:
    @pytest.mark.parametrize("puntaje", [0.0, 0.053, 0.7, 1.0])
    def test_acepta_puntajes_en_el_rango(self, puntaje):
        assert PuntajeModeracion(VERSION_MODERACION_FALSA, puntaje).puntaje == puntaje

    @pytest.mark.parametrize("puntaje", [-0.001, 1.001, math.nan, math.inf])
    def test_rechaza_puntajes_fuera_de_rango_o_no_finitos(self, puntaje):
        with pytest.raises(ValueError, match="puntaje"):
            PuntajeModeracion(VERSION_MODERACION_FALSA, puntaje)

    def test_exige_una_version_del_modelo(self):
        with pytest.raises(ValueError, match="versión"):
            PuntajeModeracion("moderacion-1", 0.5)

    def test_es_inmutable(self):
        puntaje = PuntajeModeracion(VERSION_MODERACION_FALSA, 0.5)
        with pytest.raises(AttributeError):
            puntaje.puntaje = 0.9


class TestImagen:
    def test_imagen_rgb_exige_tres_bytes_por_pixel(self):
        ImagenRGB(2, 2, bytes(12))
        with pytest.raises(ValueError):
            ImagenRGB(2, 2, bytes(11))

    @pytest.mark.parametrize("ancho, alto", [(0, 2), (2, 0), (-1, 2)])
    def test_imagen_rgb_rechaza_dimensiones_no_positivas(self, ancho, alto):
        with pytest.raises(ValueError):
            ImagenRGB(ancho, alto, b"")

    def test_cabecera_calcula_los_pixeles(self):
        assert CabeceraDeImagen("JPEG", 4000, 3000).pixeles == 12_000_000

    def test_limites_por_defecto_aceptan_los_formatos_del_backend(self):
        assert LimitesDeImagen(1, 1).formatos == FORMATOS_PERMITIDOS == {"JPEG", "PNG", "WEBP"}

    @pytest.mark.parametrize("max_bytes, max_pixeles", [(0, 1), (1, 0)])
    def test_limites_deben_ser_positivos(self, max_bytes, max_pixeles):
        with pytest.raises(ValueError):
            LimitesDeImagen(max_bytes, max_pixeles)
