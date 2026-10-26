"""Caso de uso ``detectar(imagen) -> Detecciones`` (ARCHITECTURE.md §6)."""

from __future__ import annotations

from app.domain.deteccion import Detecciones
from app.domain.errores import ImagenDemasiadoGrande, ImagenInvalida
from app.domain.imagen import LimitesDeImagen
from app.domain.puertos import DecodificadorDeImagen, ModeloDeDeteccion


class DetectarDanos:
    """Valida el archivo, lo preprocesa (decodifica y orienta) e invoca el modelo.

    El orden importa: primero lo barato y seguro (bytes, cabecera sin
    decodificar) y recién después la decodificación y el modelo, para que un
    archivo hostil no llegue a ocupar memoria ni CPU.
    """

    def __init__(
        self,
        decodificador: DecodificadorDeImagen,
        modelo: ModeloDeDeteccion,
        limites: LimitesDeImagen,
    ) -> None:
        self._decodificador = decodificador
        self._modelo = modelo
        self._limites = limites

    @property
    def limites(self) -> LimitesDeImagen:
        return self._limites

    @property
    def version_modelo(self) -> str:
        return str(self._modelo.version)

    def __call__(self, datos: bytes) -> Detecciones:
        if not datos:
            raise ImagenInvalida("La imagen está vacía.")
        if len(datos) > self._limites.max_bytes:
            raise ImagenDemasiadoGrande(
                f"La imagen pesa {len(datos)} bytes y el máximo es {self._limites.max_bytes}."
            )

        cabecera = self._decodificador.leer_cabecera(datos)
        if cabecera.formato not in self._limites.formatos:
            permitidos = ", ".join(sorted(self._limites.formatos))
            raise ImagenInvalida(f"Formato de imagen no permitido: {cabecera.formato}. Se aceptan {permitidos}.")
        if cabecera.pixeles > self._limites.max_pixeles:
            raise ImagenDemasiadoGrande(
                f"La imagen tiene {cabecera.ancho}x{cabecera.alto} píxeles y el máximo es "
                f"{self._limites.max_pixeles} píxeles en total."
            )

        imagen = self._decodificador.decodificar(datos)
        return Detecciones.de(self._modelo.version, self._modelo.detectar(imagen))
