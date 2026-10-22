# Propuesta: dependencias reales entre módulos frente a ARCHITECTURE.md §4.3

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-21
- **Origen:** subagente arquitecto, encargo ARQ-1 (diferencias que lista `docs/arquitectura/modulos.md`, generado el 21/10 sobre v0.6.0)
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.

## Contexto

`docs/arquitectura/modulos.md` (bloque generado por `/diagramas`) dibuja en rojo tres aristas que la columna «Usa a» de `ARCHITECTURE.md` §4.3 no prevé. Ninguna viola una guarda: `ArquitecturaCapasTest` está en 0 (`soloApiPublicaDeOtrosModulos` admite `service`, `domain`, `event`, `port` y `dto` de otro módulo, y `modulosSinCiclos` no encuentra ciclos). La diferencia es entre el **texto** de §4.3 y el código.

| Arista | Qué usa (código en `develop` 14ef98d) | Para qué | §4.3 dice |
|---|---|---|---|
| `desempeno` → `auth` | `auth.domain.Usuario` y `auth.service.UsuarioConsultaService` en `desempeno/service/DesempenoService.java` | US-17 `GET /api/desempeno/mi-distrito`: resolver el distrito (jurisdicción) del funcionario autenticado | no la prevé (`desempeno` usa a «municipalidades, reportes (event)») |
| `desempeno` → `reportes` | `reportes.event.*` y `reportes.domain.EstadoReporte` en `desempeno/listener/IndiceDesempenoRefreshListener.java`; `reportes.service.ReporteConsultaService` (`contarSinResponsable`, `contarEstancados`) en `DesempenoService` | Refrescar la vista materializada (el enum viaja dentro del evento) y dos contadores del dashboard del funcionario | solo `event` |
| `notificaciones` → `reportes` | `reportes.domain.Reporte` (`@ManyToOne` en `notificaciones/domain/Notificacion.java`) y `EstadoReporte`; `reportes.service.ReporteConsultaService#referencia` en `NotificacionService` | Guardar la fila `notificacion` con su FK a `reporte` y componer el aviso | solo `event` |

Esto ya estaba anticipado: el cierre de BE-06 en `plan-migracion-capas.md` dice «Para BE-08: actualizar en §4.3 que `notificaciones` y `desempeno` usan `reportes.service.ReporteConsultaService`». `ReporteConsultaService` y `UsuarioConsultaService` nacieron en BE-06 justamente para reemplazar el uso de repositorios ajenos por una API pública de solo lectura.

Un detalle de formato: el extractor (`.claude/skills/diagramas/comun.mjs`, `leerNormaModulos`) separa la celda «Usa a» por comas **antes** de leer el paréntesis. Una celda como `reportes (event, domain, service)` se parte mal; hay que escribir los subpaquetes separados por espacios (`reportes (event domain service)`) o sin paréntesis (cualquier subpaquete público).

## Problema

La columna «Usa a» de §4.3 restringe `desempeno` y `notificaciones` a los eventos de `reportes`, pero el código usa también su dominio y su servicio de consulta (y `desempeno` usa `auth`), con razones legítimas y sin que ninguna guarda lo impida.

## Opciones

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Actualizar §4.3 a lo que el código hace, con la regla explícita** | «Usa a» pasa a: `notificaciones` → `auth, municipalidades, reportes (event domain service)`; `desempeno` → `auth, municipalidades, reportes (event domain service)`. Se agrega una frase: «de otro módulo, el `service` que se usa es su servicio de consulta de solo lectura (`*ConsultaService`) o uno de sus casos de uso públicos; nunca para escribir en sus tablas». Regenerar `modulos.md` (las aristas dejan de ser rojas). | Editar una tabla y una frase (sesión de raíz). Sin código, sin tests. | Bajo. Se acepta que `notificacion` tenga una FK JPA a `reporte` (ya existe en el esquema desde V1). |
| B. Refactor para que el código cumpla el §4.3 actual | `Notificacion.reporte` pasa de `@ManyToOne Reporte` a `Long reporteId` (misma columna, sin migración); el aviso se arma solo con datos del evento. `desempeno` deja de llamar a `ReporteConsultaService`: los dos contadores salen de una vista o consulta propia (como la vista materializada). Para quitar `desempeno` → `auth`, la jurisdicción viaja en el principal autenticado (un `UsuarioAutenticado` en `common.security` con el distrito, armado por `auth`) o como claim del JWT. | 4–6 clases, IT de notificaciones y del dashboard, posible recongelado de ArchUnit; el claim del JWT toca D-10. | Medio. Cambia código estable justo antes del despliegue; mover la jurisdicción al token depende de D-10 (distrito o municipalidad), todavía abierta. |
| C. Mixta: A ahora y el refactor dentro de las tareas que ya van a rehacer esas piezas | A hoy. NC-06 (dashboard por periodo) ya va a rehacer `DesempenoService` sobre una vista por periodo y puede dejar de usar `ReporteConsultaService` si los contadores salen de esa vista. NC-05 (ENVIO_CORREO) decide si la nueva entidad referencia a `reporte` por id o por relación JPA, y `Notificacion` sigue el mismo criterio. | El de A, más una línea de criterio de aceptación en NC-05 y NC-06. | Bajo. |

## Recomendación

**C.** Las tres aristas son lecturas legítimas a través de la API pública que creó BE-06, y la guarda que importa (`soloApiPublicaDeOtrosModulos`, en 0) ya impide lo peligroso: usar el `repository`, el `controller`, el `listener` o el `infra` de otro módulo. Restringirlas a «solo eventos» exige un refactor que NC-05 y NC-06 harán de todos modos cuando rehagan esas piezas, y la parte de `auth` depende de D-10. Actualizar §4.3 ahora deja la norma y el diagrama alineados para la sustentación, y es la mitad de BE-08 («violaciones residuales aceptadas y listadas en §9»): aquí no quedan residuos en el almacén, solo texto desactualizado.

Si se acepta, la sesión de raíz:

1. Cambia las dos celdas «Usa a» de §4.3 con los subpaquetes **separados por espacios** (formato que lee `comun.mjs`) y agrega la frase sobre el `*ConsultaService`.
2. Corre `/diagramas` y confirma que «Diferencias con §4.3» queda en «Ninguna».
3. Agrega a NC-05 y NC-06, en `plan-migracion-capas.md`, el criterio «la dependencia hacia `reportes` se limita a `event` y al servicio de consulta; si se puede, por id y no por relación JPA».
4. Marca en BE-08 que el punto de §4.3 queda hecho.

## Relación con BE-08

BE-08 («Cierre») pide el almacén de ArchUnit vacío (ya lo está desde BE-06: 0 entradas), actualizar `backend/README.md` y `backend/CLAUDE.md`, y listar en §9 los residuos aceptados. Esta propuesta no agrega residuos: cierra el único desacuerdo que quedaba entre la norma y el código. Lo que sigue pendiente de BE-08 es documental (estructura del README y `common/geo/`, que §4.1 no lista).

## Qué queda bloqueado mientras no se decida

Nada del despliegue ni de NC-03/NC-04. El diagrama de módulos seguirá mostrando las tres aristas en rojo, y BE-08 no puede cerrarse.
