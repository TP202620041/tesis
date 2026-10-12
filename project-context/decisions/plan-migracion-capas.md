# Plan de migración a capas uniformes

> Norma: `ARCHITECTURE.md`. Este plan lleva el código actual a esa norma **sin cambiar comportamiento**: ninguna tarea toca el contrato del API ni la base de datos.
> Cómo se ejecuta cada tarea: `WORKFLOW.md` (`/tarea <ID>`, `/verificar`, `/revisar`).
> El backend y el frontend migran **en paralelo**, porque no comparten archivos. Cada tarea es un commit `ARQ BE-xx` o `ARQ FE-xx`.
> Creado el 2026-10-03. Marcar `[x]` y anotar la fecha al cerrar cada tarea.

## Definición de terminado (todas las tareas)

| Agente | Condición |
|---|---|
| Backend | `mvn clean verify` en verde. `completed` en `target/failsafe-reports/failsafe-summary.xml` **igual** al de la línea base (una tarea de arquitectura no agrega ni quita IT). `src/test/resources/archunit_store` **más chico o igual**. |
| Frontend | `npm run typecheck`, `npm test` (con su guarda) y `npm run lint` en verde. Avisos `capas/*` **menos o igual** que antes. |

Los tests se **mueven** con el código que prueban; no se borran.

---

## Backend

### [ ] BE-01 · Instalar la guarda y medir la línea base
**Prerrequisito de todo lo demás.**
1. Verificar que `pom.xml` tenga `archunit-junit5` 1.3.0 y que existan `src/test/java/pe/edu/upc/viasegura/arquitectura/ArquitecturaCapasTest.java` y `src/test/resources/archunit.properties`.
2. `mvn test -Dtest=ArquitecturaCapasTest`. El test **no se probó en compilación** (Maven Central estaba bloqueado en el entorno donde se escribió). Si no compila, corregir solo la API de ArchUnit y no relajar ninguna regla. Si una regla falla por “empty should”, revisar el patrón de paquetes.
3. La primera corrida crea `src/test/resources/archunit_store/`. Commitearlo.
4. Anotar aquí el número de violaciones congeladas por regla (líneas de cada archivo del almacén) y el `completed` de Failsafe de `mvn clean verify`.

**Aceptación:** el test pasa, el almacén está versionado y la línea base está anotada.
Línea base (medida por el coordinador el 11/10 sobre el almacén que se generó el 04/10 a las 00:44; falta el `completed` de Failsafe):
| Regla | Violaciones congeladas |
|---|---|
| Un módulo no usa controller, listener, repository ni infra de otro módulo | 51 |
| Los módulos no tienen dependencias circulares | 1 (ciclo `auth` ↔ `reportes`) |
| dto/ contiene solo contratos HTTP | 1 (`CrearReporteCommand`) |
| Las otras 6 reglas | 0 |
| **Total** | **53** |

Nota: la regla `capas` da 0 porque `geo/`, `storage/` y `adapter/` todavía no pertenecen a ninguna capa. Las violaciones de esa regla aparecerán, si las hay, cuando BE-02 los mueva a `port/` e `infra/`. Eso es esperado y no cuenta como retroceso.
Pendiente del agente de backend: commitear el almacén si no lo está, y anotar aquí el `completed` de `mvn clean verify`.

### [ ] BE-02 · Puertos y adaptadores
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

### [ ] BE-03 · Infraestructura suelta en otras capas
- `distritos/service/DistritoSeeder` → `distritos/infra/`. Es arranque, no un caso de uso.
- `reportes/service/ExportarReportesService`: separar la escritura con Apache POI en `reportes/infra/ExcelReportesExportador`, que implementa `reportes/port/ExportadorReportes`. El servicio arma las filas, el adaptador escribe el archivo.
- `reportes/service/ReincidenciaDetector` → `reportes/domain/`, si es una regla pura (palabras clave sin I/O). Si depende de algo de Spring además de `@Component`, dejarlo en `service/` y anotarlo aquí.

**Aceptación:** `service/` no importa `org.apache.poi`, y el almacén baja.

### [ ] BE-04 · Contratos
- `reportes/dto/CrearReporteCommand` → `reportes/service/`.
- Revisar que todo lo demás en `*/dto/` sea `*Request`, `*Response` o un enum de parámetro.

**Aceptación:** la regla `contratosSoloRequestResponse` queda sin violaciones congeladas.

### [ ] BE-05 · Manejadores de eventos
Todo método `@TransactionalEventListener` o `@EventListener` debe vivir en `<modulo>/listener/`. Mover los que estén en otro lugar. Si un listener escribe en la base, debe declarar `@Transactional(propagation = REQUIRES_NEW)`.
**Aceptación:** la regla `manejadoresDeEventosEnListener` queda sin violaciones congeladas.

### [ ] BE-06 · API pública entre módulos
Reemplazar cada uso de `repository/` (o `controller/`, `listener/`, `infra/`) de **otro** módulo por un método del `service` de ese módulo. Por ejemplo, si `reportes` usa `UsuarioRepository` o `DistritoRepository`, pasa a usar `AuthService#…` o `DistritoService#…` con métodos de consulta explícitos. La lista exacta sale de la regla `soloApiPublicaDeOtrosModulos` en el almacén.
**Aceptación:** esa regla queda sin violaciones congeladas, sin cambios en los IT.

### [ ] BE-07 · Ciclos entre módulos
Resolver lo que reporte `modulosSinCiclos`. **Ciclo real (almacén del 04/10): `auth` ↔ `reportes`.** `auth` usa `reportes.storage.FotoStorageService` (fotos de perfil, en `AuthService` y `PerfilFotoService`), y `reportes.domain` referencia `auth.domain.Usuario`. La segunda dirección es legítima; la que hay que cortar es la de `auth` hacia `reportes`. **Decidido (D-11, 11/10):** el puerto de fotos pasa a `common`, y ese movimiento (primer commit de BE-02) corta el ciclo, porque esos dos imports son la única dependencia de `auth` hacia `reportes`. BE-07 se cierra al verificar que la regla queda en 0. Otro caso posible: `common.security` ↔ `auth`. Para cortarlo, `common.security` debe depender solo de la interfaz `UserDetailsService` de Spring; `auth` provee el bean. Si cortar un ciclo exige mover una clase entre módulos, proponerlo antes en `project-context/decisions/`.
**Aceptación:** la regla queda sin violaciones congeladas.

### [ ] BE-08 · Cierre
- El almacén vacío, o con violaciones residuales que el arquitecto aceptó y que quedan listadas en `ARCHITECTURE.md` §9.
- Actualizar la sección “Estructura del proyecto” de `backend/README.md` y la de arquitectura de `backend/CLAUDE.md`.

### [ ] BE-09 · (Opcional, después de BE-08) Partir `reportes`
Si el tamaño lo justifica, separar `categorias` (CategoriaDano y su CRUD, US-29) y `participacion` (calificación, comentarios y reincidencia, US-26 y US-27). Requiere aprobación previa: mueve tablas de módulo y afecta `limpiezaFkSafe`.

---

## Frontend

### [ ] FE-01 · Instalar la guarda y medir la línea base
1. Verificar que `eslint.capas.mjs` exista y que `eslint.config.mjs` lo incluya al final.
2. `npm run lint`. Anotar los avisos por bloque `capas/*`. La medición previa (03/10) se hizo solo con los imports y dio **66 avisos en 24 archivos**. La cifra real puede variar un poco por los `export … from` y los imports de tipos.
3. Confirmar que `npm run lint` siga terminando con código 0, porque son avisos y no errores.

Línea base: _(completar)_

### [ ] FE-02 · Reglas puras a `model/`
| Hoy | Destino |
|---|---|
| `features/gestion/transiciones.ts` (+ test) | `features/gestion/model/transiciones.ts` |
| `features/reportes/acciones.ts` (+ test) | `features/reportes/model/acciones.ts` |
| `features/reportes/mapa/bbox.ts` (+ test) | `features/reportes/model/bbox.ts` |
| `features/reportes/mapa/estados.ts` (+ test) | `src/lib/types/estados.ts`: lo usan `gestion`, `reportes` y `components/LineaDeTiempo` |
| `features/desempeno/formato.ts` (+ test) | `features/desempeno/model/formato.ts` |
| `features/auth/rutas.ts` (+ test) | `features/auth/model/rutas.ts` |
| `features/auth/fotoPerfil.ts` (+ test) | `model/` si es puro; si usa el cliente HTTP o `blob:`, va a `features/auth/api.ts` |

**Aceptación:** `npm test` corre la misma cantidad de archivos de test que antes, y no queda la carpeta `features/reportes/mapa/`.

### [ ] FE-03 · Tipos en `model/`
Crear `features/<f>/model/tipos.ts` con los alias sobre `generated/schema` (`ReporteResumen`, `HistorialEntrada`, `AsignacionResponsable`…). `api.ts`, los hooks y los componentes importan los tipos desde ahí. `components/LineaDeTiempo.tsx` y `desempeno/formato.ts` dejan de importar `generated/schema`.
**Aceptación:** el bloque `capas/*` no tiene avisos de `schema`.

### [ ] FE-04 · Imports internos relativos
Dentro de cada feature, cambiar `@/features/<misma>/…` por imports relativos. Casos detectados: `FormularioReporte` → `CampoFoto`/`CampoUbicacion` y `GuardiaDeRol` → `auth/hooks`.

### [ ] FE-05 · Hooks de carga y páginas como composición
1. Crear `src/lib/hooks/useCarga.ts` con el patrón de `ARCHITECTURE.md` §5.5, con tests de la cancelación.
2. Agregar `mensajeDeError(e: unknown): { mensaje: string; detalles: string[] }` a `src/lib/api/errors.ts`.
3. Mover `features/auth/hooks.ts` → `features/auth/hooks/useSesion.ts` y `features/reportes/useGeolocalizacion.ts` → `features/reportes/hooks/`.
4. Por cada página con `useEffect` de datos, crear el hook y llevar el contenido a un componente de la feature: `mis-reportes`, `mis-reportes/[id]`, `perfil`, `bandeja`, `bandeja/[id]`, `desempeno`, `mapa`, `reportes/[id]`, `reportar` y `sesion`.

**Aceptación:** ninguna página de `app/` usa `useEffect` para cargar datos ni importa `api.ts`.

### [ ] FE-06 · Mutaciones en hooks
Los componentes que hoy llaman al API pasan a usar un hook de su feature: `CambiarEstado`, `Responsable`, `Calificar`, `Comentarios`, `EditarReporte`, `FormularioReporte`, `FormularioLogin` y `FormularioRegistro`. El hook captura el error con `mensajeDeError`, y el componente ya no importa `ApiError` ni `NetworkError`. **Se conserva** la regla de `Idempotency-Key` de `FormularioReporte`: la clave vive en el hook y no se regenera en un reintento.

### [ ] FE-07 · URLs de fotos en el gateway
`features/<f>/api.ts` devuelve `fotoUrl` ya absoluta (`urlDeFoto`). Las páginas y los componentes dejan de importar `@/lib/api/client`. La foto de perfil (que requiere token) se resuelve en un hook de auth que devuelve la URL `blob:`.

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
