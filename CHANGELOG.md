# Cambios

Versiones de ViaSegura según GitFlow (`WORKFLOW.md` §8): cada sprint cierra con una versión minor en `main`. Plan: `project-context/decisions/plan-sprints.md`.

## v0.3.0 — Sprint 2 (2026-10-19)

### Historias de usuario
- **US-25 · Soporte** (#26, #36): `/soporte` para cualquier usuario con sesión (crear ticket y ver los propios) y área del ADMIN en `/admin/soporte` (lista paginada con filtro por estado, correo y autor; responder). La respuesta llega por correo. El ADMIN ya tiene su propia página de inicio.
- **US-29 · Categorías del distrito** (#27, #37): `/categorias` para el funcionario (crear, editar, desactivar y reactivar las propias; las estándar en solo lectura). Desactivar una categoría solo hace que deje de ofrecerse: los reportes existentes siguen editables (antes daba 409).
- **US-12 · Búsqueda por fechas** (#30, #31): fechas desde/hasta y una vista «Lista» en `/mapa`. Una fecha mal formada o un parámetro con tipo inválido dan 400 en cualquier endpoint (antes 500), y el rango invertido da 400 también en la exportación.
- **NC-07 · Suscripciones Web Push** (#33): alta y baja de suscripciones del navegador. Solo se aceptan servicios push conocidos (anti-SSRF), con un tope de 10 por usuario y alta atómica. El envío real llega con US-21 (S3).

### Seguridad
- **SEC-02** (#32, #35): `posibleReincidencia` (la señal del detector de US-27) salía en la búsqueda pública, el detalle y las vistas del ciudadano. Ahora solo la ve el funcionario de ese distrito, en su bandeja.

### Arquitectura y decisiones
- **FE-03** (#29) y **FE-04** (#28): tipos en `model/` e imports relativos dentro de cada feature.
- API pública de `auth` (`UsuarioConsultaService`, adelanto de BE-06).
- La guardia ya no confunde `git merge-base` con `git merge` (#24).
- **D-12 · Consentimiento** por finalidad y versión (#25, #34); se implementa en S3.
- `useCarga` recarga sin desmontar la lista.

### Cifras
| Métrica | v0.2.0 | v0.3.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 178 | 238 |
| Tests unitarios backend (Surefire) | 11 | 37 |
| Violaciones congeladas de ArchUnit | 51 | 48 |
| Tests frontend (archivos) | 136 (19) | 232 (34) |
| Avisos de capas frontend | 64 | 44 |

**Verificación en vivo** (19/10, sobre develop ce17b1b): 27 comprobaciones contra el API real.
- Ticket de un ciudadano → el ADMIN lo filtra y lo responde → la respuesta llega por Mailhog.
- Categoría creada, editada (reemplazo), desactivada (fuera del catálogo, reporte PENDIENTE editable) y reactivada.
- El flag solo aparece en la bandeja.
- 400 para fechas mal formadas y rango invertido.
- Suscripción push creada, rechazada para un host interno y borrada.
- En el navegador: el ADMIN aterriza en `/admin/soporte`, el funcionario gestiona `/categorias`, y un ciudadano recibe el aviso de acceso denegado del área de administración.

## v0.2.0 — Sprint 1 (2026-10-13)

### Historias de usuario
- **US-03 · Recuperar contraseña** (#16): pantalla de dos pasos en la PWA (correo → token + contraseña nueva). No revela si la cuenta existe y muestra el 404/409 del token con el mensaje del backend.
- **US-04 · Cerrar sesión** (#17, #21): botón común en todas las vistas del ciudadano y del funcionario. El Service Worker ya no guarda respuestas del API (`NetworkOnly` para `/api/`), y al cerrar sesión se borra su caché entre orígenes, para que el siguiente usuario del equipo no vea datos del anterior.
- **US-28 · Exportar a Excel/CSV** (#18, #15): botones en la bandeja con los filtros activos. El backend expone `Content-Disposition` por CORS, así que el archivo baja con su nombre (`reportes-<distrito>.csv|xlsx`).
- **US-17 · Dashboard del distrito** (#19): `/dashboard` del funcionario, con el índice público separado de las señales de gestión interna. `null` se muestra «Sin datos».

### Arquitectura (plan de migración de capas)
- **BE-02 / BE-07** (#10): puertos y adaptadores (`geo`, notificaciones). El puerto de fotos pasa a `common` (D-11), lo que corta el único ciclo entre módulos.
- **BE-03** (#12): el seeder de distritos pasa a `infra/`, y el exportador queda detrás de un puerto con adaptadores Excel y CSV.
- **BE-04** (#13): `CrearReporteCommand` pasa a `service/`.
- **BE-05** (#14): se confirma la regla de listeners.
- **FE-02** (#9): reglas puras a `model/` y estados a `lib/types`.
- Adelantos de FE-05: `useCarga` y `mensajeDeError`.
- GitFlow (#8), plan de sprints (#11) y cierre del Sprint 1 en los planes (#20).

### Cifras
| Métrica | v0.1.0 | v0.2.0 |
|---|---|---|
| Tests de integración backend (Failsafe `completed`) | 177 | 178 |
| Violaciones congeladas de ArchUnit | 53 | 51 |
| Tests frontend (archivos) | 80 (8) | 136 (19) |
| Avisos de capas frontend | 67 | 64 |

## v0.1.0 (2026-10-11)
Estado inicial etiquetado al adoptar GitFlow: backend y PWA con la mayoría de US-01..US-30 (ver la auditoría en `plan-sprints.md`), la norma de capas con su línea base y el workflow de agentes.
