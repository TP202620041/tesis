# Servicio de inferencia — Ciudad Viva

Servicio interno (NC-03, fase 1 de la propuesta `project-context/decisions/propuestas/2026-10-21-ml-clases-modelo.md`) que **detecta daños viales en una foto**: recibe la imagen y devuelve las cajas de `bache` y `grieta` con su confianza. Lo consume el módulo `clasificacion` del backend (NC-04b) para **sugerir** la categoría de un reporte; la decisión siempre es del ciudadano.

- FastAPI + **onnxruntime en CPU**, sin GPU ni PyTorch en producción.
- Modelo: **RF-DETR Nano afinado en RDD2022** (`dronefreak/rdd2022-rfdetr-nano`, Apache-2.0), exportado a ONNX con un script versionado.
- Capas de `ARCHITECTURE.md` §6, con guarda automática (import-linter).
- **Solo detecta.** El umbral de sugerencia (0,50) y la clase dominante los aplica el backend (`clasificacion/domain/PoliticaDeSugerencia`).

## Contrato (`/v1`)

Lo define este servicio y lo consume `clasificacion/infra` (ARCHITECTURE.md §6 y §7). Un cambio incompatible pasa a `/v2`.

```
POST /v1/detecciones            multipart/form-data, campo «imagen» (JPEG, PNG o WEBP)
200 {
  "version_modelo": "rdd2022-rfdetr-nano-66429f3-20934b9a",
  "detecciones": [
    { "clase": "bache",  "confianza": 0.934, "caja": [3.3, 518.7, 600.0, 599.7] },
    { "clase": "grieta", "confianza": 0.144, "caja": [290.3, 509.0, 306.9, 534.3] }
  ]
}
GET /salud                      200 { "estado": "ok", "version_modelo": "…" }
```

- `clase`: solo `bache` o `grieta` (vocabulario decidido el 21/10, opción A).
- `confianza`: entre 0 y 1. Se devuelven **todas** las detecciones por encima de un **piso técnico** de 0,10 (máximo 100), de mayor a menor confianza. El piso no es el umbral de decisión: solo evita devolver los 300 candidatos de ruido del DETR y deja margen para calibrar el umbral en NC-03b.
- `caja`: `[x1, y1, x2, y2]` en píxeles de la imagen recibida, ya orientada (origen arriba a la izquierda).
- `version_modelo`: artefacto exacto que produjo las detecciones (≤ 40 caracteres, cabe en `version_modelo_sugerencia VARCHAR(40)`).
- Documentación interactiva en `/docs` y esquema en `/openapi.json`.

**Errores**, siempre con la forma `{"codigo": str, "mensaje": str}`:

| Caso | Estado | `codigo` |
|---|---|---|
| Archivo vacío, que no es imagen, dañado o de formato no permitido (GIF, TIFF…) | 400 | `imagen_invalida` |
| Falta el campo `imagen` o la solicitud no es multipart | 400 | `solicitud_invalida` |
| Más de 10 MiB, más de 16 MP, o cuerpo por encima del límite | 413 | `imagen_demasiado_grande` |
| Falla el motor de inferencia | 500 | `error_de_inferencia` |
| Cualquier otro error | 500 | `error_interno` |

El backend trata cualquier respuesta que no sea 200 (o un timeout) como «sin sugerencia»: la IA nunca bloquea un reporte (§4.3).

## Arquitectura en capas

```
inferencia/
├── app/
│   ├── main.py            RAÍZ DE COMPOSICIÓN  crear_app(): arma adaptadores, caso de uso y FastAPI
│   ├── api/               PRESENTACIÓN    routers (detecciones, salud), esquemas.py (Pydantic), errores, límite de cuerpo
│   ├── application/       APLICACIÓN      DetectarDanos: valida, preprocesa (por puerto) e invoca el modelo
│   ├── domain/            DOMINIO         ClaseDano, Caja, Deteccion, Detecciones, VersionModelo, ImagenRGB,
│   │                                      LimitesDeImagen, errores y puertos (DecodificadorDeImagen, ModeloDeDeteccion)
│   └── infrastructure/    INFRAESTRUCTURA OnnxModelo (onnxruntime), PillowDecodificador, Configuracion (entorno)
├── modelos/               modelo.json (versionado: hash y huella); el .onnx no se versiona
├── scripts/               exportar_onnx.py, sinteticas.py, medir_latencia.py, verificar_tests.py
├── tests/
├── Dockerfile, requirements*.txt, pyproject.toml
```

`DetectarDanos(datos)`, en este orden, para que un archivo hostil no ocupe memoria ni CPU:

1. Bytes: vacío → 400; más de `max_bytes` → 413.
2. Cabecera **sin decodificar** (formato y dimensiones): formato fuera de JPEG/PNG/WEBP → 400; más de `max_pixeles` → 413 (bomba de descompresión).
3. Decodificar a RGB orientado (EXIF; transparencia sobre blanco, como el saneador del backend).
4. Modelo → `Detecciones` ordenadas.

**Guarda** (`pyproject.toml`, `lint-imports`), tres contratos:

| Contrato | Qué impide |
|---|---|
| `layers` (exhaustivo) `main > api > application \| infrastructure > domain` | Que una capa importe a una superior, que aplicación e infraestructura se importen entre sí, y que aparezca otro módulo bajo `app/` (`utils/`, `helpers/`…). |
| `forbidden` `app.api` → `app.infrastructure`, onnxruntime, NumPy, Pillow | Que la presentación arme o use adaptadores: los recibe de `app.main`. |
| `forbidden` `app.domain`, `app.application` → onnxruntime, NumPy, Pillow, FastAPI, Starlette, Pydantic | Que el dominio o los casos de uso dependan de librerías de terceros. |

Se comprobó que la guarda falla con violaciones a propósito (infraestructura → aplicación, dominio → NumPy, API → infraestructura, un `app/utils.py`).

## Modelo

| | |
|---|---|
| Pesos | `dronefreak/rdd2022-rfdetr-nano`, revisión **`66429f39b916e56c6a33243d776718088f5f43ad`** (fijada en `scripts/exportar_onnx.py`), `checkpoint_best_total.pth`, sha256 `2d1fba21…98cc9` (verificado al descargar) |
| Arquitectura | RF-DETR Nano (rfdetr 1.11.2): ~30,5 M parámetros, entrada 384 × 384, 300 consultas, 4 clases + fondo |
| ONNX | `modelos/rdd2022-rfdetr-nano.onnx`, 107 647 338 bytes, opset 17, sha256 **`20934b9a2b10281ed8371499ed1a7a58004e98715cb413e76ca0884f9929e604`** (registrado en `modelos/modelo.json`) |
| Métricas del autor | mAP@50 60,85; por clase: bache 72,7, piel de cocodrilo 64,5, transversal 55,0, longitudinal 51,2 (partición propia 70/15/15 de RDD2022, **no** el test oficial; cifras optimistas) |

**Mapeo a las clases de la app** (`infrastructure/onnx_modelo.py`, `ETIQUETA_A_CLASE`): `pothole` (D40) → `bache`; `longitudinal_crack` (D00), `transverse_crack` (D10), `alligator_crack` (D20) → `grieta`. Una etiqueta que no esté en la tabla se descarta. Se verificó con 30 fotos de RDD2022 (fuera del repo): las que tienen baches etiquetados dan `bache`, y las de grietas, `grieta`.

**`version_modelo`** = `rdd2022-rfdetr-nano-<revisión HF, 7>-<sha256 del .onnx, 8>`. Cambia si cambian los pesos **o** la exportación, que es lo que hace falta para D-08 (misma foto + misma versión = misma sugerencia) y para la evaluación de OE3.

### Licencias (verificadas el 25/10/2026)

| Componente | Licencia | Dónde se comprobó |
|---|---|---|
| Pesos afinados `dronefreak/rdd2022-rfdetr-nano` | **Apache-2.0** | Metadatos de la tarjeta del modelo (`license: apache-2.0`) y `config.json` de la revisión fijada (`"license": "Apache-2.0"`, `model_name: RFDETRNano`). El repo de HF no trae un archivo LICENSE aparte. |
| Modelo base `Roboflow/rf-detr-nano` | Apache-2.0 | Tarjeta en HF (`license:apache-2.0`). Nano es de los tamaños Apache-2.0 del paquete `rfdetr` (no requiere `rfdetr_plus`, que trae los de licencia PML). |
| `rfdetr` (código de la arquitectura y la exportación) | Apache-2.0 | `LICENSE` del paquete 1.11.2 y del repo `roboflow/rf-detr`. |
| DetectionBench (con lo que se entrenó) | Apache-2.0 | Repo `dronefreak/DetectionBench`. |
| Datos RDD2022 (Arya et al., arXiv:2209.08538) | **CC BY-SA 4.0** | Tarjeta del dataset `dronefreak/RDD2022` y repo `sekilab/RoadDamageDetector`. |
| onnxruntime (MIT), FastAPI (MIT), Uvicorn (BSD-3), NumPy (BSD-3), Pillow (MIT-CMU), python-multipart (Apache-2.0); solo para exportar: PyTorch (BSD-3), transformers (Apache-2.0) | Permisivas | Metadatos de PyPI. |

Lo que **no** se resuelve aquí: si unos pesos entrenados con datos CC BY-SA son «material adaptado» y heredan el *share-alike* sigue abierto (no es asesoría legal). Como mínimo hay que dar **atribución** al dataset y a los autores de los pesos en la página «Acerca de» o en los términos (tarea del frontend). No se usan los YOLO de Ultralytics (AGPL-3.0).

## Decisiones y justificación

| Decisión | Alternativa descartada y por qué |
|---|---|
| **RF-DETR Nano (Apache-2.0)** sobre RDD2022, sin reentrenar. | YOLOv8n de Ultralytics: un poco más liviano, pero AGPL-3.0 obliga a publicar todo el proyecto bajo AGPL para servirlo por red. Otros pesos RDD2022 públicos tienen licencia dudosa o mAP muy bajo (propuesta del 21/10). |
| **ONNX + onnxruntime en producción**; PyTorch solo en el script de exportación. | Servir con PyTorch: la etapa de exportación, que tiene torch y rfdetr, pesa 2,86 GB frente a los 637 MB de la imagen final, y el arranque sería más lento, sin ganar precisión. ONNX deja un único archivo con hash, fácil de verificar. |
| **Preprocesado idéntico a `RFDETR.predict()`**: bilineal **sin antialias** con centros de medio píxel, implementado en NumPy, y normalización ImageNet. | `PIL.Image.resize`: su bilineal aplica antialias al reducir y cambia las confianzas (lo advierte el propio rfdetr). Paridad medida con torchvision: diferencia máxima 5,4 × 10⁻⁷ (Windows) y 3,9 × 10⁻⁵ (Linux). |
| La **validación** (bytes, formato, píxeles) es de la aplicación; decodificar y correr el modelo van por **puertos** del dominio con adaptadores en infraestructura. | Pillow o NumPy dentro de `application/`: se mezclaría una librería con la regla y los tests del caso de uso necesitarían imágenes reales. Así se prueban con dobles. |
| El **mapeo** etiqueta del modelo → clase de la app vive en el adaptador (`infrastructure`). | Exponer las 4 clases de RDD2022 (opción B): `clase_modelo` del backend tendría que ser una lista. Cambiar de modelo no cambia el contrato. |
| **Piso técnico de confianza 0,10** y máximo 100 detecciones; sin umbral de decisión. | Aplicar 0,50 aquí: el umbral se calibra con fotos de Lima (NC-03b) y es del backend. Devolver los 300 pares sin piso: respuestas grandes de puro ruido. |
| **Una detección por consulta y clase** (si una caja puntúa como grieta longitudinal y transversal, queda la de mayor confianza). | Devolver ambas: duplica cajas idénticas sin cambiar el máximo por clase con el que decide el backend. |
| **`intra_op_num_threads` = 2 fijo** (= vCPU), `inter_op` = 1, ejecución secuencial. | Hilos automáticos: el número de hilos cambia el orden de las sumas y con eso los decimales; con un número fijo, la misma foto da los mismos resultados (D-08). Medido en Docker con `--cpus=2`: 1 hilo 671 ms, **2 hilos 408 ms**, 3 hilos 572 ms, 4 hilos 617 ms (p50 del motor solo); apagar la espera activa no ayudó (479 ms). |
| **Una inferencia a la vez** (candado en `OnnxModelo`) y a lo sumo **2 solicitudes** decodificando o infiriendo (límite en la API). Un solo worker de uvicorn. | Inferencias en paralelo: con 2 vCPU solo se reparten la CPU y suben la memoria. Más workers: duplican el modelo (108 MB más su arena) en memoria. Con 4 clientes a la vez el rendimiento sigue en ~3,3 imágenes/s y la memoria máxima medida fue 478 MiB. |
| **Falla rápido**: si falta `modelo.json` o el `.onnx`, o el hash no coincide, el proceso no arranca. `/salud` responde solo con el modelo cargado. | Arrancar «degradado»: un servicio verde que no puede detectar esconde el problema; en Railway, un despliegue rojo se ve. |
| **Pesos fuera de git**; `modelos/modelo.json` (hash, fuente, versiones, paridad y huella) sí se versiona. El Dockerfile **exporta dentro de la imagen** y falla si el hash no es el registrado. | Subir el `.onnx` (108 MB) al repo, o alojarlo aparte: el primero infla el historial; el segundo agrega un servicio y otra credencial. La exportación es **reproducible byte a byte**: el mismo sha256 en Windows (Python 3.13.3) y en el contenedor Linux (3.13.17). |
| **Telemetría de onnxruntime apagada** (`ORT_DISABLE_TELEMETRY=1` y `disable_telemetry_events()`). | Dejarla: el onnxruntime 1.31 de PyPI para Linux envía eventos 1DS a Microsoft (se vio en los registros del contenedor). Un servicio que procesa fotos de ciudadanos no debe hablar con terceros. |
| **Límite del cuerpo** en un middleware ASGI (`Content-Length` y bytes recibidos) además de los límites del caso de uso. | Solo leer `UploadFile` con tope: Starlette guarda todo el multipart en un temporal antes del endpoint, así que un archivo enorme ya habría llenado disco o memoria. |
| `app/main.py` como **raíz de composición** (no listada en §6). | Armar los adaptadores en `api/`: la presentación dependería de la infraestructura. Es el papel que cumple Spring en el backend. |

## Obtener el modelo

Los pesos no se versionan. Hay dos caminos y los dos dan el mismo `.onnx` (mismo sha256):

**A. Docker (recomendado; es lo que hará Railway).** La primera etapa del `Dockerfile` descarga los pesos de la revisión fijada, exporta y comprueba el hash contra `modelos/modelo.json`:

```bash
docker build -t ciudadviva-inferencia inferencia/      # la etapa de exportación pesa 2,86 GB (torch); la imagen final, 637 MB
```

**B. Local**, para desarrollo y para los tests con el modelo real (Python 3.13):

```bash
cd inferencia
python -m venv .venv-exportar
.venv-exportar/Scripts/python -m pip install -r requirements-exportar.txt     # macOS/Linux: .venv-exportar/bin/python
.venv-exportar/Scripts/python scripts/exportar_onnx.py                         # escribe modelos/rdd2022-rfdetr-nano.onnx y modelo.json
# opcional: comparar con PyTorch en fotos reales guardadas FUERA del repo
.venv-exportar/Scripts/python scripts/exportar_onnx.py --imagenes /ruta/a/fotos
```

El script verifica el sha256 de los pesos descargados, exporta (opset 17), mide la paridad ONNX/PyTorch (falla si el preprocesado difiere en más de 10⁻⁴ o los puntajes en más de 10⁻³) y escribe en `modelo.json` la **huella**: los 10 mejores pares de PyTorch en cada imagen sintética de `scripts/sinteticas.py`. Si el hash cambia respecto del registrado, lo avisa; `--comprobar` lo convierte en error. No necesita token de Hugging Face (el repo es público).

## Cómo correrlo

```bash
cd inferencia
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt         # macOS/Linux: .venv/bin/python
.venv/Scripts/lint-imports                                           # guarda de capas
.venv/Scripts/python -m pytest -rs                                   # sin pesos: 122 pasan y 5 se omiten
.venv/Scripts/uvicorn app.main:crear_app --factory --port 8090       # con el modelo en modelos/
```

Con Docker, limitado a 2 vCPU como en la medición (evita los puertos 8080, 3000 y 5433 de la pila del proyecto):

```bash
docker run --rm -p 8090:8000 --cpus=2 ciudadviva-inferencia
curl -F imagen=@foto.jpg http://localhost:8090/v1/detecciones
```

La imagen corre como usuario sin privilegios (uid 10001), escucha en `$PORT` (8000 por defecto) y tiene `HEALTHCHECK` sobre `/salud`.

### Configuración

Ninguna variable es un secreto (el servicio no usa credenciales).

| Variable | Por defecto | Para qué |
|---|---|---|
| `INFERENCIA_MODELO_DIR` | `inferencia/modelos` (`/app/modelos` en Docker) | Carpeta con `modelo.json` y el `.onnx`. |
| `INFERENCIA_HILOS` | `2` | `intra_op_num_threads`. Debe ser igual al número de vCPU y no cambiar entre despliegues (D-08). |
| `INFERENCIA_MAX_BYTES` | `10485760` (10 MiB) | Máximo del archivo; el mismo que el backend. |
| `INFERENCIA_MAX_MEGAPIXELES` | `16` | Máximo de la imagen. El backend envía fotos saneadas de ≤ 2048 px por lado (≤ 4,2 MP). |
| `INFERENCIA_CONFIANZA_MINIMA` | `0.10` | Piso técnico (no es el umbral de sugerencia). |
| `INFERENCIA_MAX_DETECCIONES` | `100` | Tope de detecciones por respuesta. |
| `PORT` | `8000` | Puerto de uvicorn en Docker. |

Un valor inválido impide arrancar con un mensaje que nombra la variable.

## Cifras medidas (25/10/2026)

Medición con `scripts/medir_latencia.py` contra el contenedor con **`--cpus=2`**, solicitudes HTTP secuenciales tras 3 de calentamiento; la RAM es la de `docker stats`. Máquina: Intel Core i7-13620H (portátil, núcleos P y E), Docker Desktop 29.5 sobre WSL2. La latencia es la del cliente: HTTP, decodificación, preprocesado, modelo y respuesta.

| Conjunto | Solicitudes | p50 | p95 | Máx. | Imágenes/s |
|---|---|---|---|---|---|
| Sintéticas en JPEG 0,85 (384 px a 2048 × 1536) | 30 × 3 corridas | 285–509 ms | 331–764 ms | 350–861 ms | 1,8–3,5 |
| 30 fotos de RDD2022 (512 a 4040 px; fuera del repo) | 90 × 2 corridas | 282–465 ms | 428–640 ms | 455–783 ms | 2,1–3,3 |
| Sintéticas, 4 clientes a la vez | 24 × 2 corridas | 1164–1918 ms | 1377–2221 ms | — | 2,0–3,3 |

| Memoria del contenedor | MiB |
|---|---|
| Recién arrancado, con el modelo cargado | 200–252 |
| Máximo con solicitudes secuenciales (la arena de onnxruntime crece y se mantiene) | 343–426 |
| Máximo con 4 clientes a la vez | 423–478 |

- **Arranque** hasta que `/salud` responde: 3,3–4,4 s (incluye comprobar el sha256 de los 108 MB).
- **Frente a la propuesta** (NO VERIFICADO entonces): latencia estimada 200–600 ms → medida p50 de 282 a 509 ms, dentro del rango; RAM estimada 400–800 MB → medida 200–480 MiB, por debajo. Lejos del límite de 1 s que obligaba a cambiar de modelo.
- **La dispersión entre corridas** (hasta ×1,7) es de la máquina: un portátil con núcleos de distinto rendimiento y gestión de energía. El motor solo (`session.run`, 2 hilos) midió 408 ms de p50 en Docker y 540 ms en Windows nativo en otro momento; durante la exportación, el adaptador completo en Windows nativo tardó 194–311 ms por foto. En Railway hay que volver a medir (NC-04b) con `scripts/medir_latencia.py`.
- El timeout de 3 s de la vista previa (§4.3) alcanza con holgura con una solicitud a la vez; con cola (4 simultáneas) el p95 llegó a 2,2 s.
- **Determinismo:** las tres corridas sobre las mismas imágenes devolvieron el mismo número de detecciones (115, 519, 92), y los tests comparan resultados repetidos.
- Imagen final: 637 MB (Python slim, onnxruntime, NumPy, Pillow y el `.onnx` de 108 MB).

## Pruebas

`python -m pytest -rs`: **127 tests**; sin los pesos, **122 pasan y 5 se omiten**.

| Archivo | Qué prueba | Pesos |
|---|---|---|
| `test_dominio.py` | Vocabulario `bache`/`grieta`, invariantes de `Caja`, `Deteccion`, `VersionModelo` (≤ 40), orden de `Detecciones`, `ImagenRGB`, límites. | No |
| `test_detectar.py` | Caso de uso con dobles: orden de las validaciones (bytes antes de cabecera, píxeles antes de decodificar), formatos, bordes exactos de los límites, fallo del modelo. | No |
| `test_pillow_decodificador.py` | JPEG, PNG y WEBP sintéticos, transparencia sobre blanco, orientación EXIF, archivos dañados y truncados. | No |
| `test_api.py` | Contrato JSON exacto, OpenAPI, todos los errores (400, 413 por bytes, píxeles, `Content-Length` y cuerpo por trozos, 500, 404, 405) y el límite de 2 procesos simultáneos. | No |
| `test_onnx_modelo.py` | Redimensión frente a una fórmula escalar independiente, normalización, decodificación (fondo, piso, recorte, una detección por consulta y clase, máximo de 300 pares) y el adaptador completo con un **`.onnx` sintético** (hash, metadatos, forma, fallo del motor). | No |
| `test_configuracion.py` | Valores por defecto y errores de cada variable. | No |
| `test_main.py` | Raíz de composición con adaptadores reales y el `.onnx` sintético; sin modelo no arranca. | No |
| `test_modelo_real.py` | Versión registrada, **reproduce la huella de PyTorch** de `modelo.json` (mismo preprocesado, modelo y decodificación), contrato y determinismo con el modelo real, servicio completo. | **Sí: se omite sin pesos** |

Las imágenes de los tests son sintéticas (generadas con código). Las fotos de RDD2022 (CC BY-SA 4.0) solo se usaron fuera del repo para medir y comprobar el mapeo.

**CI** (job `inferencia` de `.github/workflows/ci.yml`, `docs/ci.md`): instala `requirements-dev.txt`, corre `lint-imports`, `pytest` sin pesos y la guarda `scripts/verificar_tests.py`, que falla si algo falló, si un `tests/test_*.py` no tiene casos, si se omitió algo fuera de `test_modelo_real.py` o si los ejecutados bajan de `MIN_PYTEST_INFERENCIA` (122).

## Pendiente

- **NC-03b**: conjunto de validación de Lima (≥ 200 fotos del equipo), calibración del umbral y precisión y cobertura por categoría. `scripts/exportar_onnx.py --imagenes` ya compara contra PyTorch; falta el script de evaluación con etiquetas.
- **NC-04b**: `InferenciaHttpAdapter` en el backend (multipart `imagen`, timeout 3 s) y despliegue en Railway por la red privada, con `INFERENCIA_HILOS` igual a las vCPU del plan, y volver a medir allí.
- **Atribución** de RDD2022 y de los pesos en «Acerca de» o en los términos, y la pregunta abierta del *share-alike*.
- Construir la imagen Docker en la CI (como el job `imagen` pendiente del backend): hoy no se hace porque su primera etapa descarga torch y los pesos en cada corrida.
