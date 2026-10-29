# syntax=docker/dockerfile:1
# Servicio de inferencia de Ciudad Viva (NC-03 y NC-10a): FastAPI + onnxruntime en CPU.
# Detección de daños (RF-DETR) y moderación de la foto (Marqo nsfw-image-detection-384).
#
#   docker build -t ciudadviva-inferencia inferencia/
#   docker run --rm -p 8090:8000 --cpus=2 ciudadviva-inferencia
#
# Dos etapas. La primera descarga los pesos de los dos modelos de su revisión
# fijada de Hugging Face, los exporta a ONNX y **falla si un hash no es el de
# modelos/modelo.json o modelos/moderacion.json** (versionados en git): la imagen
# se construye solo desde el repositorio, sin pesos en git, y siempre con los
# mismos modelos. La segunda lleva solo el servicio y los .onnx (sin torch), y
# corre sin root.

ARG PYTHON_IMAGEN=python:3.13.17-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530

# --------------------------------------------------------------------------- exportación
FROM ${PYTHON_IMAGEN} AS exportador
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    ORT_DISABLE_TELEMETRY=1 \
    PYTHONWARNINGS=ignore
WORKDIR /src
COPY requirements-exportar.txt .
RUN pip install -r requirements-exportar.txt
COPY app/ app/
COPY scripts/ scripts/
COPY modelos/modelo.json modelos/moderacion.json modelos/
RUN python scripts/exportar_onnx.py --comprobar
# Moderación (NC-10a): exporta con timm, mide la paridad con timm y falla si el hash no es el registrado.
RUN python scripts/exportar_moderacion.py --comprobar

# --------------------------------------------------------------------------- servicio
FROM ${PYTHON_IMAGEN}
# onnxruntime envía telemetría a Microsoft por defecto en Linux: ORT_DISABLE_TELEMETRY
# la apaga antes de que el motor arranque (también lo hace app/infrastructure/onnx_modelo.py).
# MALLOC_*: con varios hilos decodificando fotos grandes, glibc abre un arena por hilo y se
# queda con la memoria liberada. Dos arenas y los bloques de 1 MiB o más por mmap (se
# devuelven al liberarlos) bajan el máximo con 4 clientes y fotos de 8 MP de 847 a 487 MiB,
# con la misma latencia y los mismos resultados (README, «Cifras medidas»).
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ORT_DISABLE_TELEMETRY=1 \
    MALLOC_ARENA_MAX=2 \
    MALLOC_MMAP_THRESHOLD_=1048576 \
    INFERENCIA_MODELO_DIR=/app/modelos \
    INFERENCIA_HILOS=2 \
    INFERENCIA_MODERACION_HILOS=1 \
    INFERENCIA_HOST=0.0.0.0 \
    INFERENCIA_MAX_CONCURRENCIA=10 \
    PORT=8000
RUN groupadd --system --gid 10001 inferencia \
 && useradd --system --uid 10001 --gid inferencia --no-create-home --shell /usr/sbin/nologin inferencia
WORKDIR /app
# Todas las dependencias, también las transitivas, con versión y hash fijos (requirements.lock,
# generado desde requirements.txt). --no-deps: nada que no esté en el lock entra a la imagen.
COPY requirements.lock .
RUN pip install --require-hashes --no-deps -r requirements.lock && pip check
COPY app/ app/
COPY --from=exportador /src/modelos/ modelos/
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/salud', timeout=4)"]
# Un solo proceso: cada inferencia ya usa INFERENCIA_HILOS hilos (INFERENCIA_MODERACION_HILOS
# la moderación) y van de a una por modelo (OnnxModelo y OnnxModeracion tienen cada uno su
# candado). Más workers duplicarían los modelos en memoria.
# --limit-concurrency: con INFERENCIA_MAX_CONCURRENCIA conexiones o tareas abiertas (las
# conexiones en keep-alive también cuentan), uvicorn responde 503 en vez de encolar sin tope.
# El tope es uno solo para el proceso: cuenta /v1/detecciones, /v1/moderacion y /salud juntos.
# Con ~0,3–0,5 s por imagen, 10 es lo que se alcanza a atender dentro de los 3 s del backend.
# INFERENCIA_HOST: 0.0.0.0 escucha solo IPv4. Vacío escucha IPv4 e IPv6 (probado); "::" con uvicorn es
# solo IPv6 y rompe el HEALTHCHECK, que usa 127.0.0.1. Si la red privada de Railway es solo IPv6, vacío.
CMD ["sh", "-c", "exec uvicorn app.main:crear_app --factory --host \"$INFERENCIA_HOST\" --port \"$PORT\" --workers 1 --limit-concurrency \"$INFERENCIA_MAX_CONCURRENCIA\""]
