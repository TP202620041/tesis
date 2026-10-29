"""Adaptador de ``ModeloDeModeracion`` con onnxruntime en CPU (Marqo ``nsfw-image-detection-384`` en ONNX).

El modelo es un ViT-Tiny de timm (``vit_tiny_patch16_384``) afinado como clasificador
``["NSFW", "SFW"]``. Cuatro piezas, cada una en su función para probarla sin pesos:

- ``geometria_de_recortes``: a qué tamaño se redimensiona la foto y dónde van los
  **dos recortes de 384** que cubren todo el lado mayor (decisión del 28/10).
- ``redimensionar`` y ``normalizar``: el preprocesado de evaluación de timm para este
  modelo (``Resize(384)`` bicúbico de Pillow sobre el lado menor, ``ToTensor`` y
  normalización 0,5/0,5). La paridad con timm la mide ``scripts/exportar_moderacion.py``.
- ``probabilidad``: softmax estable de los logits y la columna de la etiqueta positiva.
- ``OnnxModeracion``: carga el ``.onnx``, comprueba su hash contra ``moderacion.json``
  y corre la sesión con un número fijo de hilos y su **propio candado**, así que una
  moderación nunca espera detrás de RF-DETR.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Igual que en onnx_modelo.py: la telemetría de onnxruntime se apaga antes de importarlo.
os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
from PIL import Image  # noqa: E402

from app.domain.deteccion import VersionModelo  # noqa: E402
from app.domain.errores import ErrorDeInferencia  # noqa: E402
from app.domain.imagen import ImagenRGB  # noqa: E402
from app.infrastructure.onnx_modelo import ErrorDeCargaDelModelo, opciones_de_sesion, sha256_de  # noqa: E402

registro = logging.getLogger("inferencia.moderacion")

ARCHIVO_METADATOS_MODERACION = "moderacion.json"
ETIQUETA_POSITIVA = "NSFW"
"""La columna cuyo valor se devuelve como ``puntaje`` (contenido sexual explícito)."""

MEDIA = np.array([0.5, 0.5, 0.5], dtype=np.float32)
DESVIACION = np.array([0.5, 0.5, 0.5], dtype=np.float32)
"""Normalización del ``pretrained_cfg`` del modelo (la de ``augreg_in21k_ft_in1k`` de timm)."""

RECORTES = 2
"""Recortes por foto (decisión del 28/10): el primero y el último a lo largo del lado mayor."""


@dataclass(frozen=True, slots=True)
class GeometriaDeRecortes:
    """Tamaño al que se redimensiona la foto y esquina superior izquierda ``(x, y)`` de cada recorte."""

    ancho: int
    alto: int
    origenes: tuple[tuple[int, int], ...]


def geometria_de_recortes(ancho: int, alto: int, resolucion: int) -> GeometriaDeRecortes:
    """Dos recortes de ``resolucion`` que cubren todo el lado mayor.

    - Como ``transforms.Resize(resolucion)`` de torchvision (el de timm con
      ``crop_pct`` 1,0): el lado menor pasa a ``resolucion`` y el mayor a
      ``int(resolucion * mayor / menor)``, con la proporción intacta.
    - En vez del recorte central de timm (que en una foto 4:3 deja fuera el 12,5 %
      de cada lado), un recorte al principio y otro al final del lado mayor. Hasta
      2:1 (4:3, 16:9) se solapan o se tocan y cubren toda la foto.
    - Una foto **más alargada que 2:1** (una panorámica) no cabría en dos recortes:
      su lado mayor se comprime a ``2 * resolucion`` para que los dos sigan cubriendo
      todo. Deforma la foto (en la proporción / 2), pero nada queda sin analizar y el
      costo no crece con la proporción.
    - Una foto cuadrada da un solo recorte (los dos coincidirían).
    """
    if ancho <= 0 or alto <= 0 or resolucion <= 0:
        raise ValueError(f"Dimensiones inválidas: {ancho}x{alto} a {resolucion}")
    menor, mayor = (ancho, alto) if ancho <= alto else (alto, ancho)
    nuevo_mayor = min(int(resolucion * mayor / menor), RECORTES * resolucion)
    desplazamientos = sorted({0, nuevo_mayor - resolucion})
    if ancho <= alto:
        return GeometriaDeRecortes(resolucion, nuevo_mayor, tuple((0, d) for d in desplazamientos))
    return GeometriaDeRecortes(nuevo_mayor, resolucion, tuple((d, 0) for d in desplazamientos))


def redimensionar(imagen: ImagenRGB, geometria: GeometriaDeRecortes) -> np.ndarray:
    """Bicúbico de Pillow al tamaño de la geometría: ``(alto, ancho, 3)`` en ``uint8``.

    Es la misma llamada que hace torchvision con una imagen de Pillow
    (``Image.resize(..., BICUBIC)``, con antialias al reducir). Si el tamaño ya es
    el pedido, no se toca, como torchvision.

    ``frombuffer`` comparte la memoria de ``imagen.pixeles`` (solo lectura) en vez de
    copiarla: con una foto de 16 MP son 48 MB menos por moderación en curso.
    """
    pil = Image.frombuffer("RGB", (imagen.ancho, imagen.alto), imagen.pixeles, "raw", "RGB", 0, 1)
    if pil.size != (geometria.ancho, geometria.alto):
        pil = pil.resize((geometria.ancho, geometria.alto), Image.Resampling.BICUBIC)
    return np.asarray(pil, dtype=np.uint8)


def normalizar(recorte: np.ndarray) -> np.ndarray:
    """``(H, W, 3)`` ``uint8`` → ``(1, 3, H, W)`` ``float32``: ``ToTensor`` (/255) y ``Normalize(0,5, 0,5)``."""
    tensor = (recorte.astype(np.float32) / np.float32(255.0) - MEDIA) / DESVIACION
    return np.ascontiguousarray(tensor.transpose(2, 0, 1)[None], dtype=np.float32)


def recortes(imagen: ImagenRGB, resolucion: int) -> list[np.ndarray]:
    """``ImagenRGB`` → un tensor ``(1, 3, resolucion, resolucion)`` por recorte."""
    geometria = geometria_de_recortes(imagen.ancho, imagen.alto, resolucion)
    rgb = redimensionar(imagen, geometria)
    return [normalizar(rgb[y : y + resolucion, x : x + resolucion]) for x, y in geometria.origenes]


def probabilidad(logits: np.ndarray, indice: int) -> float:
    """Softmax estable (en ``float64``) de un vector de logits; devuelve la columna ``indice``."""
    z = np.asarray(logits, dtype=np.float64).reshape(-1)
    if not np.all(np.isfinite(z)):
        raise ErrorDeInferencia(f"El modelo devolvió logits no finitos: {z.tolist()}")
    e = np.exp(z - z.max())
    return float(min(max(e[indice] / e.sum(), 0.0), 1.0))


@dataclass(frozen=True, slots=True)
class MetadatosModeracion:
    """Lo que ``scripts/exportar_moderacion.py`` deja en ``moderacion.json`` junto al ``.onnx``."""

    version: VersionModelo
    archivo: str
    sha256: str
    resolucion: int
    entrada: str
    salida: str
    etiquetas: tuple[str, ...]

    def __post_init__(self) -> None:
        if ETIQUETA_POSITIVA not in self.etiquetas:
            raise ErrorDeCargaDelModelo(
                f"{ARCHIVO_METADATOS_MODERACION} no declara la etiqueta {ETIQUETA_POSITIVA!r}: {self.etiquetas}"
            )
        if len(set(self.etiquetas)) != len(self.etiquetas):
            raise ErrorDeCargaDelModelo(f"Etiquetas repetidas en {ARCHIVO_METADATOS_MODERACION}: {self.etiquetas}")

    @property
    def indice_positivo(self) -> int:
        return self.etiquetas.index(ETIQUETA_POSITIVA)

    @classmethod
    def desde_dict(cls, datos: Mapping[str, Any]) -> MetadatosModeracion:
        try:
            return cls(
                version=VersionModelo(datos["version"]),
                archivo=str(datos["archivo"]),
                sha256=str(datos["sha256"]).lower(),
                resolucion=int(datos["resolucion"]),
                entrada=str(datos["entrada"]["nombre"]),
                salida=str(datos["salida"]["nombre"]),
                etiquetas=tuple(str(e) for e in datos["etiquetas"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ErrorDeCargaDelModelo(
                f"{ARCHIVO_METADATOS_MODERACION} está incompleto o mal formado: {error}"
            ) from error


class OnnxModeracion:
    """``ModeloDeModeracion`` sobre una ``ort.InferenceSession`` en CPU.

    El preprocesado de una foto va fuera del candado; las inferencias de sus
    recortes van juntas dentro, así que dos moderaciones no se intercalan. El
    candado es **propio**: no comparte turno con ``OnnxModelo`` (RF-DETR).
    """

    def __init__(self, sesion: ort.InferenceSession, metadatos: MetadatosModeracion) -> None:
        self._sesion = sesion
        self._metadatos = metadatos
        self._candado = threading.Lock()
        self._validar_forma()

    @classmethod
    def cargar(cls, directorio: Path, *, hilos: int) -> OnnxModeracion:
        ruta_metadatos = Path(directorio) / ARCHIVO_METADATOS_MODERACION
        if not ruta_metadatos.is_file():
            raise ErrorDeCargaDelModelo(
                f"No existe {ruta_metadatos}. Genera el modelo con scripts/exportar_moderacion.py "
                "(README, «Obtener el modelo»)."
            )
        try:
            datos = json.loads(ruta_metadatos.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise ErrorDeCargaDelModelo(f"No se pudo leer {ruta_metadatos}: {error}") from error
        metadatos = MetadatosModeracion.desde_dict(datos)

        ruta_onnx = Path(directorio) / metadatos.archivo
        if not ruta_onnx.is_file():
            raise ErrorDeCargaDelModelo(
                f"No existe {ruta_onnx}. Los pesos no se versionan: genera el .onnx con scripts/exportar_moderacion.py."
            )
        hash_real = sha256_de(ruta_onnx)
        if hash_real != metadatos.sha256:
            raise ErrorDeCargaDelModelo(
                f"El hash de {ruta_onnx.name} ({hash_real}) no coincide con {ARCHIVO_METADATOS_MODERACION} "
                f"({metadatos.sha256}). El archivo no es el que se exportó y registró; vuelve a exportarlo."
            )

        sesion = ort.InferenceSession(
            str(ruta_onnx), sess_options=opciones_de_sesion(hilos), providers=["CPUExecutionProvider"]
        )
        return cls(sesion, metadatos)

    @property
    def version(self) -> VersionModelo:
        return self._metadatos.version

    @property
    def metadatos(self) -> MetadatosModeracion:
        return self._metadatos

    def moderar(self, imagen: ImagenRGB) -> float:
        return max(self.puntajes_por_recorte(imagen))

    def puntajes_por_recorte(self, imagen: ImagenRGB) -> list[float]:
        """Probabilidad de la etiqueta positiva en cada recorte, en el orden de ``geometria_de_recortes``."""
        tensores = recortes(imagen, self._metadatos.resolucion)
        logits = self.inferir(tensores)
        return [probabilidad(fila, self._metadatos.indice_positivo) for fila in logits]

    def inferir(self, tensores: Sequence[np.ndarray]) -> list[np.ndarray]:
        """Logits crudos ``(C,)`` de cada tensor ``(1, 3, R, R)``, de a uno y bajo el candado."""
        m = self._metadatos
        try:
            with self._candado:
                return [self._sesion.run([m.salida], {m.entrada: t})[0][0] for t in tensores]
        except Exception as error:  # noqa: BLE001 (cualquier fallo del motor es un ErrorDeInferencia)
            raise ErrorDeInferencia(f"onnxruntime falló al moderar: {error}") from error

    def _validar_forma(self) -> None:
        m = self._metadatos
        entradas = {e.name: e.shape for e in self._sesion.get_inputs()}
        salidas = {s.name: s.shape for s in self._sesion.get_outputs()}
        esperada = [1, 3, m.resolucion, m.resolucion]
        if entradas.get(m.entrada) != esperada:
            raise ErrorDeCargaDelModelo(f"La entrada {m.entrada!r} debía ser {esperada} y es {entradas}")
        if m.salida not in salidas:
            raise ErrorDeCargaDelModelo(f"El modelo de moderación no tiene la salida {m.salida!r}: {salidas}")
        if salidas[m.salida] != [1, len(m.etiquetas)]:
            raise ErrorDeCargaDelModelo(
                f"La salida {m.salida!r} debía ser [1, {len(m.etiquetas)}] y es {salidas[m.salida]}"
            )
        registro.debug("Modelo de moderación %s con etiquetas %s", m.version, m.etiquetas)
