# Propuesta: ubicación del puerto de almacenamiento de fotos

- **Estado:** abierta <!-- abierta | aceptada | rechazada -->
- **Fecha:** 2026-10-11
- **Origen:** sesión coordinadora (raíz), antes de BE-02 y BE-07 de `plan-migracion-capas.md`
- **Decide:** el usuario. Si se acepta, la sesión de raíz actualiza ARCHITECTURE.md o el plan.

## Contexto

El plan manda decidir esto **antes de BE-02**, porque BE-02 mueve `reportes/storage/FotoStorageService` a `reportes/port/` y `LocalFotoStorageService` a `reportes/infra/`, y eso deja en pie el ciclo `auth` ↔ `reportes` que BE-07 tiene que cortar.

**Qué hay hoy** (`backend/src/main/java/pe/edu/upc/viasegura/`):

- `reportes/storage/FotoStorageService`: interfaz con 3 métodos. Su javadoc justifica que haya **dos métodos y no un parámetro**: la foto de reporte es pública y la de perfil es privada, y quien escribe el código tiene que elegir explícitamente cuál de las dos guarda (también lo explica `backend/README.md`, sección «Fotos: dos visibilidades, dos mecanismos»).
- `reportes/storage/LocalFotoStorageService`: `@Service` sobre el filesystem. Guarda en `<fotos-dir>/reportes` y `<fotos-dir>/perfiles`, valida la extensión (jpg, jpeg, png, webp), genera el nombre con un UUID y, al leer una foto de perfil, comprueba que la ruta no salga del directorio. Lee `app.storage.fotos-dir`, `fotos-url` y `fotos-perfil-url` (`application.yml`).

**Quién usa qué método:**

| Método | Módulo | Dónde |
|---|---|---|
| `almacenarFotoReporte` | `reportes` | `reportes/service/ReporteService#crearNuevo` (línea 126) |
| `almacenarFotoPerfil` | `auth` | `auth/service/AuthService#editarPerfil` (línea 131) |
| `cargarFotoPerfil` | `auth` | `auth/service/PerfilFotoService#fotoDelUsuario` (línea 62) |
| leer la foto de un reporte (no existe aún) | `reportes` | `reportes.listener.SugerenciaCategoriaListener` (D-08, NC-04, ARCHITECTURE.md §4.3 paso 3) |

**Ningún método lo usan los dos módulos.** Lo único que comparten es la implementación (validación, nombre UUID, copia a disco, creación de directorios) y la propiedad `app.storage.fotos-dir`.

**Cómo se sirven las fotos.** Esa parte ya vive en `common`:
- `common/config/WebMvcConfig` publica `<fotos-dir>/reportes` como recurso estático. Tiene escrito a mano el subdirectorio `"reportes"`, que duplica `LocalFotoStorageService.SUBDIR_REPORTES`.
- `common/security/SecurityConfig` (línea 146) abre `GET /media/fotos/reportes/**`.

La foto de perfil se sirve en `auth/controller/PerfilFotoController` → `PerfilFotoService` → `cargarFotoPerfil`.

**Dependencias.**
- `AuthService` (línea 24) y `PerfilFotoService` (línea 11) son las **únicas** clases de `auth` que importan algo de `reportes`, y en ambos casos importan este puerto.
- `common` no importa ningún módulo.
- En el almacén de ArchUnit (generado el 04/10), el ciclo congelado lista 6 dependencias de `auth` hacia `reportes`, y las 6 son de `FotoStorageService`.

**Efecto en el almacén de ArchUnit (vale para cualquier opción).** `FreezingArchRule` compara el texto completo de cada violación y solo ignora los números de línea. Hay dos violaciones congeladas de `soloApiPublicaDeOtrosModulos` cuyo texto incluye el nombre completo `reportes.storage.FotoStorageService`, porque aparece en la firma del constructor:
- `AuthService`, que usa `DistritoRepository`;
- `ReporteService`, que usa `UsuarioRepository`.

Si la interfaz se mueve, esas dos violaciones cambian de texto. El test las reportará como **nuevas** y fallará aunque el total no cambie. Lo mismo pasa con la entrada del ciclo mientras siga existiendo.

Detalles a tener en cuenta:
- El movimiento de `reportes/geo` que hace BE-02 tiene el mismo efecto sobre otras 4 entradas.
- El almacén todavía **no está versionado** en `f2f8954`: solo existe en el árbol de trabajo principal (BE-01 está pendiente).
- Conviene confirmar este comportamiento la primera vez que se ejecute el movimiento.

**Tests.** Ninguno importa estas clases: los IT las prueban por HTTP.
- `reportes/FotoReporteIT`: 3 tests.
- `auth/FotoPerfilIT`: 5 tests.
- `auth/EditarPerfilIT`: 8 tests; uno sube una foto.
- `common/RutaNoEncontradaIT`: 3 tests.

`support/AbstractPostgisIT` (línea 114) sobrescribe `app.storage.fotos-dir`.

**Observación aparte.** El puerto recibe `MultipartFile` (`org.springframework.web.multipart`), y §4.2 dice que un `port/` no usa tipos de Spring Web. ArchUnit no lo detecta, porque solo revisa paquetes `pe.edu.upc.viasegura`. No es lo que se decide aquí. Se propone conservar la firma en el movimiento para no cambiar el comportamiento.

## Problema

El puerto de fotos vive en `reportes`, pero dos de sus tres métodos solo los usa `auth`. Esa es la única dependencia de `auth` hacia `reportes` y la que crea el ciclo. Hay que decidir en qué módulo viven el puerto y su adaptador para que BE-02 los mueva a su lugar definitivo y BE-07 corte el ciclo.

## Opciones

| Opción | Qué implica | Costo | Riesgo |
|---|---|---|---|
| **A. Puerto y adaptador en `common`** | `common/port/FotoStorageService` y `common/infra/LocalFotoStorageService`, con los mismos nombres y firmas (D-05). `auth` y `reportes` dependen de `common`, lo que el grafo ya permite. | Se mueven 2 archivos y cambian 3 imports (`AuthService`, `PerfilFotoService`, `ReporteService`). No hay clases nuevas. **BE-02:** las filas de `storage` pasan a tener como destino `common`. **BE-07:** el ciclo se corta en el mismo commit, porque `auth` ya no importa nada de `reportes` (ciclo: 1 → 0). **ArchUnit:** cambian de texto las 2 entradas de `soloApiPublica` y hay que volver a congelarlas; las reglas `capas` y `dominio` ya cubren `common/port` y `common/infra` por el nombre del subpaquete. **IT:** sin cambios; `completed` igual. **Documentos:** ARCHITECTURE.md §4.3 (responsabilidad de `common`) y el plan. README y `backend/CLAUDE.md` siguen siendo válidos porque los nombres no cambian. | `common` puede volverse el cajón de todo lo compartido. El puerto lleva palabras del dominio («reporte», «perfil»), y el método de lectura de D-08 también terminaría ahí. Se mitiga con una regla escrita: `common/port` solo para I/O externa que usan dos o más módulos. Además, `soloApiPublicaDeOtrosModulos` exime a `common`, así que el adaptador queda protegido solo por la regla `capas`. |
| **B. Un puerto por módulo** | `reportes/port/FotoStorageService` se queda solo con `almacenarFotoReporte` (más la lectura de D-08) y `reportes/infra/LocalFotoStorageService` solo con el directorio de reportes. Se crean en `auth` un puerto nuevo (p. ej. `port/FotoPerfilStorage`: `almacenarFotoPerfil` y `cargarFotoPerfil`) y su adaptador `infra/` con la comprobación de que la ruta no salga del directorio. | Se mueven 2 archivos, se crean 2 clases y se parten la interfaz y el adaptador, así que no es un movimiento puro. Quedan unas 40 líneas duplicadas (extensiones, UUID, copia, directorios, `sinBarraFinal`), o se extrae un ayudante a `common` y se vuelve a parte de A. Cambian los tipos en `AuthService` y `PerfilFotoService`. **BE-02 y BE-07:** igual que A en el corte y en ArchUnit (ciclo 1 → 0; 2 entradas que volver a congelar). **IT:** sin cambios si ambos adaptadores leen la misma `fotos-dir`. **Documentos:** sección «Fotos» y deuda técnica del README (pasar a S3 obliga a cambiar 2 adaptadores), `backend/CLAUDE.md` y los javadoc. | Las listas de extensiones pueden divergir: ya hay una tercera copia en `PerfilFotoService.contentType`. Habría dos beans escribiendo bajo la misma `fotos-dir`. Es un refactor más grande de lo que pide una tarea de migración que no debe cambiar el comportamiento. **A favor:** la separación pública/privada pasa a ser una frontera entre módulos (`reportes` no puede escribir en el directorio privado ni `auth` publicar), y cada módulo queda completo. Es un buen argumento ante el jurado. |
| **C. Puerto y adaptador en `auth`** | `auth/port/FotoStorageService` y `auth/infra/LocalFotoStorageService`. `reportes` los usa, lo que es legal porque `reportes` → `auth` está permitido y `port` es API pública. | El mismo de A: 2 archivos y 3 imports. El efecto en BE-02, BE-07, ArchUnit e IT es el mismo que en A. | La evidencia pública de los reportes quedaría en manos del módulo de cuentas. La lectura de D-08 pasaría por `auth`. §4.3 tendría que decir que `auth` («cuentas, credenciales, perfil y consentimiento») también guarda fotos de reportes. Pasa las guardas, pero la responsabilidad queda mal ubicada. |

**Opciones descartadas:**
- **Hacer BE-02 tal como está escrito** (`reportes/port`). `auth` sigue importando `reportes`: el ciclo se mantiene y, además, cambia el texto de su entrada en el almacén, así que el test falla.
- **Que `auth` guarde la foto a través de un servicio de `reportes`.** Sigue habiendo una dependencia de `auth` hacia `reportes`.
- **Un puerto en cada módulo y un único adaptador en `common/infra` que implemente ambos.** `common` pasaría a depender de `auth` y `reportes`, lo que contradice §4.3 («`common` no depende de ningún módulo») y crea dos ciclos nuevos.
- **Cortar la otra dirección** (que `reportes.domain` deje de referenciar `auth.domain.Usuario`). El plan la declara legítima, y obligaría a tocar entidades y la base de datos.

## Recomendación

**Opción A**, por cuatro razones:

1. **Es un movimiento puro.** Se conservan los nombres (D-05) y las firmas, y cambian 3 imports. Encaja con la regla del plan de no cambiar el comportamiento.
2. **Corta el ciclo completo.** Las únicas dependencias de `auth` hacia `reportes` son las de este puerto.
3. **Junta en un solo módulo guardar y servir las fotos.** `common` ya tiene `WebMvcConfig` y `SecurityConfig`, que conocen `<fotos-dir>/reportes` y `/media/fotos/reportes/**`.
4. **Conserva el diseño que se defiende ante el jurado.** Sigue habiendo un contrato con dos métodos explícitos según la visibilidad, y pasar a S3 sigue siendo cambiar un solo adaptador, como dice la deuda técnica del README.

**Condiciones para aceptarla:**
- ARCHITECTURE.md §4.3: `common` suma «almacenamiento de fotos (`port/FotoStorageService`, `infra/LocalFotoStorageService`)», con la regla de que `common/port` es solo para I/O externa que usan dos o más módulos. Lo que usa un solo módulo va en el `port/` de ese módulo.
- El plan: la fila de `storage` en BE-02 apunta a `common`, y BE-07 anota que el ciclo se corta con ese movimiento.

**Orden sugerido.** Mover las fotos en el **primer commit** de la migración del backend, antes de mover `geo` (BE-02) y antes de BE-06. Mientras el ciclo exista, cualquier cambio en las clases de su detalle reescribe la violación congelada y hace fallar el test. Ese mismo commit cambia el texto de 2 entradas de `soloApiPublica`. Se recomienda **congelarlas de nuevo de forma controlada**: una corrida con `freeze.refreeze=true`, y luego revisar en el diff del almacén que el número de entradas sea el mismo y que solo cambie el paquete. Adelantar BE-06 en `AuthService` y `ReporteService` es la otra salida, pero agranda la tarea. El movimiento de `geo` en BE-02 va a necesitar lo mismo. Como el almacén está protegido, eso lo autoriza la sesión de raíz.

**Cuándo conviene B.** Si prefieres que cada módulo sea dueño de toda su I/O y que la separación pública/privada sea una frontera entre módulos, a cambio de duplicar código o de un ayudante compartido. B se puede hacer más adelante a partir de A sin volver a tocar el ciclo.

**`MultipartFile`.** Esta decisión no lo cambia. Si se quiere cumplir §4.2 al pie de la letra, eso va en una propuesta aparte.

## Qué queda bloqueado mientras no se decida

- **BE-02:** las filas `reportes/storage/*` no tienen destino. Las filas `reportes/geo/*` deberían esperar al corte del ciclo, porque cambian el texto de su entrada en el almacén. Las filas `notificaciones/adapter/*` no aparecen en el almacén y pueden avanzar.
- **BE-07:** el corte de `auth` hacia `reportes` es exactamente esta decisión. En el almacén no hay otro ciclo; el caso `common.security` ↔ `auth` no aparece.
- **BE-06:** conviene ejecutarlo después del corte, porque cambia constructores (`AuthService`, `ReporteService`…) que aparecen en el detalle del ciclo.
- **NC-04 (D-08):** falta saber en qué puerto se agrega la lectura de la foto de un reporte que necesita `SugerenciaCategoriaListener`.
- **Para la sesión de raíz, una vez decidido:** registrar la decisión en ARCHITECTURE.md (§4.3 y §9), ajustar BE-02 y BE-07 en el plan y autorizar el nuevo congelamiento del almacén.
