# Propuesta: pedir el enlace de confirmación sin la contraseña

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-28
- **Origen:** agente de backend, tarea NC-09b (hallazgo 2 de la revisión de `revisor-arquitectura`)
- **Decide:** el usuario. Si se acepta, la sesión de raíz abre la tarea del frontend en el plan.

## Contexto
NC-09b aplicó la decisión del usuario del 28/10 (`2026-10-28-cuentas-sin-confirmar.md`, pregunta 1): una cuenta sin confirmar no puede recuperar la contraseña. `POST /api/auth/recuperar-password` responde 202 y no envía nada, como con un correo sin cuenta.

Eso deja sin salida visible a la dueña de un correo que otra persona registró antes:
- Al registrarse ve «El correo ya está registrado» (409).
- En el inicio de sesión no conoce la contraseña, así que recibe el 401. El «Reenviar el enlace» de `FormularioLogin.tsx` solo aparece con el 409 `CORREO_NO_CONFIRMADO`, que exige la contraseña correcta (`FormularioLogin.test.tsx`: «con credenciales inválidas no ofrece reenviar»).
- «¿Olvidaste tu contraseña?» (`RecuperarPassword.tsx`) dice «Si … está registrado, te enviamos un token», pero desde NC-09b no le llega nada.

Le queda el correo de confirmación que recibió cuando el otro se registró: abre el enlace, confirma la cuenta y después recupera la contraseña. Si el enlace venció, `/confirmar-cuenta` le deja pedir otro escribiendo su correo, y lo mismo pasa si abre esa página sin token. Pero si borró ese correo, ninguna pantalla la lleva ahí: tendría que escribir la URL a mano o esperar la purga de BE-15 (30 días). Antes de NC-09b, «¿Olvidaste tu contraseña?» la sacaba de ese hueco.

El backend ya tiene lo necesario: `POST /api/auth/reenviar-confirmacion` solo pide el correo, responde 202 siempre (no revela si la cuenta existe ni si está confirmada) y tiene sus topes (uno por minuto, 5 por hora y 10 por día por cuenta). El componente `ReenviarConfirmacion` ya existe en `features/auth`.

## Problema
¿Dónde le muestra la PWA a una persona sin contraseña cómo pedir el enlace de confirmación?

## Opciones
| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| A. Dejarlo así | El correo original, `/confirmar-cuenta` escrita a mano o esperar BE-15. | Ninguno. | La dueña de un correo ocupado que perdió el primer correo queda bloqueada hasta 30 días. |
| B. «¿No te llegó el enlace de confirmación?» en el login | Un enlace bajo el formulario que lleva a `/confirmar-cuenta`, o abre ahí mismo `ReenviarConfirmacion` con el correo escrito. Si va a `/confirmar-cuenta`, su texto sin token deja de decir «No pudimos confirmar tu correo con este enlace» y solo pide el correo. | Bajo, solo frontend. Sin cambio de contrato. | Ninguno de seguridad: el endpoint ya es público y no enumera. Suma un enlace más al login. |
| C. El aviso de «¿Olvidaste tu contraseña?» lo explica | Tras enviar, el texto genérico suma: «Si todavía no confirmaste tu cuenta, no te llegará: pide el enlace de confirmación», con `ReenviarConfirmacion`. Se muestra siempre, así que no revela nada de la cuenta. | Bajo, solo frontend. Sin cambio de contrato. | Ninguno de seguridad. Es justo donde la persona busca ayuda. |
| D. Que el backend envíe el enlace de confirmación cuando se pide recuperar una cuenta sin confirmar | `PasswordResetService` publicaría el pedido de confirmación en vez de no hacer nada. | Bajo en backend. | **Contradice la decisión del 28/10** («sin correo, sin token»). Se lista solo para descartarla. |

## Recomendación
**C, y B si se quiere más visible.** C pone la explicación donde llega la persona que no sabe su contraseña, que es «¿Olvidaste tu contraseña?», y no necesita cambiar nada del backend ni del contrato. Las dos usan el endpoint y el componente que ya existen.

## Qué queda bloqueado mientras no se decida
Nada del backend. NC-09b funciona con la opción A. La guía de despliegue (`docs/despliegue.md` §7.2, paso 1) todavía manda al funcionario con el correo ocupado a «¿Olvidaste tu contraseña?», que desde NC-09b no le envía nada: la sesión de raíz la corrige con el camino de arriba, en la misma versión que NC-09b.
