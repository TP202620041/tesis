"""Dobles de prueba de los puertos e imágenes sintéticas (sin pesos ni fotos de internet)."""

from __future__ import annotations

import io
from collections.abc import Sequence
from dataclasses import dataclass, field

from PIL import Image, ImageDraw

from app.domain.deteccion import Caja, ClaseDano, Deteccion, VersionModelo
from app.domain.errores import ErrorDeInferencia
from app.domain.imagen import CabeceraDeImagen, ImagenRGB

VERSION_FALSA = VersionModelo("modelo-falso-1")
VERSION_MODERACION_FALSA = VersionModelo("moderacion-falsa-1")


def deteccion(clase: ClaseDano = ClaseDano.BACHE, confianza: float = 0.9, caja=(1.0, 2.0, 30.0, 40.0)) -> Deteccion:
    return Deteccion(clase=clase, confianza=confianza, caja=Caja(*caja))


@dataclass
class ModeloFalso:
    """Devuelve detecciones fijas y registra las imágenes que recibió."""

    respuesta: Sequence[Deteccion] = ()
    falla: bool = False
    version: VersionModelo = VERSION_FALSA
    recibidas: list[ImagenRGB] = field(default_factory=list)

    def detectar(self, imagen: ImagenRGB) -> Sequence[Deteccion]:
        self.recibidas.append(imagen)
        if self.falla:
            raise ErrorDeInferencia("fallo simulado del motor")
        return list(self.respuesta)


@dataclass
class ModeradorFalso:
    """Devuelve un puntaje fijo y registra las imágenes que recibió."""

    puntaje: float = 0.05
    falla: bool = False
    version: VersionModelo = VERSION_MODERACION_FALSA
    recibidas: list[ImagenRGB] = field(default_factory=list)

    def moderar(self, imagen: ImagenRGB) -> float:
        self.recibidas.append(imagen)
        if self.falla:
            raise ErrorDeInferencia("fallo simulado del motor de moderación")
        return self.puntaje


@dataclass
class DecodificadorFalso:
    """Cabecera fija; cuenta cuántas veces se decodificó."""

    cabecera: CabeceraDeImagen = CabeceraDeImagen("JPEG", 4, 3)
    decodificadas: int = 0

    def leer_cabecera(self, datos: bytes) -> CabeceraDeImagen:
        return self.cabecera

    def decodificar(self, datos: bytes) -> ImagenRGB:
        self.decodificadas += 1
        return ImagenRGB(self.cabecera.ancho, self.cabecera.alto, bytes(self.cabecera.ancho * self.cabecera.alto * 3))


def imagen_sintetica(ancho: int = 64, alto: int = 48, formato: str = "JPEG", modo: str = "RGB", **guardar) -> bytes:
    """Una «calzada» gris con una mancha oscura: suficiente para ejercitar el decodificador y el contrato."""
    fondo = (128, 128, 128, 0) if modo == "RGBA" else (128, 128, 128)
    imagen = Image.new(modo, (ancho, alto), fondo)
    dibujo = ImageDraw.Draw(imagen)
    relleno = (30, 30, 30, 255) if modo == "RGBA" else (30, 30, 30)
    dibujo.ellipse((ancho // 4, alto // 4, ancho * 3 // 4, alto * 3 // 4), fill=relleno)
    salida = io.BytesIO()
    imagen.save(salida, format=formato, **guardar)
    return salida.getvalue()
