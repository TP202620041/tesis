# Handoff de contrato: confirmación del correo al crear la cuenta (NC-09)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-28
- **Origen:** backend, rama `feature/nc-09-confirmacion-correo` (PR pendiente)
- **Historia o tarea:** NC-09 (cambia US-01 y US-02)
- **Atendido por:** _(frontend, rama y fecha)_

Decisiones del usuario (28/10): una cuenta sin confirmar **no puede iniciar sesión** hasta abrir el enlace del correo; las cuentas que ya existían quedan confirmadas; el registro rechaza los correos de dominios desechables o sin MX. Detalle en `backend/README.md`, «Confirmación del correo (NC-09)».

> **Cambio incompatible.** `POST /api/auth/registro` deja de devolver la sesión. La PWA actual guarda `token` de la respuesta del registro y entra: con este backend esa respuesta ya no trae `token`. El PR del frontend tiene que fusionarse junto con este, o inmediatamente después, en la misma versión.

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/auth/registro` | **Cambia la respuesta 201**: antes `AuthResponse` (`token`, `tokenType`, `expiresInMinutes`, `usuario`); ahora `RegistroResponse` (`email`, `vigenciaEnlaceHoras`). No inicia sesión. Dos 409 nuevos (dominio del correo). |
| POST | `/api/auth/confirmar-correo` | **Nuevo**, público. Cuerpo `{"token": "..."}`. 204 sin cuerpo. No inicia sesión. |
| POST | `/api/auth/reenviar-confirmacion` | **Nuevo**, público. Cuerpo `{"email": "..."}`. 202 sin cuerpo, siempre. |
| POST | `/api/auth/login` | 409 nuevo con `codigo: "CORREO_NO_CONFIRMADO"` si la contraseña es correcta y la cuenta no está confirmada. Con contraseña incorrecta, el 401 de siempre. La respuesta 200 no cambia. |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `RegistroResponse` | `email` | string | no | nuevo | quien se registra |
| `RegistroResponse` | `vigenciaEnlaceHoras` | number (entero, hoy 24) | no | nuevo | quien se registra |
| `ConfirmarCorreoRequest` | `token` | string, máximo 100 (uno real tiene 43) | no | nuevo (entrada) | — |
| `ReenviarConfirmacionRequest` | `email` | string, formato de correo | no | nuevo (entrada) | — |
| `ApiError` | `codigo` | string | sí (solo cuando lo hay) | ya existía (D-12); ahora también en estos 409 | — |

`AuthResponse` sigue igual y solo la devuelve el login.

## Códigos de error nuevos
Todos llevan `status`, `message` (para mostrar tal cual) y `codigo` (para decidir qué hacer sin comparar textos).

### `POST /api/auth/registro`
Orden: captcha (NC-08) → dominio del correo → versión de los términos → correo duplicado.

| HTTP | `codigo` | `message` exacto | Qué hace la PWA |
|---|---|---|---|
| 409 | `CORREO_DESECHABLE` | `No aceptamos correos temporales o desechables. Usa una dirección que revises seguido: ahí te avisaremos cómo avanzan tus reportes.` | Error en el campo de correo. Reiniciar la casilla del captcha (ya se consumió). |
| 409 | `DOMINIO_SIN_CORREO` | `El dominio «<dominio>» no puede recibir correos. Revisa que esté bien escrito o usa otra dirección.` (nombra el dominio tal como se escribió: `gmail.con`) | Ídem. |

Los 409 de siempre («El correo ya está registrado», la versión de los términos) y los del captcha no cambian.

### `POST /api/auth/login`
| HTTP | `codigo` | `message` exacto | Qué hace la PWA |
|---|---|---|---|
| 409 | `CORREO_NO_CONFIRMADO` | `Confirma tu correo para iniciar sesión. Te enviamos un enlace al registrarte; si no lo encuentras, revisa la carpeta de spam o pide uno nuevo.` | Mostrar el mensaje y un botón «Reenviar el enlace» que llama a `reenviar-confirmacion` con el correo del formulario. |

### `POST /api/auth/confirmar-correo`
| HTTP | `codigo` | `message` exacto | Qué hace la PWA |
|---|---|---|---|
| 204 | — | — | «¡Listo! Tu correo está confirmado» y un botón a `/login` (no hay sesión). |
| 409 | `CORREO_YA_CONFIRMADO` | `Tu correo ya está confirmado. Inicia sesión con tu contraseña.` | Tratarlo **como éxito**: puede ser un segundo clic, o el antivirus del correo que abrió el enlace antes. Botón a `/login`. |
| 409 | `CONFIRMACION_VENCIDA` | `El enlace de confirmación venció. Pide uno nuevo desde el inicio de sesión.` | Mostrar el mensaje y ofrecer reenviar (pedir el correo). |
| 409 | `CONFIRMACION_REEMPLAZADA` | `Este enlace ya no sirve porque pediste uno nuevo. Usa el del último correo que te enviamos.` | Mostrar el mensaje. |
| 409 | `CONFIRMACION_INVALIDA` | `El enlace de confirmación no es válido. Revisa que lo hayas copiado completo o pide uno nuevo desde el inicio de sesión.` | Mostrar el mensaje y ofrecer reenviar. |
| 400 | — | `Error de validación`, detalle `Falta el código del enlace de confirmación` o `El enlace de confirmación no es válido` | Página sin `token` o con uno de más de 100 caracteres: mostrar lo mismo que `CONFIRMACION_INVALIDA` sin llamar al API. |

### `POST /api/auth/reenviar-confirmacion`
Responde **202 sin cuerpo en todos los casos**: cuenta inexistente, ya confirmada, tope alcanzado o enlace enviado. No permite averiguar qué correos tienen cuenta. Topes por cuenta: **uno por minuto** (el del registro cuenta) , **5 por hora** y **10 por día**; un pedido de más no envía nada y responde igual. Por eso la PWA:
- muestra siempre «Si tu cuenta está pendiente de confirmar, te enviamos un enlace nuevo. Revisa tu correo (y la carpeta de spam).»;
- **deshabilita el botón «Reenviar» 60 segundos** después de registrarse o de cada reenvío (la respuesta no dice si se envió).

Un enlace nuevo anula los anteriores.

## La ruta de la PWA: `/confirmar-cuenta?token=…`
El correo trae este enlace: `<origen de la PWA>/confirmar-cuenta?token=<43 caracteres base64url>`. El origen es `FRONTEND_URL` o, si no está definida, el primer origen de `CORS_ALLOWED_ORIGINS` del backend (`https://ciudadviva.app` en producción, `http://localhost:3000` en local). El enlace vence en 24 horas.

- Página **pública**, en el grupo `(auth)`, sin exigir sesión. Si hay una sesión abierta, no importa: la confirmación no la toca.
- Al cargar, lee `token` de `searchParams` (async en Next 16), lo **saca de la URL** (`history.replaceState`) para que no quede en el historial ni en el `Referer`, y llama una sola vez a `POST /api/auth/confirmar-correo` (cuidado con el doble efecto de React en desarrollo: el segundo llamado daría `CORREO_YA_CONFIRMADO`, que igual se trata como éxito).
- La página no carga recursos de terceros (el token está en la URL al llegar).
- El token va en la query, así que la primera petición a la PWA lo lleva y puede quedar en los registros de acceso de Vercel; `replaceState` no lo evita. Se acepta (un solo uso, 24 h, inútil una vez confirmada la cuenta). Si se quisiera evitar, el cambio sería pasar a un fragmento (`#token=`), y lo haría primero el backend.
- No inicia sesión: termina con un botón a `/login`.

## Cambios en pantallas existentes
- **Registro:** al 201, no entrar. Mostrar «Revisa tu correo» con el `email` de la respuesta: «Te enviamos un enlace a **{email}** para confirmar tu cuenta. Vence en {vigenciaEnlaceHoras} horas. Si no lo ves, revisa la carpeta de spam.» y un botón «Reenviar el enlace» (deshabilitado 60 s). Errores nuevos del correo en línea en el campo, como los demás 409.
- **Login:** el 409 `CORREO_NO_CONFIRMADO` muestra el mensaje y el botón «Reenviar el enlace».
- `npm run api:sync` (con el backend de esta rama corriendo): `RegistroResponse`, `ConfirmarCorreoRequest` y `ReenviarConfirmacionRequest` nuevos; la respuesta 201 del registro cambia de esquema.
- En local: el correo llega a Mailhog (`http://localhost:8025`). Con `DOMINIO_CORREO_TIPO=ninguno` (el valor local por defecto) se pueden registrar cuentas `@viasegura.test`; los dominios desechables se rechazan igual.

## Ejemplos
```http
POST /api/auth/registro
201
{ "email": "ana@lima.pe", "vigenciaEnlaceHoras": 24 }
```
```http
POST /api/auth/login   {"email":"ana@lima.pe","password":"secreta123"}
409
{
  "timestamp": "2026-10-28T20:15:00Z",
  "status": 409,
  "error": "Conflict",
  "message": "Confirma tu correo para iniciar sesión. Te enviamos un enlace al registrarte; si no lo encuentras, revisa la carpeta de spam o pide uno nuevo.",
  "path": "/api/auth/login",
  "details": [],
  "codigo": "CORREO_NO_CONFIRMADO"
}
```
```http
POST /api/auth/confirmar-correo   {"token":"3q2-7w_...43 caracteres"}
204
```
