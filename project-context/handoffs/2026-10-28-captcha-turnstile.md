# Handoff de contrato: el captcha del registro pasa a Cloudflare Turnstile (NC-08b)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-28
- **Origen:** backend, rama `feature/nc-08b-turnstile` (PR pendiente)
- **Historia o tarea:** NC-08b (sobre NC-08, cambia US-01)
- **Atendido por:** _(frontend, PR #131, en curso: se fusiona después del backend)_

Decisión del usuario del 28/10: el captcha del registro deja Google reCAPTCHA v2 y pasa a **Cloudflare Turnstile** (privacidad, costo y una CSP más simple). Detalle en `backend/README.md`, «Captcha en el registro (NC-08)». Reemplaza las notas de proveedor de `handoffs/2026-10-27-captcha-registro.md`; lo demás de ese handoff sigue vigente.

> **El contrato del API no cambia.** `POST /api/auth/registro` sigue recibiendo el token en `RegistroRequest.captchaToken` (string, hasta 2048 caracteres, opcional en el esquema) y responde los mismos errores con los mismos mensajes exactos. No hace falta `npm run api:sync`: el OpenAPI es el mismo. Cambia el widget que produce el token.

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/auth/registro` | Sin cambios de forma. Con `CAPTCHA_TIPO=turnstile` (producción), `captchaToken` es el token de Turnstile y el backend lo verifica contra `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Un token de reCAPTCHA se rechaza (409). |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `RegistroRequest` | `captchaToken` | string, máximo 2048 caracteres | sí (opcional en el esquema) | **cambia de origen**, no de forma: ahora es la respuesta del widget de Turnstile (el `cf-turnstile-response` del formulario, o el argumento del `callback` de `turnstile.render`) | — (entrada) |

## Enums
| Enum | Valores |
|---|---|
| — | Sin cambios. |

## Errores de `POST /api/auth/registro` (solo con el captcha activo; mensajes sin cambios)
| Código | `message` exacto | Cuándo | Qué hace la PWA |
|---|---|---|---|
| 409 | `Confirma que no eres un robot` | `captchaToken` ausente, `null` o en blanco. | Pedir que resuelva el widget. |
| 409 | `No pudimos confirmar que no eres un robot. Vuelve a intentarlo.` | Cloudflare rechazó el token (vencido, ya usado, inválido) o el token no se resolvió en un hostname de la PWA (`ciudadviva.app`, `www.ciudadviva.app`). | Mostrar el mensaje y **reiniciar el widget** (`turnstile.reset(id)`): el token sirve **una sola vez** y vence a los **5 minutos** (con reCAPTCHA eran 2). |
| 503 | `No pudimos verificar el captcha en este momento. Intenta de nuevo en unos minutos.` | Cloudflare no respondió a tiempo, dio un error, una respuesta ilegible, o la clave secreta del backend está mal configurada. | Mostrar el mensaje y reiniciar el widget. Es respuesta del servidor, no error de red. |
| 400 | `Error de validación`, con el detalle `El captcha no es válido` | `captchaToken` de más de 2048 caracteres (el máximo que Cloudflare documenta para un token). | — |

El orden no cambia: estos errores salen antes que «El correo ya está registrado» y que el 409 de la versión de los términos. Tras un captcha válido, el token ya se consumió: ante cualquier error posterior hay que reiniciar el widget antes de reenviar.

## Ejemplo de pedido
```json
{
  "email": "ana@lima.pe",
  "password": "secreta123",
  "nombre": "Ana",
  "apellido": "Ruiz",
  "aceptaTerminos": true,
  "versionTerminos": "2026-10-v1",
  "captchaToken": "0.AbCdEf..."
}
```

## Notas para el frontend
- **Widget:** `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` (render explícito, como hoy con reCAPTCHA) y `turnstile.render(contenedor, { sitekey, callback, 'expired-callback', 'error-callback', language: 'es' })`. Tras cualquier error del registro, `turnstile.reset(id)`.
- **CSP** (`next.config.ts`): `script-src` y `frame-src` suman `https://challenges.cloudflare.com` y se quitan las rutas de `www.google.com`, `www.gstatic.com` y `recaptcha.google.com`. La referencia de Cloudflare solo pide `connect-src` para el modo *pre-clearance* (que no se usa), pero el PR #131 abre también `connect-src` a ese origen, y con razón: en producción el Service Worker repite con `fetch()` las peticiones de otro origen, que se rigen por `connect-src`, y `api.js` manda avisos de diagnóstico desde la página (comentario de `TURNSTILE` en `next.config.ts` del #131 y `docs/despliegue.md` §6). Lo que vale es lo del #131.
- **Clave del sitio:** variable pública nueva (por ejemplo `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) en lugar de `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`. Sin ella en local, como hoy, no se muestra el widget ni se manda token (el backend local corre con `CAPTCHA_TIPO=ninguno`).
- **`action` y `cData`:** el backend **no** los compara. No hace falta fijar `data-action`; si se fija, se ignora.
- **Hostname:** en producción el backend solo acepta tokens resueltos en `ciudadviva.app` y `www.ciudadviva.app` (`CAPTCHA_HOSTNAMES`). Un despliegue de vista previa de Vercel (`*.vercel.app`) con la clave del sitio de producción recibiría 409 si apuntara al backend de producción; el widget de Cloudflare además solo funciona en los hostnames que tenga configurados.
- **Pedido para el PR #131 (`docs/despliegue.md` §5.2):** esta rama no toca el runbook para no chocar con el #131. Hace falta agregar ahí la fila de la variable nueva del backend, junto a `CAPTCHA_TIPO` y `CAPTCHA_SECRET`: `CAPTCHA_HOSTNAMES`, **no obligatoria**; en `prod`, por defecto `ciudadviva.app,www.ciudadviva.app`; **debe coincidir con los hostnames del widget** en el panel de Cloudflare, o todo registro dará 409; solo se define si la PWA se sirve en otro dominio; vacía, no se compara (ver `backend/README.md`, tabla de variables).
- **Claves de prueba de Cloudflare** (solo desarrollo, nunca producción): clave del sitio `1x00000000000000000000AA` (siempre aprueba, visible) o `2x00000000000000000000AB` (siempre falla, visible). El token que entregan es `XXXX.DUMMY.TOKEN.XXXX`. Sus parejas secretas están en `backend/.env.example` para levantar el backend con `CAPTCHA_TIPO=turnstile` en local; con ellas el backend responde `hostname` `example.com`, así que `CAPTCHA_HOSTNAMES` va vacía en local.
