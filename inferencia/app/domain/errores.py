"""Errores del dominio. Solo ``app.api.errores`` los traduce a HTTP."""


class ErrorDeDominio(Exception):
    """Base de los errores esperados del servicio; el mensaje se muestra al cliente."""


class ImagenInvalida(ErrorDeDominio):
    """El archivo está vacío, no es una imagen, está dañado o su formato no está permitido."""


class ImagenDemasiadoGrande(ErrorDeDominio):
    """El archivo supera el máximo de bytes o la imagen el máximo de píxeles."""


class ErrorDeInferencia(ErrorDeDominio):
    """El modelo falló al analizar una imagen válida (error del servicio, no del cliente)."""
