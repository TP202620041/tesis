"""Puertos hacia la infraestructura (ARCHITECTURE.md §1, principio 4).

La aplicación depende de estas interfaces; ``app.main`` le inyecta los
adaptadores de ``app.infrastructure`` (Pillow y onnxruntime). Los tests usan
dobles que cumplen el mismo protocolo, sin pesos ni imágenes reales.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from app.domain.deteccion import Deteccion, VersionModelo
from app.domain.imagen import CabeceraDeImagen, ImagenRGB


class DecodificadorDeImagen(Protocol):
    """Lee y decodifica el archivo recibido. Lanza ``ImagenInvalida`` si no puede."""

    def leer_cabecera(self, datos: bytes) -> CabeceraDeImagen:
        """Formato y dimensiones, sin decodificar los píxeles."""
        ...

    def decodificar(self, datos: bytes) -> ImagenRGB:
        """Píxeles RGB ya orientados (EXIF), listos para el modelo."""
        ...


class ModeloDeDeteccion(Protocol):
    """Detector de daños. Devuelve solo clases de la app (``ClaseDano``) y no aplica el umbral de sugerencia.

    Lanza ``ErrorDeInferencia`` si el motor falla.
    """

    @property
    def version(self) -> VersionModelo: ...

    def detectar(self, imagen: ImagenRGB) -> Sequence[Deteccion]: ...


class ModeloDeModeracion(Protocol):
    """Clasificador de contenido sexual explícito (D-15). No aplica el umbral de rechazo.

    ``moderar`` devuelve la probabilidad en [0, 1] para **toda** la foto: el adaptador
    decide cómo recortarla para su resolución y devuelve el máximo de los recortes.
    Lanza ``ErrorDeInferencia`` si el motor falla.
    """

    @property
    def version(self) -> VersionModelo: ...

    def moderar(self, imagen: ImagenRGB) -> float: ...
