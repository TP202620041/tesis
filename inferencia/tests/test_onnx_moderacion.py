"""Adaptador de moderación: recortes, preprocesado, softmax y carga, con un ``.onnx`` sintético (sin pesos)."""

from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from app.domain.errores import ErrorDeInferencia
from app.domain.imagen import ImagenRGB
from app.infrastructure.onnx_modelo import ErrorDeCargaDelModelo
from app.infrastructure.onnx_moderacion import (
    MetadatosModeracion,
    OnnxModeracion,
    geometria_de_recortes,
    normalizar,
    probabilidad,
    recortes,
    redimensionar,
)
from tests.onnx_moderacion_sintetico import RESOLUCION, escribir_modelo_moderacion, puntaje_esperado


def imagen_de(arreglo: np.ndarray) -> ImagenRGB:
    alto, ancho = arreglo.shape[:2]
    return ImagenRGB(ancho, alto, np.ascontiguousarray(arreglo, dtype=np.uint8).tobytes())


def mitades(ancho: int, alto: int, *, primera: int, segunda: int) -> ImagenRGB:
    """Mitad izquierda (o superior, si es vertical) de un gris y la otra de otro."""
    arreglo = np.empty((alto, ancho, 3), dtype=np.uint8)
    if ancho >= alto:
        arreglo[:, : ancho // 2], arreglo[:, ancho // 2 :] = primera, segunda
    else:
        arreglo[: alto // 2], arreglo[alto // 2 :] = primera, segunda
    return imagen_de(arreglo)


class TestGeometria:
    def test_apaisada_4_3_dos_recortes_al_principio_y_al_final(self):
        g = geometria_de_recortes(640, 480, 384)
        assert (g.ancho, g.alto) == (512, 384)
        assert g.origenes == ((0, 0), (128, 0))

    def test_vertical_dos_recortes_arriba_y_abajo(self):
        g = geometria_de_recortes(480, 640, 384)
        assert (g.ancho, g.alto) == (384, 512)
        assert g.origenes == ((0, 0), (0, 128))

    def test_16_9_como_las_fotos_del_celular(self):
        g = geometria_de_recortes(1920, 1080, 384)
        assert (g.ancho, g.alto) == (682, 384)  # int(384 * 1920 / 1080) = 682
        assert g.origenes == ((0, 0), (298, 0))

    def test_el_lado_mayor_se_trunca_como_torchvision(self):
        # 384 * 517 / 293 = 677,57…: transforms.Resize(384) de torchvision (timm) da 677.
        assert geometria_de_recortes(517, 293, 384).ancho == 677

    def test_cuadrada_un_solo_recorte(self):
        g = geometria_de_recortes(1000, 1000, 384)
        assert (g.ancho, g.alto) == (384, 384)
        assert g.origenes == ((0, 0),)

    def test_exactamente_2_1_los_recortes_se_tocan(self):
        g = geometria_de_recortes(800, 400, 384)
        assert (g.ancho, g.alto, g.origenes) == (768, 384, ((0, 0), (384, 0)))

    @pytest.mark.parametrize("ancho, alto", [(1600, 400), (400, 1600), (4000, 100)])
    def test_mas_alargada_que_2_1_se_comprime_para_que_dos_recortes_la_cubran(self, ancho, alto):
        g = geometria_de_recortes(ancho, alto, 384)
        assert max(g.ancho, g.alto) == 768 and min(g.ancho, g.alto) == 384
        assert len(g.origenes) == 2

    def test_una_foto_chica_se_agranda(self):
        assert geometria_de_recortes(10, 5, 384) == geometria_de_recortes(800, 400, 384)

    @pytest.mark.parametrize(
        "ancho, alto",
        [(384, 384), (640, 480), (480, 640), (1920, 1080), (1080, 1920), (2048, 1536), (517, 293), (799, 400), (3000, 400)],
    )
    def test_los_recortes_caben_y_cubren_todo_el_lado_mayor(self, ancho, alto):
        r = 384
        g = geometria_de_recortes(ancho, alto, r)
        assert 1 <= len(g.origenes) <= 2
        cubiertos = np.zeros((g.alto, g.ancho), dtype=bool)
        for x, y in g.origenes:
            assert 0 <= x <= g.ancho - r and 0 <= y <= g.alto - r
            cubiertos[y : y + r, x : x + r] = True
        assert cubiertos.all()

    @pytest.mark.parametrize("ancho, alto, resolucion", [(0, 10, 384), (10, -1, 384), (10, 10, 0)])
    def test_rechaza_dimensiones_invalidas(self, ancho, alto, resolucion):
        with pytest.raises(ValueError):
            geometria_de_recortes(ancho, alto, resolucion)


class TestPreprocesado:
    def test_normaliza_como_to_tensor_y_normalize_0_5(self):
        recorte = np.array([[[0, 128, 255]]], dtype=np.uint8)
        tensor = normalizar(recorte)
        assert tensor.shape == (1, 3, 1, 1) and tensor.dtype == np.float32
        assert tensor.flags["C_CONTIGUOUS"]
        np.testing.assert_allclose(tensor[0, :, 0, 0], [-1.0, (128 / 255 - 0.5) / 0.5, 1.0], atol=1e-7)

    def test_redimensiona_con_el_bicubico_de_pillow(self):
        rgb = np.random.default_rng(3).integers(0, 256, size=(48, 64, 3), dtype=np.uint8)
        imagen = imagen_de(rgb)
        g = geometria_de_recortes(64, 48, 24)
        esperado = np.asarray(Image.fromarray(rgb).resize((g.ancho, g.alto), Image.Resampling.BICUBIC))
        np.testing.assert_array_equal(redimensionar(imagen, g), esperado)

    def test_si_ya_tiene_el_tamano_no_la_toca(self):
        rgb = np.random.default_rng(4).integers(0, 256, size=(32, 64, 3), dtype=np.uint8)
        g = geometria_de_recortes(64, 32, 32)
        assert (g.ancho, g.alto) == (64, 32)
        np.testing.assert_array_equal(redimensionar(imagen_de(rgb), g), rgb)

    def test_los_recortes_de_una_apaisada_son_la_izquierda_y_la_derecha(self):
        tensores = recortes(mitades(64, 32, primera=255, segunda=0), RESOLUCION)
        assert [t.shape for t in tensores] == [(1, 3, RESOLUCION, RESOLUCION)] * 2
        assert tensores[0].min() == pytest.approx(1.0) and tensores[1].max() == pytest.approx(-1.0)

    def test_los_recortes_de_una_vertical_son_arriba_y_abajo(self):
        tensores = recortes(mitades(32, 64, primera=0, segunda=255), RESOLUCION)
        assert tensores[0].max() == pytest.approx(-1.0) and tensores[1].min() == pytest.approx(1.0)


class TestProbabilidad:
    def test_softmax_de_dos_logits(self):
        assert probabilidad(np.array([0.0, 0.0]), 0) == pytest.approx(0.5)
        assert probabilidad(np.array([np.log(3.0), 0.0]), 0) == pytest.approx(0.75)
        assert probabilidad(np.array([np.log(3.0), 0.0]), 1) == pytest.approx(0.25)

    def test_es_estable_con_logits_grandes(self):
        assert probabilidad(np.array([1000.0, -1000.0]), 0) == 1.0
        assert probabilidad(np.array([-1000.0, 1000.0]), 0) == 0.0

    @pytest.mark.parametrize("logits", [[np.nan, 0.0], [np.inf, 0.0]])
    def test_logits_no_finitos_son_un_error_de_inferencia(self, logits):
        with pytest.raises(ErrorDeInferencia):
            probabilidad(np.array(logits), 0)


class TestMetadatos:
    BASE = {
        "version": "moderacion-x-1",
        "archivo": "m.onnx",
        "sha256": "AB",
        "resolucion": 32,
        "entrada": {"nombre": "input"},
        "salida": {"nombre": "logits"},
        "etiquetas": ["NSFW", "SFW"],
    }

    def test_lee_el_indice_de_la_etiqueta_positiva(self):
        assert MetadatosModeracion.desde_dict(self.BASE).indice_positivo == 0
        assert MetadatosModeracion.desde_dict({**self.BASE, "etiquetas": ["SFW", "NSFW"]}).indice_positivo == 1
        assert MetadatosModeracion.desde_dict(self.BASE).sha256 == "ab"

    @pytest.mark.parametrize(
        "cambio",
        [
            {"etiquetas": ["SEGURA", "OTRA"]},
            {"etiquetas": ["NSFW", "NSFW"]},
            {"salida": {}},
            {"resolucion": "alta"},
            {"version": "con espacios"},
        ],
        ids=["sin-nsfw", "repetidas", "sin-salida", "resolucion", "version"],
    )
    def test_un_moderacion_json_invalido_impide_arrancar(self, cambio):
        with pytest.raises(ErrorDeCargaDelModelo):
            MetadatosModeracion.desde_dict({**self.BASE, **cambio})

    def test_falta_una_clave(self):
        datos = dict(self.BASE)
        del datos["etiquetas"]
        with pytest.raises(ErrorDeCargaDelModelo, match="incompleto"):
            MetadatosModeracion.desde_dict(datos)


class TestOnnxModeracion:
    def test_carga_y_expone_la_version(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        assert str(modelo.version).startswith("moderacion-sintetica-")
        assert modelo.metadatos.indice_positivo == 0

    def test_apaisada_el_puntaje_es_el_maximo_de_los_dos_recortes(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        imagen = mitades(64, 32, primera=255, segunda=0)  # izquierda blanca, derecha negra

        por_recorte = modelo.puntajes_por_recorte(imagen)

        assert por_recorte == pytest.approx([puntaje_esperado(1.0), puntaje_esperado(-1.0)], abs=1e-6)
        assert modelo.moderar(imagen) == pytest.approx(puntaje_esperado(1.0), abs=1e-6)

    def test_vertical_el_maximo_puede_venir_del_segundo_recorte(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        imagen = mitades(32, 64, primera=0, segunda=255)  # arriba negra, abajo blanca

        por_recorte = modelo.puntajes_por_recorte(imagen)

        assert por_recorte[0] < 0.1 < 0.9 < por_recorte[1]
        assert modelo.moderar(imagen) == max(por_recorte)

    def test_el_maximo_no_depende_del_lado_donde_esta_el_contenido(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        izquierda = modelo.moderar(mitades(96, 48, primera=255, segunda=0))
        derecha = modelo.moderar(mitades(96, 48, primera=0, segunda=255))
        assert izquierda == pytest.approx(derecha, abs=1e-6)

    def test_una_parte_que_un_recorte_central_dejaria_fuera_igual_cuenta(self, tmp_path):
        # 64x32 a 32 px: el recorte central de timm sería x ∈ [16, 48). La franja blanca está en [0, 12).
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        arreglo = np.zeros((32, 64, 3), dtype=np.uint8)
        arreglo[:, :12] = 255
        assert modelo.moderar(imagen_de(arreglo)) > puntaje_esperado(-1.0) + 0.1

    def test_lee_la_columna_de_la_etiqueta_positiva_y_no_la_primera(self, tmp_path):
        escribir_modelo_moderacion(tmp_path, etiquetas=["SFW", "NSFW"])
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        blanca = imagen_de(np.full((32, 32, 3), 255, dtype=np.uint8))
        assert modelo.moderar(blanca) == pytest.approx(1 - puntaje_esperado(1.0), abs=1e-6)

    def test_es_determinista(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)
        imagen = imagen_de(np.random.default_rng(5).integers(0, 256, size=(40, 70, 3), dtype=np.uint8))
        assert {modelo.moderar(imagen) for _ in range(5)} == {modelo.moderar(imagen)}

    def test_sin_moderacion_json_no_arranca(self, tmp_path):
        with pytest.raises(ErrorDeCargaDelModelo, match="moderacion.json"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_sin_el_onnx_no_arranca(self, tmp_path):
        escribir_modelo_moderacion(tmp_path).unlink()
        with pytest.raises(ErrorDeCargaDelModelo, match="no se versionan"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_un_moderacion_json_ilegible_no_arranca(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        (tmp_path / "moderacion.json").write_text("{no es json", encoding="utf-8")
        with pytest.raises(ErrorDeCargaDelModelo, match="No se pudo leer"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_si_el_hash_no_coincide_no_arranca(self, tmp_path):
        escribir_modelo_moderacion(tmp_path, sha256="0" * 64)
        with pytest.raises(ErrorDeCargaDelModelo, match="no coincide"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_si_la_resolucion_declarada_no_es_la_del_onnx_no_arranca(self, tmp_path):
        escribir_modelo_moderacion(tmp_path, resolucion_declarada=64)
        with pytest.raises(ErrorDeCargaDelModelo, match="entrada"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_si_las_etiquetas_no_son_las_columnas_de_la_salida_no_arranca(self, tmp_path):
        escribir_modelo_moderacion(tmp_path, etiquetas=["NSFW", "SFW", "DUDOSA"])
        with pytest.raises(ErrorDeCargaDelModelo, match=r"\[1, 3\]"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_si_la_salida_tiene_otro_nombre_no_arranca(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        ruta = tmp_path / "moderacion.json"
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        ruta.write_text(json.dumps({**datos, "salida": {"nombre": "probs"}}), encoding="utf-8")
        with pytest.raises(ErrorDeCargaDelModelo, match="probs"):
            OnnxModeracion.cargar(tmp_path, hilos=1)

    def test_un_fallo_del_motor_es_un_error_de_inferencia(self, tmp_path):
        escribir_modelo_moderacion(tmp_path)
        modelo = OnnxModeracion.cargar(tmp_path, hilos=1)

        class SesionRota:
            def run(self, *_):
                raise RuntimeError("motor caído")

        modelo._sesion = SesionRota()
        with pytest.raises(ErrorDeInferencia, match="motor caído"):
            modelo.moderar(imagen_de(np.zeros((32, 32, 3), dtype=np.uint8)))
