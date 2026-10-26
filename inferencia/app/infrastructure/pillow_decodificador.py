"""Adaptador de ``DecodificadorDeImagen`` con Pillow."""

from __future__ import annotations

import io
from collections.abc import Iterable

from PIL import Image, ImageOps

from app.domain.errores import ImagenInvalida
from app.domain.imagen import FORMATOS_PERMITIDOS, CabeceraDeImagen, ImagenRGB


class PillowDecodificador:
    """Lee la cabecera sin decodificar y decodifica a RGB orientado.

    - Pillow solo prueba los lectores de los **formatos permitidos**
      (``Image.open(..., formats=...)``): un GIF, TIFF, PSD o cualquier otro no
      llega a ningún otro decodificador, que es menos superficie ante un archivo
      hostil. La aplicación vuelve a comprobar el formato (defensa en dos capas).
    - Los decodificadores lanzan errores muy distintos ante un archivo dañado
      (``UnidentifiedImageError``, ``OSError`` por truncado, ``SyntaxError``,
      ``ValueError``, ``struct.error``…). Todos son culpa del archivo, así que se
      traducen a ``ImagenInvalida`` (400), igual que hace el saneador del backend.
    - **``MemoryError`` no**: la imagen ya pasó los límites de bytes y de
      píxeles, así que quedarse sin memoria es un problema del servicio, no del
      cliente. Se deja subir y el manejador general responde 500 y lo registra
      (el backend lo trata como «sin sugerencia»). Convertirlo en 400 escondería
      un contenedor sin memoria detrás de un error del cliente.
    """

    def __init__(self, formatos: Iterable[str] = FORMATOS_PERMITIDOS) -> None:
        self._formatos = tuple(sorted(formatos))
        self._mensaje = f"El archivo no es una imagen {_enumerar(self._formatos)} válida o está dañado."

    def leer_cabecera(self, datos: bytes) -> CabeceraDeImagen:
        try:
            with Image.open(io.BytesIO(datos), formats=self._formatos) as imagen:
                return CabeceraDeImagen(formato=imagen.format or "", ancho=imagen.width, alto=imagen.height)
        except MemoryError:
            raise
        except Exception as error:  # noqa: BLE001 (ver docstring de la clase)
            raise ImagenInvalida(self._mensaje) from error

    def decodificar(self, datos: bytes) -> ImagenRGB:
        try:
            with Image.open(io.BytesIO(datos), formats=self._formatos) as imagen:
                imagen.load()
                # Aplica la orientación EXIF a los píxeles. Las fotos que envía el
                # backend ya vienen saneadas y orientadas, así que ahí no cambia nada.
                orientada = ImageOps.exif_transpose(imagen)
                rgb = _a_rgb_sobre_blanco(orientada)
                return ImagenRGB(ancho=rgb.width, alto=rgb.height, pixeles=rgb.tobytes())
        except MemoryError:
            raise
        except Exception as error:  # noqa: BLE001 (ver docstring de la clase)
            raise ImagenInvalida(self._mensaje) from error


def _enumerar(formatos: tuple[str, ...]) -> str:
    return formatos[0] if len(formatos) == 1 else f"{', '.join(formatos[:-1])} o {formatos[-1]}"


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
