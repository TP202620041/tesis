"""Imágenes sintéticas deterministas: «calzadas» de ruido gris con manchas y trazos oscuros.

Las usan ``exportar_onnx.py`` y ``exportar_moderacion.py`` (paridad con PyTorch y
timm, y huella de referencia en ``modelo.json`` y ``moderacion.json``) y el test de
integración con los modelos reales. Se generan con
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

TAMANOS_MODERACION = (*TAMANOS, (1600, 400), (300, 1200))
"""Las mismas más dos más alargadas que 2:1 (apaisada y vertical), que la moderación comprime antes
de recortar (``geometria_de_recortes``). Van al final: las seis primeras no cambian."""


def imagenes_sinteticas(tamanos: tuple[tuple[int, int], ...] = TAMANOS) -> Iterator[tuple[str, Image.Image]]:
    generador = np.random.default_rng(SEMILLA)
    for ancho, alto in tamanos:
        ruido = generador.integers(70, 150, size=(alto, ancho, 1), dtype=np.uint8).repeat(3, axis=2)
        imagen = Image.fromarray(ruido, "RGB")
        dibujo = ImageDraw.Draw(imagen)
        for _ in range(6):
            x, y = int(generador.integers(0, ancho)), int(generador.integers(0, alto))
            r = int(generador.integers(10, max(11, min(ancho, alto) // 6)))
            dibujo.ellipse((x - r, y - r // 2, x + r, y + r // 2), fill=(25, 25, 25))
            dibujo.line((x, y, x + r * 3, y + int(generador.integers(-r, r))), fill=(40, 40, 40), width=3)
        yield f"sintetica-{ancho}x{alto}", imagen


def imagenes_de_color() -> Iterator[tuple[str, Image.Image]]:
    """Degradados y elipses de colores cálidos, sin ningún motivo real.

    Solo sirven para que la paridad y la huella de la moderación (``moderacion.json``)
    cubran más que el gris de las «calzadas»: mueven los logits del modelo lejos del
    piso. No son ni pretenden ser contenido de ninguna clase.
    """
    generador = np.random.default_rng(SEMILLA + 1)
    for ancho, alto in ((640, 480), (480, 640), (800, 800)):
        y, x = np.mgrid[0:alto, 0:ancho]
        base = np.stack(
            [
                170 + 60 * np.sin(x / ancho * np.pi),
                120 + 50 * np.cos(y / alto * np.pi),
                90 + 40 * np.sin((x + y) / (ancho + alto) * np.pi),
            ],
            axis=2,
        )
        imagen = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
        dibujo = ImageDraw.Draw(imagen)
        for _ in range(5):
            cx, cy = int(generador.integers(0, ancho)), int(generador.integers(0, alto))
            r = int(generador.integers(min(ancho, alto) // 10, min(ancho, alto) // 3))
            color = tuple(int(c) for c in generador.integers((150, 90, 60), (250, 190, 160)))
            dibujo.ellipse((cx - r, cy - r * 2 // 3, cx + r, cy + r * 2 // 3), fill=color)
        yield f"color-{ancho}x{alto}", imagen
