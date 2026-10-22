# Propuesta: migración que corrige las tildes de las categorías estándar

- **Estado:** aceptada (2026-10-22) <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-22
- **Origen:** sesión coordinadora. Viene del hallazgo M-1 del informe QA-1 (`docs/qa/2026-10-21-mvp-v0.6.0.md`) y del punto 9 de la propuesta de diseño (`docs/diseno/2026-10-21-propuesta.md` §8).
- **Decide:** el usuario. En la autorización del 22/10 respondió primero con la plantilla «[Sí/No]» sin elegir; luego la aprobó explícitamente («Sí, apruebo la migración de tildes»).

## Contexto
- **Los nombres sin tildes.** Las seis categorías estándar las siembra `backend/src/main/resources/db/migration/V3__seed_categorias_estandar.sql` sin tildes ni eñes. Cuatro textos muestran el problema:
  - «Vereda danada»;
  - «Semaforo averiado» (con su descripción «Semaforo apagado…»);
  - «Senalizacion faltante»;
  - «Senal de transito ausente o ilegible».
- **Dónde se ven.** Esos nombres llegan tal cual al mapa, a los filtros, al detalle, a la bandeja, a la exportación CSV/XLSX y a los correos. QA-1 lo marcó como menor (M-1) y el diseñador lo incluyó en su plan.
- **Qué no se puede hacer.** V3 ya está aplicada en todas las bases, y la guardia prohíbe editar una migración existente. La corrección tiene que ir en una migración nueva (V18 o la siguiente versión libre) con `UPDATE categoria_dano … WHERE es_estandar AND nombre = …`.
- **Qué depende hoy de esos nombres.** Ningún código de `backend/src`, `frontend/src` ni `backend/scripts` busca una categoría por su nombre. Solo V3 los contiene. Las categorías se identifican por `id`, y los reportes guardan `categoria_id`. Cambiar el texto no rompe referencias.
- **Relación con la decisión de ML del 21/10.** Esa decisión desactiva «Hueco en calzada» (`2026-10-21-ml-clases-modelo.md`), lo que también exige una migración sobre `categoria_dano`. Lo natural es que las dos vayan en la misma migración, o en dos seguidas.

## Problema
¿Se corrigen en la base, con una migración nueva, los textos de las categorías estándar, que hoy se ven sin tildes en toda la plataforma?

## Opciones
| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Migración nueva** que corrige nombres y descripciones (y, si se quiere, desactiva «Hueco en calzada» en la misma) | Un `UPDATE` por categoría con `WHERE es_estandar AND nombre = '<texto viejo>'`, más un IT que lea las seis categorías | Bajo: una migración, un IT y una línea en el README | Bajo. Se aplica en todas las bases y no se revierte deshaciendo el código: hace falta otra migración. Cambia leyendas que ya aparecen en capturas de la tesis. |
| **B. Corregir solo en la presentación** (un mapa de reemplazos en el frontend) | La base sigue con «Semaforo averiado» y la PWA muestra «Semáforo averiado» | Bajo en el frontend, pero los correos y el CSV siguen sin tildes | Medio. El texto queda distinto en cada canal y hay que duplicar la tabla de reemplazos. |
| **C. No corregir** | Todo sigue como en v0.6.0 | Ninguno | Imagen descuidada ante el jurado, y QA-1 M-1 queda abierto. |

## Recomendación
**Opción A**, en la misma migración que desactiva «Hueco en calzada», cuando empiece NC-04. Si antes se quiere desplegar el MVP con los textos corregidos, puede ir sola como V18: es independiente y barata. Como afecta datos que ve el público y no se deshace con un revert, necesita un «sí» explícito.

## Qué queda bloqueado mientras no se decida
- **QA-1 M-1, parte de datos.** Las tildes de las categorías y de sus descripciones. El resto de M-1 (mensajes del API, correos, línea de tiempo) es código y avanza en la tarea QA-1 del backend sin esta decisión.
- **La migración de NC-04** que desactiva «Hueco en calzada» puede ir sola o junto con esta.
- No bloquea DEP-08, DEP-12 ni el rediseño. El frontend muestra los nombres tal como llegan del API.

## Decisión (2026-10-22)

El usuario aprobó la **opción A**: una migración nueva (la siguiente versión libre) que corrige nombres y descripciones de las categorías estándar sin editar V3. Va en la tarea QA-1 del backend. La desactivación de «Hueco en calzada» queda para la migración de NC-04, salvo que convenga juntarlas.
