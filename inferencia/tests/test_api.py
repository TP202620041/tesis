"""Contrato HTTP con el decodificador real (Pillow), imágenes sintéticas y un modelo falso."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.servidor import MARGEN_MULTIPART, construir_api
from app.application.detectar import DetectarDanos
from app.domain.deteccion import ClaseDano
from app.domain.imagen import LimitesDeImagen
from app.infrastructure.pillow_decodificador import PillowDecodificador
from tests.dobles import ModeloFalso, deteccion, imagen_sintetica

LIMITES = LimitesDeImagen(max_bytes=200_000, max_pixeles=1_000_000)


def cliente(modelo: ModeloFalso | None = None, limites: LimitesDeImagen = LIMITES) -> TestClient:
    caso = DetectarDanos(PillowDecodificador(), modelo or ModeloFalso(), limites)
    return TestClient(construir_api(caso), raise_server_exceptions=False)


def enviar(c: TestClient, datos: bytes, nombre: str = "foto.jpg", tipo: str = "image/jpeg"):
    return c.post("/v1/detecciones", files={"imagen": (nombre, datos, tipo)})


class TestDetecciones:
    def test_responde_el_contrato_exacto(self):
        modelo = ModeloFalso(
            respuesta=[
                deteccion(ClaseDano.GRIETA, 0.41, (0.5, 1.5, 20.0, 30.25)),
                deteccion(ClaseDano.BACHE, 0.87, (10.0, 12.0, 40.0, 44.0)),
            ]
        )
        respuesta = enviar(cliente(modelo), imagen_sintetica())

        assert respuesta.status_code == 200
        assert respuesta.json() == {
            "version_modelo": "modelo-falso-1",
            "detecciones": [
                {"clase": "bache", "confianza": 0.87, "caja": [10.0, 12.0, 40.0, 44.0]},
                {"clase": "grieta", "confianza": 0.41, "caja": [0.5, 1.5, 20.0, 30.25]},
            ],
        }

    def test_sin_detecciones_devuelve_lista_vacia(self):
        respuesta = enviar(cliente(), imagen_sintetica())
        assert respuesta.status_code == 200
        assert respuesta.json() == {"version_modelo": "modelo-falso-1", "detecciones": []}

    @pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
    def test_acepta_los_formatos_del_backend(self, formato):
        modelo = ModeloFalso()
        respuesta = enviar(cliente(modelo), imagen_sintetica(64, 48, formato), tipo="application/octet-stream")
        assert respuesta.status_code == 200
        assert [(i.ancho, i.alto) for i in modelo.recibidas] == [(64, 48)]

    def test_el_tipo_declarado_no_importa_se_mira_el_contenido(self):
        respuesta = enviar(cliente(), imagen_sintetica(formato="PNG"), nombre="foto.jpg", tipo="image/jpeg")
        assert respuesta.status_code == 200


class TestErrores:
    def test_sin_el_campo_imagen_es_400(self):
        respuesta = cliente().post("/v1/detecciones", files={"foto": ("a.jpg", imagen_sintetica(), "image/jpeg")})
        assert respuesta.status_code == 400
        assert respuesta.json()["codigo"] == "solicitud_invalida"
        assert "imagen" in respuesta.json()["mensaje"]

    def test_sin_multipart_es_400(self):
        respuesta = cliente().post("/v1/detecciones", json={"imagen": "x"})
        assert respuesta.status_code == 400
        assert respuesta.json()["codigo"] == "solicitud_invalida"

    @pytest.mark.parametrize("datos", [b"", b"no soy una imagen"], ids=["vacia", "texto"])
    def test_un_archivo_que_no_es_imagen_es_400(self, datos):
        modelo = ModeloFalso()
        respuesta = enviar(cliente(modelo), datos)
        assert respuesta.status_code == 400
        assert respuesta.json()["codigo"] == "imagen_invalida"
        assert modelo.recibidas == []

    @pytest.mark.parametrize("formato, modo", [("GIF", "P"), ("TIFF", "RGB"), ("BMP", "RGB")])
    def test_un_formato_no_permitido_es_400_sin_llegar_al_modelo(self, formato, modo):
        modelo = ModeloFalso()
        respuesta = enviar(cliente(modelo), imagen_sintetica(8, 8, formato, modo=modo), nombre="a.img", tipo="image/gif")
        assert respuesta.status_code == 400
        assert respuesta.json() == {
            "codigo": "imagen_invalida",
            "mensaje": "El archivo no es una imagen JPEG, PNG o WEBP válida o está dañado.",
        }
        assert modelo.recibidas == []

    def test_sin_memoria_al_decodificar_es_500_y_no_un_error_del_cliente(self):
        class SinMemoria(PillowDecodificador):
            def decodificar(self, datos):
                raise MemoryError

        caso = DetectarDanos(SinMemoria(), ModeloFalso(), LIMITES)
        respuesta = enviar(TestClient(construir_api(caso), raise_server_exceptions=False), imagen_sintetica())
        assert respuesta.status_code == 500
        assert respuesta.json()["codigo"] == "error_interno"

    def test_un_archivo_que_supera_el_maximo_de_bytes_es_413(self):
        limites = LimitesDeImagen(max_bytes=1_000, max_pixeles=1_000_000)
        respuesta = enviar(cliente(limites=limites), imagen_sintetica(256, 256, "PNG"))
        assert respuesta.status_code == 413
        assert respuesta.json()["codigo"] == "imagen_demasiado_grande"

    def test_una_imagen_con_demasiados_pixeles_es_413_sin_llegar_al_modelo(self):
        modelo = ModeloFalso()
        limites = LimitesDeImagen(max_bytes=200_000, max_pixeles=100 * 100)
        respuesta = enviar(cliente(modelo, limites), imagen_sintetica(101, 100, "PNG"))
        assert respuesta.status_code == 413
        assert "101x100" in respuesta.json()["mensaje"]
        assert modelo.recibidas == []

    def test_un_cuerpo_declarado_por_encima_del_limite_se_corta_sin_leerlo(self):
        limites = LimitesDeImagen(max_bytes=1_000, max_pixeles=1_000_000)
        c = cliente(limites=limites)
        cuerpo = b"x" * (1_000 + MARGEN_MULTIPART + 1)
        respuesta = c.post(
            "/v1/detecciones",
            content=cuerpo,
            headers={"Content-Type": "multipart/form-data; boundary=limite"},
        )
        assert respuesta.status_code == 413
        assert respuesta.json()["codigo"] == "imagen_demasiado_grande"

    def test_un_cuerpo_por_trozos_por_encima_del_limite_tambien_es_413(self):
        limites = LimitesDeImagen(max_bytes=1_000, max_pixeles=1_000_000)
        c = cliente(limites=limites)
        relleno = b"x" * (1_000 + MARGEN_MULTIPART + 10)
        cuerpo = (
            b"--limite\r\nContent-Disposition: form-data; name=\"imagen\"; filename=\"a.jpg\"\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + relleno + b"\r\n--limite--\r\n"
        )

        def trozos():  # sin Content-Length: llega como Transfer-Encoding: chunked
            for i in range(0, len(cuerpo), 4096):
                yield cuerpo[i : i + 4096]

        respuesta = c.post(
            "/v1/detecciones",
            content=trozos(),
            headers={"Content-Type": "multipart/form-data; boundary=limite"},
        )
        assert respuesta.status_code == 413
        assert respuesta.json()["codigo"] == "imagen_demasiado_grande"

    def test_un_fallo_del_modelo_es_500_con_mensaje_generico(self):
        respuesta = enviar(cliente(ModeloFalso(falla=True)), imagen_sintetica())
        assert respuesta.status_code == 500
        assert respuesta.json() == {"codigo": "error_de_inferencia", "mensaje": "El modelo no pudo analizar la imagen."}

    def test_una_ruta_inexistente_usa_la_misma_forma_de_error(self):
        respuesta = cliente().get("/v1/no-existe")
        assert respuesta.status_code == 404
        assert respuesta.json()["codigo"] == "no_encontrado"

    def test_get_sobre_detecciones_es_405(self):
        respuesta = cliente().get("/v1/detecciones")
        assert respuesta.status_code == 405
        assert respuesta.json()["codigo"] == "metodo_no_permitido"


class TestConcurrencia:
    def test_a_lo_sumo_dos_solicitudes_decodifican_o_infieren_a_la_vez(self):
        import threading
        import time
        from concurrent.futures import ThreadPoolExecutor

        class ModeloLento(ModeloFalso):
            en_curso = 0
            maximo = 0
            candado = threading.Lock()

            def detectar(self, imagen):
                with self.candado:
                    type(self).en_curso += 1
                    type(self).maximo = max(type(self).maximo, type(self).en_curso)
                time.sleep(0.05)
                with self.candado:
                    type(self).en_curso -= 1
                return []

        datos = imagen_sintetica()
        # Con «with», todas las solicitudes comparten un solo bucle de eventos, como en uvicorn
        # (sin él, TestClient abre un bucle por solicitud y el limitador no puede coordinarlas).
        with cliente(ModeloLento()) as c, ThreadPoolExecutor(6) as grupo:
            estados = list(grupo.map(lambda _: enviar(c, datos).status_code, range(6)))

        assert estados == [200] * 6
        assert 1 <= ModeloLento.maximo <= 2


class TestSaludYDocumentacion:
    def test_salud_informa_la_version_del_modelo(self):
        respuesta = cliente().get("/salud")
        assert respuesta.status_code == 200
        assert respuesta.json() == {"estado": "ok", "version_modelo": "modelo-falso-1"}

    def test_openapi_publica_el_contrato_v1(self):
        esquema = cliente().get("/openapi.json").json()
        assert set(esquema["paths"]) == {"/v1/detecciones", "/salud"}
        operacion = esquema["paths"]["/v1/detecciones"]["post"]
        assert "multipart/form-data" in operacion["requestBody"]["content"]
        assert {"200", "400", "413", "500"} <= set(operacion["responses"])
        clases = esquema["components"]["schemas"]["ClaseDano"]["enum"]
        assert sorted(clases) == ["bache", "grieta"]
        esquemas = esquema["components"]["schemas"]
        assert esquemas["DeteccionesRespuesta"]["properties"]["version_modelo"]["maxLength"] == 40
        assert esquemas["SaludRespuesta"]["properties"]["version_modelo"]["maxLength"] == 40
