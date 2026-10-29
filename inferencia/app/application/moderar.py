"""Caso de uso ``moderar(imagen) -> PuntajeModeracion`` (ARCHITECTURE.md §6, D-15)."""

from __future__ import annotations

from app.application.validacion import ValidacionDeImagen
from app.domain.imagen import LimitesDeImagen
from app.domain.moderacion import PuntajeModeracion
from app.domain.puertos import DecodificadorDeImagen, ModeloDeModeracion


class ModerarImagen:
    """Valida el archivo igual que ``DetectarDanos``, lo decodifica e invoca el modelo de moderación.

    Devuelve la probabilidad de contenido sexual explícito de toda la foto. No
    decide nada: el umbral de rechazo lo aplica el backend.
    """

    def __init__(
        self,
        decodificador: DecodificadorDeImagen,
        modelo: ModeloDeModeracion,
        limites: LimitesDeImagen,
    ) -> None:
        self._validar = ValidacionDeImagen(decodificador, limites)
        self._modelo = modelo

    @property
    def limites(self) -> LimitesDeImagen:
        return self._validar.limites

    @property
    def version_modelo(self) -> str:
        return str(self._modelo.version)

    def __call__(self, datos: bytes) -> PuntajeModeracion:
        imagen = self._validar(datos)
        return PuntajeModeracion(version_modelo=self._modelo.version, puntaje=self._modelo.moderar(imagen))
