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

**NC-01, hecha (2026-10-20, PR #70, `c5d2e55`):** módulo `municipalidades` con MUNICIPALIDAD (`distrito_id NOT NULL UNIQUE`, `nombre NOT NULL UNIQUE`, `correo_contacto` nulable) y PERIODO_GESTION (fechas inclusivas, sin solape; seed 2023-01-01 → 2026-12-31), en V15 y V16. Las 43 municipalidades las siembra `municipalidades/infra/MunicipalidadSeeder` después de `DistritoSeeder`, no una migración (en una base vacía los distritos no existen al correr Flyway). API pública: `MunicipalidadService#deDistrito` y `#periodoVigente`. GESTION_MUNICIPAL y REQUISITO_RECEPCION quedan para NC-06 y NC-05 (propuesta `propuestas/2026-10-20-columnas-gestion-y-requisitos.md`, aceptada con la opción A). Failsafe `completed` 284 → 295, Surefire 57 → 59, ArchUnit 0 → 0.

**NC-02 backend, hecha (2026-10-21, PR #74):** `reporte` suma `titulo` (5–120 code points tras el trim), `severidad` (`BAJA < MEDIA < ALTA`, la fija el ciudadano y es pública) y `periodo_gestion_id` (asignado al crear con `MunicipalidadService#periodoVigente`, no expuesto), en V17 con relleno de los reportes existentes. La `Idempotency-Key` ya registrada se resuelve antes de validar los campos nuevos (cola offline). Falta la parte del frontend (handoff `handoffs/2026-10-20-titulo-severidad-reporte.md`). Failsafe `completed` 295 → 309, Surefire 59 → 62, ArchUnit 0 → 0.
