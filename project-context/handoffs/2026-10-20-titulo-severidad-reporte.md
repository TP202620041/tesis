# Handoff de contrato: título y severidad del reporte (NC-02)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-20
- **Origen:** backend, rama `feature/nc-02-titulo-severidad-periodo`, commit `<hash>` (PR #<n>)
- **Historia o tarea:** NC-02 (cambia US-05, US-06 y US-08)
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/reportes` (multipart) | **Cambia (incompatible).** Dos parámetros nuevos **obligatorios**: `titulo` y `severidad`. Si faltan o no son válidos, **400**. Excepción: el reenvío con una `Idempotency-Key` ya registrada (ver «Cola offline» abajo). |
| PATCH | `/api/reportes/{id}` | **Cambia (compatible).** `EditarReporteRequest` acepta `titulo` y `severidad`, opcionales como el resto: `null` o ausente = no cambiar. Solo el creador y solo en `PENDIENTE`, igual que hoy. |
| GET | `/api/reportes`, `/api/reportes/{id}`, `/api/reportes/mis-reportes`, `/api/reportes/mis-reportes/pendientes-calificacion` | **Cambia (aditivo).** `ReporteResumenResponse` suma `titulo` y `severidad`. También lo devuelven `PATCH /api/reportes/{id}` y `DELETE /api/reportes/{id}`. |
| POST | `/api/reportes` (respuesta) | **Cambia (aditivo).** `ReporteResponse` suma `titulo` y `severidad`. |
| GET / PATCH | `/api/reportes/bandeja`, `/api/reportes/{id}/estado` | **Cambia (aditivo).** `ReporteGestionResponse` suma `titulo` y `severidad`. El funcionario **los ve pero no los cambia**: no hay endpoint de gestión que los edite. |

Sin cambios: `Idempotency-Key`, la deduplicación por cercanía (US-09: adhesión, o 409 si ya se adhirió), el 409 fuera de Lima y la búsqueda/filtros (no hay filtro por severidad en esta tarea).

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| POST multipart | `titulo` | string | no | nuevo, **obligatorio** | — (entrada) |
| POST multipart | `severidad` | string (enum) | no | nuevo, **obligatorio** | — (entrada) |
| `EditarReporteRequest` | `titulo` | string | sí (= no cambiar) | nuevo | — (entrada) |
| `EditarReporteRequest` | `severidad` | string (enum) | sí (= no cambiar) | nuevo | — (entrada) |
| `ReporteResponse` | `titulo` | string | no¹ | nuevo | el ciudadano que crea |
| `ReporteResponse` | `severidad` | string (enum) | no¹ | nuevo | el ciudadano que crea |
| `ReporteResumenResponse` | `titulo` | string | no | nuevo | **público** (anónimo incluido): mapa, búsqueda, detalle, mis reportes |
| `ReporteResumenResponse` | `severidad` | string (enum) | no | nuevo | **público** |
| `ReporteGestionResponse` | `titulo`, `severidad` | string, string (enum) | no | nuevo | funcionario de la jurisdicción |

¹ Única excepción: el reenvío idempotente de un envío que el backend procesó **antes** de NC-02 devuelve la respuesta guardada entonces, que no tiene estos campos (llegan `null`). Las claves duran 48 h, así que en la práctica solo pasa justo después del despliegue. Tratar `null` como «sin título» y no romper.

**Validación del título:** obligatorio, de 5 a 120 caracteres **después de quitar los espacios del borde**. El backend guarda y devuelve el título ya recortado (`"  Bache  "` → `"Bache"`). Lo mismo en el `PATCH`.

`periodo_gestion_id` se agregó a la tabla `reporte`, pero **no se expone en ningún DTO** en esta tarea: lo asigna el backend al crear (el periodo de la fecha de creación) y lo usará el dashboard por periodo (NC-06).

## Enums
| Enum | Valores |
|---|---|
| `Severidad` | `BAJA`, `MEDIA`, `ALTA`, en ese orden (BAJA < MEDIA < ALTA). Etiquetas sugeridas: «Baja», «Media», «Alta». |

springdoc lo publica como `string`: la unión literal va en `src/lib/types/domain.ts`, como `EstadoReporte`. Es un dato **público**, declarado por el ciudadano; no es una señal operativa.

## Ejemplo de respuesta
`GET /api/reportes/42` (`ReporteResumenResponse`):
```json
{
  "id": 42,
  "latitud": -12.1215,
  "longitud": -77.0297,
  "fotoUrl": "/media/fotos/reportes/3f2a….jpg",
  "titulo": "Bache profundo en la berma",
  "descripcion": "Frente al parque, lado norte",
  "severidad": "ALTA",
  "categoriaId": 1,
  "categoriaNombre": "Bache",
  "estado": "PENDIENTE",
  "distritoId": 21,
  "distritoNombre": "Miraflores",
  "totalAdhesiones": 1,
  "createdAt": "2026-10-20T22:15:03Z",
  "resolvedAt": null
}
```

Error de validación (`POST` sin título):
```json
{ "timestamp": "…", "status": 400, "error": "Bad Request", "message": "El titulo debe tener entre 5 y 120 caracteres", "path": "/api/reportes", "details": [] }
```
Sin severidad: `"message": "La severidad es obligatoria (BAJA, MEDIA o ALTA)"`. Con un valor fuera del enum: `"message": "Valor invalido para el parametro 'severidad'…"`.

## Notas para el frontend

**Compatibilidad (importante).** Desde que esto llegue a `develop`, el formulario de creación actual recibe **400** en cada reporte hasta que salga la parte del frontend de NC-02. Se aceptó como breve en `develop`; conviene atender este handoff enseguida.

**Adhesión (US-09).** Si el `POST` termina en adhesión a un reporte activo cercano de la misma categoría, el `titulo` y la `severidad` enviados se validan igual (400 si faltan) pero **se descartan**: la respuesta trae el título y la severidad del reporte existente. La PWA debe mostrar los de la respuesta y avisar que se sumó a un reporte existente, no presentar como propio el título que escribió el ciudadano.

**Largo del título.** El backend cuenta caracteres Unicode (code points), como el `CHECK` de la base: un emoji cuenta 1. En JS, `'😀'.length` es 2; para validar igual que el backend usar `[...titulo.trim()].length`.

**Cola offline (US-06).** La cola de la PWA puede tener reportes guardados **sin** `titulo` ni `severidad`, armados por la versión anterior del formulario. Al reenviarlos hay dos casos:

1. **Ya llegaron al backend antes** (se cortó la respuesta y se reintenta con la **misma** `Idempotency-Key`). El backend busca la clave **antes** de validar los campos nuevos y devuelve la respuesta original (201), sin exigirlos. No hay que hacer nada especial.
2. **Nunca llegaron** (clave nueva, o sin clave). El backend responde **400** con el mensaje del campo que falta. **No hay que descartar el borrador:** marcarlo como «necesita datos», pedirle al usuario el título y la severidad (o completarlos en un paso de migración de la cola, por ejemplo con el título «<categoría> en <distrito>», que es lo que hizo V17 con los reportes existentes, y la severidad `MEDIA`), y reenviar con la **misma** `Idempotency-Key`. Un 400 no registra la clave, así que reutilizarla es seguro.

En ningún caso un 400 de validación debe borrar un reporte de la cola.

**Formulario.** El título es obligatorio y se valida con trim (5–120). La severidad es un selector de tres valores; no hay valor por defecto en el API (`MEDIA` solo se usó para rellenar los reportes existentes).

**Edición (US-08).** En `PENDIENTE`, el creador puede cambiar título y severidad como la descripción. Un `PATCH` con `titulo` inválido responde 400.

**Reportes existentes.** V17 los rellenó con `titulo = «<categoría> en <distrito>»` y `severidad = MEDIA`, así que ningún reporte llega con estos campos vacíos (salvo la excepción ¹).

**Tipos.** Con el backend de esta rama corriendo: `npm run api:sync`. Agregar `Severidad = 'BAJA' | 'MEDIA' | 'ALTA'` en `src/lib/types/domain.ts`.
