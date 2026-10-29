# Servicio de inferencia — Ciudad Viva

Servicio interno con dos funciones:

- **Detecta daños viales en una foto** (NC-03, fase 1 de la propuesta `project-context/decisions/propuestas/2026-10-21-ml-clases-modelo.md`): recibe la imagen y devuelve las cajas de `bache` y `grieta` con su confianza. Lo consume el módulo `clasificacion` del backend (NC-04b) para **sugerir** la categoría de un reporte; la decisión siempre es del ciudadano.
- **Mide si una foto tiene contenido sexual explícito** (NC-10a, D-15, propuesta `project-context/decisions/propuestas/2026-10-28-moderacion-de-contenido.md`): devuelve un puntaje entre 0 y 1. Lo consume el módulo `moderacion` del backend (NC-10b), que rechaza la foto antes de guardarla.

Lo común:

- FastAPI + **onnxruntime en CPU**, sin GPU ni PyTorch en producción.
- Modelos, exportados a ONNX con scripts versionados:
  - **RF-DETR Nano afinado en RDD2022** (`dronefreak/rdd2022-rfdetr-nano`, Apache-2.0);
  - **Marqo `nsfw-image-detection-384`** (ViT-Tiny de timm, Apache-2.0).
- Capas de `ARCHITECTURE.md` §6, con guarda automática (import-linter).
- **Solo mide.** Las decisiones las toma el backend:
  - el umbral de sugerencia (0,50) y la clase dominante, `clasificacion/domain/PoliticaDeSugerencia`;
  - el umbral de rechazo de la foto (0,70), `moderacion/domain/PoliticaDeModeracion`.

## Contrato (`/v1`)

Lo define este servicio y lo consumen `clasificacion/infra` y `moderacion/infra` (ARCHITECTURE.md §6 y §7). Un cambio incompatible pasa a `/v2`.

```
POST /v1/detecciones            multipart/form-data, campo «imagen» (JPEG, PNG o WEBP)
200 {
  "version_modelo": "rdd2022-rfdetr-nano-66429f3-20934b9a",
  "detecciones": [
    { "clase": "bache",  "confianza": 0.934, "caja": [3.3, 518.7, 600.0, 599.7] },
    { "clase": "grieta", "confianza": 0.144, "caja": [290.3, 509.0, 306.9, 534.3] }
  ]
}

POST /v1/moderacion             multipart/form-data, campo «imagen» (JPEG, PNG o WEBP)
200 { "version_modelo": "nsfw-vit-tiny-384-0c26ec2-1ba7cf26", "puntaje": 0.059 }

GET /salud                      200 { "estado": "ok", "version_modelo": "…", "version_moderacion": "…" }
```

**Detecciones:**

- `clase`: solo `bache` o `grieta` (vocabulario decidido el 21/10, opción A).
- `confianza`: entre 0 y 1. Se devuelven **todas** las detecciones por encima de un **piso técnico** de 0,10 (máximo 100), de mayor a menor confianza. El piso no es el umbral de decisión: solo evita devolver los 300 candidatos de ruido del DETR y deja margen para calibrar el umbral en NC-03b.
- `caja`: `[x1, y1, x2, y2]` en píxeles de la imagen recibida, ya orientada (origen arriba a la izquierda).
- `version_modelo`: artefacto exacto que produjo las detecciones (≤ 40 caracteres, cabe en `version_modelo_sugerencia VARCHAR(40)`).

**Moderación (NC-10a):**
- `puntaje`: probabilidad de contenido sexual explícito, entre 0 y 1. Es el **máximo de dos recortes** de 384 px que cubren toda la foto (ver «Modelo de moderación»). **Siempre se devuelve**: no hay piso, porque un solo número no tiene ruido que filtrar.
- `version_modelo`: `nsfw-vit-tiny-384-<revisión de HF, 7>-<sha256 del .onnx, 8>` (≤ 40 caracteres).
- La misma foto da el mismo puntaje en la vista previa y en la creación: hilos fijos (`INFERENCIA_MODERACION_HILOS`) y la misma versión.

**Salud:** `version_moderacion` es un campo nuevo y compatible. `/salud` responde solo si los dos modelos están cargados.

Documentación interactiva en `/docs` y esquema en `/openapi.json`.

**Errores**, los mismos en `/v1/detecciones` y `/v1/moderacion` (la validación previa es la misma, `ValidacionDeImagen`), con la forma `{"codigo": str, "mensaje": str}` salvo el 503 de la cola, que lo responde uvicorn antes de llegar a la app:

| Caso | Estado | `codigo` |
|---|---|---|
| Archivo vacío, que no es imagen, dañado o de formato no permitido (GIF, TIFF…: Pillow ni siquiera prueba esos lectores) | 400 | `imagen_invalida` |
| Falta el campo `imagen` o la solicitud no es multipart | 400 | `solicitud_invalida` |
| Más de 10 MiB, más de 8 MP, o cuerpo por encima del límite | 413 | `imagen_demasiado_grande` |
| Falla el motor de inferencia | 500 | `error_de_inferencia` |
| Cualquier otro error (incluido quedarse sin memoria al decodificar) | 500 | `error_interno` |
| Cola llena: `INFERENCIA_MAX_CONCURRENCIA` conexiones o tareas abiertas | 503 | — (texto plano de uvicorn) |

**El tope de conexiones es uno solo para todo el proceso**, no uno por endpoint: uvicorn cuenta las conexiones abiertas (también las de keep-alive y las de `/salud`) sin mirar la ruta. Con el valor por defecto (10), la décima conexión simultánea recibe 503 en cualquier endpoint. Se comprobó contra el contenedor: con 4 conexiones keep-alive de detección y 4 de moderación abiertas, una novena se atiende (200); con 9 abiertas, en cualquier combinación, la décima recibe 503 en los dos endpoints. Lo que sí es propio de cada endpoint es el limitador de procesos (2) y el candado del modelo.

Qué hace el backend con un error:
- **Detecciones:** cualquier respuesta que no sea 200 (o un timeout) es «sin sugerencia»: la IA nunca bloquea un reporte (§4.3). Handoff de NC-04b: `project-context/handoffs/2026-10-25-contrato-inferencia-v1.md`.
- **Moderación:** falla cerrado (decisión del 28/10): un reporte con foto recibe 503 `MODERACION_NO_DISPONIBLE`. Handoff de NC-10b: `project-context/handoffs/2026-10-28-contrato-moderacion-v1.md`.

## Arquitectura en capas

```
inferencia/
├── app/
│   ├── main.py            RAÍZ DE COMPOSICIÓN  crear_app(): arma adaptadores, casos de uso y FastAPI
│   ├── api/               PRESENTACIÓN    routers (detecciones, moderacion, salud), esquemas.py (Pydantic), errores,
│   │                                      límite de cuerpo
│   ├── application/       APLICACIÓN      ValidacionDeImagen (común), DetectarDanos y ModerarImagen: validan,
│   │                                      decodifican (por puerto) e invocan su modelo
│   ├── domain/            DOMINIO         ClaseDano, Caja, Deteccion, Detecciones, PuntajeModeracion, VersionModelo,
│   │                                      ImagenRGB, LimitesDeImagen, errores y puertos (DecodificadorDeImagen,
│   │                                      ModeloDeDeteccion, ModeloDeModeracion)
│   └── infrastructure/    INFRAESTRUCTURA OnnxModelo y OnnxModeracion (onnxruntime), PillowDecodificador,
│                                          Configuracion (entorno)
├── modelos/               modelo.json y moderacion.json (versionados: hash, paridad y huella); los .onnx no se versionan
├── scripts/               exportar_onnx.py, exportar_moderacion.py, sinteticas.py, medir_latencia.py,
│                          calibrar_moderacion.py, verificar_tests.py
├── tests/
├── Dockerfile, requirements*.txt, pyproject.toml
```

`DetectarDanos(datos)` y `ModerarImagen(datos)`, en este orden, para que un archivo hostil no ocupe memoria ni CPU (los pasos 1 a 3 son `ValidacionDeImagen`, la misma en los dos):

1. Bytes: vacío → 400; más de `max_bytes` → 413.
2. Cabecera **sin decodificar** (formato y dimensiones): formato fuera de JPEG/PNG/WEBP → 400; más de `max_pixeles` → 413 (bomba de descompresión).
3. Decodificar a RGB orientado (EXIF; transparencia sobre blanco, como el saneador del backend).
4. Modelo → `Detecciones` ordenadas, o `PuntajeModeracion`.

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

## Modelo de moderación (NC-10a)

Elegido y aprobado por el usuario el 28/10 (propuesta `2026-10-28-moderacion-de-contenido.md`, §1, que compara OpenNSFW2, NudeNet y los ViT-base de Falconsai y AdamCodd).

| | |
|---|---|
| Pesos | `Marqo/nsfw-image-detection-384`, revisión **`0c26ec22111b83f106d72a55f611ec35962bcb65`** (fijada en `scripts/exportar_moderacion.py`), `model.safetensors`, sha256 `6bf2e0f6…eefce` (verificado al descargar). También se comprueba su `config.json`: arquitectura, etiquetas y preprocesado. |
| Arquitectura | `vit_tiny_patch16_384` de timm 1.0.30: 5 597 762 parámetros, entrada 384 × 384, etiquetas `["NSFW", "SFW"]` |
| ONNX | `modelos/nsfw-vit-tiny-384.onnx`, 22 489 929 bytes, opset 17 (`torch.onnx.export` clásico, como rfdetr), sha256 **`1ba7cf26c5fe7b9f2ef58381b378691ca27c2953bc3ca0bf814fdab5c3ed402e`** (registrado en `modelos/moderacion.json`) |
| Métricas del autor | 98,56 % de exactitud en su prueba de 20 000 imágenes (mitad NSFW): fotos, dibujos, memes e imágenes generadas. Según su gráfica, con umbral 0,7 la cobertura de NSFW ronda 0,96 y la precisión 0,99. **Las mide el autor sobre datos propios**, que no publica. |

**Preprocesado** (`infrastructure/onnx_moderacion.py`): es el de evaluación de timm para este modelo, con una diferencia decidida el 28/10.
- Igual que timm: `Resize(384)` bicúbico de Pillow sobre el lado menor (`crop_pct` 1,0), `/255` y normalización 0,5/0,5.
- En vez del recorte central de timm, que en una foto 4:3 deja fuera el 12,5 % de cada lado, hay **dos recortes de 384**: uno al principio y otro al final del lado mayor. Hasta 2:1 (4:3, 16:9) se solapan o se tocan y cubren toda la foto. El `puntaje` es **el máximo** de los dos.
- Una foto **más alargada que 2:1** (una panorámica) no cabría en dos recortes. Su lado mayor se comprime a 768 antes de recortar, así que los dos recortes siguen cubriendo todo. La foto se deforma (en la proporción / 2), pero nada queda sin analizar y el costo no crece con la proporción. Las fotos del celular (4:3 y 16:9) no se deforman.
- Una foto cuadrada da un solo recorte.

**Paridad con timm** (`scripts/exportar_moderacion.py`, dentro de Docker; registrada en `moderacion.json`), sobre 11 imágenes sintéticas (20 recortes), incluidas dos más alargadas que 2:1 y tres de colores que mueven el puntaje hasta 0,33:

| Medida | Diferencia máxima | Tolerancia |
|---|---|---|
| Recortes del adaptador frente a torchvision con el `Resize` de timm | 0 | 10⁻⁴ |
| Recorte central de `timm.data.create_transform` frente al mismo recorte del adaptador | 0 | 10⁻⁴ |
| Logits ONNX frente a timm (PyTorch) | 2,15 × 10⁻⁶ | 10⁻³ |
| **Puntaje** del adaptador (`OnnxModeracion.moderar`) frente al máximo del softmax de timm | **2,01 × 10⁻⁷** | 10⁻³ (aceptación de NC-10a) |

La exportación es **reproducible byte a byte**: el mismo sha256 en tres corridas (dos en un contenedor y la de `docker build`). La huella de timm (puntaje por recorte de cada imagen sintética) la reproduce `tests/test_modelo_real.py` con las versiones del servicio (Pillow 13.0.0 y NumPy 2.5.4; la exportación usa Pillow 12.3.0 y NumPy 2.5.2).

**`version_modelo`** = `nsfw-vit-tiny-384-<revisión HF, 7>-<sha256 del .onnx, 8>` (34 caracteres).

### Licencias y atribución de la moderación (verificadas el 28/10/2026)

| Componente | Licencia | Dónde se comprobó |
|---|---|---|
| Pesos `Marqo/nsfw-image-detection-384` (Marqo AI) | **Apache-2.0** | Metadatos de la tarjeta (`license: apache-2.0`) en la revisión fijada. |
| Modelo base `timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k` | Apache-2.0 | Tarjeta en HF (`license: apache-2.0`; datos ImageNet-21k e ImageNet-1k). |
| `timm` (código de la arquitectura; solo para exportar) | Apache-2.0 | Metadatos de PyPI. |
| Datos de entrenamiento de Marqo | Propios, sin publicar | La tarjeta dice 220 000 imágenes (fotos, dibujos, memes, imágenes generadas) y no da su procedencia. |

**Atribución:** «Marqo AI, `nsfw-image-detection-384` (Hugging Face), Apache-2.0», junto a RF-DETR en §13 de los términos (propuesta, §1). Va en `moderacion.json` (`fuente.atribucion`). Apache-2.0 no exige más que conservar el aviso de licencia; los pesos no se redistribuyen en el repositorio.

## Decisiones y justificación

| Decisión | Alternativa descartada y por qué |
|---|---|
| **RF-DETR Nano (Apache-2.0)** sobre RDD2022, sin reentrenar. | YOLOv8n de Ultralytics: un poco más liviano, pero AGPL-3.0 obliga a publicar todo el proyecto bajo AGPL para servirlo por red. Otros pesos RDD2022 públicos tienen licencia dudosa o mAP muy bajo (propuesta del 21/10). |
| **ONNX + onnxruntime en producción**; PyTorch solo en el script de exportación. | Servir con PyTorch: la etapa de exportación, que tiene torch y rfdetr, pesa 2,86 GB frente a los 637 MB de la imagen final, y el arranque sería más lento, sin ganar precisión. ONNX deja un único archivo con hash, fácil de verificar. |
| **Preprocesado idéntico a `RFDETR.predict()`**: bilineal **sin antialias** con centros de medio píxel, implementado en NumPy, y normalización ImageNet. | `PIL.Image.resize`: su bilineal aplica antialias al reducir y cambia las confianzas (lo advierte el propio rfdetr). Paridad con PyTorch registrada en `modelo.json` (exportación en Windows): preprocesado 5,4 × 10⁻⁷, puntajes 4,3 × 10⁻⁶, cajas 3,9 × 10⁻⁵. En la exportación dentro del contenedor Linux (`--comprobar`, no se registra): 3,9 × 10⁻⁵, 3,0 × 10⁻⁶ y 3,4 × 10⁻⁵. |
| La **validación** (bytes, formato, píxeles) es de la aplicación; decodificar y correr el modelo van por **puertos** del dominio con adaptadores en infraestructura. | Pillow o NumPy dentro de `application/`: se mezclaría una librería con la regla y los tests del caso de uso necesitarían imágenes reales. Así se prueban con dobles. |
| El **mapeo** etiqueta del modelo → clase de la app vive en el adaptador (`infrastructure`). | Exponer las 4 clases de RDD2022 (opción B): `clase_modelo` del backend tendría que ser una lista. Cambiar de modelo no cambia el contrato. |
| **Piso técnico de confianza 0,10** y máximo 100 detecciones; sin umbral de decisión. | Aplicar 0,50 aquí: el umbral se calibra con fotos de Lima (NC-03b) y es del backend. Devolver los 300 pares sin piso: respuestas grandes de puro ruido. |
| **Una detección por consulta y clase** (si una caja puntúa como grieta longitudinal y transversal, queda la de mayor confianza). | Devolver ambas: duplica cajas idénticas sin cambiar el máximo por clase con el que decide el backend. |
| **`intra_op_num_threads` = 2 fijo** (= vCPU), `inter_op` = 1, ejecución secuencial. | Hilos automáticos: el número de hilos cambia el orden de las sumas y con eso los decimales; con un número fijo, la misma foto da los mismos resultados (D-08). Medido en Docker con `--cpus=2`: 1 hilo 671 ms, **2 hilos 408 ms**, 3 hilos 572 ms, 4 hilos 617 ms (p50 del motor solo); apagar la espera activa no ayudó (479 ms). |
| **Una inferencia a la vez** (candado en `OnnxModelo`) y a lo sumo **2 solicitudes** decodificando o infiriendo (límite en la API). Un solo worker de uvicorn. | Inferencias en paralelo: con 2 vCPU solo se reparten la CPU y suben la memoria. Más workers: duplican el modelo (108 MB más su arena) en memoria. Con 4 clientes a la vez el rendimiento sigue en ~3,3 imágenes/s y la memoria máxima medida fue 478 MiB. |
| **Cola con tope**: uvicorn con `--limit-concurrency 10` (`INFERENCIA_MAX_CONCURRENCIA`) responde **503** cuando hay 10 conexiones o tareas abiertas. | Cola sin tope: cada solicitud en espera retiene su archivo, y las que esperan más de los 3 s del backend se procesan para nadie. 10 ≈ 2 en proceso más las que se alcanzan a atender en 3 s a ~0,3–0,5 s por imagen. Las conexiones en keep-alive cuentan: el pool del adaptador del backend tiene que quedar por debajo (en NC-04 hay a lo sumo una vista previa a la vez más el executor de 2–4 hilos). |
| **Dependencias con lock y hashes** (`requirements.lock`, `requirements-dev.lock`): versión y sha256 de cada paquete, también de los transitivos. El Dockerfile y la CI instalan con `--require-hashes --no-deps`. | Solo `requirements.txt` con las directas fijas: una versión nueva de una transitiva (protobuf, pydantic-core, starlette…) entraría sin aviso en la siguiente construcción, y un paquete alterado en el índice también. Ver «Dependencias». |
| **Falla rápido**: si falta `modelo.json` o el `.onnx`, o el hash no coincide, el proceso no arranca. `/salud` responde solo con el modelo cargado. | Arrancar «degradado»: un servicio verde que no puede detectar esconde el problema; en Railway, un despliegue rojo se ve. |
| **Pesos fuera de git**; `modelos/modelo.json` (hash, fuente, versiones, paridad y huella) sí se versiona. El Dockerfile **exporta dentro de la imagen** y falla si el hash no es el registrado. | Subir el `.onnx` (108 MB) al repo, o alojarlo aparte: el primero infla el historial; el segundo agrega un servicio y otra credencial. La exportación es **reproducible byte a byte**: el mismo sha256 en Windows (Python 3.13.3) y en el contenedor Linux (3.13.17). |
| **Telemetría de onnxruntime apagada** (`ORT_DISABLE_TELEMETRY=1` y `disable_telemetry_events()`). | Dejarla: el onnxruntime 1.31 de PyPI para Linux envía eventos 1DS a Microsoft (se vio en los registros del contenedor). Un servicio que procesa fotos de ciudadanos no debe hablar con terceros. |
| **Límite del cuerpo** en un middleware ASGI (`Content-Length` y bytes recibidos) además de los límites del caso de uso. | Solo leer `UploadFile` con tope: Starlette guarda todo el multipart en un temporal antes del endpoint, así que un archivo enorme ya habría llenado disco o memoria. |
| `app/main.py` como **raíz de composición** (no listada en §6). | Armar los adaptadores en `api/`: la presentación dependería de la infraestructura. Es el papel que cumple Spring en el backend. |
| **Moderación en su propio endpoint** (`/v1/moderacion`, D-15) y el servicio **solo mide**: el umbral de rechazo es del backend. | Sumar el puntaje a `/v1/detecciones`: la creación correría RF-DETR solo para moderar y la sugerencia oficial correría la moderación sin usarla (propuesta, §2, opción B). |
| **Dos recortes de 384 y el máximo**, en vez del recorte central de timm. Más de 2:1, el lado mayor se comprime a 768. | El recorte central deja fuera el 12,5 % de cada lado de una foto 4:3: alcanza con poner el contenido en un borde. Un recorte por cada 384 px de una panorámica: el costo crecería con la proporción, que el cliente controla (8 MP admiten 80 000 × 100). **Queda como duda para el usuario** una vía intermedia: hasta 3 o 4 recortes y comprimir solo por encima de 3:1 o 4:1. Deformaría menos una panorámica, que hoy es el caso que más baja la sensibilidad (una vía de evasión acotada: la foto la sube la PWA desde la cámara, 4:3 o 16:9), a cambio de hasta el doble de costo en esas fotos. |
| **Limitador (2) y candado propios** de la moderación, `INFERENCIA_MODERACION_HILOS=1` fijo. | Compartir los de RF-DETR: una moderación (~0,1 s por recorte) esperaría detrás de detecciones de ~0,4 s, y la creación del reporte la espera de forma síncrona. Con 1 hilo, la otra vCPU queda para RF-DETR, y con un número fijo la misma foto da el mismo puntaje en la vista previa y en la creación. |
| **La misma validación** (`ValidacionDeImagen`) en los dos casos de uso. | Copiarla en `ModerarImagen`: los dos endpoints podrían responder distinto a la misma foto, y el contrato dice que los errores son los mismos. |
| **`MALLOC_ARENA_MAX=2` y `MALLOC_MMAP_THRESHOLD_=1048576`** en la imagen. | El comportamiento por defecto de glibc: con 4 clientes y fotos de 8 MP, el máximo llegó a 845–847 MiB (656 MiB solo con RF-DETR, en la imagen de NC-03), porque cada hilo abre su arena y se queda con lo liberado. Con los dos ajustes, 487–507 MiB en tres corridas, con la misma latencia y los mismos resultados. No cambia ningún número del modelo. |
| **Tope de 8 MP** (`INFERENCIA_MAX_MEGAPIXELES=8`), decidido por el usuario el 28/10: por encima, 413 en `/v1/detecciones` y `/v1/moderacion`. | 16 MP, el tope con el que se entregó NC-10a: con 4 clientes mezclados y fotos en el tope, la RAM llegaba a 755–858 MiB, por encima de los 700 de la aceptación. Con 8 MP el peor caso medido es ~505 MiB (498–507). El backend sanea a ≤ 2048 px por lado (≤ 4,2 MP), así que ninguna foto suya llega al 413: solo lo ve un cliente que envíe fotos crudas de más de 8 MP. |

## Obtener el modelo

Los pesos no se versionan. Hay dos caminos y los dos dan los mismos `.onnx` (mismo sha256):

**A. Docker (recomendado; es lo que hará Railway).** La primera etapa del `Dockerfile` descarga los pesos de los dos modelos de su revisión fijada, exporta, mide la paridad y comprueba los hashes contra `modelos/modelo.json` y `modelos/moderacion.json`:

```bash
docker build -t ciudadviva-inferencia inferencia/      # la etapa de exportación pesa ~2,9 GB (torch); la imagen final, 680 MB
```

**B. Local**, para desarrollo y para los tests con el modelo real (Python 3.13):

```bash
cd inferencia
python -m venv .venv-exportar
.venv-exportar/Scripts/python -m pip install -r requirements-exportar.txt     # macOS/Linux: .venv-exportar/bin/python
.venv-exportar/Scripts/python scripts/exportar_onnx.py                         # escribe modelos/rdd2022-rfdetr-nano.onnx y modelo.json
.venv-exportar/Scripts/python scripts/exportar_moderacion.py                   # escribe modelos/nsfw-vit-tiny-384.onnx y moderacion.json
# opcional: comparar con PyTorch o timm en fotos reales guardadas FUERA del repo
.venv-exportar/Scripts/python scripts/exportar_onnx.py --imagenes /ruta/a/fotos
.venv-exportar/Scripts/python scripts/exportar_moderacion.py --imagenes /ruta/a/fotos
```

En Windows, torch puede no instalarse por las rutas largas. Entonces sirve un contenedor con el entorno de exportación y `inferencia/` montado. Así se generó `moderacion.json` el 28/10. La imagen se arma con las líneas del `Dockerfile` hasta `RUN pip install -r requirements-exportar.txt`, porque la etapa `exportador` entera fallaría en `--comprobar` mientras el `.json` no exista o esté viejo:

```bash
sed -n '1,/^RUN pip install -r requirements-exportar.txt/p' inferencia/Dockerfile \
  | docker build -f- -t ciudadviva-inferencia-exportador inferencia/
docker run --rm -v "$PWD/inferencia:/src/repo" -w /src/repo ciudadviva-inferencia-exportador python scripts/exportar_moderacion.py
```

La fecha de `exportacion.fecha` en `moderacion.json` (`2026-10-29`) es la del reloj UTC del contenedor; en Lima era el 28/10 por la noche.

`exportar_onnx.py` verifica el sha256 de los pesos descargados, exporta (opset 17), mide la paridad ONNX/PyTorch (falla si el preprocesado difiere en más de 10⁻⁴ o los puntajes en más de 10⁻³) y escribe en `modelo.json` la **huella**: los 10 mejores pares de PyTorch en cada imagen sintética de `scripts/sinteticas.py`. `exportar_moderacion.py` hace lo mismo con timm (paridad de preprocesado, logits y puntajes; huella de puntajes por recorte en `moderacion.json`). Si el hash cambia respecto del registrado, lo avisan; `--comprobar` lo convierte en error. No necesitan token de Hugging Face (los repos son públicos).

## Dependencias

| Archivo | Qué es | Quién lo usa |
|---|---|---|
| `requirements.txt` | Dependencias **directas** del servicio, con versión fija. Se edita a mano. | Entrada del lock. |
| `requirements.lock` | Todo lo que instala el servicio (21 paquetes), con versión y **hashes**. Generado. | `Dockerfile` (`pip install --require-hashes --no-deps`). |
| `requirements-dev.txt` | Lo anterior más pytest, httpx2, import-linter y onnx. Se edita a mano. | Entrada del lock de desarrollo. |
| `requirements-dev.lock` | Todo lo de desarrollo (37 paquetes), con versión y hashes. Generado. | CI y desarrollo local. |
| `requirements-exportar.txt` | Entorno de `scripts/exportar_onnx.py` y `scripts/exportar_moderacion.py` (torch CPU, rfdetr, timm…). | Etapa `exportador` del Dockerfile y el venv de exportación. |

Los locks se generan con `uv pip compile --universal --generate-hashes` (el comando exacto está en la cabecera de cada uno). Se eligió `uv` y no `pip-compile` (pip-tools) porque `--universal` resuelve para **todas las plataformas** a la vez y deja los marcadores (`colorama ; sys_platform == 'win32'`): el mismo lock sirve en Windows (desarrollo), en el runner de Ubuntu y en el contenedor Linux. `pip-compile` resuelve solo para la plataforma donde corre, así que un lock generado en Windows podría no instalar en Linux con `--require-hashes`, o al revés. Para **instalar** basta `pip`; `uv` solo hace falta para regenerar (por ejemplo, en un venv aparte: `pip install uv==0.13.5`). Al cambiar una versión en `requirements*.txt`, se regeneran los dos locks en el mismo commit.

El entorno de exportación **no** tiene lock: torch sale del índice de PyTorch con versiones `+cpu` por plataforma. Lo protege otra guarda: la etapa `exportador` falla si un `.onnx` no es byte a byte el registrado en `modelo.json` o `moderacion.json`. Sumar timm 1.0.30 (NC-10a) no cambió el hash de RF-DETR. La huella de `modelo.json` se generó en ese entorno, con **pillow 12.3.0 y numpy 2.5.2**; el servicio usa pillow 13.0.0 y numpy 2.5.4, y `tests/test_modelo_real.py` comprueba que con esas versiones se reproduce dentro de la tolerancia (10⁻³ en confianza, 0,5 px en las cajas).

## Cómo correrlo

```bash
cd inferencia
python -m venv .venv
.venv/Scripts/python -m pip install --require-hashes --no-deps -r requirements-dev.lock   # macOS/Linux: .venv/bin/python
.venv/Scripts/lint-imports                                           # guarda de capas
.venv/Scripts/python -m pytest -rs                                   # sin pesos: 264 pasan y 9 se omiten
.venv/Scripts/uvicorn app.main:crear_app --factory --port 8090       # con el modelo en modelos/
```

Con Docker, limitado a 2 vCPU como en la medición (evita los puertos 8080, 3000 y 5433 de la pila del proyecto):

```bash
docker run --rm -p 8090:8000 --cpus=2 ciudadviva-inferencia
curl -F imagen=@foto.jpg http://localhost:8090/v1/detecciones
curl -F imagen=@foto.jpg http://localhost:8090/v1/moderacion
```

La imagen corre como usuario sin privilegios (uid 10001), escucha en `$PORT` (8000 por defecto) y tiene `HEALTHCHECK` sobre `/salud`.

### Configuración

Ninguna variable es un secreto (el servicio no usa credenciales).

| Variable | Por defecto | Para qué |
|---|---|---|
| `INFERENCIA_MODELO_DIR` | `inferencia/modelos` (`/app/modelos` en Docker) | Carpeta con `modelo.json`, `moderacion.json` y los dos `.onnx`. |
| `INFERENCIA_HILOS` | `2` | `intra_op_num_threads` de RF-DETR. Debe ser igual al número de vCPU y no cambiar entre despliegues (D-08). |
| `INFERENCIA_MODERACION_HILOS` | `1` | `intra_op_num_threads` de la moderación. **Fijo**: con el mismo número de hilos, la misma foto da el mismo puntaje en la vista previa y en la creación. Deja la otra vCPU para RF-DETR. |
| `INFERENCIA_MAX_BYTES` | `10485760` (10 MiB) | Máximo del archivo; el mismo que el backend. |
| `INFERENCIA_MAX_MEGAPIXELES` | `8` | Máximo de la imagen; por encima, 413 en los dos endpoints. Acota el peor caso de RAM a ~505 MiB con los dos modelos (ver «Decisiones»). El backend envía fotos saneadas de ≤ 2048 px por lado (≤ 4,2 MP). |
| `INFERENCIA_CONFIANZA_MINIMA` | `0.10` | Piso técnico (no es el umbral de sugerencia). |
| `INFERENCIA_MAX_DETECCIONES` | `100` | Tope de detecciones por respuesta. |
| `INFERENCIA_MAX_CONCURRENCIA` | `10` (Docker) | `--limit-concurrency` de uvicorn: con ese número de conexiones o tareas abiertas responde **503** (texto plano, no JSON). Las conexiones en keep-alive cuentan, y el tope es **uno para todo el proceso**: cuenta los dos endpoints y `/salud`. |
| `INFERENCIA_HOST` | `0.0.0.0` (Docker) | Dirección de escucha. `0.0.0.0` es solo IPv4. **Vacío** escucha IPv4 e IPv6 a la vez (probado en el contenedor: responden `127.0.0.1` y `[::1]`). `::` con uvicorn es **solo IPv6** (asyncio fija `IPV6_V6ONLY`) y deja sin respuesta el `HEALTHCHECK`, que usa `127.0.0.1`. Hay que verificar en NC-04b si la red privada de Railway es solo IPv6; si lo es, usar el valor vacío. |
| `PORT` | `8000` | Puerto de uvicorn en Docker. |

Un valor inválido impide arrancar con un mensaje que nombra la variable.

## Cifras medidas (25/10/2026)

Medición con `scripts/medir_latencia.py` contra el contenedor con **`--cpus=2`**, solicitudes HTTP secuenciales tras 3 de calentamiento; la RAM es la de `docker stats`. Máquina: Intel Core i7-13620H (portátil, núcleos P y E), Docker Desktop 29.5 sobre WSL2. La latencia es la del cliente: HTTP, decodificación, preprocesado, modelo y respuesta.

| Conjunto | Solicitudes | p50 | p95 | Máx. | Imágenes/s |
|---|---|---|---|---|---|
| Sintéticas en JPEG 0,85 (384 px a 2048 × 1536) | 30 × 3 corridas | 285–509 ms | 331–764 ms | 350–861 ms | 1,8–3,5 |
| 30 fotos de RDD2022 (512 a 4040 px; fuera del repo) | 90 × 2 y 60 × 1 corridas | 210–465 ms | 305–640 ms | 405–783 ms | 2,1–4,5 |
| Sintéticas, 4 clientes a la vez | 24 × 2 y 18 × 1 corridas | 805–1918 ms | 845–2221 ms | — | 2,0–4,9 |

| Memoria del contenedor | MiB |
|---|---|
| Recién arrancado, con el modelo cargado | 200–252 |
| Máximo con solicitudes secuenciales (la arena de onnxruntime crece y se mantiene) | 343–426 |
| Máximo con 4 clientes a la vez | 423–478 |

- **Arranque** hasta que `/salud` responde: 3,3–4,4 s (incluye comprobar el sha256 de los 108 MB).
- **Frente a la propuesta** (NO VERIFICADO entonces): latencia estimada 200–600 ms → medida p50 de 210 a 509 ms, dentro del rango; RAM estimada 400–800 MB → medida 200–480 MiB, por debajo. Lejos del límite de 1 s que obligaba a cambiar de modelo.
- **La dispersión entre corridas** (hasta ×2,4) es de la máquina: un portátil con núcleos de distinto rendimiento y gestión de energía. El motor solo (`session.run`, 2 hilos) midió 408 ms de p50 en Docker y 540 ms en Windows nativo en otro momento; durante la exportación, el adaptador completo en Windows nativo tardó 194–311 ms por foto. En Railway hay que volver a medir (NC-04b) con `scripts/medir_latencia.py`.
- El timeout de 3 s de la vista previa (§4.3) alcanza con holgura con una solicitud a la vez; con cola (4 simultáneas) el p95 llegó a 2,2 s.
- **Determinismo:** las tres corridas sobre las mismas imágenes devolvieron el mismo número de detecciones (115 por corrida de sintéticas, 173 por pasada de las 30 fotos, 23 por pasada concurrente), y los tests comparan resultados repetidos.
- Imagen final: 637 MB (Python slim, onnxruntime, NumPy, Pillow y el `.onnx` de 108 MB).

## Cifras medidas con la moderación (28/10/2026, NC-10a)

Misma máquina y mismo método (`--cpus=2`, `docker stats`), con la imagen `ciudadviva-inferencia:nc10a` (los dos modelos y los ajustes `MALLOC_*`). `scripts/medir_latencia.py --ruta moderacion|detecciones|mezcla`. Los rangos son de dos construcciones de la imagen: la de la entrega y la que atendió la revisión. La muestra de RDD2022 son **350 fotos** del test, 50 por país (China con dron y en moto, Chequia, India, Japón, Noruega y EE. UU.; de 512 × 512 a 4040 × 2035), elegidas al azar con semilla fija y guardadas fuera del repo. «Saneadas» son esas fotos llevadas a JPEG de ≤ 2048 px por lado y calidad 85, como las envía el backend; «crudas», tal cual (las de Noruega pasan de 7 MP).

| Carga | Endpoint | Solicitudes | p50 | p95 | Máx. |
|---|---|---|---|---|---|
| Secuencial, sintéticas | `/v1/moderacion` | 30 | 220 ms | 274 ms | 284 ms |
| Secuencial, 350 fotos saneadas | `/v1/moderacion` | 350 | **124 ms** | **259 ms** | 296 ms |
| Secuencial, sintéticas | `/v1/detecciones` | 30 | 209 ms | 250 ms | 333 ms |
| 4 clientes, mitad y mitad, 350 fotos saneadas | `/v1/moderacion` | 175 | 229–255 ms | 1194–1228 ms | 1499–1510 ms |
| | `/v1/detecciones` | 175 | 978–1026 ms | 1139–1278 ms | 1495–1613 ms |
| 4 clientes, mitad y mitad, 350 fotos crudas | `/v1/moderacion` | 175 | 234–271 ms | 1467–1485 ms | 1628–1752 ms |
| | `/v1/detecciones` | 175 | 997–1114 ms | 1277–1313 ms | 1641–1788 ms |
| 4 clientes, mitad y mitad, sintéticas | `/v1/moderacion` | 18 | 1187 ms | 1390 ms | 1501 ms |
| | `/v1/detecciones` | 18 | 790 ms | 1053 ms | 1085 ms |
| 4 clientes, mitad y mitad, 4 sintéticas de 16 MP (el tope de entonces; con el de 8 MP responden 413) | `/v1/moderacion` | 30 × 2 | 1591–1679 ms | 1773–2062 ms | 1827–2105 ms |
| | `/v1/detecciones` | 30 × 2 | 1419–1508 ms | 1775–1840 ms | 1818–2025 ms |

| Memoria del contenedor | MiB |
|---|---|
| Recién arrancado, con los dos modelos cargados | **210–335** según el arranque (la imagen de NC-03, medida igual ese día: 252) |
| Máximo con moderaciones secuenciales | 253 |
| Máximo con 4 clientes mezclados, fotos saneadas (lo que envía el backend) | **388–390** |
| Máximo con 4 clientes mezclados, fotos crudas de hasta 8 MP (el tope de `INFERENCIA_MAX_MEGAPIXELES`) | **498–507** |
| Máximo con 4 clientes mezclados, sintéticas de 16 MP (el tope de entonces; hoy responden 413) | 755–858 |
| Lo mismo **sin** los ajustes `MALLOC_*` | saneadas 493; crudas 845–847 (la imagen de NC-03, solo detección: 656) |

- **La aceptación (menos de 700 MiB con los dos modelos y 4 clientes mezclados) se cumple con lo que envía el backend** (fotos saneadas de ≤ 2048 px, ≤ 4,2 MP: 390 MiB) **y en el tope de 8 MP** del servicio (498–507 MiB, ~505 MiB). Con el tope original de 16 MP, el máximo llegaba a 755–858 MiB: por encima de 700, aunque por debajo de 1 GB. Ahí pesan las 4 imágenes decodificadas a la vez (2 por endpoint, 48 MB cada copia RGB a 16 MP; 24 MB a 8 MP). La moderación ya no copia la foto al redimensionarla (`Image.frombuffer`). **El usuario decidió el 28/10 bajar `INFERENCIA_MAX_MEGAPIXELES` a 8** (ver «Decisiones»).
- Sin los ajustes de glibc, las fotos crudas de 8 MP llevaban el máximo a 847 MiB (ver «Decisiones»).
- **Arranque** hasta que `/salud` responde: 2,4 s (comprueba el sha256 de los dos `.onnx`).
- Una moderación sola cuesta ~0,1 s por recorte; con 1 hilo y los dos recortes, 124 ms de p50 en fotos saneadas. Con carga mezclada compite por la CPU con RF-DETR (2 hilos en 2 vCPU), y su p95 sube a 1,2–1,5 s. Eso queda dentro de los 2,5 s de lectura del adaptador del backend (propuesta, §2). Con fotos de 16 MP, que el backend no envía y que hoy responden 413, el máximo llegó a 2,1 s.
- **Determinismo:** las seis corridas mezcladas sobre las fotos crudas dieron el mismo número de detecciones (1103) y los mismos puntajes (mediana 0,059 y máximo 0,111), con y sin los ajustes `MALLOC_*` y antes y después de `frombuffer`. Los tests comparan puntajes repetidos.
- Imagen final: **680 MB** (+43 MB: el `.onnx` de 22 MB y la capa de la aplicación).
- En Railway hay que volver a medir (DEP-13) con `scripts/medir_latencia.py --ruta mezcla`.

### Calibración del umbral (28/10/2026)

`scripts/calibrar_moderacion.py --url … --pistas DIR [--gente DIR] [--lima DIR]` sobre el **conjunto negativo** disponible: las 350 fotos saneadas de RDD2022 de arriba (`--pistas`). El script avisa siempre de las partes que faltan o no llegan a su mínimo (`--gente` ≥ 50, `--lima` ≥ 200) y marca el umbral como provisional mientras falten. El equipo no junta material explícito. No hay imágenes en el repo; solo estas cifras.

| País (RDD2022) | Fotos | Mediana | Máximo |
|---|---|---|---|
| China (dron) | 50 | 0,065 | 0,112 |
| China (moto) | 50 | 0,059 | 0,084 |
| Chequia | 50 | 0,046 | 0,052 |
| India | 50 | 0,065 | 0,088 |
| Japón | 50 | 0,049 | 0,064 |
| Noruega | 50 | 0,061 | 0,083 |
| EE. UU. | 50 | 0,058 | 0,091 |
| **Total** | **350** | **0,059** | **0,112** |

- Percentiles del total: p90 0,071, p95 0,075 y p99 0,087. 349 de 350 quedan por debajo de 0,1 y ninguna llega a 0,3. Las fotos crudas dan lo mismo (máximo 0,111).
- **Regla decidida** (máximo negativo + 0,15, entre 0,5 y 0,9): 0,112 + 0,15 = 0,26, así que el umbral sugerido es el **piso de 0,50**.
- **Recomendación al backend: mantener 0,70** (`MODERACION_UMBRAL`, decidido el 28/10) hasta completar el conjunto. Faltan las ≥ 50 fotos de calles con gente en ropa de verano, que son el falso positivo más probable, y las de Lima de NC-03b. Bajar a 0,50 solo con pistas vacías sería calibrar con el caso fácil. Con cualquier umbral entre 0,50 y 0,70, ninguna de las 350 fotos se rechazaría.
- Con el conjunto completo se vuelve a correr el script. Si sugiere más de 0,70, el umbral sube; si sugiere menos, decide el usuario.

## Pruebas

`python -m pytest -rs`: **273 tests**; sin los pesos, **264 pasan y 9 se omiten** (los de `test_modelo_real.py`). Con los dos modelos en `modelos/` pasan los 273.

| Archivo | Qué prueba | Pesos |
|---|---|---|
| `test_dominio.py` | Vocabulario `bache`/`grieta`, invariantes de `Caja`, `Deteccion`, `VersionModelo` (≤ 40), orden de `Detecciones`, `PuntajeModeracion` (rango, finito, inmutable), `ImagenRGB`, límites. | No |
| `test_detectar.py` | Caso de uso con dobles: orden de las validaciones (bytes antes de cabecera, píxeles antes de decodificar), formatos, bordes exactos de los límites, fallo del modelo. | No |
| `test_pillow_decodificador.py` | JPEG, PNG y WEBP sintéticos; GIF, TIFF y BMP rechazados sin probar sus lectores; transparencia sobre blanco, orientación EXIF, archivos dañados y truncados; `MemoryError` no se convierte en 400. | No |
| `test_moderar.py` | Caso de uso `ModerarImagen` con dobles: puntaje y versión, el mismo orden de validaciones que `DetectarDanos` y el **mismo error** para la misma entrada, bordes de los límites, fallo del modelo y puntaje fuera de rango. | No |
| `test_api.py` | Contrato JSON exacto de los dos endpoints, OpenAPI (`maxLength` 40 de las versiones; `puntaje` entre 0 y 1), `/salud` con `version_moderacion`, **todos los errores en los dos endpoints** (400, 413 por bytes, píxeles, `Content-Length` y cuerpo por trozos, 500 del modelo y por falta de memoria, 405) y 404. Concurrencia: a lo sumo 2 procesos por endpoint y **limitadores independientes** (con las dos plazas de un endpoint tomadas, el otro responde). El 503 de la cola es de uvicorn y se probó contra el contenedor. | No |
| `test_onnx_modelo.py` | Redimensión frente a una fórmula escalar independiente, normalización, decodificación (fondo, piso, recorte, una detección por consulta y clase, máximo de 300 pares) y el adaptador completo con un **`.onnx` sintético** (hash, metadatos, forma, ranura de fondo que no es la última columna, fallo del motor). | No |
| `test_onnx_moderacion.py` | Geometría de los recortes (4:3, vertical, 16:9, truncado como torchvision, cuadrada, 2:1, más alargada que 2:1, que cubren todo), preprocesado frente al bicúbico de Pillow, softmax estable y el adaptador con un **`.onnx` sintético de 2 salidas**: los dos recortes en una foto apaisada y en una vertical, el máximo, una franja que el recorte central dejaría fuera, el orden de las etiquetas, el hash, la forma y el fallo del motor. | No |
| `test_calibrar_moderacion.py` | La regla del umbral sugerido (máximo + 0,15, entre 0,5 y 0,9), los avisos por cada parte del conjunto decidido que falta o no llega a su mínimo, el histograma y la negativa a leer fotos dentro del repo. | No |
| `test_configuracion.py` | Valores por defecto y errores de cada variable. | No |
| `test_main.py` | Raíz de composición con adaptadores reales y los dos `.onnx` sintéticos; sin cualquiera de los modelos, o con el hash de la moderación cambiado, no arranca; moderación de punta a punta. | No |
| `test_modelo_real.py` | Detección: versión registrada, **reproduce la huella de PyTorch** de `modelo.json`, contrato y determinismo. Moderación: versión, revisión y licencia registradas, paridad dentro de la tolerancia, **reproduce la huella de timm** de `moderacion.json` (puntaje por recorte y máximo) y determinismo. Servicio completo con los dos. | **Sí: cada prueba se omite sin sus pesos** |

Las imágenes de los tests son sintéticas (generadas con código). **Ninguna imagen real de ninguna clase** está en el repo ni pasa por la CI. Las fotos de RDD2022 (CC BY-SA 4.0) solo se usaron fuera del repo para medir, comprobar el mapeo y calibrar.

**CI** (job `inferencia` de `.github/workflows/ci.yml`, `docs/ci.md`): instala `requirements-dev.lock` con hashes, corre `lint-imports`, `pytest` sin pesos y la guarda `scripts/verificar_tests.py`, que falla si algo falló, si un `tests/test_*.py` no tiene casos, si se omitió algo fuera de `test_modelo_real.py` o si los ejecutados bajan de `MIN_PYTEST_INFERENCIA` (133 hasta NC-10a; con NC-10a se ejecutan 264, y el mínimo lo sube la sesión de raíz al fusionar).

## Pendiente

- **NC-03b**: conjunto de validación de Lima (≥ 200 fotos del equipo), calibración del umbral y precisión y cobertura por categoría. `scripts/exportar_onnx.py --imagenes` ya compara contra PyTorch; falta el script de evaluación con etiquetas.
- **NC-04b**: `InferenciaHttpAdapter` en el backend (multipart `imagen`, timeout 3 s) y despliegue en Railway por la red privada, con `INFERENCIA_HILOS` igual a las vCPU del plan, y volver a medir allí.
- **Atribución** de RDD2022 y de los pesos en «Acerca de» o en los términos, y la pregunta abierta del *share-alike*. Con NC-10a se suma la de Marqo (`moderacion.json`, `fuente.atribucion`), en §13 de los términos v2.
- **Calibración completa de la moderación**: las ≥ 50 fotos de calles con gente (`--gente`) y las de Lima de NC-03b (`--lima`), con `scripts/calibrar_moderacion.py`. Hasta entonces, umbral 0,70.
- **NC-10b**: el adaptador `moderacion/infra/InferenciaModeracionHttpAdapter` según `project-context/handoffs/2026-10-28-contrato-moderacion-v1.md`, y volver a medir en Railway (DEP-13) con los dos modelos.
- Construir la imagen Docker en la CI (como el job `imagen` pendiente del backend): hoy no se hace porque su primera etapa descarga torch y los pesos en cada corrida.
