# Integración continua

`.github/workflows/ci.yml` (DEP-07) corre en cada PR a `develop` o `main`, en cada push a esas ramas (los merges) y a mano (Actions → CI → *Run workflow*). No usa secretos y el token solo lee el repositorio.

## Qué corre

| Job | Cuándo | Qué hace |
|---|---|---|
| `cambios` | Siempre | Con `dorny/paths-filter`, decide qué carpetas cambiaron. `backend/**` y `frontend/**` cuentan cada una para su job. El workflow, sus scripts (`.github/scripts/**`) y los contadores de `/verificar` (`.claude/skills/verificar/**`) cuentan para los dos. Un push a `main` y una corrida manual validan todo. |
| `backend` | Si cambió `backend/` | Levanta PostGIS `16-3.4` como servicio, con la base `viasegura_test` y el usuario y la clave `viasegura`, y espera a que `pg_isready` responda por TCP. Levanta también **Adobe S3Mock** (`adobe/s3mock:5.2.3`, puerto 9090) y define `FOTOS_S3_TEST_ENDPOINT`, para que `S3FotoStorageServiceIT` pruebe el adaptador de fotos en R2 (DEP-12). Instala JDK 21 Temurin con caché de Maven y corre `mvn -B -ntp clean verify` (Surefire, Failsafe y JaCoCo). Después corre la **guarda de completitud** (`.github/scripts/verificar-backend.mjs`), porque un `BUILD SUCCESS` sin tests no basta. Sube el informe JaCoCo como artefacto `jacoco-backend` y, si algo falló, los informes de Surefire y Failsafe (`informes-tests-backend`). |
| `frontend` | Si cambió `frontend/` | Usa el Node de `frontend/.nvmrc` o, mientras no exista, Node 24. Corre `npm ci` y luego `npm run lint`, `npm run typecheck`, `npm test` (con la guarda `scripts/verificar-tests.mjs`), el conteo de avisos de capas y `npm run build` con `NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid`. Los cuatro chequeos corren aunque falle uno, así una corrida muestra todos los errores. |
| `ci` | Siempre (`if: always()`) | Junta los resultados y falla si `cambios` falló, si un job cuya carpeta cambió no terminó en `success` (falló, se canceló o se omitió) o si uno que no aplicaba no quedó `skipped`. |

**La guarda de completitud del backend** falla cuando:

- una clase `*IT` (o `*ITCase`) no abstracta no tiene su `target/failsafe-reports/TEST-<clase>.xml`;
- una clase `*Test` (o `*Tests`, `*TestCase`) no abstracta no tiene su informe en `surefire-reports`;
- Failsafe o Surefire tienen `errors` o `failures`;
- los tests ejecutados (`completed - skipped`, así que una suite toda en `@Disabled` no pasa) son 0 o quedan por debajo de los mínimos `MIN_IT_FAILSAFE` y `MIN_SUREFIRE` del job.

Una clase con todos sus tests omitidos deja solo un aviso, salvo las listadas en `CLASES_OBLIGATORIAS` (hoy `S3FotoStorageServiceIT`): si quedan omitidas o sin informe, la guarda falla. Así, si desaparecen el servicio `s3mock` o la variable, el check se pone en rojo en vez de omitir en silencio la única prueba automática del adaptador que va a producción. Las abstractas, como `AbstractPostgisIT` y `AbstractPostgisMailIT`, no se exigen.

**Línea base.** La CI exige los mínimos declarados en `ci.yml`, no la línea base exacta del plan y del CHANGELOG. Hay cosas que siguen siendo trabajo de `/verificar` y del PR:

- comparar contra esa línea base, por ejemplo un `completed` **igual** en las tareas ARQ;
- revisar que los avisos de capas no suban.

Tampoco despliega ni cambia las guardas: ArchUnit y ESLint de capas corren dentro de `mvn verify` y `npm run lint` tal como están.

## Cómo leer el resumen

En la corrida, la pestaña **Summary** muestra tres tablas:

- **Backend**:
  - `completed` de Failsafe y el total de Surefire, cada uno con los ejecutados, el mínimo, errors, failures, skipped y las clases con informe sobre las esperadas;
  - la cobertura de líneas y ramas de JaCoCo;
  - las violaciones congeladas de ArchUnit (`contar-archunit.mjs`);
  - debajo, los avisos y errores de la guarda.

  El informe completo de JaCoCo está en el artefacto `jacoco-backend`, en `index.html`.
- **Frontend**: el resultado de cada paso y la línea de la guarda, **«N tests en M archivos»**, más los avisos de capas (`contar-capas.mjs`, informativo).
- **CI**: qué jobs aplicaban y cómo terminaron.

Son las mismas cifras de la tabla «Cifras» del CHANGELOG. Si un total de tests baja sin explicación en el PR, es un hallazgo aunque siga por encima del mínimo y todo esté en verde.

## Protección de `develop` y `main`

Exige **un solo check: `ci`**, en Settings → Branches → la regla de cada rama → *Require status checks to pass before merging*.

- No exijas `backend` ni `frontend`: un job omitido cuenta como éxito, pero si `cambios` falla los dos quedan omitidos. `ci` cubre ese caso.
- GitHub solo ofrece en el buscador un check que corrió en el repositorio en los últimos 7 días.
- *Require branches to be up to date before merging* es opcional. Obliga a actualizar la rama y a volver a correr la CI cada vez que `develop` avanza.
- La concurrencia se agrupa por número de PR, no por rama, así que los dos PR de un `release/*` (a `main` y a `develop`) no se cancelan entre sí.
- **PR apilados:** la CI solo corre en PR cuya base es `develop` o `main`. Si reapuntas a `develop` un PR que apuntaba a otra rama, GitHub no la dispara, porque cambiar la base no es un evento que el workflow escuche. El check `ci` queda «Expected» hasta que empujes un commit o cierres y reabras el PR.

## Reproducir localmente

Lo mismo que la CI, en tu máquina (entorno de `CLAUDE.md`):

```bash
# backend/ (Windows: base en 5433; macOS: 5432 con TEST_DB_URL)
POSTGRES_PORT=5433 docker compose up -d --wait          # --wait espera el healthcheck (pg_isready)
mvn -B -ntp clean verify
MIN_IT_FAILSAFE=309 MIN_SUREFIRE=62 node ../.github/scripts/verificar-backend.mjs   # la misma guarda

# frontend/
npm ci && npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid npm run build
```

Si algo pasa en tu máquina y falla en la CI, repítelo en Linux con contenedores aislados. Así corre el runner: en UTC, con un sistema de archivos que distingue mayúsculas y con finales de línea LF. Los contenedores no tocan `viasegura-db` ni el puerto 3025 del host:

```bash
git -c core.autocrlf=false archive --format=tar -o /tmp/src.tar HEAD backend frontend .claude/skills/verificar .github/scripts
docker network create ci-local
docker run -d --name ci-local-db --network ci-local -e POSTGRES_DB=viasegura_test \
  -e POSTGRES_USER=viasegura -e POSTGRES_PASSWORD=viasegura postgis/postgis:16-3.4
until docker exec ci-local-db pg_isready -h localhost -U viasegura -d viasegura_test; do sleep 2; done
docker run --rm --network ci-local -v /tmp/src.tar:/src.tar:ro -v ci-m2:/root/.m2 \
  -e TEST_DB_URL=jdbc:postgresql://ci-local-db:5432/viasegura_test maven:3.9-eclipse-temurin-21 \
  bash -c 'mkdir /w && tar -xf /src.tar -C /w && cd /w/backend && mvn -B -ntp clean verify'
docker run --rm -v /tmp/src.tar:/src.tar:ro node:24-bookworm \
  bash -c 'mkdir /w && tar -xf /src.tar -C /w && cd /w/frontend && npm ci && npm run lint && npm run typecheck && npm test && NEXT_PUBLIC_API_BASE_URL=https://api.example.invalid npm run build'
docker rm -f ci-local-db && docker network rm ci-local
```

En Git Bash de Windows, antepón `MSYS_NO_PATHCONV=1` a los `docker run` y usa una ruta `C:/…` en lugar de `/tmp`. `pg_isready` va con `-h localhost` porque, mientras se inicializa, la imagen levanta un servidor temporal solo en el socket local, y sin `-h` lo daría por listo antes del reinicio.

**Tiempos de referencia** (21/10, esos contenedores en la máquina de desarrollo; el runner puede tardar algo más):

| Job | Medido |
|---|---|
| Backend | `mvn clean verify`: 2 min 34 s con la caché de Maven vacía y 1 min 22 s con caché. 309 IT y 62 de Surefire, dos corridas en verde |
| Frontend | `npm ci` 29 s, lint 8 s, typecheck 5 s, tests 78 s (646 en 83 archivos), build 11 s |

## Para mantener

- **Mínimos de tests**: `MIN_IT_FAILSAFE` y `MIN_SUREFIRE`, en el `env` del job `backend`.
  - Se suben al cerrar cada versión con las cifras del CHANGELOG (hoy 309 y 62, las de v0.6.0).
  - Solo se bajan en el PR que quita tests, y ese PR explica por qué.
- **Node**: cuando exista `frontend/.nvmrc` (DEP-06), el job lo usa solo. Debe cumplir `jsdom` 30 (`^22.22.2 || ^24.15.0 || >=26`) y Next 16 (`>=20.9`).
- **Acciones**:
  - Las de GitHub (`actions/checkout@v7`, `setup-java@v6`, `setup-node@v7` y `upload-artifact@v7`) van **por versión mayor**: su mantenedor mueve la etiqueta dentro de esa mayor, así que no están fijadas.
  - `dorny/paths-filter`, de un tercero, sí está **fijada a un SHA** con su versión en un comentario (`# v4.0.3`).
  - `.github/dependabot.yml` propone las actualizaciones cada lunes, en un solo PR a `develop`. Para aceptar una mayor nueva, lee sus notas de versión.
- **Runner**: `ubuntu-24.04`, fijado para que un cambio de `ubuntu-latest` no rompa la CI sin aviso. Usa el `mvn` preinstalado, porque el backend no tiene `mvnw`.
- **Filtros**: una carpeta nueva con código (p. ej. `inferencia/`, NC-03) necesita su filtro en `cambios`, su job y su línea en `ci`.

## Pendiente

- **Job `imagen`** (`docker build backend/`): se agrega cuando el Dockerfile de DEP-03 esté en `develop`.
  - Corre si cambió `backend/`.
  - Construye la imagen sin publicarla, para que un cambio que rompe el Dockerfile se vea en el PR.
  - Entra en `needs` y en la revisión del job `ci`.
