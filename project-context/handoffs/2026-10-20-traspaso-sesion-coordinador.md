# Traspaso de sesión del coordinador (2026-10-20)

- **De:** sesión coordinadora (raíz) del 20/10, con dos sesiones de agente: backend (`tesis-60`) y frontend (`tesis-77`).
- **Para:** la próxima sesión coordinadora y los próximos agentes de backend y frontend.
- **Estado:** abierto. Leer antes de retomar el Sprint 5.

## 1. Dónde quedó el proyecto

- **v0.5.0 publicada** (tag en `main`, Sprint 4 cerrado). Ver `CHANGELOG.md`.
- **Marca:** el sistema ahora se llama **Ciudad Viva** (antes ViaSegura). Solo cambió la marca visible (PRs #62, #63, #65, #66). Los identificadores técnicos `viasegura` (paquete Java, BD, contenedores, variables, claves de `localStorage`/IndexedDB y el dominio `viasegura.pe`) **se conservan a propósito**: no renombrarlos.
- **Términos:** nueva §10 «Responsabilidad sobre las fotografías» (#64 y #67). La versión sigue en `2026-10-v1` (decisión del usuario: es borrador).
- **Sprint 5, en curso (v0.6.0):**

| Tarea | Estado |
|---|---|
| FE-07 URLs de fotos | Fusionada (#69). También corrigió la CSP `img-src`, que bloqueaba las fotos de reportes. |
| FE-08 | Fusionada (#71), sin cambios de código |
| Build de producción (esbuild para serwist) | Fusionado (#72) |
| NC-01 municipalidades + periodo | Fusionada (#70). Parcial a propósito: ver §3 |
| US-19 comparar distritos | Fusionada (#73) con criterios provisionales (#68) |
| **NC-02 backend** | **En curso**: PR #74 en borrador (WIP, commit `c76e8dd`), rama `feature/nc-02-titulo-severidad-periodo`, worktree `../tesis-nc02` |
| **NC-02 frontend** | **Pendiente**: arranca cuando el backend esté en `develop` con su handoff |

## 2. Qué sigue, en orden

1. **Terminar NC-02 backend** sobre el PR #74 (borrador). Estado al cierre:
   - **Hecho sin verificar:** entidad (titulo, severidad, periodoGestion); POST y PATCH con la idempotencia resuelta antes de validar; los 3 DTO; fixtures de 22 IT, más `TituloSeveridadPeriodoIT`, 2 IT de idempotencia y `ReporteTituloTest`; el handoff `handoffs/2026-10-20-titulo-severidad-reporte.md`; la propuesta de columnas aceptada (opción A) y NC-01 marcada en el plan.
   - **Bloqueante:** `V17` tiene un error SQL en el `UPDATE` de titulo («invalid reference to FROM-clause entry for table r»). Nunca se aplicó en ninguna BD. Como V17 solo existe en esta rama, **se puede reescribir** (no es una migración aplicada); la guardia la trata como existente, así que lo hace el usuario o el coordinador. El PR trae el `UPDATE` corregido para recrearla.
   - **Falta:** recrear V17, `mvn clean verify` (completed ≥ 295, ArchUnit 0), sección NC-02 del README, `/revisar`, hash y número de PR en el handoff, y sacar el PR de borrador.

   Decisiones del usuario (20/10):
   - `severidad`: enum `BAJA < MEDIA < ALTA` (etiquetas Baja/Media/Alta). Obligatoria al crear, la fija el **ciudadano**, es **pública** (va en el resumen y en los detalles) y se edita en PENDIENTE (US-08). El funcionario no la cambia.
   - `titulo`: obligatorio, de 5 a 120 caracteres tras trim, editable en PENDIENTE. La migración rellena los existentes con «&lt;categoría&gt; en &lt;distrito&gt;» y luego pone NOT NULL. Severidad de los existentes: MEDIA.
   - `periodo_gestion_id`: `MunicipalidadService#periodoVigente(created_at)` al crear; la migración rellena por `created_at`; nulo fuera de todo periodo.
   - **Requisito de idempotencia:** una `Idempotency-Key` ya registrada devuelve la respuesta original **antes** de validar `titulo` y `severidad`, porque la cola offline reenvía reportes que ya llegaron al backend viejo. Por eso no deben ser `@RequestParam(required = true)` en el controller: se validan en el servicio después de buscar la clave. Con IT de los dos caminos.
   - En la misma rama: marcar **aceptada (opción A)** la propuesta `decisions/propuestas/2026-10-20-columnas-gestion-y-requisitos.md` y NC-01 como hecha en el plan.
   - `/contrato` con el handoff para el frontend, que explique que el frontend actual da 400 al crear reportes hasta que salga su parte.
2. **NC-02 frontend** (agente de frontend). Plan de la cola offline ya acordado:
   - estado nuevo «incompleto» para los reportes en cola sin `titulo`/`severidad`, que no se reenvía solo ni se purga;
   - el ciudadano lo completa en «Pendiente de envío»: título sugerido pero exigido, severidad sin valor por defecto;
   - `completar(clave)` en una transacción y con la **misma** `Idempotency-Key`, sin migrar IndexedDB;
   - además: campos en el formulario de reporte y en la edición en PENDIENTE, y mostrarlos en el mapa, el detalle y mis reportes;
   - tests: un ítem incompleto nunca se envía sin completar, y después de completarlo usa la misma clave.
3. **Release v0.6.0**, como v0.5.0: worktree `release/v0.6.0`, versión en `pom.xml` y `package.json`, `CHANGELOG.md`, registro del S5 en `plan-sprints.md`, PRs a `main` y a `develop` con merge commit, y tag anotado en `main`. Antes, regenerar los diagramas con la skill `/diagramas` (NC-01 agregó un módulo y tablas) y correr la verificación en vivo.
4. **Probar la PWA en el teléfono** (pedido del usuario). Hace falta HTTPS para el GPS, el service worker, la instalación y el push.
   - Opción recomendada: túnel HTTPS (`cloudflared` sin cuenta, o ngrok) hacia la build de producción (`npm run build && npm start`).
   - Hay que ajustar `NEXT_PUBLIC_API_BASE_URL`, `CORS_ALLOWED_ORIGINS` y la CSP (`connect-src` e `img-src`) con la URL pública.
   - En iPhone, el push solo funciona con la PWA instalada («Agregar a inicio») y con iOS 16.4 o posterior.
   - Alternativa para una URL estable (jurado): Railway (backend + PostGIS) y Vercel (PWA).
   - El usuario aún no eligió; preguntarle.

## 3. Decisiones abiertas (las toma el usuario)

- **D-10:** jurisdicción del funcionario (`distrito_id` o `municipalidad_id`). Con D-09 son equivalentes 1:1. No bloqueó el S5; hay que decidirla antes del S6.
- **Columnas de GESTION_MUNICIPAL y REQUISITO_RECEPCION** (OB2 §5, que no está en el repo): el usuario debe pegarlas. Se crean con NC-06 y NC-05 (opción A, aceptada).
- **Gherkin original de US-19:** si aparece, reemplaza los criterios provisionales de `backlog/product_backlog.md`.
- **Fórmulas de los KPIs** (S6) y **clases del modelo** (S7): siguen pendientes según `plan-sprints.md`.
- **Revisión legal** del borrador de términos (los `[COMPLETAR]`, y si la exclusión de la §10 es válida en Perú).

## 4. Entorno de esta máquina (macOS) — distinto de lo que dice `CLAUDE.md` raíz

- **JDK 21:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` antes de `mvn`. El Java por defecto es el 24, y con él Lombok no compila. No se fijó en `~/.zshrc`.
- **PostgreSQL en el puerto 5432**, no en 5433. Los IT necesitan `TEST_DB_URL=jdbc:postgresql://localhost:5432/viasegura_test` porque `AbstractPostgisIT` usa 5433 por defecto.
- `CLAUDE.md` raíz todavía menciona JAVA_HOME de Windows, el puerto 5433, «push es stub» y Vitest «en este Windows». Corregirlo en un PR `DOC:` (tarea del coordinador; la guardia lo bloquea para los agentes).
- Backend para la PWA: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001 mvn spring-boot:run`.
- **Playwright** 1.64.1 global (`npm i -g`) con Chromium. El usuario quiere las pruebas E2E en **modo `--headed`** (navegador visible, `slowMo` ~300). No agregarlo al `package.json`.
- **Datos de prueba:** `backend/scripts/seed-datos-prueba.sql` (instrucciones en su cabecera). Usuarios `*@viasegura.test` con contraseña `Prueba123!`: `ciudadano1..8`, `func.{miraflores,surco,sjl,ate,lima,comas}` y `admin`. En la BD de dev también quedan reportes E2E (168–171) y una cuenta `e2e.terminos+…@viasegura.test`.

## 5. Forma de trabajo acordada con el usuario

- **El coordinador fusiona los PRs** (autorización del usuario del 20/10), con su cuenta `CodyLionVivo`: `gh pr merge --merge` (merge commit, nunca squash ni rebase) y después borrar la rama. Solo PRs verificados (`/verificar`) y revisados (`/revisar`). Nunca push directo a `main` ni a `develop`.
- **Un worktree por tarea**, con el cwd de la sesión del agente **dentro** del worktree. Si no, `guardia.mjs` evalúa la rama del checkout principal (`develop`) y bloquea el commit. No esquivar la guardia.
- Commits en español, titulados por ID y **sin `Co-Authored-By`**.
- El clasificador de permisos de Claude Code bloqueó editar `settings.local.json` y un `git status` después de un merge. El usuario puede agregar las reglas con `/permissions` (`Bash(gh pr merge:*)`, `Bash(git status:*)`, …).
