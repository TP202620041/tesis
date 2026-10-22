# Integración continua

`.github/workflows/ci.yml` (DEP-07) corre en cada PR a `develop` o `main`, en cada push a esas ramas (los merges) y a mano (Actions → CI → *Run workflow*). No usa secretos y el token solo lee el repositorio.

## Qué corre

| Job | Cuándo | Qué hace |
|---|---|---|
| `cambios` | Siempre | Con `dorny/paths-filter`, decide qué carpetas cambiaron: `backend/**`, `frontend/**` o el propio workflow, que cuenta para las dos. Un push a `main` y una corrida manual validan todo. |
| `backend` | Si cambió `backend/` | Levanta PostGIS `16-3.4` como servicio, con la base `viasegura_test` y el usuario y la clave `viasegura`, y espera a `pg_isready`. Instala JDK 21 Temurin con caché de Maven y corre `mvn -B -ntp clean verify` (Surefire, Failsafe y JaCoCo). Después **falla si `completed` de `failsafe-summary.xml` es 0, si hay `errors` o `failures`, o si Surefire no corrió nada**: un `BUILD SUCCESS` sin tests no basta. Sube el informe JaCoCo como artefacto `jacoco-backend` y, si algo falló, los informes de Surefire y Failsafe (`informes-tests-backend`). |
| `frontend` | Si cambió `frontend/` | Usa el Node de `frontend/.nvmrc` o, mientras no exista, Node 24. Corre `npm ci` y luego `npm run lint`, `npm run typecheck`, `npm test` (con la guarda `scripts/verificar-tests.mjs`), el conteo de avisos de capas y `npm run build` con `NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid`. Los cuatro chequeos corren aunque falle uno, así una corrida muestra todos los errores. |
| `ci` | Siempre (`if: always()`) | Junta los resultados y falla si `cambios` falló, si un job cuya carpeta cambió no terminó en `success` (falló, se canceló o se omitió) o si uno que no aplicaba no quedó `skipped`. |

Lo que la CI **no** hace: no compara con la línea base. Ningún archivo la guarda, así que comparar las cifras con el plan y el CHANGELOG sigue siendo trabajo de `/verificar` y del PR. Tampoco despliega ni cambia las guardas: ArchUnit y ESLint de capas corren dentro de `mvn verify` y `npm run lint` tal como están.

## Cómo leer el resumen

En la corrida, la pestaña **Summary** muestra tres tablas:

- **Backend**: `completed` de Failsafe (con errors, failures y skipped), el total de Surefire, la cobertura de líneas y ramas de JaCoCo y las violaciones congeladas de ArchUnit (`contar-archunit.mjs`). El informe completo está en el artefacto `jacoco-backend`, en `index.html`.
- **Frontend**: el resultado de cada paso y la línea de la guarda, **«N tests en M archivos»**, más los avisos de capas (`contar-capas.mjs`, informativo).
- **CI**: qué jobs aplicaban y cómo terminaron.

Son las mismas cifras de la tabla «Cifras» del CHANGELOG. Un `completed` o un total de tests que baja sin explicación en el PR es un hallazgo, aunque todo esté en verde.

## Protección de `develop` y `main`

Exige **un solo check: `ci`**, en Settings → Branches → la regla de cada rama → *Require status checks to pass before merging*.

- No exijas `backend` ni `frontend`: un job omitido cuenta como éxito, pero si `cambios` falla los dos quedan omitidos. `ci` cubre ese caso.
- GitHub solo ofrece en el buscador un check que corrió en el repositorio en los últimos 7 días. Configúralo después de que corra el PR de DEP-07.
- *Require branches to be up to date before merging* es opcional. Obliga a actualizar la rama y a volver a correr la CI cada vez que `develop` avanza.
- La concurrencia se agrupa por número de PR, no por rama, así que los dos PR de un `release/*` (a `main` y a `develop`) no se cancelan entre sí.
- **PR apilados:** la CI solo corre en PR cuya base es `develop` o `main`. Si reapuntas a `develop` un PR que apuntaba a otra rama, GitHub no la dispara, porque cambiar la base no es un evento que el workflow escuche. El check `ci` queda «Expected» hasta que empujes un commit o cierres y reabras el PR.

## Reproducir localmente

Lo mismo que la CI, en tu máquina (entorno de `CLAUDE.md`):

```bash
# backend/ (Windows: base en 5433; macOS: 5432 con TEST_DB_URL)
POSTGRES_PORT=5433 docker compose up -d
mvn -B -ntp clean verify
cat target/failsafe-reports/failsafe-summary.xml        # completed > 0, errors y failures en 0
node ../.claude/skills/verificar/contar-archunit.mjs

# frontend/
npm ci && npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid npm run build
```

Si algo pasa en tu máquina y falla en la CI, repítelo en Linux, que es como corre el runner (UTC, el sistema de archivos distingue mayúsculas y los finales de línea son LF), con contenedores aislados. Así no tocas `viasegura-db` ni el puerto 3025 del host:

```bash
git -c core.autocrlf=false archive --format=tar -o /tmp/src.tar HEAD backend frontend .claude/skills/verificar
docker network create ci-local
docker run -d --name ci-local-db --network ci-local -e POSTGRES_DB=viasegura_test \
  -e POSTGRES_USER=viasegura -e POSTGRES_PASSWORD=viasegura postgis/postgis:16-3.4
docker run --rm --network ci-local -v /tmp/src.tar:/src.tar:ro -v ci-m2:/root/.m2 \
  -e TEST_DB_URL=jdbc:postgresql://ci-local-db:5432/viasegura_test maven:3.9-eclipse-temurin-21 \
  bash -c 'mkdir /w && tar -xf /src.tar -C /w && cd /w/backend && mvn -B -ntp clean verify'
docker run --rm -v /tmp/src.tar:/src.tar:ro node:24-bookworm \
  bash -c 'mkdir /w && tar -xf /src.tar -C /w && cd /w/frontend && npm ci && npm run lint && npm run typecheck && npm test && NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid npm run build'
docker rm -f ci-local-db && docker network rm ci-local
```

En Git Bash de Windows, antepón `MSYS_NO_PATHCONV=1` a los `docker run` y usa una ruta `C:/…` en lugar de `/tmp`.

**Tiempos de referencia** (21/10, esos contenedores en la máquina de desarrollo; el runner puede tardar algo más):

| Job | Medido |
|---|---|
| Backend | `mvn clean verify` en 2 min 34 s con la caché de Maven vacía y en 1 min 22 s con caché: 309 IT y 62 de Surefire, dos corridas en verde |
| Frontend | `npm ci` 29 s, lint 8 s, typecheck 5 s, tests 78 s (646 en 83 archivos), build 11 s |

## Para mantener

- **Node**: cuando exista `frontend/.nvmrc` (DEP-06), el job lo usa solo. Debe cumplir `jsdom` 30 (`^22.22.2 || ^24.15.0 || >=26`) y Next 16 (`>=20.9`).
- **Acciones**: cada una fijada a su versión mayor (`checkout@v7`, `setup-java@v6`, `setup-node@v7`, `upload-artifact@v7`, `paths-filter@v4`). Para subir una mayor, lee sus notas de versión.
- **Runner**: `ubuntu-24.04`, fijado para que un cambio de `ubuntu-latest` no rompa la CI sin aviso. Usa el `mvn` preinstalado, porque el backend no tiene `mvnw`.
- **Filtros**: una carpeta nueva con código (p. ej. `inferencia/`, NC-03) necesita su filtro en `cambios`, su job y su línea en `ci`.
