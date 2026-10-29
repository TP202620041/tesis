"""Moderación de la foto: el puntaje que el servicio entrega al backend (D-15, NC-10a)."""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain.deteccion import VersionModelo


@dataclass(frozen=True, slots=True)
class PuntajeModeracion:
    """Probabilidad de contenido sexual explícito en una foto, con la versión del modelo que la midió.

    Es el máximo de los recortes que analizó el modelo, así que ninguna parte de la
    foto queda fuera. El servicio **solo mide**: el umbral de rechazo (0,70) lo aplica
    el backend (``moderacion/domain/PoliticaDeModeracion``). Siempre se devuelve; no
    hay piso técnico, a diferencia de las detecciones.
    """

    version_modelo: VersionModelo
    puntaje: float

    def __post_init__(self) -> None:
        if not isinstance(self.version_modelo, VersionModelo):
            raise ValueError(f"La versión del modelo debe ser un VersionModelo: {self.version_modelo!r}")
        if not (math.isfinite(self.puntaje) and 0.0 <= self.puntaje <= 1.0):
            raise ValueError(f"El puntaje debe estar en [0, 1]: {self.puntaje}")
