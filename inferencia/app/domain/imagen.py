"""La imagen que entra al modelo y los límites que la aplicación exige antes de decodificarla."""

from __future__ import annotations

from dataclasses import dataclass, field

FORMATOS_PERMITIDOS = frozenset({"JPEG", "PNG", "WEBP"})
"""Los mismos que acepta el backend para las fotos de reporte."""


@dataclass(frozen=True, slots=True)
class CabeceraDeImagen:
    """Formato y dimensiones leídos sin decodificar los píxeles."""

    formato: str
    ancho: int
    alto: int

    @property
    def pixeles(self) -> int:
        return self.ancho * self.alto


@dataclass(frozen=True, slots=True)
class ImagenRGB:
    """Píxeles RGB de 8 bits por canal, fila por fila (``ancho * alto * 3`` bytes), ya orientada."""

    ancho: int
    alto: int
    pixeles: bytes = field(repr=False)

    def __post_init__(self) -> None:
        if self.ancho <= 0 or self.alto <= 0:
            raise ValueError(f"Dimensiones inválidas: {self.ancho}x{self.alto}")
        esperado = self.ancho * self.alto * 3
        if len(self.pixeles) != esperado:
            raise ValueError(f"Se esperaban {esperado} bytes RGB y llegaron {len(self.pixeles)}")


@dataclass(frozen=True, slots=True)
class LimitesDeImagen:
    """Lo máximo que el servicio acepta. Los valores por defecto los fija la configuración.

    ``max_bytes`` acota el archivo y ``max_pixeles`` la memoria al decodificar
    (una «bomba de descompresión» son pocos bytes que se expanden a gigas).
    """

    max_bytes: int
    max_pixeles: int
    formatos: frozenset[str] = FORMATOS_PERMITIDOS

    def __post_init__(self) -> None:
        if self.max_bytes <= 0 or self.max_pixeles <= 0:
            raise ValueError("Los límites de imagen deben ser positivos")
        if not self.formatos:
            raise ValueError("Debe permitirse al menos un formato")
