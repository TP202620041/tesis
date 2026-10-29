"""Validación previa de la foto, común a ``detectar`` y ``moderar`` (ARCHITECTURE.md §6, D-15)."""

from __future__ import annotations

from app.domain.errores import ImagenDemasiadoGrande, ImagenInvalida
from app.domain.imagen import ImagenRGB, LimitesDeImagen
from app.domain.puertos import DecodificadorDeImagen


class ValidacionDeImagen:
    """Valida el archivo recibido y lo decodifica a RGB orientado.

    El orden importa: primero lo barato y seguro (bytes, cabecera sin
    decodificar) y recién después la decodificación, para que un archivo
    hostil no llegue a ocupar memoria ni CPU:

    1. Bytes: vacío → ``ImagenInvalida``; más de ``max_bytes`` → ``ImagenDemasiadoGrande``.
    2. Cabecera sin decodificar: formato no permitido → ``ImagenInvalida``; más de
       ``max_pixeles`` → ``ImagenDemasiadoGrande`` (bomba de descompresión).
    3. Decodificar a RGB orientado.

    Los dos endpoints la comparten, así que responden los mismos errores a la misma foto.
    """

    def __init__(self, decodificador: DecodificadorDeImagen, limites: LimitesDeImagen) -> None:
        self._decodificador = decodificador
        self._limites = limites

    @property
    def limites(self) -> LimitesDeImagen:
        return self._limites

    def __call__(self, datos: bytes) -> ImagenRGB:
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

        return self._decodificador.decodificar(datos)
