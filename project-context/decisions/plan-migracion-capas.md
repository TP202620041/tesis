# Plan de migración a capas uniformes

> Norma: `ARCHITECTURE.md`. Este plan lleva el código actual a esa norma **sin cambiar comportamiento**: ninguna tarea toca el contrato del API ni la base de datos.
> Cómo se ejecuta cada tarea: `WORKFLOW.md` (`/tarea <ID>`, `/verificar`, `/revisar`).
> El backend y el frontend migran **en paralelo**, porque no comparten archivos. Cada tarea es un commit `ARQ BE-xx` o `ARQ FE-xx`.
> Creado el 2026-10-03. Marcar `[x]` y anotar la fecha al cerrar cada tarea.

## Definición de terminado (todas las tareas)

| Agente | Condición |
|---|---|
| Backend | `mvn clean verify` en verde. `completed` en `target/failsafe-reports/failsafe-summary.xml` **igual** al de la línea base (una tarea de arquitectura no agrega ni quita IT). `src/test/resources/archunit_store` **más chico o igual**. |
| Frontend | `npm run typecheck`, `npm test` (con su guarda) y `npm run lint` en verde. Avisos `capas/*` **menos o igual** que antes, salvo los de archivos que entran por primera vez a un bloque, listados en el PR (ARCHITECTURE.md §5.4). |

Los tests se **mueven** con el código que prueban; no se borran.

---

## Backend

### [x] BE-01 · Instalar la guarda y medir la línea base (2026-10-11)
**Prerrequisito de todo lo demás.**
1. Verificar que `pom.xml` tenga `archunit-junit5` 1.3.0 y que existan `src/test/java/pe/edu/upc/viasegura/arquitectura/ArquitecturaCapasTest.java` y `src/test/resources/archunit.properties`.
2. `mvn test -Dtest=ArquitecturaCapasTest`. El test **no se probó en compilación** (Maven Central estaba bloqueado en el entorno donde se escribió). Si no compila, corregir solo la API de ArchUnit y no relajar ninguna regla. Si una regla falla por “empty should”, revisar el patrón de paquetes.
3. La primera corrida crea `src/test/resources/archunit_store/`. Commitearlo.
4. Anotar aquí el número de violaciones congeladas por regla (líneas de cada archivo del almacén) y el `completed` de Failsafe de `mvn clean verify`.

**Aceptación:** el test pasa, el almacén está versionado y la línea base está anotada.
Línea base (almacén generado el 04/10 a las 00:44 y versionado en este commit; recontada el 11/10 con `contar-archunit.mjs` después de `mvn test -Dtest=ArquitecturaCapasTest`, que pasó con 9 reglas y dejó el almacén idéntico):
| Regla | Violaciones congeladas |
|---|---|
| Un módulo no usa controller, listener, repository ni infra de otro módulo | 51 |
| Los módulos no tienen dependencias circulares | 1 (ciclo `auth` ↔ `reportes`) |
| dto/ contiene solo contratos HTTP | 1 (`CrearReporteCommand`) |
| Capas: presentación → aplicación → dominio | 0 |
| El dominio (domain, event, port) no depende de ninguna otra capa | 0 |
| Las @Entity viven en `<modulo>.domain` | 0 |
| Los @RestController viven en `<modulo>.controller` | 0 |
| Los manejadores de eventos viven en `<modulo>.listener` | 0 |
| Los repositorios viven en `<modulo>.repository` | 0 |
| **Total** | **53** |

`mvn clean verify` (11/10): Failsafe `completed` **177** (26 clases IT), `errors` 0, `failures` 0, `skipped` 0. Surefire: 11 tests (9 de `ArquitecturaCapasTest` + 2 de `ReincidenciaDetectorTest`). Esta es la línea base de `completed` para las tareas `ARQ BE-xx`.

Nota: la regla `capas` da 0 porque `geo/`, `storage/` y `adapter/` todavía no pertenecen a ninguna capa. Las violaciones de esa regla aparecerán, si las hay, cuando BE-02 los mueva a `port/` e `infra/`. Eso es esperado y no cuenta como retroceso.

### [x] BE-02 · Puertos y adaptadores (2026-10-13, PR #10)
| Hoy | Destino |
|---|---|
| `reportes/geo/GeoAssignmentStrategy` | `reportes/port/` |
| `reportes/geo/PointInPolygonAssignmentStrategy` | `reportes/infra/` |
| `reportes/storage/FotoStorageService` | `common/port/` (D-11) |
| `reportes/storage/LocalFotoStorageService` | `common/infra/` (D-11) |
| `notificaciones/adapter/NotificacionCanalAdapter` | `notificaciones/port/` |
| `notificaciones/adapter/EmailNotificacionAdapter`, `PushNotificacionAdapter` | `notificaciones/infra/` |

Se conservan los nombres de clase (D-05). Verificar que ningún servicio importe la implementación (`Local…`, `Email…`) en vez de la interfaz.
**Orden de los commits (D-11):** primero `storage` → `common`, que corta el ciclo `auth` ↔ `reportes` (cierra también BE-07); después `geo`; `notificaciones/adapter` no aparece en el almacén y puede ir en cualquier momento. Mientras el ciclo exista, cualquier cambio en las clases de su detalle reescribe esa violación congelada.
**Recongelado controlado** (ARCHITECTURE.md §4.4; vale también para BE-03, BE-04 y BE-06, que mueven clases o cambian constructores que aparecen en el almacén):
1. `node .claude/skills/verificar/contar-archunit.mjs` antes del movimiento.
2. Mover y correr `mvn test -Dtest=ArquitecturaCapasTest`: las violaciones que falla deben ser las mismas de antes con otro paquete. Si aparece una realmente nueva, se corrige en el código, no se congela.
3. Una sola corrida con `mvn test -Dtest=ArquitecturaCapasTest -Darchunit.freeze.refreeze=true`, y de nuevo el conteo: ninguna regla sube.
4. En el PR, el diff del almacén con cada línea quitada emparejada con su línea añadida. El revisor lo comprueba entrada por entrada.
**Aceptación:** no quedan los paquetes `geo`, `storage` ni `adapter`, y el almacén baja.
**Cierre (2026-10-13, anotado por el coordinador):** commits `9a6974c` (storage → `common`), `36337c1` (geo → `reportes/port` + `reportes/infra`) y `7a48eb7` (notificaciones → `port` + `infra`). Almacén **53 → 52**: `soloApiPublicaDeOtrosModulos` 51 → 51, `modulosSinCiclos` 1 → 0, `contratosSoloRequestResponse` 1 → 1, el resto en 0. Recongelado controlado: 2 entradas (storage) y 4 (geo), emparejadas una a una; solo cambian el paquete y, en una, el número de línea (ArchUnit lo ignora). Notificaciones no necesitó recongelar. Failsafe `completed` 177 → 177 (0 errores, 0 fallos), Surefire 11. Ningún servicio importa una implementación. Pendiente para BE-08: `common/geo/` es un subpaquete que §4.1 no lista.

### [x] BE-03 · Infraestructura suelta en otras capas (2026-10-13)
- `distritos/service/DistritoSeeder` → `distritos/infra/`. Es arranque, no un caso de uso.
- `reportes/service/ExportarReportesService`: separar la escritura con Apache POI en `reportes/infra/ExcelReportesExportador`, que implementa `reportes/port/ExportadorReportes`. El servicio arma las filas, el adaptador escribe el archivo.
- `reportes/service/ReincidenciaDetector` → `reportes/domain/`, si es una regla pura (palabras clave sin I/O). Si depende de algo de Spring además de `@Component`, dejarlo en `service/` y anotarlo aquí.

**Aceptación:** `service/` no importa `org.apache.poi`, y el almacén baja.
**Cierre (2026-10-13, commit `e764af4`):**
- `DistritoSeeder` → `distritos/infra/` (usa `DistritoRepository` del mismo módulo, que la regla `capas` permite a `infra`).
- Puerto `reportes/port/ExportadorReportes` (`extension()`, `tipoContenido()`, `escribir(columnas, filas)`), Strategy elegido por extensión como `NotificacionCanalAdapter`. Adaptadores `reportes/infra/ExcelReportesExportador` (Apache POI) y `reportes/infra/CsvReportesExportador`. **El CSV también va detrás del puerto**: hoy se escribía en el servicio (escape de comillas, separadores, UTF-8), y dejarlo allí obligaba al servicio a conocer un formato de archivo mientras el otro no; así el servicio solo decide qué reportes salen y arma las filas. `service/` ya no importa `org.apache.poi` (solo lo importa `ExcelReportesExportador`).
- **`ReincidenciaDetector` se queda en `service/`**: además de `@Component` usa `org.springframework.util.StringUtils.hasText`. Es una regla pura de palabras clave sin I/O; si se reemplaza `StringUtils.hasText(texto)` por `texto != null && !texto.isBlank()` (misma semántica, ambos usan `Character.isWhitespace`) podría pasar a `reportes/domain/` en una tarea posterior. Decide el usuario. `ReincidenciaDetectorTest` no se movió.
- Recongelado controlado: 2 entradas de `soloApiPublicaDeOtrosModulos`, emparejadas una a una: el constructor de `ExportarReportesService` suma `java.util.List` (los exportadores) y `exportar` cambia de línea (58 → 66). Misma violación (`UsuarioRepository`, pendiente de BE-06).
- Almacén **52 → 52**: `soloApiPublicaDeOtrosModulos` 51 → 51, `contratosSoloRequestResponse` 1 → 1, el resto 0 → 0. No baja porque ninguna de estas clases tenía violaciones propias; ninguna regla sube. Failsafe `completed` 177 → 177 (0 errores, 0 fallos, 0 omitidos), Surefire 11.
- **Decisión del usuario (13/10):** el cierre se acepta. Para esta tarea el criterio queda en «ninguna regla sube y `service/` no importa POI»; la baja del almacén la hace BE-06. `ReincidenciaDetector` pasa a `domain/` dentro de BE-06.

### [x] BE-04 · Contratos (2026-10-13)
- `reportes/dto/CrearReporteCommand` → `reportes/service/`.
- Revisar que todo lo demás en `*/dto/` sea `*Request`, `*Response` o un enum de parámetro.

**Aceptación:** la regla `contratosSoloRequestResponse` queda sin violaciones congeladas.
**Cierre (2026-10-13, commit `be7b5ef`):** `CrearReporteCommand` en `reportes/service/`. Revisión de `*/dto/`: todo lo demás termina en `Request` o `Response`, salvo `reportes/dto/FormatoExportacion`, que es el enum del parámetro `formato` de la exportación (permitido). Sin otros casos. Observación, sin cambio: el comando lleva un `MultipartFile` (tipo de Spring Web) hacia el servicio; ninguna regla lo cubre hoy y quitarlo cambiaría la firma de `ReporteService.crear`. Recongelado controlado: 3 entradas de `soloApiPublicaDeOtrosModulos`, emparejadas una a una (`ReporteService.crear` cambia el paquete de su parámetro `dto` → `service`; `misReportes` y `reportePendienteDelCreador` solo el número de línea, por el import quitado). Almacén **52 → 51**: `contratosSoloRequestResponse` 1 → 0 (su archivo quedó vacío), `soloApiPublicaDeOtrosModulos` 51 → 51, el resto 0 → 0. Failsafe `completed` 177 → 177 (0 errores, 0 fallos, 0 omitidos), Surefire 11.

### [x] BE-05 · Manejadores de eventos (2026-10-13)
Todo método `@TransactionalEventListener` o `@EventListener` debe vivir en `<modulo>/listener/`. Mover los que estén en otro lugar. Si un listener escribe en la base, debe declarar `@Transactional(propagation = REQUIRES_NEW)`.
**Aceptación:** la regla `manejadoresDeEventosEnListener` queda sin violaciones congeladas.
**Cierre (2026-10-13, sin cambios de código):** la regla ya estaba en 0 desde BE-01 (su archivo del almacén está vacío). Solo hay 5 manejadores, todos `@TransactionalEventListener(AFTER_COMMIT)` y todos en `listener/`: 4 en `desempeno/listener/IndiceDesempenoRefreshListener` y 1 en `notificaciones/listener/ReporteEstadoCambiadoListener`. No hay `@EventListener` ni `ApplicationListener`. **Escritura en la base:** ningún listener escribe directamente; delegan en `DesempenoService.refrescarIndice()` (`REFRESH MATERIALIZED VIEW`) y `NotificacionService.notificarCambioEstado()` (inserta notificaciones), y **ambos métodos ya declaran `@Transactional(propagation = REQUIRES_NEW)`**. No se agregó `@Transactional` en los listeners: §4.5 deja `@Transactional` solo en `service`, y anotarlos abriría una transacción exterior extra (otra conexión del pool) que el servicio suspende de todos modos, sin cambiar lo que se confirma. Almacén **51 → 51** (`manejadoresDeEventosEnListener` 0 → 0, el resto igual). Failsafe `completed` 177 → 177 (0 errores, 0 fallos, 0 omitidos), Surefire 11.

### [ ] BE-06 · API pública entre módulos
Reemplazar cada uso de `repository/` (o `controller/`, `listener/`, `infra/`) de **otro** módulo por un método del `service` de ese módulo. Por ejemplo, si `reportes` usa `UsuarioRepository` o `DistritoRepository`, pasa a usar `AuthService#…` o `DistritoService#…` con métodos de consulta explícitos. La lista exacta sale de la regla `soloApiPublicaDeOtrosModulos` en el almacén.
- Además (decisión del usuario, 13/10): `reportes/service/ReincidenciaDetector` → `reportes/domain/`, reemplazando `StringUtils.hasText(texto)` por `texto != null && !texto.isBlank()` (misma semántica, también con `null`), y moviendo `ReincidenciaDetectorTest`.
**Aceptación:** esa regla queda sin violaciones congeladas, sin cambios en los IT.

### [x] BE-07 · Ciclos entre módulos (2026-10-13, con BE-02 en `9a6974c`: `modulosSinCiclos` 1 → 0, su archivo del almacén quedó vacío)
Resolver lo que reporte `modulosSinCiclos`. **Ciclo real (almacén del 04/10): `auth` ↔ `reportes`.** `auth` usa `reportes.storage.FotoStorageService` (fotos de perfil, en `AuthService` y `PerfilFotoService`), y `reportes.domain` referencia `auth.domain.Usuario`. La segunda dirección es legítima; la que hay que cortar es la de `auth` hacia `reportes`. **Decidido (D-11, 11/10):** el puerto de fotos pasa a `common`, y ese movimiento (primer commit de BE-02) corta el ciclo, porque esos dos imports son la única dependencia de `auth` hacia `reportes`. BE-07 se cierra al verificar que la regla queda en 0. Otro caso posible: `common.security` ↔ `auth`. Para cortarlo, `common.security` debe depender solo de la interfaz `UserDetailsService` de Spring; `auth` provee el bean. Si cortar un ciclo exige mover una clase entre módulos, proponerlo antes en `project-context/decisions/`.
**Aceptación:** la regla queda sin violaciones congeladas.

### [ ] BE-08 · Cierre
- El almacén vacío, o con violaciones residuales que el arquitecto aceptó y que quedan listadas en `ARCHITECTURE.md` §9.
- Actualizar la sección “Estructura del proyecto” de `backend/README.md` y la de arquitectura de `backend/CLAUDE.md`.

### [ ] BE-10 · El archivo subido no llega como tipo de Spring Web a `service/`
Decisión del usuario (13/10), a partir de la observación del revisor en BE-04: `reportes/service/CrearReporteCommand` lleva un `MultipartFile` (Spring Web) hasta el servicio, y §4.2 no permite HTTP en `service/` (ninguna regla de ArchUnit lo detecta).
- El controller convierte el archivo en un record propio (bytes, `contentType`, nombre original) antes de llamar al servicio; `CrearReporteCommand` y el puerto de fotos (`common/port/FotoStorageService`) lo reciben así. Revisar también la foto de perfil (`AuthService#editarPerfil`), que sigue el mismo camino.
- Sin cambios de contrato del API ni de comportamiento (validaciones de extensión y tamaño iguales).
**Aceptación:** `git grep -l "org.springframework.web.multipart" -- backend/src/main` solo devuelve `controller/`; Failsafe igual; almacén igual o menor.

### [ ] BE-09 · (Opcional, después de BE-08) Partir `reportes`
Si el tamaño lo justifica, separar `categorias` (CategoriaDano y su CRUD, US-29) y `participacion` (calificación, comentarios y reincidencia, US-26 y US-27). Requiere aprobación previa: mueve tablas de módulo y afecta `limpiezaFkSafe`.

---

## Frontend

### [x] FE-01 · Instalar la guarda y medir la línea base (2026-10-11)
1. Verificar que `eslint.capas.mjs` exista y que `eslint.config.mjs` lo incluya al final.
2. `npm run lint`. Anotar los avisos por bloque `capas/*`. La medición previa (03/10) se hizo solo con los imports y dio **66 avisos en 24 archivos**. La cifra real puede variar un poco por los `export … from` y los imports de tipos.
3. Confirmar que `npm run lint` siga terminando con código 0, porque son avisos y no errores.

Línea base (2026-10-11, sobre `f2f8954`). `eslint.capas.mjs` existe y `eslint.config.mjs` lo incluye como último bloque, así que no hubo que tocar nada.
- `npm run typecheck`: 0 errores. En un checkout recién clonado (sin `.next/`) falla con `Cannot find name 'LayoutProps'` hasta correr `npx next typegen` (lo resuelve el coordinador).
- `npm test`: **80 tests en 8 archivos**, todos en verde. La guarda confirma 8 de 8 archivos presentes en `src/`.
- `npm run lint`: código de salida 0, con 66 avisos y 0 errores. Todos son de capas: **0 avisos de otras reglas**.
- **Avisos de capas: 66 en 24 archivos.** Es la misma cifra que la medición del 03/10. 8 de esos avisos vienen de `import type`, y ningún `export … from` cae en una regla.

| Mensaje (`contar-capas.mjs`) | Avisos |
|---|---|
| `gatewayDesdeUi` (presentación llama al API) | 35 |
| `otraFeature` | 16 |
| `clienteHttp` | 14 |
| `haciaFeatures` (compartidos dependen de una feature) | 1 |
| `schema`, `token`, `modelPuro`, `hookSinUi` | 0 |

Los 66 avisos salen de 47 imports, porque algunos imports caen en dos reglas a la vez:
- **`gatewayDesdeUi`:** en `feature-components`, el patrón `**/api` también coincide con `@/lib/api/client`. Por eso los 8 imports de `ApiError`/`NetworkError` cuentan dos veces, como `gatewayDesdeUi` y como `clienteHttp`. De los 35 avisos `gatewayDesdeUi`, 8 son ese doble conteo.
- **`otraFeature`:** de los 16 avisos, 11 son imports de la misma feature con alias, que arregla FE-04. Los otros 5 son cruces reales entre features, que arregla FE-08:
  - `CambiarEstado` y `TablaBandeja` → `reportes/api`
  - `CampoUbicacion` → `distritos/api`
  - `gestion/api.ts` → `reportes/api`
  - `MapaReportes` → `reportes/api`

| Bloque | Avisos / archivos |
|---|---|
| `capas/feature-components` | 41 / 11 |
| `capas/app` | 22 / 10 |
| `capas/compartidos` (`components/LineaDeTiempo` → `reportes/mapa/estados`) | 1 / 1 |
| `capas/feature-api` (`gestion/api.ts` → `@/features/reportes/api`) | 1 / 1 |
| `capas/adaptadores` (`map/MapaReportes` → `@/features/reportes/api`) | 1 / 1 |

Nota: hay 9 archivos de feature fuera de `components/`, `hooks/`, `model/` y `api.ts`. No caen en ningún bloque, así que hoy no se miden. Son `auth/{fotoPerfil,hooks,rutas}.ts`, `desempeno/formato.ts`, `gestion/transiciones.ts`, `reportes/{acciones,useGeolocalizacion}.ts` y `reportes/mapa/{bbox,estados}.ts`.
- `desempeno/formato.ts` importa `generated/schema`, pero al moverlo a `model/` en FE-02 no dará aviso, porque `feature-model` permite el schema.
- El único aviso nuevo previsible está en FE-05. Si `auth/hooks.ts` pasa a `hooks/useSesion.ts` y conserva `@/features/auth/api`, cae en `otraFeatureApi`. Se evita importando `../api`.

La guarda no cubre el schema en `components/`: `components/LineaDeTiempo.tsx` importa `generated/schema` sin aviso, porque `compartidos` no prohíbe esa ruta (lo resuelve el coordinador).

**Actualización del coordinador (11/10):** el bloque `compartidos` se partió en `compartidos-lib` (`src/lib/**`) y `compartidos-ui` (`src/components/**`, que además prohíbe `schema`). **Línea base vigente: 67 avisos en 24 archivos**: el de `LineaDeTiempo` → `generated/schema` es el nuevo (mensaje `schema`: 0 → 1; `capas/compartidos-ui`: 2 avisos / 1 archivo). Las otras cifras no cambian.

### [x] FE-02 · Reglas puras a `model/` (2026-10-13)
| Hoy | Destino |
|---|---|
| `features/gestion/transiciones.ts` (+ test) | `features/gestion/model/transiciones.ts` |
| `features/reportes/acciones.ts` (+ test) | `features/reportes/model/acciones.ts` |
| `features/reportes/mapa/bbox.ts` (+ test) | `features/reportes/model/bbox.ts` |
| `features/reportes/mapa/estados.ts` (+ test) | `src/lib/types/estados.ts`: lo usan `gestion`, `reportes` y `components/LineaDeTiempo` |
| `features/desempeno/formato.ts` (+ test) | `features/desempeno/model/formato.ts` |
| `features/auth/rutas.ts` (+ test) | `features/auth/model/rutas.ts` |
| ~~`features/auth/fotoPerfil.ts` (+ test)~~ | Pasó a **FE-07** (no es puro; ver el cierre) |

**Aceptación:** `npm test` corre la misma cantidad de archivos de test que antes, y no queda la carpeta `features/reportes/mapa/`.

Cierre (2026-10-13, rama `feature/fe-02`). Se movieron 6 de los 7 archivos con `git mv`, cada uno con su test. Los imports dentro de la feature quedaron relativos; los de `app/`, `map/` y las demás features usan el alias hacia `model/` o `lib/types`. Ya no queda `features/reportes/mapa/`.
- **`auth/fotoPerfil.ts` no se movió.** No es puro, porque usa `apiFetch` y `URL.createObjectURL`, así que le corresponde `auth/api.ts`. Pero entonces `auth/components/FotoDePerfil.tsx` importaría `../api`, lo que agrega un aviso `gatewayDesdeUi` por un import nuevo, y §5.4 no lo admite. Para evitarlo hace falta el hook de foto de perfil de FE-07. Por eso el movimiento (`descargarFotoDePerfil` → `auth/api.ts`, con su test) pasa a FE-07. El revisor lo dio por correcto. Hoy ningún bloque mide ese archivo, igual que antes.

| Métrica | Antes | Después |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm test` (con la guarda) | 80 tests en 8 archivos | 80 tests en 8 archivos |
| `npm run lint`: código / avisos que no son de capas | 0 / 0 | 0 / 0 |
| Avisos de capas (`contar-capas.mjs`) | **67 en 24 archivos** | **66 en 24 archivos** |
| `haciaFeatures` | 1 | 0: `LineaDeTiempo` importa `@/lib/types/estados` |
| `gatewayDesdeUi` / `otraFeature` / `clienteHttp` / `schema` | 35 / 16 / 14 / 1 | 35 / 16 / 14 / 1 |

No hay avisos en los archivos que entraron a `model/` ni en `lib/types/estados.ts`, así que no aparece ningún aviso antes no medido que haya que listar (§5.4). Las referencias a `features/gestion/transiciones.ts` en `frontend/CLAUDE.md` y `frontend/README.md` ya apuntan a `model/`. El ejemplo del `CLAUDE.md` raíz (`npx vitest run src/features/reportes/acciones.test.ts`) ya apunta a `model/` (corregido por el coordinador en esta misma rama).

### [x] FE-03 · Tipos en `model/` (2026-10-13)
Crear `features/<f>/model/tipos.ts` con los alias sobre `generated/schema` (`ReporteResumen`, `HistorialEntrada`, `AsignacionResponsable`…). `api.ts`, los hooks y los componentes importan los tipos desde ahí. `components/LineaDeTiempo.tsx` deja de importar `generated/schema`.
**Aceptación** (corregida el 13/10: desde FE-02, `desempeno/formato.ts` ya está en `model/`, donde el schema está permitido):
- `git grep -l "lib/api/generated" -- frontend/src ':!frontend/src/lib/api/generated'` solo devuelve archivos de `features/*/model/**`, `features/*/api.ts` y `lib/types/**`. Al abrir la tarea devolvía 6: `components/LineaDeTiempo.tsx` (el único fuera de lugar) y `desempeno/model/{dashboard,formato}.ts`, `gestion/api.ts`, `reportes/api.ts`, `lib/types/domain.ts` (permitidos).
- El mensaje `schema` de `contar-capas.mjs` queda en 0 (hoy 1, el de `LineaDeTiempo` en `capas/compartidos-ui`).

Cierre (2026-10-13, rama `feature/fe-03`, sobre `feature/fe-04`).
- `features/reportes/model/tipos.ts`: `ReporteResponse`, `ReporteResumen`, `ComentarioPublico`, `Calificacion` (alias del schema) y `PaginaReportes`, `ReporteCreado`, `NuevoReporte` (formas de datos que antes declaraba `api.ts`).
- `features/gestion/model/tipos.ts`: `AsignacionResponsable`, `FiltrosBandeja`, `FILTROS_BANDEJA_VACIOS` y `ReportesExportados`.
- `HistorialEntrada` (estaba duplicado en los dos `api.ts`) pasa a `lib/types/domain.ts`: lo usan `reportes`, `gestion` y `components/LineaDeTiempo`, que no puede depender de features (§5.3).
- Componentes, páginas de `app/` y `map/MapaReportes` importan los tipos desde `model/tipos` (los de otra feature por alias, que §5.3 permite). Efecto lateral: desaparecen 4 avisos `otraFeature` de FE-08 que eran solo de tipos (`CambiarEstado`, `TablaBandeja`, `gestion/api.ts` y `MapaReportes` → `reportes/api`) y 4 `gatewayDesdeUi` de imports que solo traían tipos. Para FE-08 queda un único cruce: `CampoUbicacion` → `distritos/api`.
- `git grep` devuelve 5 archivos, todos permitidos: `desempeno/model/{dashboard,formato}.ts`, `gestion/model/tipos.ts`, `reportes/model/tipos.ts` y `lib/types/domain.ts`. Ningún `api.ts` importa ya el schema.

| Métrica | Antes | Después |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm test` (con la guarda) | 136 tests en 19 archivos | 136 tests en 19 archivos |
| `npm run lint`: código / avisos que no son de capas | 0 / 0 | 0 / 0 |
| Avisos de capas (`contar-capas.mjs`) | **53 en 22 archivos** | **44 en 18 archivos** |
| `schema` | 1 | 0 |
| `otraFeature` | 5 | 1 (`CampoUbicacion` → `distritos/api`, FE-08) |
| `gatewayDesdeUi` / `clienteHttp` | 33 / 14 | 29 / 14 |

### [x] FE-04 · Imports internos relativos (2026-10-13)
Dentro de cada feature, cambiar `@/features/<misma>/…` por imports relativos. Casos detectados: `FormularioReporte` → `CampoFoto`/`CampoUbicacion` y `GuardiaDeRol` → `auth/hooks`.

Cierre (2026-10-13, rama `feature/fe-04`). 14 imports en 12 archivos: los 11 con aviso `otraFeature` (`auth/components/{FormularioLogin,FormularioRegistro,GuardiaDeRol}`, `gestion/components/{CambiarEstado,Responsable}`, `reportes/components/{Calificar,Comentarios,EditarReporte}` y los 3 de `FormularioReporte`) y 3 sin aviso (`CampoUbicacion` → `../useGeolocalizacion`, `FotoDePerfil` → `../fotoPerfil`, `auth/hooks.ts` → `./api`). `GuardiaDeRol` importa `../hooks`, que resuelve al **archivo** `auth/hooks.ts` igual que el alias (comprobado con `tsc --traceResolution`; la carpeta `hooks/` no tiene `index.ts`). La unificación de `hooks.ts` y `hooks/` sigue en FE-05. Los `gatewayDesdeUi` de esos componentes se mantienen (FE-06).

| Métrica | Antes | Después |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm test` (con la guarda) | 136 tests en 19 archivos | 136 tests en 19 archivos |
| `npm run lint`: código / avisos que no son de capas | 0 / 0 | 0 / 0 |
| Avisos de capas (`contar-capas.mjs`) | **64 en 23 archivos** | **53 en 22 archivos** |
| `otraFeature` | 16 | 5 (los cruces reales de FE-08) |
| `gatewayDesdeUi` / `clienteHttp` / `schema` | 33 / 14 / 1 | 33 / 14 / 1 |

### [ ] FE-05 · Hooks de carga y páginas como composición
1. ~~Crear `src/lib/hooks/useCarga.ts` con el patrón de `ARCHITECTURE.md` §5.5, con tests de la cancelación.~~ **Hecho en US-17 (Sprint 1, PR #18):** 6 tests de cancelación, respuesta vieja descartada, recarga y desmontaje.
2. ~~Agregar `mensajeDeError(e: unknown): { mensaje: string; detalles: string[] }` a `src/lib/api/errors.ts`.~~ **Hecho en US-03 (Sprint 1, PR #16)**, con test.
3. Mover `features/auth/hooks.ts` → `features/auth/hooks/useSesion.ts` (hoy conviven el archivo `hooks.ts` y la carpeta `hooks/` creada en el Sprint 1: unificarlos) y `features/reportes/useGeolocalizacion.ts` → `features/reportes/hooks/`.
4. Por cada página con `useEffect` de datos, crear el hook y llevar el contenido a un componente de la feature: `mis-reportes`, `mis-reportes/[id]`, `perfil`, `bandeja`, `bandeja/[id]`, `desempeno`, `mapa`, `reportes/[id]`, `reportar` y `sesion`.

**Aceptación:** ninguna página de `app/` usa `useEffect` para cargar datos ni importa `api.ts`.

### [ ] FE-06 · Mutaciones en hooks
Los componentes que hoy llaman al API pasan a usar un hook de su feature: `CambiarEstado`, `Responsable`, `Calificar`, `Comentarios`, `EditarReporte`, `FormularioReporte`, `FormularioLogin` y `FormularioRegistro`. El hook captura el error con `mensajeDeError`, y el componente ya no importa `ApiError` ni `NetworkError`. **Se conserva** la regla de `Idempotency-Key` de `FormularioReporte`: la clave vive en el hook y no se regenera en un reintento.

### [ ] FE-07 · URLs de fotos en el gateway
`features/<f>/api.ts` devuelve `fotoUrl` ya absoluta (`urlDeFoto`). Las páginas y los componentes dejan de importar `@/lib/api/client`. La foto de perfil (que requiere token) se resuelve en un hook de auth que devuelve la URL `blob:`.
- Viene de FE-02: `features/auth/fotoPerfil.ts` (+ test) → `descargarFotoDePerfil` en `features/auth/api.ts` (test a `auth/api.test.ts`; siguen 8 archivos de test). Hacerlo **junto con** el hook, para que `auth/components/FotoDePerfil.tsx` use el hook y no importe `../api` (eso sería un aviso `gatewayDesdeUi` nuevo).

### [ ] FE-08 · Dependencias entre features
- `gestion` deja de importar `@/features/reportes/api`: usa `reportes/model/tipos` y su propio `api.ts`.
- Catálogos compartidos: `listarDistritos`, `distritoPorCoordenadas` y `listarCategorias` → `src/lib/api/catalogos.ts`. Los hooks de cada feature lo usan.

**Aceptación:** sin avisos `otraFeature`.

### [ ] FE-09 · Cierre
- `npm run lint` con 0 avisos de capas. El cambio de `SEVERIDAD` a `'error'` en `eslint.capas.mjs` lo hace la sesión de raíz, porque la guardia lo bloquea para el agente (WORKFLOW.md §5).
- Actualizar `frontend/README.md` (estructura) y `frontend/CLAUDE.md`.

---

## Núcleo nuevo (después de BE-01 y FE-01; nace ya en capas)

No es migración, es funcionalidad. Se lista aquí para fijar **dónde** va cada pieza. El detalle funcional está en el OB2 §5 y los wireframes.

| ID | Pieza | Dónde (ARCHITECTURE.md) | Depende de |
|---|---|---|---|
| NC-01 | Módulo `municipalidades` y una migración Flyway nueva, con la siguiente versión libre (MUNICIPALIDAD, GESTION_MUNICIPAL, PERIODO_GESTION, REQUISITO_RECEPCION). `municipalidad.distrito_id NOT NULL UNIQUE` → `distrito`, sin geometría propia. Seed de 43 municipalidades: 42 distritales más la MML para Cercado de Lima. `correo_contacto` puede ser nulo. Seed del periodo 2023-2026 (verificar las fechas antes de sembrar). API pública: `MunicipalidadService#deDistrito(distritoId)` y `#periodoVigente(fecha)`. IT: cada distrito tiene exactamente una municipalidad. | §4.3, §8, D-09 | D-09 decidida (04/10). D-10 (jurisdicción del funcionario) no bloquea NC-01 |
| NC-02 | `reportes`: `titulo`, `severidad` y `periodo_gestion_id` | §8 | NC-01 |
| NC-03 | Servicio `inferencia/` (FastAPI + ONNX) con contrato `/v1/detecciones` | §6 | Elegir las clases finales del modelo |
| NC-04 | Módulo `clasificacion` (puerto, adaptador HTTP y política de umbral), vista previa en `features/reportes` y `reportes.listener.SugerenciaCategoriaListener` asíncrono (D-08). Requiere `@EnableAsync` con un executor acotado. IT: la creación responde aunque la inferencia falle, la sugerencia se escribe una sola vez y lo que envíe el cliente se ignora. | §4.3 pasos 1-3, D-08 | NC-03 (se puede usar un adaptador falso mientras tanto) |
| NC-05 | Confirmación de reporte + ENVIO_CORREO | §4.3 pasos 3-4 | NC-01, requisitos por municipalidad |
| NC-06 | Dashboard por periodo (`desempeno`) + `app/(municipal)/dashboard` | §4.3 paso 5 | NC-01, fórmulas de los KPIs |
| NC-07 | CONSENTIMIENTO y SUSCRIPCION_PUSH | §8 | — |
