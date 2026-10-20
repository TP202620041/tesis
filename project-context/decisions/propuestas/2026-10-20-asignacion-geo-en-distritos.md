# Propuesta: dónde vive la asignación de distrito por coordenadas

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-20
- **Origen:** agente de backend, tarea BE-06
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.

## Contexto

BE-06 reemplaza cada uso de `repository/` de otro módulo por un método del `service` de ese módulo. Las 45 violaciones de `soloApiPublicaDeOtrosModulos` que están en `service/` se cortaron así (`UsuarioConsultaService`, `DistritoService#porId`, `ReporteConsultaService`). Quedan **3** que esa receta no resuelve, todas del mismo adaptador:

- `reportes/infra/PointInPolygonAssignmentStrategy` (implementa `reportes/port/GeoAssignmentStrategy`) inyecta `distritos/repository/DistritoRepository` y llama a `findDistritoQueContiene(lon, lat)` (constructor, campo y llamada).

El adaptador no puede pasar a usar `DistritoService`: la regla `capas` de `ArquitecturaCapasTest` solo deja que `Presentacion` acceda a `Aplicacion` (`service`), así que un `infra` que llama a un `service` es una violación nueva de otra regla. Y el adaptador no puede quedarse con el repositorio de `distritos` sin violar `soloApiPublicaDeOtrosModulos`. Cortar la dependencia exige mover clases entre módulos o quitar el puerto, y eso no lo decide el agente.

`DistritoService#porCoordenadas` (`GET /api/distritos/por-coordenadas`) ya usa la misma consulta, y su javadoc pide que ambos caminos sigan siendo **la misma** consulta (`ST_Covers` sobre `geography`, índice GiST), para que el frontend nunca discrepe del distrito que asigna el backend.

## Problema

La consulta espacial que asigna el distrito vive en `distritos`, pero su puerto y su adaptador viven en `reportes`, y ninguna de las capas de `reportes` que podrían usarla (`infra`) tiene permitido llamar al `service` de `distritos`.

## Opciones

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| A. Mover el puerto y el adaptador a `distritos`: `distritos/port/GeoAssignmentStrategy` y `distritos/infra/PointInPolygonAssignmentStrategy` (mismos nombres, D-05) | El adaptador usa el repositorio de su propio módulo (permitido). `ReporteService` inyecta el puerto de `distritos` (un `port` de otro módulo es API pública). El IT pasa a `distritos/infra/`. Recongelado controlado: las 3 entradas salen del almacén y `soloApiPublicaDeOtrosModulos` queda en 0. | 2 clases y 1 IT movidos, 1 import en `ReporteService`; `backend/CLAUDE.md` y `README.md` citan la ruta vieja. | Bajo. La asignación queda en el módulo dueño de los polígonos; el Strategy se conserva (principio 4: el cálculo geoespacial entra por un puerto). |
| B. Quitar el puerto: `ReporteService` llama a un `DistritoService#queContiene(Point)` que devuelve `Optional<Distrito>` | Desaparecen `GeoAssignmentStrategy` y `PointInPolygonAssignmentStrategy`. | Menos clases. | Contradice el principio 4 de ARCHITECTURE.md y el Strategy documentado en README y CLAUDE.md (sustentación). Un futuro fallback (distrito más cercano) volvería a necesitar el puerto. |
| C. Dejar las 3 violaciones congeladas y aceptarlas en ARCHITECTURE.md §9 como residuo (BE-08) | Nada cambia en el código. | Ninguno ahora. | La regla nunca llega a 0; el almacén guarda una excepción permanente por una razón de ubicación, no de diseño. |

## Recomendación

**A.** Mueve la responsabilidad al módulo que tiene los datos (polígonos de `distrito`) sin cambiar comportamiento ni nombres, deja `soloApiPublicaDeOtrosModulos` en 0 y conserva el Strategy. El grafo de módulos no cambia (`reportes` ya depende de `distritos`). Si se acepta, es un commit propio con recongelado controlado (3 entradas que salen, ninguna que entra).

## Qué queda bloqueado mientras no se decida

Solo el cierre de `soloApiPublicaDeOtrosModulos` en 0: BE-06 se entrega con estas 3 entradas congeladas (48 → 3). El resto de BE-06 y US-11 no dependen de esto.
