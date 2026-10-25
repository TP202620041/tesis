# Propuesta: refrescar el índice de desempeño de forma asíncrona

- **Estado:** aceptada <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-22
- **Origen:** agente de backend, tarea DEP-12 (fotos en R2, PR #96), en la prueba de memoria. La registra la sesión coordinadora.
- **Decide:** el usuario. Queda fuera del alcance autorizado para la noche del 22/10 (DEP-12, DEP-08 y QA-1) y cambia el alcance de D-13. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md §4.5 y la fila D-13 (hoy: `REQUIRES_NEW`, y `@Async` solo para HTTP o SMTP) y agrega la tarea al plan.

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
| **A. Refresco asíncrono y coalescido** | El listener marca «índice sucio» y encola una tarea `@Async` en el executor acotado (`AsyncConfig`). La tarea repite `while (sucio.getAndSet(false)) refrescar()`. Así varios eventos seguidos producen pocos `REFRESH`, y **siempre hay un refresco final**: una ventana mínima entre refrescos solo lo **retrasa**, nunca lo descarta. Si el executor rechaza la tarea (`AbortPolicy`, cola llena), la bandera queda puesta y el siguiente evento la recoge. La conexión de la petición se devuelve antes. | Medio: listener, bandera atómica, un IT de «muchos eventos, al menos un refresco final». Los IT que verifican el refresco por evento sin refrescar a mano (`DesempenoIT` en las líneas ~175, ~223 y ~253; la última crea y cancela con milisegundos de diferencia) necesitan que el perfil `test` desactive la ventana o esperar con sondeo acotado. | El índice público tarda unos segundos en reflejar un cambio, algo aceptable para una métrica agregada. Se conserva la regla «todo evento que mueve el índice lo refresca» (backend/CLAUDE.md) gracias al refresco final garantizado. |
| **B. Subir el pool en producción** (`spring.datasource.hikari.maximum-pool-size`, por ejemplo 20) | Solo configuración | Mínimo | Esconde la causa. El plan Hobby de Railway y el PostgreSQL limitan las conexiones, y con más tráfico vuelve. |
| **C. Sacar la subida y el saneado de la transacción de creación** | La foto se sube antes de abrir la transacción, o se guarda después con su compensación. Ya está previsto para NC-04. | Medio | Aparecen huérfanos en el bucket si la transacción falla. No resuelve el refresco duplicado. |

## Recomendación
**A**, y **B** como medida inmediata y temporal en el primer despliegue: añadir `spring.datasource.hikari.maximum-pool-size` a `application-prod.yml` (hoy no está y rige el valor por defecto, 10) con un valor entre 15 y 20, dentro del límite de conexiones del PostgreSQL de Railway, hasta que entre A. **C** se evalúa con NC-04. Un piloto de tesis rara vez tendrá 16 creaciones con foto en el mismo segundo, así que no bloquea el MVP, pero un 500 en el reporte es justo lo que no debe pasar en la demo.

## Decisión (usuario, 2026-10-25)
**A, con B mientras tanto.**
- **A** pasa a ser la tarea **BE-12** del S7 (v0.8.0), junto con BE-11, que es la opción C: las dos tocan la creación del reporte.
  - Al cerrarla se actualizan ARCHITECTURE.md §4.5 y la fila D-13, **en la rama de BE-12 y no antes**, para que la norma no describa un código que todavía no existe. Ese commit lo agrega la sesión de raíz a esa rama antes de fusionar, porque la guardia no deja que el agente de backend edite normas.
- **B** en el primer despliegue: el pool sube de 10 a 20 con la variable `SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE=20` en Railway.
  - **Por qué una variable:** Spring la lee con *relaxed binding* y no hace falta tocar `application-prod.yml` ni cortar otra versión. Así el despliegue no se atrasa.
  - **Margen:** el PostgreSQL acepta 100 conexiones por defecto, así que 20 cabe de sobra.
  - **Al cerrar BE-12** se revisa si el pool vuelve a 10.

## Qué queda bloqueado mientras no se decida
- Nada de v0.7.0 está bloqueado: DEP-12 cumple su criterio (8 subidas simultáneas, todas 201).
- La prueba de carga del despliegue (DEP-10) debe evitar más de 8 creaciones con foto simultáneas, o documentar este límite, hasta que se aplique A o B.
