# Propuesta: notificaciones fuera de transacción (excepción a §4.5)

- **Estado:** aceptada (2026-10-20) <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-20
- **Origen:** agente de backend, tarea US-21 (rama `feature/us-21-push-real`)
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.

## Contexto
`ARCHITECTURE.md` §4.5 dice: «Los listeners `AFTER_COMMIT` que escriben abren su propia transacción (`REQUIRES_NEW`)». Hasta US-21, `notificaciones/service/NotificacionService.notificarCambioEstado` lo cumplía: el listener `ReporteEstadoCambiadoListener` (`AFTER_COMMIT`) lo llamaba y el método era `@Transactional(REQUIRES_NEW)`.

Con US-21 el canal push hace llamadas HTTP reales al servicio de push del navegador (hasta 3 s de conexión y 5 s de pedido por suscripción, y un usuario puede tener varias). Además del SMTP del correo. Si todo eso corre dentro de una transacción `REQUIRES_NEW`, cada aviso **retiene una conexión del pool de la base** mientras espera a la red. Con varios cambios de estado seguidos, el pool de Hikari (10 por defecto) se agota y se bloquea toda la API, no solo las notificaciones.

Hoy el código hace esto, en `feature/us-21-push-real`:
- `NotificacionService.notificarCambioEstado` es `@Async(AsyncConfig.EJECUTOR)` y **no** abre transacción.
- Los envíos (SMTP y HTTP) corren sin transacción y sin conexión a la base retenida.
- Cada escritura es una transacción corta del repositorio: el `save` de `notificacion` y el `save` que desactiva una suscripción caducada. Las dos son transaccionales en Spring Data.
- Como el método corre en un hilo del executor, no hereda los recursos de la transacción ya confirmada del cambio de estado. Los IT lo reproducen con un executor que corre la tarea en otro hilo y la espera (`support/EjecutorSincronoTestConfig`).

## Problema
§4.5 pide `REQUIRES_NEW` para los listeners que escriben, pero aplicado a un caso de uso con E/S de red lenta retiene conexiones de la base durante esa E/S.

## Opciones
| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Excepción documentada (recomendada)** | §4.5 suma: «Si el caso de uso hace E/S externa lenta (HTTP, SMTP), no abre una transacción que la envuelva: la E/S corre fuera, y cada escritura es una transacción corta». Se aplica a `NotificacionService` y, a futuro, a la sugerencia de categoría (D-08, inferencia HTTP). | Una línea en ARCHITECTURE.md. Ya está implementada. | Hay escrituras parciales: un aviso puede quedar registrado para un canal y no para otro si el proceso muere a la mitad. Se acepta: cada fila de `notificacion` es un intento independiente, no un agregado. |
| B. Volver a `REQUIRES_NEW` | Cumple §4.5 al pie de la letra. | Ninguno en código. | Retiene una conexión por aviso durante hasta ~8 s por suscripción; puede agotar el pool y bloquear la API. |
| C. Separar en dos transacciones explícitas (leer, enviar, registrar) con `TransactionTemplate` | Mantiene una transacción declarada por paso. | Más código y cambia el constructor (recongelar ArchUnit). | Igual que A en el resultado; solo más explícito. |

## Recomendación
**Opción A.** La regla de §4.5 busca que un fallo del listener no afecte a la transacción original, que ya está confirmada. Eso se cumple igual sin envolver la E/S de red en una transacción. Envolverla solo añade el riesgo de agotar el pool. La sugerencia de categoría de D-08 tiene el mismo perfil (una llamada HTTP de hasta 3 s) y le conviene la misma regla.

## Qué queda bloqueado mientras no se decida
Nada. El código de US-21 ya funciona así y lo cita en el javadoc de `NotificacionService.notificarCambioEstado`. Si se elige B o C, es un cambio local a ese método.

## Decisión

**Opción A**, decidida por el usuario el 2026-10-20. Registrada como **D-13** en `ARCHITECTURE.md` (§4.5 y §9).
