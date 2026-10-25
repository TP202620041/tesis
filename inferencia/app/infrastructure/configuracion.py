"""Configuración del servicio desde variables de entorno (sin secretos: el servicio no usa ninguno)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from app.domain.imagen import LimitesDeImagen

DIR_MODELO_POR_DEFECTO = Path(__file__).resolve().parents[2] / "modelos"
"""``inferencia/modelos``: ahí deja el ``.onnx`` ``scripts/exportar_onnx.py``."""


@dataclass(frozen=True, slots=True)
class Configuracion:
    """Valores del servicio. Cada uno tiene su variable ``INFERENCIA_*`` (README, «Configuración»)."""

    dir_modelo: Path
    hilos: int
    limites: LimitesDeImagen
    confianza_minima: float
    max_detecciones: int

    @classmethod
    def desde_entorno(cls, entorno: Mapping[str, str] | None = None) -> Configuracion:
        entorno = os.environ if entorno is None else entorno
        hilos = _entero(entorno, "INFERENCIA_HILOS", 2, minimo=1)
        max_bytes = _entero(entorno, "INFERENCIA_MAX_BYTES", 10 * 1024 * 1024, minimo=1)
        max_megapixeles = _decimal(entorno, "INFERENCIA_MAX_MEGAPIXELES", 16.0, minimo=0.01, maximo=100.0)
        confianza_minima = _decimal(entorno, "INFERENCIA_CONFIANZA_MINIMA", 0.10, minimo=0.0, maximo=1.0)
        max_detecciones = _entero(entorno, "INFERENCIA_MAX_DETECCIONES", 100, minimo=1)
        dir_modelo = Path(entorno.get("INFERENCIA_MODELO_DIR") or DIR_MODELO_POR_DEFECTO)
        return cls(
            dir_modelo=dir_modelo,
            hilos=hilos,
            limites=LimitesDeImagen(max_bytes=max_bytes, max_pixeles=int(max_megapixeles * 1_000_000)),
            confianza_minima=confianza_minima,
            max_detecciones=max_detecciones,
        )


def _entero(entorno: Mapping[str, str], nombre: str, defecto: int, *, minimo: int) -> int:
    crudo = entorno.get(nombre)
    if crudo is None or crudo.strip() == "":
        return defecto
    try:
        valor = int(crudo)
    except ValueError as error:
        raise ValueError(f"{nombre} debe ser un entero: {crudo!r}") from error
    if valor < minimo:
        raise ValueError(f"{nombre} debe ser >= {minimo}: {valor}")
    return valor


def _decimal(entorno: Mapping[str, str], nombre: str, defecto: float, *, minimo: float, maximo: float) -> float:
    crudo = entorno.get(nombre)
    if crudo is None or crudo.strip() == "":
        return defecto
    try:
        valor = float(crudo)
    except ValueError as error:
        raise ValueError(f"{nombre} debe ser un número: {crudo!r}") from error
    if not (minimo <= valor <= maximo):
        raise ValueError(f"{nombre} debe estar entre {minimo} y {maximo}: {valor}")
    return valor
