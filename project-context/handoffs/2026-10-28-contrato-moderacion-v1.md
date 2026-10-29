# Handoff de contrato: moderación de la foto `/v1/moderacion` del servicio de inferencia (NC-10a → NC-10b)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-28
- **Origen:** inferencia, rama `feature/nc-10a-moderacion-inferencia`, commits `2abb769` (endpoint, exportación y tests) y `679c5c0` (calibración y medición), más el README y este handoff (PR por abrir; lo abre el coordinador)
- **Historia o tarea:** NC-10a (D-15, propuesta decidida `decisions/propuestas/2026-10-28-moderacion-de-contenido.md`); lo consume **NC-10b** (`moderacion/infra/InferenciaModeracionHttpAdapter`)
- **Destinatario:** backend, NC-10b
- **Atendido por:** —

El contrato es el de ARCHITECTURE.md §6 y §7 (D-15). Lo define `inferencia/` (`app/api/esquemas.py`; OpenAPI en `/openapi.json` del servicio). Un cambio incompatible pasa a `/v2`. Detalle, cifras y justificación en `inferencia/README.md` («Contrato», «Modelo de moderación», «Cifras medidas con la moderación» y «Calibración del umbral»).

## Endpoints
| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/v1/moderacion` (multipart) | Mide la probabilidad de contenido sexual explícito de la foto. **Solo mide**: no aplica ningún umbral. |
| GET | `/salud` | 200 `{"estado": "ok", "version_modelo": "…", "version_moderacion": "…"}`. **`version_moderacion` es nuevo** (compatible: el adaptador de NC-04b ignora los campos desconocidos). Si cualquiera de los dos modelos falta o su hash no coincide, el proceso no arranca: no hay estado «degradado». |
| POST | `/v1/detecciones` | Sin cambios (handoff `2026-10-25-contrato-inferencia-v1.md`). |

## Solicitud
| Parte | Tipo | Límite | Nota |
|---|---|---|---|
| `imagen` (multipart/form-data) | archivo JPEG, PNG o WEBP | **10 MiB** (`INFERENCIA_MAX_BYTES`) y **16 MP** (`INFERENCIA_MAX_MEGAPIXELES`) | Igual que `/v1/detecciones`: se mira el contenido, no el `Content-Type` ni la extensión. Enviar la foto **ya saneada** (la misma que se va a subir, saneada una sola vez; ficha NC-10b, pasos 3 a 5), igual en la vista previa y en la creación: así las dos dan el mismo puntaje. |

## Respuesta 200
| Campo (JSON, snake_case) | Tipo | ¿Nulo? | Nota |
|---|---|---|---|
| `version_modelo` | string, **≤ 40 caracteres** (`maxLength` en el OpenAPI) | no | Hoy **`nsfw-vit-tiny-384-0c26ec2-1ba7cf26`** (34 caracteres): revisión de Hugging Face + hash del `.onnx`. Cambia si cambian los pesos o la exportación. |
| `puntaje` | number en **[0, 1]** (`minimum` 0 y `maximum` 1 en el OpenAPI) | no, **siempre viene** | Probabilidad de contenido sexual explícito. Es el **máximo de dos recortes** de 384 px que cubren toda la foto. No hay piso técnico: viene aunque sea 0,04. |

```json
{ "version_modelo": "nsfw-vit-tiny-384-0c26ec2-1ba7cf26", "puntaje": 0.059 }
```

## Errores
Los **mismos** que `/v1/detecciones`, con la misma validación previa: bytes, después la cabecera sin decodificar y después los píxeles. Cuerpo `{"codigo": str, "mensaje": str}`, salvo el 503:

| Estado | `codigo` | Cuándo |
|---|---|---|
| 400 | `imagen_invalida` | Archivo vacío, que no es imagen, dañado o de otro formato (GIF, TIFF…). |
| 400 | `solicitud_invalida` | Falta la parte `imagen` o el cuerpo no es multipart. |
| 413 | `imagen_demasiado_grande` | Más de 10 MiB, más de 16 MP, o cuerpo por encima del límite (se corta sin leerlo). |
| 500 | `error_de_inferencia` | Falló el motor (onnxruntime). |
| 500 | `error_interno` | Cualquier otro error, incluido quedarse sin memoria al decodificar. |
| 503 | — (texto plano de uvicorn) | Cola llena: `INFERENCIA_MAX_CONCURRENCIA` (10) conexiones o tareas abiertas **en todo el proceso** (ver «Tope de conexiones»). |

## Notas para el backend (NC-10b)

**Falla cerrada (decisión del 28/10).**
- En la creación, cualquier cosa distinta de un 200 válido es «no se pudo moderar»: 503 `MODERACION_NO_DISPONIBLE`. Eso incluye un 4xx, un 5xx, el 503, un timeout, un error de conexión o un 200 fuera de contrato.
- En la vista previa, lo mismo da `fotoRechazada: false`.
- Sin reintentos.
- Un 400 o un 413 de este servicio con la foto ya saneada indica un problema del adaptador, no del ciudadano: conviene registrarlo aparte, como en NC-04b.

**Validación de la respuesta, solo por estructura.** Queda fuera de contrato:
- un 200 sin `version_modelo` o sin `puntaje`;
- tipos distintos de los del contrato;
- un `puntaje` fuera de [0, 1] o que no sea finito;
- una `version_modelo` de más de 40 caracteres.

Los campos desconocidos se ignoran.

**Umbral: 0,70** (`MODERACION_UMBRAL`, decidido el 28/10), aplicado en `PoliticaDeModeracion`: se rechaza si `puntaje ≥ umbral`.
- Calibración del 28/10, solo con negativos: 350 fotos de pistas de RDD2022, 50 por país y saneadas como las del backend.
  - Mediana 0,059, p99 0,087, **máximo 0,112**. Ninguna llega a 0,3.
  - La regla (máximo + 0,15, entre 0,5 y 0,9) sugiere el piso de 0,50.
- **Se recomienda mantener 0,70** hasta sumar las ≥ 50 fotos de calles con gente y las de Lima, que son el falso positivo más probable (README, «Calibración del umbral»).
- El modelo se entrenó con *label smoothing*: la salida queda entre ~0,04 y ~0,96, así que un umbral de más de 0,9 dejaría pasar casi todo. La validación de 0,5 a 0,9 de NC-10b es la correcta.

**Tope de conexiones: es COMPARTIDO entre los dos endpoints.**
- uvicorn corre con `--limit-concurrency 10` y cuenta **todas** las conexiones abiertas del proceso, sin mirar la ruta: las de `/v1/detecciones`, las de `/v1/moderacion`, las de `/salud` y también las que esperan en keep-alive.
- Cuando llega una solicitud y ya hay 10 conexiones o tareas abiertas, contándola a ella, responde 503. O sea, **se atienden 9 conexiones simultáneas como máximo, sumando los dos endpoints**.
- Se comprobó contra el contenedor con conexiones keep-alive reales:

| Abiertas antes | Nueva a `/v1/moderacion` | Nueva a `/v1/detecciones` |
|---|---|---|
| 4 de detección + 4 de moderación | **200** | **200** |
| 5 + 4 | 503 | 503 |
| 4 + 5 | 503 | 503 |
| 9 + 0 | 503 | 503 |
| 0 + 9 | 503 | 503 |

- **Dimensionamiento:** los turnos del backend (detección 4, de NC-04b y NC-04c, y moderación 4, de NC-10b) suman 8 conexiones como máximo. Caben, con margen de **una** (por ejemplo, un chequeo de salud).
  - No se puede subir ninguno de los dos semáforos sin bajar el otro o subir `INFERENCIA_MAX_CONCURRENCIA`, que es configuración del servicio.
  - Si el backend corre en **más de una réplica**, la suma es por réplica: dos réplicas con 4 + 4 cada una pasan el tope. Hay que repartir los turnos.
  - Mientras sean dos `RestClient` con su propio `HttpClient` y cada llamada use a lo sumo una conexión, el semáforo acota también las conexiones en keep-alive.
- **Lo que sí es propio de cada endpoint:** el limitador de procesos (2 a la vez) y el candado del modelo. Una moderación nunca espera detrás de una detección (lo prueba `tests/test_api.py`). La CPU sí es compartida: 2 vCPU.

**Latencia** (Docker con `--cpus=2`, portátil i7-13620H; en Railway hay que volver a medir, DEP-13):

| Carga | p50 | p95 | Máx. |
|---|---|---|---|
| Una moderación a la vez, 350 fotos saneadas | 124 ms | 259 ms | 296 ms |
| 4 clientes mezclando moderación y detección, fotos saneadas | 255 ms | 1194 ms | 1510 ms |
| Lo mismo con fotos crudas de hasta 8 MP (peor caso) | 271 ms | 1467 ms | 1752 ms |

Con los 500 + 2 500 ms del adaptador hay holgura. La espera de hasta 1 s por un turno en la creación se suma aparte, del lado del backend.

**Determinismo.** La moderación corre con 1 hilo fijo (`INFERENCIA_MODERACION_HILOS=1`). Con la misma foto y la misma `version_modelo`, el puntaje es el mismo en la vista previa y en la creación. Lo prueban los tests y las corridas repetidas.

**Registro.** Al rechazar una foto, el WARN del backend lleva el puntaje redondeado y la `version_modelo` (ficha NC-10b). El servicio ya registra en `INFO` cada moderación, con el puntaje, los bytes, la duración y la versión, y nunca la imagen.

**Para probar el adaptador sin Railway:**
- `docker build -t ciudadviva-inferencia:nc10a inferencia/` (la imagen `ciudadviva-inferencia:nc10a` ya está construida en la máquina de desarrollo) y `docker run --rm -p 8010:8000 --cpus=2 ciudadviva-inferencia:nc10a`.
- No usar los puertos 8080, 8025, 3307 ni 4566 de otra pila de la máquina.
- El IT contra el servicio real (`MODERACION_TEST_URL=http://localhost:8010`) solo puede comprobar el contrato: 200, el prefijo `nsfw-vit-tiny-384-0c26ec2-` y un `puntaje` bajo en una foto sintética (~0,05). **No hay muestras positivas y no se van a juntar**: el camino de rechazo se prueba con `@MockitoBean` del puerto.

**Despliegue (DEP-13).**
- El servicio no suma variables obligatorias: `INFERENCIA_MODERACION_HILOS=1` viene en la imagen.
- RAM medida: 212 MiB en reposo con los dos modelos, 388 MiB como máximo con 4 clientes mezclados y fotos saneadas, y 498 MiB en el peor caso con fotos de 8 MP. Cabe en 1 GB.
- Imagen de 680 MB.
- El backend con `MODERACION_TIPO=http` se despliega solo después de esta imagen (plan, NC-10).
