# Plan de migración a capas uniformes

> Norma: `ARCHITECTURE.md`. Este plan lleva el código actual a esa norma **sin cambiar comportamiento**: ninguna tarea toca el contrato del API ni la base de datos.
> Cómo se ejecuta cada tarea: `WORKFLOW.md` (`/tarea <ID>`, `/verificar`, `/revisar`).
> El backend y el frontend migran **en paralelo**, porque no comparten archivos. Cada tarea es un commit `ARQ BE-xx` o `ARQ FE-xx`.
> Creado el 2026-10-03. Marcar `[x]` y anotar la fecha al cerrar cada tarea.

## Definición de terminado (todas las tareas)

| Agente | Condición |
|---|---|
| Backend | `mvn clean verify` en verde. `completed` en `target/failsafe-reports/failsafe-summary.xml` **igual** al de la línea base (una tarea de arquitectura no agrega ni quita IT). `src/test/resources/archunit_store` **más chico o igual**. |
| Frontend | `npm run typecheck`, `npm test` (con su guarda) y `npm run lint` en verde. Desde FE-09 las capas son error. Hasta entonces la regla era «avisos `capas/*` **menos o igual** que antes, salvo los de archivos que entran por primera vez a un bloque, listados en el PR». |

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

### [x] BE-06 · API pública entre módulos (2026-10-20)
Reemplazar cada uso de `repository/` (o `controller/`, `listener/`, `infra/`) de **otro** módulo por un método del `service` de ese módulo. Por ejemplo, si `reportes` usa `UsuarioRepository` o `DistritoRepository`, pasa a usar `AuthService#…` o `DistritoService#…` con métodos de consulta explícitos. La lista exacta sale de la regla `soloApiPublicaDeOtrosModulos` en el almacén.
- Además (decisión del usuario, 13/10): `reportes/service/ReincidenciaDetector` → `reportes/domain/`, reemplazando `StringUtils.hasText(texto)` por `texto != null && !texto.isBlank()` (misma semántica, también con `null`), y moviendo `ReincidenciaDetectorTest`.
**Aceptación:** esa regla queda sin violaciones congeladas, sin cambios en los IT.
**Avance (2026-10-20, PR #49, anotado por el coordinador):** commits `a963487` y `b879cc9`. `UsuarioConsultaService` (`usuarioPorEmail`, `usuarioPorId`), `DistritoService#porId` y `reportes/service/ReporteConsultaService` reemplazan los repositorios ajenos; `ReincidenciaDetector` está en `reportes/domain/` (sigue como `@Component`). Almacén 48 → 3 sin recongelar (solo bajas). Failsafe 272 → 272, Surefire 57. **Queda abierta:** las 3 entradas de `reportes/infra/PointInPolygonAssignmentStrategy` → `DistritoRepository` dependen de la decisión del usuario en `propuestas/2026-10-20-asignacion-geo-en-distritos.md`. Para BE-08: actualizar en §4.3 que `notificaciones` y `desempeno` usan `reportes.service.ReporteConsultaService`, y decidir si `ReincidenciaDetector` se declara como `@Bean` para quitar Spring de `domain/`.
**Cierre (2026-10-20, opción A de `propuestas/2026-10-20-asignacion-geo-en-distritos.md`, aceptada por el usuario):** `GeoAssignmentStrategy` → `distritos/port/`, `PointInPolygonAssignmentStrategy` → `distritos/infra/` (mismos nombres, `git mv`) y su IT → `distritos/infra/`; `ReporteService` importa el puerto de `distritos`. El adaptador usa el repositorio de su propio módulo. Sin recongelar: el almacén solo pierde las 3 entradas de `PointInPolygonAssignmentStrategy` y no gana ninguna. Almacén **3 → 0**: `soloApiPublicaDeOtrosModulos` 3 → 0, el resto 0 → 0. Failsafe `completed` 284 → 284 (0 errores, 0 fallos, 0 omitidos), Surefire 57 → 57. El IT solo cambia de paquete, sin cambios en sus casos. `backend/README.md` actualizado. Para BE-08: `backend/CLAUDE.md` (sección Geoespacial) sigue citando `reportes/port/` y `reportes/infra/` para el Strategy.

### [x] BE-07 · Ciclos entre módulos (2026-10-13, con BE-02 en `9a6974c`: `modulosSinCiclos` 1 → 0, su archivo del almacén quedó vacío)
Resolver lo que reporte `modulosSinCiclos`. **Ciclo real (almacén del 04/10): `auth` ↔ `reportes`.** `auth` usa `reportes.storage.FotoStorageService` (fotos de perfil, en `AuthService` y `PerfilFotoService`), y `reportes.domain` referencia `auth.domain.Usuario`. La segunda dirección es legítima; la que hay que cortar es la de `auth` hacia `reportes`. **Decidido (D-11, 11/10):** el puerto de fotos pasa a `common`, y ese movimiento (primer commit de BE-02) corta el ciclo, porque esos dos imports son la única dependencia de `auth` hacia `reportes`. BE-07 se cierra al verificar que la regla queda en 0. Otro caso posible: `common.security` ↔ `auth`. Para cortarlo, `common.security` debe depender solo de la interfaz `UserDetailsService` de Spring; `auth` provee el bean. Si cortar un ciclo exige mover una clase entre módulos, proponerlo antes en `project-context/decisions/`.
**Aceptación:** la regla queda sin violaciones congeladas.

### [ ] BE-08 · Cierre
- El almacén vacío, o con violaciones residuales que el arquitecto aceptó y que quedan listadas en `ARCHITECTURE.md` §9.
- Actualizar la sección “Estructura del proyecto” de `backend/README.md` y la de arquitectura de `backend/CLAUDE.md`.
- En `backend/CLAUDE.md` (sección Geoespacial), el Strategy pasa a `distritos/port/GeoAssignmentStrategy` → `distritos/infra/PointInPolygonAssignmentStrategy` (BE-06). **Hecho** (2026-10-20, junto con la marca Ciudad Viva).

### [x] BE-10 · El archivo subido no llega como tipo de Spring Web a `service/` (2026-10-20, PR #48)
Decisión del usuario (13/10), a partir de la observación del revisor en BE-04: `reportes/service/CrearReporteCommand` lleva un `MultipartFile` (Spring Web) hasta el servicio, y §4.2 no permite HTTP en `service/` (ninguna regla de ArchUnit lo detecta).
- El controller convierte el archivo en un record propio (bytes, `contentType`, nombre original) antes de llamar al servicio; `CrearReporteCommand` y el puerto de fotos (`common/port/FotoStorageService`) lo reciben así. Revisar también la foto de perfil (`AuthService#editarPerfil`), que sigue el mismo camino.
- Sin cambios de contrato del API ni de comportamiento (validaciones de extensión y tamaño iguales).
**Aceptación:** `git grep -l "org.springframework.web.multipart" -- backend/src/main` solo devuelve `controller/`; Failsafe igual; almacén igual o menor.
**Cierre (2026-10-20, anotado por el coordinador):** commits `207866c` y `aa54448`. `common/port/ArchivoSubido(byte[] contenido, String contentType, String nombreOriginal)`, que los controllers construyen; si la lectura falla, el mismo 409 «No se pudo almacenar la foto». `git grep` → solo `AuthController` y `ReporteController`. Failsafe 272 → 272, Surefire 50 → 57 (`LocalFotoStorageServiceTest` fija extensión rechazada, nombre null, ruta en el nombre y vacío), ArchUnit 48 → 48 con recongelado controlado (1 entrada cambia el tipo de un parámetro, 2 solo la línea). Costo aceptado: el archivo completo queda en el heap, hasta `max-file-size` (10 MB) por pedido concurrente con foto; antes se copiaba por streaming.

### [ ] BE-09 · (Opcional, después de BE-08) Partir `reportes`
Si el tamaño lo justifica, separar `categorias` (CategoriaDano y su CRUD, US-29) y `participacion` (calificación, comentarios y reincidencia, US-26 y US-27). Requiere aprobación previa: mueve tablas de módulo y afecta `limpiezaFkSafe`.

### [ ] BE-11 · La foto se sube fuera de la transacción de creación (S7)
Deuda de DEP-12 (`propuestas/2026-10-21-fotos-r2.md`, «La regla de §4.5…»). Es también la opción C de `propuestas/2026-10-22-refresco-indice-asincrono.md`. Hoy `ReporteService#crear` sanea y sube la foto a R2 **dentro** de su `@Transactional`, y retiene una conexión del pool durante la red (~100–500 ms).
- La foto se sanea y se sube **sin transacción abierta**, antes de la transacción o después de ella con su compensación. No cambia el contrato del API.
- Si la transacción se revierte, el objeto subido se borra en `afterCompletion`. Un reenvío idempotente (US-06) o una adhesión (US-09) no deja fotos huérfanas en el bucket.

**Aceptación:**
- un test con un `FotoStorageService` de prueba comprueba que no hay transacción activa al subir (`TransactionSynchronizationManager.isActualTransactionActive()`);
- un IT de reversión deja el bucket sin el objeto;
- Failsafe igual o mayor y ArchUnit en 0.

### [ ] BE-12 · Refresco asíncrono y coalescido del índice de desempeño (S7)
Decisión del usuario (25/10): opción A de `propuestas/2026-10-22-refresco-indice-asincrono.md`. Va junto con BE-11. Mientras no entre, producción corre con el pool en 20 (runbook §5.2).
- `desempeno/listener/IndiceDesempenoRefreshListener` deja de refrescar en el hilo de la petición:
  - marca el índice como sucio y encola una tarea `@Async` en el executor acotado (`AsyncConfig`);
  - la tarea repite `while (sucio.getAndSet(false)) refrescar()`;
  - si el executor rechaza la tarea, la marca queda puesta y el siguiente evento la recoge.
- Se conserva la regla «todo evento que mueve el índice lo refresca» (`backend/CLAUDE.md`): siempre hay un refresco final.
- Los IT de `DesempenoIT` que esperan el refresco por evento pasan a esperar con sondeo acotado, o el perfil `test` desactiva la ventana.
- ARCHITECTURE.md §4.5 y la fila D-13 se actualizan en la rama de esta tarea, antes de fusionar. Ese commit lo agrega la sesión de raíz, porque la guardia no deja que el agente edite normas.

**Aceptación:**
- **Coalescido:** un IT de «muchos eventos seguidos» da al menos un refresco final y menos refrescos que eventos.
- **Carga:** se repite la prueba de la propuesta, 16 creaciones simultáneas con foto sobre la imagen `prod` con el pool en 10, y todas terminan en 201.
- **Suites:** Failsafe igual o mayor y ArchUnit en 0.

Al cerrarla, se decide si el pool de producción vuelve a 10.

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

### [x] FE-05 · Hooks de carga y páginas como composición (2026-10-19)
1. ~~Crear `src/lib/hooks/useCarga.ts` con el patrón de `ARCHITECTURE.md` §5.5, con tests de la cancelación.~~ **Hecho en US-17 (Sprint 1, PR #18):** 6 tests de cancelación, respuesta vieja descartada, recarga y desmontaje.
2. ~~Agregar `mensajeDeError(e: unknown): { mensaje: string; detalles: string[] }` a `src/lib/api/errors.ts`.~~ **Hecho en US-03 (Sprint 1, PR #16)**, con test.
3. Mover `features/auth/hooks.ts` → `features/auth/hooks/useSesion.ts` (hoy conviven el archivo `hooks.ts` y la carpeta `hooks/` creada en el Sprint 1: unificarlos) y `features/reportes/useGeolocalizacion.ts` → `features/reportes/hooks/`.
4. Por cada página con `useEffect` de datos, crear el hook y llevar el contenido a un componente de la feature: `mis-reportes`, `mis-reportes/[id]`, `perfil`, `bandeja`, `bandeja/[id]`, `desempeno`, `mapa`, `reportes/[id]`, `reportar` y `sesion`.

**Aceptación:** ninguna página de `app/` usa `useEffect` para cargar datos ni importa `api.ts`.

Cierre (2026-10-19, rama `feature/fe-05`, sobre `develop` v0.3.0).
- **Paso 3.** `auth/hooks.ts` → `auth/hooks/useSesion.ts`, reescrito sobre `useCarga` (un fallo de `/me` cuenta como "sin sesión", no como error; `refrescar` conserva el estado visible, igual que antes). Sin `index.ts`: se importa el archivo explícito (`../hooks/useSesion`, `@/features/auth/hooks/useSesion`). `reportes/useGeolocalizacion.ts` → `reportes/hooks/` con `git mv`. Ninguno de los dos trae avisos al entrar al bloque `feature-hooks`.
- **Paso 4.** `git grep -n "useEffect\|/api'\|lib/api" -- frontend/src/app` no devuelve nada (exit 1). Las 10 páginas quedan como composición:

| Página | Hook (sobre `useCarga`) | Componente |
|---|---|---|
| `mis-reportes` | `reportes/hooks/useMisReportes` | `reportes/components/ListaMisReportes` |
| `mis-reportes/[id]` | `reportes/hooks/useMiReporte` | `reportes/components/DetalleMiReporte` |
| `reportes/[id]` | `reportes/hooks/useReportePublico` (+ `useSesion` en la página para `puedeComentar`) | `reportes/components/DetalleReportePublico` |
| `reportar` | `auth/hooks/useSesionRequerida` | `reportes/components/NuevoReporte` (formulario + confirmación) |
| `sesion` | `auth/hooks/useSesionRequerida` | (la página solo pinta los datos) |
| `perfil` | `auth/hooks/usePerfil` (`usePerfil`, `useDistritosDeResidencia`) | `auth/components/EditarPerfil` |
| `bandeja` | `gestion/hooks/useBandeja` (`useBandeja`, `useCategoriasDelDistrito`) | `gestion/components/BandejaMunicipal` |
| `bandeja/[id]` | `gestion/hooks/useDetalleGestion` | `gestion/components/DetalleGestionReporte` |
| `desempeno` | `desempeno/hooks/useIndiceDesempeno` (`useRankingDistrital`, `useCategoriasDelIndice`) | `desempeno/components/IndiceDesempeno` |
| `mapa` | `reportes/hooks/useCatalogosMapa` (el `dynamic()` del mapa sigue en la página) | (sin cambio: ya componía) |

- `BotonCerrarSesion` (de `auth`) lo pasa la página por la prop `cierreDeSesion` a los componentes de `reportes` y `gestion`, para no crear avisos `otraFeature`.
- Los detalles (`DetalleMiReporte`, `DetalleGestionReporte`) muestran "Cargando…" también mientras `recargando`: tras editar o cambiar el estado la pantalla se vuelve a montar como antes y los formularios hijos arrancan de cero.
- Diferencia mínima aceptada: en `bandeja` y `desempeno`, si la carga falla ya no se muestra la lista anterior debajo del error (el estado `error` de `useCarga` no tiene datos). Textos, rutas, `Idempotency-Key` y el debounce/umbral del mapa no cambian.
- **Anticipado de FE-08:** `src/lib/api/catalogos.ts` con `listarDistritos`, `distritoPorCoordenadas` y `listarCategorias`; desaparece `features/distritos/`. `CampoUbicacion` resuelve el distrito con `reportes/hooks/useDistritoDeUbicacion` (desaparece el último `otraFeature`). `reportes/api.ts` reexporta `listarCategorias` solo para `FormularioReporte` y `EditarReporte`, que lo dejan al pasar a hooks en FE-06.
- **Anticipado de FE-07 (parcial):** `conFotoAbsoluta` en `lib/api/client.ts`; `reportes/api.ts` (`buscarReportes`, `misReportes`, `pendientesDeCalificacion`, `reportePorId`, `crearReporte`) y `gestion/api.ts` (`bandeja`) devuelven `fotoUrl` absoluta. Quedan para FE-07 la llamada a `urlDeFoto` de `map/MapaReportes.tsx` (idempotente solo porque `NEXT_PUBLIC_API_BASE_URL` es un origen absoluto, lo que exige la CSP; ver el javadoc de `conFotoAbsoluta`) y la foto de perfil.
- Observaciones de la revisión (APTO CON OBSERVACIONES, menores), aplicadas en la misma rama: una recarga fallida en `DetalleMiReporte`/`DetalleGestionReporte` conserva el reporte visible con un aviso (`errorDeRecarga` en `useMiReporte`/`useDetalleGestion`; `useCarga` no cambia); `puedeComentar` pasa a `auth/model/permisos.ts` (`puedeComentarReportes`, con test).

| Métrica | Antes | Después |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm test` (con la guarda) | 232 tests en 34 archivos | 275 tests en 46 archivos (269/45 antes de las observaciones) |
| `npm run lint`: código / avisos que no son de capas | 0 / 0 | 0 / 0 |
| Avisos de capas (`contar-capas.mjs`) | **44 en 18 archivos** | **24 en 8 archivos** |
| `gatewayDesdeUi` / `clienteHttp` / `otraFeature` | 29 / 14 / 1 | 16 / 8 / 0 |
| `npm run build` | — | OK (19 rutas) |

Los 24 restantes son de los 8 componentes de FE-06 (`FormularioLogin`, `FormularioRegistro`, `CambiarEstado`, `Responsable`, `Calificar`, `Comentarios`, `EditarReporte`, `FormularioReporte`). No hay avisos nuevos en los archivos que entraron a `hooks/` ni a `components/`.

### [x] FE-06 · Mutaciones en hooks (2026-10-20)
Los componentes que hoy llaman al API pasan a usar un hook de su feature: `CambiarEstado`, `Responsable`, `Calificar`, `Comentarios`, `EditarReporte`, `FormularioReporte`, `FormularioLogin` y `FormularioRegistro`. El hook captura el error con `mensajeDeError`, y el componente ya no importa `ApiError` ni `NetworkError`. **Se conserva** la regla de `Idempotency-Key` de `FormularioReporte`: la clave vive en el hook y no se regenera en un reintento.
- `EditarReporte` ganó lógica en US-29 (`reportes/model/edicion.ts`); migrar a `useEditarReporte`.

Cierre (2026-10-20, rama `feature/fe-06-mutaciones-en-hooks`, sobre `develop` con NC-07b).
- `FormularioLogin` y `FormularioRegistro` ya estaban resueltos por NC-07b (`useIniciarSesion`, `useRegistro`): sin avisos al empezar, no se tocaron.
- **gestion:** `useCambiarEstado` (exige el motivo al rechazar antes de enviar) y `useResponsable` (consulta sobre `useCarga` con `[reporteId, estado]`; la asignación adopta la respuesta del servidor y vale solo para ese reporte y estado).
- **reportes:** `useCalificar`, `useComentarios` (tras publicar, `recargar()` sin desmontar la lista), `useEditarReporte` (opciones con `opcionesDeCategoria` y cuerpo con `cambiosDeEdicion`), `useCategoriasDeReporte` (catálogo por distrito desde `lib/api/catalogos`) y `useCrearReporte`.
- **`Idempotency-Key`:** vive en `useCrearReporte` (una por formulario montado); se conserva tras un error del backend, el 403 `TERMINOS_PENDIENTES` o la falta de IndexedDB, y solo se renueva tras crear o encolar el reporte. La cola de US-06 (`useEncolarReporte`, `SincronizadorDeReportes`) no cambia.
- **FE-08:** se quita la reexportación de `listarCategorias` de `reportes/api.ts`.
- Diferencias mínimas aceptadas: el aviso sin red pasa a ser el de `mensajeDeError` ("Sin conexión con el servidor. Revisa tu red."); en `FormularioReporte` una categoría que no existe en el distrito nuevo cuenta como no elegida (se deriva de la lista en vez de limpiarse en un efecto), y mientras se recarga el catálogo el selector queda vacío; en `Comentarios` la lista se conserva visible al recargar tras publicar.
- Tests: 6 archivos nuevos (`useCambiarEstado`, `useResponsable`, `useCalificar`, `useComentarios`, `useEditarReporte`, `useCrearReporte`, 34 tests); `EditarReporte.test` y `FormularioReporte.test` mockean el catálogo en `@/lib/api/catalogos`. No se borró ningún test.

| Métrica | Antes | Después |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm test` (con la guarda) | 400 tests en 62 archivos | 434 tests en 68 archivos |
| `npm run lint`: código / avisos que no son de capas | 0 / 0 | 0 / 0 |
| Avisos de capas (`contar-capas.mjs`) | **18 en 6 archivos** | **0 en 0 archivos** |
| `gatewayDesdeUi` / `clienteHttp` | 12 / 6 | 0 / 0 |
| `npm run build` | — | OK |

### [x] FE-07 · URLs de fotos en el gateway (2026-10-20)
`features/<f>/api.ts` devuelve `fotoUrl` ya absoluta (`urlDeFoto`). Las páginas y los componentes dejan de importar `@/lib/api/client`. La foto de perfil (que requiere token) se resuelve en un hook de auth que devuelve la URL `blob:`.
- Viene de FE-02: `features/auth/fotoPerfil.ts` (+ test) → `descargarFotoDePerfil` en `features/auth/api.ts` (test a `auth/api.test.ts`; siguen 8 archivos de test). Hacerlo **junto con** el hook, para que `auth/components/FotoDePerfil.tsx` use el hook y no importe `../api` (eso sería un aviso `gatewayDesdeUi` nuevo).

Cierre (2026-10-20, rama `feature/fe-07-urls-de-fotos`).
- **Foto de perfil:** `descargarFotoDePerfil` pasa a `auth/api.ts` y sus 2 tests a `auth/api.test.ts`, ahora sobre el cliente real con `fetch` falso: comprueban que la petición lleva `Authorization` y que se lee como blob. Se borra `auth/fotoPerfil.ts`. El hook `auth/hooks/useFotoDePerfil` devuelve `{ src, fallo }` y libera la URL `blob:`; `FotoDePerfil.tsx` solo pinta. Test nuevo del hook: libera la URL al desmontar, libera sin mostrar una descarga que llega tarde y marca `fallo` si la descarga falla.
- **Gateway:** `map/MapaReportes.tsx` deja de llamar a `urlDeFoto` y ya no importa `@/lib/api/client`, porque la foto llega absoluta de `buscarReportes`. Faltaban 3 respuestas que traen `fotoUrl`: `editarReporte` y `cancelarReporte` (`reportes/api.ts`) y `cambiarEstado` (`gestion/api.ts`). Ahora también pasan por `conFotoAbsoluta`. Fuera de los `api.ts` (y de sus tests), solo `lib/api/catalogos.ts` importa el cliente.
- **CSP (bug previo, encontrado en la verificación en vivo):** `img-src` no listaba el origen del API, así que el navegador bloqueaba toda foto de reporte (estático del backend en `:8080`). No se había visto porque los reportes del seed no tienen foto. Se agrega `apiBaseUrl` a `img-src` en `next.config.ts`.
- Verificación en vivo (Playwright, :3001, `ciudadano1`): se crea un reporte con foto y la foto carga con URL absoluta en la confirmación, Mis reportes, el detalle propio, el detalle público y el popup del mapa. La foto de perfil se sube y se ve como `blob:`, también tras recargar.

| Métrica | Antes | Después |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm test` (con la guarda) | 547 tests en 76 archivos | 551 tests en 76 archivos (2 tests movidos al borrar `fotoPerfil.test.ts`; 4 nuevos en `useFotoDePerfil.test.ts`) |
| `npm run lint`: código / avisos que no son de capas | 0 / 0 | 0 / 0 |
| Avisos de capas (`contar-capas.mjs`) | 0 en 0 archivos | 0 en 0 archivos |
| Imports de `@/lib/api/client` fuera de `api.ts`, `lib/api` y tests | 2 (`map/MapaReportes`, `auth/fotoPerfil`) | 0 |

### [x] FE-08 · Dependencias entre features (2026-10-20)
- `gestion` deja de importar `@/features/reportes/api`: usa `reportes/model/tipos` y su propio `api.ts`.
- Catálogos compartidos: `listarDistritos`, `distritoPorCoordenadas` y `listarCategorias` → `src/lib/api/catalogos.ts`. Los hooks de cada feature lo usan.
  - **Hecho en FE-05 (2026-10-19)**, salvo la reexportación de `listarCategorias` en `reportes/api.ts` (la quitan los hooks de FE-06). Desde FE-05 `otraFeature` = 0.

**Aceptación:** sin avisos `otraFeature`.

Cierre (2026-10-20, rama `feature/fe-08-cierre`): no queda trabajo; solo se registra la evidencia, sobre `develop` en `1a46b48`.
- `grep -rn "@/features/" src/features/gestion | grep -v /model`: sin resultados. `gestion` no importa nada de otra feature salvo `model/`.
- `grep -rnE "from '@/features/[a-z]+/(api|hooks|components)"` en `src/features`, `src/map`, `src/lib`, `src/components` y `src/pwa` (sin tests): sin resultados.
- `listarCategorias` solo se exporta desde `src/lib/api/catalogos.ts`. La reexportación de `reportes/api.ts` ya no existe (la quitó FE-06), y la usan los hooks `desempeno/useIndiceDesempeno`, `reportes/useCategoriasDeReporte`, `reportes/useCatalogosMapa` y `gestion/useBandeja`.
- `contar-capas.mjs`: **0 avisos de capas en 0 archivos** (`otraFeature` = 0) y 0 avisos de lint que no son de capas.

### [x] FE-09 · Cierre
- `npm run lint` con 0 avisos de capas. El cambio de `SEVERIDAD` a `'error'` en `eslint.capas.mjs` lo hace la sesión de raíz, porque la guardia lo bloquea para el agente (WORKFLOW.md §5).
- Actualizar `frontend/README.md` (estructura) y `frontend/CLAUDE.md`.

Cierre (2026-10-25, rama `feature/fe-09-cierre`, sesión de raíz; el usuario autorizó adelantarla ese día):
- `SEVERIDAD = 'error'` en `eslint.capas.mjs`. `npm run lint` sobre `develop` (c05c7d5) termina en 0, sin avisos ni errores.
- Prueba de que la guarda muerde: un `components/` que importa `@/features/auth/api` da **2 errores** (capa de presentación y otra feature) y `npm run lint` sale con 1. El archivo de prueba se borró.
- Documentación: `frontend/README.md` (estructura con las capas), `frontend/CLAUDE.md`, `ARCHITECTURE.md` §5.4 y la tabla de guardas de `WORKFLOW.md` dicen «error desde FE-09».

---

## Núcleo nuevo (después de BE-01 y FE-01; nace ya en capas)

No es migración, es funcionalidad. Se lista aquí para fijar **dónde** va cada pieza. El detalle funcional está en el OB2 §5 y los wireframes.

| ID | Pieza | Dónde (ARCHITECTURE.md) | Depende de |
|---|---|---|---|
| NC-01 | Módulo `municipalidades` y una migración Flyway nueva, con la siguiente versión libre (MUNICIPALIDAD, GESTION_MUNICIPAL, PERIODO_GESTION, REQUISITO_RECEPCION). `municipalidad.distrito_id NOT NULL UNIQUE` → `distrito`, sin geometría propia. Seed de 43 municipalidades: 42 distritales más la MML para Cercado de Lima. `correo_contacto` puede ser nulo. Seed del periodo 2023-2026 (verificar las fechas antes de sembrar). API pública: `MunicipalidadService#deDistrito(distritoId)` y `#periodoVigente(fecha)`. IT: cada distrito tiene exactamente una municipalidad. | §4.3, §8, D-09 | D-09 decidida (04/10). D-10 (jurisdicción del funcionario) no bloquea NC-01 |
| NC-02 | `reportes`: `titulo`, `severidad` y `periodo_gestion_id` | §8 | NC-01 |
| NC-03 | Servicio `inferencia/` (FastAPI + ONNX) con contrato `/v1/detecciones`. **NC-03a:** el servicio con RF-DETR exportado y la medición de latencia y RAM. **NC-03b:** la calibración con ≥ 200 fotos de Lima (`ml-clases-modelo.md`, fases 1 y 2). | §6 | Clases, pesos y umbral decididos el 21/10 (`propuestas/2026-10-21-ml-clases-modelo.md`). NC-03a hecha el 25/10 (#109); NC-03b sin sprint fijo |
| NC-04 | Módulo `clasificacion` (puerto, adaptador falso ahora y HTTP en NC-04b, `PoliticaDeSugerencia` con umbral 0,50), `POST /api/clasificaciones` (vista previa), vista previa en `features/reportes` y `reportes.listener.SugerenciaCategoriaListener` asíncrono (D-08). Requiere `@EnableAsync` con un executor acotado. Su migración agrega `clase_modelo` e `icono` a `categoria_dano`, y `categoria_sugerida_id`, `confianza_sugerencia` y `version_modelo_sugerencia` a `reporte`; además desactiva «Hueco en calzada». IT: la creación responde aunque la inferencia falle, la sugerencia se escribe una sola vez y lo que envíe el cliente se ignora. | §4.3 pasos 1-3, D-08 | Backend con el adaptador falso, hecho el 25/10 (#108). La vista previa del frontend sigue en el S7. El adaptador HTTP es NC-04b |
| NC-04b | `clasificacion/infra/InferenciaHttpAdapter` (`app.clasificacion.tipo=http`) contra `POST /v1/detecciones` de `inferencia/`, según `handoffs/2026-10-25-contrato-inferencia-v1.md` y la sección «Pendiente» de la sugerencia en `backend/README.md`. **Conexión:** `RestClient` sobre el `HttpClient` del JDK, como `ResendCorreoAdapter`, con HTTP/1.1 explícito. La conexión y la lectura suman 3 s como máximo. **Tope de llamadas:** un *bulkhead* en el adaptador, un `Semaphore(4)` con `tryAcquire` sin espera. Sin turno, el adaptador lanza `ClasificacionNoDisponibleException`. Hace falta porque la vista previa suelta su turno antes de `detectar` (`ClasificacionService`) y el `HttpClient` del JDK no limita las conexiones, mientras que el servicio responde 503 a partir de 10 conexiones, contando las de keep-alive. **Errores:** una respuesta distinta de 200, un timeout o un error de conexión dan «sin sugerencia» (`ClasificacionNoDisponibleException`), sin reintentos. Los 4xx se registran aparte de los 5xx y el 503. La respuesta entera se rechaza solo por su estructura: falta `version_modelo` o `detecciones`, los tipos no son los del contrato, o `version_modelo` pasa de 40 caracteres. Se ignoran `caja` y los campos desconocidos. Una clase desconocida o una confianza fuera de [0, 1] no invalida la respuesta, porque las descarta `PoliticaDeSugerencia`. `estaDisponible()` devuelve `true`. Cada llamada registra su duración, que es la medida de latencia de DEP-13. **Configuración:** URL del servicio en `CLASIFICACION_URL` (`app.clasificacion.http.url`), junto a `CLASIFICACION_TIPO` y `CLASIFICACION_UMBRAL`. No se usa `INFERENCIA_*`, porque ese prefijo es de las variables del propio servicio. `ValidacionTipoClasificador` admite `http` y exige la URL solo con `http`. En `prod`, `tipo: ${CLASIFICACION_TIPO}` va **sin valor por defecto**, como `FOTOS_ALMACEN` y `CORREO_TIPO`. `falso.respuesta: ""` sigue literal, así que `CLASIFICACION_TIPO=falso` queda como interruptor para apagar la clasificación sin escribir nada. Se actualizan la cabecera de `application-prod.yml`, la tabla de variables del README del backend y `PerfilProdIT`. **Tests:** el adaptador con `MockRestServiceServer`, con estos casos: 200 con detecciones, 200 sin detecciones, 200 con una clase desconocida, 200 con confianza 1,5, 400, 413, 500, 503, timeout, JSON sin `version_modelo` y `version_modelo` de 41 caracteres. El *bulkhead*: con 6 llamadas simultáneas, a lo sumo 4 llegan al servidor. Un IT contra el contenedor real que solo corre si existe `CLASIFICACION_TEST_URL` (como `FOTOS_S3_TEST_ENDPOINT`), fuera de `CLASES_OBLIGATORIAS`, porque la CI no construye la imagen. Failsafe igual o mayor y ArchUnit en 0. `MIN_SUREFIRE` y `MIN_IT_FAILSAFE` de `ci.yml` los sube la sesión de raíz al fusionar. Al cerrarla, el handoff pasa a «atendido». | §4.3 pasos 1-3, §6, §7, D-08 | NC-03a y NC-04 (backend). Entra al S7 por decisión del usuario del 26/10 |
| NC-05 | Confirmación de reporte + ENVIO_CORREO | §4.3 pasos 3-4 | NC-01, requisitos por municipalidad |
| NC-06 | Dashboard por periodo (`desempeno`) + `app/(municipal)/dashboard` | §4.3 paso 5 | NC-01, fórmulas de los KPIs |
| NC-07 | CONSENTIMIENTO y SUSCRIPCION_PUSH | §8 | — |
| NC-08 | **Captcha en el registro (Google reCAPTCHA v2, casilla «No soy un robot»)**, pedido por el usuario el 27/10. **Backend:** puerto `auth/port/VerificadorDeCaptcha` (`boolean exigido()` y `void verificar(String token)`), con dos adaptadores elegidos por `app.captcha.tipo` (`CAPTCHA_TIPO`): `auth/infra/RecaptchaV2Adapter` (`recaptcha`: `POST https://www.google.com/recaptcha/api/siteverify`, `application/x-www-form-urlencoded` con `secret` y `response`, sin `remoteip` por minimización de datos; `RestClient` sobre el `HttpClient` del JDK como `ResendCorreoAdapter`, 3 s de conexión y 5 s de lectura, sin reintentos) y `auth/infra/SinCaptchaAdapter` (`ninguno`: por defecto fuera de `prod` y fijo en los tests). `auth/infra/ValidacionTipoCaptcha` rechaza otro valor al arrancar, como `ValidacionCorreoSaliente` (vive en `auth` y no en `common` porque solo ese módulo usa el captcha); con `recaptcha` el adaptador exige `CAPTCHA_SECRET`. En `prod`, `tipo: ${CAPTCHA_TIPO}` **sin valor por defecto**. `RegistroRequest` suma `captchaToken` (`@Size(max = 2048)`, opcional en Bean Validation porque con `ninguno` se ignora). `AuthService.registrar` verifica el captcha **antes** que la versión de los términos y que el correo duplicado (si no, el registro serviría para enumerar correos sin captcha) y **fuera de la transacción** (D-13): la llamada HTTP no retiene una conexión del pool; la persistencia queda en `RegistroCuentaService`, transaccional. Falla cerrado: token ausente o rechazado por Google (`success=false`) → 409 `BusinessException` con un mensaje para el ciudadano; Google no responde o responde 5xx → 503 `ServicioNoDisponibleException`. Nunca se registran el token ni el secreto; sí los `error-codes` de Google. **Tests:** el adaptador con `MockRestServiceServer`; `RegistroCaptchaIT` con `@MockitoBean` del puerto (sin token 409, rechazado 409 sin crear la cuenta, correo ya registrado con token rechazado responde el mensaje del captcha y no el del correo, Google caído 503, token válido 201); `ArranqueCaptchaIT` (`prod` sin `CAPTCHA_TIPO` y un valor no admitido); `AuthControllerIT` sigue con `ninguno`; `PerfilProdIT` con `CAPTCHA_TIPO=ninguno`. Handoff `handoffs/2026-10-27-captcha-registro.md`. README del backend: variables y sección «Captcha en el registro». **Frontend (rama propia, se fusiona después del backend):** `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (obligatoria en un despliegue de Vercel, como `NEXT_PUBLIC_API_BASE_URL`); sin ella en local el formulario no muestra el widget ni envía token. Sin dependencia nueva: `features/auth/components/CampoCaptcha` carga `https://www.google.com/recaptcha/api.js?render=explicit&hl=es` una sola vez y usa `grecaptcha.render`; `useRegistro` envía `captchaToken` y, tras cualquier error del registro, reinicia el widget (el token es de un solo uso). Sin casilla resuelta no se envía nada y se muestra un error en línea, como con los términos. CSP limitada por ruta (revisión del 27/10): `script-src` y `connect-src` suman `https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`, y se agrega `frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/`. Fuera de alcance: el captcha en el inicio de sesión y en la recuperación de contraseña. | §4.1 (`auth/port`, `auth/infra`), §4.5, §5.1, D-13 | — |
| NC-10a | **Moderación de la foto en `inferencia/`:** `POST /v1/moderacion` con Marqo `nsfw-image-detection-384` en ONNX (Apache-2.0). Ficha abajo. | §6, §7 | NC-09 (orden del carril). Modelo y umbral decididos el 28/10. Faltan las preguntas abiertas 1 y 10 de `propuestas/2026-10-28-moderacion-de-contenido.md` |
| NC-10b | **Moderación en el backend:** módulo `moderacion` (puerto de foto y filtro de groserías). Rechaza la foto y el texto al crear y editar, y avisa en la vista previa. Falla cerrado (decidido el 28/10). Ficha abajo. | §4.1, §4.3, §4.5, D-13, D-08 | NC-10a en `develop`, BE-11 y las preguntas abiertas 2, 3 y 10 |
| NC-10c | **Moderación en la PWA:** los avisos de foto y texto, el 503 con la cola y la vista previa. Ficha abajo. | §5 | NC-10b en `develop` (handoff) |
| NC-11a | **Ocultar y denunciar, en el backend** (`reportes`): migración, rutas del ADMIN y del CIUDADANO, y la visibilidad de lo oculto. El reporte oculto sale del índice y de la exportación (decidido el 28/10). Ficha abajo. | §4.3, §8 | NC-10b (mismo carril) y las preguntas abiertas 4 a 7 |
| NC-11b | **Ocultar y denunciar, en la PWA:** el botón «Denunciar contenido» y la bandeja del ADMIN. Ficha abajo. | §5 | NC-11a en `develop` (handoff) |

**NC-01, hecha (2026-10-20, PR #70, `c5d2e55`):** módulo `municipalidades` con MUNICIPALIDAD (`distrito_id NOT NULL UNIQUE`, `nombre NOT NULL UNIQUE`, `correo_contacto` nulable) y PERIODO_GESTION (fechas inclusivas, sin solape; seed 2023-01-01 → 2026-12-31), en V15 y V16. Las 43 municipalidades las siembra `municipalidades/infra/MunicipalidadSeeder` después de `DistritoSeeder`, no una migración (en una base vacía los distritos no existen al correr Flyway). API pública: `MunicipalidadService#deDistrito` y `#periodoVigente`. GESTION_MUNICIPAL y REQUISITO_RECEPCION quedan para NC-06 y NC-05 (propuesta `propuestas/2026-10-20-columnas-gestion-y-requisitos.md`, aceptada con la opción A). Failsafe `completed` 284 → 295, Surefire 57 → 59, ArchUnit 0 → 0.

**NC-02 backend, hecha (2026-10-21, PR #74):** `reporte` suma `titulo` (5–120 code points tras el trim), `severidad` (`BAJA < MEDIA < ALTA`, la fija el ciudadano y es pública) y `periodo_gestion_id` (asignado al crear con `MunicipalidadService#periodoVigente`, no expuesto), en V17 con relleno de los reportes existentes. La `Idempotency-Key` ya registrada se resuelve antes de validar los campos nuevos (cola offline). Falta la parte del frontend (handoff `handoffs/2026-10-20-titulo-severidad-reporte.md`). Failsafe `completed` 295 → 309, Surefire 59 → 62, ArchUnit 0 → 0.

### [ ] NC-10 · Moderación automática de la foto y del texto (decidida en parte el 28/10)

**Decisiones del usuario (28/10):**
- una foto obscena o sexual se rechaza al subirla, con el aviso «La foto no está permitida», y nunca se guarda ni se publica;
- el análisis corre en `inferencia/`, con un modelo abierto y sin APIs de terceros;
- una descripción con palabras ofensivas se rechaza con un aviso que no repite la palabra, usando una lista fija de groserías del español peruano, normalizada.

**Decisiones del usuario sobre la propuesta (28/10):**
- **Modelo:** Marqo `nsfw-image-detection-384`, revisión `0c26ec2`, con umbral inicial de 0,70.
- **Si el servicio no responde, se falla cerrado:**
  - el reporte con foto recibe un 503;
  - la PWA ofrece la cola sin conexión o «Enviar sin foto»;
  - `MODERACION_TIPO=ninguna` queda como interruptor.
- **Términos:** la moderación va dentro de la v2 (no hay v3), en la rama `feature/doc-terminos-v2-moderacion`.

**Diseño y preguntas abiertas:** `propuestas/2026-10-28-moderacion-de-contenido.md`. **No se empieza hasta que el usuario decida** las preguntas abiertas 1, 2, 3 y 10 de esa propuesta. Si decide algo distinto de lo recomendado, la sesión de raíz ajusta esta ficha.

**La v2 de los términos promete la moderación,** así que NC-10 tiene que salir en la misma versión que la v2. Si no llega, la sesión de raíz recorta el párrafo antes de publicar.

**Orden:** va **después de NC-09** (confirmación del correo, en curso en el carril de backend). Las piezas van en este orden de dependencia: NC-10a → NC-10b → NC-10c. NC-10b necesita además BE-11 (la foto se sube fuera de la transacción). En producción, el backend con `MODERACION_TIPO=http` se despliega solo después de DEP-13 y de NC-10a.

#### NC-10a · `inferencia/`: `POST /v1/moderacion`
- **Modelo:**
  - `Marqo/nsfw-image-detection-384`, revisión `0c26ec22111b83f106d72a55f611ec35962bcb65` (Apache-2.0; `vit_tiny_patch16_384`, 5,6 M de parámetros);
  - se exporta a ONNX en la etapa `exportador` del `Dockerfile` (`timm` fijado en `requirements-exportar.txt`), con el hash registrado en `modelos/moderacion.json` y `--comprobar`, como RF-DETR;
  - los pesos no se versionan.
- **Contrato:**
  - `POST /v1/moderacion`, multipart con el campo `imagen` → `{"version_modelo": str ≤ 40, "puntaje": float en [0, 1]}`. `puntaje` es la probabilidad de contenido sexual explícito y siempre se devuelve: no hay piso técnico;
  - los errores y la validación previa (bytes, cabecera, píxeles) son los de `/v1/detecciones`;
  - `/salud` suma `version_moderacion`.
- **Preprocesado:**
  - el de evaluación de timm: bicúbico de Pillow con el lado menor a 384 y normalización de 0,5/0,5;
  - **dos recortes de 384** que cubren todo el lado mayor, y se toma el máximo;
  - el orden de las etiquetas es `["NSFW", "SFW"]`.
- **Concurrencia:**
  - `CapacityLimiter(2)` y candado propios, así que una moderación no espera detrás de RF-DETR;
  - `INFERENCIA_MODERACION_HILOS=1`, fijo;
  - `--limit-concurrency` (10) sigue contando los dos endpoints.
- **Capas (§6):** `domain` (`ModeloDeModeracion`, `PuntajeModeracion`), `application/ModerarImagen` (comparte la validación con `DetectarDanos`), `infrastructure/OnnxModeracion` y `api/moderacion.py`. La guarda de import-linter no cambia.
- **Calibración** (pregunta abierta 1; esto es lo recomendado):
  - `scripts/calibrar_moderacion.py` lee una carpeta **fuera del repo** y da la distribución de puntajes y el umbral sugerido;
  - la regla es el valor más bajo sin ningún rechazo en el conjunto negativo, más 0,15, siempre entre 0,5 y 0,9;
  - el conjunto negativo son ≥ 300 fotos de RDD2022, las fotos de Lima de NC-03b cuando existan y ≥ 50 de calles con gente.

**Aceptación:**
- La paridad ONNX/timm está registrada en `moderacion.json`: puntajes con una diferencia de 10⁻³ como máximo sobre las imágenes sintéticas de `scripts/sinteticas.py`.
- La misma foto da el mismo `puntaje` en corridas repetidas.
- Medición en Docker con `--cpus=2`:
  - la RAM máxima con los dos modelos y 4 clientes mezclados queda **por debajo de 700 MiB**;
  - se anota el p50 y el p95 de `/v1/moderacion`.
  - Las cifras van al README.
- El informe de calibración (sin imágenes) va al README, con el umbral que se recomienda al backend.
- Handoff `handoffs/AAAA-MM-DD-contrato-inferencia-moderacion.md`, en estado `pendiente`.

**Tests:**
- `test_moderar.py`: el caso de uso con dobles y el orden de las validaciones.
- `test_api.py`: el contrato exacto, el OpenAPI, todos los errores y que el limitador es independiente del de detecciones.
- `test_onnx_moderacion.py`: un **`.onnx` sintético** de 2 salidas, los dos recortes en una foto apaisada y en una vertical, y el máximo.
- `test_modelo_real.py`: la huella del modelo real; se omite sin pesos.
- **Ninguna imagen real de ninguna clase en el repo ni en la CI.**
- `lint-imports` en verde. `MIN_PYTEST_INFERENCIA` lo sube la sesión de raíz al fusionar.

#### NC-10b · Backend: módulo `moderacion`
- **Módulo nuevo** `moderacion` (D-15, si se acepta), sin dependencias salvo `common`:
  - `port/ModeradorDeImagen` y `domain/PoliticaDeModeracion` (rechaza si `puntaje ≥ umbral`);
  - `domain/FiltroDeGroserias` (regla pura);
  - `infra/InferenciaModeracionHttpAdapter`, `infra/SinModeracionAdapter`, `infra/ValidacionTipoModeracion` e `infra/ListaDeGroseriasConfig`;
  - `service/ModeracionService`.
  - Lo usan `reportes` y `clasificacion`.
- **Adaptador HTTP:**
  - sigue el patrón de `InferenciaHttpAdapter`: `RestClient` sobre el `HttpClient` del JDK con HTTP/1.1, 500 + 2 500 ms, sin reintentos y validación solo de la estructura;
  - un `puntaje` fuera de [0, 1] o una `version_modelo` de más de 40 caracteres dejan la respuesta fuera de contrato;
  - el turno es un **`Semaphore(4)` con `tryAcquire` de hasta 1 s** en la creación y **sin espera** en la vista previa;
  - registra la duración de cada llamada.
- **Configuración:**
  - `MODERACION_TIPO` (`http` | `ninguna`) es obligatoria en `prod`, sin valor por defecto, y vale `ninguna` fuera de `prod`;
  - `MODERACION_URL` se exige con `http`;
  - `MODERACION_UMBRAL` vale 0,70 por defecto y se valida entre 0,5 y 0,9;
  - con `ninguna`, el arranque deja un WARN.
  - Se actualizan `application-prod.yml`, la tabla de variables del README y `PerfilProdIT`.
- **Creación** (`POST /api/reportes`). En este orden, y **sin transacción abierta** hasta el paso 5:
  1. el reenvío idempotente con respuesta guardada se devuelve sin moderar;
  2. se validan los campos y el texto;
  3. la foto se sanea **una sola vez**;
  4. se modera la foto;
  5. se sube la foto saneada **sin volver a sanearla**, y recién después va la transacción.

  Si BE-11 no deja un método del puerto de fotos que reciba una foto ya saneada, esta tarea lo agrega: volver a sanear rompe la paridad de D-08.
- **Errores:**
  - **400** `FOTO_NO_PERMITIDA` («La foto no está permitida. Toma otra.»);
  - **400** `TEXTO_NO_PERMITIDO` con el campo en `details` y un mensaje que **no** repite la palabra;
  - **503** `MODERACION_NO_DISPONIBLE` ante un timeout, un error del servicio o la falta de turno (falla cerrada, decidida el 28/10).
  - Hacen falta `common/exception/ContenidoNoPermitidoException` y un `codigo` en `ServicioNoDisponibleException`.
- **Texto:**
  - se revisan el título y la descripción al crear y al editar, y el contenido del comentario (US-27);
  - el nombre del perfil, solo si el usuario lo decide (pregunta abierta 2 de la propuesta).
  - La lista va en `src/main/resources/moderacion/groserias-es-pe.txt`, con una cabecera de versión y criterios. **El usuario aprueba su contenido en el PR.**
  - La normalización es la de la propuesta, §5: NFKC, minúsculas, tildes fuera **sin plegar la ñ**, *leetspeak* (el 1 vale como i y como l), comodín `*` o `#`, unión de letras sueltas y rachas reducidas a 2 y a 1. La comparación es por token entero o por expresiones de 2 a 4 tokens.
- **Vista previa:** `ClasificacionResponse` suma `fotoRechazada: boolean`.
  - Si la foto se rechaza, no se clasifica.
  - Si no se pudo revisar, vale `false`.
  - Con `/contrato`.
- **Registro:**
  - de una foto rechazada no se guarda nada; el log deja un WARN con el usuario, el puntaje redondeado y la versión;
  - de un texto rechazado, el log guarda el campo, la entrada que coincidió y la versión de la lista, nunca el texto.
- **Fuera de alcance:**
  - la foto de perfil (es privada);
  - los tickets de soporte;
  - las categorías y el responsable (los escribe el personal municipal).

**Aceptación:**
- **Una foto rechazada:**
  - responde 400 `FOTO_NO_PERMITIDA`;
  - no crea el reporte ni la adhesión;
  - no publica `ReporteCreadoEvent`;
  - no deja ningún objeto en el almacenamiento.
- **Sin servicio:**
  - 503 `MODERACION_NO_DISPONIBLE`, sin nada creado;
  - el reenvío con una `Idempotency-Key` ya registrada devuelve la respuesta guardada aunque el servicio esté caído.
- **Sin foto,** el moderador no se llama.
- **Texto ofensivo** en el título, la descripción (al crear y al editar) o el comentario: 400 `TEXTO_NO_PERMITIDO` sin la palabra en el cuerpo.
- **Vista previa:**
  - una foto rechazada da `fotoRechazada: true` y ninguna categoría;
  - sin servicio, `false` y la sugerencia de siempre.
- La transacción de creación no está abierta mientras se modera (`TransactionSynchronizationManager.isActualTransactionActive()` en un doble del puerto).
- Failsafe igual o mayor, ArchUnit en 0 y el handoff `handoffs/AAAA-MM-DD-moderacion.md` en estado `pendiente`.

**Tests:**
- `FiltroDeGroseriasTest` (puro):
  - las variantes positivas: tildes, mayúsculas, *leetspeak*, letras repetidas, letras separadas, comodín y expresiones;
  - las negativas: «vehículo», «obstáculo», «película», «computadora», «disputa», «año», «cono», «pera» y apellidos.
- `ListaDeGroseriasTest`:
  - el archivo tiene versión y ningún duplicado, y cada entrada está normalizada;
  - **ninguna palabra** del corpus de prueba `moderacion/corpus-legitimo.txt` (vocabulario vial, los 43 distritos, apellidos comunes) coincide con la lista.
- `PoliticaDeModeracionTest`: el borde del umbral y el rango.
- `InferenciaModeracionHttpAdapterTest` con `MockRestServiceServer`: 200, 200 sin `version_modelo`, `puntaje` 1,5, 400, 413, 500, 503 y timeout. El turno: con 6 llamadas simultáneas, a lo sumo 4 llegan al servidor.
- `ModeracionCreacionIT` y `VistaPreviaModeracionIT`, con `@MockitoBean` del puerto.
- `ArranqueModeracionIT`:
  - `prod` sin `MODERACION_TIPO` no arranca;
  - tampoco con un valor no admitido;
  - ni con `http` sin URL.
- Un IT contra el contenedor real que corre solo si existe `MODERACION_TEST_URL`, fuera de `CLASES_OBLIGATORIAS`.
- `MIN_SUREFIRE` y `MIN_IT_FAILSAFE` los sube la sesión de raíz.

#### NC-10c · PWA: avisos de moderación
- **Foto rechazada:**
  - con 400 `FOTO_NO_PERMITIDA`, o con `fotoRechazada: true` en la vista previa, `FormularioReporte` muestra «La foto no está permitida. Toma otra.» junto a la foto;
  - quita la foto y no deja enviar con ella;
  - **conserva el resto del formulario**.
- **Texto rechazado:** con 400 `TEXTO_NO_PERMITIDO`, el error va en el campo de `details` (título, descripción, o el comentario en `Comentarios` y `EditarReporte`). Nunca se muestra la palabra.
- **Sin servicio:** con 503 `MODERACION_NO_DISPONIBLE`, el formulario ofrece «Guardar para enviar después» (la cola de US-06 con la **misma** `Idempotency-Key`, que ya reintenta los 5xx) y «Enviar sin foto».
- **Cola:** un reenvío que recibe `FOTO_NO_PERMITIDA` o `TEXTO_NO_PERMITIDO` queda `rechazado` con ese motivo, como cualquier 4xx.
- **Tipos y contrato:** `npm run api:sync` y los tipos en `model/`; el handoff de NC-10b pasa a «atendido».

**Aceptación:**
- Tests de `FormularioReporte`, `useCrearReporte`, `useSugerenciaDeCategoria`, `useColaOffline`, `EditarReporte` y `Comentarios` para cada código.
- `npm run typecheck`, `npm test` y `npm run lint` en verde.
- Verificación en vivo con el backend en `MODERACION_TIPO=ninguna` y con un doble que rechaza.

### [ ] NC-11 · Ocultar y denunciar (decidida en parte el 28/10)

**Decisión del usuario (28/10):**
- el ADMIN puede ocultar un reporte, o solo su foto, ya publicados, con un motivo y un registro en la línea de tiempo;
- los ciudadanos pueden denunciar un reporte público con el botón «Denunciar contenido», y la denuncia llega a una bandeja del ADMIN.

**Decisión del usuario sobre la propuesta (28/10): un reporte oculto por el ADMIN se excluye del índice de desempeño.** Es lo contrario de lo que recomendaba la propuesta. SEC-01 se mantiene porque solo el ADMIN (la plataforma) oculta y la municipalidad nunca: nadie mueve sus propias métricas. Hace falta:
- que la vista del índice y la exportación excluyan lo oculto;
- que ocultar y restablecer disparen el `REFRESH`;
- IT que lo prueben;
- que quede claro en la línea de tiempo.

Ocultar **solo la foto** no cambia el índice: el reporte sigue público.

**Diseño y preguntas abiertas** (4 a 7): `propuestas/2026-10-28-moderacion-de-contenido.md`, §6. **No se empieza hasta que el usuario las decida.**

**Orden:** después de NC-09 y de NC-10b, en el mismo carril de backend. NC-11a → NC-11b.

#### NC-11a · Backend (`reportes`)
- **Migración** (la siguiente versión libre; NC-09 toma V20):
  - `reporte.oculto` y `reporte.foto_oculta` (`BOOLEAN NOT NULL DEFAULT FALSE`), con un índice en `reporte.foto_url`;
  - cuatro tipos de evento nuevos en `historial_estado_reporte` (`FOTO_OCULTA`, `REPORTE_OCULTO`, `FOTO_RESTABLECIDA`, `REPORTE_RESTABLECIDO`), sin estados y con el motivo obligatorio (se reemplazan los dos CHECK de V4);
  - la tabla `denuncia_reporte`, con `UNIQUE (reporte_id, denunciante_id)` y el estado `PENDIENTE` | `ATENDIDA` | `DESESTIMADA`;
  - **la vista `mv_indice_desempeno_distrital`, creada de nuevo como en V7**, con `AND NOT r.oculto` en el `LEFT JOIN` de `reporte` y su índice único `ux_mv_indice_desempeno_id`. Las calificaciones de un reporte oculto tampoco cuentan.
  - `denuncia_reporte` entra en `AbstractPostgisIT.limpiezaFkSafe()`.
- **Índice:**
  - al ocultar o restablecer **el reporte** (no la foto), el servicio publica `reportes/event/ReporteVisibilidadCambiadaEvent`;
  - `desempeno/listener/IndiceDesempenoRefreshListener` suma un manejador `AFTER_COMMIT` que refresca, igual que los cuatro que ya tiene. Si BE-12 ya entró, el refresco es asíncrono y coalescido como el resto;
  - la exportación (`buscarParaExportar`) excluye los reportes ocultos.
- **Rutas:**
  - `POST /api/reportes/{id}/denuncias` (CIUDADANO): una por reporte, 10 por día y nunca sobre el propio reporte;
  - `GET /api/admin/moderacion/reportes`, `GET /api/admin/moderacion/reportes/{id}` y `GET /api/admin/moderacion/reportes/{id}/foto`, con `Cache-Control: private, no-store`;
  - `POST /api/admin/moderacion/reportes/{id}/ocultamiento`, `/restablecimiento` y `/desestimacion` (ADMIN), con `alcance` `REPORTE` | `FOTO` y un motivo de 10 a 500 caracteres.
  - Ninguna ruta es pública.
- **Visibilidad** (la tabla de la propuesta, §6):
  - **reporte oculto:**
    - sale de la búsqueda, del área, de la densidad, del detalle público (404), de los comentarios (404), de `mis-adhesiones`, del índice y de la exportación;
    - sigue en `mis-reportes` del creador;
    - en la bandeja municipal, según la pregunta abierta 5: lo recomendado es que también salga. Si se queda, lleva `ocultoPorModeracion` en `ReporteGestionResponse`;
  - **foto oculta:** `fotoUrl` en `null` en todos los DTO que no son del ADMIN;
  - `findReporteActivoCercano` ignora los reportes ocultos.
- **Fotos:**
  - `WebMvcConfig` consulta el puerto nuevo `common/port/VisibilidadDeFotosDeReporte`, que implementa `reportes/infra/JpaVisibilidadDeFotosAdapter`, y responde 404 si la foto no es de un reporte visible;
  - la foto de reporte suma `s-maxage=3600` (si el usuario elige esa opción, pregunta abierta 6).
- **Línea de tiempo** (`SeguimientoReporteService`):
  - el motivo lo ven el creador, el funcionario y el ADMIN; los adheridos ven un texto fijo, y el autor solo lo ve el ADMIN;
  - `REPORTE_OCULTO` agrega, para todos, el texto fijo «Mientras esté oculto, este reporte no cuenta en el índice de desempeño.» y `REPORTE_RESTABLECIDO`, «Vuelve a contar en el índice de desempeño.». Los arma el servidor y no el ADMIN.
- **SEC-01 y señales internas:**
  - solo el ADMIN oculta; el FUNCIONARIO_MUNICIPAL y el CIUDADANO reciben 403 en toda ruta de moderación;
  - no hay ocultamiento automático por denuncias;
  - `ReporteResumenResponse` y `ReporteResponse` no ganan campos;
  - las denuncias solo aparecen en los DTO del ADMIN.
  - La sección SEC-01 de `backend/README.md` suma la salida del índice por moderación: la única fuera de `CANCELADO`, en manos de un actor que no se mide.
- **Fuera de alcance:**
  - la notificación al creador cuando se oculta;
  - ocultar un comentario suelto;
  - borrar la foto oculta (se conserva en privado hasta restablecerla).

**Aceptación:**
- `DenunciaReporteIT`:
  - 201;
  - 409 por repetida, por propia y por el límite diario;
  - 404 si el reporte está oculto, cancelado o no existe;
  - 401 anónimo y 403 funcionario.
- `OcultamientoReporteIT`: cada fila de la tabla de visibilidad, `/media/...` con 404, el historial con su redacción y el texto del índice, restablecer, y 403 para quien no es ADMIN.
- **`IndiceSinOcultosIT`** (decisión del 28/10):
  - ocultar el reporte baja `total_reportes` del distrito y de su categoría después del refresco, y también `total_resueltos` y las calificaciones si estaba resuelto y calificado;
  - restablecerlo devuelve los valores de antes;
  - ocultar solo la foto no cambia nada;
  - el refresco ocurre por el evento, sin llamarlo a mano (con sondeo acotado si BE-12 ya entró);
  - la exportación no trae el reporte oculto.
- Un IT de componentes de los DTO públicos: la misma lista que antes.
- La deduplicación ignora los reportes ocultos.
- Failsafe igual o mayor, ArchUnit en 0 y el handoff `handoffs/AAAA-MM-DD-ocultar-y-denunciar.md` en estado `pendiente`.
- **BE-14** tiene que anonimizar `denuncia_reporte.denunciante_id` (se anota en su ficha cuando entre).

#### NC-11b · PWA
- **Botón «Denunciar contenido»** en `DetalleReportePublico`:
  - el CIUDADANO con sesión abre un diálogo con el motivo y un detalle opcional;
  - sin sesión, el enlace lleva a iniciar sesión;
  - un 409 se muestra como «Ya denunciaste este reporte» o «Alcanzaste el máximo de denuncias por hoy».
  - Hook `useDenunciarReporte` y `denunciarReporte` en `reportes/api.ts`.
- **Área del ADMIN** en `app/(admin)/admin/moderacion` (bandeja y detalle), con la feature `features/moderacion/` (`components`, `hooks`, `model`, `api.ts`):
  - la foto se trae con `apiFetch` y se muestra como `blob:`, como la foto de perfil;
  - ocultar, restablecer y desestimar piden el motivo;
  - `GuardiaDeRol` con `ADMIN`.
- **Línea de tiempo:** `LineaDeTiempo` muestra los cuatro tipos nuevos, con el texto del índice que manda el servidor (`lib/types/domain.ts` suma las uniones).
- **Diálogo de ocultar del ADMIN:** con alcance `REPORTE`, avisa que el reporte saldrá del índice de desempeño del distrito; con `FOTO`, que el índice no cambia.

**Aceptación:**
- Tests del diálogo, del hook, de la bandeja y del detalle (sin mapa), y de las etiquetas de `LineaDeTiempo`.
- `npm run typecheck`, `npm test` y `npm run lint` en verde.
- Verificación en vivo: un ciudadano denuncia; el ADMIN oculta la foto y después el reporte; el público deja de verlos; el creador ve el motivo.
- El handoff de NC-11a pasa a «atendido».
