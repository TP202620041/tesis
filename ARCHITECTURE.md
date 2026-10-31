# Arquitectura de software — Ciudad Viva

> **Documento normativo.** Define las capas, qué va en cada una y qué puede depender de qué, igual para `backend/`, `frontend/` y el futuro `inferencia/`. Los agentes de cada carpeta lo siguen; no lo modifican salvo pedido explícito (ver §10).
> Versión 1.8 · 2026-10-31 (§4.5: tareas programadas, BE-15; antes, en 1.7, el I/O externo antes de escribir de BE-11 y el refresco coalescido del índice de BE-12) · Plan de migración: `project-context/decisions/plan-migracion-capas.md`.

## 1. Principios

1. **Mismas cuatro capas en todos los contenedores**: presentación, aplicación, dominio e infraestructura. Cambia el nombre de la carpeta según la tecnología; no cambia la responsabilidad.
2. **Capas dentro de cada módulo.** Primero se divide por módulo funcional (`reportes`, `auth`…) y dentro de cada módulo por capa. Así un módulo se entiende, se prueba y se mueve completo.
3. **Las dependencias apuntan hacia el dominio.** El dominio no conoce HTTP, la base de datos, React ni proveedores externos.
4. **La infraestructura externa entra por un puerto.** SMTP, almacenamiento de fotos, servicio de IA y cálculo geoespacial se definen como interfaz (puerto) y se implementan en un adaptador intercambiable.
5. **Toda regla de este documento tiene una guarda automática** (ArchUnit en el backend, ESLint en el frontend). Una regla sin guarda se degrada cuando varios agentes escriben código.

## 2. Las cuatro capas

| Capa | Responsabilidad | Backend (`<modulo>/…`) | Frontend (`src/…`) | Inferencia (`app/…`) |
|---|---|---|---|---|
| **Presentación** | Traducir HTTP o UI a casos de uso. Validar forma, no negocio. | `controller/` | `app/**` (rutas), `features/<f>/components/`, `components/` | `api/` (routers) |
| **Contratos** | Formas de datos que cruzan el borde HTTP. | `dto/` (`*Request`, `*Response`) | tipos de `features/<f>/model/` sobre `lib/api/generated` | `api/esquemas.py` (Pydantic) |
| **Aplicación** | Casos de uso: orquestar, transacción, autorización por instancia, publicar eventos. | `service/`, `listener/` | `features/<f>/hooks/` | `application/` |
| **Dominio** | Entidades, invariantes, máquinas de estado, reglas puras, eventos, puertos. | `domain/`, `event/`, `port/` | `features/<f>/model/`, `lib/types/` | `domain/` |
| **Infraestructura** | I/O: base de datos, SMTP, archivos, HTTP a otros servicios, librerías de terceros. | `repository/`, `infra/` | `features/<f>/api.ts`, `lib/api/`, `lib/auth/`, `map/`, `pwa/` | `infrastructure/` |

## 3. Regla de dependencia

```
          Presentación ──► Contratos ◄── Aplicación
                │                          │   │
                └─────────► Aplicación ◄───┘   │
                                │              ▼
                                ├────────► Persistencia (repository)
                                ▼
                             Dominio ◄──────── Adaptadores (infra)
                       (domain · event · port)   implementan port/
```

- Presentación → Aplicación → Dominio. Nunca al revés.
- La aplicación usa los repositorios directamente (D-04) y la infraestructura externa **solo a través de un `port/`**.
- Nadie referencia una clase de `infra/`: Spring (o el hook, en el frontend) recibe la implementación por la interfaz.

## 4. Backend (`backend/`)

### 4.1 Estructura estándar de un módulo

```
pe.edu.upc.viasegura.<modulo>/
├── controller/   PRESENTACIÓN  @RestController. Delgado: valida @Valid, llama a UN servicio, devuelve su respuesta.
├── dto/          CONTRATOS     records *Request / *Response (+ enums de parámetros). Factoría estática desde la entidad.
├── service/      APLICACIÓN    @Service @Transactional. Casos de uso, autorización por instancia, publica eventos. *Command de entrada.
├── listener/     APLICACIÓN    @TransactionalEventListener(AFTER_COMMIT). Reacciones a eventos de este u otro módulo.
├── domain/       DOMINIO       @Entity, enums, máquinas de estado, reglas puras (sin I/O).
├── event/        DOMINIO       records de eventos que el módulo publica (*Event).
├── port/         DOMINIO       interfaces hacia afuera (Strategy): FotoStorage, ClasificadorDano, CorreoSaliente…
├── repository/   PERSISTENCIA  interfaces Spring Data (*Repository).
└── infra/        ADAPTADORES   implementaciones de port/ y arranque (seeders, clientes HTTP, SMTP, POI).
```

Un subpaquete que el módulo no necesita no se crea. **No se crean otros subpaquetes** (`geo/`, `storage/`, `adapter/`, `util/`, `helper/`): lo que no encaja en esta lista es una señal de diseño que se discute antes (§10).

### 4.2 Qué hace y qué no hace cada capa

| Subpaquete | Hace | No hace |
|---|---|---|
| `controller` | Mapear ruta, `@PreAuthorize` por rol, `@Valid`, leer el usuario autenticado y delegar. | Reglas de negocio, `if` sobre estados, acceso a repositorios, armar DTO desde entidades. |
| `dto` | Declarar la forma del JSON. `static XResponse desde(Entidad)`. | Lógica, acceso a servicios, señales internas en DTO públicos (regla del proyecto). |
| `service` | `@Transactional`, cargar agregados, aplicar reglas del dominio, comprobar dueño o jurisdicción, publicar eventos, devolver DTO. | HTTP (`HttpServletRequest`, `ResponseEntity`), SQL, SMTP o archivos directos (eso va por `port/`). |
| `listener` | Reaccionar `AFTER_COMMIT` (refrescar la vista materializada, notificar, enviar correo). | Lógica que debería estar en la transacción original. |
| `domain` | Invariantes (`EstadoReporte.puedeTransicionarA`), cálculos puros, `BusinessException` ante precondiciones. | Inyección de servicios o repositorios, I/O. |
| `port` | Interfaces mínimas con tipos del dominio. | Tipos de Spring Web, DTO HTTP. |
| `repository` | Consultas JPQL o nativas (con las trampas de `backend/CLAUDE.md`). | Lógica de negocio. |
| `infra` | Implementar un puerto, manejar timeouts y reintentos del proveedor, traducir sus errores. | Decidir reglas de negocio. |

### 4.3 Módulos y dependencias permitidas

De otro módulo solo se usa su **API pública**: `service`, `domain`, `event`, `port` y `dto`. Nunca su `controller`, `listener`, `repository` ni `infra`. `common` es transversal y no depende de ningún módulo. `common/port` es solo para I/O externa que usan **dos o más** módulos; lo que usa un solo módulo va en el `port/` de ese módulo (D-11).

| Módulo | Responsabilidad | Entidades (OB2 §5) | Usa a | Estado |
|---|---|---|---|---|
| `common` | Seguridad JWT, errores, configuración web, utilitarios geo, almacenamiento de fotos (`port/FotoStorageService` con `infra/LocalFotoStorageService` y `infra/S3FotoStorageService`, más `port/SaneadorDeImagen`; D-11, DEP-12) y correo saliente (`port/CorreoSaliente` con `infra/SmtpCorreoAdapter` y `infra/ResendCorreoAdapter`; DEP-08: lo usan `auth`, `soporte` y `notificaciones`). | — | — | existe |
| `distritos` | 43 distritos y sus polígonos; resolución por coordenadas. | (geometría de MUNICIPALIDAD) | common | existe |
| `municipalidades` | Canal oficial, periodos de gestión y requisitos de recepción. Cada municipalidad referencia a su distrito (D-09). | MUNICIPALIDAD, GESTION_MUNICIPAL, PERIODO_GESTION, REQUISITO_RECEPCION | distritos | **nuevo** |
| `auth` | Cuentas, credenciales, perfil y consentimiento. | USUARIO, CONSENTIMIENTO | distritos, municipalidades, moderacion | existe + CONSENTIMIENTO |
| `moderacion` | Revisión automática del contenido antes de publicar (D-15). Rechaza una foto con contenido sexual u obsceno, con el puerto `ModeradorDeImagen` al servicio de inferencia (`/v1/moderacion`) y `PoliticaDeModeracion` (umbral). Rechaza un texto con groserías, con `FiltroDeGroserias`, una regla pura sobre una lista versionada. No guarda nada. | — | — (solo `common`) | **nuevo** |
| `clasificacion` | Sugerir la categoría de una foto: puerto al servicio de inferencia, umbral y clase dominante. | (escribe `categoria_sugerida_id`, `confianza_sugerencia` y `version_modelo_sugerencia` vía reportes) | moderacion (vista previa) | **nuevo** |
| `reportes` | Ciclo del reporte: creación, adhesión, gestión, historial, categorías, fotos, idempotencia, confirmación. También el ocultamiento por el ADMIN, las denuncias y servir las fotos de reporte según su visibilidad (D-15). | REPORTE, CIUDADANO_AFECTADO, HISTORIAL_ESTADO, CATEGORIA_DANO (+ DENUNCIA_REPORTE, fuera del OB2) | auth, distritos, municipalidades, clasificacion, moderacion | existe |
| `notificaciones` | Avisos al ciudadano (push o email) y **correo formal a la municipalidad**. | SUSCRIPCION_PUSH, ENVIO_CORREO | auth, municipalidades, reportes (event) | existe + 2 entidades |
| `desempeno` | KPIs por municipalidad y periodo de gestión (dashboard RF-09). | (vista materializada) | municipalidades, reportes (event) | existe; se rehace por periodo |
| `soporte` | Tickets de soporte. | — | auth | existe |

Grafo, sin ciclos: `common ← distritos ← municipalidades ← auth ← reportes ← {notificaciones, desempeno}`, `clasificacion ← reportes`, `auth ← soporte`, `moderacion ← {auth, clasificacion, reportes}`. `moderacion` solo usa `common`. Por eso ocultar y denunciar viven en `reportes`: si vivieran en `moderacion`, ese módulo usaría `reportes` y habría un ciclo.

**Flujo del núcleo nuevo** (para ubicar cada pieza):

1. **Vista previa (solo UX, W-07/W-08).** `clasificacion.controller` recibe la foto (`POST /api/clasificaciones`).
   - `ClasificacionService` la sanea y primero la pasa por `moderacion.service.ModeracionService` (D-15). Si la foto se rechaza, responde `fotoRechazada: true` y no clasifica.
   - Si pasa, llama a `port/ClasificadorDano`, que implementa `infra/InferenciaHttpAdapter` (RestClient a `inferencia/`, con timeout). Luego aplica `domain/PoliticaDeSugerencia` (umbral y clase dominante) y devuelve la sugerencia o “sin sugerencia”.
   - **No guarda nada.** Si el servicio falla, la respuesta es “sin sugerencia” y el ciudadano elige la categoría a mano. Si la moderación no responde, la vista previa sigue sin avisar: el veredicto oficial es el de la creación.
2. **Creación.** `reportes.service` crea el reporte solo con la categoría que **confirmó** el ciudadano. `CrearReporteRequest` no tiene campos de sugerencia, y si el cliente los envía se ignoran (D-08).
   - **Antes de abrir la transacción**, `reportes.service` pasa el texto y la foto (ya saneada una sola vez) por `moderacion.service.ModeracionService`, igual que la vista previa del paso 1:
     - `exigirTextoPermitido` aplica `FiltroDeGroserias`: 400 `TEXTO_NO_PERMITIDO`;
     - `exigirFotoPermitida` usa el puerto `ModeradorDeImagen`: 400 `FOTO_NO_PERMITIDA`.
   - Si la moderación no responde, la creación **falla cerrada**: 503 `MODERACION_NO_DISPONIBLE`, y la PWA ofrece la cola sin conexión o «Enviar sin foto» (D-15).
   - Una foto rechazada nunca se guarda.
3. **Sugerencia oficial (D-08).** `reportes.listener.SugerenciaCategoriaListener` escucha `ReporteCreadoEvent` (solo reportes nuevos con foto, no adhesiones) con `AFTER_COMMIT`. Sigue el patrón de D-13, porque hay E/S externa (§4.5): el listener solo encola. Después:
   - `reportes.service.SugerenciaCategoriaService` (`@Async` en el executor acotado de `AsyncConfig`, **sin transacción**) lee la foto guardada por `common.port.FotoStorageService` (D-11) y la clasifica con `clasificacion.service.ClasificacionService`.
   - Una transacción corta escribe `categoria_sugerida_id`, `confianza_sugerencia` y `version_modelo_sugerencia` con un `UPDATE` que solo actúa **si siguen nulos** (idempotente).

   Si la inferencia falla, los campos quedan nulos y el reporte sigue su curso: la *sugerencia* nunca bloquea un reporte; la moderación sí (D-15). La sugerencia oficial no pasa por la moderación: la foto ya se revisó al crear el reporte. Como es asíncrono, los hasta 3 s de inferencia no se suman al tiempo de respuesta de la creación.

   Para no crear un ciclo entre módulos (`reportes` ya depende de `clasificacion`), las categorías que se pueden sugerir llegan por el puerto `clasificacion.port.CategoriasClasificables`, que implementa `reportes.infra.JpaCategoriasClasificablesAdapter` (NC-04, 25/10).
4. `reportes.service.ConfirmacionReporteService` evalúa la regla “reporte confirmado” (campos completos, municipalidad asignada y requisitos de `municipalidades`) y publica `event/ReporteConfirmadoEvent`.
5. `notificaciones.listener.ReporteConfirmadoListener` crea ENVIO_CORREO (como máximo uno por reporte) y envía por `common/port/CorreoSaliente` (desde DEP-08 vive en `common`, porque también lo usan `auth` y `soporte`; adaptadores `common/infra/SmtpCorreoAdapter` y `common/infra/ResendCorreoAdapter`, elegidos con `CORREO_TIPO`). Los reintentos se registran en `intentos`.
6. `desempeno.listener` refresca los KPIs. Un reporte cuenta en el periodo de su `fecha_creacion`. Un reporte **oculto por el ADMIN** (`reporte.oculto`) no cuenta, y ocultarlo o restablecerlo publica `ReporteVisibilidadCambiadaEvent`, que refresca el índice (D-15).

### 4.4 Cómo se verifica

`src/test/java/.../arquitectura/ArquitecturaCapasTest.java` corre con `mvn test` (Surefire) y comprueba:

| Regla | Qué detecta |
|---|---|
| `capas` | Una dependencia que viola §3 (por ejemplo, un controller que usa un repository). |
| `dominioSinDependenciasHaciaAfuera` | `domain`, `event` o `port` que importan otra capa. |
| `controladoresEnPresentacion`, `entidadesEnDominio`, `repositoriosEnPersistencia`, `manejadoresDeEventosEnListener` | Una clase en el subpaquete equivocado o con el sufijo equivocado. |
| `contratosSoloRequestResponse` | Clases en `dto/` que no son contratos HTTP. |
| `modulosSinCiclos` | Ciclos entre módulos. |
| `soloApiPublicaDeOtrosModulos` | Uso de `controller`, `listener`, `repository` o `infra` de otro módulo. |

Las violaciones que existían al instalar la guarda están **congeladas** en `src/test/resources/archunit_store` (versionado). Solo fallan las nuevas, y al corregir una sale sola del almacén. El tamaño del almacén es la deuda pendiente; la migración termina cuando queda vacío.

ArchUnit compara el texto completo de cada violación congelada (solo ignora los números de línea), así que **mover una clase** cambia el texto de las violaciones que la mencionan y el test las da por nuevas. En el commit que mueve la clase se vuelve a congelar el almacén **de forma controlada**: una corrida con `-Darchunit.freeze.refreeze=true` (sin tocar `archunit.properties`) y, en el diff del almacén, el número de entradas no sube y solo cambian nombres de paquete. Como `refreeze` acepta todas las violaciones actuales, también las nuevas, el revisor comprueba ese diff entrada por entrada (decisión del usuario, 11/10).

### 4.5 Convenciones transversales

- **Nombres**: `XController`, `XService`, `XRepository`, `XRequest`, `XResponse`, `XCommand`, `XEvent`, `XListener`; los adaptadores se llaman por tecnología más puerto (`SmtpCorreoAdapter`).
- **Errores**: el dominio y la aplicación lanzan `BusinessException` (409), `ResourceNotFoundException` (404) u `OperacionNoPermitidaException` (403 con mensaje). Solo `GlobalExceptionHandler` los traduce a HTTP.
- **Transacciones**: `@Transactional` solo en `service`. Los listeners `AFTER_COMMIT` que escriben abren su propia transacción (`REQUIRES_NEW`), **salvo** los que hacen I/O externo (HTTP, SMTP): esos corren `@Async` en el executor acotado de `common/config/AsyncConfig`, hacen el I/O **fuera** de cualquier transacción y persisten el resultado en transacciones cortas (D-13). El refresco de `mv_indice_desempeno_distrital` tampoco corre en el hilo del commit (BE-12). El listener marca el índice como sucio y encola, con `execute`, una tarea en el executor propio del índice (`AsyncConfig.EJECUTOR_INDICE`: 1 hilo y cola de 1). La tarea repite el refresco mientras el índice siga sucio, cada vez en su transacción `REQUIRES_NEW`. Los eventos se coalescen: a lo sumo hay un refresco en curso y otro pendiente, y siempre hay uno que empieza después del último evento.
- **I/O externo antes de escribir, en el mismo caso de uso** (BE-11; distinto del I/O después del commit de D-13, que va en un listener asíncrono): cuando un servicio tiene que hacer I/O externo (subir a R2, llamar a `inferencia/`) **antes** de escribir en la base, no lo hace dentro de un `@Transactional`, que retendría una conexión del pool durante la red. El patrón, que usa `ReporteService#crear`:
  - el método no es `@Transactional`: hace la validación y el I/O sin transacción (sanear, moderar y subir la foto) y después abre una **transacción programática** con el `TransactionTemplate` de Spring Boot, inyectado como `TransactionOperations`. Sigue en `service/`: el borde queda a la vista y en el orden del caso de uso. No se parte el caso de uso en dos beans ni se usa un `@Transactional` en un método del mismo bean, que el proxy no intercepta;
  - lo que el I/O dejó afuera se **compensa** con una `TransactionSynchronization` registrada en esa transacción (`reportes/service/FotoProvisional`). `afterCompletion` solo **anota** el desenlace (confirmada, revertida o desconocida), y la compensación (borrar el objeto que ningún reporte usa) corre al volver de la transacción, ya sin conexión: `afterCompletion` corre antes de que la conexión vuelva al pool. La compensación nunca lanza; si falla, deja un WARN;
  - el método se niega a correr dentro de otra transacción (`IllegalStateException` si `TransactionSynchronizationManager.isSynchronizationActive()`), porque la suya se uniría a la de afuera y la compensación se decidiría antes del commit real.

  La moderación de la foto (NC-10b, D-15) ya lo usa: corre entre el saneado y la subida, sin transacción. Detalle y tabla de desenlaces: `backend/README.md`, «La foto del reporte, fuera de la transacción (BE-11)».
- **Tareas programadas** (BE-15, la primera: la purga de las cuentas sin confirmar):
  - `common/config/TareasProgramadasConfig` activa `@EnableScheduling`, con el planificador de Spring Boot (un hilo), aparte de los executors de `AsyncConfig`: una tarea larga no quita hilos a los correos ni a los avisos;
  - el `@Scheduled` va en un método del **`service` del módulo dueño de los datos** (`auth/service/PurgaCuentasSinConfirmarService`; `soporte` en BE-13), con el cron en una propiedad (`app.<tema>.purga.cron`, `-` la apaga) y `zone = "America/Lima"`. Es un caso de uso sin HTTP, de la capa de aplicación: no va en `infra/` (que no puede llamar a un `service`), ni en `listener/` (que es para eventos de dominio), ni en un controlador;
  - el método programado **no es `@Transactional`**: cada elemento va en **su propia transacción corta** (`TransactionOperations`, como `ReporteService#crear`), para que uno que falla no revierta los demás. Se niega a correr dentro de otra transacción y atrapa cualquier fallo, que registra sin el mensaje, para que el planificador siga con la corrida siguiente;
  - **sin ShedLock** ni otro candado distribuido: el backend corre en una sola instancia, y la tarea es idempotente y segura con dos corridas a la vez (candados de fila y un `DELETE` condicional). Si algún día hay réplicas y una tarea no cumple eso, se agrega el candado;
  - en los tests la tarea está apagada (`cron: "-"`) y los IT llaman al método del servicio directamente.

  Detalle: `backend/README.md`, «Tareas programadas (BE-15)».
- **Eventos**: toda operación que cambie un KPI publica un evento (regla ya registrada en `backend/CLAUDE.md`).
- **Esquema**: cada entidad nueva tiene su migración `V<n>__…sql`, y cada tabla con FK a `reporte` entra en `AbstractPostgisIT.limpiezaFkSafe()`.
- **Tests**: un `*IT` por caso de uso en el paquete del módulo, más tests puros (`*Test`) para las reglas de `domain/`.

## 5. Frontend (`frontend/`)

### 5.1 Estructura estándar de una feature

```
src/features/<feature>/
├── components/   PRESENTACIÓN  UI de la feature. Recibe props o usa hooks de SU feature. Sin I/O.
├── hooks/        APLICACIÓN    useX(): orquesta api.ts + estado (cargando / error / datos), cancelación, mutaciones.
├── model/        DOMINIO       tipos (alias sobre el schema generado) y reglas puras: transiciones, acciones, formato.
└── api.ts        INFRAESTRUCTURA gateway HTTP: único archivo que usa el cliente. Resuelve URLs de fotos y traduce respuestas.
```

Una feature es un **área funcional de la UI** (`reportes`, `gestion`, `desempeno`, `auth`, `notificaciones`), no un espejo de los módulos del backend (D-07). Cada `api.ts` puede llamar a cualquier endpoint que su feature necesite.

### 5.2 Qué hace y qué no hace cada capa

| Carpeta | Hace | No hace |
|---|---|---|
| `app/**` | Leer `params`, aplicar `GuardiaDeRol`, componer componentes y hooks, hacer `dynamic()` del mapa. | `useEffect` de carga de datos, importar `api.ts` o `lib/api`, lógica de negocio. |
| `components/` | Renderizar, manejar estado local de formulario, llamar callbacks o hooks. | `fetch`, `apiFetch`, capturar `ApiError`. |
| `hooks/` | Llamar a `../api`, exponer `{estado, datos, error, accion}`, traducir errores con `mensajeDeError`. | JSX, importar componentes. |
| `model/` | Tipos y funciones puras, con tests unitarios. | React, Next, `fetch`, `window`, `localStorage`. |
| `api.ts` | `api.get/post/…`, `conAuth`, adaptar la respuesta a los tipos de `model/`. | React, estado. |

### 5.3 Código compartido

| Carpeta | Capa | Contiene |
|---|---|---|
| `src/components/` | Presentación | UI genérica (`ui/form.tsx`, `LineaDeTiempo`). No depende de features. |
| `src/lib/types/` | Dominio | Tipos de dominio compartidos (`domain.ts`) y reglas puras compartidas (`estados.ts`: etiqueta y color de cada estado). |
| `src/lib/hooks/` | Aplicación | `useCarga`: el único lugar con el patrón de carga y cancelación (§5.5). |
| `src/lib/sesion/` | Aplicación | Coordinación del ciclo de vida de la sesión compartida entre features (p. ej. `antesDeCerrarSesion`: pasos que otras features registran antes del cierre). No toca el JWT: eso sigue solo en `lib/auth/token-storage.ts` (D-14). |
| `src/lib/api/` | Infraestructura | `client.ts`, `errors.ts` (con `mensajeDeError`), `generated/`, `catalogos.ts` (distritos y categorías, que usan varias features). |
| `src/lib/auth/` | Infraestructura | `token-storage.ts`, el único que toca el JWT. |
| `src/map/`, `src/pwa/` | Infraestructura | Adaptadores de Leaflet y Serwist. Usan `model/` y `lib/`; nunca `api.ts` ni hooks. |

**Importaciones:** dentro de una feature se importa en **relativo** (`../api`, `../model/tipos`). El alias `@/features/<otra>/…` solo se usa para el `model/` de **otra** feature. Si dos features necesitan lo mismo, va a `lib/`.

### 5.4 Cómo se verifica

`eslint.capas.mjs` (incluido en `eslint.config.mjs`) aplica `no-restricted-imports` por capa. `npm run lint` muestra el mensaje de la regla. La severidad es **`error`** desde FE-09 (25/10): un import que rompe las capas hace fallar el lint y la CI.

Historia de la migración: la severidad fue `warn` mientras se migraba (FE-01..FE-08). Línea base (FE-01, 11/10): **66 avisos en 24 archivos**; **67** desde que `src/components/**` también prohíbe los tipos generados (bloque `compartidos-ui`, 11/10). La cantidad solo podía bajar (decisión del usuario, 11/10), y FE-08 la dejó en **0** (20/10).

### 5.5 Patrón de hook (uniforme en todas las features)

```ts
// src/features/reportes/hooks/useMisReportes.ts
import { useCarga } from '@/lib/hooks/useCarga';
import { misReportes } from '../api';
import type { ReporteResumen } from '../model/tipos';

/** US-07: reportes del ciudadano autenticado. */
export function useMisReportes() {
  return useCarga<ReporteResumen[]>(() => misReportes(), []);
}
// useCarga devuelve { estado: 'cargando' | 'listo' | 'error', datos, error, recargar }
// y encapsula una sola vez el flag `cancelado` que hoy se repite en cada página.
```

La página queda en composición:

```tsx
export default function MisReportesPage() {
  return <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>{() => <ListaMisReportes />}</GuardiaDeRol>;
}
// ListaMisReportes (features/reportes/components) usa useMisReportes() y renderiza.
```

## 6. Servicio de inferencia (`inferencia/`, nuevo)

```
inferencia/
├── app/
│   ├── main.py          ARRANQUE       raíz de composición: crea la app y arma los adaptadores (como la clase de arranque de Spring)
│   ├── api/             PRESENTACIÓN   routers FastAPI + esquemas.py (Pydantic)
│   ├── application/     APLICACIÓN     detectar(imagen) -> Detecciones: valida, preprocesa, invoca el modelo
│   ├── domain/          DOMINIO        Deteccion, ClaseDano, VersionModelo (sin onnxruntime)
│   └── infrastructure/  INFRAESTRUCTURA OnnxModelo (onnxruntime, CPU), carga de pesos
├── tests/
└── pyproject.toml       (guarda de capas: import-linter, contrato "layers" exhaustivo main > api > application | infrastructure > domain)
```

**Contrato** (lo define `inferencia/` y lo consume `clasificacion/infra`):
`POST /v1/detecciones` (multipart `imagen`) → `{ "version_modelo": str, "detecciones": [{ "clase": str, "confianza": float, "caja": [x1, y1, x2, y2] }] }`.
El servicio **solo detecta**. El umbral y la clase dominante se aplican en la API (`clasificacion/domain/PoliticaDeSugerencia`).

**Moderación** (D-15; la consume `moderacion/infra`):
- `POST /v1/moderacion` (multipart `imagen`) → `{ "version_modelo": str, "puntaje": float }`, con los mismos errores, la misma validación previa y el mismo tope de conexiones que `/v1/detecciones`.
- `puntaje` es la probabilidad de contenido sexual explícito. Es el máximo de dos recortes de 384 px que cubren toda la foto, y siempre se devuelve: no hay piso.
- El servicio **solo mide**. El umbral (0,70 inicial, `MODERACION_UMBRAL`) lo aplica `moderacion/domain/PoliticaDeModeracion`.
- La moderación tiene su propio limitador y su propio candado de modelo, y corre con 1 hilo fijo.
- **Modelo:** Marqo `nsfw-image-detection-384`, revisión `0c26ec2` (Apache-2.0, ViT-Tiny, ~22 MB en ONNX). Se exporta en el `Dockerfile` con el hash registrado, como RF-DETR.

**Modelo y vocabulario** (decisión del usuario del 21/10, `project-context/decisions/propuestas/2026-10-21-ml-clases-modelo.md`):
- Pesos RF-DETR entrenados en RDD2022 (Apache-2.0), exportados a ONNX, con base `dronefreak/rdd2022-rfdetr-nano`. Si la latencia en 2 vCPU pasa de 1 s, la propuesta permite otra resolución o el tamaño S; el cambio se registra en NC-03a. No se usan los YOLO de Ultralytics, que son AGPL.
- Los valores de `clase` son **`bache`** (D40) y **`grieta`** (D00, D10 y D20). Las demás clases del modelo se descartan en el servicio.
- Umbral inicial **0,50** (`app.clasificacion.umbral`), a calibrar con fotos de Lima (NC-03b).

## 7. Contratos entre contenedores

| Contrato | Dueño | Consumidor | Cómo se sincroniza |
|---|---|---|---|
| API REST (OpenAPI en `/v3/api-docs`) | backend | frontend | El backend cambia `dto/` y hace commit; después el frontend corre `npm run api:sync` y ajusta `model/`. |
| Detección de daños | inferencia | backend (`clasificacion/infra`) | Versión en la ruta (`/v1`). Un cambio incompatible pasa a `/v2`. |
| Moderación de imágenes (D-15) | inferencia | backend (`moderacion/infra`) | Igual: `/v1/moderacion`, con su handoff. |

Un agente **nunca** supone un campo que el otro lado todavía no publicó.

## 8. Dónde vive cada entidad del OB2 §5

| Entidad | Módulo / paquete | Tabla actual | Acción |
|---|---|---|---|
| USUARIO | `auth.domain.Usuario` | `usuario` | Jurisdicción del funcionario: **pendiente (D-10)**. Con D-09 la relación es 1:1, así que `distrito_id` y `municipalidad_id` son equivalentes. |
| REPORTE | `reportes.domain.Reporte` | `reporte` | + `titulo`, `severidad`, `categoria_sugerida_id`, `confianza_sugerencia`, `version_modelo_sugerencia`, `periodo_gestion_id`. La sugerencia (NC-04) la escribe una vez `SugerenciaCategoriaListener`; es una señal interna y no va en ningún DTO público ni del ciudadano. + `oculto` y `foto_oculta` (NC-11, D-15): los cambia solo el ADMIN y no van en ningún DTO público; un reporte oculto sale del índice. |
| DENUNCIA_REPORTE (fuera del OB2) | `reportes.domain.DenunciaReporte` | `denuncia_reporte` | Migración nueva (NC-11). Una por ciudadano y reporte. Solo la ven los DTO del ADMIN. Entra en `limpiezaFkSafe()`. |
| CIUDADANO_AFECTADO | `reportes.domain.AdhesionReporte` | `adhesion_reporte` | Mantener la tabla; decidir si `total_adhesiones` se elimina (contradicción 1 del análisis). |
| HISTORIAL_ESTADO | `reportes.domain.HistorialEstadoReporte` | `historial_estado_reporte` | Sin cambio. |
| CATEGORIA_DANO | `reportes.domain.CategoriaDano` | `categoria_dano` | + `icono`, `clase_modelo` (único si no es nulo; Bache → `bache`, Pista deteriorada → `grieta`). La categoría estándar «Hueco en calzada» se desactiva: en una foto no se distingue de «Bache» (decisión del 21/10, migración de NC-04). |
| MUNICIPALIDAD, GESTION_MUNICIPAL, PERIODO_GESTION, REQUISITO_RECEPCION | `municipalidades.domain` | — | Migración nueva. `municipalidad.distrito_id` es `NOT NULL UNIQUE` y apunta a `distrito`. La geometría sigue solo en `distrito` (D-09). |
| ENVIO_CORREO, SUSCRIPCION_PUSH | `notificaciones.domain` | — | Migración nueva. |
| CONSENTIMIENTO | `auth.domain` | — | Migración nueva. Historial por finalidad y versión (D-12). |

## 9. Decisiones

| ID | Decisión | Alternativa descartada y motivo |
|---|---|---|
| D-01 | Capas dentro de cada módulo (paquete por módulo, subpaquete por capa). | Capas globales (`controllers/`, `services/`…): dispersan un caso de uso en cuatro carpetas. Hexagonal completa: duplica modelos y adaptadores sin beneficio a esta escala. |
| D-02 | Las entidades JPA son el modelo de dominio. | Modelo de persistencia separado más mappers: el doble de clases para un sistema con una sola base de datos. |
| D-03 | `dto/` es una capa de contratos que comparten presentación y aplicación; el servicio devuelve el DTO. | Que el controller mapee la entidad: provoca `LazyInitializationException` fuera de la transacción y saca reglas de visibilidad del servicio. |
| D-04 | La aplicación usa los repositorios Spring Data sin puerto; los puertos son solo para I/O externo. | Un puerto por repositorio: no aporta nada mientras PostgreSQL+PostGIS sea la única opción. |
| D-05 | Se conservan los nombres actuales (`controller/service/repository`) y se estandarizan los subpaquetes que faltaban (`port/`, `infra/`). | Renombrar a `api/application/domain/infrastructure`: toca casi todos los archivos e imports sin cambiar el comportamiento (decisión del 03/10). |
| D-06 | Migración incremental con violaciones congeladas (ArchUnit) y severidad `warn` (ESLint). | Reescritura de una vez: bloquea a ambos agentes y mezcla refactor con funcionalidad. |
| D-07 | Las features del frontend siguen áreas de la UI, y los hooks son la capa de aplicación. | Copiar los módulos del backend: el ciudadano y el funcionario usan los mismos datos en pantallas distintas. |
| D-08 | **El backend vuelve a clasificar la foto guardada** y es la única fuente de `categoria_sugerida_id` y `confianza_sugerencia`. Lo hace en un listener asíncrono posterior al commit (§4.3, paso 3). La vista previa del frontend es solo de interfaz (decisión del usuario, 04/10). Como el modelo es determinista en CPU, la misma foto con la misma versión del modelo da la misma sugerencia que vio el ciudadano. | Que el frontend reenvíe la sugerencia: el cliente podría alterar los datos con los que se evalúa la IA (OE3). Clasificar dentro de la transacción de creación: retiene una conexión a la base durante la inferencia y suma hasta 3 s a cada creación. |
| D-09 | **La municipalidad referencia a su distrito** (`municipalidad.distrito_id`, `NOT NULL UNIQUE`), y la geometría sigue solo en `distrito` (decisión del usuario, 04/10). Hay 43 filas: 42 municipalidades distritales más la Municipalidad Metropolitana de Lima, asociada a Cercado de Lima. La asignación por punto en polígono no cambia: el reporte obtiene su distrito y de ahí su municipalidad. | Fusionar distrito y municipalidad en una sola tabla, como en el OB2: obliga a migrar todo lo que hoy usa `distrito` (asignación, jurisdicción, índice, catálogo) y mezcla un dato geográfico con uno institucional. |
| D-11 | **El puerto de fotos vive en `common`**: `common/port/FotoStorageService` y `common/infra/LocalFotoStorageService`, con los mismos nombres y firmas (D-05). Lo usan `auth` (foto de perfil, privada) y `reportes` (foto de reporte, pública, y su lectura para D-08); el contrato sigue teniendo un método explícito por visibilidad. Mover el puerto corta el único ciclo entre módulos (`auth` → `reportes`), y deja en un solo módulo guardar y servir las fotos (`WebMvcConfig`, `SecurityConfig`). Desde D-15, el *resource handler* de las fotos de reporte vive en `reportes/infra`, porque servirlas depende de la visibilidad del reporte; guardar y cargar siguen en `common`. `common/port` queda reservado para I/O que usan dos o más módulos (decisión del usuario, 11/10; propuesta `decisions/propuestas/2026-10-11-puerto-fotos.md`). | Un puerto por módulo: la separación pública/privada sería una frontera entre módulos, pero crea dos clases y duplica unas 40 líneas de validación y copia; se puede hacer después a partir de esta. Puerto en `auth`: pasa las guardas, pero deja la evidencia pública de los reportes a cargo del módulo de cuentas. Dejarlo en `reportes` (BE-02 original): mantiene el ciclo. |
| D-12 | **El consentimiento es un historial por finalidad y versión**: tabla `consentimiento` en `auth` (`usuario_id`, `finalidad` = `TERMINOS_Y_PRIVACIDAD` \| `NOTIFICACIONES_PUSH` \| `NOTIFICACIONES_CORREO`, `version_documento`, `aceptado_en`, `revocado_en`). Cada aceptación es una fila nueva y revocar llena `revocado_en`. El registro (US-01) exige aceptar los términos vigentes. Los usuarios existentes ven una pantalla de aceptación en su próximo inicio de sesión, sin que se los dé por aceptados. Suscribirse a push (US-21) exige el consentimiento `NOTIFICACIONES_PUSH` vigente. `preferencia_notificacion` sigue siendo una **preferencia**; el consentimiento es el **permiso** (decisión del usuario, 13/10; propuesta `decisions/propuestas/2026-10-13-consentimiento.md`; se implementa en S3 como NC-07b). | Solo términos en dos columnas de `usuario`: no distingue finalidades ni guarda la revocación, que pide la Ley N.° 29733. Esperar el OB2: US-21 quedaría sin un consentimiento explícito para push. |
| D-13 | **Las notificaciones hacen su I/O fuera de la transacción** (decisión del usuario, 20/10; propuesta `decisions/propuestas/2026-10-20-notificaciones-fuera-de-transaccion.md`). El listener `AFTER_COMMIT` solo encola en el executor acotado de `AsyncConfig` (2–4 hilos, cola 100, con la cola llena descarta y registra el aviso perdido); `NotificacionService.notificarCambioEstado` es `@Async` y no transaccional: envía por correo/push y luego guarda cada `notificacion` en una transacción corta. Así ni el funcionario espera al servicio de push ni se retienen conexiones del pool durante HTTP/SMTP. BE-12 (decisión del usuario del 25/10, propuesta `2026-10-22-refresco-indice-asincrono.md`, opción A) aplica el mismo principio al refresco del índice: es asíncrono y coalescido, en un executor de un hilo, para que cada creación use una sola conexión del pool. | `REQUIRES_NEW` alrededor del envío: con un servicio de push lento retiene dos conexiones por cambio de estado y puede agotar el pool. `TransactionTemplate` dentro del servicio: el mismo efecto con más código. (Este descarte vale para el envío asíncrono después del commit. Cuando el I/O externo va **antes** de escribir, en el mismo caso de uso, la transacción programática con `TransactionTemplate` sí es la regla: §4.5, BE-11.) |
| D-14 | **La coordinación del cierre de sesión vive en `src/lib/sesion/`** (decisión del usuario, 20/10; propuesta `decisions/propuestas/2026-10-20-coordinacion-cierre-sesion.md`): capa de aplicación compartida para pasos que una feature registra y `auth` ejecuta antes de cerrar (p. ej. la pregunta por los reportes sin enviar de US-06), sin que `auth` conozca a esa feature. | Dejarlo en `lib/hooks/`: no es un hook, y esa carpeta queda reservada al patrón de carga. Un contexto de React en `app/`: obliga a envolver la app y a pasar el registro por props. |
| D-15 | **Moderación de contenido antes de publicar** (decisión del usuario, 28/10; propuesta `decisions/propuestas/2026-10-28-moderacion-de-contenido.md`; tareas NC-10 y NC-11, v0.8.0). (1) **Módulo `moderacion`**, que solo usa `common` y lo usan `reportes`, `clasificacion` y `auth`. Una foto pasa por el puerto `ModeradorDeImagen` → `POST /v1/moderacion` de `inferencia/`: modelo Marqo `nsfw-image-detection-384` (Apache-2.0), umbral 0,70 en `PoliticaDeModeracion`, sin APIs de terceros. Un texto (título, descripción, comentario y nombre del perfil) pasa por `FiltroDeGroserias`: una lista propia y versionada, comparada por token entero y sin plegar la ñ. Lo rechazado no se guarda. (2) **Falla cerrada:** si la moderación no responde, un reporte con foto recibe 503 `MODERACION_NO_DISPONIBLE` y la PWA ofrece la cola sin conexión o «Enviar sin foto». `MODERACION_TIPO=ninguna` es el interruptor de emergencia. (3) **Ocultar y denunciar viven en `reportes`.** Solo el ADMIN oculta el reporte o su foto, con un motivo que queda en `historial_estado_reporte`. Un reporte oculto sale de lo público, de la bandeja, de la exportación **y del índice**: es la única salida además de `CANCELADO`, y está en manos de un actor que no se mide, así que se mantiene SEC-01. Ocultar solo la foto no mueve el índice. Ocultar o restablecer el reporte publica un evento que refresca el índice. Las denuncias no tienen efecto automático. (4) **Las fotos de reporte las sirve `reportes`.** El *resource handler* de `/media/fotos/reportes/**` pasa de `common/config/WebMvcConfig` a `reportes/infra/FotosDeReporteWebConfig` (con `git mv`). Su resolver pregunta a `ReporteRepository` si la foto es de un reporte visible (`NOT oculto AND NOT foto_oculta`), la carga por `common.port.FotoStorageService` y, si no es visible, responde 404. La regla `capas` permite a `infra` usar el repositorio de su módulo, como `DistritoSeeder`. Guardar y cargar las fotos sigue en `common` (D-11), y la ruta pública sigue en `SecurityConfig`. **Por qué en `reportes`:** servir la foto de un reporte depende ahora de una regla de `reportes` (su visibilidad). Así no hace falta un puerto en `common/port` que no es de I/O externa, y la norma de §4.3 queda igual. La foto lleva `s-maxage=3600`. | Una API de terceros para la foto: los términos prometen que no sale a terceros. Un puerto invertido `common/port/VisibilidadDeFotosDeReporte`, implementado por `reportes`: obligaba a aflojar la regla de que `common/port` es solo para I/O externa (§4.3). Mover el objeto de la foto a un prefijo oculto: no es atómico con la base. NudeNet: AGPL-3.0 sobre YOLOv8, el mismo criterio que en NC-03. Una ViT-base: no cabe en 1 GB junto a RF-DETR. Fallar abierto: rompe «nunca se guarda ni se publica» justo cuando el servicio cae. Ocultar y denunciar en `moderacion`: ciclo con `reportes`. Que el reporte oculto siga contando en el índice: lo que recomendaba la propuesta; el usuario prefirió excluirlo. |

## 10. Trabajo con varios agentes

- **Dueños**: el agente de `backend/` modifica solo `backend/`, el de `frontend/` solo `frontend/`, y el de `inferencia/` solo esa carpeta. Este documento y `project-context/` son del arquitecto (el usuario).
- **Una duda de diseño no se resuelve creando un subpaquete o carpeta nueva.** El agente escribe la propuesta en `project-context/decisions/` y espera la decisión.
- **Orden ante un cambio de contrato**: primero el backend (DTO, test y commit), después el frontend (`api:sync`). Nunca en paralelo.
- **Definición de terminado** de cualquier tarea:
  - backend: `mvn clean verify` en verde, `completed` de Failsafe igual o mayor que antes y `archunit_store` igual o más chico.
  - frontend: `npm run typecheck`, `npm test` y `npm run lint` en verde (las capas son error desde FE-09).
- **Commits**: las tareas de arquitectura se titulan `ARQ BE-03: …` o `ARQ FE-05: …`; las funcionales siguen con `US-xx`.
