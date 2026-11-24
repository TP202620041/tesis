# Propuesta: fórmulas de los KPIs por periodo, GESTION_MUNICIPAL y D-10 (NC-06)

- **Estado:** aceptada (A / A / A, 2026-11-23)
- **Fecha:** 2026-11-23
- **Origen:** sesión coordinadora, para desbloquear el S6 (NC-06) y el indicador OE3-I5
- **Decide:** el usuario

## Contexto

NC-06 (dashboard por periodo de gestión, reemplaza la versión 1 de US-17) estaba bloqueada por tres decisiones (`plan-sprints.md`, «Decisiones del usuario que bloquean sprints»; `2026-10-21-decisiones-pendientes.md` §11–§13). El indicador OE3-I5 del Project Charter pide que el dashboard muestre la tasa de resolución y el tiempo promedio de atención de cada municipalidad, desagregados por periodo de gestión, con 100 % de coincidencia frente a un cálculo manual sobre los datos de prueba, y que se consulte sin iniciar sesión.

Ya existen `periodo_gestion` (V15, V16 sin solape; seed 2023-01-01 → 2026-12-31), `reporte.periodo_gestion_id` (el periodo de su fecha de creación, §4.3 paso 6) y `mv_indice_desempeno_distrital` (V7 y posteriores).

## Decisiones

### 1. Fórmulas de los KPIs por periodo: opción A

Las mismas fórmulas del índice actual, agrupadas por distrito (= municipalidad, D-09) y periodo de gestión:

- **Reportes válidos:** todos los del distrito y periodo, salvo CANCELADO y los ocultos por moderación. Los RECHAZADO sí cuentan (excluirlos permitiría a un distrito mejorar su tasa rechazando: SEC-01).
- **Tasa de resolución** = resueltos ÷ válidos × 100, con dos decimales. `null` si no hay válidos (≠ 0).
- **Tiempo promedio de atención** = promedio de (`resolved_at` − `created_at`) de los resueltos, en días con un decimal. `null` sin resueltos.
- **Satisfacción** = promedio de estrellas de las calificaciones de los reportes válidos. `null` sin calificaciones.
- **Datos insuficientes:** con menos de 5 válidos no se muestra la tasa (US-17 Esc. 2); con menos de 3 resueltos no se muestra el tiempo promedio (US-20 Esc. 2). El DTO expone los conteos para que el cliente lo decida; no expone señales operativas.
- El reporte cuenta en el periodo de su fecha de creación aunque se resuelva en el siguiente.

Descartadas: B (excluir rechazados de la tasa) y C (KPIs adicionales: tiempo hasta recepción, abiertos con más de 30 días).

### 2. GESTION_MUNICIPAL: opción A, no se crea

Con D-09 (municipalidad 1:1 distrito), el par distrito × periodo ya identifica una gestión municipal; los KPIs se calculan agrupando los reportes, sin tabla nueva. No se guardan autoridades, partidos ni candidatos (limitación del proyecto). La sesión de raíz actualizará ARCHITECTURE.md §4.3/§8 y la documentación (OB2, Memoria) para quitar GESTION_MUNICIPAL del modelo.

Se agrega con NC-06 el **periodo 2027-01-01 → 2030-12-31** al seed de `periodo_gestion` (migración nueva o seeder idempotente; nunca editar V15/V16), para que el filtro tenga más de un periodo. Mientras no tenga reportes, se muestra «Sin datos».

### 3. D-10: opción A, jurisdicción por `usuario.distrito_id`

Se confirma `distrito_id`. La municipalidad se obtiene con `MunicipalidadService#deDistrito`. Sin migración; `asignar-funcionario.sql` (DEP-05) no cambia. D-10 queda cerrada.

## Qué se desbloquea

NC-06 (S6). NC-05 sigue esperando los requisitos de recepción por municipalidad, que no forman parte de esta decisión.

## Evidencia del OE3-I5

Un IT con datos de prueba fijos en al menos dos periodos y varios distritos que compare cada cifra del endpoint público con el cálculo manual escrito en el propio test (100 % de coincidencia), más la consulta sin `Authorization`.
