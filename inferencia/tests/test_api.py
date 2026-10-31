"""Contrato HTTP con el decodificador real (Pillow), imágenes sintéticas y modelos falsos."""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.api.servidor import MARGEN_MULTIPART, construir_api
from app.application.detectar import DetectarDanos
from app.application.moderar import ModerarImagen
from app.domain.deteccion import ClaseDano
from app.domain.imagen import LimitesDeImagen
from app.infrastructure.pillow_decodificador import PillowDecodificador
from tests.dobles import ModeloFalso, ModeradorFalso, deteccion, imagen_sintetica

LIMITES = LimitesDeImagen(max_bytes=200_000, max_pixeles=1_000_000)
DETECCIONES = "/v1/detecciones"
MODERACION = "/v1/moderacion"


def cliente(
    modelo: ModeloFalso | None = None,
    limites: LimitesDeImagen = LIMITES,
    moderador: ModeradorFalso | None = None,
) -> TestClient:
    decodificador = PillowDecodificador()
    detectar = DetectarDanos(decodificador, modelo or ModeloFalso(), limites)
    moderar = ModerarImagen(decodificador, moderador or ModeradorFalso(), limites)
    return TestClient(construir_api(detectar, moderar), raise_server_exceptions=False)


def enviar(c: TestClient, datos: bytes, nombre: str = "foto.jpg", tipo: str = "image/jpeg", ruta: str = DETECCIONES):
    return c.post(ruta, files={"imagen": (nombre, datos, tipo)})


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

    def test_no_llama_al_modelo_de_moderacion(self):
        moderador = ModeradorFalso()
        enviar(cliente(moderador=moderador), imagen_sintetica())
        assert moderador.recibidas == []


class TestModeracion:
    def test_responde_el_contrato_exacto(self):
        respuesta = enviar(cliente(moderador=ModeradorFalso(puntaje=0.123)), imagen_sintetica(), ruta=MODERACION)

        assert respuesta.status_code == 200
        assert respuesta.json() == {"version_modelo": "moderacion-falsa-1", "puntaje": 0.123}

    @pytest.mark.parametrize("puntaje", [0.0, 1.0])
    def test_siempre_devuelve_el_puntaje_sin_piso(self, puntaje):
        respuesta = enviar(cliente(moderador=ModeradorFalso(puntaje=puntaje)), imagen_sintetica(), ruta=MODERACION)
        assert respuesta.json()["puntaje"] == puntaje

    @pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
    def test_acepta_los_formatos_del_backend(self, formato):
        moderador = ModeradorFalso()
        respuesta = enviar(
            cliente(moderador=moderador), imagen_sintetica(64, 48, formato), tipo="application/octet-stream", ruta=MODERACION
        )
        assert respuesta.status_code == 200
        assert [(i.ancho, i.alto) for i in moderador.recibidas] == [(64, 48)]

    def test_el_tipo_declarado_no_importa_se_mira_el_contenido(self):
        respuesta = enviar(cliente(), imagen_sintetica(formato="WEBP"), nombre="foto.png", tipo="image/png", ruta=MODERACION)
        assert respuesta.status_code == 200

    def test_no_llama_al_modelo_de_deteccion(self):
        modelo = ModeloFalso()
        enviar(cliente(modelo), imagen_sintetica(), ruta=MODERACION)
        assert modelo.recibidas == []

    def test_un_puntaje_fuera_de_rango_del_adaptador_es_500(self):
        respuesta = enviar(cliente(moderador=ModeradorFalso(puntaje=1.5)), imagen_sintetica(), ruta=MODERACION)
        assert respuesta.status_code == 500
        assert respuesta.json()["codigo"] == "error_interno"


@pytest.fixture(params=[DETECCIONES, MODERACION], ids=["detecciones", "moderacion"])
def ruta(request) -> str:
    """Los dos endpoints responden los mismos errores a la misma solicitud (contrato de D-15)."""
    return request.param


class TestErrores:
    def test_sin_el_campo_imagen_es_400(self, ruta):
        respuesta = cliente().post(ruta, files={"foto": ("a.jpg", imagen_sintetica(), "image/jpeg")})
        assert respuesta.status_code == 400
        assert respuesta.json()["codigo"] == "solicitud_invalida"
        assert "imagen" in respuesta.json()["mensaje"]

    def test_sin_multipart_es_400(self, ruta):
        respuesta = cliente().post(ruta, json={"imagen": "x"})
        assert respuesta.status_code == 400
        assert respuesta.json()["codigo"] == "solicitud_invalida"

    @pytest.mark.parametrize("datos", [b"", b"no soy una imagen"], ids=["vacia", "texto"])
    def test_un_archivo_que_no_es_imagen_es_400(self, ruta, datos):
        modelo, moderador = ModeloFalso(), ModeradorFalso()
        respuesta = enviar(cliente(modelo, moderador=moderador), datos, ruta=ruta)
        assert respuesta.status_code == 400
        assert respuesta.json()["codigo"] == "imagen_invalida"
        assert modelo.recibidas == [] and moderador.recibidas == []

    @pytest.mark.parametrize("formato, modo", [("GIF", "P"), ("TIFF", "RGB"), ("BMP", "RGB")])
    def test_un_formato_no_permitido_es_400_sin_llegar_al_modelo(self, ruta, formato, modo):
        modelo, moderador = ModeloFalso(), ModeradorFalso()
        respuesta = enviar(
            cliente(modelo, moderador=moderador),
            imagen_sintetica(8, 8, formato, modo=modo),
            nombre="a.img",
            tipo="image/gif",
            ruta=ruta,
        )
        assert respuesta.status_code == 400
        assert respuesta.json() == {
            "codigo": "imagen_invalida",
            "mensaje": "El archivo no es una imagen JPEG, PNG o WEBP válida o está dañado.",
        }
        assert modelo.recibidas == [] and moderador.recibidas == []

    def test_sin_memoria_al_decodificar_es_500_y_no_un_error_del_cliente(self, ruta):
        class SinMemoria(PillowDecodificador):
            def decodificar(self, datos):
                raise MemoryError

        detectar = DetectarDanos(SinMemoria(), ModeloFalso(), LIMITES)
        moderar = ModerarImagen(SinMemoria(), ModeradorFalso(), LIMITES)
        c = TestClient(construir_api(detectar, moderar), raise_server_exceptions=False)
        respuesta = enviar(c, imagen_sintetica(), ruta=ruta)
        assert respuesta.status_code == 500
        assert respuesta.json()["codigo"] == "error_interno"

    def test_un_archivo_que_supera_el_maximo_de_bytes_es_413(self, ruta):
        limites = LimitesDeImagen(max_bytes=1_000, max_pixeles=1_000_000)
        respuesta = enviar(cliente(limites=limites), imagen_sintetica(256, 256, "PNG"), ruta=ruta)
        assert respuesta.status_code == 413
        assert respuesta.json()["codigo"] == "imagen_demasiado_grande"

    def test_una_imagen_con_demasiados_pixeles_es_413_sin_llegar_al_modelo(self, ruta):
        modelo, moderador = ModeloFalso(), ModeradorFalso()
        limites = LimitesDeImagen(max_bytes=200_000, max_pixeles=100 * 100)
        respuesta = enviar(cliente(modelo, limites, moderador), imagen_sintetica(101, 100, "PNG"), ruta=ruta)
        assert respuesta.status_code == 413
        assert "101x100" in respuesta.json()["mensaje"]
        assert modelo.recibidas == [] and moderador.recibidas == []

    def test_un_cuerpo_declarado_por_encima_del_limite_se_corta_sin_leerlo(self, ruta):
        limites = LimitesDeImagen(max_bytes=1_000, max_pixeles=1_000_000)
        c = cliente(limites=limites)
        cuerpo = b"x" * (1_000 + MARGEN_MULTIPART + 1)
        respuesta = c.post(ruta, content=cuerpo, headers={"Content-Type": "multipart/form-data; boundary=limite"})
        assert respuesta.status_code == 413
        assert respuesta.json()["codigo"] == "imagen_demasiado_grande"

    def test_un_cuerpo_por_trozos_por_encima_del_limite_tambien_es_413(self, ruta):
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

        respuesta = c.post(ruta, content=trozos(), headers={"Content-Type": "multipart/form-data; boundary=limite"})
        assert respuesta.status_code == 413
        assert respuesta.json()["codigo"] == "imagen_demasiado_grande"

    def test_un_fallo_del_modelo_es_500_con_mensaje_generico(self, ruta):
        c = cliente(ModeloFalso(falla=True), moderador=ModeradorFalso(falla=True))
        respuesta = enviar(c, imagen_sintetica(), ruta=ruta)
        assert respuesta.status_code == 500
        assert respuesta.json() == {"codigo": "error_de_inferencia", "mensaje": "El modelo no pudo analizar la imagen."}

    def test_get_es_405(self, ruta):
        respuesta = cliente().get(ruta)
        assert respuesta.status_code == 405
        assert respuesta.json()["codigo"] == "metodo_no_permitido"

    def test_una_ruta_inexistente_usa_la_misma_forma_de_error(self):
        respuesta = cliente().get("/v1/no-existe")
        assert respuesta.status_code == 404
        assert respuesta.json()["codigo"] == "no_encontrado"


class ModeloQueEspera(ModeloFalso):
    """Detección que se queda dentro del modelo hasta que la sueltan (para ocupar su limitador)."""

    def __init__(self) -> None:
        super().__init__()
        self.adentro = threading.Semaphore(0)
        self.soltar = threading.Event()

    def detectar(self, imagen):
        self.adentro.release()
        assert self.soltar.wait(10), "nadie soltó la detección"
        return []


class ModeradorQueEspera(ModeradorFalso):
    def __init__(self) -> None:
        super().__init__()
        self.adentro = threading.Semaphore(0)
        self.soltar = threading.Event()

    def moderar(self, imagen):
        self.adentro.release()
        assert self.soltar.wait(10), "nadie soltó la moderación"
        return 0.2


class TestConcurrencia:
    @staticmethod
    def contador_de_maximo(clase_base, metodo: str, resultado):
        class Lento(clase_base):
            en_curso = 0
            maximo = 0
            candado = threading.Lock()

        def lento(self, imagen):
            with Lento.candado:
                Lento.en_curso += 1
                Lento.maximo = max(Lento.maximo, Lento.en_curso)
            time.sleep(0.05)
            with Lento.candado:
                Lento.en_curso -= 1
            return resultado

        setattr(Lento, metodo, lento)
        return Lento

    def test_a_lo_sumo_dos_detecciones_decodifican_o_infieren_a_la_vez(self):
        ModeloLento = self.contador_de_maximo(ModeloFalso, "detectar", [])
        datos = imagen_sintetica()
        # Con «with», todas las solicitudes comparten un solo bucle de eventos, como en uvicorn
        # (sin él, TestClient abre un bucle por solicitud y el limitador no puede coordinarlas).
        with cliente(ModeloLento()) as c, ThreadPoolExecutor(6) as grupo:
            estados = list(grupo.map(lambda _: enviar(c, datos).status_code, range(6)))

        assert estados == [200] * 6
        assert 1 <= ModeloLento.maximo <= 2

    def test_a_lo_sumo_dos_moderaciones_a_la_vez(self):
        ModeradorLento = self.contador_de_maximo(ModeradorFalso, "moderar", 0.1)
        datos = imagen_sintetica()
        with cliente(moderador=ModeradorLento()) as c, ThreadPoolExecutor(6) as grupo:
            estados = list(grupo.map(lambda _: enviar(c, datos, ruta=MODERACION).status_code, range(6)))

        assert estados == [200] * 6
        assert 1 <= ModeradorLento.maximo <= 2

    @pytest.mark.parametrize("ocupada, libre", [(DETECCIONES, MODERACION), (MODERACION, DETECCIONES)])
    def test_el_limitador_de_cada_endpoint_es_independiente(self, ocupada, libre):
        modelo, moderador = ModeloQueEspera(), ModeradorQueEspera()
        bloqueado, libre_doble = (modelo, moderador) if ocupada == DETECCIONES else (moderador, modelo)
        libre_doble.soltar.set()  # solo el endpoint ocupado se queda dentro de su modelo
        datos = imagen_sintetica()
        with cliente(modelo, moderador=moderador) as c, ThreadPoolExecutor(2) as grupo:
            try:
                ocupando = [grupo.submit(enviar, c, datos, ruta=ocupada) for _ in range(2)]
                for _ in range(2):  # las dos plazas de su limitador quedan tomadas
                    assert bloqueado.adentro.acquire(timeout=10)

                inicio = time.perf_counter()
                respuesta = enviar(c, datos, ruta=libre)
                segundos = time.perf_counter() - inicio

                assert respuesta.status_code == 200
                assert segundos < 5
                assert not any(f.done() for f in ocupando), "el otro endpoint debía seguir ocupado"
            finally:
                modelo.soltar.set()
                moderador.soltar.set()
            assert [f.result(timeout=10).status_code for f in ocupando] == [200, 200]


class TestSaludYDocumentacion:
    def test_salud_informa_la_version_de_cada_modelo(self):
        respuesta = cliente().get("/salud")
        assert respuesta.status_code == 200
        assert respuesta.json() == {
            "estado": "ok",
            "version_modelo": "modelo-falso-1",
            "version_moderacion": "moderacion-falsa-1",
        }

    def test_openapi_publica_el_contrato_v1(self):
        esquema = cliente().get("/openapi.json").json()
        assert set(esquema["paths"]) == {"/v1/detecciones", "/v1/moderacion", "/salud"}
        for ruta in ("/v1/detecciones", "/v1/moderacion"):
            operacion = esquema["paths"][ruta]["post"]
            assert "multipart/form-data" in operacion["requestBody"]["content"]
            assert {"200", "400", "413", "500"} <= set(operacion["responses"])
        clases = esquema["components"]["schemas"]["ClaseDano"]["enum"]
        assert sorted(clases) == ["bache", "grieta"]
        esquemas = esquema["components"]["schemas"]
        assert esquemas["DeteccionesRespuesta"]["properties"]["version_modelo"]["maxLength"] == 40
        assert esquemas["SaludRespuesta"]["properties"]["version_modelo"]["maxLength"] == 40
        assert esquemas["SaludRespuesta"]["properties"]["version_moderacion"]["maxLength"] == 40

    def test_openapi_publica_el_contrato_de_moderacion(self):
        esquemas = cliente().get("/openapi.json").json()["components"]["schemas"]
        moderacion = esquemas["ModeracionRespuesta"]
        assert set(moderacion["properties"]) == {"version_modelo", "puntaje"}
        assert set(moderacion["required"]) == {"version_modelo", "puntaje"}
        assert moderacion["properties"]["version_modelo"]["maxLength"] == 40
        assert moderacion["properties"]["puntaje"]["type"] == "number"
        assert moderacion["properties"]["puntaje"]["minimum"] == 0
        assert moderacion["properties"]["puntaje"]["maximum"] == 1
