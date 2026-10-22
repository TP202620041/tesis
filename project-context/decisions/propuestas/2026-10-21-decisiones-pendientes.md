# Decisiones pendientes del usuario (índice al 21/10/2026)

- **Tipo:** **índice**, no una propuesta. No se acepta ni se rechaza en bloque: cada decisión vive en su propuesta de origen o en el plan, y aquí solo se lista con su urgencia y un enlace.
- **Fecha:** 2026-10-21
- **Origen:** subagente arquitecto, encargo ARQ-1
- **Mantenimiento:** cuando el usuario decide un punto, la sesión de raíz lo registra donde corresponde (D-xx en ARCHITECTURE.md, el plan o la propuesta de origen) y aquí lo marca como decidido, con la fecha y el lugar del registro.

Reúne **todo** lo que hoy espera una decisión del usuario, venga de esta ronda (despliegue, correo, fotos, ML, §4.3) o de antes (D-10, KPIs, OB2, US-19, legal). Cada fila dice qué bloquea, la recomendación y la urgencia:

- **Alta:** bloquea v0.7.0 (MVP desplegado) o la apertura a usuarios reales.
- **Media:** bloquea el siguiente sprint funcional (NC-05, NC-06, NC-03).
- **Baja:** antes de v1.0 o solo documental.

## Decididas el 21/10/2026

| # | Decisión | Qué se decidió | Dónde quedó registrada |
|---|---|---|---|
| 2 | Proveedor de correo | **Resend** (exige dominio verificado: la decisión 3 pasa a ser requisito del correo en producción) | `2026-10-21-correo-saliente-http.md`, «Decisión» |
| 4 | Hosting | **Railway + Vercel**, fotos en **R2** (plan y gasto mensual aún por confirmar) | `2026-10-21-despliegue-mvp.md`, «Decisión» |
| 7 (parte) | Transcripción de Zoom en el repo | Se quita de las ramas (PR #88); el historial no se reescribe | PR #88 |
| 8 | Fotos | R2 privado, mismas URLs, sin EXIF; diseño de la propuesta | `2026-10-21-fotos-r2.md`, «Decisión» |
| 10 | CI obligatoria | Check `ci` exigido en `develop` y `main` desde el 21/10 | `WORKFLOW.md` §5, `docs/ci.md` |
| 14 | Modelo de detección | Clases `bache` y `grieta`, RF-DETR Apache-2.0, umbral 0,50, desactivar «Hueco en calzada» | `2026-10-21-ml-clases-modelo.md`, «Decisión» |
| 17 | Dirección visual | **A · Cívica** (tinta azul marino y blanco, Public Sans, foco amarillo; deja el celeste) | Canvas «Rediseño Ciudad Viva» y la propuesta de diseño |

## Resumen

| # | Decisión | Urgencia | Bloquea | Recomendación corta | Detalle |
|---|---|---|---|---|---|
| 1 | Versionado: v0.7.0 = MVP desplegado | Alta | Planificar el próximo sprint | Sí; S6..S8 pasan a v0.8.0, v0.9.0 y v1.0.0 | §1 |
| 2 | Proveedor de correo y remitente | Alta | DEP-08 → US-03, US-16 (correo), US-25 en producción | Brevo; remitente propio si hay dominio | §2 |
| 3 | Dominio propio: sí o no, y cuándo | Alta | Invitar usuarios reales (push, sesión y cola offline dependen del origen) | Decidirlo antes de invitar a nadie; si se compra, DNS en Cloudflare | §3 |
| 4 | Plan de Railway, respaldos y gasto aceptado | Alta | Crear el proyecto (runbook §1) | Hobby + cron `pg_dump` a R2; ~US$ 10/mes | §4 |
| 5 | Primer ADMIN y funcionarios de la demo | Alta | DEP-04, DEP-05 | Una cuenta del equipo como ADMIN; funcionarios solo con permiso de su titular | §5 |
| 6 | Datos de demostración en producción | Alta | Mostrar el sistema al jurado | No sembrar datos falsos en producción | §6 |
| 7 | Legal: `[COMPLETAR]`, titular, ANPD, edad, transcripción en el repo | Alta | Abrir a usuarios reales | Completar y registrar antes de abrir | §7 |
| 8 | Fotos: recodificar a JPEG, dos buckets y ajuste a D-08 | Alta | DEP-12 (y NC-04 por D-08) | Sí (opción A de la propuesta de fotos) | §8 |
| 9 | Previews de Vercel y Swagger en producción | Baja | Nada grave | Previews apagadas; Swagger apagado salvo variable | §9 |
| 10 | CI como chequeo obligatorio de los PR | Media | Protección de ramas | Sí, cuando DEP-07 esté verde una semana | §10 |
| 11 | D-10: jurisdicción del funcionario | Media | NC-05, NC-06; el script DEP-05 | `municipalidad_id` con NC-06 (o confirmar `distrito_id`) | §11 |
| 12 | Fórmulas de los KPIs por periodo | Media | NC-06 | Que el usuario las pegue del OB2 | §12 |
| 13 | Columnas de GESTION_MUNICIPAL y REQUISITO_RECEPCION | Media | NC-05, NC-06 | Que el usuario las pegue del OB2 §5 | §13 |
| 19 | Migración que corrige las tildes de las categorías estándar (**aprobada el 22/10**: opción A, en QA-1 backend) | Baja | QA-1 M-1 (parte de datos); puede ir con la de NC-04 que desactiva «Hueco en calzada» | Sí, una migración nueva sin editar V3 (opción A) | `2026-10-22-tildes-categorias-estandar.md` |
| 14 | Clases del modelo, pesos, umbral, «Hueco en calzada» | Media | NC-03 (NC-04 avanza con adaptador falso) | `bache` + `grieta`, RF-DETR N (Apache-2.0), 0,50, desactivar «Hueco en calzada» | §14 |
| 15 | Gherkin original de US-19 | Baja | Nada (rigen los criterios provisionales) | Pegarlo si aparece | §15 |
| 16 | Dependencias de §4.3 | Baja | Cierre de BE-08 | Actualizar §4.3 (opción C) | §16 |
| 17 | Dirección visual del rediseño | Baja | S8; los iconos de DEP-06 son provisionales | Definirla antes del S8 | §17 |
| 18 | Límite de tasa (abuso) | Media | Nada para v0.7.0 | Tope por cuenta en DEP-08; limitador general después | §18 |

## 1. Versionado

- **Qué:** si la próxima versión, v0.7.0, es el «MVP desplegado» (DEP-01..DEP-12) en vez del S6 del plan (NC-05, NC-06, BE-08, FE-09).
- **Por qué ahora:** S6 está bloqueado por decisiones del OB2 (§12 y §13) y el despliegue no depende de ellas. Un despliegue es una entrega con su propia aceptación (prueba de humo, DEP-10).
- **Recomendación:** sí. **v0.7.0 = MVP desplegado**; S6 → v0.8.0, S7 → v0.9.0, S8 → v1.0.0. La sesión de raíz actualiza `plan-sprints.md`.

## 2. Correo (proveedor y remitente)

- **Opciones:** Brevo (300/día, datos en la UE, funciona sin dominio con el remitente reescrito y un sello en el plan Free) o Resend (100/día, datos en EE. UU., exige dominio propio).
- **Recomendación:** **Brevo** en cualquier caso, con remitente propio si hay dominio. Desactivar en Brevo el bloqueo de IP desconocidas: Railway Hobby no tiene IP de salida fija. Detalle y fuentes: `2026-10-21-correo-saliente-http.md`.
- **Bloquea:** DEP-08.

## 3. Dominio propio

- **Opciones:** quedarse en `*.vercel.app` y `*.up.railway.app`, o comprar un dominio (`app.<dominio>`, `api.<dominio>`, remitente y, más adelante, la CDN de fotos).
- **Lo que decide:** el origen de la PWA. Push, la sesión (`localStorage`) y la cola offline (IndexedDB) son por origen: mudarse después obliga a cada usuario a reinstalar, volver a entrar y volver a suscribirse, y pierde lo que tenía en cola.
- **Recomendación:** decidirlo **antes de invitar usuarios reales**. Si se compra, poner el DNS en Cloudflare (lo exige R2 para dominios propios). No usar `viasegura.pe` mientras no conste que es del proyecto. Detalle: `2026-10-21-despliegue-mvp.md`, «Dominio propio».

## 4. Railway: plan, respaldos y gasto

- **Opciones:** Hobby (US$ 5/mes con US$ 5 de uso incluidos; estimado total ~US$ 9–10) o Pro (US$ 20/mes; SMTP permitido, IP fija y, según la comunidad, respaldos de volumen: NO VERIFICADO).
- **Recomendación:** **Hobby**, con el servicio cron `respaldo-bd` (`pg_dump` diario a un bucket R2 separado, 30 días de retención) y una prueba de restauración mensual. Aceptar el gasto de ~US$ 10/mes (más ~US$ 5–10 cuando exista el servicio de inferencia).

## 5. Primer ADMIN y funcionarios

- **Qué:** el correo de la cuenta que será ADMIN (DEP-04: se registra normalmente y una variable la promueve) y la lista de funcionarios con su distrito para la demostración (DEP-05).
- **Recomendación:** el ADMIN es una cuenta del equipo. Un funcionario solo se crea con el acuerdo de la persona y, si representa a una municipalidad real, con la autorización de esa municipalidad. Para la demo, cuentas del equipo marcadas como de prueba.

## 6. Datos de demostración en producción

- **Problema:** `backend/scripts/seed-datos-prueba.sql` inventa reportes en distritos reales. En producción falsearía el índice público de desempeño, que se presenta como transparencia.
- **Opciones:** (a) producción sin datos falsos, demo con reportes reales tomados por el equipo; (b) un segundo entorno de Railway («demo») con su propia base sembrada; (c) sembrar producción y borrarlo después.
- **Recomendación:** **(a)**, y **(b)** si el jurado necesita ver el índice con volumen (costo: otro `backend` y otro `postgis`, ~US$ 8/mes mientras exista). Nunca (c).

## 7. Legal (Ley N.° 29733 y DS 016-2024-JUS)

No es asesoría legal; es la lista para revisar con un asesor. Fuentes oficiales consultadas el 21/10/2026: el reglamento, DS 016-2024-JUS (publicado el 30/11/2024 y vigente desde el 31/03/2025; [PDF en gob.pe](https://cdn.www.gob.pe/uploads/document/file/7568330/6426760-decreto-supremo-n-016-2024-jus-reglamento-de-la-ley-n-29733-ley-de-proteccion-de-datos-personales-publicado-nov-2024.pdf)); el trámite [«Inscribir banco de datos»](https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales) (22/05/2026); y la Directiva del Oficial de Datos Personales, RD 100-2025-JUS/DGTAIPD (31/12/2025).

| Punto | Qué decidir o hacer | Urgencia |
|---|---|---|
| **Titular del banco de datos** | ¿Los estudiantes como personas naturales o la UPC? De eso dependen el aviso de privacidad, la inscripción y quién responde ante la ANPD. | Alta |
| **`[COMPLETAR]` de los términos** | Autores, titular, domicilio y correo de contacto; plazos de conservación (reportes, soporte); confirmar las 2 h de sesión. §4: proveedores reales y sus países (Railway y Resend en EE. UU., Vercel, Cloudflare, Brevo en la UE). Al publicar, cambiar `app.legal.version-terminos`: todos los usuarios vuelven a aceptar (D-12). | Alta |
| **Inscripción ante la ANPD** | Inscribir el banco de datos en el SIPDP (en línea, gratuita, aprobación automática) e incluir ahí el **flujo transfronterizo**, que es obligatorio comunicar (art. 21.2). No hay excepción académica (la única es el uso doméstico). Hacerlo antes de abrir a usuarios reales. | Alta |
| **Consentimiento para el alojamiento en el extranjero** | ¿Basta informarlo o hace falta consentimiento expreso? (arts. 13 y 18 del reglamento; art. 15 de la ley). | Alta |
| **Edad mínima** | De 14 a 17 años pueden consentir; los menores de 14 necesitan a sus padres (arts. 22 y 25). Agregar al registro una declaración de edad (≥ 14 o ≥ 18). Es un cambio de contrato (backend y PWA). | Alta |
| **Registros de acceso por 2 años** (art. 46), **documento de seguridad** (art. 47) | Confirmar si aplican a esta plataforma y cómo cumplirlos (los logs de Railway duran poco). | Media |
| **Incidentes** | Aviso a la ANPD y a los afectados en 48 h (art. 34). Designar quién lo hace (runbook §9). | Alta |
| **Fotos con personas o placas** | ¿Basta la §10 de los términos (responsabilidad del ciudadano) o se difumina? ¿Es válida la exclusión de responsabilidad de la §10 en Perú? | Media |
| **Transcripción de entrevista en el repo público** | La transcripción de una reunión de Zoom versionada en la raíz del repo (desde el primer commit) nombra a los participantes. Confirmar que tienen su consentimiento para publicarla; si no, sacarla del repo (y del historial, con cuidado: reescribir la historia exige coordinación y está fuera de lo que puede hacer un agente). | Alta |
| **Oficial de Datos Personales** | Probablemente no obligatorio (menos de 10.000 titulares y sin datos sensibles). Confirmar. | Baja |

## 8. Fotos (DEP-12)

- **Qué:** aprobar que las fotos se **recodifiquen a JPEG** (máx. 2048 px, calidad 0,85) para quitar todo metadato, en lugar de quitar el EXIF formato por formato, detrás de un puerto `common/port/SaneadorDeImagen`; usar **dos buckets** (reportes y perfiles) en lugar de uno; y el **ajuste a D-08**: la vista previa de NC-04 clasifica la foto pasada por el mismo saneado, para que vea lo mismo que la sugerencia oficial.
- **Recomendación:** sí a las tres. Detalle: `2026-10-21-fotos-r2.md`.

## 9. Previews de Vercel y Swagger en producción

- **Recomendación:** previews **apagadas** (preset «Only build production»): cada preview tiene otro origen que el CORS rechaza, y usaría la base de producción. Swagger **apagado** en producción, activable con `SPRINGDOC_HABILITADO=true` para una demostración.

## 10. CI obligatoria

- **Qué:** marcar los trabajos de DEP-07 como *required status checks* en la protección de `develop` y `main`.
- **Recomendación:** sí, después de una semana de corridas verdes, para no frenar el trabajo si la CI falla por motivos propios.

## 11. D-10: jurisdicción del funcionario

- **Opciones:** `usuario.distrito_id` (hoy) o `usuario.municipalidad_id`. Con D-09 son equivalentes 1:1.
- **Recomendación:** decidirla junto con NC-06. Si el dashboard por periodo y la confirmación (NC-05) se modelan por municipalidad, migrar a `municipalidad_id` en esa tarea; si no, confirmar `distrito_id` y cerrarla. El script `asignar-funcionario.sql` (DEP-05) sigue la decisión.
- **Bloquea:** NC-05 y NC-06 (S6, ahora v0.8.0).

## 12. Fórmulas de los KPIs (NC-06)

- **Qué:** las fórmulas del dashboard por periodo de gestión (tasa de resolución, tiempos, satisfacción, etc.), del OB2.
- **Recomendación:** que el usuario las pegue en el repo (por ejemplo en `project-context/backlog/`). Recordatorio: `null` ≠ 0 en las métricas, y un reporte cuenta en el periodo de su `fecha_creacion` (§4.3, paso 6).

## 13. Columnas de GESTION_MUNICIPAL y REQUISITO_RECEPCION

- **Qué:** sus columnas del OB2 §5, que no están en el repo (propuesta del 20/10, aceptada con la opción A: cada tabla nace con la tarea que la usa).
- **Bloquea:** NC-05 (REQUISITO_RECEPCION) y NC-06 (GESTION_MUNICIPAL).

## 14. Modelo de detección (NC-03)

- **Qué:** vocabulario de clases, pesos y licencia, umbral, «Hueco en calzada», si el funcionario ve la sugerencia, y si se entrenará con fotos de los ciudadanos.
- **Recomendación:** clases `bache` y `grieta`; pesos RF-DETR N entrenados en RDD2022 (Apache-2.0) y no YOLO de Ultralytics (AGPL); umbral 0,50 calibrado con fotos de Lima; desactivar «Hueco en calzada» antes de abrir; la sugerencia no se muestra a nadie en v1; no entrenar con fotos de ciudadanos sin un consentimiento nuevo. Detalle: `2026-10-21-ml-clases-modelo.md`.
- **Bloquea:** NC-03. NC-04 avanza ya con el adaptador falso (solo necesita el vocabulario de clases).

## 15. Gherkin original de US-19

- Rigen los criterios provisionales aprobados el 20/10 (`backlog/product_backlog.md`). Si aparece el Gherkin del PDF, se pega y se compara.

## 16. Dependencias de §4.3

- **Recomendación:** opción C de `2026-10-21-dependencias-4-3.md`: actualizar «Usa a» de `desempeno` y `notificaciones` a lo que el código hace (lecturas por el servicio de consulta), y que NC-05 y NC-06 limiten esas dependencias cuando rehagan las piezas. Cierra la parte de §4.3 de BE-08.

## 17. Dirección visual del rediseño (S8)

- **Qué:** sistema visual (tokens, tipografía, color) y el logo. Los iconos de la PWA de DEP-06 son provisionales hasta entonces.
- **Recomendación:** decidirla antes de empezar el S8.

## 18. Límite de tasa

- **Qué:** si v0.7.0 incluye un limitador general (login, registro, subida de fotos) o solo el tope de correos de recuperación por cuenta (DEP-08).
- **Recomendación:** solo el tope por cuenta en v0.7.0. Un limitador general después, o Cloudflare delante del API si hay dominio propio.
