"""Adaptador Pillow con imágenes sintéticas generadas en la prueba."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.domain.errores import ImagenInvalida
from app.infrastructure.pillow_decodificador import PillowDecodificador
from tests.dobles import imagen_sintetica

decodificador = PillowDecodificador()


@pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
def test_lee_formato_y_dimensiones_de_los_formatos_permitidos(formato):
    cabecera = decodificador.leer_cabecera(imagen_sintetica(64, 48, formato))
    assert (cabecera.formato, cabecera.ancho, cabecera.alto) == (formato, 64, 48)


def test_identifica_otros_formatos_para_que_la_aplicacion_los_rechace():
    assert decodificador.leer_cabecera(imagen_sintetica(8, 8, "GIF", modo="P")).formato == "GIF"


@pytest.mark.parametrize("formato", ["JPEG", "PNG", "WEBP"])
def test_decodifica_a_rgb_con_tres_bytes_por_pixel(formato):
    imagen = decodificador.decodificar(imagen_sintetica(64, 48, formato))
    assert (imagen.ancho, imagen.alto, len(imagen.pixeles)) == (64, 48, 64 * 48 * 3)


def test_la_transparencia_se_compone_sobre_blanco():
    imagen = decodificador.decodificar(imagen_sintetica(10, 10, "PNG", modo="RGBA"))
    assert imagen.pixeles[:3] == b"\xff\xff\xff"  # esquina transparente → blanco


def test_aplica_la_orientacion_exif():
    original = Image.new("RGB", (40, 20), (200, 10, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation = girar 90° en sentido horario
    salida = io.BytesIO()
    original.save(salida, format="JPEG", exif=exif.tobytes())

    imagen = decodificador.decodificar(salida.getvalue())

    assert (imagen.ancho, imagen.alto) == (20, 40)


def test_decodificar_es_determinista():
    datos = imagen_sintetica(32, 32, "JPEG")
    assert decodificador.decodificar(datos) == decodificador.decodificar(datos)


@pytest.mark.parametrize(
    "datos",
    [b"no soy una imagen", b"\x89PNG\r\n\x1a\n" + b"\x00" * 20, b"\xff\xd8\xff"],
    ids=["texto", "png-sin-cuerpo", "jpeg-sin-cuerpo"],
)
def test_un_archivo_que_no_es_imagen_es_imagen_invalida(datos):
    with pytest.raises(ImagenInvalida):
        decodificador.leer_cabecera(datos)
    with pytest.raises(ImagenInvalida):
        decodificador.decodificar(datos)


def test_un_jpeg_truncado_se_detecta_al_decodificar():
    datos = imagen_sintetica(256, 256, "JPEG", quality=95)
    truncado = datos[: len(datos) // 2]
    assert decodificador.leer_cabecera(truncado).formato == "JPEG"  # la cabecera está completa
    with pytest.raises(ImagenInvalida):
        decodificador.decodificar(truncado)
