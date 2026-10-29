"""Calibra el umbral de la moderación con un conjunto **negativo** guardado FUERA del repositorio.

El conjunto negativo son fotos sin contenido sexual: pistas y veredas (RDD2022, las de Lima de
NC-03b) y calles con gente. El script envía cada foto al servicio (``POST /v1/moderacion``) y da
la distribución de puntajes y el umbral sugerido:

    python scripts/calibrar_moderacion.py --url http://localhost:8010 CARPETA [CARPETA ...] [--detalle 10]

**Regla** (decidida el 28/10, NC-10a): el umbral es el valor más bajo que no rechaza ninguna foto
del conjunto negativo (el puntaje máximo observado), más un margen de 0,15, y siempre entre 0,5
y 0,9. Se redondea hacia arriba a dos decimales. El backend rechaza si ``puntaje ≥ umbral``
(``moderacion/domain/PoliticaDeModeracion``), así que con el umbral sugerido ninguna foto del
conjunto se rechaza.

El conjunto mínimo decidido es de ≥ 300 fotos de RDD2022, las de Lima de NC-03b cuando existan y
≥ 50 de calles con gente; con menos, el informe lo advierte. **El equipo no junta material
explícito**: la cobertura de los positivos se toma de la métrica publicada del modelo.

No guarda ni copia ninguna imagen, y se niega a leer una carpeta dentro del repositorio (las
fotos no se versionan).
"""

from __future__ import annotations

import argparse
import math
import statistics
import sys
from collections.abc import Sequence
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
REPOSITORIO = RAIZ.parent
sys.path.insert(0, str(RAIZ))

MARGEN = 0.15
UMBRAL_MINIMO = 0.5
UMBRAL_MAXIMO = 0.9
FOTOS_MINIMAS = 300
EXTENSIONES = (".jpg", ".jpeg", ".png", ".webp")


def umbral_sugerido(puntajes: Sequence[float]) -> float:
    """Máximo del conjunto negativo + 0,15, entre 0,5 y 0,9, redondeado hacia arriba a 0,01."""
    if not puntajes:
        raise ValueError("Hace falta al menos un puntaje para sugerir un umbral")
    crudo = max(puntajes) + MARGEN
    return min(max(math.ceil(round(crudo * 100, 9)) / 100, UMBRAL_MINIMO), UMBRAL_MAXIMO)


def dentro_del_repositorio(carpeta: Path) -> bool:
    return carpeta.resolve().is_relative_to(REPOSITORIO.resolve())


def percentil(valores: Sequence[float], p: float) -> float:
    ordenados = sorted(valores)
    k = (len(ordenados) - 1) * p
    i = int(k)
    return ordenados[i] + (ordenados[min(i + 1, len(ordenados) - 1)] - ordenados[i]) * (k - i)


def resumen(puntajes: Sequence[float]) -> str:
    return (
        f"n {len(puntajes)} · mín {min(puntajes):.3f} · p50 {statistics.median(puntajes):.3f} · "
        f"p90 {percentil(puntajes, 0.9):.3f} · p95 {percentil(puntajes, 0.95):.3f} · "
        f"p99 {percentil(puntajes, 0.99):.3f} · máx {max(puntajes):.3f}"
    )


def histograma(puntajes: Sequence[float], ancho: float = 0.1) -> list[tuple[str, int]]:
    tramos = [0] * math.ceil(1 / ancho)
    for p in puntajes:
        tramos[min(int(p / ancho), len(tramos) - 1)] += 1
    return [(f"[{i * ancho:.1f}, {(i + 1) * ancho:.1f})", n) for i, n in enumerate(tramos)]


def fotos_de(carpeta: Path) -> list[Path]:
    return sorted(r for r in carpeta.rglob("*") if r.is_file() and r.suffix.lower() in EXTENSIONES)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("carpetas", type=Path, nargs="+", help="carpetas con fotos negativas, fuera del repositorio")
    parser.add_argument("--url", default="http://localhost:8010", help="URL base del servicio de inferencia")
    parser.add_argument("--detalle", type=int, default=10, help="cuántas fotos con mayor puntaje listar")
    argumentos = parser.parse_args()

    from scripts.medir_latencia import RUTAS, enviar

    for carpeta in argumentos.carpetas:
        if not carpeta.is_dir():
            raise SystemExit(f"No existe la carpeta {carpeta}")
        if dentro_del_repositorio(carpeta):
            raise SystemExit(f"{carpeta} está dentro del repositorio: las fotos de calibración se guardan fuera.")

    todos: list[tuple[float, str]] = []
    versiones = set()
    for carpeta in argumentos.carpetas:
        fotos = fotos_de(carpeta)
        puntajes = []
        for ruta in fotos:
            _, respuesta = enviar(argumentos.url, ruta.name, ruta.read_bytes(), RUTAS["moderacion"])
            puntajes.append(respuesta["puntaje"])
            versiones.add(respuesta["version_modelo"])
            todos.append((respuesta["puntaje"], f"{carpeta.name}/{ruta.relative_to(carpeta)}"))
        if puntajes:
            print(f"{carpeta.name}: {resumen(puntajes)}")

    if not todos:
        raise SystemExit("No hay fotos JPEG, PNG o WEBP en las carpetas")
    puntajes = [p for p, _ in todos]
    print(f"\nModelo: {', '.join(sorted(versiones))}")
    print(f"Total: {resumen(puntajes)}")
    print("Histograma:")
    for tramo, n in histograma(puntajes):
        print(f"  {tramo}: {n}")
    for corte in (0.3, 0.5, 0.7, 0.9):
        print(f"  >= {corte:.1f}: {sum(p >= corte for p in puntajes)}")  # sin «≥»: la consola de Windows usa cp1252
    print("\nMayores puntajes (revisar a mano si son falsos positivos):")
    for p, nombre in sorted(todos, reverse=True)[: argumentos.detalle]:
        print(f"  {p:.4f}  {nombre}")
    umbral = umbral_sugerido(puntajes)
    print(
        f"\nUmbral sugerido: {umbral:.2f} (máximo {max(puntajes):.3f} + {MARGEN}, entre {UMBRAL_MINIMO} y "
        f"{UMBRAL_MAXIMO}). Con él, {sum(p >= umbral for p in puntajes)} de {len(puntajes)} fotos se rechazarían."
    )
    if len(puntajes) < FOTOS_MINIMAS:
        print(f"AVISO: {len(puntajes)} fotos; la calibración decidida pide al menos {FOTOS_MINIMAS} más las de Lima y de calles con gente.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
