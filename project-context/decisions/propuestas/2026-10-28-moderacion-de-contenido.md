# Propuesta: moderación de contenido al crear un reporte (NC-10 y NC-11)

- **Estado:** decidida (2026-10-28). El usuario tomó todas las decisiones: las 4 del encargo (1 a 4), 4 más sobre esta propuesta (5 a 8) y las respuestas a las 10 preguntas abiertas (9 a 18). Solo falta que el usuario confirme con su asesor el procedimiento ante material ilegal (decisión 16).
- **Fecha:** 2026-10-28
- **Origen:** subagente arquitecto, encargo del coordinador: diseñar la moderación de contenido y dejarla lista para implementar.
- **Decide:** el usuario.
  - **Ya registrado:** ARCHITECTURE.md (módulo `moderacion`, contrato `/v1/moderacion`, entidades y la fila **D-15**) y las fichas NC-10 y NC-11 de `plan-migracion-capas.md`.
  - **También registrado (28/10):** la fila del S7 y el párrafo de la moderación en `plan-sprints.md` (§10).

> Licencias, tamaños y precios consultados el **28/10/2026** en las fuentes citadas. Las cifras de RAM y latencia se midieron ese día en el portátil de desarrollo (i7-13620H, Windows, onnxruntime 1.31.1), fuera del repo, y en Railway hay que volver a medirlas. Lo marcado **SUPUESTO** no se verificó. Esto no es asesoría legal.

## Decisiones del usuario (28/10)

1. **Una foto obscena o sexual se rechaza al subirla.** El ciudadano ve «La foto no está permitida» y puede tomar otra. La foto nunca se guarda ni se publica.
2. **El análisis corre en nuestro servicio `inferencia/`** (FastAPI + ONNX, el mismo que sirve RF-DETR), con un modelo abierto. No se usan APIs de terceros, porque los términos v2 prometen que la foto no sale a terceros.
3. **Una descripción con palabras ofensivas se rechaza con un aviso que no repite la palabra.** Se usa una lista fija de groserías del español peruano, con normalización de tildes, letras repetidas y números (*leetspeak*).
4. **Red de seguridad:**
   - el ADMIN puede ocultar un reporte, o solo su foto, ya publicados, con un motivo y un registro en la línea de tiempo;
   - un ciudadano puede denunciar un reporte público con el botón «Denunciar contenido», y la denuncia llega a una bandeja del ADMIN.

## Decisiones del usuario sobre esta propuesta (28/10)

5. **Modelo aprobado:** Marqo `nsfw-image-detection-384`, revisión `0c26ec2`, con **umbral inicial 0,70** (§1).
6. **Si el servicio no responde, se falla cerrado** (§4, opción B):
   - el reporte con foto recibe un 503;
   - la PWA ofrece la cola sin conexión o «Enviar sin foto»;
   - `MODERACION_TIPO=ninguna` queda como interruptor de emergencia.
7. **Un reporte oculto por el ADMIN se excluye del índice de desempeño** (§6, opción B). Es lo contrario de lo que recomendaba esta propuesta. SEC-01 se mantiene porque solo el ADMIN (la plataforma) oculta y la municipalidad nunca: nadie mueve sus propias métricas. Hace falta:
   - que la vista materializada del índice y la exportación excluyan lo oculto;
   - que ocultar y restablecer disparen el `REFRESH`, como `IndiceDesempenoRefreshListener`;
   - IT que lo prueben;
   - que quede claro en la línea de tiempo.
8. **Términos:** la moderación va **dentro de la v2**, que todavía no se publicó. No hay v3 (§7).

## Respuestas del usuario a las preguntas abiertas (28/10)

El usuario respondió «Me parece bien» a las 10 recomendaciones:

9. **Calibración del umbral:** solo con fotos negativas (pistas y calles de Lima), con la regla de §1. El equipo no junta material explícito.
10. **El nombre del perfil también se filtra,** además del título, la descripción y los comentarios. Se filtra al registrarse y al editar el perfil, así que `auth` usa `moderacion`.
11. **La lista inicial la arma el agente de backend** con los criterios de §5, y el usuario la aprueba en el PR de NC-10b.
12. **El reporte y la foto se ocultan por separado,** y la foto oculta se conserva en privado hasta restablecerla, sin borrarla. **Ocultar solo la foto no saca al reporte del índice.**
13. **El reporte oculto sale también de la bandeja municipal** (y de su detalle de gestión). `ReporteGestionResponse` no gana ningún campo.
14. **Caché:** `s-maxage=3600` en la foto de reporte, más la purga manual en el panel de Cloudflare para los casos urgentes. No hay token de purga.
15. **Denuncias:** los motivos propuestos (`CONTENIDO_SEXUAL`, `OFENSIVO`, `DATOS_PERSONALES`, `FALSO`, `OTRO`), un máximo de 10 por ciudadano al día, y se conservan mientras exista el reporte. Al cerrar la cuenta se anonimizan (BE-14).
16. **Material ilegal** (una foto oculta que resulta ser abuso sexual infantil). El ADMIN:
    - oculta de inmediato el reporte;
    - no lo borra, no lo descarga ni lo reenvía;
    - lo conserva en privado;
    - lo denuncia ante la Policía Nacional (DIVINDAT, División de Investigación de Delitos de Alta Tecnología) o el Ministerio Público.

    **El usuario lo confirma con su asesor** antes de abrir a usuarios reales. Va al runbook.
17. **Versión:** NC-10 y NC-11 entran en la **v0.8.0**, junto con los términos v2. La fila del sprint queda propuesta en §10.
18. **ARCHITECTURE.md:** sí al módulo `moderacion` y a la fila **D-15**.

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

### Recomendación: Marqo `nsfw-image-detection-384` (aprobada por el usuario el 28/10, decisión 5)

- **Licencia Apache-2.0**, compatible con un repo público. La atribución va en §13 de los términos, junto a RF-DETR.
- **Cabe con holgura:** +63 MiB, frente a los 1 GB del servicio con RF-DETR.
- **Cuesta poco:** ~0,1 s por recorte, contra los ~0,4 s por foto de RF-DETR.
- **Es el único de los tres con métricas publicadas.** Hay que leerlas con cautela, porque las mide el autor sobre datos propietarios. La procedencia de los datos de entrenamiento no se conoce en ninguno de los candidatos.

**Preprocesado.** Es el de evaluación de timm: bicúbico de Pillow con el lado menor a 384, normalización de 0,5/0,5 y orden de etiquetas `["NSFW", "SFW"]`.
- timm hace un recorte central de 384, que en una foto 4:3 deja fuera el 12,5 % de cada lado.
- **Se proponen dos recortes de 384 que cubren todo el lado mayor, y se toma el máximo.** Así nada queda fuera del análisis.
- En las 120 fotos de pistas, el máximo no cambió (0,105) y el costo se duplica a ~0,2 s.

**Umbral inicial: 0,70** (decidido el 28/10).
- `MODERACION_UMBRAL` en el backend, igual que `CLASIFICACION_UMBRAL`.
- El servicio solo mide; la regla «rechazar si el puntaje ≥ umbral» vive en `moderacion/domain/PoliticaDeModeracion`.
- Según la gráfica del autor, a 0,7 la cobertura de NSFW es de ~0,96 y la precisión de ~0,99.
- Como el modelo usa *label smoothing*, la salida queda entre ~0,05 y ~0,95, así que un umbral por encima de 0,9 deja pasar casi todo.

**Calibración (en NC-10a, con el script nuevo `scripts/calibrar_moderacion.py`; decisión 9).**
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

**Decidido (D-15, 28/10): A.**

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

**Decidido (D-15, 28/10): A**, con `auth` como tercer usuario del módulo por el nombre del perfil (decisión 10). Grafo: `moderacion ← auth`, `moderacion ← clasificacion` y `moderacion ← reportes`, sin ciclos, porque `moderacion` solo depende de `common`. Ocultar y denunciar (NC-11) **no** van en `moderacion`, sino en `reportes`. Si fueran a `moderacion`, ese módulo dependería de `reportes`, y `reportes` de él: otro ciclo.

**El adaptador HTTP** (`MODERACION_TIPO=http`) sigue el patrón de `InferenciaHttpAdapter`:
- `RestClient` sobre el `HttpClient` del JDK, con HTTP/1.1 explícito y sin dependencias nuevas;
- 500 ms de conexión y 2 500 ms de lectura, sin reintentos;
- valida la respuesta solo por su estructura: rechaza la que no tiene `version_modelo` o `puntaje`, la que trae un `puntaje` fuera de [0, 1] y la versión de más de 40 caracteres;
- cada llamada deja una línea de log con su duración.

Hay dos diferencias con NC-04b:
- **Turno:** un `Semaphore(4)` con `tryAcquire` de **hasta 1 s**, y no sin espera. Aquí la alternativa al turno es un 503 al ciudadano, no «sin sugerencia». La suma de turnos de los dos adaptadores (4 + 4 = 8) queda por debajo de `INFERENCIA_MAX_CONCURRENCIA` (10).
  - Los turnos de moderación son aparte de los de detección.
  - NC-04c (en curso) hace que la sugerencia oficial espere hasta 10 s por un turno de detección. Eso no cambia nada de lo de aquí: la detección sigue con 4 conexiones como máximo.
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
| Sugerencia oficial (D-08, asíncrona) | **No.** `SugerenciaCategoriaService` no llama al moderador: la foto guardada ya pasó la moderación al crear el reporte. Un doble que cuenta las llamadas lo prueba (NC-10b) | — | — |

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

**Decidido por el usuario el 28/10: B** (decisión 6), con estos tres resguardos:
1. **Interruptor:** `MODERACION_TIPO=ninguna` (abierto y explícito) es la salida de emergencia ante una caída larga. Se registra en el runbook (§10) con su advertencia: mientras está puesto se publican fotos sin revisar.
2. **Despliegues sin corte:** en DEP-13, el servicio `inferencia` configura en Railway el *healthcheck* `/salud`, para que un redespliegue no deje el servicio sin responder (Railway activa la nueva versión cuando pasa el healthcheck; **SUPUESTO** a comprobar en DEP-13).
3. **Orden de despliegue:** primero el servicio con el modelo de moderación (NC-10a) y después el backend con `MODERACION_TIPO=http`. Mientras el servicio no exista, producción corre con `ninguna` y la red de seguridad (NC-11) es lo único activo.

## 5. Texto

### De dónde sale la lista

| Opción | Licencia | Problema |
|---|---|---|
| [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), archivo `es` (68 entradas) | CC BY-4.0, que exige atribución | Es de España y mezcla temas que no son groserías: violencia («asesinato»), drogas («heroína», «drogas»), palabras comunes («martillo», «infierno», «concha», «sexo»). En un reporte vial («casi hay un asesinato por este hueco») daría falsos positivos |
| **Lista propia, versionada** | La del repositorio. No copia ninguna lista de terceros | La tiene que armar y revisar el equipo, que habla español peruano |

**Decidido (28/10, decisión 11): lista propia** en `backend/src/main/resources/moderacion/groserias-es-pe.txt`, con una cabecera que dice la versión, la fecha y los criterios. La arma el agente de backend y **el usuario aprueba la versión inicial** en el PR de NC-10b.

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
| Comentario público (US-27) | **Sí** (decisión 10) | Es público y es el sitio más probable para un insulto |
| Nombre del perfil (registro y edición) | **Sí** (decisión 10) | Se muestra junto a cada comentario. Llevaría el filtro también a `auth` (`moderacion ← auth`, sin ciclo) |
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

NC-09 toma V20 (PR #122), así que probablemente sea V21.

```sql
ALTER TABLE reporte
    ADD COLUMN oculto      BOOLEAN NOT NULL DEFAULT FALSE,   -- todo el reporte fuera de lo público y del índice
    ADD COLUMN foto_oculta BOOLEAN NOT NULL DEFAULT FALSE;   -- solo la foto; el reporte sigue contando
CREATE INDEX ix_reporte_foto_url ON reporte (foto_url);      -- resolver de /media (abajo)

-- índice de desempeño (decisión 7): se vuelve a crear la vista, como en V7, con un filtro más
--   LEFT JOIN reporte r ON r.distrito_id = d.id AND r.estado <> 'CANCELADO' AND NOT r.oculto
-- y su índice único ux_mv_indice_desempeno_id. Las calificaciones de un reporte oculto
-- tampoco cuentan, porque se unen a través de r.

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
- **No hay ocultamiento automático por número de denuncias:** si lo hubiera, cualquiera que juntara cuentas podría sacar un reporte del mapa y, desde la decisión 7, también del índice (ver SEC-01 abajo). La denuncia solo pone el reporte en la bandeja.
- «¿Ya denuncié?» no va en ningún DTO. La PWA muestra el botón siempre y, si recibe 409, el mensaje «Ya denunciaste este reporte».
- **El motivo de ocultar o restablecer no delata a quien denunció** (revisión del 28/10). Es texto libre del ADMIN, y lo leen el creador y el funcionario.
  - El servidor no le agrega datos de las denuncias.
  - El servidor rechaza con 400 un motivo que contenga el correo de alguno de los denunciantes del reporte.
  - El diálogo del ADMIN avisa que no nombre a quien denunció ni diga cuántas denuncias hubo.

  Es coherente con los términos v2, §5: «quien hizo el reporte no sabe quién lo denunció».

### Qué ve cada quien

| | Público (mapa, búsqueda, detalle, densidad, comentarios) | Creador | Adheridos | Funcionario (bandeja, detalle, exportación) | ADMIN |
|---|---|---|---|---|---|
| **Foto oculta** | El reporte sigue visible, con `fotoUrl` en `null`, y la URL de la foto da 404 | Igual, más el evento con el motivo en su línea de tiempo | Igual que el público | El reporte sin foto, en la bandeja y en la exportación. **Sigue contando en el índice** | Todo, y la foto por su endpoint |
| **Reporte oculto** | Fuera: 404 en el detalle y en los comentarios; no aparece en la búsqueda, el área, la densidad ni en `mis-adhesiones` | Lo sigue viendo en «Mis reportes» (sin foto), con el evento, el motivo y el aviso de que no cuenta en el índice. No puede comentar ni recibir comentarios | Desaparece de su lista, y su historial da 404 | **Sale del índice, de la exportación** (decisión 7) **y de la bandeja**, junto con su detalle de gestión (decisión 13). Mientras esté oculto, el funcionario recibe 404 en el historial, en el responsable (GET y POST) y al cambiarle el estado | Todo |

Con el reporte oculto, **solo lo ven su creador y el ADMIN**. Al restablecerlo, todos recuperan el acceso que tenían, y la línea de tiempo muestra el par oculto/restablecido como dice la tabla de «Línea de tiempo».

- **Deduplicación (US-09):** `findReporteActivoCercano` ignora los reportes ocultos. Si no lo hiciera, un reporte nuevo y legítimo en el mismo lugar se convertiría en una adhesión invisible. Con solo la foto oculta, la deduplicación sigue igual.
- **Calificación (US-26):** mientras el reporte esté oculto, su calificación no cuenta en el índice, porque la vista la une a través del reporte. Al restablecerlo vuelve a contar.
- **Solo la foto oculta no mueve el índice.** El reporte sigue público y el daño sigue registrado. Por eso, si el daño es real y solo la foto incumple, el ADMIN oculta la foto y no el reporte.

### La foto en `/media/fotos/reportes/**`

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. El resolver pregunta a la base, y vive en `reportes`** | El *resource handler* de `/media/fotos/reportes/**` pasa de `common/config/WebMvcConfig` a `reportes/infra/FotosDeReporteWebConfig`. Su resolver pregunta a `ReporteRepository` si la foto es de un reporte con `NOT oculto AND NOT foto_oculta` y la carga por `common.port.FotoStorageService`. Si no, responde 404 | Atómico con la transacción que oculta. Restablecer es cambiar un booleano. Una foto huérfana (sin reporte) deja de servirse, y se ahorra la llamada a R2 en un 404. No crea ningún puerto en `common` | Una consulta indexada por cada foto que llega al origen. Es poco frente a la lectura de R2 que ya se hace. Mueve una clase de `common` a `reportes` |
| A'. El mismo resolver en `common`, con un puerto invertido | `WebMvcConfig` se queda en `common` y consulta `common/port/VisibilidadDeFotosDeReporte`, que implementa `reportes/infra` | No mueve clases | `common/port` es solo para I/O externa que usan dos o más módulos (§4.3, D-11). Este puerto no es de I/O externa: obligaría a aflojar la norma |
| B. Mover el objeto | Pasar `<uuid>.jpg` a `ocultas/<uuid>.jpg` en el mismo bucket, que el resolver nunca resuelve | No consulta la base | No es atómico con la base (necesita compensación). Suma tres métodos al puerto, implementados en los dos adaptadores |

**Decidido (D-15, 28/10): A**, con el resolver en `reportes`. La primera versión de esta propuesta usaba el puerto invertido (A'); la revisión del 28/10 lo cambió para no aflojar la norma de `common/port`. Servir la foto de un reporte depende ahora de una regla de `reportes`, su visibilidad. Guardar y cargar siguen en `common` (D-11).

**La caché.** Hoy la foto sale con `max-age` de 30 días, `immutable`, y Cloudflare puede guardarla en el borde. Ocultarla no la borra de ahí.

| Opción | Efecto | Costo |
|---|---|---|
| **1. `s-maxage=3600`** en la foto de reporte (el navegador conserva sus 30 días) | El borde la deja de servir en 1 h como máximo | Más lecturas al origen (backend → R2). A esta escala es despreciable (§8). Hay que comprobar con `curl -sI` que Cloudflare respeta `s-maxage` (**SUPUESTO**: lo hace con el *Origin Cache Control* por defecto) |
| 2. Purga por URL desde el backend | Inmediata | Un secreto nuevo (token de Cloudflare con permiso *Cache Purge*) y un adaptador. La purga por URL existe en el plan Free ([docs](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/), 28/10/2026) |
| 3. Purga manual | El ADMIN purga la URL en el panel de Cloudflare | Un paso del runbook |

**Decidido (28/10, decisión 14): 1, más 3 para los casos urgentes.** Lo que un navegador ya descargó no se puede retirar: queda en su caché hasta 30 días.

**Material ilegal (decisión 16).** Si la foto oculta fuera material de abuso sexual infantil, el ADMIN:
- oculta el reporte de inmediato;
- no lo borra, no lo descarga ni lo reenvía, y lo conserva en privado;
- lo denuncia ante la Policía Nacional (DIVINDAT) o el Ministerio Público.

**El usuario lo confirma con su asesor** antes de abrir a usuarios reales. El procedimiento va al runbook (`docs/despliegue.md`).

### Línea de tiempo

| Tipo | Quién lo escribe | Comentario | Autor visible |
|---|---|---|---|
| `FOTO_OCULTA`, `REPORTE_OCULTO`, `FOTO_RESTABLECIDA`, `REPORTE_RESTABLECIDO` | ADMIN | El motivo, que ven el creador, el funcionario y el ADMIN. Los adheridos ven un texto fijo («Se ocultó contenido de este reporte por las reglas de uso»). Vale para quien tiene acceso al historial: **mientras el reporte está oculto, solo el creador y el ADMIN** (el funcionario y los adheridos reciben 404). Con la foto oculta, o con el reporte ya restablecido, todos los que tenían acceso lo ven | Solo el ADMIN. Los demás ven «Moderación de Ciudad Viva» |

Lo aplica `SeguimientoReporteService`, igual que la redacción de las asignaciones.

**Que quede claro el efecto en el índice** (decisión 7). Para todos los que ven la línea de tiempo, la entrada lleva un texto fijo, además del motivo, que arma el servidor y que el ADMIN no escribe:
- `REPORTE_OCULTO`: «Mientras esté oculto, este reporte no cuenta en el índice de desempeño.»
- `REPORTE_RESTABLECIDO`: «Vuelve a contar en el índice de desempeño.»
- `FOTO_OCULTA` y `FOTO_RESTABLECIDA` no lo llevan, porque no cambian el índice.

Así el creador sabe por qué su reporte dejó de pesar en la métrica, y el ADMIN deja la traza auditable de cada salida del índice.

### Señales internas y SEC-01

- **`ReporteResumenResponse` y `ReporteResponse` no ganan ningún campo.** Lo oculto se nota porque `fotoUrl` es `null` o porque el reporte no aparece. Un IT compara la lista de componentes del record antes y después.
- El conteo de denuncias y los motivos solo aparecen en los DTO del ADMIN. Tampoco los ve el funcionario: no debe saber quién o cuántos denunciaron su distrito.
- **Nadie mueve sus propias métricas** (SEC-01, con la decisión 7):
  - ocultar el reporte saca al reporte del índice, pero **solo lo hace el ADMIN** (la plataforma, que no se mide), y cada vez deja un motivo y una entrada en la línea de tiempo;
  - **la municipalidad nunca oculta.** El FUNCIONARIO_MUNICIPAL no tiene ninguna ruta de moderación ni de denuncia (403), y su única vía para descartar sigue siendo `RECHAZADO`, que cuenta;
  - las denuncias no tienen efecto automático, así que juntar cuentas no saca nada del índice.

### El reporte oculto sale del índice de desempeño (decisión del usuario, 28/10)

Se tomó la opción B, la contraria a la que recomendaba esta propuesta: un reporte oculto no cuenta, igual que uno `CANCELADO`. Lo que implica:

| Pieza | Cambio |
|---|---|
| **Vista materializada** | En la migración de NC-11a se vuelve a crear `mv_indice_desempeno_distrital` con `AND NOT r.oculto` en el `LEFT JOIN` de `reporte` (bloque SQL de arriba). `foto_oculta` no la toca |
| **Evento y refresco** | `ModeracionReporteService` publica `ReporteVisibilidadCambiadaEvent(reporteId, distritoId)` al ocultar y al restablecer **el reporte** (no la foto). `desempeno/listener/IndiceDesempenoRefreshListener` suma un manejador `AFTER_COMMIT`, igual que los cuatro que ya tiene. Cumple la regla «toda operación que cambie un KPI publica un evento». Si BE-12 ya entró, el refresco es asíncrono y coalescido, como el resto |
| **Exportación** | `buscarParaExportar` excluye los reportes ocultos. Así, lo que exporta la municipalidad coincide con lo que mide el índice |
| **Línea de tiempo** | El texto fijo de la subsección anterior |
| **IT** | Ocultar el reporte baja `total_reportes`, y `total_resueltos` si estaba resuelto, del distrito y de su categoría, después del refresco. Restablecerlo los devuelve. Ocultar solo la foto no cambia el índice. La exportación no trae el reporte oculto. El FUNCIONARIO_MUNICIPAL y el CIUDADANO reciben 403 en las rutas de moderación |

**Riesgo que queda.** El índice ahora depende también de una decisión de moderación. Lo acota que la toma solo el ADMIN, con motivo, de forma visible en la línea de tiempo y reversible. Si el reporte es real y solo la foto incumple, se oculta la foto, que no mueve el índice.

## 7. Privacidad: cambios a los términos v2

**Decidido por el usuario el 28/10 (decisión 8): la moderación va dentro de la v2**, que todavía no se publicó. No hay v3.

El texto ya está en la rama `feature/doc-terminos-v2` (PR #116). Esa rama también suma la confirmación del correo de NC-09 (PR #122). Qué cambia:
- **§2:** filas de las denuncias y de la confirmación del correo.
- **§5 nueva, «Revisión del contenido antes de publicar»:**
  - la foto se revisa en el servicio propio para rechazar contenido sexual u obsceno, sin terceros y sin guardar nada si se rechaza;
  - si el servicio no responde, la foto no se acepta: el reporte queda en el teléfono o se envía sin foto;
  - el título, la descripción y los comentarios se comparan con una lista de palabras;
  - el ADMIN puede ocultar un reporte o su foto, con un motivo, y un reporte oculto sale del índice;
  - un ciudadano puede denunciar.
- **§8, retención:** se suman las denuncias. Las secciones 5 a 13 de la v2 pasan a ser 6 a 14.
- **§12:** se cambia la frase «Ciudad Viva no revisa las fotos antes de publicarlas».
- **§14:** se suma la atribución del modelo de Marqo.

**El texto no puede adelantarse al código.** La v2 se publica en la versión en que salgan NC-09, NC-10 y NC-11. Si alguna no llega a esa versión, la sesión de raíz quita su párrafo antes de publicar.

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
| **Normas** (hecho el 28/10, en la rama de esta propuesta) | `ARCHITECTURE.md` versión 1.6: §4.3 suma la fila del módulo `moderacion`, el grafo y el paso de la moderación en el flujo del núcleo; §6 y §7, el contrato `/v1/moderacion`; §8, `reporte.oculto` y `foto_oculta` y la entidad DENUNCIA_REPORTE en `reportes`; §9, la fila **D-15** |
| **Contrato `inferencia` → backend** | `POST /v1/moderacion` y `version_moderacion` en `/salud`, los dos compatibles. Handoff en NC-10a |
| **Contrato backend → PWA** | `fotoRechazada` en `ClasificacionResponse`; los códigos `FOTO_NO_PERMITIDA`, `TEXTO_NO_PERMITIDO` y `MODERACION_NO_DISPONIBLE`; las rutas de denuncia y de moderación del ADMIN; los 4 tipos de evento del historial. `ReporteGestionResponse` no cambia, porque el reporte oculto sale de la bandeja (decisión 13). Cada uno con su `/contrato` |
| **Migraciones** | NC-10: ninguna. NC-11: una, con las columnas, el historial, `denuncia_reporte` y la vista del índice creada de nuevo sin los reportes ocultos |
| **Índice** | Evento `ReporteVisibilidadCambiadaEvent` y un manejador más en `IndiceDesempenoRefreshListener` (decisión 7) |
| **Tests** | Los de cada ficha. **Nunca hay imágenes explícitas en el repo ni en la CI.** Los mínimos de la CI (`MIN_PYTEST_INFERENCIA`, `MIN_SUREFIRE`, `MIN_IT_FAILSAFE`) los sube la sesión de raíz al fusionar |
| **Despliegue** | Variables `MODERACION_TIPO`, `MODERACION_URL` y `MODERACION_UMBRAL` en el backend, e `INFERENCIA_MODERACION_HILOS=1` en `inferencia`. Healthcheck `/salud` en Railway. Runbook: el interruptor `ninguna` (§10), la purga manual de una URL y el procedimiento ante material ilegal. Orden: NC-10a desplegado antes que el backend con `http` |
| **Otras tareas** | BE-11 (la foto sin transacción) va antes que NC-10b. BE-12 (el refresco asíncrono) también cubre el evento nuevo. BE-14 anonimiza `denuncia_reporte`. NC-06 (índice por periodo), cuando rehaga la vista, conserva el filtro `NOT r.oculto` |

## 10. Plan de sprints (pasado a `plan-sprints.md` el 28/10)

**Pasado a `plan-sprints.md`**, con la fila del S7, el párrafo «La moderación entra al S7» y la fila en «Decisiones del usuario que bloquean sprints». Lo que sigue queda como registro de la propuesta.

Decisión 17: NC-10 y NC-11 entran en la **v0.8.0**, junto con los términos v2. Por eso no se abre un sprint aparte: se suman al S7, que es el de esa versión.

| Sprint | Backend | Frontend | Versión |
|---|---|---|---|
| S7 (sumar a la fila actual) | … · NC-10a (`inferencia/`: `/v1/moderacion`) · NC-10b (módulo `moderacion`) · NC-11a (ocultar y denunciar) | … · NC-10c (avisos de moderación) · NC-11b (denunciar y bandeja del ADMIN) | v0.8.0 |

**Orden dentro del S7:**
- **Carril de backend:** NC-09 (ya fusionado), después NC-10a y NC-10b (con BE-11 antes) y por último NC-11a.
- **Carril de frontend:** NC-10c cuando NC-10b esté en `develop`, y NC-11b cuando lo esté NC-11a.
- **Producción:** DEP-13, con el modelo de moderación de NC-10a, va antes que el backend con `MODERACION_TIPO=http`.

## Resumen de lo decidido (28/10)

1. **Modelo:** Marqo `nsfw-image-detection-384`, revisión `0c26ec2` (Apache-2.0, 22,4 MB, +63 MiB de RAM, ~0,1 s por recorte), con dos recortes y el máximo.
   - **Umbral inicial:** 0,70.
   - **Calibración:** solo con fotos negativas.
2. **Contrato:** `POST /v1/moderacion` aparte, con los mismos errores, la misma validación y el mismo tope de 10 conexiones; un limitador propio y sin piso. El umbral es del backend (D-15).
3. **Backend:** módulo nuevo `moderacion` (D-15), que usan `reportes`, `clasificacion` y `auth`.
   - Su adaptador HTTP admite 4 llamadas a la vez y espera hasta 1 s por un turno.
   - La foto se analiza antes de guardar y sin transacción, saneada una sola vez.
   - La vista previa avisa con `fotoRechazada`.
4. **Ante una caída: fallar cerrado,** con 503 `MODERACION_NO_DISPONIBLE`, la cola de la PWA o «Enviar sin foto». El interruptor de emergencia es `MODERACION_TIPO=ninguna`.
5. **Texto:**
   - una lista propia y versionada, que arma el agente de backend y aprueba el usuario;
   - se compara por token entero, sin plegar la ñ, con un corpus legítimo en los tests;
   - cubre título, descripción, comentarios y el nombre del perfil.
6. **Red de seguridad** (en `reportes`):
   - el ADMIN oculta el reporte o la foto por separado, con motivo y línea de tiempo, y conserva la foto oculta en privado;
   - el CIUDADANO denuncia una vez por reporte y hasta 10 por día;
   - el resolver de `/media` consulta la base, y la foto lleva `s-maxage=3600`, con purga manual para los casos urgentes;
   - no hay ocultamiento automático;
   - **el reporte oculto sale del índice, de la exportación y de la bandeja municipal,** con el refresco por evento. Ocultar solo la foto no lo saca del índice.
7. **Material ilegal:** ocultar, conservar en privado sin borrar, descargar ni reenviar, y denunciar ante la DIVINDAT o el Ministerio Público. Lo confirma el usuario con su asesor.
8. **Términos:** van dentro de la v2, que sale en la v0.8.0.

## Qué queda pendiente

- **Confirmación del asesor** sobre el procedimiento ante material ilegal (decisión 16). Hace falta antes de abrir a usuarios reales. No bloquea la implementación.
- **La fila del S7 en `plan-sprints.md`:** hecha el 28/10 (§10).
- **Nada bloquea NC-10 ni NC-11:** las fichas están desbloqueadas. BE-11 conviene que entre antes que NC-10b.
