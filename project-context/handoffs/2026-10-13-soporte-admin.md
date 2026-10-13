# Handoff de contrato: listado de tickets de soporte para el ADMIN

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-13
- **Origen:** backend, rama `feature/us-25-soporte-admin`, commit `1db88bb` (PR pendiente)
- **Historia o tarea:** US-25
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/soporte/tickets?estado=&page=&size=` | **Nuevo.** Bandeja del equipo de soporte. Solo rol `ADMIN`. |
| POST | `/api/soporte/tickets` | Sin cambios. |
| GET | `/api/soporte/tickets/mis-tickets` | Sin cambios (sigue devolviendo `TicketSoporteResponse[]`). |
| PATCH | `/api/soporte/tickets/{id}/responder` | Sin cambios (devuelve `TicketSoporteResponse`). |

Parámetros del `GET` nuevo (todos opcionales, query string):

| Parámetro | Tipo | Por defecto | Notas |
|---|---|---|---|
| `estado` | `EstadoTicket` | _(ausente = todos)_ | Filtra por estado exacto. |
| `page` | entero ≥ 0 | `0` | Base 0. Negativo → 400. |
| `size` | entero 1..100 | `20` | Fuera de rango → 400. |

Orden fijo: `createdAt` descendente (los más recientes primero), con `id` descendente como desempate. No acepta `sort`.

## Campos
Respuesta: `Page<TicketAdminResponse>` de Spring Data (mismo formato que `GET /api/reportes`): `content`, `totalElements`, `totalPages`, `number`, `size`, `first`, `last`, `empty`, …

| DTO | Campo | Tipo | ¿Nulo? | Cambio (nuevo / cambia / se elimina) | Quién lo ve |
|---|---|---|---|---|---|
| `TicketAdminResponse` | `id` | number (Long) | No | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `asunto` | string | No | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `mensaje` | string | No | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `estado` | string (`EstadoTicket`) | No | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `respuesta` | string | **Sí** (null hasta que soporte responde) | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `emailContacto` | string | No | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `nombreAutor` | string (`"Nombre Apellido"`) | **Sí** (null si el ticket no tiene usuario; hoy todos lo tienen, pero el esquema admite tickets de visitante) | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `createdAt` | string ISO-8601 (Instant) | No | nuevo DTO | ADMIN |
| `TicketAdminResponse` | `updatedAt` | string ISO-8601 (Instant) | No | nuevo DTO | ADMIN |

`TicketSoporteResponse` (lo que ve el autor) **no cambia**: no expone `emailContacto`, `nombreAutor` ni `updatedAt`.

## Enums
| Enum | Valores |
|---|---|
| `EstadoTicket` | `ABIERTO`, `EN_PROCESO`, `CERRADO` |

## Ejemplo de respuesta
`GET /api/soporte/tickets?estado=ABIERTO&page=0&size=20`
```json
{
  "content": [
    {
      "id": 42,
      "asunto": "No puedo subir foto",
      "mensaje": "El botón no responde",
      "estado": "ABIERTO",
      "respuesta": null,
      "emailContacto": "ana@lima.pe",
      "nombreAutor": "Ana Vecina",
      "createdAt": "2026-10-13T23:10:05.123456Z",
      "updatedAt": "2026-10-13T23:10:05.123456Z"
    }
  ],
  "totalElements": 1,
  "totalPages": 1,
  "number": 0,
  "size": 20,
  "first": true,
  "last": true,
  "empty": false
}
```

## Notas para el frontend
- **Errores:** sin token → 401; token de `CIUDADANO` o `FUNCIONARIO_MUNICIPAL` → 403 ("Acceso denegado"); `page`/`size` fuera de rango → 400. Un `estado` que no sea uno de los tres valores no está validado de forma amable (cae en el manejador genérico): enviar solo valores del enum.
- La vista del ADMIN (`(admin)` o equivalente) responde con el `PATCH /{id}/responder` existente, que exige `respuesta` y `estado`; tras responder, recargar la página actual del listado.
- Tipar `respuesta` y `nombreAutor` como `string | null`, y `estado` como la unión literal de `EstadoTicket` en `lib/types/domain.ts` (springdoc lo publica como `string`).
- `emailContacto` y `nombreAutor` son datos personales: solo se muestran en la vista del ADMIN, nunca en una vista de ciudadano.
