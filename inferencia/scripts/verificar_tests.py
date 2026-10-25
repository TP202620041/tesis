"""Guarda de completitud de pytest: que todo lo que se cita se haya ejecutado, no solo que lo ejecutado pasó.

    python -m pytest --junitxml=reporte.xml
    python scripts/verificar_tests.py reporte.xml [--minimo 120] [--resumen $GITHUB_STEP_SUMMARY]

Falla si:

- hay ``failures`` o ``errors``;
- algún ``tests/test_*.py`` no tiene ningún caso en el informe (archivo que no se recolectó);
- se omitió un test fuera de ``tests/test_modelo_real.py`` (el único que puede omitirse: necesita
  los pesos, que no se versionan);
- los ejecutados (``tests - skipped``) quedan por debajo del mínimo (``--minimo`` o
  ``MIN_PYTEST_INFERENCIA``).
"""

from __future__ import annotations

import argparse
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
OMITIBLE = "tests.test_modelo_real"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reporte", type=Path)
    parser.add_argument("--minimo", type=int, default=int(os.environ.get("MIN_PYTEST_INFERENCIA", "1")))
    parser.add_argument("--resumen", type=Path, help="archivo Markdown donde anexar el resumen (CI)")
    argumentos = parser.parse_args()

    casos = list(ET.parse(argumentos.reporte).getroot().iter("testcase"))
    fallidos = [c for c in casos if c.find("failure") is not None or c.find("error") is not None]
    omitidos = [c for c in casos if c.find("skipped") is not None]
    ejecutados = len(casos) - len(omitidos)

    modulos_con_casos = {c.get("classname", "").split(".")[1] for c in casos if c.get("classname", "").count(".") >= 1}
    archivos = sorted(p.stem for p in (RAIZ / "tests").glob("test_*.py"))
    sin_casos = [a for a in archivos if a not in modulos_con_casos]
    omitidos_indebidos = [
        f"{c.get('classname')}::{c.get('name')}" for c in omitidos if not c.get("classname", "").startswith(OMITIBLE)
    ]

    problemas = []
    if fallidos:
        problemas.append(f"{len(fallidos)} tests fallaron o dieron error")
    if sin_casos:
        problemas.append(f"archivos sin casos en el informe: {', '.join(sin_casos)}")
    if omitidos_indebidos:
        problemas.append(f"omitidos fuera de {OMITIBLE}: {', '.join(omitidos_indebidos)}")
    if ejecutados < argumentos.minimo:
        problemas.append(f"se ejecutaron {ejecutados} tests y el mínimo es {argumentos.minimo}")

    linea = (
        f"Verificacion: {ejecutados} tests ejecutados en {len(archivos)} archivos, "
        f"{len(omitidos)} omitidos (modelo real sin pesos), mínimo {argumentos.minimo}"
    )
    print(linea)
    for problema in problemas:
        print(f"ERROR: {problema}", file=sys.stderr)
    if argumentos.resumen:
        with argumentos.resumen.open("a", encoding="utf-8") as resumen:
            resumen.write("### Inferencia\n\n| Medida | Valor |\n|---|---|\n")
            resumen.write(f"| Ejecutados | **{ejecutados}** (mínimo {argumentos.minimo}) |\n")
            resumen.write(f"| Omitidos | {len(omitidos)} (solo `{OMITIBLE}`, sin pesos) |\n")
            resumen.write(f"| Archivos con casos | {len(archivos) - len(sin_casos)} de {len(archivos)} |\n")
            resumen.write(f"| Fallidos | {len(fallidos)} |\n\n")
            for problema in problemas:
                resumen.write(f"- ERROR: {problema}\n")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
