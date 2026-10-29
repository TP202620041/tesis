"""Un ``.onnx`` sintético con la interfaz del modelo de moderación (entrada ``input``, salida ``logits`` de 2 columnas).

Su salida depende de la entrada de forma conocida: ``logits = [K * m, 0]``, con ``m`` la
media del recorte ya normalizado (entre -1 y 1). La probabilidad de la primera columna
es ``sigmoide(K * m)``: un recorte blanco da ~0,95 y uno negro ~0,05. Así se prueban
los recortes y el máximo sin los pesos reales.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

RESOLUCION = 32
K = 3.0
ETIQUETAS = ["NSFW", "SFW"]


def puntaje_esperado(media_normalizada: float) -> float:
    """Probabilidad de la primera columna para un recorte de esa media (-1 negro, 1 blanco)."""
    return 1.0 / (1.0 + math.exp(-K * media_normalizada))


def escribir_modelo_moderacion(
    directorio: Path,
    *,
    resolucion_declarada: int = RESOLUCION,
    sha256: str | None = None,
    etiquetas: list[str] | None = None,
) -> Path:
    nodos = [
        helper.make_node("ReduceMean", ["input"], ["media"], axes=[1, 2, 3], keepdims=1),  # [1, 1, 1, 1]
        helper.make_node("Reshape", ["media", "forma"], ["media_2d"]),  # [1, 1]
        helper.make_node("Mul", ["media_2d", "k"], ["positivo"]),
        helper.make_node("Mul", ["media_2d", "cero"], ["nada"]),
        helper.make_node("Concat", ["positivo", "nada"], ["logits"], axis=1),  # [1, 2]
    ]
    grafo = helper.make_graph(
        nodos,
        "moderacion_sintetica",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, RESOLUCION, RESOLUCION])],
        [helper.make_tensor_value_info("logits", TensorProto.FLOAT, [1, 2])],
        initializer=[
            numpy_helper.from_array(np.array([1, 1], dtype=np.int64), "forma"),
            numpy_helper.from_array(np.array(K, dtype=np.float32), "k"),
            numpy_helper.from_array(np.array(0, dtype=np.float32), "cero"),
        ],
    )
    modelo = helper.make_model(grafo, opset_imports=[helper.make_opsetid("", 17)])
    modelo.ir_version = 9
    onnx.checker.check_model(modelo)

    directorio.mkdir(parents=True, exist_ok=True)
    ruta = directorio / "moderacion-sintetica.onnx"
    onnx.save(modelo, ruta)
    real = hashlib.sha256(ruta.read_bytes()).hexdigest()
    metadatos = {
        "version": f"moderacion-sintetica-{real[:8]}",
        "archivo": ruta.name,
        "sha256": sha256 or real,
        "resolucion": resolucion_declarada,
        "entrada": {"nombre": "input"},
        "salida": {"nombre": "logits"},
        "etiquetas": etiquetas or ETIQUETAS,
    }
    (directorio / "moderacion.json").write_text(json.dumps(metadatos), encoding="utf-8")
    return ruta
