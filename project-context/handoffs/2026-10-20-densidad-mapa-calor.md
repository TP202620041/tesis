# Handoff de contrato: densidad de reportes para el mapa de calor (US-11)

- **Estado:** atendido <!-- pendiente | atendido -->
- **Fecha:** 2026-10-20
- **Origen:** backend, rama `feature/us-11-densidad`, commit `f9eec1b` (PR contra `develop`)
- **Historia o tarea:** US-11
- **Atendido por:** frontend, rama `feature/us-11-mapa-calor`, 2026-10-20. `npm run api:sync`; tipos `DensidadReportes`/`CeldaDensidad` en `features/reportes/model/tipos.ts` (todos los campos requeridos); llamada `densidadDeReportes` en `features/reportes/api.ts` (sin token, sin `no-store`); escala y consulta en `model/densidad.ts`; hook `useDensidadMapa`; dibujo en `src/map/MapaReportes.tsx` con `CircleMarker` (sin plugin, CSP sin cambios).

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/reportes/densidad` | **Nuevo, público** (sin token; con token responde lo mismo). **200** `DensidadReportesResponse`. **400** si `fechaDesde > fechaHasta` o si un parámetro no se puede convertir (`estado=ARREGLADO`, `distritoId=abc`). Otros métodos sobre la ruta no son públicos (401 sin token). |

Parámetros de consulta, todos opcionales y **los mismos que `GET /api/reportes`** (sin paginación ni área):

| Parámetro | Tipo | Nota |
|---|---|---|
| `distritoId` | number | Solo ese distrito. |
| `categoriaId` | number | Solo esa categoría. |
| `estado` | `EstadoReporte` | Sin él: todos salvo `CANCELADO` (incluye `RECHAZADO` y `RESUELTO`, a propósito: SEC-01). Con `estado=CANCELADO` devuelve los cancelados, igual que la búsqueda. |
| `fechaDesde`, `fechaHasta` | string ISO-8601 instante UTC | Bordes inclusivos sobre la fecha de creación. Convertir el día local a instantes es tarea del cliente. |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `DensidadReportesResponse` | `celdaGrados` | number (hoy `0.001`) | no | nuevo | cualquiera |
| `DensidadReportesResponse` | `totalReportes` | number (entero ≥ 0) | no | nuevo | cualquiera |
| `DensidadReportesResponse` | `celdas` | `CeldaDensidadResponse[]` (puede estar vacía) | no | nuevo | cualquiera |
| `CeldaDensidadResponse` | `latitud` | number (múltiplo de `celdaGrados`) | no | nuevo | cualquiera |
| `CeldaDensidadResponse` | `longitud` | number (múltiplo de `celdaGrados`) | no | nuevo | cualquiera |
| `CeldaDensidadResponse` | `cantidad` | number (entero ≥ 1) | no | nuevo | cualquiera |

springdoc puede marcar los campos como opcionales: ninguno es nulo ni falta nunca.

## Enums
| Enum | Valores |
|---|---|
| `EstadoReporte` (parámetro `estado`, ya existente) | `PENDIENTE`, `RECIBIDO`, `EN_PROCESO`, `RESUELTO`, `RECHAZADO`, `CANCELADO` |

## Ejemplo de respuesta
```json
{
  "celdaGrados": 0.001,
  "totalReportes": 3,
  "celdas": [
    { "latitud": -12.121, "longitud": -77.03, "cantidad": 2 },
    { "latitud": -12.086, "longitud": -76.976, "cantidad": 1 }
  ]
}
```

## Notas para el frontend
- **Qué es cada celda:** el nodo de una grilla de `celdaGrados` grados (≈110 m) y cuántos reportes caen en él. Para la capa de calor, cada celda es un punto `[latitud, longitud, intensidad]`. Una intensidad razonable es `cantidad / max(cantidad)`. Las celdas vienen ordenadas de mayor a menor `cantidad`, así que el máximo es `celdas[0].cantidad`.
- **No hay área (bbox):** la respuesta cubre toda Lima con los filtros dados, y su tamaño crece con las celdas ocupadas, no con los reportes. No hace falta volver a pedirla al mover el mapa; sí al cambiar los filtros.
- **Caché:** `Cache-Control: public, max-age=60` y `ETag`. El navegador la reutiliza un minuto y luego revalida (304 sin cuerpo). No hay que implementar nada. Un reporte recién creado puede tardar hasta 60 s en verse en la capa.
- **Visibilidad:** la respuesta es la misma con o sin sesión y no lleva ids, categoría, estado ni señales internas. No intentar derivar reportes individuales de una celda; para eso está la búsqueda (`GET /api/reportes`).
- **Mapa:** las celdas usan las mismas coordenadas que los marcadores. Leaflet sigue encapsulado en `src/map/`, y si el plugin de calor no carga recursos externos no hace falta tocar la CSP.
- Detalle y justificación: `backend/README.md`, sección «Mapa de calor (US-11)».
