# Handoff de contrato: moderación de la foto y del texto (NC-10b → NC-10c)

- **Estado:** atendido <!-- pendiente | atendido -->
- **Fecha:** 2026-10-29
- **Origen:** backend, rama `feature/nc-10b-moderacion-backend` (PR #134). Commits en la ficha NC-10b de `decisions/plan-migracion-capas.md`.
- **Historia o tarea:** NC-10b (D-15, propuesta decidida `decisions/propuestas/2026-10-28-moderacion-de-contenido.md`); lo consume **NC-10c**
- **Atendido por:** frontend, rama `feature/nc-10c-moderacion-pwa`, PR de NC-10c, 2026-10-29. Todo se decide por `codigo` y `details`. `FOTO_NO_PERMITIDA` y `fotoRechazada: true` quitan la foto del formulario, conservan el resto y avisan «La foto no está permitida. Toma otra.» junto al campo hasta que se elija otra. `TEXTO_NO_PERMITIDO` va en el campo de `details[0]` (crear, editar, comentar, registro y perfil) mientras diga lo mismo que se envió; `details` no se muestra como detalle. El 503 `MODERACION_NO_DISPONIBLE` ofrece «Guardar para enviar después» (cola de US-06, misma `Idempotency-Key`, sin otro POST) y «Enviar sin foto» (misma clave); un 503 sin código sigue siendo un error común. En la cola, los 400 de la moderación quedan `rechazado` con un motivo que dice qué hacer desde la cola (descartar y volver a reportar), y el 503 queda pendiente. `fotoRechazada` se tipa `boolean` en `lib/types/domain.ts`. Tipos regenerados desde el OpenAPI de esta rama. Detalle: `frontend/README.md`, «Moderación de contenido (NC-10c, D-15)».

Detalle y justificación en `backend/README.md`, sección «Moderación de contenido (NC-10b, D-15)».

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/reportes` | Nuevos: **400 `FOTO_NO_PERMITIDA`**, **400 `TEXTO_NO_PERMITIDO`** (`titulo`, `descripcion`) y **503 `MODERACION_NO_DISPONIBLE`** (solo con foto). Un reporte sin foto nunca recibe el 503. Un reenvío con una `Idempotency-Key` ya registrada recibe su respuesta guardada aunque la moderación esté caída. |
| PATCH | `/api/reportes/{id}` | Nuevo: 400 `TEXTO_NO_PERMITIDO` (`titulo`, `descripcion`). La edición no cambia la foto. |
| POST | `/api/reportes/{id}/comentarios` | Nuevo: 400 `TEXTO_NO_PERMITIDO` (`contenido`). |
| POST | `/api/auth/registro` | Nuevo: 400 `TEXTO_NO_PERMITIDO` (`nombre`, `apellido`). **El captcha sigue primero**: sin token o con uno rechazado, el 409 del captcha llega antes. |
| PATCH | `/api/auth/me` | Nuevo: 400 `TEXTO_NO_PERMITIDO` (`nombre`, `apellido`). |
| POST | `/api/clasificaciones` | `ClasificacionResponse` suma `fotoRechazada`. |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio (nuevo / cambia / se elimina) | Quién lo ve |
|---|---|---|---|---|---|
| `ClasificacionResponse` | `fotoRechazada` | `boolean` | no, siempre viene | nuevo | El ciudadano que hace la vista previa |
| `ApiError` (cuerpo de error) | `codigo` | `string` | solo aparece cuando hay uno | ya existía; valores nuevos | Quien recibe el error |
| `ApiError` | `details` | `string[]` | no | ya existía; en el 400 de la moderación trae **un** elemento: el campo | Quien recibe el error |

- **`fotoRechazada`:** `true` solo si la moderación rechazó la foto; entonces `categoriaId` y `categoriaNombre` son `null` (no se clasifica). `false` en todos los demás casos, **también si la moderación no se pudo hacer** (servicio caído, sin turno o apagada): el veredicto oficial es el de la creación.
- **Nunca viene el puntaje** ni la versión del modelo de moderación, en ningún DTO.
- `springdoc` marca `fotoRechazada` como `boolean` (primitivo): después de `npm run api:sync`, tipar como `boolean` no opcional en `model/`.

## Enums
| Enum | Valores |
|---|---|
| `ApiError.codigo` (nuevos) | `FOTO_NO_PERMITIDA` (400), `TEXTO_NO_PERMITIDO` (400), `MODERACION_NO_DISPONIBLE` (503) |
| `ApiError.details[0]` con `TEXTO_NO_PERMITIDO` | `titulo`, `descripcion`, `contenido`, `nombre`, `apellido` (el nombre del campo en el pedido) |
| `ApiError.details[0]` con `FOTO_NO_PERMITIDA` | `foto` |

## Ejemplo de respuesta
```jsonc
// POST /api/clasificaciones, foto rechazada
{ "categoriaId": null, "categoriaNombre": null, "fotoRechazada": true }

// POST /api/clasificaciones, foto aceptada (o sin moderación disponible)
{ "categoriaId": 1, "categoriaNombre": "Bache", "fotoRechazada": false }

// POST /api/reportes, foto rechazada
{ "timestamp": "2026-10-29T05:00:00Z", "status": 400, "error": "Bad Request",
  "message": "La foto no está permitida. Toma otra.", "path": "/api/reportes",
  "details": ["foto"], "codigo": "FOTO_NO_PERMITIDA" }

// POST /api/reportes, groseria en la descripcion
{ "timestamp": "2026-10-29T05:00:00Z", "status": 400, "error": "Bad Request",
  "message": "La descripción tiene palabras que no están permitidas. Cámbiala para continuar.",
  "path": "/api/reportes", "details": ["descripcion"], "codigo": "TEXTO_NO_PERMITIDO" }

// POST /api/reportes con foto, moderacion caida
{ "timestamp": "2026-10-29T05:00:00Z", "status": 503, "error": "Service Unavailable",
  "message": "No pudimos revisar la foto en este momento. Guarda el reporte para enviarlo después o envíalo sin foto.",
  "path": "/api/reportes", "details": [], "codigo": "MODERACION_NO_DISPONIBLE" }
```

Mensajes de `TEXTO_NO_PERMITIDO` por campo (vienen en `message`; la PWA puede mostrarlos tal cual):
- `titulo`: «El título tiene palabras que no están permitidas. Cámbialo para continuar.»
- `descripcion`: «La descripción tiene palabras que no están permitidas. Cámbiala para continuar.»
- `contenido`: «El comentario tiene palabras que no están permitidas. Cámbialo para continuar.»
- `nombre`: «El nombre tiene palabras que no están permitidas. Cámbialo para continuar.»
- `apellido`: «El apellido tiene palabras que no están permitidas. Cámbialo para continuar.»

## Notas para el frontend (NC-10c)

- **Reaccionar por `codigo`, no por el texto del mensaje.** El mensaje nunca repite la palabra; la PWA tampoco debe repetirla ni duplicar la lista (el 400 llega al instante y el formulario conserva lo escrito).
- **`FOTO_NO_PERMITIDA`** (creación) o **`fotoRechazada: true`** (vista previa): «La foto no está permitida. Toma otra.» junto a la foto; quitar la foto y no dejar enviar con ella; **conservar el resto del formulario**.
- **`TEXTO_NO_PERMITIDO`**: el error va en el campo de `details[0]`. Aplica a `FormularioReporte` (título y descripción), `EditarReporte`, `Comentarios`, `FormularioRegistro` y `EditarPerfil`.
- **`MODERACION_NO_DISPONIBLE`** (503, solo al crear con foto): ofrecer «Guardar para enviar después» (la cola de US-06 con la **misma** `Idempotency-Key`, que ya reintenta los 5xx) y «Enviar sin foto». Hoy el 503 del almacenamiento o del saneado no lleva `codigo`; solo este lo lleva.
- **Cola offline:** un reenvío que recibe `FOTO_NO_PERMITIDA` o `TEXTO_NO_PERMITIDO` queda `rechazado` con ese motivo, como cualquier 4xx. Un reenvío con la clave ya registrada recibe su respuesta guardada aunque el servicio esté caído.
- **La vista previa no bloquea**: con `fotoRechazada: false` la PWA sigue como hoy; el veredicto oficial es el de la creación.
- **Verificación en vivo:** el backend corre por defecto con `MODERACION_TIPO=ninguna` (ninguna foto se rechaza; el filtro de texto sí está activo). Para ver el rechazo de una foto sin el servicio hace falta un doble del puerto (como en `ModeracionCreacionIT`) o el contenedor `ciudadviva-inferencia:nc10a` con `MODERACION_TIPO=http MODERACION_URL=http://localhost:8010`, que con fotos reales de pistas no rechaza nada. El texto se prueba con cualquier palabra de `backend/src/main/resources/moderacion/groserias-es-pe.txt`.
- Ningún campo nuevo en `ReporteResponse`, `ReporteResumenResponse` ni `ReporteGestionResponse`.
