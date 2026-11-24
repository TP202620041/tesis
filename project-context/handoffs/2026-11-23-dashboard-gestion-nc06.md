# Handoff de contrato: dashboard público por periodo de gestión (NC-06)

- **Estado:** pendiente
- **Fecha:** 2026-11-23
- **Origen:** backend, rama `feature/nc-06-backend`, commit `9e8cd0c` (sin PR todavía; base `feature/cierre-mvp-backend`)
- **Historia o tarea:** NC-06 (indicador OE3-I5); decisiones en `project-context/decisions/propuestas/2026-11-23-nc-06-kpis-gestion-y-d10.md`
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/desempeno/periodos` | **Nuevo.** Público (sin `Authorization`). Lista de periodos de gestión, el más reciente primero. |
| GET | `/api/desempeno/gestion` | **Nuevo.** Público (sin `Authorization`). KPIs de cada municipalidad en un periodo. Parámetros opcionales: `periodoId` (sin él, el periodo vigente hoy en hora de Lima) y `categoriaId` (como en `/api/desempeno/distritos`). |
| GET | `/api/desempeno/distritos` | Sin cambios (índice US-18/US-20, todos los periodos juntos). |
| GET | `/api/desempeno/mi-distrito` | Sin cambios (US-17 v1, solo FUNCIONARIO_MUNICIPAL). |

Errores de `/gestion`: **404** si `periodoId` no existe, o si se omite y hoy no cae en ningún periodo (no pasa hasta 2031). `periodoId`/`categoriaId` no numéricos: 400.

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `PeriodoGestionResponse` | `id` | number (Long) | no | nuevo | público |
| `PeriodoGestionResponse` | `fechaInicio` | string `YYYY-MM-DD` | no | nuevo | público |
| `PeriodoGestionResponse` | `fechaFin` | string `YYYY-MM-DD` (inclusiva) | no | nuevo | público |
| `PeriodoGestionResponse` | `vigente` | boolean | no | nuevo: el periodo contiene hoy (Lima); usar como selección por defecto | público |
| `DashboardGestionResponse` | `periodo` | `PeriodoGestionResponse` | no | nuevo: el periodo consultado | público |
| `DashboardGestionResponse` | `categoriaId` | number | **sí** | nuevo: `null` = todas las categorías | público |
| `DashboardGestionResponse` | `calculatedAt` | string ISO-8601 (Instant) | **sí** | nuevo: cuándo se recalculó la vista; `null` si `distritos` está vacío | público |
| `DashboardGestionResponse` | `distritos` | `KpiGestionDistritalResponse[]` | no | nuevo | público |
| `KpiGestionDistritalResponse` | `distritoId` | number | no | nuevo | público |
| `KpiGestionDistritalResponse` | `distritoNombre` | string | no | nuevo | público |
| `KpiGestionDistritalResponse` | `municipalidadNombre` | string | sí (solo si el seeder no corrió) | nuevo | público |
| `KpiGestionDistritalResponse` | `categoriaId` | number | **sí** | nuevo: `null` en la fila general | público |
| `KpiGestionDistritalResponse` | `reportesValidos` | number | no | nuevo: todos salvo CANCELADO y ocultos; RECHAZADO cuenta | público |
| `KpiGestionDistritalResponse` | `reportesResueltos` | number | no | nuevo | público |
| `KpiGestionDistritalResponse` | `tasaResolucion` | number, 2 decimales (0..100) | **sí**: sin válidos | nuevo | público |
| `KpiGestionDistritalResponse` | `tiempoPromedioDias` | number, 1 decimal, en **días** | **sí**: sin resueltos | nuevo (el índice viejo usa horas) | público |
| `KpiGestionDistritalResponse` | `satisfaccionPromedio` | number, 2 decimales (1..5) | **sí**: sin calificaciones | nuevo | público |
| `KpiGestionDistritalResponse` | `totalCalificaciones` | number | no | nuevo | público |

## Enums
| Enum | Valores |
|---|---|
| — | No hay enums nuevos. |

## Ejemplo de respuesta
`GET /api/desempeno/periodos`
```json
[
  { "id": 2, "fechaInicio": "2027-01-01", "fechaFin": "2030-12-31", "vigente": false },
  { "id": 1, "fechaInicio": "2023-01-01", "fechaFin": "2026-12-31", "vigente": true }
]
```

`GET /api/desempeno/gestion?periodoId=1`
```json
{
  "periodo": { "id": 1, "fechaInicio": "2023-01-01", "fechaFin": "2026-12-31", "vigente": true },
  "categoriaId": null,
  "calculatedAt": "2026-11-23T20:15:02.118Z",
  "distritos": [
    { "distritoId": 15, "distritoNombre": "San Isidro", "municipalidadNombre": "Municipalidad de San Isidro",
      "categoriaId": null, "reportesValidos": 3, "reportesResueltos": 2, "tasaResolucion": 66.67,
      "tiempoPromedioDias": 1.9, "satisfaccionPromedio": 4.00, "totalCalificaciones": 1 },
    { "distritoId": 7, "distritoNombre": "Barranco", "municipalidadNombre": "Municipalidad de Barranco",
      "categoriaId": null, "reportesValidos": 3, "reportesResueltos": 0, "tasaResolucion": 0.00,
      "tiempoPromedioDias": null, "satisfaccionPromedio": null, "totalCalificaciones": 0 },
    { "distritoId": 30, "distritoNombre": "Surquillo", "municipalidadNombre": "Municipalidad de Surquillo",
      "categoriaId": null, "reportesValidos": 0, "reportesResueltos": 0, "tasaResolucion": null,
      "tiempoPromedioDias": null, "satisfaccionPromedio": null, "totalCalificaciones": 0 }
  ]
}
```
(Ids y nombres de municipalidad ilustrativos.)

## Notas para el frontend
- **Ruta pública, sin sesión** (requisito del OE3-I5). La PWA puede consultarla desde `(public)`.
- **`null` ≠ 0**: `tasaResolucion: 0.00` es «ninguno resuelto»; `null` es «Sin datos». Lo mismo en tiempo y satisfacción.
- **Datos insuficientes** (decisión del 23/11): no mostrar la tasa con `reportesValidos < 5` (US-17 Esc. 2) ni el tiempo promedio con `reportesResueltos < 3` (US-20 Esc. 2). El servidor envía la cifra igual; el umbral es de presentación.
- **Sin `periodoId`** el backend usa el vigente; lo normal es pedir `/periodos`, preseleccionar el que tiene `vigente: true` y enviar su `id`. El periodo 2027-2030 aparece con todos los distritos en «Sin datos» hasta que tenga reportes.
- **Fila general**: siempre trae los 43 distritos por periodo, ordenados por `tasaResolucion` descendente y los `null` al final (como `/distritos`). **Con `categoriaId`** solo vienen los distritos con reportes válidos de esa categoría en el periodo.
- **Un reporte cuenta en el periodo de su creación**, aunque se resuelva en el siguiente.
- **Unidad**: el tiempo va en días (`tiempoPromedioDias`), no en horas como `tiempoPromedioHoras` del índice viejo.
- **Frescura**: la vista se refresca con los mismos eventos que el índice de US-18, después del commit y de forma asíncrona; puede ir un refresco por detrás.
- Ningún campo es una señal operativa (detecciones, prioridad, sugerencias): `KpiGestionPorPeriodoIT#elDtoSoloExponeLosCamposAcordados` fija la lista de campos.
