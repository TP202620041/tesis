"""Un ``.onnx`` sintético con la interfaz de RF-DETR (entrada ``input``, salidas ``dets`` y ``labels``).

Sus salidas son constantes conocidas, así se prueba el adaptador completo
(hash, sesión, forma, preprocesado, decodificación y mapeo) sin los pesos reales.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

RESOLUCION = 32
CONSULTAS = 4
ETIQUETAS = ["longitudinal_crack", "transverse_crack", "alligator_crack", "pothole"]


def _logit(p: float) -> float:
    return float(np.log(p / (1 - p)))


def salidas_conocidas() -> tuple[np.ndarray, np.ndarray]:
    """4 consultas × 5 columnas (4 etiquetas + fondo). Cajas ``cxcywh`` normalizadas."""
    cajas = np.array(
        [
            [0.5, 0.5, 0.2, 0.4],  # bache 0,90
            [0.25, 0.25, 0.1, 0.1],  # grieta longitudinal 0,60 y transversal 0,70 (misma consulta)
            [0.9, 0.9, 0.4, 0.4],  # se sale de la imagen: se recorta
            [0.1, 0.1, 0.1, 0.1],  # solo fondo alto: se descarta
        ],
        dtype=np.float32,
    )
    probabilidades = np.full((CONSULTAS, 5), 0.01)
    probabilidades[0, 3] = 0.90
    probabilidades[1, 0] = 0.60
    probabilidades[1, 1] = 0.70
    probabilidades[2, 2] = 0.30
    probabilidades[3, 4] = 0.99  # ranura de fondo
    logits = np.vectorize(_logit)(probabilidades).astype(np.float32)
    return cajas, logits


def escribir_modelo(directorio: Path, *, resolucion_declarada: int = RESOLUCION, sha256: str | None = None) -> Path:
    cajas, logits = salidas_conocidas()
    # La entrada se usa (ReduceMean * 0) para que el grafo dependa de ella como el real.
    nodos = [
        helper.make_node("ReduceMean", ["input"], ["media"], keepdims=0),
        helper.make_node("Mul", ["media", "cero"], ["nada"]),
        helper.make_node("Add", ["cajas_const", "nada"], ["dets"]),
        helper.make_node("Add", ["logits_const", "nada"], ["labels"]),
    ]
    grafo = helper.make_graph(
        nodos,
        "rfdetr_sintetico",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, RESOLUCION, RESOLUCION])],
        [
            helper.make_tensor_value_info("dets", TensorProto.FLOAT, [1, CONSULTAS, 4]),
            helper.make_tensor_value_info("labels", TensorProto.FLOAT, [1, CONSULTAS, 5]),
        ],
        initializer=[
            numpy_helper.from_array(np.array(0, dtype=np.float32), "cero"),
            numpy_helper.from_array(cajas[None], "cajas_const"),
            numpy_helper.from_array(logits[None], "logits_const"),
        ],
    )
    modelo = helper.make_model(grafo, opset_imports=[helper.make_opsetid("", 17)])
    modelo.ir_version = 9
    onnx.checker.check_model(modelo)

    directorio.mkdir(parents=True, exist_ok=True)
    ruta = directorio / "sintetico.onnx"
    onnx.save(modelo, ruta)
    real = hashlib.sha256(ruta.read_bytes()).hexdigest()
    metadatos = {
        "version": f"sintetico-{real[:8]}",
        "archivo": ruta.name,
        "sha256": sha256 or real,
        "resolucion": resolucion_declarada,
        "entrada": {"nombre": "input"},
        "salidas": {"cajas": "dets", "logits": "labels"},
        "etiquetas": ETIQUETAS,
        "indice_fondo": 4,
    }
    (directorio / "modelo.json").write_text(json.dumps(metadatos), encoding="utf-8")
    return ruta
