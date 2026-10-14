# Handoff de contrato: suscripción Web Push del navegador

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-13
- **Origen:** backend, rama `feature/nc-07-suscripcion-push`, commit `2e0e397` (PR por abrir; sale de `feature/us-25-soporte-admin`, que debe fusionarse antes)
- **Historia o tarea:** NC-07 (SUSCRIPCION_PUSH). El envío real es US-21 (Sprint 3).
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/notificaciones/suscripciones` | **Nuevo.** Registra la suscripción de este navegador. Upsert por `endpoint`: **201** si es nueva, **200** si ya existía (se actualizan claves y `userAgent`, se reactiva y pasa al usuario autenticado aunque fuera de otro). |
| DELETE | `/api/notificaciones/suscripciones` | **Nuevo.** Cuerpo `{ "endpoint": "..." }`. **204** si era del usuario (se borra); **404** si no existe o es de otro. |

Ambos: cualquier rol autenticado (`Authorization: Bearer …`); sin token, **401**.

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `SuscripcionPushRequest` | `endpoint` | string, `https://…`, ≤ 2048 | no | nuevo | — (entrada) |
| `SuscripcionPushRequest` | `keys.p256dh` | string base64url, ≤ 255 | no | nuevo | — (entrada) |
| `SuscripcionPushRequest` | `keys.auth` | string base64url, ≤ 255 | no | nuevo | — (entrada) |
| `SuscripcionPushRequest` | `userAgent` | string ≤ 500 | sí (opcional) | nuevo | — (entrada) |
| `SuscripcionPushRequest` | `expirationTime` | — | — | se acepta y se **ignora** | — |
| `BajaSuscripcionPushRequest` | `endpoint` | string ≤ 2048 | no | nuevo | — (entrada) |
| `SuscripcionPushResponse` | `endpoint` | string | no | nuevo | el propio usuario |
| `SuscripcionPushResponse` | `userAgent` | string | sí | nuevo | el propio usuario |
| `SuscripcionPushResponse` | `activa` | boolean | no | nuevo | el propio usuario |
| `SuscripcionPushResponse` | `creadaEn` | string ISO-8601 (Instant) | no | nuevo | el propio usuario |
| `SuscripcionPushResponse` | `actualizadaEn` | string ISO-8601 (Instant) | no | nuevo | el propio usuario |

La respuesta **no** devuelve `p256dh` ni `auth`.

## Enums
| Enum | Valores |
|---|---|
| — | Sin enums nuevos. |

## Ejemplo de petición (lo que manda el navegador)
`POST /api/notificaciones/suscripciones` con el resultado de `subscription.toJSON()` más `userAgent`:
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/dXl1c2VyX2V4YW1wbGU:APA91bH...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    "auth": "tBHItJI5svbpez7KI4CCXg"
  },
  "userAgent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"
}
```
En código: `apiFetch('/api/notificaciones/suscripciones', { method: 'POST', body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent }) })`.

## Ejemplo de respuesta (201 o 200)
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/dXl1c2VyX2V4YW1wbGU:APA91bH...",
  "userAgent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
  "activa": true,
  "creadaEn": "2026-10-13T23:59:01.123Z",
  "actualizadaEn": "2026-10-13T23:59:01.123Z"
}
```

## Ejemplo de baja
`DELETE /api/notificaciones/suscripciones` con `{ "endpoint": "https://fcm.googleapis.com/fcm/send/…" }` → 204 sin cuerpo.

## Errores
| Código | Cuándo |
|---|---|
| 400 | `endpoint` vacío o no `https://`, falta `keys`, `keys.p256dh` o `keys.auth` vacíos (`details` nombra el campo, p. ej. `keys.p256dh: …`); en la baja, `endpoint` vacío. |
| 401 | Sin token o token inválido. |
| 404 | Baja de un endpoint inexistente o de otro usuario. |

## Notas para el frontend
- Llamar al POST cada vez que el usuario inicia sesión con una suscripción ya concedida (o tras `pushManager.subscribe`): es idempotente y es lo que reasigna el navegador al usuario actual.
- Al cerrar sesión, si se quiere que ese navegador deje de recibir avisos de ese usuario, llamar al DELETE **antes** de borrar el token (después ya sería 401).
- 200 y 201 son ambos éxito; no hace falta distinguirlos en la UI.
- El consentimiento para notificaciones va aparte (propuesta del coordinador); este contrato solo guarda la suscripción.
- Por ahora ningún aviso llega por push: el envío es US-21. Con suscripción activa, la notificación se registra como push `FALLIDA` y se entrega por email, igual que antes.
- `npm run api:sync` con el backend de `develop` levantado generará `SuscripcionPushRequest`, `ClavesRequest` (anidado) y `SuscripcionPushResponse`.
