"""Imágenes sintéticas deterministas: «calzadas» de ruido gris con manchas y trazos oscuros.

Las usan ``exportar_onnx.py`` (paridad ONNX/PyTorch y huella de referencia en
``modelo.json``) y el test de integración con el modelo real. Se generan con
código, así que no hay en el repo fotos de terceros ni de licencia dudosa.
Solo dependen de NumPy y Pillow.
"""

from __future__ import annotations

from collections.abc import Iterator

import numpy as np
from PIL import Image, ImageDraw

SEMILLA = 20261025
TAMANOS = ((384, 384), (640, 480), (1024, 768), (2048, 1536), (1080, 1920), (517, 293))
"""Cuadrada, 4:3 (la de las fotos del backend, hasta 2048 px), vertical y una proporción rara."""


def imagenes_sinteticas() -> Iterator[tuple[str, Image.Image]]:
    generador = np.random.default_rng(SEMILLA)
    for ancho, alto in TAMANOS:
        ruido = generador.integers(70, 150, size=(alto, ancho, 1), dtype=np.uint8).repeat(3, axis=2)
        imagen = Image.fromarray(ruido, "RGB")
        dibujo = ImageDraw.Draw(imagen)
        for _ in range(6):
            x, y = int(generador.integers(0, ancho)), int(generador.integers(0, alto))
            r = int(generador.integers(10, max(11, min(ancho, alto) // 6)))
            dibujo.ellipse((x - r, y - r // 2, x + r, y + r // 2), fill=(25, 25, 25))
            dibujo.line((x, y, x + r * 3, y + int(generador.integers(-r, r))), fill=(40, 40, 40), width=3)
        yield f"sintetica-{ancho}x{alto}", imagen
