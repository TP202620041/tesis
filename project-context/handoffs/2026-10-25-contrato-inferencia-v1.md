# Handoff de contrato: detección de daños `/v1` del servicio de inferencia (NC-03a → NC-04b)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-25
- **Origen:** inferencia, rama `feature/nc-03-inferencia`, commits `4896277`…`6919553` y las observaciones de la revisión en el commit siguiente (PR por abrir)
- **Historia o tarea:** NC-03a (fase 1 de la propuesta aceptada `decisions/propuestas/2026-10-21-ml-clases-modelo.md`); lo consume **NC-04b** (`clasificacion/infra/InferenciaHttpAdapter`)
- **Destinatario:** backend, NC-04b
- **Atendido por:** _(backend, rama y fecha)_

El contrato es el de ARCHITECTURE.md §6 y §7. Lo define `inferencia/` (`app/api/esquemas.py`; OpenAPI en `/openapi.json` del servicio). Un cambio incompatible pasa a `/v2`. Detalle y justificación en `inferencia/README.md`.

## Endpoints
| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/v1/detecciones` (multipart) | Detecta daños en la foto. **Solo detecta**: no aplica el umbral de sugerencia ni elige la clase dominante. |
| GET | `/salud` | 200 `{"estado": "ok", "version_modelo": "…"}` cuando el modelo está cargado. Si el modelo falta o su hash no coincide, el proceso no arranca: no hay estado «degradado». |

## Solicitud
| Parte | Tipo | Límite | Nota |
|---|---|---|---|
| `imagen` (multipart/form-data) | archivo JPEG, PNG o WEBP | **10 MiB** (`INFERENCIA_MAX_BYTES`) y **16 MP** (`INFERENCIA_MAX_MEGAPIXELES`) | Se mira el contenido, no el `Content-Type` ni la extensión. El adaptador debe enviar la foto **ya saneada** por `common/port/SaneadorDeImagen` (JPEG ≤ 2048 px, orientada), igual en la vista previa y en la sugerencia oficial (D-08). |

## Respuesta 200
| Campo (JSON, snake_case) | Tipo | ¿Nulo? | Nota |
|---|---|---|---|
| `version_modelo` | string, **≤ 40 caracteres** (`maxLength` en el OpenAPI) | no | Hoy `rdd2022-rfdetr-nano-66429f3-20934b9a` (revisión de HF + hash del `.onnx`). Va a `reporte.version_modelo_sugerencia VARCHAR(40)`. |
| `detecciones` | array | no (puede venir **vacío**) | De mayor a menor confianza. |
| `detecciones[].clase` | string: `bache` \| `grieta` | no | Coincide 1:1 con `categoria_dano.clase_modelo`. `bache` ← D40; `grieta` ← D00, D10, D20 de RDD2022. |
| `detecciones[].confianza` | number en [0, 1] | no | Se devuelven todas las detecciones con confianza **≥ 0,10** (piso técnico), **como máximo 100**. El piso no es el umbral: **el umbral de decisión (0,50) y la clase dominante (máximo por clase) los aplica el backend** (`clasificacion/domain/PoliticaDeSugerencia`). |
| `detecciones[].caja` | array de 4 numbers `[x1, y1, x2, y2]` | no | **Píxeles de la imagen recibida, ya orientada** (EXIF aplicado; para la foto saneada es la misma imagen), origen arriba a la izquierda, `x1 ≤ x2`, `y1 ≤ y2`, recortada a los bordes. |

```json
{
  "version_modelo": "rdd2022-rfdetr-nano-66429f3-20934b9a",
  "detecciones": [
    { "clase": "bache", "confianza": 0.9337, "caja": [3.28, 518.74, 600.0, 599.70] },
    { "clase": "grieta", "confianza": 0.1444, "caja": [290.33, 509.00, 306.88, 534.33] }
  ]
}
```

## Errores
Cuerpo `{"codigo": str, "mensaje": str}`, salvo el 503:

| Estado | `codigo` | Cuándo |
|---|---|---|
| 400 | `imagen_invalida` | Archivo vacío, que no es imagen, dañado o de otro formato (GIF, TIFF…). |
| 400 | `solicitud_invalida` | Falta la parte `imagen` o el cuerpo no es multipart. |
| 413 | `imagen_demasiado_grande` | Más de 10 MiB, más de 16 MP, o cuerpo por encima del límite (se corta sin leerlo). |
| 500 | `error_de_inferencia` | Falló el motor (onnxruntime). |
| 500 | `error_interno` | Cualquier otro error, incluido quedarse sin memoria al decodificar. |
| 503 | — (texto plano de uvicorn) | Cola llena: `INFERENCIA_MAX_CONCURRENCIA` (10) conexiones o tareas abiertas. |

## Notas para el backend (NC-04b)

**Cualquier respuesta distinta de 200 es «sin sugerencia».** También un timeout, un error de conexión o un 200 que no se pueda leer. No reintentar en bucle: la IA nunca bloquea un reporte (§4.3). Los 4xx indican un problema de la foto (o del adaptador); los 5xx y el 503, del servicio. Conviene registrarlos distinto, pero el resultado para el usuario es el mismo.

**Umbral y clase dominante, del lado del backend.** Descartar las clases sin categoría activa con `clase_modelo`; puntaje por categoría = máxima confianza; sugerir si es ≥ 0,50; empate o nada sobre el umbral → sin sugerencia. El piso de 0,10 del servicio deja margen para calibrar el umbral en NC-03b.

**Concurrencia y conexiones.** El servicio infiere de a una imagen (unos 0,3–0,5 s con 2 vCPU) y procesa a lo sumo 2 solicitudes a la vez; el resto espera. Con 10 conexiones o tareas abiertas, uvicorn responde 503. **Las conexiones en keep-alive cuentan para ese tope**: el pool de conexiones del `RestClient` debe quedar claramente por debajo (sugerencia: ≤ 4, en línea con una vista previa a la vez más el executor de 2–4 hilos de `AsyncConfig`). Con el timeout de 3 s de la vista previa y una sola solicitud a la vez, hay holgura (p95 medido ≤ 0,8 s).

**`version_modelo`.** Guardarlo tal cual junto con `confianza_sugerencia`: cambia si cambian los pesos o la exportación. Con la misma versión y la misma foto, las detecciones son las mismas (hilos fijos, D-08).

**Red (a verificar en NC-04b).** En Docker el servicio escucha en `0.0.0.0:$PORT` (solo IPv4; `PORT` = 8000 por defecto). Si la red privada de Railway resulta ser solo IPv6, configurar `INFERENCIA_HOST` **vacío**, que escucha IPv4 e IPv6 a la vez (probado en el contenedor). No usar `::`: con uvicorn es solo IPv6 y el `HEALTHCHECK` de la imagen (que usa `127.0.0.1`) dejaría de responder. Comprobar también que Railway acepte una variable con valor vacío. El servicio va sin dominio público.

**Configuración del servicio en el despliegue.** `INFERENCIA_HILOS` igual al número de vCPU del plan y fijo entre despliegues (cambiarlo puede cambiar decimales de las confianzas). El resto, con sus valores por defecto (`inferencia/README.md`, «Configuración»). Ninguna variable es un secreto.

**Para probar el adaptador sin Railway:** `docker build -t ciudadviva-inferencia inferencia/` y `docker run --rm -p 8090:8000 --cpus=2 ciudadviva-inferencia` (la primera construcción descarga torch y los pesos). Un IT del backend que necesite el servicio real debería omitirse si no está disponible, como `test_modelo_real.py` del servicio.
