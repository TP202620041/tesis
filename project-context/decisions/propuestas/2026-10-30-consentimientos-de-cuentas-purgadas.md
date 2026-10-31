# Propuesta: consentimientos de las cuentas sin confirmar que se purgan (BE-15)

- **Estado:** aceptada <!-- abierta | aceptada | rechazada -->
- **Decisión del usuario (31/10):** opción A. Los consentimientos se borran junto con la cuenta purgada. La decisión se separa de la de BE-14, que sigue pendiente con los términos v2.
- **Fecha:** 2026-10-30
- **Origen:** agente de backend, tarea BE-15
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza el plan (fichas BE-15 y BE-14).

## Contexto
BE-15 (`plan-migracion-capas.md`) borra a diario las cuentas `CIUDADANO` que nunca confirmaron su correo, 30 días después de crearlas (decisión del 28/10). La ficha dejó abierta una pregunta: qué se hace con sus filas de `consentimiento` (D-12, V13). `consentimiento.usuario_id` es `NOT NULL REFERENCES usuario (id)`, así que la clave foránea impide borrar la cuenta sin decidir algo. Toda cuenta registrada tiene al menos una fila: el registro guarda la aceptación de `TERMINOS_Y_PRIVACIDAD` en la misma transacción (`RegistroCuentaService`).

Es la misma duda que BE-14 (cierre de cuenta, PR #116) plantea para una cuenta **confirmada** («la ley pide poder demostrar el consentimiento, y el titular se borra»). Aquí el caso es más simple: la cuenta nunca confirmó el correo, nunca inició sesión y no trató ningún dato más que los de la propia cuenta.

La tarea se implementó con la opción A (rama `feature/be-15-purga-sin-confirmar`, `PurgaCuentasSinConfirmarService` y `ConsentimientoRepository#borrarDeUsuario`), aislada en una sola línea del servicio para que cambiarla sea barato.

## Problema
¿Se borran, se anonimizan o se conservan los consentimientos de una cuenta sin confirmar que se purga?

## Opciones
| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| A. Borrarlos con la cuenta (implementada) | `DELETE FROM consentimiento WHERE usuario_id = ?` en la misma transacción, antes del `DELETE` de la cuenta. Coincide con los términos v2 (§8, borrador del PR #116): «si nunca confirmas tu correo, borramos la cuenta y sus datos 30 días después de crearla». | Ninguno más: ya está. | Si alguien reclamara después por esa cuenta, no queda prueba de qué aceptó. Pero esa aceptación vino de un correo que nadie verificó: no prueba el consentimiento de nadie, y sin cuenta no hay tratamiento que justificar. |
| B. Anonimizarlos (`usuario_id = NULL`) | Migración nueva: `consentimiento.usuario_id` pasa a admitir NULL (y revisar el índice único parcial de V14 y las consultas por usuario). La fila queda con finalidad, versión y fechas, sin titular. | Una migración, ajustar `ConsentimientoRepository` y sus IT. | Una fila sin titular no demuestra nada ante nadie: solo sirve como estadística. Se conserva un dato que ya no tiene finalidad. |
| C. No borrar las cuentas con consentimientos | La purga no borraría nada (todas tienen uno). | — | Deja sin cumplir la decisión del 28/10 y los términos v2. |

## Recomendación
**A.** La razón de D-12 para conservar el historial es poder demostrar qué aceptó **el titular** mientras se tratan sus datos. Con una cuenta sin confirmar no hay titular verificado ni tratamiento después del borrado, y los términos v2 ya prometen borrar «la cuenta y sus datos». B conserva una fila que no prueba nada.

Para **BE-14** (cuenta confirmada que se cierra) la respuesta puede ser distinta: ahí hubo un titular verificado y un tratamiento real (reportes, avisos), y quizá convenga conservar el historial anonimizado o por un plazo. Esta decisión no tiene por qué fijar la de BE-14.

## Qué queda bloqueado mientras no se decida
Nada del código: BE-15 está implementada con A, verificada y con commits. Lo que espera es la **fusión** del PR de BE-15. Si el usuario elige B, se agrega la migración en la misma rama antes de fusionar; si elige C, BE-15 no tiene sentido tal como está.
