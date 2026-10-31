"""Adaptador onnxruntime: preprocesado, decodificación y carga, con un ``.onnx`` sintético (sin pesos)."""

from __future__ import annotations

import json

import numpy as np
import pytest

from app.domain.deteccion import ClaseDano
from app.domain.errores import ErrorDeInferencia
from app.domain.imagen import ImagenRGB
from app.infrastructure.onnx_modelo import (
    DESVIACION_IMAGENET,
    ETIQUETA_A_CLASE,
    MEDIA_IMAGENET,
    ErrorDeCargaDelModelo,
    OnnxModelo,
    decodificar,
    pares_crudos,
    preprocesar,
    redimensionar_bilineal,
    sha256_de,
)
from tests.onnx_sintetico import ETIQUETAS, RESOLUCION, escribir_modelo, salidas_conocidas


def bilineal_escalar(origen: np.ndarray, alto: int, ancho: int) -> np.ndarray:
    """Referencia independiente: la fórmula de ``F.interpolate(mode="bilinear", align_corners=False)``."""
    h, w = origen.shape[:2]
    salida = np.zeros((alto, ancho, origen.shape[2]))
    for i in range(alto):
        y = min(max((i + 0.5) * h / alto - 0.5, 0.0), h - 1)
        y0 = int(np.floor(y))
        y1, fy = min(y0 + 1, h - 1), y - y0
        for j in range(ancho):
            x = min(max((j + 0.5) * w / ancho - 0.5, 0.0), w - 1)
            x0 = int(np.floor(x))
            x1, fx = min(x0 + 1, w - 1), x - x0
            arriba = (1 - fx) * origen[y0, x0] + fx * origen[y0, x1]
            abajo = (1 - fx) * origen[y1, x0] + fx * origen[y1, x1]
            salida[i, j] = (1 - fy) * arriba + fy * abajo
    return salida / 255.0


class TestRedimensionar:
    def test_al_mismo_tamano_es_la_identidad(self):
        rgb = np.arange(4 * 3 * 3, dtype=np.uint8).reshape(4, 3, 3)
        np.testing.assert_allclose(redimensionar_bilineal(rgb, 4, 3), rgb / 255.0, atol=1e-7)

    def test_reducir_a_la_mitad_promedia_bloques_de_2x2_sin_antialias(self):
        rgb = np.array([[0, 100, 10, 30], [200, 100, 50, 70], [0, 0, 0, 0], [40, 40, 255, 255]], dtype=np.uint8)
        rgb = np.repeat(rgb[:, :, None], 3, axis=2)
        esperado = np.array([[100, 40], [20, 127.5]]) / 255.0
        np.testing.assert_allclose(redimensionar_bilineal(rgb, 2, 2)[:, :, 0], esperado, atol=1e-6)

    @pytest.mark.parametrize("origen, destino", [((7, 5), (3, 4)), ((3, 2), (5, 7)), ((10, 10), (4, 4))])
    def test_coincide_con_la_formula_escalar(self, origen, destino):
        rgb = np.random.default_rng(1).integers(0, 256, size=(*origen, 3), dtype=np.uint8)
        np.testing.assert_allclose(redimensionar_bilineal(rgb, *destino), bilineal_escalar(rgb, *destino), atol=1e-6)


class TestPreprocesar:
    def test_forma_tipo_y_normalizacion_imagenet(self):
        imagen = ImagenRGB(5, 3, bytes([128, 64, 255]) * 15)
        tensor = preprocesar(imagen, 8)
        assert tensor.shape == (1, 3, 8, 8) and tensor.dtype == np.float32
        esperado = (np.array([128, 64, 255]) / 255.0 - MEDIA_IMAGENET) / DESVIACION_IMAGENET
        np.testing.assert_allclose(tensor[0, :, 4, 4], esperado, atol=1e-6)
        assert tensor.flags["C_CONTIGUOUS"]


class TestMapeo:
    def test_bache_viene_de_d40_y_grieta_de_d00_d10_d20(self):
        assert ETIQUETA_A_CLASE == {
            "pothole": ClaseDano.BACHE,
            "longitudinal_crack": ClaseDano.GRIETA,
            "transverse_crack": ClaseDano.GRIETA,
            "alligator_crack": ClaseDano.GRIETA,
        }


def decodificar_conocidas(etiquetas=ETIQUETAS, confianza_minima=0.1, max_detecciones=100, ancho=200, alto=100):
    cajas, logits = salidas_conocidas()
    return decodificar(
        cajas,
        logits,
        ancho,
        alto,
        etiquetas=etiquetas,
        indice_fondo=4,
        confianza_minima=confianza_minima,
        max_detecciones=max_detecciones,
    )


class TestDecodificar:
    def test_mapea_escala_recorta_y_descarta_el_fondo(self):
        detecciones = decodificar_conocidas()
        resumen = [(d.clase, round(d.confianza, 4), [round(v, 3) for v in d.caja.como_lista()]) for d in detecciones]
        assert resumen == [
            (ClaseDano.BACHE, 0.9, [80.0, 30.0, 120.0, 70.0]),
            (ClaseDano.GRIETA, 0.7, [40.0, 20.0, 60.0, 30.0]),  # la transversal (0,70) gana a la longitudinal (0,60)
            (ClaseDano.GRIETA, 0.3, [140.0, 70.0, 200.0, 100.0]),  # recortada al borde de la imagen
        ]

    def test_una_consulta_con_dos_grietas_da_una_sola_deteccion(self):
        grietas_de_la_consulta_1 = [d for d in decodificar_conocidas() if d.caja.x1 == pytest.approx(40.0)]
        assert len(grietas_de_la_consulta_1) == 1

    def test_el_piso_de_confianza_deja_fuera_lo_que_esta_por_debajo(self):
        assert [round(d.confianza, 2) for d in decodificar_conocidas(confianza_minima=0.5)] == [0.9, 0.7]

    def test_si_nada_supera_el_piso_no_hay_detecciones(self):
        assert decodificar_conocidas(confianza_minima=0.95) == []

    def test_respeta_el_maximo_de_detecciones(self):
        assert [d.clase for d in decodificar_conocidas(max_detecciones=1)] == [ClaseDano.BACHE]

    def test_las_etiquetas_sin_clase_de_la_app_se_descartan(self):
        detecciones = decodificar_conocidas(etiquetas=["D43", "D44", "D50", "pothole"])
        assert [d.clase for d in detecciones] == [ClaseDano.BACHE]

    def test_pares_crudos_ordena_por_confianza_y_desempata_por_indice(self):
        cajas = np.full((3, 4), 0.5, dtype=np.float32)
        logits = np.zeros((3, 2), dtype=np.float32)  # todo 0,5: empate total
        pares = pares_crudos(cajas, logits, 10, 10, indice_fondo=None, confianza_minima=0.0)
        assert [(p.consulta, p.columna) for p in pares] == [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0), (2, 1)]

    def test_pares_crudos_toma_como_maximo_300_pares_como_rf_detr(self):
        cajas = np.full((200, 4), 0.5, dtype=np.float32)
        logits = np.full((200, 3), 5.0, dtype=np.float32)
        assert len(pares_crudos(cajas, logits, 10, 10, indice_fondo=2, confianza_minima=0.0)) == 300


class TestOnnxModelo:
    def cargar(self, directorio, **kw):
        return OnnxModelo.cargar(directorio, hilos=1, confianza_minima=kw.get("minima", 0.1), max_detecciones=100)

    def test_detecta_de_punta_a_punta_con_un_onnx_sintetico(self, tmp_path):
        ruta = escribir_modelo(tmp_path)
        modelo = self.cargar(tmp_path)

        detecciones = modelo.detectar(ImagenRGB(200, 100, bytes(200 * 100 * 3)))

        assert str(modelo.version) == f"sintetico-{sha256_de(ruta)[:8]}"
        assert [(d.clase, round(d.confianza, 4)) for d in detecciones] == [
            (ClaseDano.BACHE, 0.9),
            (ClaseDano.GRIETA, 0.7),
            (ClaseDano.GRIETA, 0.3),
        ]
        assert detecciones[0].caja.como_lista() == pytest.approx([80.0, 30.0, 120.0, 70.0])

    def test_es_determinista(self, tmp_path):
        escribir_modelo(tmp_path)
        modelo = self.cargar(tmp_path)
        imagen = ImagenRGB(64, 48, np.random.default_rng(3).integers(0, 256, 64 * 48 * 3, dtype=np.uint8).tobytes())
        assert modelo.detectar(imagen) == modelo.detectar(imagen)

    def test_sin_modelo_json_explica_como_obtener_el_modelo(self, tmp_path):
        with pytest.raises(ErrorDeCargaDelModelo, match="exportar_onnx.py"):
            self.cargar(tmp_path)

    def test_sin_el_onnx_explica_que_los_pesos_no_se_versionan(self, tmp_path):
        escribir_modelo(tmp_path).unlink()
        with pytest.raises(ErrorDeCargaDelModelo, match="no se versionan"):
            self.cargar(tmp_path)

    def test_un_onnx_con_otro_hash_no_arranca(self, tmp_path):
        escribir_modelo(tmp_path, sha256="0" * 64)
        with pytest.raises(ErrorDeCargaDelModelo, match="hash"):
            self.cargar(tmp_path)

    def test_un_modelo_json_incompleto_no_arranca(self, tmp_path):
        escribir_modelo(tmp_path)
        (tmp_path / "modelo.json").write_text(json.dumps({"version": "x"}), encoding="utf-8")
        with pytest.raises(ErrorDeCargaDelModelo, match="incompleto"):
            self.cargar(tmp_path)

    def test_una_resolucion_distinta_a_la_del_grafo_no_arranca(self, tmp_path):
        escribir_modelo(tmp_path, resolucion_declarada=RESOLUCION * 2)
        with pytest.raises(ErrorDeCargaDelModelo, match="entrada"):
            self.cargar(tmp_path)

    def test_etiquetas_que_no_cuadran_con_las_columnas_no_arranca(self, tmp_path):
        escribir_modelo(tmp_path)
        datos = json.loads((tmp_path / "modelo.json").read_text(encoding="utf-8"))
        datos["etiquetas"], datos["indice_fondo"] = ETIQUETAS[:3], 3  # 4 columnas declaradas; el grafo tiene 5
        (tmp_path / "modelo.json").write_text(json.dumps(datos), encoding="utf-8")
        with pytest.raises(ErrorDeCargaDelModelo, match="clases"):
            self.cargar(tmp_path)

    @pytest.mark.parametrize("indice", [0, 2, -1])
    def test_un_fondo_que_no_es_la_ultima_columna_no_arranca(self, tmp_path, indice):
        # Con el fondo en otra columna, etiquetas[i] ya no sería la columna i: bache y grieta se cruzarían.
        escribir_modelo(tmp_path)
        datos = json.loads((tmp_path / "modelo.json").read_text(encoding="utf-8"))
        datos["indice_fondo"] = indice
        (tmp_path / "modelo.json").write_text(json.dumps(datos), encoding="utf-8")
        with pytest.raises(ErrorDeCargaDelModelo, match="indice_fondo"):
            self.cargar(tmp_path)

    def test_un_modelo_sin_etiquetas_de_la_app_no_arranca(self, tmp_path):
        escribir_modelo(tmp_path)
        datos = json.loads((tmp_path / "modelo.json").read_text(encoding="utf-8"))
        datos["etiquetas"] = ["a", "b", "c", "d"]
        (tmp_path / "modelo.json").write_text(json.dumps(datos), encoding="utf-8")
        with pytest.raises(ErrorDeCargaDelModelo, match="Ninguna etiqueta"):
            self.cargar(tmp_path)

    def test_un_fallo_del_motor_es_error_de_inferencia(self, tmp_path):
        escribir_modelo(tmp_path)
        modelo = self.cargar(tmp_path)
        with pytest.raises(ErrorDeInferencia, match="onnxruntime"):
            modelo.inferir(np.zeros((1, 3, 5, 5), dtype=np.float32))
