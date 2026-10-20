# Handoff de contrato: consentimiento por finalidad y versión (D-12)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-19
- **Origen:** backend, rama `feature/nc-07b-consentimiento`, commit `6a7e867` (PR por abrir contra `develop`)
- **Historia o tarea:** NC-07b (D-12), cambia US-01 (registro) y NC-07 (suscripción push)
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/auth/registro` | **Cambia (incompatible).** Exige `aceptaTerminos: true` y `versionTerminos` igual a la vigente. Sin ellos ya no registra. Crea la fila `TERMINOS_Y_PRIVACIDAD` en la misma transacción. |
| GET | `/api/auth/me` | **Cambia.** `UsuarioResponse` suma `debeAceptarTerminos`. También en la respuesta de `POST /api/auth/login` y `POST /api/auth/registro` (`usuario.debeAceptarTerminos`) y en los `PATCH /api/auth/me…`. |
| GET | `/api/auth/me/consentimientos` | **Nuevo.** Vigentes, historial y versión vigente de los términos. |
| POST | `/api/auth/me/consentimientos` | **Nuevo.** Acepta una finalidad. **201** si deja fila nueva, **200** si ya estaba vigente con esa versión. |
| DELETE | `/api/auth/me/consentimientos/{finalidad}` | **Nuevo.** Revoca. **204**, idempotente. |
| POST | `/api/notificaciones/suscripciones` | **Cambia.** Exige el consentimiento `NOTIFICACIONES_PUSH` vigente: sin él, **409**. |

Los tres de consentimientos: cualquier rol autenticado y solo los del usuario del token (no hay id de usuario en la ruta). Sin token, **401**.

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `RegistroRequest` | `aceptaTerminos` | boolean | no (debe ser `true`) | nuevo | — (entrada) |
| `RegistroRequest` | `versionTerminos` | string ≤ 40 | no | nuevo | — (entrada) |
| `UsuarioResponse` | `debeAceptarTerminos` | boolean | no | nuevo | el propio usuario |
| `AceptarConsentimientoRequest` | `finalidad` | enum `FinalidadConsentimiento` | no | nuevo | — (entrada) |
| `AceptarConsentimientoRequest` | `version` | string ≤ 40, no vacío | no | nuevo | — (entrada) |
| `ConsentimientosResponse` | `versionTerminosVigente` | string | no | nuevo | el propio usuario |
| `ConsentimientosResponse` | `debeAceptarTerminos` | boolean | no | nuevo | el propio usuario |
| `ConsentimientosResponse` | `vigentes` | `ConsentimientoResponse[]` | no (puede ser `[]`) | nuevo | el propio usuario |
| `ConsentimientosResponse` | `historial` | `ConsentimientoResponse[]` | no (puede ser `[]`) | nuevo | el propio usuario |
| `ConsentimientoResponse` | `id` | number | no | nuevo | el propio usuario |
| `ConsentimientoResponse` | `finalidad` | string (valores del enum) | no | nuevo | el propio usuario |
| `ConsentimientoResponse` | `versionDocumento` | string | no | nuevo | el propio usuario |
| `ConsentimientoResponse` | `aceptadoEn` | string ISO-8601 (Instant) | no | nuevo | el propio usuario |
| `ConsentimientoResponse` | `revocadoEn` | string ISO-8601 (Instant) | **sí** (`null` si no se revocó) | nuevo | el propio usuario |
| `ConsentimientoResponse` | `vigente` | boolean | no | nuevo | el propio usuario |

- `vigentes`: como máximo una entrada por finalidad, la que autoriza hoy.
- `historial`: todas las aceptaciones, de la más reciente a la más antigua, revocadas incluidas. `vigente=false` en las revocadas y en las de términos de una versión anterior.
- `debeAceptarTerminos` es `true` si el usuario no tiene aceptada la versión vigente de los términos (usuarios anteriores a NC-07b o tras publicar un texto nuevo).

## Enums
| Enum | Valores |
|---|---|
| `FinalidadConsentimiento` | `TERMINOS_Y_PRIVACIDAD`, `NOTIFICACIONES_PUSH`, `NOTIFICACIONES_CORREO` |

springdoc puede exponerlo como `string`: la unión literal va en `src/lib/types/domain.ts`.

## Ejemplos
Registro:
```json
{
  "email": "vecino@lima.pe",
  "password": "secreta123",
  "nombre": "Ana",
  "apellido": "Ruiz",
  "aceptaTerminos": true,
  "versionTerminos": "2026-10-v1"
}
```

`GET /api/auth/me/consentimientos`:
```json
{
  "versionTerminosVigente": "2026-10-v1",
  "debeAceptarTerminos": false,
  "vigentes": [
    { "id": 12, "finalidad": "TERMINOS_Y_PRIVACIDAD", "versionDocumento": "2026-10-v1",
      "aceptadoEn": "2026-10-19T15:02:11.481Z", "revocadoEn": null, "vigente": true }
  ],
  "historial": [
    { "id": 14, "finalidad": "NOTIFICACIONES_PUSH", "versionDocumento": "push-2026-10-v1",
      "aceptadoEn": "2026-10-19T15:05:40.010Z", "revocadoEn": "2026-10-19T15:09:02.334Z", "vigente": false },
    { "id": 12, "finalidad": "TERMINOS_Y_PRIVACIDAD", "versionDocumento": "2026-10-v1",
      "aceptadoEn": "2026-10-19T15:02:11.481Z", "revocadoEn": null, "vigente": true }
  ]
}
```

`POST /api/auth/me/consentimientos` con `{"finalidad":"NOTIFICACIONES_PUSH","version":"push-2026-10-v1"}` → 201 (o 200) con un `ConsentimientoResponse`.

`DELETE /api/auth/me/consentimientos/NOTIFICACIONES_PUSH` → 204 sin cuerpo.

## Errores
| Código | Cuándo |
|---|---|
| 400 | Registro sin `aceptaTerminos`, con `aceptaTerminos: false` o sin `versionTerminos` (`details` nombra el campo). POST de consentimiento sin `finalidad`, con una finalidad desconocida o con `version` vacía. DELETE con una finalidad desconocida. |
| 401 | Sin token o token inválido (consentimientos y suscripción). |
| 409 | Registro con `versionTerminos` distinta de la vigente: **no se crea la cuenta**; el `message` incluye la versión vigente. POST de `TERMINOS_Y_PRIVACIDAD` con una versión no vigente. DELETE de `TERMINOS_Y_PRIVACIDAD` (no se revocan desde la app: retirarlos es la baja de la cuenta). `POST /api/notificaciones/suscripciones` sin el consentimiento `NOTIFICACIONES_PUSH` vigente. |

## Notas para el frontend
- **Versión de los términos.** La vigente es `2026-10-v1` (`app.legal.version-terminos` del backend). La página `/privacidad` debe mostrar el texto de esa versión y el formulario de registro debe enviar el mismo valor. Si el registro devuelve 409 por versión, el texto del cliente quedó viejo: recargar y volver a mostrarlo. Con sesión, la vigente también llega en `versionTerminosVigente`.
- **Registro:** casilla obligatoria «Acepto los términos y la política de privacidad» con enlace a `/privacidad`. Sin marcarla no se envía.
- **Usuarios existentes (D-12):** si `usuario.debeAceptarTerminos` es `true` (tras login o en `/me`), mostrar una pantalla que bloquea hasta aceptar y, al aceptar, enviar `POST /api/auth/me/consentimientos` con `TERMINOS_Y_PRIVACIDAD` y la versión vigente. El backend **no** bloquea las demás rutas mientras tanto: el bloqueo es de interfaz.
- **Push (US-21):** el orden es: 1) consentimiento `NOTIFICACIONES_PUSH` (POST de consentimientos, con la versión del texto del aviso que se mostró; para push y correo el backend guarda la versión tal cual, sin compararla), 2) permiso del navegador y `pushManager.subscribe`, 3) `POST /api/notificaciones/suscripciones`. Sin el paso 1, el paso 3 da 409.
- **Desactivar push:** `DELETE /api/auth/me/consentimientos/NOTIFICACIONES_PUSH` borra en el servidor **todas** las suscripciones push del usuario, de todos sus navegadores. Conviene además `pushSubscription.unsubscribe()` en el navegador actual. El `DELETE /api/notificaciones/suscripciones` sigue sirviendo para dar de baja solo este navegador sin retirar el permiso.
- `NOTIFICACIONES_CORREO` se registra y se puede revocar, pero el envío de correos todavía no lo consulta (queda para US-21/US-16).
- `preferenciaNotificacion` no cambia: es la **preferencia** de canal; el consentimiento es el **permiso**.
- `npm run api:sync` con el backend de `develop` levantado generará `AceptarConsentimientoRequest`, `ConsentimientoResponse` y `ConsentimientosResponse`, y los campos nuevos de `RegistroRequest` y `UsuarioResponse`.
