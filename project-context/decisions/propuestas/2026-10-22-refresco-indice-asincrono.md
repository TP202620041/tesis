# Propuesta: refrescar el índice de desempeño de forma asíncrona

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-22
- **Origen:** agente de backend, tarea DEP-12 (fotos en R2, PR #96), en la prueba de memoria. La registra la sesión coordinadora.
- **Decide:** el usuario. Queda fuera del alcance autorizado para la noche del 22/10 (DEP-12, DEP-08 y QA-1) y cambia el alcance de D-13. Si se acepta, la sesión de raíz agrega la tarea al plan.

## Contexto
- **La prueba.** Se hizo con la imagen real de producción (`-Xmx512m`), R2 simulado con S3Mock y un PostGIS temporal:
  - **8 creaciones** simultáneas de reportes con foto terminan en 201 en ~1 s.
  - **16 creaciones** simultáneas agotan durante unos 30 s el pool de conexiones a la base (Hikari, 10 por defecto). Resultado: 13 × 201, 2 × 401 y 1 × 500, todas a los ~30 s.
  - Las mismas 16 **sin foto** terminan en menos de 0,5 s. La memoria no tuvo problemas: pico de 301 MB de 512.
- **La causa.**
  - `desempeno/listener/IndiceDesempenoRefreshListener` se ejecuta en `AFTER_COMMIT` y llama a `DesempenoService.refrescarIndice()`, que abre una transacción nueva (`REQUIRES_NEW`) para el `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_indice_desempeno_distrital`.
  - El listener corre **en el mismo hilo de la petición**, mientras la conexión de la transacción original todavía no se devolvió al pool. Cada creación toma entonces dos conexiones a la vez.
  - Con foto, la creación dura más porque el saneado y la subida van dentro de la transacción. Así se acumulan suficientes peticiones para vaciar el pool, y las que esperan más de 30 s fallan.
- **Antecedente.** El mismo problema ya se resolvió para las notificaciones con D-13 (asíncronas y con la E/S de red fuera de la transacción, ARCHITECTURE.md §4.5). El refresco del índice quedó síncrono.

## Problema
Con picos de creación de reportes con foto, el refresco síncrono del índice duplica las conexiones por petición y puede agotar el pool de la base, con errores 500 y 401 para los ciudadanos.

## Opciones
| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Refresco asíncrono y coalescido** | El listener marca «índice sucio» y una tarea `@Async` en el executor acotado (`AsyncConfig`) hace un solo `REFRESH` aunque lleguen varios eventos seguidos (por ejemplo, como mucho uno cada pocos segundos). La conexión de la petición se devuelve antes. | Bajo-medio: listener, una bandera atómica, un IT de «muchos eventos, un refresco» y ajustar los IT que leen el índice (ya lo refrescan en su `@BeforeEach`) | El índice público tarda unos segundos en reflejar un cambio, algo aceptable para una métrica agregada. Hay que conservar la regla «todo evento que mueve el índice lo refresca». |
| **B. Subir el pool en producción** (`spring.datasource.hikari.maximum-pool-size`, por ejemplo 20) | Solo configuración | Mínimo | Esconde la causa. El plan Hobby de Railway y el PostgreSQL limitan las conexiones, y con más tráfico vuelve. |
| **C. Sacar la subida y el saneado de la transacción de creación** | La foto se sube antes de abrir la transacción, o se guarda después con su compensación. Ya está previsto para NC-04. | Medio | Aparecen huérfanos en el bucket si la transacción falla. No resuelve el refresco duplicado. |

## Recomendación
**A**, y **B** como medida inmediata y temporal en el primer despliegue (`maximum-pool-size` de 15 a 20 en `application-prod.yml`), hasta que entre A. **C** se evalúa con NC-04. Un piloto de tesis rara vez tendrá 16 creaciones con foto en el mismo segundo, así que no bloquea el MVP, pero un 500 en el reporte es justo lo que no debe pasar en la demo.

## Qué queda bloqueado mientras no se decida
- Nada de v0.7.0 está bloqueado: DEP-12 cumple su criterio (8 subidas simultáneas, todas 201).
- La prueba de carga del despliegue (DEP-10) debe evitar más de 8 creaciones con foto simultáneas, o documentar este límite, hasta que se aplique A o B.
