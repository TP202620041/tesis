# syntax=docker/dockerfile:1
# Servicio de inferencia de Ciudad Viva (NC-03): FastAPI + onnxruntime en CPU.
#
#   docker build -t ciudadviva-inferencia inferencia/
#   docker run --rm -p 8090:8000 --cpus=2 ciudadviva-inferencia
#
# Dos etapas. La primera descarga los pesos de la revisión fijada de Hugging
# Face, los exporta a ONNX y **falla si el hash no es el de modelos/modelo.json**
# (versionado en git): la imagen se construye solo desde el repositorio, sin
# pesos en git, y siempre con el mismo modelo. La segunda lleva solo el
# servicio y el .onnx (sin torch), y corre sin root.

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
COPY modelos/modelo.json modelos/modelo.json
RUN python scripts/exportar_onnx.py --comprobar

# --------------------------------------------------------------------------- servicio
FROM ${PYTHON_IMAGEN}
# onnxruntime envía telemetría a Microsoft por defecto en Linux: ORT_DISABLE_TELEMETRY
# la apaga antes de que el motor arranque (también lo hace app/infrastructure/onnx_modelo.py).
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ORT_DISABLE_TELEMETRY=1 \
    INFERENCIA_MODELO_DIR=/app/modelos \
    INFERENCIA_HILOS=2 \
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
# Un solo proceso: cada inferencia ya usa INFERENCIA_HILOS hilos y van de a una
# (OnnxModelo las serializa). Más workers duplicarían el modelo en memoria.
# --limit-concurrency: con INFERENCIA_MAX_CONCURRENCIA conexiones o tareas abiertas (las
# conexiones en keep-alive también cuentan), uvicorn responde 503 en vez de encolar sin tope.
# Con ~0,3–0,5 s por imagen, 10 es lo que se alcanza a atender dentro de los 3 s del backend.
# INFERENCIA_HOST: 0.0.0.0 escucha solo IPv4. Vacío escucha IPv4 e IPv6 (probado); "::" con uvicorn es
# solo IPv6 y rompe el HEALTHCHECK, que usa 127.0.0.1. Si la red privada de Railway es solo IPv6, vacío.
CMD ["sh", "-c", "exec uvicorn app.main:crear_app --factory --host \"$INFERENCIA_HOST\" --port \"$PORT\" --workers 1 --limit-concurrency \"$INFERENCIA_MAX_CONCURRENCIA\""]
