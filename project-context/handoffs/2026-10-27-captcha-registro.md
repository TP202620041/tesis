# Handoff de contrato: captcha reCAPTCHA v2 en el registro (NC-08)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-27
- **Origen:** backend, rama `feature/nc-08-captcha-registro` (PR por abrir)
- **Historia o tarea:** NC-08 (cambia US-01)
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/auth/registro` | **Cambia.** `RegistroRequest` suma `captchaToken`. Con el captcha activo (`CAPTCHA_TIPO=recaptcha`, producción) se exige y se verifica contra Google **antes** que cualquier otra regla (términos, correo duplicado). La respuesta 201 no cambia. |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `RegistroRequest` | `captchaToken` | string, máximo 2048 caracteres | sí (opcional en el esquema) | nuevo | — (entrada) |

`captchaToken` es la respuesta de la casilla «No soy un robot» de Google reCAPTCHA v2: lo que devuelve `grecaptcha.getResponse()` (o el callback de `data-callback`) después de marcarla. El esquema lo marca opcional porque depende de la configuración del servidor:

- con `CAPTCHA_TIPO=ninguno` (desarrollo local y tests del backend) **se ignora**: el registro funciona igual con o sin él;
- con `CAPTCHA_TIPO=recaptcha` (producción) es **obligatorio**.

El backend no expone si el captcha está activo; el frontend decide mostrar la casilla según su propia configuración (la clave del sitio, pública). Si la muestra, siempre debe enviar el token.

Clave del sitio de **prueba** de Google (siempre aprueba; solo desarrollo, nunca producción): `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`. Su pareja secreta está en `backend/.env.example` para levantar el backend con `CAPTCHA_TIPO=recaptcha` en local.

## Enums
| Enum | Valores |
|---|---|
| — | Sin cambios. |

## Errores nuevos de `POST /api/auth/registro` (solo con el captcha activo)
| Código | `message` exacto | Cuándo | Qué hace la PWA |
|---|---|---|---|
| 409 | `Confirma que no eres un robot` | `captchaToken` ausente, `null` o en blanco. | Pedir que marque la casilla. |
| 409 | `No pudimos confirmar que no eres un robot. Vuelve a intentarlo.` | Google rechazó el token (vencido, ya usado, inválido). | Mostrar el mensaje y **reiniciar la casilla** (`grecaptcha.reset()`): un token sirve una sola vez y caduca a los 2 minutos. |
| 503 | `No pudimos verificar el captcha en este momento. Intenta de nuevo en unos minutos.` | Google no respondió a tiempo, dio un error o una respuesta ilegible. | Mostrar el mensaje y reiniciar la casilla. Es respuesta del servidor, no error de red. |
| 400 | `Error de validación`, con el detalle `El captcha no es válido` | `captchaToken` de más de 2048 caracteres. | — (no ocurre con un token real). |

Orden: estos errores salen **antes** que «El correo ya está registrado» (409) y que el 409 de versión de términos. Con un token rechazado, el usuario ve el mensaje del captcha aunque el correo ya tenga cuenta; tras un captcha válido pueden aparecer los 409 de siempre, y entonces el token ya se consumió: hay que reiniciar la casilla antes de reenviar.

## Ejemplo de pedido
```json
{
  "email": "ana@lima.pe",
  "password": "secreta123",
  "nombre": "Ana",
  "apellido": "Ruiz",
  "aceptaTerminos": true,
  "versionTerminos": "2026-10-v1",
  "captchaToken": "03AFcWeA..."
}
```

## Notas para el frontend
- La casilla carga `https://www.google.com/recaptcha/api.js`, que a su vez usa `https://www.gstatic.com/recaptcha/` y un `iframe` de `https://www.google.com/recaptcha/`: hay que listarlos en la CSP de `next.config.ts` (`script-src`, `frame-src`).
- La clave del sitio va por variable pública del frontend; la secreta nunca sale del backend.
- Regenerar los tipos con `npm run api:sync` (`captchaToken?: string`).
