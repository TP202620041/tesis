# Cambios

Versiones de ViaSegura según GitFlow (`WORKFLOW.md` §8): cada sprint cierra con una versión minor en `main`. Plan: `project-context/decisions/plan-sprints.md`.

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
