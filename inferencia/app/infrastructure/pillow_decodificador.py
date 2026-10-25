"""Adaptador de ``DecodificadorDeImagen`` con Pillow."""

from __future__ import annotations

import io

from PIL import Image, ImageOps

from app.domain.errores import ImagenInvalida
from app.domain.imagen import CabeceraDeImagen, ImagenRGB

_MENSAJE_INVALIDA = "El archivo no es una imagen válida o está dañado."


class PillowDecodificador:
    """Lee la cabecera sin decodificar y decodifica a RGB orientado.

    Los decodificadores lanzan errores muy distintos ante un archivo dañado
    (``UnidentifiedImageError``, ``OSError`` por truncado, ``SyntaxError``,
    ``ValueError``, ``struct.error``…). Todos son culpa del archivo, no del
    servicio, así que se traducen a ``ImagenInvalida`` (400), igual que hace el
    saneador del backend.
    """

    def leer_cabecera(self, datos: bytes) -> CabeceraDeImagen:
        try:
            with Image.open(io.BytesIO(datos)) as imagen:
                return CabeceraDeImagen(formato=imagen.format or "", ancho=imagen.width, alto=imagen.height)
        except Exception as error:  # noqa: BLE001 (ver docstring de la clase)
            raise ImagenInvalida(_MENSAJE_INVALIDA) from error

    def decodificar(self, datos: bytes) -> ImagenRGB:
        try:
            with Image.open(io.BytesIO(datos)) as imagen:
                imagen.load()
                # Aplica la orientación EXIF a los píxeles. Las fotos que envía el
                # backend ya vienen saneadas y orientadas, así que ahí no cambia nada.
                orientada = ImageOps.exif_transpose(imagen)
                rgb = _a_rgb_sobre_blanco(orientada)
                return ImagenRGB(ancho=rgb.width, alto=rgb.height, pixeles=rgb.tobytes())
        except Exception as error:  # noqa: BLE001 (ver docstring de la clase)
            raise ImagenInvalida(_MENSAJE_INVALIDA) from error


def _a_rgb_sobre_blanco(imagen: Image.Image) -> Image.Image:
    """RGB de 8 bits. La transparencia se compone sobre blanco, como en el saneador del backend."""
    if imagen.mode == "RGB":
        return imagen
    tiene_alfa = imagen.mode in ("RGBA", "LA", "PA") or (imagen.mode == "P" and "transparency" in imagen.info)
    if tiene_alfa:
        rgba = imagen.convert("RGBA")
        fondo = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        return Image.alpha_composite(fondo, rgba).convert("RGB")
    return imagen.convert("RGB")
