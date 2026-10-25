"""Adaptador de ``ModeloDeDeteccion`` con onnxruntime en CPU (RF-DETR Nano exportado a ONNX).

Tres responsabilidades, cada una en su función para probarla sin pesos:

- ``preprocesar``: la misma entrada que ``RFDETR.predict()`` (rfdetr 1.11):
  redimensión bilineal a ``resolucion x resolucion`` con centros de medio píxel
  y **sin antialias**, y normalización con la media y desviación de ImageNet.
  No se usa ``PIL.Image.resize``: su bilineal aplica antialias al reducir y
  cambia las confianzas (lo advierte el propio rfdetr). La paridad con PyTorch
  la mide ``scripts/exportar_onnx.py``.
- ``decodificar``: igual que ``PostProcess`` de rfdetr: sigmoide por clase, se
  quita la ranura de fondo, se toman los 300 mejores pares consulta/clase y se
  pasan las cajas ``cxcywh`` normalizadas a píxeles ``xyxy``. Después se aplica
  el **mapeo a las clases de la app** (``ETIQUETA_A_CLASE``) y se descarta lo
  que no mapea.
- ``OnnxModelo``: carga el ``.onnx``, comprueba su hash contra ``modelo.json`` y
  corre la sesión con un número fijo de hilos.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# El onnxruntime 1.31 de PyPI para Linux trae telemetría 1DS que se envía a
# Microsoft (mobile.events.data.microsoft.com) salvo que se apague. La variable
# solo vale si existe cuando el motor se inicializa, así que va antes del import
# (docs/Privacy.md de onnxruntime). El Dockerfile también la fija.
os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402

from app.domain.deteccion import Caja, ClaseDano, Deteccion, VersionModelo  # noqa: E402
from app.domain.errores import ErrorDeInferencia  # noqa: E402
from app.domain.imagen import ImagenRGB  # noqa: E402

ort.disable_telemetry_events()  # además, apaga los eventos no esenciales por la API

registro = logging.getLogger("inferencia.modelo")

ETIQUETA_A_CLASE: Mapping[str, ClaseDano] = {
    "pothole": ClaseDano.BACHE,  # D40 de RDD2022
    "longitudinal_crack": ClaseDano.GRIETA,  # D00
    "transverse_crack": ClaseDano.GRIETA,  # D10
    "alligator_crack": ClaseDano.GRIETA,  # D20 (piel de cocodrilo)
}
"""Etiquetas del modelo → clases de la app (decisión del 21/10, opción A). Una etiqueta que no
está aquí se descarta: el contrato solo habla de ``bache`` y ``grieta``."""

MEDIA_IMAGENET = np.array([0.485, 0.456, 0.406], dtype=np.float32)
DESVIACION_IMAGENET = np.array([0.229, 0.224, 0.225], dtype=np.float32)
MAX_PARES = 300
"""Pares consulta/clase que se ordenan antes del piso de confianza (``num_select`` de RF-DETR)."""

ARCHIVO_METADATOS = "modelo.json"


class ErrorDeCargaDelModelo(RuntimeError):
    """El modelo no se puede cargar: falta, está incompleto, su hash no coincide o su forma no es la esperada.

    Es un error de despliegue, no de una solicitud: impide que el servicio arranque.
    """


@dataclass(frozen=True, slots=True)
class MetadatosModelo:
    """Lo que ``scripts/exportar_onnx.py`` deja en ``modelo.json`` junto al ``.onnx``."""

    version: VersionModelo
    archivo: str
    sha256: str
    resolucion: int
    entrada: str
    salida_cajas: str
    salida_logits: str
    etiquetas: tuple[str, ...]
    indice_fondo: int | None

    def __post_init__(self) -> None:
        # La columna i de los logits es etiquetas[i] y el fondo, si existe, va al final (como en
        # rfdetr). Una exportación que lo mueva cruzaría bache y grieta en silencio: no arranca.
        if self.indice_fondo is not None and self.indice_fondo != len(self.etiquetas):
            raise ErrorDeCargaDelModelo(
                f"indice_fondo debe ser la última columna ({len(self.etiquetas)}) o null, y es {self.indice_fondo}"
            )

    @classmethod
    def desde_dict(cls, datos: Mapping[str, Any]) -> MetadatosModelo:
        try:
            salidas = datos["salidas"]
            return cls(
                version=VersionModelo(datos["version"]),
                archivo=str(datos["archivo"]),
                sha256=str(datos["sha256"]).lower(),
                resolucion=int(datos["resolucion"]),
                entrada=str(datos["entrada"]["nombre"]),
                salida_cajas=str(salidas["cajas"]),
                salida_logits=str(salidas["logits"]),
                etiquetas=tuple(str(e) for e in datos["etiquetas"]),
                indice_fondo=None if datos.get("indice_fondo") is None else int(datos["indice_fondo"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ErrorDeCargaDelModelo(f"{ARCHIVO_METADATOS} está incompleto o mal formado: {error}") from error


# --------------------------------------------------------------------------- preprocesado


def redimensionar_bilineal(rgb: np.ndarray, alto: int, ancho: int) -> np.ndarray:
    """Bilineal sin antialias, centros de medio píxel (``F.interpolate(align_corners=False)``).

    Recibe ``(H, W, 3)`` en ``uint8`` y devuelve ``(alto, ancho, 3)`` en ``float32`` dentro de [0, 1].
    Primero toma solo las filas que hacen falta (en ``uint8``, barato aunque la foto sea grande) y
    después interpola.
    """
    alto_origen, ancho_origen = rgb.shape[:2]
    y = (np.arange(alto, dtype=np.float32) + 0.5) * (alto_origen / alto) - 0.5
    x = (np.arange(ancho, dtype=np.float32) + 0.5) * (ancho_origen / ancho) - 0.5
    y = np.clip(y, 0.0, alto_origen - 1)
    x = np.clip(x, 0.0, ancho_origen - 1)
    y0 = np.floor(y).astype(np.intp)
    x0 = np.floor(x).astype(np.intp)
    y1 = np.minimum(y0 + 1, alto_origen - 1)
    x1 = np.minimum(x0 + 1, ancho_origen - 1)
    dy = (y - y0)[:, None, None]
    dx = (x - x0)[None, :, None]

    arriba = rgb[y0].astype(np.float32) / 255.0  # (alto, W, 3)
    abajo = rgb[y1].astype(np.float32) / 255.0
    filas = (1 - dy) * arriba + dy * abajo
    return ((1 - dx) * filas[:, x0] + dx * filas[:, x1]).astype(np.float32, copy=False)


def preprocesar(imagen: ImagenRGB, resolucion: int) -> np.ndarray:
    """``ImagenRGB`` → tensor ``(1, 3, resolucion, resolucion)`` ``float32`` normalizado (NCHW)."""
    rgb = np.frombuffer(imagen.pixeles, dtype=np.uint8).reshape(imagen.alto, imagen.ancho, 3)
    redimensionada = redimensionar_bilineal(rgb, resolucion, resolucion)
    normalizada = (redimensionada - MEDIA_IMAGENET) / DESVIACION_IMAGENET
    return np.ascontiguousarray(normalizada.transpose(2, 0, 1)[None], dtype=np.float32)


# --------------------------------------------------------------------------- decodificación


@dataclass(frozen=True, slots=True)
class ParCrudo:
    """Un par consulta/clase del modelo antes del mapeo (lo usa también la verificación de paridad)."""

    consulta: int
    columna: int
    confianza: float
    xyxy: tuple[float, float, float, float]


def pares_crudos(
    cajas: np.ndarray,
    logits: np.ndarray,
    ancho: int,
    alto: int,
    *,
    indice_fondo: int | None,
    confianza_minima: float,
    max_pares: int = MAX_PARES,
) -> list[ParCrudo]:
    """Igual que ``PostProcess`` de rfdetr para una imagen: ``cajas (Q, 4)`` y ``logits (Q, C)``."""
    puntajes = 1.0 / (1.0 + np.exp(-np.clip(logits.astype(np.float64), -88, 88)))
    columnas = np.arange(puntajes.shape[1])
    if indice_fondo is not None:
        columnas = columnas[columnas != indice_fondo % puntajes.shape[1]]
    candidatos = puntajes[:, columnas]
    plano = candidatos.reshape(-1)
    # Orden estable: mayor puntaje primero y, a igual puntaje, menor índice (como rfdetr).
    orden = np.argsort(-plano, kind="stable")[:max_pares]
    orden = orden[plano[orden] >= confianza_minima]
    consultas, posiciones = np.divmod(orden, candidatos.shape[1])

    cx, cy, w, h = cajas[consultas].astype(np.float64).T
    escala = np.array([ancho, alto, ancho, alto], dtype=np.float64)
    xyxy = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1) * escala
    xyxy = np.clip(xyxy, 0.0, escala)
    return [
        ParCrudo(int(q), int(columnas[p]), float(plano[i]), tuple(float(v) for v in caja))
        for q, p, i, caja in zip(consultas, posiciones, orden, xyxy, strict=True)
    ]


def decodificar(
    cajas: np.ndarray,
    logits: np.ndarray,
    ancho: int,
    alto: int,
    *,
    etiquetas: Sequence[str],
    indice_fondo: int | None,
    confianza_minima: float,
    max_detecciones: int,
) -> list[Deteccion]:
    """Pares crudos → detecciones de la app.

    Una consulta del DETR puede puntuar en dos etiquetas que van a la misma clase
    (p. ej. grieta longitudinal y transversal sobre la misma caja): se deja una
    sola detección por consulta y clase, la de mayor confianza. No cambia el
    máximo por clase con el que decide el backend.
    """
    detecciones: list[Deteccion] = []
    vistos: set[tuple[int, ClaseDano]] = set()
    for par in pares_crudos(
        cajas, logits, ancho, alto, indice_fondo=indice_fondo, confianza_minima=confianza_minima
    ):
        etiqueta = etiquetas[par.columna] if par.columna < len(etiquetas) else None
        clase = ETIQUETA_A_CLASE.get(etiqueta) if etiqueta else None
        if clase is None or (par.consulta, clase) in vistos:
            continue
        vistos.add((par.consulta, clase))
        detecciones.append(Deteccion(clase=clase, confianza=min(par.confianza, 1.0), caja=Caja(*par.xyxy)))
        if len(detecciones) == max_detecciones:
            break
    return detecciones


# --------------------------------------------------------------------------- sesión


def sha256_de(ruta: Path) -> str:
    resumen = hashlib.sha256()
    with ruta.open("rb") as archivo:
        for bloque in iter(lambda: archivo.read(1024 * 1024), b""):
            resumen.update(bloque)
    return resumen.hexdigest()


def opciones_de_sesion(hilos: int) -> ort.SessionOptions:
    """Hilos fijos: con el mismo número de hilos, la misma foto da las mismas detecciones (D-08)."""
    opciones = ort.SessionOptions()
    opciones.intra_op_num_threads = hilos
    opciones.inter_op_num_threads = 1
    opciones.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    opciones.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opciones.log_severity_level = 3  # solo errores
    return opciones


class OnnxModelo:
    """``ModeloDeDeteccion`` sobre una ``ort.InferenceSession`` en CPU.

    Las inferencias se **serializan** con un candado: cada una ya usa todos los
    hilos configurados, y dos a la vez solo se reparten la CPU y suben la
    memoria. Las solicitudes concurrentes esperan su turno.
    """

    def __init__(
        self,
        sesion: ort.InferenceSession,
        metadatos: MetadatosModelo,
        *,
        confianza_minima: float,
        max_detecciones: int,
    ) -> None:
        self._sesion = sesion
        self._metadatos = metadatos
        self._confianza_minima = confianza_minima
        self._max_detecciones = max_detecciones
        self._candado = threading.Lock()
        self._validar_forma()

    @classmethod
    def cargar(
        cls, directorio: Path, *, hilos: int, confianza_minima: float, max_detecciones: int
    ) -> OnnxModelo:
        ruta_metadatos = Path(directorio) / ARCHIVO_METADATOS
        if not ruta_metadatos.is_file():
            raise ErrorDeCargaDelModelo(
                f"No existe {ruta_metadatos}. Genera el modelo con scripts/exportar_onnx.py (README, «Obtener el modelo»)."
            )
        try:
            datos = json.loads(ruta_metadatos.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise ErrorDeCargaDelModelo(f"No se pudo leer {ruta_metadatos}: {error}") from error
        metadatos = MetadatosModelo.desde_dict(datos)

        ruta_onnx = Path(directorio) / metadatos.archivo
        if not ruta_onnx.is_file():
            raise ErrorDeCargaDelModelo(
                f"No existe {ruta_onnx}. Los pesos no se versionan: genera el .onnx con scripts/exportar_onnx.py."
            )
        hash_real = sha256_de(ruta_onnx)
        if hash_real != metadatos.sha256:
            raise ErrorDeCargaDelModelo(
                f"El hash de {ruta_onnx.name} ({hash_real}) no coincide con {ARCHIVO_METADATOS} ({metadatos.sha256}). "
                "El archivo no es el que se exportó y registró; vuelve a exportarlo."
            )

        sesion = ort.InferenceSession(
            str(ruta_onnx), sess_options=opciones_de_sesion(hilos), providers=["CPUExecutionProvider"]
        )
        return cls(sesion, metadatos, confianza_minima=confianza_minima, max_detecciones=max_detecciones)

    @property
    def version(self) -> VersionModelo:
        return self._metadatos.version

    @property
    def metadatos(self) -> MetadatosModelo:
        return self._metadatos

    def detectar(self, imagen: ImagenRGB) -> list[Deteccion]:
        cajas, logits = self.inferir(preprocesar(imagen, self._metadatos.resolucion))
        return decodificar(
            cajas,
            logits,
            imagen.ancho,
            imagen.alto,
            etiquetas=self._metadatos.etiquetas,
            indice_fondo=self._metadatos.indice_fondo,
            confianza_minima=self._confianza_minima,
            max_detecciones=self._max_detecciones,
        )

    def inferir(self, tensor: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Salidas crudas de una imagen: ``cajas (Q, 4)`` y ``logits (Q, C)``."""
        m = self._metadatos
        try:
            with self._candado:
                cajas, logits = self._sesion.run([m.salida_cajas, m.salida_logits], {m.entrada: tensor})
        except Exception as error:  # noqa: BLE001 (cualquier fallo del motor es un ErrorDeInferencia)
            raise ErrorDeInferencia(f"onnxruntime falló: {error}") from error
        return cajas[0], logits[0]

    def _validar_forma(self) -> None:
        m = self._metadatos
        entradas = {e.name: e.shape for e in self._sesion.get_inputs()}
        salidas = {s.name: s.shape for s in self._sesion.get_outputs()}
        esperada = [1, 3, m.resolucion, m.resolucion]
        if entradas.get(m.entrada) != esperada:
            raise ErrorDeCargaDelModelo(f"La entrada {m.entrada!r} debía ser {esperada} y es {entradas}")
        if m.salida_cajas not in salidas or m.salida_logits not in salidas:
            raise ErrorDeCargaDelModelo(f"El modelo no tiene las salidas {m.salida_cajas!r} y {m.salida_logits!r}: {salidas}")
        columnas = salidas[m.salida_logits][-1]
        esperadas = len(m.etiquetas) + (0 if m.indice_fondo is None else 1)
        if isinstance(columnas, int) and columnas != esperadas:
            raise ErrorDeCargaDelModelo(
                f"La salida {m.salida_logits!r} tiene {columnas} clases y modelo.json declara {esperadas}"
            )
        sin_mapeo = [e for e in m.etiquetas if e not in ETIQUETA_A_CLASE]
        if len(sin_mapeo) == len(m.etiquetas):
            raise ErrorDeCargaDelModelo(f"Ninguna etiqueta del modelo mapea a bache o grieta: {m.etiquetas}")
        if sin_mapeo:
            registro.warning("Etiquetas del modelo sin clase de la app (se descartan): %s", sin_mapeo)
