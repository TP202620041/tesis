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


@pytest.mark.parametrize("formato, modo", [("GIF", "P"), ("TIFF", "RGB"), ("BMP", "RGB")])
def test_solo_prueba_los_lectores_de_los_formatos_permitidos(formato, modo):
    datos = imagen_sintetica(8, 8, formato, modo=modo)
    with pytest.raises(ImagenInvalida, match="JPEG, PNG o WEBP"):
        decodificador.leer_cabecera(datos)
    with pytest.raises(ImagenInvalida):
        decodificador.decodificar(datos)


def test_los_formatos_permitidos_son_configurables():
    solo_png = PillowDecodificador({"PNG"})
    assert solo_png.leer_cabecera(imagen_sintetica(8, 8, "PNG")).formato == "PNG"
    with pytest.raises(ImagenInvalida, match="imagen PNG válida"):
        solo_png.leer_cabecera(imagen_sintetica(8, 8, "JPEG"))


@pytest.mark.parametrize("metodo", ["leer_cabecera", "decodificar"])
def test_memory_error_no_se_disfraza_de_imagen_invalida(monkeypatch, metodo):
    def sin_memoria(*args, **kwargs):
        raise MemoryError

    monkeypatch.setattr(Image, "open", sin_memoria)
    with pytest.raises(MemoryError):
        getattr(decodificador, metodo)(b"cualquier cosa")


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
