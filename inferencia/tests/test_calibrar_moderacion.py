"""Regla del umbral sugerido de ``scripts/calibrar_moderacion.py`` (decidida el 28/10, NC-10a), sin servicio ni fotos."""

from __future__ import annotations

import pytest

from scripts.calibrar_moderacion import REPOSITORIO, dentro_del_repositorio, faltantes, histograma, umbral_sugerido


@pytest.mark.parametrize(
    "puntajes, umbral",
    [
        ([0.05, 0.105], 0.5),  # 0,255 queda por debajo del piso de 0,5
        ([0.04, 0.42], 0.57),  # 0,42 + 0,15
        ([0.3, 0.551], 0.71),  # 0,701 se redondea hacia arriba
        ([0.1, 0.8], 0.9),  # 0,95 queda por encima del techo de 0,9
        ([0.35], 0.5),  # 0,50 exacto
    ],
)
def test_umbral_es_el_maximo_negativo_mas_015_entre_05_y_09(puntajes, umbral):
    assert umbral_sugerido(puntajes) == pytest.approx(umbral)


def test_con_el_umbral_sugerido_ninguna_foto_negativa_se_rechaza_si_no_toca_el_techo():
    puntajes = [0.01, 0.2, 0.33, 0.61]
    umbral = umbral_sugerido(puntajes)
    assert all(p < umbral for p in puntajes)


def test_sin_puntajes_no_hay_umbral():
    with pytest.raises(ValueError):
        umbral_sugerido([])


def test_avisa_de_cada_parte_del_conjunto_que_falta():
    # Lo que había el 28/10: solo pistas de RDD2022.
    avisos = faltantes({"pistas": 350})
    assert len(avisos) == 2
    assert any("--gente" in a and "50" in a for a in avisos)
    assert any("--lima" in a and "200" in a for a in avisos)


def test_avisa_de_una_parte_por_debajo_de_su_minimo():
    assert faltantes({"pistas": 120, "gente": 60, "lima": 200}) == ["«pistas y veredas de RDD2022» tiene 120 fotos y el mínimo es 300"]


def test_con_el_conjunto_completo_no_hay_avisos():
    assert faltantes({"pistas": 300, "gente": 50, "lima": 200}) == []


def test_se_niega_a_leer_fotos_dentro_del_repositorio(tmp_path):
    assert dentro_del_repositorio(REPOSITORIO / "inferencia" / "modelos")
    assert dentro_del_repositorio(REPOSITORIO)
    assert not dentro_del_repositorio(tmp_path)  # el temporal de pytest está fuera del repositorio


def test_histograma_por_tramos_de_01():
    tramos = dict(histograma([0.0, 0.05, 0.1, 0.95, 1.0]))
    assert tramos["[0.0, 0.1)"] == 2
    assert tramos["[0.1, 0.2)"] == 1
    assert tramos["[0.9, 1.0)"] == 2  # el 1,0 cae en el último tramo
    assert sum(tramos.values()) == 5
