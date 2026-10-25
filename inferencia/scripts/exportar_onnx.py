"""Descarga los pesos de RF-DETR Nano (RDD2022) de una revisión fija de Hugging Face, los exporta
a ONNX, registra el hash en ``modelos/modelo.json`` y verifica la paridad con PyTorch.

Uso (desde ``inferencia/``, con el entorno de exportación; README, «Obtener el modelo»):

    python scripts/exportar_onnx.py                  # exporta y escribe modelos/modelo.json
    python scripts/exportar_onnx.py --comprobar      # exporta y falla si el hash no es el registrado
    python scripts/exportar_onnx.py --imagenes DIR   # además compara detecciones en fotos reales

``--comprobar`` lo usa el ``Dockerfile``: la imagen solo se construye si el ``.onnx`` que sale es
byte a byte el registrado en ``modelo.json`` (versionado en git).

Los pesos no se versionan (``.gitignore``). Sus fuentes y licencias:

- Pesos: ``dronefreak/rdd2022-rfdetr-nano`` (Apache-2.0), afinados sobre RDD2022.
- Arquitectura y código de exportación: ``rfdetr`` de Roboflow (Apache-2.0).
- Datos de entrenamiento: RDD2022, Arya et al. (imágenes CC BY-SA 4.0).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))  # para importar app.infrastructure (la misma ruta de código que en producción)

REPO_HF = "dronefreak/rdd2022-rfdetr-nano"
REVISION_HF = "66429f39b916e56c6a33243d776718088f5f43ad"  # commit del repo de HF, fijado el 25/10/2026
ARCHIVO_PESOS = "checkpoint_best_total.pth"
SHA256_PESOS = "2d1fba21b829ebc42f7c74f76285d97b2e3295aebe8d97e497d0cc186be98cc9"  # oid LFS de esa revisión
ETIQUETAS_ESPERADAS = ("longitudinal_crack", "transverse_crack", "alligator_crack", "pothole")
NOMBRE = "rdd2022-rfdetr-nano"
OPSET = 17

TOLERANCIA_PREPROCESADO = 1e-4  # diferencia absoluta máxima entre el tensor NumPy y el de torchvision
TOLERANCIA_PUNTAJES = 1e-3  # sigmoide de los logits, ONNX frente a PyTorch
TOLERANCIA_CAJAS = 1e-3  # cajas normalizadas (cx, cy, w, h), ONNX frente a PyTorch
PARES_DE_HUELLA = 10  # pares consulta/clase de PyTorch que se guardan por imagen sintética


def sha256_de(ruta: Path) -> str:
    resumen = hashlib.sha256()
    with ruta.open("rb") as archivo:
        for bloque in iter(lambda: archivo.read(1024 * 1024), b""):
            resumen.update(bloque)
    return resumen.hexdigest()


def descargar_pesos() -> Path:
    from huggingface_hub import hf_hub_download

    ruta = Path(hf_hub_download(REPO_HF, ARCHIVO_PESOS, revision=REVISION_HF))
    real = sha256_de(ruta)
    if real != SHA256_PESOS:
        raise SystemExit(f"El hash de {ARCHIVO_PESOS} ({real}) no es el de la revisión fijada ({SHA256_PESOS}).")
    print(f"Pesos: {REPO_HF}@{REVISION_HF[:7]} ({ruta.stat().st_size} bytes, sha256 verificado)")
    return ruta


def imagenes_de(directorio: Path):
    from PIL import Image

    for ruta in sorted(directorio.iterdir()):
        if ruta.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            with Image.open(ruta) as imagen:
                yield ruta.name, imagen.convert("RGB")


def a_imagen_rgb(imagen):
    from app.domain.imagen import ImagenRGB

    return ImagenRGB(imagen.width, imagen.height, imagen.tobytes())


def verificar_paridad(modelo_torch, sesion, metadatos, imagenes) -> tuple[dict, dict]:
    """(a) preprocesado NumPy frente a torchvision; (b) salidas ONNX frente a PyTorch con la misma entrada.

    Devuelve las cifras de paridad y la **huella de referencia**: los mejores pares
    consulta/clase de PyTorch en cada imagen sintética. El test de integración
    (``tests/test_modelo_real.py``) la compara con lo que da el servicio.
    """
    import numpy as np
    import torch
    import torchvision.transforms.functional as F

    from app.infrastructure.onnx_modelo import DESVIACION_IMAGENET, MEDIA_IMAGENET, pares_crudos, preprocesar

    resolucion = metadatos["resolucion"]
    red = modelo_torch.model.model
    red.eval()
    dif_pre = dif_puntajes = dif_cajas = 0.0
    nombres = []
    huella = {}
    for nombre, imagen in imagenes:
        nuestro = preprocesar(a_imagen_rgb(imagen), resolucion)
        with torch.no_grad():
            t = F.to_tensor(imagen)
            t = F.resize(t, [resolucion, resolucion], antialias=False)
            t = F.normalize(t, MEDIA_IMAGENET.tolist(), DESVIACION_IMAGENET.tolist()).unsqueeze(0)
            salida = red(t)
        dif_pre = max(dif_pre, float(np.abs(nuestro - t.numpy()).max()))

        cajas_onnx, logits_onnx = sesion.run(["dets", "labels"], {"input": t.numpy()})
        puntajes_torch = torch.sigmoid(salida["pred_logits"]).numpy()
        puntajes_onnx = 1 / (1 + np.exp(-logits_onnx))
        dif_puntajes = max(dif_puntajes, float(np.abs(puntajes_torch - puntajes_onnx).max()))
        dif_cajas = max(dif_cajas, float(np.abs(salida["pred_boxes"].numpy() - cajas_onnx).max()))
        nombres.append(nombre)
        mejores = pares_crudos(
            salida["pred_boxes"][0].numpy(),
            salida["pred_logits"][0].numpy(),
            imagen.width,
            imagen.height,
            indice_fondo=metadatos["indice_fondo"],
            confianza_minima=0.0,
            max_pares=PARES_DE_HUELLA,
        )
        huella[nombre] = [
            [p.consulta, p.columna, round(p.confianza, 6), *(round(v, 3) for v in p.xyxy)] for p in mejores
        ]

    print(f"Paridad en {len(nombres)} imágenes: preprocesado {dif_pre:.2e}, puntajes {dif_puntajes:.2e}, cajas {dif_cajas:.2e}")
    problemas = []
    if dif_pre > TOLERANCIA_PREPROCESADO:
        problemas.append(f"preprocesado {dif_pre:.2e} > {TOLERANCIA_PREPROCESADO}")
    if dif_puntajes > TOLERANCIA_PUNTAJES:
        problemas.append(f"puntajes {dif_puntajes:.2e} > {TOLERANCIA_PUNTAJES}")
    if dif_cajas > TOLERANCIA_CAJAS:
        problemas.append(f"cajas {dif_cajas:.2e} > {TOLERANCIA_CAJAS}")
    if problemas:
        raise SystemExit("La paridad ONNX/PyTorch falló: " + "; ".join(problemas))
    paridad = {
        "imagenes": len(nombres),
        "max_dif_preprocesado": float(f"{dif_pre:.3g}"),
        "max_dif_puntajes": float(f"{dif_puntajes:.3g}"),
        "max_dif_cajas": float(f"{dif_cajas:.3g}"),
    }
    return paridad, huella


def comparar_detecciones(modelo_torch, modelo_onnx, imagenes, umbral: float) -> None:
    """(c) Informativo: detecciones de la app con el adaptador ONNX frente a ``RFDETR.predict`` mapeado."""
    from app.infrastructure.onnx_modelo import ETIQUETA_A_CLASE

    etiquetas = modelo_torch.class_names
    for nombre, imagen in imagenes:
        inicio = time.perf_counter()
        nuestras = modelo_onnx.detectar(a_imagen_rgb(imagen))
        ms_onnx = (time.perf_counter() - inicio) * 1000
        inicio = time.perf_counter()
        torch_det = modelo_torch.predict(imagen, threshold=umbral)
        ms_torch = (time.perf_counter() - inicio) * 1000
        referencia = sorted(
            (
                (ETIQUETA_A_CLASE[etiquetas[int(c)]].value, float(s))
                for c, s in zip(torch_det.class_id, torch_det.confidence, strict=True)
                if float(s) >= umbral
            ),
            key=lambda x: -x[1],
        )
        resumen = lambda dets: ", ".join(f"{c} {s:.3f}" for c, s in dets[:4]) or "—"  # noqa: E731
        print(
            f"  {nombre}: ONNX [{resumen([(d.clase.value, d.confianza) for d in nuestras])}] {ms_onnx:.0f} ms | "
            f"PyTorch [{resumen(referencia)}] {ms_torch:.0f} ms"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--salida", type=Path, default=RAIZ / "modelos", help="carpeta del .onnx y modelo.json")
    parser.add_argument("--comprobar", action="store_true", help="falla si el hash difiere del de modelo.json")
    parser.add_argument("--imagenes", type=Path, help="carpeta con fotos (fuera del repo) para comparar detecciones")
    argumentos = parser.parse_args()

    import numpy as np
    import onnx
    import onnxruntime as ort
    import rfdetr
    import torch

    from app.infrastructure.onnx_modelo import OnnxModelo, opciones_de_sesion
    from scripts.sinteticas import imagenes_sinteticas

    salida: Path = argumentos.salida
    salida.mkdir(parents=True, exist_ok=True)
    ruta_metadatos = salida / "modelo.json"
    registrado = json.loads(ruta_metadatos.read_text(encoding="utf-8")) if ruta_metadatos.is_file() else None
    if argumentos.comprobar and registrado is None:
        raise SystemExit(f"--comprobar necesita {ruta_metadatos} (versionado en git)")

    torch.manual_seed(0)
    modelo = rfdetr.RFDETRNano(pretrain_weights=str(descargar_pesos()), num_classes=len(ETIQUETAS_ESPERADAS))
    if tuple(modelo.class_names) != ETIQUETAS_ESPERADAS:
        raise SystemExit(f"Etiquetas inesperadas en el checkpoint: {modelo.class_names}")
    resolucion = int(modelo.model.resolution)

    with tempfile.TemporaryDirectory() as temporal:
        inicio = time.perf_counter()
        exportado = Path(modelo.export(output_dir=temporal, output_name=NOMBRE, opset_version=OPSET, verbose=False))
        print(f"Exportado en {time.perf_counter() - inicio:.1f} s")
        destino = salida / f"{NOMBRE}.onnx"
        shutil.move(str(exportado), destino)

    sha256 = sha256_de(destino)
    version = f"{NOMBRE}-{REVISION_HF[:7]}-{sha256[:8]}"
    print(f"ONNX: {destino} ({destino.stat().st_size} bytes)\n  sha256 {sha256}\n  versión {version}")

    grafo = onnx.load(str(destino), load_external_data=False)
    salidas = [s.name for s in grafo.graph.output]
    if salidas != ["dets", "labels"] or [e.name for e in grafo.graph.input] != ["input"]:
        raise SystemExit(f"Entradas/salidas inesperadas: {[e.name for e in grafo.graph.input]} -> {salidas}")

    metadatos = {
        "nombre": NOMBRE,
        "version": version,
        "archivo": destino.name,
        "sha256": sha256,
        "bytes": destino.stat().st_size,
        "resolucion": resolucion,
        "entrada": {
            "nombre": "input",
            "forma": [1, 3, resolucion, resolucion],
            "preprocesado": "RGB, bilineal sin antialias (centros de medio píxel), /255, media y desviación de ImageNet",
        },
        "salidas": {"cajas": "dets", "logits": "labels"},
        "etiquetas": list(ETIQUETAS_ESPERADAS),
        "indice_fondo": len(ETIQUETAS_ESPERADAS),
        "fuente": {
            "repo_hf": REPO_HF,
            "revision": REVISION_HF,
            "archivo": ARCHIVO_PESOS,
            "sha256": SHA256_PESOS,
            "licencia_pesos": "Apache-2.0",
            "licencia_arquitectura": "Apache-2.0 (rfdetr, Roboflow)",
            "datos": "RDD2022 (Arya et al., arXiv:2209.08538), imágenes CC BY-SA 4.0",
        },
        "exportacion": {
            "fecha": date.today().isoformat(),
            "rfdetr": rfdetr.__version__ if hasattr(rfdetr, "__version__") else "1.11.2",
            "torch": torch.__version__,
            "onnx": onnx.__version__,
            "onnxruntime": ort.__version__,
            "numpy": np.__version__,
            "opset": OPSET,
            "python": platform.python_version(),
            "plataforma": f"{platform.system()} {platform.machine()}",
        },
    }

    sesion = ort.InferenceSession(str(destino), sess_options=opciones_de_sesion(2), providers=["CPUExecutionProvider"])
    metadatos["paridad"], huella = verificar_paridad(modelo, sesion, metadatos, imagenes_sinteticas())
    metadatos["huella_pytorch"] = {
        "descripcion": (
            f"Los {PARES_DE_HUELLA} mejores pares de PyTorch por imagen de scripts/sinteticas.py: "
            "[consulta, columna, confianza, x1, y1, x2, y2]. Lo comprueba tests/test_modelo_real.py."
        ),
        "imagenes": huella,
    }

    if argumentos.comprobar:
        if sha256 != registrado["sha256"]:
            raise SystemExit(
                f"El .onnx exportado ({sha256}) no es el registrado en modelo.json ({registrado['sha256']}). "
                "Revisa las versiones de requirements-exportar.txt."
            )
        print("Hash igual al registrado en modelo.json: no se reescribe.")
    else:
        if registrado and registrado.get("sha256") != sha256:
            print(f"AVISO: el hash cambió respecto del registrado ({registrado.get('sha256')}).")
        ruta_metadatos.write_text(json.dumps(metadatos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Escrito {ruta_metadatos}")

    if argumentos.imagenes:
        modelo_onnx = OnnxModelo.cargar(salida, hilos=2, confianza_minima=0.10, max_detecciones=100)
        print(f"Detecciones (piso 0,10) en {argumentos.imagenes}:")
        comparar_detecciones(modelo, modelo_onnx, imagenes_de(argumentos.imagenes), 0.10)


if __name__ == "__main__":
    main()
