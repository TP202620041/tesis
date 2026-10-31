"""Caso de uso ``detectar(imagen) -> Detecciones`` (ARCHITECTURE.md §6)."""

from __future__ import annotations

from app.application.validacion import ValidacionDeImagen
from app.domain.deteccion import Detecciones
from app.domain.imagen import LimitesDeImagen
from app.domain.puertos import DecodificadorDeImagen, ModeloDeDeteccion


class DetectarDanos:
    """Valida el archivo, lo preprocesa (decodifica y orienta) e invoca el modelo.

    La validación (``ValidacionDeImagen``) es la misma de ``ModerarImagen``: primero
    lo barato y seguro (bytes, cabecera sin decodificar) y recién después la
    decodificación y el modelo, para que un archivo hostil no llegue a ocupar
    memoria ni CPU.
    """

    def __init__(
        self,
        decodificador: DecodificadorDeImagen,
        modelo: ModeloDeDeteccion,
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

    def __call__(self, datos: bytes) -> Detecciones:
        imagen = self._validar(datos)
        return Detecciones.de(self._modelo.version, self._modelo.detectar(imagen))
