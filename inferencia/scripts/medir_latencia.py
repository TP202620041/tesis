"""Mide la latencia por imagen del servicio y la memoria de su contenedor (``docker stats``).

Uso (con el servicio corriendo en Docker limitado a 2 vCPU; README, «Cifras medidas»):

    docker run -d --name inferencia-medicion -p 8090:8000 --cpus=2 ciudadviva-inferencia:nc03
    python scripts/medir_latencia.py --url http://localhost:8090 --contenedor inferencia-medicion \
        [--imagenes DIR] [--repeticiones 3] [--concurrencia 1]

Sin ``--imagenes`` usa las imágenes sintéticas de ``scripts/sinteticas.py`` en JPEG de calidad
0,85, como las fotos saneadas por el backend. Con ``--imagenes`` (por ejemplo, una muestra de
RDD2022 guardada **fuera** del repositorio) mide sobre fotos reales. La latencia es la del
cliente: HTTP, decodificación, preprocesado, modelo y respuesta.
"""

from __future__ import annotations

import argparse
import io
import json
import statistics
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))


def fotos_sinteticas() -> list[tuple[str, bytes]]:
    from scripts.sinteticas import imagenes_sinteticas

    fotos = []
    for nombre, imagen in imagenes_sinteticas():
        salida = io.BytesIO()
        imagen.save(salida, format="JPEG", quality=85)
        fotos.append((nombre, salida.getvalue()))
    return fotos


def fotos_de(directorio: Path) -> list[tuple[str, bytes]]:
    return [
        (r.name, r.read_bytes())
        for r in sorted(directorio.iterdir())
        if r.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")
    ]


def enviar(url: str, nombre: str, datos: bytes) -> tuple[float, dict]:
    limite = uuid.uuid4().hex
    cuerpo = (
        f"--{limite}\r\nContent-Disposition: form-data; name=\"imagen\"; filename=\"{nombre}\"\r\n"
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + datos + f"\r\n--{limite}--\r\n".encode()
    solicitud = urllib.request.Request(
        f"{url}/v1/detecciones",
        data=cuerpo,
        headers={"Content-Type": f"multipart/form-data; boundary={limite}"},
        method="POST",
    )
    inicio = time.perf_counter()
    with urllib.request.urlopen(solicitud, timeout=60) as respuesta:
        cuerpo_respuesta = json.loads(respuesta.read())
    return (time.perf_counter() - inicio) * 1000, cuerpo_respuesta


def a_mib(texto: str) -> float:
    valor = texto.strip()
    unidades = (
        ("GiB", 1024), ("MiB", 1), ("KiB", 1 / 1024),
        ("GB", 1000 / 1.048576), ("MB", 1 / 1.048576), ("kB", 1 / 1048.576), ("B", 1 / 1048576),
    )
    for sufijo, factor in unidades:
        if valor.endswith(sufijo):
            return float(valor[: -len(sufijo)]) * factor
    return float("nan")


class MuestreoDeMemoria(threading.Thread):
    """Lee ``docker stats`` en bucle y guarda el máximo de memoria y de CPU."""

    def __init__(self, contenedor: str) -> None:
        super().__init__(daemon=True)
        self.contenedor = contenedor
        self.maximo_mib = 0.0
        self.maximo_cpu = 0.0
        self.muestras = 0
        self._parar = threading.Event()

    def leer(self) -> tuple[float, float]:
        salida = subprocess.run(
            ["docker", "stats", "--no-stream", "--format", "{{.MemUsage}}|{{.CPUPerc}}", self.contenedor],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        memoria, cpu = salida.split("|")
        return a_mib(memoria.split("/")[0]), float(cpu.rstrip("%"))

    def run(self) -> None:
        while not self._parar.is_set():
            mib, cpu = self.leer()
            self.maximo_mib, self.maximo_cpu = max(self.maximo_mib, mib), max(self.maximo_cpu, cpu)
            self.muestras += 1

    def parar(self) -> None:
        self._parar.set()
        self.join(timeout=10)


def percentil(valores: list[float], p: float) -> float:
    ordenados = sorted(valores)
    k = (len(ordenados) - 1) * p
    i = int(k)
    return ordenados[i] + (ordenados[min(i + 1, len(ordenados) - 1)] - ordenados[i]) * (k - i)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:8090")
    parser.add_argument("--contenedor", help="nombre del contenedor para docker stats")
    parser.add_argument("--imagenes", type=Path)
    parser.add_argument("--repeticiones", type=int, default=3)
    parser.add_argument("--calentamiento", type=int, default=3)
    parser.add_argument("--concurrencia", type=int, default=1)
    argumentos = parser.parse_args()

    fotos = fotos_de(argumentos.imagenes) if argumentos.imagenes else fotos_sinteticas()
    if not fotos:
        raise SystemExit("No hay imágenes para medir")

    muestreo = MuestreoDeMemoria(argumentos.contenedor) if argumentos.contenedor else None
    reposo = muestreo.leer()[0] if muestreo else None

    for nombre, datos in fotos[: argumentos.calentamiento]:
        enviar(argumentos.url, nombre, datos)

    if muestreo:
        muestreo.start()
    trabajos = [f for _ in range(argumentos.repeticiones) for f in fotos]
    inicio = time.perf_counter()
    with ThreadPoolExecutor(argumentos.concurrencia) as grupo:
        resultados = list(grupo.map(lambda f: enviar(argumentos.url, *f), trabajos))
    total = time.perf_counter() - inicio
    if muestreo:
        muestreo.parar()

    latencias = [ms for ms, _ in resultados]
    versiones = {r["version_modelo"] for _, r in resultados}
    detecciones = sum(len(r["detecciones"]) for _, r in resultados)
    print(
        f"Imágenes: {len(fotos)} × {argumentos.repeticiones} = {len(latencias)} solicitudes, "
        f"concurrencia {argumentos.concurrencia}"
    )
    print(f"Versión del modelo: {', '.join(sorted(versiones))}; detecciones devueltas: {detecciones}")
    print(
        f"Latencia (ms): media {statistics.mean(latencias):.0f} · p50 {percentil(latencias, 0.5):.0f} · "
        f"p95 {percentil(latencias, 0.95):.0f} · mín {min(latencias):.0f} · máx {max(latencias):.0f}"
    )
    print(f"Rendimiento: {len(latencias) / total:.2f} imágenes/s")
    if muestreo:
        print(
            f"Memoria del contenedor (MiB): en reposo {reposo:.0f} · máximo durante la medición {muestreo.maximo_mib:.0f} "
            f"({muestreo.muestras} muestras); CPU máx {muestreo.maximo_cpu:.0f} %"
        )


if __name__ == "__main__":
    main()
