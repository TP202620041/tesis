# Propuesta: clases del modelo de detección, política de sugerencia y plan NC-03/NC-04

- **Estado:** aceptada (2026-10-21) <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-21
- **Origen:** subagente arquitecto, encargo ARQ-1 (decisión del usuario del 21/10: «proponer clases y avanzar»; NC-04 avanza con un adaptador falso mientras tanto)
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md (§6, §8) y el plan (NC-03, NC-04).

> Datasets, pesos y licencias consultados el **21/10/2026** en las fuentes citadas. Lo marcado **NO VERIFICADO** se comprueba en NC-03. Esto no es asesoría legal sobre licencias.

## Contexto

- `ARCHITECTURE.md` §6 define `inferencia/` (FastAPI + ONNX en CPU, capas con import-linter) y el contrato `POST /v1/detecciones` → `{ "version_modelo", "detecciones": [{ "clase", "confianza", "caja" }] }`. El servicio **solo detecta**; el umbral y la clase dominante se aplican en `clasificacion/domain/PoliticaDeSugerencia`.
- §4.3 (pasos 1–3) y D-08: vista previa solo de interfaz (`POST /api/clasificaciones`, no guarda nada) y sugerencia oficial en `reportes.listener.SugerenciaCategoriaListener`, asíncrona, que escribe `categoria_sugerida_id` y `confianza_sugerencia` una sola vez. La IA nunca bloquea un reporte.
- §8: CATEGORIA_DANO suma `icono` y `clase_modelo`, y pide revisar el solape entre «Bache» y «Hueco en calzada»; REPORTE suma `categoria_sugerida_id` y `confianza_sugerencia`.
- Categorías estándar sembradas en V3: **Bache**, **Hueco en calzada**, **Pista deteriorada**, **Semaforo averiado**, **Senalizacion faltante**, **Vereda danada**. Los distritos pueden crear categorías propias (US-29).
- NC-02 agregó `severidad` (BAJA, MEDIA, ALTA), que declara el ciudadano.
- Hoy no existen ni `inferencia/` ni el módulo `clasificacion`. `plan-sprints.md` pone NC-03/NC-04 en S7 y bloquea NC-03 con «clases finales del modelo y umbral».

## Problema

Hay que fijar qué clases detecta el modelo, cómo se traducen a las categorías de la app y cuándo se sugiere una, con datos y pesos públicos cuya licencia permita usarlos dentro de un servicio web.

## Qué hay disponible

### Datos

| Dataset | Qué trae | Licencia | Útil para |
|---|---|---|---|
| **RDD2022** (Arya et al.; [arXiv 2209.08538](https://arxiv.org/abs/2209.08538); [sekilab/RoadDamageDetector](https://github.com/sekilab/RoadDamageDetector)) | 47.420 imágenes de 6 países (Japón, India, Rep. Checa, Noruega, EE. UU., China), con caras y placas difuminadas. Clases oficiales: **D00** grieta longitudinal, **D10** transversal, **D20** piel de cocodrilo, **D40** bache. Train público: 38.385 imágenes y 55.007 cajas (D00 26.016, D10 11.830, D20 10.617, D40 6.544). | Imágenes **CC BY-SA 4.0**; código MIT. | Bache y pista deteriorada. Es la base de todos los pesos públicos. |
| RDD2022, etiquetas extra | Algunos países traen D43 (paso peatonal borroso), D44 (línea blanca borrosa), D50 (tapa de buzón) y «Repair», fuera de las 4 oficiales. El paper dice que las marcas borrosas se excluyeron porque el criterio cambia entre países. | Igual. | Conteos por país: NO VERIFICADO. No alcanza para una clase fiable. |
| N-RDD2024 ([Mendeley](https://data.mendeley.com/datasets/27c8pwsd6v/5)) | Derivado de RDD2022 con 10 clases (incluye paso peatonal y línea de carril borrosos, parche, ahuellamiento). | Declara CC BY 4.0, dudosa al derivar de material CC BY-SA. | Referencia, no recomendado. |
| Baches (Kaggle/Roboflow: «Annotated Potholes Image Dataset», 665 imágenes, y proyectos de la comunidad) | Solo baches. | Variable (ODbL, CC BY 4.0, a menudo sin verificar). | Ampliar la clase bache, con cuidado con la procedencia. |
| Veredas | No hay benchmark académico; Roboflow «Damaged Footpath» (569 imágenes, CC BY 4.0). Project Sidewalk publica etiquetas (CC0) pero no las imágenes. | — | No alcanza para un detector fiable. |
| Semáforos | Solo datasets de estado (rojo/verde) y **no comerciales** (Bosch, LISA). Ninguno de semáforos averiados. | NC / NC-SA | Nada. |
| Señales | «Damaged Traffic Signs» (Roboflow, CC BY 4.0: grafiti, sucia, deformada, caída). Un detector **no puede detectar una señal que falta**. | — | Nada para «faltante». |
| Lima | DeepBrokenHighways (UPC, ICEIS 2024): 325 imágenes de Lima y Callao; no publica ni datos ni pesos. | — | Antecedente para la tesis, no un recurso. |

### Pesos preentrenados en RDD2022

Todos evaluados por su autor en una partición propia 70/15/15, **no** en el test oficial, así que las cifras son optimistas y no comparables con los rankings del desafío (que usan F1). Ninguno publica `.onnx`; hay que exportar desde el `.pt`.

| Pesos | Arquitectura | Licencia | mAP@0,5 | Comentario |
|---|---|---|---|---|
| [`dronefreak/rdd2022-rfdetr-nano`](https://huggingface.co/dronefreak/rdd2022-rfdetr-nano) | RF-DETR N (384 px, ~30 M parámetros) | **Apache-2.0** | 60,9 | Licencia permisiva y la cifra de un YOLO n. |
| `dronefreak/rdd2022-rfdetr-small` | RF-DETR S (512 px) | **Apache-2.0** | 64,7 | Mejor, más lento. |
| [`dronefreak/rdd2022-yolov8n`](https://huggingface.co/dronefreak/rdd2022-yolov8n) | YOLOv8n (~3 M parámetros) | AGPL-3.0 | 58,8 (bache 70,8; cocodrilo 61,1; longitudinal 52,7; transversal 50,6) | El más liviano, pero AGPL. |
| `dronefreak/rdd2022-yolov8s` | YOLOv8s | AGPL-3.0 | 61,5 | |
| `rezzzq/yolo12s-road-damage-rdd2022` | YOLO12s | dice «MIT», dudoso (entrenado con un fork de Ultralytics) | sin reportar | No. |
| `duongng2911/rt-detr-resnet-50-dc5-rdd2022-finetuned` | RT-DETR R50 | Apache-2.0 | 19,6 | Malo. No. |

Las grietas finas son las clases más difíciles (se pierden al bajar la resolución, y D00 es el 44 % de las etiquetas).

### Licencias de las arquitecturas

- **Ultralytics (YOLOv5, v8, 11, 26) y YOLOv10/v12:** AGPL-3.0. Ultralytics declara que «all Ultralytics YOLO trained models fall under the AGPL-3.0 License» y pide licencia Enterprise para desplegar por API salvo que **todo el proyecto** se publique bajo AGPL ([ultralytics.com/license](https://www.ultralytics.com/license), leída el 21/10/2026). Que la exportación a ONNX herede la AGPL es su interpretación; jurídicamente no está probado. La AGPL §13 obliga a ofrecer el código fuente a quien usa el servicio por la red. El repo `TP202620041/tesis` es público pero **no tiene archivo LICENSE**, y decidir licenciarlo bajo AGPL no le corresponde al agente (puede intervenir la UPC).
- **YOLOv7 y YOLOv9:** GPL-3.0. **YOLO-NAS:** pesos con licencia que prohíbe servicios gestionados. No.
- **Permisivas (Apache-2.0):** RF-DETR en tamaños N, S, M y L (los tamaños Atto, Femto, Pico, XL y 2XL tienen otra licencia, PML 1.0), RT-DETR del repositorio de lyuwenyu (no el que viene dentro de `ultralytics`), D-FINE, YOLOX, DEIM. Solo RF-DETR tiene pesos RDD2022 públicos y útiles.
- **Datos:** RDD2022 es CC BY-SA 4.0. Si unos pesos entrenados con esos datos son «material adaptado» (con lo que el *share-alike* los alcanzaría) es una pregunta abierta. Como mínimo, se da **atribución** (dataset y autores de los pesos) en la documentación y en la página «Acerca de» o en los términos.

### CPU

- Cifras oficiales de Ultralytics para ONNX en CPU a 640 px (en una instancia grande): YOLOv8n 80 ms, YOLO11n 56 ms. En 4 núcleos ARM (Raspberry Pi 5), YOLO11n ~147 ms.
- RF-DETR N en CPU: **sin benchmarks publicados**. Estimación: 200–600 ms por imagen a 384 px en 2 vCPU (NO VERIFICADO). Para una foto por reporte es aceptable: la vista previa tiene un timeout de 3 s (§4.3) y la sugerencia oficial es asíncrona.
- Memoria de un contenedor FastAPI + onnxruntime: estimación 200–400 MB con un modelo n/s y 400–800 MB con un DETR (NO VERIFICADO). Se mide con `docker stats` en NC-03.
- Tamaño del modelo: RF-DETR N ~120 MB en FP32 (estimado); YOLOv8n ~13 MB.

## Opciones de clases

| Opción | Clases del contrato `/v1` | Pros | Contras |
|---|---|---|---|
| **A. Dos clases de la app: `bache` y `grieta`** (recomendada) | `bache` ← D40; `grieta` ← D00 + D10 + D20. El mapeo de las etiquetas del modelo a estas clases vive en `inferencia/infrastructure` (adaptador del modelo). | Encaja 1:1 con `categoria_dano.clase_modelo` (una columna, §8). El vocabulario del contrato no cambia si mañana cambia el modelo. Usa pesos públicos sin reentrenar. | Pierde el tipo de grieta en la respuesta (se puede registrar en el servicio para la evaluación). |
| B. Las 4 clases de RDD2022 en el contrato | `grieta_longitudinal`, `grieta_transversal`, `piel_de_cocodrilo`, `bache` | Más información para analizar. | Tres clases van a la misma categoría: `clase_modelo` tendría que ser una lista o una tabla de mapeo, que §8 no prevé. |
| C. Agregar marcas viales borrosas (D43/D44) → «Señalización» | Además de A, `marca_vial_desgastada` | Cubriría parte de «Señalización faltante» (la horizontal). | Pocas etiquetas, solo de algunos países y con criterio variable; exige entrenar. Para una fase posterior, si hay datos de Lima. |

### Mapeo a las categorías actuales

| Categoría (V3) | `clase_modelo` | ¿Detectable por imagen? |
|---|---|---|
| Bache | `bache` | Sí (D40; la clase con mejor mAP). |
| Hueco en calzada | — | **No se distingue de un bache** en una foto: la profundidad no se ve. Ver la recomendación sobre el solape. |
| Pista deteriorada | `grieta` | Sí (D00, D10, D20), con menos precisión que el bache. |
| Semaforo averiado | — | No: el estado de un semáforo no se infiere de una foto fija y no hay datos. |
| Senalizacion faltante | — | No: un detector no detecta una ausencia. (Las marcas borrosas, opción C, en otra fase.) |
| Vereda danada | — | No con los datos públicos de hoy (RDD2022 solo cubre la calzada). |
| Categorías propias de un distrito (US-29) | — | Nunca se sugieren. |

Una categoría sin `clase_modelo` **nunca** se sugiere; el ciudadano la elige a mano, como hoy.

**Solape «Bache» / «Hueco en calzada».** Hoy es una sola realidad con dos nombres: además de confundir la sugerencia, rompe la deduplicación de US-09 (que es por categoría), porque dos vecinos que reportan el mismo hueco con categorías distintas crean dos reportes. Desde NC-02 la gravedad la expresa `severidad` (ALTA para un hueco profundo). Recomendación: **desactivar «Hueco en calzada»** (`activo = false`) antes de abrir a usuarios reales, con una migración nueva; como la base de producción arranca vacía, no hay reportes que mover. La decide el usuario.

## Política de sugerencia (`clasificacion/domain/PoliticaDeSugerencia`)

1. Descartar las detecciones cuya clase no corresponde a ninguna categoría **activa** con `clase_modelo`.
2. Puntaje de cada categoría = la **máxima** confianza entre sus detecciones.
3. Sugerir la categoría con mayor puntaje si es **≥ 0,50**. Empate exacto o ninguna sobre el umbral → «sin sugerencia».
4. `confianza_sugerencia` = ese puntaje; `version_modelo` = la que devuelve el servicio.

**Por qué 0,50 y no 0,25.** Los umbrales que maximizan F1 en RDD están entre 0,20 y 0,30 (Ultralytics usa 0,25; el ganador de 2020 usó 0,20), pero ahí el objetivo es contar daños. Aquí una sugerencia equivocada empuja al ciudadano a una categoría errónea (anclaje), y equivocarse cuesta más que no sugerir. El umbral es configurable (`app.clasificacion.umbral`) y se **calibra** en NC-03 con fotos de Lima: al menos 200 fotos tomadas por el equipo y etiquetadas a mano, reportando precisión y cobertura por categoría (evidencia para OE3). La agregación por máximo es una elección razonable sin respaldo específico en la literatura (NO VERIFICADO); la suma de confianzas o el área de la caja son alternativas a comparar con ese mismo conjunto.

## Plan por fases

| Fase | Tarea | Qué entrega | Depende de |
|---|---|---|---|
| **0** | NC-04 (ya, con adaptador falso) | Módulo `clasificacion`: `port/ClasificadorDano`, `infra/FalsoClasificadorAdapter` (respuestas fijas por configuración, incluido «falla» para probar el camino de error), `domain/PoliticaDeSugerencia` con tests puros, `POST /api/clasificaciones` (vista previa, CIUDADANO autenticado, no guarda; **pasa la foto por el mismo `common/port/SaneadorDeImagen` que el almacenamiento** antes de clasificarla, para que el modelo vea lo mismo que verá en la sugerencia oficial: ajuste a D-08 propuesto en `2026-10-21-fotos-r2.md`), `reportes.listener.SugerenciaCategoriaListener` (lee la foto guardada, ya saneada; `AFTER_COMMIT` + `@Async` + escritura corta, D-08/D-13), la migración de datos (abajo) y la vista previa en `features/reportes`. IT: la creación responde aunque la clasificación falle, la sugerencia se escribe una sola vez, lo que envía el cliente se ignora. Se elige el adaptador con `app.clasificacion.tipo=falso\|http`. | Ninguna decisión de esta propuesta salvo el vocabulario de clases (A) |
| **1** | NC-03a | `inferencia/` con las capas de §6, el contrato `/v1/detecciones`, el modelo elegido exportado a ONNX, pruebas con imágenes fijas, imagen Docker y medición de latencia y RAM en 2 vCPU (`intra_op_num_threads` fijo). | Elegir los pesos y su licencia |
| **2** | NC-03b | Conjunto de validación de Lima (≥ 200 fotos del equipo), calibración del umbral, informe de precisión y cobertura por categoría. | Fase 1 |
| **3** | NC-04b | `clasificacion/infra/InferenciaHttpAdapter` (RestClient, timeout 3 s) y el servicio `inferencia` en Railway por la red privada, sin dominio público. Costo estimado + US$ 5–10/mes. | Fases 1 y 2 |
| **4** (opcional) | — | Ajuste fino con fotos de Lima. **Usar fotos de los reportes para entrenar es una finalidad nueva**: exige actualizar los términos y pedir el consentimiento (D-12); mientras tanto, solo fotos propias del equipo. | Decisión legal |

## Cambios de datos (una migración nueva, en NC-04)

| Tabla | Columna | Tipo | Nota |
|---|---|---|---|
| `categoria_dano` | `clase_modelo` | `VARCHAR(40) NULL`, única cuando no es nula | Seed: Bache → `bache`, Pista deteriorada → `grieta`; el resto nulo. |
| `categoria_dano` | `icono` | `VARCHAR(40) NULL` | Ya está en §8; su contenido lo define el rediseño (S8). |
| `reporte` | `categoria_sugerida_id` | `BIGINT NULL` → `categoria_dano` | Escrita solo por el listener, una vez. |
| `reporte` | `confianza_sugerencia` | `NUMERIC(4,3) NULL`, `CHECK` entre 0 y 1 | |
| `reporte` | `version_modelo_sugerencia` | `VARCHAR(40) NULL` | **No está en §8**; se propone para que la evaluación de OE3 sepa qué modelo produjo cada sugerencia. |

**Visibilidad.** La sugerencia es la salida de un detector: es una **señal interna** según la regla del proyecto, así que **no va en ningún DTO público ni del ciudadano**. El ciudadano solo ve la vista previa al crear el reporte. Para la tesis se mide por SQL (sugerida frente a confirmada); si hace falta una pantalla, será un endpoint del ADMIN. Mostrarla al funcionario en la bandeja es una decisión aparte.

**Privacidad.** El aviso de privacidad debe decir que la foto se analiza automáticamente para sugerir una categoría y que la decisión final es del ciudadano (DS 016-2024-JUS, art. 6.1, decisiones automatizadas).

## Recomendación

- **Clases: opción A** (`bache` y `grieta`), con el mapeo de etiquetas del modelo dentro de `inferencia/` y `clase_modelo` 1:1 en CATEGORIA_DANO.
- **Pesos: `dronefreak/rdd2022-rfdetr-nano` (Apache-2.0)** como base, exportado a ONNX en NC-03a. Si su latencia en 2 vCPU pasa de 1 s, probar RF-DETR con menor resolución o D-FINE-S (Apache-2.0, sin pesos RDD2022 públicos: habría que entrenarlo). Los YOLO de Ultralytics solo si el usuario acepta publicar el proyecto bajo AGPL o comprar la licencia.
- **Umbral inicial 0,50**, calibrado en la fase 2.
- **Desactivar «Hueco en calzada»** antes de abrir a usuarios reales.
- **NC-04 ya**, con el adaptador falso: no depende de los pesos ni del umbral, solo del vocabulario de clases.
- **Ajuste a D-08:** la vista previa clasifica la foto saneada por `common/port/SaneadorDeImagen`, igual que la que se guarda (detalle en `2026-10-21-fotos-r2.md`). Sin eso, la vista previa y la sugerencia oficial verían imágenes distintas (orientación, tamaño, compresión).

## Qué decide el usuario

1. Vocabulario de clases (A, B o A+C).
2. Pesos y licencia: RF-DETR (Apache-2.0) o YOLO (AGPL, con las condiciones de arriba).
3. Umbral inicial y criterio de agregación.
4. Qué hacer con «Hueco en calzada».
5. Si la sugerencia se muestra al funcionario.
6. Si se usarán fotos de los ciudadanos para entrenar (fase 4) y con qué consentimiento.

## Qué queda bloqueado mientras no se decida

NC-03 (pesos, licencia y umbral). NC-04 solo necesita la decisión 1 para fijar el seed de `clase_modelo`; con el adaptador falso puede avanzar en todo lo demás.

## Decisión (2026-10-21)

El usuario aprobó la propuesta completa: clases **`bache`** (D40) y **`grieta`** (D00, D10 y D20) de RDD2022, pesos RF-DETR bajo **Apache-2.0** (no los YOLO de Ultralytics, AGPL), umbral inicial **0,50** a calibrar con fotos de Lima, y **desactivar la categoría estándar «Hueco en calzada»** (no se distingue de «Bache» en una foto). Orden: NC-04 primero con el adaptador falso; después NC-03 (`inferencia/`, FastAPI + ONNX). La sesión de raíz actualizará ARCHITECTURE.md (§6 y §8) y el plan al abrir esas tareas.
