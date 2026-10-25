"""Detecciones de daño vial: el resultado que el servicio entrega al backend."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum


class ClaseDano(StrEnum):
    """Vocabulario de clases del contrato ``/v1`` (decisión del 21/10, opción A).

    Es el de la app, no el del modelo: ``bache`` viene de D40 de RDD2022 y
    ``grieta`` de D00, D10 y D20. Coincide 1:1 con ``categoria_dano.clase_modelo``
    del backend, así que cambiar de modelo no cambia el contrato. El mapeo desde
    las etiquetas del modelo vive en el adaptador (``infrastructure``).
    """

    BACHE = "bache"
    GRIETA = "grieta"


@dataclass(frozen=True, slots=True)
class Caja:
    """Rectángulo en píxeles de la imagen recibida (ya orientada): ``x1 <= x2``, ``y1 <= y2``."""

    x1: float
    y1: float
    x2: float
    y2: float

    def __post_init__(self) -> None:
        valores = (self.x1, self.y1, self.x2, self.y2)
        if not all(math.isfinite(v) for v in valores):
            raise ValueError(f"Las coordenadas de la caja deben ser finitas: {valores}")
        if min(valores) < 0:
            raise ValueError(f"Las coordenadas de la caja no pueden ser negativas: {valores}")
        if self.x1 > self.x2 or self.y1 > self.y2:
            raise ValueError(f"La caja debe cumplir x1 <= x2 e y1 <= y2: {valores}")

    def como_lista(self) -> list[float]:
        return [self.x1, self.y1, self.x2, self.y2]


@dataclass(frozen=True, slots=True)
class Deteccion:
    """Un daño detectado: clase de la app, confianza en [0, 1] y caja."""

    clase: ClaseDano
    confianza: float
    caja: Caja

    def __post_init__(self) -> None:
        if not isinstance(self.clase, ClaseDano):
            raise ValueError(f"Clase desconocida: {self.clase!r}")
        if not (math.isfinite(self.confianza) and 0.0 <= self.confianza <= 1.0):
            raise ValueError(f"La confianza debe estar en [0, 1]: {self.confianza}")


_PATRON_VERSION = re.compile(r"^[A-Za-z0-9._+-]+$")
LARGO_MAXIMO_VERSION = 40
"""Cabe en ``reporte.version_modelo_sugerencia VARCHAR(40)`` (propuesta del 21/10)."""


@dataclass(frozen=True, slots=True)
class VersionModelo:
    """Identifica el artefacto exacto que produjo una detección (D-08 y evaluación de OE3).

    El mismo valor con la misma foto da las mismas detecciones: el modelo es
    determinista en CPU con un número fijo de hilos.
    """

    valor: str

    def __post_init__(self) -> None:
        if not self.valor or len(self.valor) > LARGO_MAXIMO_VERSION:
            raise ValueError(
                f"La versión del modelo debe tener entre 1 y {LARGO_MAXIMO_VERSION} caracteres: {self.valor!r}"
            )
        if not _PATRON_VERSION.match(self.valor):
            raise ValueError(f"La versión del modelo solo admite letras, dígitos y . _ + -: {self.valor!r}")

    def __str__(self) -> str:
        return self.valor


@dataclass(frozen=True, slots=True)
class Detecciones:
    """Resultado de analizar una imagen. Las detecciones van de mayor a menor confianza.

    El servicio **solo detecta**: el umbral de sugerencia y la clase dominante
    los aplica el backend (``clasificacion/domain/PoliticaDeSugerencia``).
    """

    version_modelo: VersionModelo
    detecciones: tuple[Deteccion, ...]

    @classmethod
    def de(cls, version_modelo: VersionModelo, detecciones: Iterable[Deteccion]) -> Detecciones:
        """Ordena por confianza descendente, con desempate estable por clase y caja."""
        ordenadas = sorted(
            detecciones,
            key=lambda d: (-d.confianza, d.clase.value, d.caja.x1, d.caja.y1, d.caja.x2, d.caja.y2),
        )
        return cls(version_modelo=version_modelo, detecciones=tuple(ordenadas))
