"""Contrato HTTP del servicio (ARCHITECTURE.md §6 y §7).

``POST /v1/detecciones`` → ``{"version_modelo": str, "detecciones": [{"clase": str,
"confianza": float, "caja": [x1, y1, x2, y2]}]}``. Lo consume
``clasificacion/infra`` del backend. Un cambio incompatible pasa a ``/v2``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.deteccion import ClaseDano, Detecciones


class DeteccionRespuesta(BaseModel):
    model_config = ConfigDict(frozen=True)

    clase: ClaseDano = Field(description="Clase de la app: `bache` (D40) o `grieta` (D00, D10, D20 de RDD2022).")
    confianza: float = Field(ge=0, le=1, description="Confianza del modelo, entre 0 y 1. El umbral lo aplica el backend.")
    caja: tuple[float, float, float, float] = Field(
        description="`[x1, y1, x2, y2]` en píxeles de la imagen recibida (ya orientada), con origen arriba a la izquierda."
    )


class DeteccionesRespuesta(BaseModel):
    model_config = ConfigDict(frozen=True)

    version_modelo: str = Field(description="Artefacto exacto que produjo las detecciones (máximo 40 caracteres).")
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


class SaludRespuesta(BaseModel):
    estado: Literal["ok"] = "ok"
    version_modelo: str


class ErrorRespuesta(BaseModel):
    codigo: str = Field(description="Identificador estable del error, p. ej. `imagen_invalida`.")
    mensaje: str = Field(description="Explicación en español.")
