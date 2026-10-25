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
    PORT=8000
RUN groupadd --system --gid 10001 inferencia \
 && useradd --system --uid 10001 --gid inferencia --no-create-home --shell /usr/sbin/nologin inferencia
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app/ app/
COPY --from=exportador /src/modelos/ modelos/
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/salud', timeout=4)"]
# Un solo proceso: cada inferencia ya usa INFERENCIA_HILOS hilos y van de a una
# (OnnxModelo las serializa). Más workers duplicarían el modelo en memoria.
CMD ["sh", "-c", "exec uvicorn app.main:crear_app --factory --host 0.0.0.0 --port ${PORT} --workers 1"]
