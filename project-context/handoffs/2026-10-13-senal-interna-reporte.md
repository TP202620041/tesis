# Handoff de contrato: la señal de reincidencia sale de los DTOs públicos

- **Estado:** atendido <!-- pendiente | atendido -->
- **Fecha:** 2026-10-13
- **Origen:** backend, rama `bugfix/senal-interna-reporte-resumen`, commit `042064e` (PR pendiente; sale de `bugfix/us-12-fechas-busqueda`, B4)
- **Historia o tarea:** US-27 (Sprint 2 · B5), hallazgo de seguridad SEC-02 en `backend/README.md`
- **Atendido por:** frontend, rama `bugfix/sec-02-bandeja-tipos`, 2026-10-13 (`ReporteGestion` en `features/gestion/model/tipos.ts`)

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/reportes` (público) | `ReporteResumenResponse` ya **no** trae `posibleReincidencia` |
| GET | `/api/reportes/{id}` (público) | ídem |
| GET | `/api/reportes/mis-reportes` | ídem |
| GET | `/api/reportes/mis-reportes/pendientes-calificacion` | ídem |
| PATCH | `/api/reportes/{id}` (editar, ciudadano) | ídem |
| DELETE | `/api/reportes/{id}` (cancelar, ciudadano) | ídem |
| GET | `/api/reportes/bandeja` (funcionario) | Devuelve el esquema nuevo `ReporteGestionResponse` (mismos campos que antes, **con** `posibleReincidencia`) |
| PATCH | `/api/reportes/{id}/estado` (funcionario) | Devuelve `ReporteGestionResponse` |

`POST /api/reportes` (`ReporteResponse`) no cambia: nunca llevó el flag. No hay endpoint nuevo: el detalle de gestión (`/bandeja/[id]`) ya se arma buscando el reporte dentro de `GET /bandeja`, que sigue trayendo el flag.

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio (nuevo / cambia / se elimina) | Quién lo ve |
|---|---|---|---|---|---|
| `ReporteResumenResponse` | `posibleReincidencia` | boolean | no | **se elimina** | nadie (público y ciudadano) |
| `ReporteGestionResponse` | (esquema) | — | — | **nuevo**: `id, latitud, longitud, fotoUrl, descripcion, categoriaId, categoriaNombre, estado, distritoId, distritoNombre, totalAdhesiones, createdAt, resolvedAt, posibleReincidencia`; mismos nombres, tipos y nulabilidad que el resumen anterior | solo `FUNCIONARIO_MUNICIPAL` de ese distrito |
| `ReporteGestionResponse` | `posibleReincidencia` | boolean | no | se mueve aquí desde el resumen | solo `FUNCIONARIO_MUNICIPAL` |

## Enums
| Enum | Valores |
|---|---|
| _(sin cambios)_ | |

## Ejemplo de respuesta
`GET /api/reportes/bandeja` (funcionario):
```json
[
  {
    "id": 42,
    "latitud": -12.1215,
    "longitud": -77.0297,
    "fotoUrl": "/media/fotos/reportes/3f1c….jpg",
    "descripcion": "Bache profundo frente al parque",
    "categoriaId": 1,
    "categoriaNombre": "Bache",
    "estado": "RESUELTO",
    "distritoId": 15,
    "distritoNombre": "Miraflores",
    "totalAdhesiones": 3,
    "createdAt": "2026-10-01T14:03:11Z",
    "resolvedAt": "2026-10-09T10:00:00Z",
    "posibleReincidencia": true
  }
]
```
`GET /api/reportes/42` (público): el mismo objeto **sin** la línea `posibleReincidencia`.

## Notas para el frontend
- **Por qué** (regla del proyecto: ninguna señal operativa en un DTO que pueda leer quien solo consulta): el flag resalta reportes en la bandeja; visible en el mapa o en "mis reportes", cualquiera podía comentar, consultar el reporte y ver si el detector se disparó, reconstruir sus palabras clave y manipular en qué se fija el municipio. Detalle en SEC-02 de `backend/README.md`.
- Tras `npm run api:sync`, `components['schemas']['ReporteResumenResponse']` deja de tener `posibleReincidencia`, así que `tsc` fallará en `features/gestion/components/TablaBandeja.tsx` (línea ~84) y en `app/(municipal)/bandeja/[id]/page.tsx` (línea ~133). Es lo esperado.
- Definir un tipo de gestión (p. ej. `ReporteGestion = components['schemas']['ReporteGestionResponse']`, en `features/gestion/model/` según `ARCHITECTURE.md`) y usarlo en:
  - `features/gestion/api.ts`: `bandeja()`, `filtrarPorFecha()` y `cambiarEstado()` (hoy tipados con `ReporteResumen`);
  - `app/(municipal)/bandeja/page.tsx` y `app/(municipal)/bandeja/[id]/page.tsx` (estado `reporte`/`reportes`);
  - `TablaBandeja`, `CambiarEstado` y cualquier componente de `features/gestion` que reciba el reporte.
- Las vistas públicas y del ciudadano (`(public)/mapa`, `(public)/reportes/[id]`, `(ciudadano)/mis-reportes`, `features/reportes/api.ts`) siguen con `ReporteResumen`, que ahora no tiene el flag: **no** deben mostrar ni leer `posibleReincidencia`.
- No cambia ningún código de error ni regla de autorización. Los nombres de campo comunes son idénticos en los dos esquemas, así que el mapeo existente sirve tal cual.
