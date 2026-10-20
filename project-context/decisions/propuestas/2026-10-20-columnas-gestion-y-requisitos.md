# Propuesta: columnas de GESTION_MUNICIPAL y REQUISITO_RECEPCION

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-20
- **Origen:** agente de backend, tarea NC-01
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.

## Contexto

NC-01 (`plan-migracion-capas.md`, «Núcleo nuevo») pide una migración con las cuatro entidades del OB2 §5 del módulo `municipalidades`: MUNICIPALIDAD, GESTION_MUNICIPAL, PERIODO_GESTION y REQUISITO_RECEPCION. `ARCHITECTURE.md` §4.3 y §8 solo **nombran** las entidades. Las únicas columnas definidas son:

- MUNICIPALIDAD: `distrito_id NOT NULL UNIQUE` → `distrito`, sin geometría (D-09), y `correo_contacto` nulable (canal oficial).
- PERIODO_GESTION: no tiene columnas definidas, pero `MunicipalidadService#periodoVigente(fecha)` exige un rango. Se implementó lo mínimo: `fecha_inicio` y `fecha_fin`, ambas inclusivas, con `CHECK (fecha_fin >= fecha_inicio)`, y el seed 2023-01-01 → 2026-12-31 que confirmó el usuario.
- GESTION_MUNICIPAL y REQUISITO_RECEPCION: **ninguna columna** definida en el repositorio. El OB2 §5 no está en `project-context/`.

Por eso `backend/src/main/resources/db/migration/V15__municipalidades.sql` crea solo `municipalidad` y `periodo_gestion`. Además se agregó `municipalidad.nombre` (`NOT NULL UNIQUE`), que §8 no lista pero que exige el seed de la Municipalidad Metropolitana de Lima. Los valores son «Municipalidad Metropolitana de Lima» para el distrito «Lima» (Cercado) y «Municipalidad Distrital de X» para los otros 42 (`Municipalidad.nombreOficial`, `municipalidades/infra/MunicipalidadSeeder`).

## Problema

Las columnas de GESTION_MUNICIPAL y REQUISITO_RECEPCION no están definidas, y crearlas ahora sería inventar el modelo.

## Opciones

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| A. El usuario aporta las columnas del OB2 §5 y cada tabla se crea con la tarea que la usa | REQUISITO_RECEPCION en NC-05 (la regla «reporte confirmado» usa los requisitos de cada municipalidad, `plan-sprints.md` S6). GESTION_MUNICIPAL en NC-06, si es la gestión de una municipalidad en un periodo (dashboard). Cada una lleva su migración (V16 o siguiente). | Ninguno ahora; una migración por tabla después. | Bajo. Las tablas nacen con columnas reales y con un IT que las usa. |
| B. Crear ya GESTION_MUNICIPAL como tabla puente mínima (`municipalidad_id`, `periodo_gestion_id`, `UNIQUE`) | Un modelo inferido del nombre. | 1 tabla + 1 entidad sin uso. | Medio. Si el OB2 define otra cosa (alcalde, presupuesto, metas), habrá que migrarla otra vez; una tabla sin caso de uso no tiene IT con sentido. |
| C. Sacar las dos del modelo | Se quitan de §4.3 y §8 si ninguna historia las usa. | Editar ARCHITECTURE.md. | Medio. NC-05 menciona los requisitos de recepción, así que REQUISITO_RECEPCION parece necesaria. |

## Recomendación

**A.** NC-01 queda con lo definido (MUNICIPALIDAD y PERIODO_GESTION), y cada tabla pendiente entra con la tarea que la consume, una vez que el usuario confirme sus columnas del OB2 §5. Confirmar también `municipalidad.nombre` y sus valores, y si PERIODO_GESTION necesita más columnas (por ejemplo una etiqueta «2023-2026»).

## Qué queda bloqueado mientras no se decida

Nada de NC-01 ni de NC-02. NC-05 necesita REQUISITO_RECEPCION, y NC-06 posiblemente GESTION_MUNICIPAL.
