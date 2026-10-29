"""Contrato HTTP del servicio (ARCHITECTURE.md §6 y §7).

- ``POST /v1/detecciones`` → ``{"version_modelo": str, "detecciones": [{"clase": str,
  "confianza": float, "caja": [x1, y1, x2, y2]}]}``. Lo consume ``clasificacion/infra``.
- ``POST /v1/moderacion`` → ``{"version_modelo": str, "puntaje": float}`` (D-15). Lo
  consume ``moderacion/infra``.

Un cambio incompatible pasa a ``/v2``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.deteccion import LARGO_MAXIMO_VERSION, ClaseDano, Detecciones
from app.domain.moderacion import PuntajeModeracion


class DeteccionRespuesta(BaseModel):
    model_config = ConfigDict(frozen=True)

    clase: ClaseDano = Field(description="Clase de la app: `bache` (D40) o `grieta` (D00, D10, D20 de RDD2022).")
    confianza: float = Field(ge=0, le=1, description="Confianza del modelo, entre 0 y 1. El umbral lo aplica el backend.")
    caja: tuple[float, float, float, float] = Field(
        description="`[x1, y1, x2, y2]` en píxeles de la imagen recibida (ya orientada), con origen arriba a la izquierda."
    )


class DeteccionesRespuesta(BaseModel):
    model_config = ConfigDict(frozen=True)

    version_modelo: str = Field(
        max_length=LARGO_MAXIMO_VERSION,
        description="Artefacto exacto que produjo las detecciones; cabe en `version_modelo_sugerencia VARCHAR(40)`.",
    )
    detecciones: list[DeteccionRespuesta] = Field(description="De mayor a menor confianza. Puede estar vacía.")

    @classmethod
    def desde(cls, resultado: Detecciones) -> DeteccionesRespuesta:
        return cls(
            version_modelo=str(resultado.version_modelo),
            detecciones=[
                DeteccionRespuesta(clase=d.clase, confianza=d.confianza, caja=tuple(d.caja.como_lista()))
                for d in resultado.detecciones
            ],
        )


class ModeracionRespuesta(BaseModel):
    model_config = ConfigDict(frozen=True)

    version_modelo: str = Field(
        max_length=LARGO_MAXIMO_VERSION,
        description="Artefacto exacto que midió el puntaje (`nsfw-vit-tiny-384-<revisión>-<hash>`).",
    )
    puntaje: float = Field(
        ge=0,
        le=1,
        description=(
            "Probabilidad de contenido sexual explícito, entre 0 y 1: el máximo de dos recortes de 384 px "
            "que cubren toda la foto. Siempre se devuelve (no hay piso); el umbral lo aplica el backend."
        ),
    )

    @classmethod
    def desde(cls, resultado: PuntajeModeracion) -> ModeracionRespuesta:
        return cls(version_modelo=str(resultado.version_modelo), puntaje=resultado.puntaje)


class SaludRespuesta(BaseModel):
    estado: Literal["ok"] = "ok"
    version_modelo: str = Field(max_length=LARGO_MAXIMO_VERSION, description="Versión del modelo de detección.")
    version_moderacion: str = Field(
        max_length=LARGO_MAXIMO_VERSION, description="Versión del modelo de moderación."
    )


class ErrorRespuesta(BaseModel):
    codigo: str = Field(description="Identificador estable del error, p. ej. `imagen_invalida`.")
    mensaje: str = Field(description="Explicación en español.")
