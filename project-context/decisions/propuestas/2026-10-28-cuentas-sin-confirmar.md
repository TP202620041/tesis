# Propuesta: cuentas sin confirmar (NC-09)

- **Estado:** aceptada, decidida el 2026-10-28 (ninguna opción tal cual: ver «Decisión») <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-28
- **Origen:** agente de backend, tarea NC-09
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza el plan y abre la tarea que corresponda.

## Contexto
NC-09 hizo que una cuenta nueva nazca sin confirmar y no pueda iniciar sesión hasta abrir el enlace del correo (`auth/service/ConfirmacionCorreoService`, V20; decisiones del usuario del 28/10). Quedaron tres casos borde que la tarea no resolvió, porque cambian reglas que no estaban en el pedido:

1. **Alguien registra el correo de otra persona.** La cuenta queda sin confirmar y ocupa ese correo: la dueña ve «El correo ya está registrado» (`RegistroCuentaService`). Hoy puede recuperarla así: «¿Olvidaste tu contraseña?» funciona sin confirmar (`PasswordResetService`), cambia la contraseña del intruso, y después pide el enlace con «Reenviar». Son dos correos y dos pasos. Si en cambio abre el enlace del primer correo, confirma la cuenta con la contraseña del intruso (el correo dice «Si no creaste esta cuenta, ignora este correo»).
2. **Cuentas que nunca se confirman.** Quedan para siempre en `usuario`, con sus datos personales (nombre, correo) y su aceptación de términos, sin finalidad (Ley N.° 29733, proporcionalidad).
3. **`backend/scripts/asignar-funcionario.sql` (DEP-05)** no mira `correo_confirmado`. El runbook pide que la persona entre con su contraseña antes de asignar, y desde NC-09 entrar ya prueba que el correo es suyo; pero el script no lo comprueba solo (se actualizó solo su comentario).

## Problema
¿Restablecer la contraseña confirma el correo, se purgan las cuentas que nunca se confirman y el script de funcionarios exige la cuenta confirmada?

## Opciones
| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| A. Dejarlo como está (lo implementado) | La recuperación no confirma; nada se purga; el script no comprueba. | Ninguno. | La dueña de un correo ocupado necesita dos pasos. Las cuentas abandonadas se acumulan. Un operador podría asignar el rol a una cuenta sin confirmar si se salta el paso del runbook (esa cuenta igual no puede entrar). |
| B. Restablecer la contraseña también confirma el correo | `PasswordResetService#restablecer` marca `correo_confirmado` (el token llegó a ese buzón: prueba la propiedad igual que el enlace) y anula los enlaces pendientes. IT nuevo. | Bajo: unas líneas y un IT. | Matiza la decisión (1) del usuario («hasta hacer clic en el enlace»): habría dos enlaces que confirman. |
| C. B + purga + comprobación en el script | Además: una tarea programada borra las cuentas sin confirmar de más de N días (p. ej. 7) con sus consentimientos y tokens; y `asignar-funcionario.sql` falla con una cuenta sin confirmar. | Medio: un `@Scheduled` (o un cron de Railway como `respaldo-bd`), sus IT, y volver a verificar el script con `psql` como en DEP-05. | Borrar datos es irreversible; hay que fijar N y decidir si se avisa antes por correo. |

## Recomendación
**B ahora y la comprobación del script; la purga después**, en su propia tarea. B resuelve el caso del correo ocupado en un solo paso sin debilitar nada: el token de recuperación es tan prueba de propiedad como el enlace. La comprobación del script es una línea en el bloque `DO` y hace explícito lo que hoy depende de que el operador siga el runbook. La purga toca datos personales y conviene decidir el plazo y el aviso con calma.

## Qué queda bloqueado mientras no se decida
Nada de NC-09: el backend funciona con la opción A y el handoff al frontend no depende de esto. Si se elige B, cambia el texto del correo de confirmación («Si no creaste esta cuenta…») y el del README; el contrato del API no cambia.

## Decisión

Del usuario, el **2026-10-28**. No eligió una opción tal cual: descartó B y tomó de C la purga y la comprobación del script.

1. **Recuperar la contraseña (pregunta 1): restablecerla NO confirma el correo, y una cuenta sin confirmar NO puede restablecerla.** En sus palabras: «No pueden restablecer la contraseña de una cuenta no creada, de todas maneras tendrán que pasar por la confirmación del correo». Pedir el restablecimiento para una cuenta sin confirmar responde lo mismo que para una cuenta inexistente (sin correo, sin token, sin revelar nada) y deja un `INFO` sin el correo; un token que hubiera quedado de una cuenta sin confirmar se rechaza. La dueña de un correo ocupado recupera la cuenta confirmándola primero con el enlace («Reenviar») y cambiando después la contraseña.
2. **Cuentas que nunca se confirman (pregunta 2): se purgan a los 30 días**, en una tarea aparte: **BE-15** del plan (`plan-migracion-capas.md`), con sus criterios y tests.
3. **`asignar-funcionario.sql` (pregunta 3): exige la cuenta confirmada.** Con una cuenta sin confirmar falla con un mensaje claro y no asigna nada.

Implementadas 1 y 3 en **NC-09b** (rama `feature/nc-09b-cuentas-sin-confirmar`); ver «Cuentas sin confirmar (NC-09b)» en `backend/README.md`. El texto del correo de confirmación no cambia. El contrato del API tampoco: el 202 y el 404 son los de siempre.
