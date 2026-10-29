"""Descarga Marqo ``nsfw-image-detection-384`` de una revisión fija de Hugging Face, lo exporta a ONNX
con timm + PyTorch, registra el hash en ``modelos/moderacion.json`` y verifica la paridad con timm.

Uso (desde ``inferencia/``, con el entorno de exportación; README, «Obtener el modelo»):

    python scripts/exportar_moderacion.py                  # exporta y escribe modelos/moderacion.json
    python scripts/exportar_moderacion.py --comprobar      # exporta y falla si el hash no es el registrado
    python scripts/exportar_moderacion.py --imagenes DIR   # además compara puntajes en fotos reales

``--comprobar`` lo usa el ``Dockerfile`` (etapa ``exportador``), igual que con RF-DETR: la imagen solo
se construye si el ``.onnx`` que sale es byte a byte el registrado en ``moderacion.json``.

La paridad se mide de tres formas, sobre las imágenes sintéticas de ``scripts/sinteticas.py``:

1. **Preprocesado**: los recortes que arma el adaptador (``app.infrastructure.onnx_moderacion``,
   el mismo código de producción) frente a los de torchvision con el ``Resize`` bicúbico de timm,
   y el recorte central de la transformación de evaluación de timm (``create_transform``) frente
   al mismo recorte armado por el adaptador.
2. **Logits**: ONNX frente a PyTorch con la misma entrada, y con la entrada de cada lado.
3. **Puntajes** (aceptación de NC-10a, 10⁻³): ``OnnxModeracion.moderar`` frente al máximo del
   softmax de timm en los mismos recortes.

Los pesos no se versionan (``.gitignore``). Sus fuentes y licencias:

- Pesos: ``Marqo/nsfw-image-detection-384`` (Apache-2.0), de Marqo AI.
- Arquitectura: ``vit_tiny_patch16_384`` de timm (Apache-2.0); modelo base
  ``timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k`` (Apache-2.0).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))  # para importar app.infrastructure (la misma ruta de código que en producción)

REPO_HF = "Marqo/nsfw-image-detection-384"
REVISION_HF = "0c26ec22111b83f106d72a55f611ec35962bcb65"  # commit del repo de HF, decidido el 28/10/2026
ARCHIVO_PESOS = "model.safetensors"
SHA256_PESOS = "6bf2e0f64a1d20169736c2836e3a787b12379fdc08ba87f7d94a7a3d58eeefce"  # oid LFS de esa revisión
ARCHIVO_CONFIG = "config.json"
ARQUITECTURA = "vit_tiny_patch16_384"
ETIQUETAS = ("NSFW", "SFW")
RESOLUCION = 384
NOMBRE = "nsfw-vit-tiny-384"
OPSET = 17
HILOS = 1  # los mismos que en producción (INFERENCIA_MODERACION_HILOS)

TOLERANCIA_PREPROCESADO = 1e-4  # tensores del adaptador frente a torchvision/timm
TOLERANCIA_LOGITS = 1e-3  # logits ONNX frente a PyTorch
TOLERANCIA_PUNTAJES = 1e-3  # puntaje final del adaptador frente a timm (aceptación de NC-10a)


def sha256_de(ruta: Path) -> str:
    resumen = hashlib.sha256()
    with ruta.open("rb") as archivo:
        for bloque in iter(lambda: archivo.read(1024 * 1024), b""):
            resumen.update(bloque)
    return resumen.hexdigest()


def descargar() -> tuple[Path, dict]:
    """Pesos (con su sha256 verificado) y ``config.json`` de la revisión fijada."""
    from huggingface_hub import hf_hub_download

    pesos = Path(hf_hub_download(REPO_HF, ARCHIVO_PESOS, revision=REVISION_HF))
    real = sha256_de(pesos)
    if real != SHA256_PESOS:
        raise SystemExit(f"El hash de {ARCHIVO_PESOS} ({real}) no es el de la revisión fijada ({SHA256_PESOS}).")
    config = json.loads(Path(hf_hub_download(REPO_HF, ARCHIVO_CONFIG, revision=REVISION_HF)).read_text("utf-8"))
    cfg = config.get("pretrained_cfg", {})
    esperado = {
        "architecture": (config.get("architecture"), ARQUITECTURA),
        "num_classes": (config.get("num_classes"), len(ETIQUETAS)),
        "label_names": (tuple(config.get("label_names", ())), ETIQUETAS),
        "input_size": (tuple(cfg.get("input_size", ())), (3, RESOLUCION, RESOLUCION)),
        "interpolation": (cfg.get("interpolation"), "bicubic"),
        "crop_pct": (cfg.get("crop_pct"), 1.0),
        "mean": (tuple(cfg.get("mean", ())), (0.5, 0.5, 0.5)),
        "std": (tuple(cfg.get("std", ())), (0.5, 0.5, 0.5)),
    }
    distintos = {k: v for k, (v, e) in esperado.items() if v != e}
    if distintos:
        raise SystemExit(f"config.json no es el esperado para el adaptador: {distintos}")
    print(f"Pesos: {REPO_HF}@{REVISION_HF[:7]} ({pesos.stat().st_size} bytes, sha256 verificado)")
    return pesos, config


def crear_modelo(pesos: Path, config: dict):
    """El modelo de timm con los pesos de Marqo, en evaluación (lo mismo que ``hf_hub:`` con la revisión fija)."""
    import timm
    from safetensors.torch import load_file

    modelo = timm.create_model(
        ARQUITECTURA,
        pretrained=False,
        num_classes=len(ETIQUETAS),
        pretrained_cfg_overlay=dict(config["pretrained_cfg"], label_names=list(ETIQUETAS)),
    )
    modelo.load_state_dict(load_file(str(pesos)), strict=True)
    return modelo.eval()


def exportar(modelo, destino: Path) -> None:
    import torch

    entrada = torch.zeros(1, 3, RESOLUCION, RESOLUCION)
    with torch.no_grad():
        torch.onnx.export(
            modelo,
            (entrada,),
            str(destino),
            input_names=["input"],
            output_names=["logits"],
            export_params=True,
            keep_initializers_as_inputs=False,
            do_constant_folding=True,
            opset_version=OPSET,
            # El exportador clásico, como rfdetr: el de dynamo pide dependencias extra.
            dynamo=False,
        )


def a_imagen_rgb(imagen):
    from app.domain.imagen import ImagenRGB

    rgb = imagen.convert("RGB")
    return ImagenRGB(rgb.width, rgb.height, rgb.tobytes())


def imagenes_de(directorio: Path):
    from PIL import Image, ImageOps

    for ruta in sorted(directorio.iterdir()):
        if ruta.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            with Image.open(ruta) as imagen:
                yield ruta.name, ImageOps.exif_transpose(imagen).convert("RGB")


def recortes_de_referencia(imagen, geometria):
    """Los recortes con torchvision: el ``Resize`` bicúbico de timm (o el tamaño explícito si se comprimió)."""
    import torchvision.transforms.functional as F
    from torchvision.transforms import InterpolationMode

    from app.infrastructure.onnx_moderacion import DESVIACION, MEDIA

    menor, mayor = sorted(imagen.size)
    if int(RESOLUCION * mayor / menor) == max(geometria.ancho, geometria.alto):
        redimensionada = F.resize(imagen, RESOLUCION, interpolation=InterpolationMode.BICUBIC)
        if redimensionada.size != (geometria.ancho, geometria.alto):
            raise SystemExit(f"Resize(384) de torchvision da {redimensionada.size} y la geometría {geometria}")
    else:  # más alargada que 2:1: el adaptador comprime el lado mayor
        redimensionada = F.resize(imagen, [geometria.alto, geometria.ancho], interpolation=InterpolationMode.BICUBIC)
    return [
        F.normalize(F.to_tensor(F.crop(redimensionada, y, x, RESOLUCION, RESOLUCION)), MEDIA.tolist(), DESVIACION.tolist())
        .unsqueeze(0)
        for x, y in geometria.origenes
    ]


def verificar_paridad(modelo, sesion, adaptador, imagenes) -> tuple[dict, dict]:
    import numpy as np
    import timm
    import torch

    from app.infrastructure.onnx_moderacion import geometria_de_recortes, normalizar, recortes, redimensionar

    configuracion_timm = timm.data.resolve_model_data_config(modelo)
    transformacion_timm = timm.data.create_transform(**configuracion_timm, is_training=False)
    print(f"Transformación de evaluación de timm: {configuracion_timm}")
    indice = ETIQUETAS.index("NSFW")

    dif = dict.fromkeys(("preprocesado", "timm", "logits_misma_entrada", "logits", "puntajes"), 0.0)
    total_recortes = 0
    huella = {}
    for nombre, imagen in imagenes:
        rgb = a_imagen_rgb(imagen)
        geometria = geometria_de_recortes(imagen.width, imagen.height, RESOLUCION)
        nuestros = recortes(rgb, RESOLUCION)
        referencia = recortes_de_referencia(imagen, geometria)
        total_recortes += len(nuestros)
        for n, r in zip(nuestros, referencia, strict=True):
            dif["preprocesado"] = max(dif["preprocesado"], float(np.abs(n - r.numpy()).max()))

        # El recorte central de timm frente al mismo recorte del adaptador (solo sin compresión).
        menor, mayor = sorted(imagen.size)
        if int(RESOLUCION * mayor / menor) == max(geometria.ancho, geometria.alto):
            redimensionada = redimensionar(rgb, geometria)
            arriba = int(round((geometria.alto - RESOLUCION) / 2.0))
            izquierda = int(round((geometria.ancho - RESOLUCION) / 2.0))
            central = normalizar(redimensionada[arriba : arriba + RESOLUCION, izquierda : izquierda + RESOLUCION])
            del_timm = transformacion_timm(imagen).unsqueeze(0).numpy()
            dif["timm"] = max(dif["timm"], float(np.abs(central - del_timm).max()))

        with torch.no_grad():
            logits_torch = [modelo(r)[0].double() for r in referencia]
        logits_onnx_misma = [sesion.run(["logits"], {"input": r.numpy()})[0][0] for r in referencia]
        logits_onnx = adaptador.inferir(nuestros)
        for t, m, o in zip(logits_torch, logits_onnx_misma, logits_onnx, strict=True):
            dif["logits_misma_entrada"] = max(dif["logits_misma_entrada"], float(np.abs(t.numpy() - m).max()))
            dif["logits"] = max(dif["logits"], float(np.abs(t.numpy() - o).max()))

        puntajes_timm = [float(torch.softmax(t, dim=0)[indice]) for t in logits_torch]
        puntaje_adaptador = adaptador.moderar(rgb)
        dif["puntajes"] = max(dif["puntajes"], abs(max(puntajes_timm) - puntaje_adaptador))
        huella[nombre] = {"puntaje": round(max(puntajes_timm), 6), "recortes": [round(p, 6) for p in puntajes_timm]}
        print(f"  {nombre}: timm {[f'{p:.4f}' for p in puntajes_timm]} -> {max(puntajes_timm):.6f}; ONNX {puntaje_adaptador:.6f}")

    print(
        f"Paridad en {len(huella)} imágenes ({total_recortes} recortes): preprocesado {dif['preprocesado']:.2e}, "
        f"recorte central de timm {dif['timm']:.2e}, logits con la misma entrada {dif['logits_misma_entrada']:.2e}, "
        f"logits {dif['logits']:.2e}, puntajes {dif['puntajes']:.2e}"
    )
    problemas = []
    for clave, tolerancia in (
        ("preprocesado", TOLERANCIA_PREPROCESADO),
        ("timm", TOLERANCIA_PREPROCESADO),
        ("logits_misma_entrada", TOLERANCIA_LOGITS),
        ("logits", TOLERANCIA_LOGITS),
        ("puntajes", TOLERANCIA_PUNTAJES),
    ):
        if dif[clave] > tolerancia:
            problemas.append(f"{clave} {dif[clave]:.2e} > {tolerancia}")
    if problemas:
        raise SystemExit("La paridad ONNX/timm falló: " + "; ".join(problemas))
    paridad = {
        "imagenes": len(huella),
        "recortes": total_recortes,
        "max_dif_preprocesado": float(f"{dif['preprocesado']:.3g}"),
        "max_dif_recorte_central_timm": float(f"{dif['timm']:.3g}"),
        "max_dif_logits_misma_entrada": float(f"{dif['logits_misma_entrada']:.3g}"),
        "max_dif_logits": float(f"{dif['logits']:.3g}"),
        "max_dif_puntajes": float(f"{dif['puntajes']:.3g}"),
        "tolerancia_puntajes": TOLERANCIA_PUNTAJES,
    }
    return paridad, huella


def comparar_en_fotos(modelo, adaptador, imagenes) -> None:
    """Informativo: puntaje del adaptador (dos recortes) frente al de timm (recorte central) en fotos reales."""
    import timm
    import torch

    transformacion = timm.data.create_transform(**timm.data.resolve_model_data_config(modelo), is_training=False)
    indice = ETIQUETAS.index("NSFW")
    for nombre, imagen in imagenes:
        inicio = time.perf_counter()
        nuestro = adaptador.moderar(a_imagen_rgb(imagen))
        ms = (time.perf_counter() - inicio) * 1000
        with torch.no_grad():
            central = float(torch.softmax(modelo(transformacion(imagen).unsqueeze(0))[0], dim=0)[indice])
        print(f"  {nombre} ({imagen.width}x{imagen.height}): dos recortes {nuestro:.4f} ({ms:.0f} ms) | timm central {central:.4f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--salida", type=Path, default=RAIZ / "modelos", help="carpeta del .onnx y moderacion.json")
    parser.add_argument("--comprobar", action="store_true", help="falla si el hash difiere del de moderacion.json")
    parser.add_argument("--imagenes", type=Path, help="carpeta con fotos (fuera del repo) para comparar puntajes")
    argumentos = parser.parse_args()

    import numpy as np
    import onnx
    import onnxruntime as ort
    import PIL
    import timm
    import torch
    import torchvision

    from app.infrastructure.onnx_modelo import opciones_de_sesion
    from app.infrastructure.onnx_moderacion import ARCHIVO_METADATOS_MODERACION, OnnxModeracion
    from scripts.sinteticas import TAMANOS_MODERACION, imagenes_de_color, imagenes_sinteticas

    salida: Path = argumentos.salida
    salida.mkdir(parents=True, exist_ok=True)
    ruta_metadatos = salida / ARCHIVO_METADATOS_MODERACION
    registrado = json.loads(ruta_metadatos.read_text(encoding="utf-8")) if ruta_metadatos.is_file() else None
    if argumentos.comprobar and registrado is None:
        raise SystemExit(f"--comprobar necesita {ruta_metadatos} (versionado en git)")

    torch.manual_seed(0)
    pesos, config = descargar()
    modelo = crear_modelo(pesos, config)
    parametros = sum(p.numel() for p in modelo.parameters())

    destino = salida / f"{NOMBRE}.onnx"
    with tempfile.TemporaryDirectory() as temporal:
        inicio = time.perf_counter()
        exportado = Path(temporal) / destino.name
        exportar(modelo, exportado)
        print(f"Exportado en {time.perf_counter() - inicio:.1f} s")
        destino.write_bytes(exportado.read_bytes())

    sha256 = sha256_de(destino)
    version = f"{NOMBRE}-{REVISION_HF[:7]}-{sha256[:8]}"
    print(f"ONNX: {destino} ({destino.stat().st_size} bytes)\n  sha256 {sha256}\n  versión {version}")

    grafo = onnx.load(str(destino), load_external_data=False)
    onnx.checker.check_model(grafo)
    entradas = [e.name for e in grafo.graph.input]
    salidas = [s.name for s in grafo.graph.output]
    if entradas != ["input"] or salidas != ["logits"]:
        raise SystemExit(f"Entradas/salidas inesperadas: {entradas} -> {salidas}")

    metadatos = {
        "nombre": NOMBRE,
        "version": version,
        "archivo": destino.name,
        "sha256": sha256,
        "bytes": destino.stat().st_size,
        "resolucion": RESOLUCION,
        "entrada": {
            "nombre": "input",
            "forma": [1, 3, RESOLUCION, RESOLUCION],
            "preprocesado": (
                "RGB; Resize(384) bicúbico de Pillow sobre el lado menor (timm, crop_pct 1,0); dos recortes de 384 "
                "al principio y al final del lado mayor (si la foto es más alargada que 2:1, el lado mayor se comprime "
                "a 768); /255; media y desviación 0,5"
            ),
        },
        "salida": {"nombre": "logits", "forma": [1, len(ETIQUETAS)], "puntaje": "softmax, columna NSFW, máximo de los recortes"},
        "etiquetas": list(ETIQUETAS),
        "fuente": {
            "repo_hf": REPO_HF,
            "revision": REVISION_HF,
            "archivo": ARCHIVO_PESOS,
            "sha256": SHA256_PESOS,
            "arquitectura": f"timm {ARQUITECTURA} ({parametros} parámetros)",
            "modelo_base": "timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k (Apache-2.0)",
            "licencia_pesos": "Apache-2.0",
            "licencia_arquitectura": "Apache-2.0 (timm)",
            "atribucion": "Marqo AI, «nsfw-image-detection-384» (Hugging Face), Apache-2.0",
            "datos": "Propios de Marqo (220 000 imágenes); la tarjeta no publica su procedencia",
        },
        "exportacion": {
            "fecha": date.today().isoformat(),
            "timm": timm.__version__,
            "torch": torch.__version__,
            "torchvision": torchvision.__version__,
            "onnx": onnx.__version__,
            "onnxruntime": ort.__version__,
            "numpy": np.__version__,
            "pillow": PIL.__version__,
            "opset": OPSET,
            "exportador": "torch.onnx.export(dynamo=False)",
            "python": platform.python_version(),
            "plataforma": f"{platform.system()} {platform.machine()}",
        },
    }

    # El adaptador de producción lee moderacion.json: se le da uno provisional en una carpeta aparte,
    # porque el de --salida puede ser el registrado (con --comprobar) o uno viejo.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temporal:
        provisional = Path(temporal)
        (provisional / destino.name).write_bytes(destino.read_bytes())
        (provisional / ARCHIVO_METADATOS_MODERACION).write_text(json.dumps(metadatos), encoding="utf-8")
        adaptador = OnnxModeracion.cargar(provisional, hilos=HILOS)
        sesion = ort.InferenceSession(
            str(destino), sess_options=opciones_de_sesion(HILOS), providers=["CPUExecutionProvider"]
        )
        imagenes = [*imagenes_sinteticas(TAMANOS_MODERACION), *imagenes_de_color()]
        metadatos["paridad"], huella = verificar_paridad(modelo, sesion, adaptador, imagenes)
        if argumentos.imagenes:
            print(f"Puntajes en {argumentos.imagenes}:")
            comparar_en_fotos(modelo, adaptador, imagenes_de(argumentos.imagenes))
    metadatos["huella_timm"] = {
        "descripcion": (
            "Puntaje de timm (PyTorch) por imagen de scripts/sinteticas.py (TAMANOS_MODERACION e imagenes_de_color): "
            "el máximo y el de cada recorte. Lo comprueba tests/test_modelo_real.py."
        ),
        "imagenes": huella,
    }

    if argumentos.comprobar:
        if sha256 != registrado["sha256"]:
            raise SystemExit(
                f"El .onnx exportado ({sha256}) no es el registrado en {ARCHIVO_METADATOS_MODERACION} "
                f"({registrado['sha256']}). Revisa las versiones de requirements-exportar.txt."
            )
        print(f"Hash igual al registrado en {ARCHIVO_METADATOS_MODERACION}: no se reescribe.")
    else:
        if registrado and registrado.get("sha256") != sha256:
            print(f"AVISO: el hash cambió respecto del registrado ({registrado.get('sha256')}).")
        ruta_metadatos.write_text(json.dumps(metadatos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Escrito {ruta_metadatos}")


if __name__ == "__main__":
    main()
