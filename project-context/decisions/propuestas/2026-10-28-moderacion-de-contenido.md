# Propuesta: moderación de contenido al crear un reporte (NC-10 y NC-11)

- **Estado:** abierta. Las cuatro decisiones del usuario del 28/10 ya están tomadas y no se discuten aquí. Quedan abiertas las de «Qué decide el usuario».
- **Fecha:** 2026-10-28
- **Origen:** subagente arquitecto, encargo del coordinador: diseñar la moderación de contenido y dejarla lista para implementar.
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md (§4.3, §6, §7, §8 y una fila D-15), el plan de sprints y los términos. Las fichas NC-10 y NC-11 ya están en `plan-migracion-capas.md`.

> Licencias, tamaños y precios consultados el **28/10/2026** en las fuentes citadas. Las cifras de RAM y latencia se midieron ese día en el portátil de desarrollo (i7-13620H, Windows, onnxruntime 1.31.1), fuera del repo, y en Railway hay que volver a medirlas. Lo marcado **SUPUESTO** no se verificó. Esto no es asesoría legal.

## Decisiones del usuario (28/10)

1. **Una foto obscena o sexual se rechaza al subirla.** El ciudadano ve «La foto no está permitida» y puede tomar otra. La foto nunca se guarda ni se publica.
2. **El análisis corre en nuestro servicio `inferencia/`** (FastAPI + ONNX, el mismo que sirve RF-DETR), con un modelo abierto. No se usan APIs de terceros, porque los términos v2 prometen que la foto no sale a terceros.
3. **Una descripción con palabras ofensivas se rechaza con un aviso que no repite la palabra.** Se usa una lista fija de groserías del español peruano, con normalización de tildes, letras repetidas y números (*leetspeak*).
4. **Red de seguridad:**
   - el ADMIN puede ocultar un reporte, o solo su foto, ya publicados, con un motivo y un registro en la línea de tiempo;
   - un ciudadano puede denunciar un reporte público con el botón «Denunciar contenido», y la denuncia llega a una bandeja del ADMIN.

## Contexto

- **Creación** (`reportes/controller/ReporteController#crear` → `ReporteService#crear`, `@Transactional`):
  - el orden es idempotencia (US-06), validación de campos, distrito, deduplicación (US-09) y, si el reporte es nuevo, `FotoStorageService#almacenarFotoReporte`;
  - el adaptador sanea la foto **dentro** de ese método (`S3FotoStorageService#guardar` llama a `SaneadorDeImagen`) y la sube dentro de la transacción. Esa es la deuda de BE-11.
- **Edición** (`PATCH /api/reportes/{id}`, `EditarReporteRequest`): cambia categoría, título, descripción y severidad. **No cambia la foto.**
- **Vista previa** (`POST /api/clasificaciones`, `ClasificacionService#vistaPrevia`):
  - sanea la foto con un turno propio y llama a `clasificacion/port/ClasificadorDano`;
  - con `CLASIFICACION_TIPO=http`, el adaptador es `clasificacion/infra/InferenciaHttpAdapter` (NC-04b): `RestClient` sobre el `HttpClient` del JDK con HTTP/1.1, 500 + 2 500 ms, un `Semaphore(4)` sin espera y ningún reintento.
- **Servicio `inferencia/`** (NC-03a):
  - `POST /v1/detecciones` con piso técnico de 0,10 y como máximo 100 detecciones;
  - a lo sumo 2 solicitudes procesando (`PROCESOS_SIMULTANEOS`) y una inferencia a la vez;
  - `--limit-concurrency 10`: con 10 conexiones o tareas abiertas, uvicorn responde 503;
  - RAM medida de 200 a 478 MiB, dentro de un límite de 1 GB en Railway.
  - **Todavía no existe en producción** (DEP-13, pendiente para la v0.8.0).
- **Fotos públicas:**
  - `/media/fotos/reportes/<uuid>.jpg` las sirve el backend desde un bucket privado de R2 (`common/config/WebMvcConfig`), con `Cache-Control: public, max-age=30 días, immutable`;
  - `api.ciudadviva.app` va con el proxy de Cloudflare, así que la foto **puede quedar en la caché del borde** (`docs/despliegue.md`, verificación 16).
- **Texto libre que se publica:**
  - el título y la descripción del reporte (`ReporteResumenResponse`, público);
  - el comentario de US-27 (público);
  - el nombre del autor, que se muestra junto a su comentario.
- **Índice de desempeño:** `mv_indice_desempeno_distrital` (V7) cuenta todo salvo `CANCELADO`. SEC-01 (`backend/README.md`): lo que hace un actor medido no puede sacar un reporte del escrutinio ni de sus métricas.
- **Cola offline de la PWA** (`features/reportes/hooks/useColaOffline.ts`): sin red, un 5xx, un 408 o un 429 conservan el reporte y lo reintentan; otro 4xx lo marca `rechazado` con su motivo.
- **Términos v2** (PR #116, rama `feature/doc-terminos-v2`): §11 dice «Ciudad Viva no revisa las fotos antes de publicarlas». Con NC-10 eso deja de ser cierto.

## Problema

Hay que decidir con qué modelo, por qué contrato, en qué momentos y con qué comportamiento ante una caída se revisan la foto y el texto antes de publicar, y cómo se ocultan y se denuncian los reportes publicados, sin señales internas en DTO públicos y sin que nadie pueda mover sus propias métricas (SEC-01).

## 1. Modelo para la foto

### Candidatos

| | **Marqo `nsfw-image-detection-384`** | OpenNSFW2 (Yahoo `open_nsfw`) | NudeNet v3 | ViT-base de HF (Falconsai, AdamCodd) |
|---|---|---|---|---|
| Qué es | Clasificador NSFW/SFW. Afinado de `timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k`, con 5,6 M de parámetros y entrada de 384 × 384 | Clasificador de pornografía. ResNet-50 «1by2» de 2016, con entrada de 224 × 224. OpenNSFW2 es un port a Keras 3 | Detector de 18 partes del cuerpo (`FEMALE_BREAST_EXPOSED`, `FEET_COVERED`…), basado en YOLOv8 | Clasificador NSFW/SFW con ViT-B/16 (86 M). Falconsai usa 224 px; AdamCodd, 384 |
| Licencia | **Apache-2.0** (pesos y modelo base) | Código **MIT** (opennsfw2); pesos y modelo de Yahoo **BSD-2-Clause** | **AGPL-3.0** (repo) sobre Ultralytics YOLOv8 (AGPL-3.0) | **Apache-2.0** los dos |
| ONNX | No se publica; se exporta con timm + torch, como RF-DETR. Aquí se armó a mano, sin torch, y pesa **22,4 MB** | No se publica; habría que pasar el `.h5` de Keras por tf2onnx, con TensorFlow en la etapa de exportación (**SUPUESTO**: no se probó) | Sí: `320n.onnx` de 12,2 MB y `640m.onnx` de 103,5 MB | AdamCodd sí: fp32 de 344,6 MB e int8 de 88,5 MB. Falconsai solo publica safetensors (343 MB) |
| Pesos | 22,4 MB (safetensors) | 24,2 MB (`.h5`); 23,8 MB el `.caffemodel` original | 6,2 MB (`320n.pt`) y 52 MB (`640m.pt`) | 343–345 MB en fp32 |
| RAM medida (onnxruntime, CPU) | **+63 MiB** tras 40 inferencias (+32 MiB al cargar) | No medida; por el tamaño, **SUPUESTO** de 60–100 MiB | No medida | AdamCodd fp32: **+440 MiB** e int8: **+193 MiB** |
| Latencia medida, un recorte de 384 | p50 **60–145 ms** según la corrida, con 1–2 hilos; 85–94 ms sobre 120 fotos | No medida | No medida | AdamCodd fp32: p50 **823 ms** con 2 hilos; int8: 416 ms |
| Precisión publicada | 98,56 % de exactitud en su test de 20 000 imágenes (10 000 NSFW), que incluye fotos, dibujos, memes e imágenes generadas. Su gráfica da ROC AUC ≈ 0,997, precisión ≈ 0,98 y cobertura ≈ 0,98, y compara con Falconsai y AdamCodd. **Lo mide el propio autor sobre datos propietarios** | Ninguna. Yahoo no da garantías y pide armar un conjunto propio con su curva ROC. Solo cubre pornografía, sin dibujos | Ninguna cifra global; es un detector de partes | Falconsai: 0,980 en su conjunto propio; en la comparación de Marqo, ≈ 0,91. AdamCodd: 0,9654 y AUC 0,9948 en su evaluación; en la de Marqo, ≈ 0,89. AdamCodd se declara «restrictivo» (escote o mucha piel dan NSFW) |
| Riesgo en fotos de pistas y veredas | **Medido:** en 120 fotos de RDD2022 (test; 5 países; de 512 a 4040 px), el puntaje NSFW tuvo mediana de 0,053 y máximo de 0,105. Ninguna llegó a 0,5. Falta medir calles con gente en ropa de verano (Costa Verde) | El modelo de Yahoo tiene fama de puntuar alto los tonos de piel, y Lima tiene mucha tierra y muros beige (**SUPUESTO**, sin medir) | Sus clases `FACE_*` y `FEET_*` aparecen en cualquier foto con gente: obliga a escribir reglas propias | Con el criterio restrictivo de AdamCodd, más falsos positivos con gente en la vía |
| Veredicto | **Recomendado** | Posible, pero viejo, sin métricas y con exportación cara | **Descartado por licencia**, el mismo criterio que excluyó los YOLO de Ultralytics en NC-03 | **No cabe**: con RF-DETR (hasta 478 MiB) llega a ~920 MiB de 1 GB y se acerca a 1 s por foto |

Fuentes, consultadas el 28/10/2026:
- Marqo: [tarjeta y config](https://huggingface.co/Marqo/nsfw-image-detection-384), revisión `0c26ec22111b83f106d72a55f611ec35962bcb65`, sha256 de `model.safetensors` `6bf2e0f6…eefce`.
- Falconsai: [tarjeta](https://huggingface.co/Falconsai/nsfw_image_detection).
- AdamCodd: [tarjeta y `onnx/`](https://huggingface.co/AdamCodd/vit-base-nsfw-detector), revisión `8587de9`.
- OpenNSFW2: [repo](https://github.com/bhky/opennsfw2), MIT; pesos `open_nsfw_weights.h5` de la release v0.1.0.
- Yahoo: [`yahoo/open_nsfw`](https://github.com/yahoo/open_nsfw), BSD-2-Clause, archivado.
- NudeNet: [repo](https://github.com/notAI-tech/NudeNet), con la licencia AGPL-3.0 que informa la API de GitHub, y la release `v3.4-weights`.

**Cómo se midió.** Todo corrió en un venv del *scratchpad*, sin tocar `inferencia/`.
- Torch no se pudo instalar ahí, porque las rutas largas de Windows superaban el límite. Por eso el ONNX de Marqo se armó directamente desde el safetensors, replicando el forward de evaluación de timm, y coincidió con una implementación NumPy independiente (diferencia máxima de 3 × 10⁻⁸).
- **La paridad con timm no está verificada.** La comprueba NC-10a al exportar con torch, como RF-DETR.
- Hay un indicio a favor: el modelo se entrenó con *label smoothing* 0,1, y en las fotos de pistas el puntaje quedó pegado al piso esperable de ~0,05.
- Las fotos de RDD2022 (CC BY-SA 4.0) se usaron fuera del repo, como en NC-03a.

### Recomendación: Marqo `nsfw-image-detection-384`

- **Licencia Apache-2.0**, compatible con un repo público. La atribución va en §13 de los términos, junto a RF-DETR.
- **Cabe con holgura:** +63 MiB, frente a los 1 GB del servicio con RF-DETR.
- **Cuesta poco:** ~0,1 s por recorte, contra los ~0,4 s por foto de RF-DETR.
- **Es el único de los tres con métricas publicadas.** Hay que leerlas con cautela, porque las mide el autor sobre datos propietarios. La procedencia de los datos de entrenamiento no se conoce en ninguno de los candidatos.

**Preprocesado.** Es el de evaluación de timm: bicúbico de Pillow con el lado menor a 384, normalización de 0,5/0,5 y orden de etiquetas `["NSFW", "SFW"]`.
- timm hace un recorte central de 384, que en una foto 4:3 deja fuera el 12,5 % de cada lado.
- **Se proponen dos recortes de 384 que cubren todo el lado mayor, y se toma el máximo.** Así nada queda fuera del análisis.
- En las 120 fotos de pistas, el máximo no cambió (0,105) y el costo se duplica a ~0,2 s.

**Umbral inicial: 0,70.**
- `MODERACION_UMBRAL` en el backend, igual que `CLASIFICACION_UMBRAL`.
- El servicio solo mide; la regla «rechazar si el puntaje ≥ umbral» vive en `moderacion/domain/PoliticaDeModeracion`.
- Según la gráfica del autor, a 0,7 la cobertura de NSFW es de ~0,96 y la precisión de ~0,99.
- Como el modelo usa *label smoothing*, la salida queda entre ~0,05 y ~0,95, así que un umbral por encima de 0,9 deja pasar casi todo.

**Calibración (en NC-10a, con el script nuevo `scripts/calibrar_moderacion.py`).**
- **Conjunto negativo, fuera del repo:**
  - ≥ 300 fotos de RDD2022;
  - las ≥ 200 fotos de Lima de NC-03b, cuando existan;
  - ≥ 50 fotos de calles con gente en ropa de verano, que toma el equipo.
- **Regla:** el umbral queda en el valor más bajo que no rechaza ninguna foto del conjunto negativo, más un margen de 0,15, siempre entre 0,5 y 0,9.
- **Positivos:** el equipo **no** junta material explícito. La cobertura se toma de la métrica publicada. Si el usuario quisiera medirla, se usaría un conjunto académico con su licencia, fuera del repo y sin pasar por la CI.
- Ningún test del repo usa imágenes reales de ninguna de las dos clases: se usan imágenes sintéticas y una huella, como `test_modelo_real.py`.

## 2. Contrato del servicio de inferencia

### Endpoint nuevo o el mismo `/v1/detecciones`

| Opción | A favor | En contra |
|---|---|---|
| **A. `POST /v1/moderacion` nuevo** | Una responsabilidad por endpoint. La creación (síncrona) llama solo a moderación, y la sugerencia oficial (asíncrona, D-08) solo a detección. Agregar una ruta a `/v1` es compatible. Cada modelo tiene su propia versión, su propio límite y su propio log | La vista previa hace dos llamadas internas en vez de una, por la red privada y con la foto ya saneada |
| B. Sumar `moderacion` a la respuesta de `/v1/detecciones` | Una sola llamada en la vista previa | La creación correría RF-DETR (~0,4 s) solo para moderar, y la sugerencia oficial correría la moderación sin usarla. Cambia la forma de un contrato ya publicado. Mezcla un modelo de UX con uno de seguridad, que tienen tolerancias distintas |

**Recomendación: A.**

### Contrato propuesto (lo publica `inferencia/` en NC-10a, con su handoff)

```
POST /v1/moderacion            multipart/form-data, campo «imagen» (JPEG, PNG o WEBP)
200 { "version_modelo": "nsfw-vit-tiny-384-0c26ec2-1a2b3c4d", "puntaje": 0.053 }
GET /salud                     200 { "estado": "ok", "version_modelo": "…", "version_moderacion": "…" }   (campo nuevo, compatible)
```

- **`puntaje`:** probabilidad de contenido sexual explícito, entre 0 y 1; es el máximo de los dos recortes.
  - Sale siempre: un solo número por foto no tiene «ruido» que filtrar, así que **no hay piso técnico**, a diferencia de las detecciones.
  - El umbral de decisión es del backend, igual que en `/v1/detecciones`.
- **`version_modelo`:** `nsfw-vit-tiny-384-<revisión HF, 7>-<sha256 del .onnx, 8>`, con 40 caracteres como máximo.
- **Errores:** idénticos a los de `/v1/detecciones`, con la misma validación previa (bytes, cabecera y píxeles antes de decodificar):
  - 400 `imagen_invalida` o `solicitud_invalida`;
  - 413 `imagen_demasiado_grande`;
  - 500 `error_de_inferencia` o `error_interno`;
  - 503 en texto plano de uvicorn.
- **Concurrencia** (en el mismo proceso):
  - `--limit-concurrency 10` cuenta las conexiones de los **dos** endpoints;
  - la moderación tiene su propio `CapacityLimiter(2)` y su propio candado de modelo, así que una moderación nunca espera detrás de inferencias de RF-DETR;
  - `INFERENCIA_MODERACION_HILOS=1`, fijo para que el resultado sea reproducible entre la vista previa y la creación. La CPU se comparte con RF-DETR (2 vCPU).
- **Dentro del servicio:**
  - las capas son las de §6: `domain/` con un puerto `ModeloDeModeracion` y el valor `PuntajeModeracion`, `application/ModerarImagen`, `infrastructure/OnnxModeracion`, `api/moderacion.py` y `esquemas.py`;
  - la validación de bytes, formato y píxeles se comparte con `DetectarDanos`;
  - los pesos van fuera de git, en `modelos/moderacion.json` con el hash, y el `Dockerfile` los exporta en la etapa `exportador` (que suma timm fijado) y falla si el hash no es el registrado.

### Cómo lo llama el backend

**Dónde vive.** Hay tres opciones:

| Opción | Qué implica | Riesgo |
|---|---|---|
| **A. Módulo nuevo `moderacion`** (sin dependencias, salvo `common`) | `port/ModeradorDeImagen`; `infra/InferenciaModeracionHttpAdapter` y `infra/SinModeracionAdapter`; `domain/PoliticaDeModeracion` y `domain/FiltroDeGroserias`; `service/ModeracionService`. Lo usan `reportes` (creación, edición, comentarios) y `clasificacion` (vista previa) | Un módulo más en §4.3 (D-15). Grafo: `moderacion ← clasificacion ← reportes` y `moderacion ← reportes`, sin ciclos |
| B. Dentro de `clasificacion` | Reutiliza la URL y la configuración de NC-04b | Mezcla «sugerir la categoría» (UX, nunca bloquea) con «rechazar contenido» (seguridad, bloquea). El filtro de texto no tiene nada que ver con fotos |
| C. Dentro de `reportes` | Sin módulo nuevo | La vista previa (`clasificacion`) tendría que depender de `reportes`, y `reportes` ya depende de `clasificacion`: **ciclo** |

**Recomendación: A.** Ocultar y denunciar (NC-11) **no** van en `moderacion`, sino en `reportes`. Si fueran a `moderacion`, ese módulo dependería de `reportes`, y `reportes` de él: otro ciclo.

**El adaptador HTTP** (`MODERACION_TIPO=http`) sigue el patrón de `InferenciaHttpAdapter`:
- `RestClient` sobre el `HttpClient` del JDK, con HTTP/1.1 explícito y sin dependencias nuevas;
- 500 ms de conexión y 2 500 ms de lectura, sin reintentos;
- valida la respuesta solo por su estructura: rechaza la que no tiene `version_modelo` o `puntaje`, la que trae un `puntaje` fuera de [0, 1] y la versión de más de 40 caracteres;
- cada llamada deja una línea de log con su duración.

Hay dos diferencias con NC-04b:
- **Turno:** un `Semaphore(4)` con `tryAcquire` de **hasta 1 s**, y no sin espera. Aquí la alternativa al turno es un 503 al ciudadano, no «sin sugerencia». La suma de turnos de los dos adaptadores (4 + 4 = 8) queda por debajo de `INFERENCIA_MAX_CONCURRENCIA` (10).
- **Falla:** el adaptador lanza `ModeracionNoDisponibleException`, que el servicio traduce a 503 (§4).

**Configuración**, con la misma forma que `CAPTCHA_TIPO` y `CLASIFICACION_TIPO`:

| Variable | Valores | En `prod` |
|---|---|---|
| `MODERACION_TIPO` | `http` o `ninguna`. `ninguna` acepta toda foto y deja un WARN al arrancar | **Sin valor por defecto**: hay que elegir |
| `MODERACION_URL` | URL base del servicio (`http://${{inferencia.RAILWAY_PRIVATE_DOMAIN}}:8000`), la misma que `CLASIFICACION_URL` | Obligatoria con `http` |
| `MODERACION_UMBRAL` | 0,70 por defecto; se valida entre 0,5 y 0,9 | Opcional |

Fuera de `prod` (local, tests y CI), el valor por defecto es `ninguna`, así que los IT que ya crean reportes con foto no cambian. `ValidacionTipoModeracion` rechaza un valor no admitido al arrancar, igual que `ValidacionTipoCaptcha`. No se usa `INFERENCIA_*`, porque ese prefijo es de las variables del propio servicio (NC-04b).

### En qué momentos se analiza

| Momento | Foto | Texto | Si el servicio falla |
|---|---|---|---|
| **Creación** (`POST /api/reportes`) | Sí, **antes de guardar y sin transacción abierta**, sobre la foto ya saneada | Título y descripción | Foto: 503 (§4). Texto: no depende de ningún servicio |
| **Edición** (`PATCH /api/reportes/{id}`) | No: la edición no cambia la foto. Si algún día la cambia, se analiza igual que al crear | Título y descripción, si llegan | — |
| **Vista previa** (`POST /api/clasificaciones`) | Sí, sobre la misma foto saneada, **antes** de clasificar. Si se rechaza, no se clasifica | No (no recibe texto) | No bloquea: el veredicto oficial es el de la creación |
| **Comentario** (`POST /api/reportes/{id}/comentarios`) | — | El contenido | — |
| Adhesión (US-09) | La foto se descarta al adherir, pero llega en la misma solicitud y se analiza igual: se rechaza al subirla, como dice la decisión 1 | Igual que la creación | Igual que la creación |
| Reenvío idempotente (US-06) | **No se vuelve a analizar.** Si la clave ya tiene respuesta, se devuelve esa antes de moderar (lectura sin transacción). Así un reporte que ya entró no recibe un 503 si el servicio cae | — | — |

**La vista previa** suma un campo a `ClasificacionResponse` (cambio de contrato compatible, con su `/contrato`): `fotoRechazada: boolean`, que es `true` solo si el modelo superó el umbral. Si no se pudo revisar, es `false` y todo sigue como hoy.
- **No es una señal interna:** habla de la foto que el propio ciudadano acaba de subir, y la creación le daría el mismo veredicto.
- No expone el puntaje: el razonamiento es el mismo de NC-04 con la confianza.
- En la vista previa, la moderación **no espera turno**: sin turno libre, la foto queda sin revisar (`fotoRechazada: false`) y la vista previa sigue como hoy. La espera de hasta 1 s es solo de la creación.

**Flujo de creación con foto** (supone BE-11, que saca la subida de la transacción):

1. Comprobación de idempotencia, de solo lectura. Si hay respuesta guardada, se devuelve.
2. Validación de campos y del texto: 400 `TEXTO_NO_PERMITIDO` (§5).
3. `SaneadorDeImagen#sanear`, **una sola vez**. Una imagen inválida da el 409 de siempre.
4. `ModeracionService#exigirFotoPermitida(saneada)`:
   - 400 con `codigo` `FOTO_NO_PERMITIDA` y el mensaje «La foto no está permitida. Toma otra.»;
   - 503 con `codigo` `MODERACION_NO_DISPONIBLE`.
   - **Si la foto no pasa, no se abre la transacción ni se sube nada.**
5. Se sube la foto saneada **sin volver a sanearla**, y después va la transacción con la deduplicación, la creación y el evento. Si la transacción se revierte, la compensación de BE-11 borra el objeto.

**El paso 5 exige que el puerto de fotos acepte una foto ya saneada.** Hoy el adaptador sanea dentro de `almacenarFotoReporte`, y volver a sanear (recomprimir) daría a la sugerencia oficial otros píxeles que los de la vista previa, lo que rompe D-08. Si BE-11 no deja ese método, NC-10b lo agrega.

El 400 con `codigo` y el campo en `details` necesita `common/exception/ContenidoNoPermitidoException` (400). También hace falta que `ServicioNoDisponibleException` pueda llevar un `codigo`. Vive en `common` porque `GlobalExceptionHandler` no puede depender de un módulo.

## 3. Registro y datos

- **No se guarda nada de una foto rechazada:** ni la imagen, ni el puntaje, ni un hash.
  - El log deja una línea `WARN` con el id del usuario, el puntaje redondeado y la versión del modelo.
  - Así se puede ver si alguien insiste, sin datos de más.
- **De las fotos aceptadas tampoco se guarda el puntaje.** No hace falta para la tesis (OE3 evalúa la sugerencia de categoría) y sería otra señal interna que proteger.
- **NC-10 no toca el esquema.**

## 4. Si el servicio de inferencia no responde

| Opción | Qué pasa | A favor | En contra |
|---|---|---|---|
| A. Fallar abierto | Sin respuesta, la foto se acepta y se publica. La atrapan las denuncias y el ADMIN | La IA nunca bloquea un reporte (§4.3). Funciona aunque DEP-13 no exista | **Rompe la decisión 1** justo cuando el servicio cae. Un abusador puede aprovechar una caída o una saturación (bastan 10 conexiones abiertas para el 503) |
| **B. Fallar cerrado, con la cola de la PWA** | Sin respuesta, el reporte con foto recibe un 503 `MODERACION_NO_DISPONIBLE`. La PWA ofrece «Guardar para enviar después» (cola de US-06, misma `Idempotency-Key`), que ya reintenta los 5xx, o «Enviar sin foto». Los reportes sin foto no cambian | Cumple «nunca se guarda ni se publica». No se pierde ningún reporte: queda en el teléfono y sale cuando el servicio vuelve. El texto no depende del servicio | El servicio `inferencia` pasa a ser **crítico** para los reportes con foto: su disponibilidad importa, y **NC-10b no puede llegar a producción antes que DEP-13 y NC-10a** |
| C. Cuarentena | Sin respuesta, el reporte se crea, la foto se guarda en privado y un trabajo la publica o la borra cuando el servicio vuelve | No bloquea y no publica nada sin revisar | La foto **sí se guarda** (en contra de la decisión 1). Necesita un estado de la foto, reintentos programados y un aviso posterior al ciudadano. Es lo más caro de construir y probar |

**Recomendación: B**, con tres resguardos:
1. **Interruptor:** `MODERACION_TIPO=ninguna` (abierto y explícito) es la salida de emergencia ante una caída larga. Se registra en el runbook (§10) con su advertencia: mientras está puesto se publican fotos sin revisar.
2. **Despliegues sin corte:** en DEP-13, el servicio `inferencia` configura en Railway el *healthcheck* `/salud`, para que un redespliegue no deje el servicio sin responder (Railway activa la nueva versión cuando pasa el healthcheck; **SUPUESTO** a comprobar en DEP-13).
3. **Orden de despliegue:** primero el servicio con el modelo de moderación (NC-10a) y después el backend con `MODERACION_TIPO=http`. Mientras el servicio no exista, producción corre con `ninguna` y la red de seguridad (NC-11) es lo único activo.

## 5. Texto

### De dónde sale la lista

| Opción | Licencia | Problema |
|---|---|---|
| [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), archivo `es` (68 entradas) | CC BY-4.0, que exige atribución | Es de España y mezcla temas que no son groserías: violencia («asesinato»), drogas («heroína», «drogas»), palabras comunes («martillo», «infierno», «concha», «sexo»). En un reporte vial («casi hay un asesinato por este hueco») daría falsos positivos |
| **Lista propia, versionada** | La del repositorio. No copia ninguna lista de terceros | La tiene que armar y revisar el equipo, que habla español peruano |

**Recomendación: lista propia** en `backend/src/main/resources/moderacion/groserias-es-pe.txt`, con una cabecera que dice la versión, la fecha y los criterios. **El usuario aprueba la versión inicial** en el PR de NC-10b.

**Qué entra:**
- insultos y vulgaridades sexuales **inequívocos** en el uso peruano, con sus formas comunes: plural, femenino, aumentativo y abreviaturas como «ctm», «csm» o «ptm»;
- expresiones de varias palabras («concha de tu madre»).

**Qué no entra:** las palabras con un sentido legítimo que puede aparecer en un reporte o en un nombre propio. Por ejemplo:
- «concha», que es un apellido;
- «huevo», que sí entra en sus derivados insultantes;
- «polla», la lotería en el Perú;
- «paloma», «pájaro», «cono», «ano»;
- «cholo», «serrano», «negro» y «chino», que también son descriptores neutros.

Lo que la lista no atrapa lo atrapa la denuncia (NC-11).

### Campos

| Campo | ¿Se filtra? | Por qué |
|---|---|---|
| Título y descripción, al crear y al editar | **Sí** (decisión 3 y su par natural: el título también es público) | Se publican en el mapa y en el detalle |
| Comentario público (US-27) | **Sí, recomendado** | Es público y es el sitio más probable para un insulto |
| Nombre del perfil (registro y edición) | **Pregunta abierta; recomendado sí** | Se muestra junto a cada comentario. Llevaría el filtro también a `auth` (`moderacion ← auth`, sin ciclo) |
| Tickets de soporte, responsable asignado, categorías de distrito | No | Son privados o los escribe el personal municipal |

### Normalización y comparación

La implementa `moderacion/domain/FiltroDeGroserias`, una regla pura. Cada texto pasa por estos pasos:

1. **NFKC y minúsculas** (`Locale.ROOT`).
2. **Sin tildes ni diéresis, pero la ñ se conserva.** Si no, «año» se convierte en «ano» y «coño» en «cono»; «cono» es una palabra legítima en un reporte vial.
3. **Leetspeak**, solo dentro de tokens que tienen al menos una letra: 0→o, 3→e, 4→a, 5→s, 7→t, @→a, $→s, y 1 se prueba como i y como l. Un número suelto («km 15», «2026») no cambia.
4. **Comodín:** `*` o `#` dentro de una palabra valen por una letra cualquiera («p*ta»).
5. **Tokens:** se corta por todo lo que no es letra (la ñ cuenta como letra). Tres o más tokens de una sola letra seguidos se unen («p u t a», «p.u.t.a»).
6. **Letras repetidas:** cada token se compara en dos formas, con las rachas de 3 o más letras reducidas a 2 y reducidas a 1. «putaaa» da «putaa» y «puta»; «perrrra» da «perra» y «pera». Las entradas de la lista **no** se reducen, así que «pera» (la fruta) no coincide con «perra».
7. **Coincidencia por token entero**, o por secuencia de 2 a 4 tokens para las expresiones. **Nunca por subcadena.**

**Falsos positivos (el problema de Scunthorpe).** Con la regla 7 no coinciden palabras que contienen una grosería: «vehículo», «obstáculo», «película», «cálculo», «computadora», «disputa», «reputación», «imputado». Las tres primeras son comunes en un reporte vial. Lo protegen dos tests:
- **el corpus legítimo:** el archivo de prueba `moderacion/corpus-legitimo.txt` tiene vocabulario vial, los 43 distritos, apellidos comunes y las palabras del ejemplo. **Ninguna** de sus palabras puede coincidir con la lista, en ninguna de sus formas normalizadas;
- **la guarda de la lista:** el archivo no tiene duplicados, cada entrada está en su forma normalizada y la cabecera trae la versión.

**Respuesta.**
- Se responde 400 con `codigo` `TEXTO_NO_PERMITIDO`, `details: ["descripcion"]` (el campo) y el mensaje «La descripción tiene palabras que no están permitidas. Cámbiala para continuar». **No se repite la palabra.**
- El log guarda el campo, la entrada de la lista que coincidió y la versión. No guarda el texto del ciudadano.

**Dónde vive, por capas:**
- `moderacion/domain/FiltroDeGroserias` (regla pura: normaliza y compara);
- `moderacion/infra/ListaDeGroseriasConfig`, que lee el archivo del classpath **al arrancar**, crea el filtro, falla si el archivo falta o está vacío y registra la versión;
- `moderacion/service/ModeracionService#exigirTextoPermitido(campo, texto)`.

No hace falta un puerto: no hay E/S externa en tiempo de ejecución (D-04). **La PWA no duplica la lista:** el 400 llega al instante y el formulario conserva lo escrito.

## 6. Ocultar y denunciar (NC-11, en `reportes`)

### Modelo de datos (una migración, con la siguiente versión libre)

Hoy la siguiente es V20, pero NC-09 probablemente la tome.

```sql
ALTER TABLE reporte
    ADD COLUMN oculto      BOOLEAN NOT NULL DEFAULT FALSE,   -- todo el reporte fuera de lo público
    ADD COLUMN foto_oculta BOOLEAN NOT NULL DEFAULT FALSE;   -- solo la foto
CREATE INDEX ix_reporte_foto_url ON reporte (foto_url);      -- resolver de /media (abajo)

-- historial: cuatro tipos nuevos, sin estados y con el motivo obligatorio
--   FOTO_OCULTA | REPORTE_OCULTO | FOTO_RESTABLECIDA | REPORTE_RESTABLECIDO   (≤ 20 caracteres, cabe en VARCHAR(20))
-- se reemplazan ck_historial_tipo_evento y ck_historial_evento_coherente

CREATE TABLE denuncia_reporte (
    id             BIGSERIAL PRIMARY KEY,
    reporte_id     BIGINT      NOT NULL REFERENCES reporte (id),
    denunciante_id BIGINT      NOT NULL REFERENCES usuario (id),
    motivo         VARCHAR(20) NOT NULL,    -- CONTENIDO_SEXUAL | OFENSIVO | DATOS_PERSONALES | FALSO | OTRO
    detalle        VARCHAR(500),
    estado         VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',  -- PENDIENTE | ATENDIDA | DESESTIMADA
    resuelta_por   BIGINT REFERENCES usuario (id),
    resuelta_en    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_denuncia_reporte_usuario UNIQUE (reporte_id, denunciante_id),
    CONSTRAINT ck_denuncia_resuelta CHECK ((estado = 'PENDIENTE') = (resuelta_en IS NULL))
);
CREATE INDEX ix_denuncia_pendiente ON denuncia_reporte (reporte_id) WHERE estado = 'PENDIENTE';
CREATE INDEX ix_denuncia_denunciante_fecha ON denuncia_reporte (denunciante_id, created_at);
```

- `denuncia_reporte` entra en `AbstractPostgisIT.limpiezaFkSafe()`.
- **BE-14** (cierre de cuenta) tiene que anonimizar `denunciante_id`.
- El motivo de ocultar o restablecer va en `historial_estado_reporte.comentario` y el ADMIN en `autor_id`. No hace falta una tabla aparte: la línea de tiempo sigue siendo **única** (US-15, V4).

### Endpoints

| Método y ruta | Rol | Qué hace | Respuestas |
|---|---|---|---|
| `POST /api/reportes/{id}/denuncias` `{motivo, detalle?}` | CIUDADANO con los términos aceptados | Registra la denuncia. **Una por ciudadano y reporte** (UNIQUE) y **como máximo 10 por ciudadano en 24 h** (`app.moderacion.denuncias-por-dia`) | 201. 404 si el reporte no es público (no existe, está CANCELADO u oculto). 409 si es el propio reporte, ya lo denunció o pasó el límite. 400 si el motivo no es válido |
| `GET /api/admin/moderacion/reportes?estado=PENDIENTE` | ADMIN | Bandeja: reportes con denuncias pendientes, ordenados por cantidad y antigüedad, con el conteo por motivo | 200, paginado |
| `GET /api/admin/moderacion/reportes/{id}` | ADMIN | Detalle: reporte, estado de moderación y denuncias (motivo, detalle, fecha y denunciante) | 200 o 404 |
| `GET /api/admin/moderacion/reportes/{id}/foto` | ADMIN | La foto aunque esté oculta, con `Cache-Control: private, no-store`. La PWA la muestra como `blob:`, como la foto de perfil | 200 o 404 |
| `POST /api/admin/moderacion/reportes/{id}/ocultamiento` `{alcance: REPORTE \| FOTO, motivo}` | ADMIN | Oculta, escribe el historial y pasa a `ATENDIDA` las denuncias pendientes. El motivo tiene de 10 a 500 caracteres | 200. 409 si ya estaba oculto con ese alcance |
| `POST /api/admin/moderacion/reportes/{id}/restablecimiento` `{alcance, motivo}` | ADMIN | Restablece y escribe el historial | 200. 409 si no estaba oculto |
| `POST /api/admin/moderacion/reportes/{id}/desestimacion` `{motivo?}` | ADMIN | Pasa a `DESESTIMADA` las denuncias pendientes | 200 |

Detalles:
- Ninguna ruta nueva es pública (`SecurityConfig` no cambia). El FUNCIONARIO_MUNICIPAL no puede denunciar ni moderar (403).
- **No hay ocultamiento automático por número de denuncias:** si lo hubiera, cualquiera que juntara cuentas podría sacar un reporte del mapa (ver SEC-01 abajo). La denuncia solo pone el reporte en la bandeja.
- «¿Ya denuncié?» no va en ningún DTO. La PWA muestra el botón siempre y, si recibe 409, el mensaje «Ya denunciaste este reporte».

### Qué ve cada quien

| | Público (mapa, búsqueda, detalle, densidad, comentarios) | Creador | Adheridos | Funcionario (bandeja, detalle, exportación) | ADMIN |
|---|---|---|---|---|---|
| **Foto oculta** | El reporte sigue visible, con `fotoUrl` en `null`, y la URL de la foto da 404 | Igual, más el evento con el motivo en su línea de tiempo | Igual que el público | El reporte sin foto | Todo, y la foto por su endpoint |
| **Reporte oculto** | Fuera: 404 en el detalle y en los comentarios; no aparece en la búsqueda, el área, la densidad ni en `mis-adhesiones` | Lo sigue viendo en «Mis reportes» (sin foto), con el evento y el motivo. No puede comentar ni recibir comentarios | Desaparece de su lista | Sigue en la bandeja con `ocultoPorModeracion: true` (DTO interno, como `posibleReincidencia`). Puede gestionarlo o rechazarlo. En la exportación sale con el título «Oculto por moderación» | Todo |

- **Deduplicación (US-09):** `findReporteActivoCercano` ignora los reportes ocultos. Si no lo hiciera, un reporte nuevo y legítimo en el mismo lugar se convertiría en una adhesión invisible. Con solo la foto oculta, la deduplicación sigue igual.
- **Calificación (US-26):** el creador puede calificar su reporte oculto, porque sigue contando (recomendación de abajo).

### La foto en `/media/fotos/reportes/**`

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. El resolver pregunta a la base** | `WebMvcConfig` consulta un puerto nuevo, `common/port/VisibilidadDeFotosDeReporte#esPublica(nombre)`, que implementa `reportes/infra/JpaVisibilidadDeFotosAdapter`. Es el mismo patrón que `clasificacion.port.CategoriasClasificables`. Responde 404 si la foto no pertenece a un reporte con `NOT oculto AND NOT foto_oculta` | Atómico con la transacción que oculta. Restablecer es cambiar un booleano. Una foto huérfana (sin reporte) deja de servirse, y se ahorra la llamada a R2 en un 404 | Una consulta indexada por cada foto que llega al origen. Es poco frente a la lectura de R2 que ya se hace |
| B. Mover el objeto | Pasar `<uuid>.jpg` a `ocultas/<uuid>.jpg` en el mismo bucket, que el resolver nunca resuelve | No consulta la base | No es atómico con la base (necesita compensación). Suma tres métodos al puerto, implementados en los dos adaptadores |

**Recomendación: A.**

**La caché.** Hoy la foto sale con `max-age` de 30 días, `immutable`, y Cloudflare puede guardarla en el borde. Ocultarla no la borra de ahí.

| Opción | Efecto | Costo |
|---|---|---|
| **1. `s-maxage=3600`** en la foto de reporte (el navegador conserva sus 30 días) | El borde la deja de servir en 1 h como máximo | Más lecturas al origen (backend → R2). A esta escala es despreciable (§8). Hay que comprobar con `curl -sI` que Cloudflare respeta `s-maxage` (**SUPUESTO**: lo hace con el *Origin Cache Control* por defecto) |
| 2. Purga por URL desde el backend | Inmediata | Un secreto nuevo (token de Cloudflare con permiso *Cache Purge*) y un adaptador. La purga por URL existe en el plan Free ([docs](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/), 28/10/2026) |
| 3. Purga manual | El ADMIN purga la URL en el panel de Cloudflare | Un paso del runbook |

**Recomendación: 1, más 3 para los casos urgentes.** Lo que un navegador ya descargó no se puede retirar: queda en su caché hasta 30 días.

Si la foto oculta fuera material de abuso sexual infantil, el ADMIN sigue un procedimiento legal que no es técnico (a quién avisar y qué conservar). El runbook debería decirlo; **lo define el usuario**.

### Línea de tiempo

| Tipo | Quién lo escribe | Comentario | Autor visible |
|---|---|---|---|
| `FOTO_OCULTA`, `REPORTE_OCULTO`, `FOTO_RESTABLECIDA`, `REPORTE_RESTABLECIDO` | ADMIN | El motivo, que ven el creador, el funcionario y el ADMIN. Los adheridos ven un texto fijo («Se ocultó contenido de este reporte por las reglas de uso») | Solo el ADMIN. Los demás ven «Moderación de Ciudad Viva» |

Lo aplica `SeguimientoReporteService`, igual que la redacción de las asignaciones.

### Señales internas y SEC-01

- **`ReporteResumenResponse` y `ReporteResponse` no ganan ningún campo.** Lo oculto se nota porque `fotoUrl` es `null` o porque el reporte no aparece. Un IT compara la lista de componentes del record antes y después.
- El conteo de denuncias y los motivos solo aparecen en los DTO del ADMIN. Tampoco los ve el funcionario: no debe saber quién o cuántos denunciaron su distrito.
- **Nadie mueve sus propias métricas:**
  - solo el ADMIN (el equipo de la plataforma, que no se mide) oculta;
  - las denuncias no tienen efecto automático;
  - con la recomendación de abajo, ocultar no cambia el índice.

### ¿Un reporte oculto cuenta para el índice de desempeño? (pregunta abierta)

| Opción | Qué implica |
|---|---|
| **A. Sí cuenta** (recomendada) | La vista materializada no cambia y no hace falta ningún evento. El ADMIN modera **contenido**, no el **daño**: el bache sigue ahí aunque la foto fuera obscena. Si el reporte es falso, la vía ya existe: el funcionario lo `RECHAZA` con su motivo (público, SEC-01). Así ni una ola de denuncias ni una decisión del ADMIN mueven la métrica de un distrito |
| B. No cuenta (como `CANCELADO`) | Migración de la vista con `AND NOT r.oculto` y un evento `ReporteVisibilidadCambiadaEvent` que la refresque al ocultar y al restablecer (regla «todo lo que cambia un KPI publica un evento»). Un reporte falso oculto deja de bajar la tasa del distrito, pero la métrica pasa a depender de una decisión de moderación, y las denuncias se vuelven una palanca para presionar en esa dirección |

## 7. Privacidad: cambios a los términos v2

No se edita la rama `feature/doc-terminos-v2`. **Cuándo entran** es una pregunta abierta:
- si NC-10 y NC-11 salen después de la v0.8.0 (lo esperable, porque van después de NC-09), es una **v3** con su propia aceptación (D-12);
- si salen en la misma versión que la v2, se funden en ella.

En ningún caso se publica la promesa antes de que el código la cumpla. Texto sugerido:

**§2, filas nuevas de la tabla:**

| Dato | Cuándo lo recogemos | Para qué |
|---|---|---|
| Tus denuncias (reporte, motivo, detalle opcional y fecha) | Si usas «Denunciar contenido» | Revisar el contenido denunciado y evitar abusos (una denuncia por reporte y un máximo por día) |

**§4, sección nueva «4 bis. Revisión del contenido antes de publicar»** (o §5 si se renumera):

> Antes de publicar tu reporte revisamos automáticamente:
> - **La foto**, para detectar contenido sexual. La revisión la hace el mismo servicio propio que sugiere el tipo de daño (§4), sin enviar la foto a terceros. Si detecta ese contenido, la foto **se rechaza y no se guarda**, y puedes tomar otra. Si el servicio no está disponible en ese momento, no podemos aceptar la foto: tu reporte queda guardado en tu dispositivo y se envía cuando el servicio vuelva, o puedes enviarlo sin foto.
> - **El título, la descripción y los comentarios**, comparándolos con una lista de palabras ofensivas. Si encontramos una, te pedimos cambiarla antes de publicar. No guardamos el texto rechazado.
>
> No guardamos el resultado de estas revisiones. Son automáticas y pueden equivocarse: si crees que rechazamos algo por error, escríbenos por Soporte.

**§7, viñeta nueva:**

> - **Denuncias que haces:** mientras exista el reporte denunciado. Si cierras tu cuenta, se conservan sin ningún dato que te identifique.

**§10, al final, reemplaza «Podemos rechazar o retirar contenido que incumpla estas reglas»:**

> Si ves un reporte que incumple estas reglas, usa **«Denunciar contenido»**. El equipo de Ciudad Viva revisa cada denuncia y puede ocultar el reporte o su foto; el autor ve el motivo en la línea de tiempo de su reporte. Quien hizo el reporte no sabe quién lo denunció.

**§11, reemplaza «Ciudad Viva no revisa las fotos antes de publicarlas.»:**

> Una revisión automática rechaza las fotos con contenido sexual y los textos con palabras ofensivas (§4 bis), pero no es infalible ni revisa todo lo demás.

**§12, en la nota de la versión:** «se agregó la revisión automática del contenido y las denuncias (§4 bis, §10)».

**§13, viñeta nueva:**

> - **Revisión de fotos:** modelo `nsfw-image-detection-384` de Marqo ([huggingface.co/Marqo/nsfw-image-detection-384](https://huggingface.co/Marqo/nsfw-image-detection-384)), afinado a partir de ViT-Tiny de `timm`, bajo licencia [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0). Ciudad Viva lo usa sin reentrenarlo, exportado a ONNX.

## 8. Costo en Railway

Precios: memoria a US$ 10 por GB-mes y CPU a US$ 20 por vCPU-mes, facturados por segundo ([railway.com/pricing](https://railway.com/pricing), consultado el 28/10/2026).

| Concepto | Cálculo | US$/mes |
|---|---|---|
| RAM del modelo de moderación, residente | ~65 MiB ≈ 0,064 GB × 10 | ≈ 0,6 |
| CPU | ~0,1 s por recorte × 2 recortes × 2 análisis por reporte con foto (vista previa y creación) ≈ 0,4 vCPU·s. Con 1 000 reportes al mes: 400 vCPU·s ≈ 0,00015 vCPU-mes × 20 | < 0,01 (0,4 con 50 000 reportes) |
| Filtro de texto, denuncias y ocultamiento | Consultas cortas a PostGIS | ≈ 0 |
| `s-maxage` de 1 h | Más lecturas al origen. Una foto de ~300 KB servida 10 000 veces más al mes son ~3 GB de egreso a US$ 0,05 por GB. R2 no cobra egreso, y su capa gratuita cubre las lecturas | ≈ 0,15 |
| **Total** | Se suma a los ~US$ 6 actuales y a los ~US$ 9–11 previstos con la inferencia de daños | **+≈ US$ 1**, es decir, **~US$ 10–12** |

La imagen de `inferencia` crece unos 22 MB (de 637 a ~660 MB), lo que no tiene costo de ejecución. El límite de 1 GB alcanza: el pico medido de RF-DETR (478 MiB) más el de la moderación (~65 MiB) más dos imágenes decodificadas queda en ~600 MiB. NC-10a lo vuelve a medir con 4 clientes mezclados.

## 9. Impacto

| Dónde | Cambio |
|---|---|
| **Normas** (sesión de raíz, si se acepta) | `ARCHITECTURE.md` §4.3 suma la fila del módulo `moderacion` y el grafo; §6 y §7, el contrato `/v1/moderacion`; §8, `reporte.oculto` y `foto_oculta` y la entidad DENUNCIA_REPORTE en `reportes`; §9, la fila **D-15** con el módulo, la falla cerrada y el resolver de fotos |
| **Contrato `inferencia` → backend** | `POST /v1/moderacion` y `version_moderacion` en `/salud`, los dos compatibles. Handoff en NC-10a |
| **Contrato backend → PWA** | `fotoRechazada` en `ClasificacionResponse`; los códigos `FOTO_NO_PERMITIDA`, `TEXTO_NO_PERMITIDO` y `MODERACION_NO_DISPONIBLE`; las rutas de denuncia y de moderación del ADMIN; los 4 tipos de evento del historial; `ocultoPorModeracion` en `ReporteGestionResponse`. Cada uno con su `/contrato` |
| **Migraciones** | NC-10: ninguna. NC-11: una (arriba) |
| **Tests** | Los de cada ficha. **Nunca hay imágenes explícitas en el repo ni en la CI.** Los mínimos de la CI (`MIN_PYTEST_INFERENCIA`, `MIN_SUREFIRE`, `MIN_IT_FAILSAFE`) los sube la sesión de raíz al fusionar |
| **Despliegue** | Variables `MODERACION_TIPO`, `MODERACION_URL` y `MODERACION_UMBRAL` en el backend, e `INFERENCIA_MODERACION_HILOS=1` en `inferencia`. Healthcheck `/salud` en Railway. Runbook: el interruptor `ninguna` (§10), la purga manual de una URL y el procedimiento ante material ilegal. Orden: NC-10a desplegado antes que el backend con `http` |
| **Otras tareas** | BE-11 (la foto sin transacción) va antes que NC-10b. BE-14 anonimiza `denuncia_reporte` |

## 10. Plan de sprints (fila propuesta, no editada)

| Sprint | Backend | Frontend | Versión |
|---|---|---|---|
| Moderación (después de NC-09) | NC-10a (`inferencia/`) · NC-10b · NC-11a | NC-10c · NC-11b | la que decida el usuario: v0.9.0 si va antes del S6 (y el S6 pasa a v0.10.0), o junto a otra |

Va **antes de abrir la plataforma a usuarios reales** (v1.0.0) y **después de DEP-13** en producción.

## Recomendación (resumen)

1. **Modelo:** Marqo `nsfw-image-detection-384` (Apache-2.0, 22,4 MB, +63 MiB de RAM, ~0,1 s por recorte), con dos recortes y el máximo. Umbral inicial de 0,70, que se calibra contra fotos de pistas y calles de Lima.
2. **Contrato:** `POST /v1/moderacion` aparte, con los mismos errores, la misma validación y el mismo tope de 10 conexiones; un limitador propio y sin piso. El umbral es del backend.
3. **Backend:** módulo nuevo `moderacion` (puerto y adaptador HTTP con un turno de 4 que espera hasta 1 s). Se analiza antes de guardar y sin transacción, sobre la foto saneada una sola vez. La vista previa avisa con `fotoRechazada`.
4. **Ante una caída: fallar cerrado** con 503 `MODERACION_NO_DISPONIBLE`, la cola de la PWA y el interruptor `MODERACION_TIPO=ninguna` para emergencias.
5. **Texto:** lista propia y versionada que aprueba el usuario. Se compara por token entero, sin plegar la ñ, con un corpus legítimo en los tests. Cubre título, descripción y comentarios.
6. **Red de seguridad:** ocultar el reporte o la foto (ADMIN, con motivo y línea de tiempo) y denunciar (CIUDADANO, una por reporte y 10 por día), en `reportes`. El resolver de `/media` consulta la base y la foto lleva `s-maxage=3600`. Sin ocultamiento automático. El reporte oculto **sigue contando** en el índice.

## Qué decide el usuario

1. **Modelo:** Marqo `nsfw-image-detection-384` (recomendado), OpenNSFW2, o una ViT-base cuantizada.
2. **Umbral y calibración:** 0,70 inicial, con calibración solo sobre fotos negativas y sin juntar material explícito.
3. **Falla:** cerrada con la cola de la PWA (recomendada), abierta o cuarentena.
4. **Campos del filtro de texto:** título, descripción y comentarios (recomendado). ¿También el nombre del perfil? Se recomienda que sí.
5. **Lista:** propia (recomendada). ¿Quién arma la versión inicial: el agente de backend con los criterios de §5 y la revisión del usuario, o el equipo?
6. **Alcance del ocultamiento:** reporte y foto por separado (recomendado). La foto oculta se conserva en privado hasta restablecerla (recomendado) o se borra.
7. **Índice:** ¿el reporte oculto cuenta? Se recomienda que sí (opción A).
8. **Caché de la foto:** `s-maxage=3600` con purga manual (recomendado), o purga por API con un token nuevo.
9. **Denuncias:** los motivos propuestos, el límite de 10 por día y la conservación «mientras exista el reporte».
10. **Términos:** ¿v3 con su propia aceptación cuando salgan NC-10 y NC-11 (recomendado), o fundirlos en la v2 si coinciden en la misma versión?
11. **Material ilegal:** el procedimiento del runbook si una foto oculta resulta ser abuso sexual infantil.
12. **Sprint y versión** de la fila propuesta en §10.
13. **ARCHITECTURE.md:** el módulo `moderacion` y la fila D-15.

## Qué queda bloqueado mientras no se decida

- **NC-10a**, NC-10b y NC-10c esperan las decisiones 1 a 5 y la 13.
- **NC-11a** y NC-11b esperan las decisiones 6 a 9.
- La **v3 de los términos** (o el cambio en la v2) espera la decisión 10.
- No bloquea nada en curso: NC-09, BE-11 a BE-14 y DEP-13 siguen igual. BE-11 conviene que entre antes que NC-10b.
