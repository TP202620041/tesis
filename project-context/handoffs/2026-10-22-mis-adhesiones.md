# Handoff de contrato: reportes que el ciudadano apoya (QA-1 M-6)

- **Estado:** atendido <!-- pendiente | atendido -->
- **Fecha:** 2026-10-22
- **Origen:** backend, rama `bugfix/qa1-backend`, commit `87ef26f` (PR por abrir; lo abre el coordinador)
- **Historia o tarea:** QA-1 M-6 (US-07, US-09)
- **Atendido por:** frontend, rama `feature/qa1-mis-adhesiones`, 2026-10-22. `api:sync` contra el backend de `develop` (f22f7e6): `misAdhesiones` en `features/reportes/api.ts`, `useReportesQueApoyas` y la sección «Reportes que apoyas» en `/mis-reportes` (solo lectura; cada fila al detalle público `/reportes/{id}`; un CANCELADO sin enlace y con «El vecino que lo creó lo retiró…»). La confirmación de una adhesión enlaza a `/mis-reportes#reportes-que-apoyas`. Los avisos siguen yendo solo al creador. Ver `frontend/README.md`, «Reportes que apoyas (QA-1 M-6)».

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/reportes/mis-adhesiones` | **Nuevo (aditivo).** Rol `CIUDADANO`. Devuelve `ReporteResumenResponse[]`: los reportes **de otros vecinos** a los que el ciudadano se adhirió (US-09), del apoyo más reciente al más antiguo, **en cualquier estado** (también `CANCELADO`). Lista vacía si no apoya ninguno. Sin token, 401; otro rol, 403. |
| GET | `/api/reportes/mis-reportes` | **Sin cambios.** Sigue devolviendo solo lo que el ciudadano creó. |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio (nuevo / cambia / se elimina) | Quién lo ve |
|---|---|---|---|---|---|
| `ReporteResumenResponse` | (todos) | — | — | Sin cambios: es el mismo DTO de `mis-reportes` y del detalle público. No lleva señales internas (`posibleReincidencia` no aparece; lo cubre `SenalInternaFueraDeDtosPublicosIT`). | El ciudadano adherido |

No hay campo `relacion`: la relación («lo apoyo, no lo creé») la da la ruta.

## Enums
| Enum | Valores |
|---|---|
| `EstadoReporte` (campo `estado`) | Sin cambios: `PENDIENTE`, `RECIBIDO`, `EN_PROCESO`, `RESUELTO`, `RECHAZADO`, `CANCELADO`. Aquí puede llegar `CANCELADO` (ver notas). |

## Ejemplo de respuesta
`GET /api/reportes/mis-adhesiones`:
```json
[
  {
    "id": 184,
    "latitud": -12.118,
    "longitud": -77.032,
    "fotoUrl": "/media/fotos/reportes/3f2a….jpg",
    "titulo": "Bache frente al parque",
    "descripcion": "Lado norte",
    "severidad": "MEDIA",
    "categoriaId": 1,
    "categoriaNombre": "Bache",
    "estado": "EN_PROCESO",
    "distritoId": 21,
    "distritoNombre": "Miraflores",
    "totalAdhesiones": 3,
    "createdAt": "2026-10-20T15:02:11Z",
    "resolvedAt": null
  }
]
```

## Notas para el frontend

**Por qué un endpoint aparte** (y no un campo en `mis-reportes`): está en `backend/README.md`, «Ajustes del API tras QA-1». En corto: la relación depende de quien consulta y `ReporteResumenResponse` lo comparte el mapa anónimo; y `/mis-reportes/{id}` arma el detalle desde `misReportes()` y ofrece editar y retirar según el estado, acciones que en un reporte ajeno el backend rechaza con 403.

**Sugerencia de uso** (lo decide el frontend):

- En `/mis-reportes`, una sección aparte, p. ej. «Reportes que apoyas», con estos reportes **sin** las acciones de editar, retirar ni calificar (solo el creador puede; calificar también es solo del creador, US-26).
- El enlace de cada uno puede ir al detalle público `/reportes/{id}`. Excepción: un `CANCELADO` responde 404 en el detalle público. Para esos, mostrar el estado («El vecino que lo creó lo retiró») sin enlace, o un detalle propio que use `GET /api/reportes/{id}/historial`, que el adherido sí puede leer (US-22, vista redactada).
- La confirmación de una adhesión («Ver mis reportes») puede llevar a esa sección.
- `npm run api:sync` agrega la ruta nueva a `schema.ts`; el tipo de cada elemento es el `ReporteResumen` que ya existe.

**Lo que no cambia:** los avisos de cambio de estado (push y correo) siguen yendo solo al creador. Que el adherido vea el reporte en la lista no implica que reciba avisos; si se quiere, es una decisión aparte.
