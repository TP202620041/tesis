# Handoff de contrato: responsable sin asignar responde 204 (QA-1 M-4)

- **Estado:** atendido <!-- pendiente | atendido -->
- **Fecha:** 2026-10-22
- **Origen:** backend, rama `bugfix/qa1-backend`, commit `b13f891` (PR por abrir; lo abre el coordinador)
- **Historia o tarea:** QA-1 M-4 (US-15)
- **Atendido por:** frontend, rama `feature/qa1-mis-adhesiones`, 2026-10-22. `responsableActivo` (`features/gestion/api.ts`) normaliza el `undefined` del 204 a `null` y mantiene el `catch` del 404 durante la transición; `gestion/api.test.ts` cubre 200, 204, 404 y 403. Ver `frontend/README.md`, «Responsable sin asignar: 204 (QA-1 M-4)».

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/reportes/{id}/responsable` | **Cambia.** Si el reporte existe, es de la jurisdicción del funcionario y no tiene responsable vigente: **204 sin cuerpo** (antes **404** con `ApiError`). Con responsable: 200 con `AsignacionResponsableResponse`, como antes. |

Tabla completa de respuestas:

| Caso | Antes | Ahora |
|---|---|---|
| Hay responsable vigente | 200 + `AsignacionResponsableResponse` | 200 + `AsignacionResponsableResponse` (sin cambios) |
| El reporte existe y no tiene responsable | **404** «El reporte no tiene responsable asignado» | **204**, cuerpo vacío |
| El reporte no existe | 404 «Reporte no encontrado: {id}» | 404 «Reporte no encontrado: {id}» (sin cambios) |
| Reporte de otro distrito | 403 «Acceso denegado» | 403 (sin cambios) |
| Sin rol `FUNCIONARIO_MUNICIPAL` / sin token | 403 / 401 | 403 / 401 (sin cambios) |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio (nuevo / cambia / se elimina) | Quién lo ve |
|---|---|---|---|---|---|
| `AsignacionResponsableResponse` | — | — | — | Sin cambios de forma. Solo deja de existir el 404 para «sin responsable». | Funcionario de la jurisdicción |

## Enums
| Enum | Valores |
|---|---|
| — | Sin cambios. |

## Ejemplo de respuesta
Sin responsable:
```
HTTP/1.1 204 No Content
```

Con responsable (igual que antes):
```json
{
  "id": 12,
  "reporteId": 186,
  "responsable": "Cuadrilla 3 — Semaforización",
  "notas": "Revisar el controlador",
  "asignadoPorId": 7,
  "activo": true,
  "createdAt": "2026-10-22T01:40:00Z"
}
```

## Notas para el frontend

**Qué cambiar.** `features/gestion/api.ts` → `responsableActivo`: hoy traduce el 404 a `null`. Con el backend nuevo llega un 204 y `apiFetch` devuelve `undefined` (ya maneja el 204, como en `restablecer-password`). Basta con normalizar:

```ts
const asignacion = await api.get<AsignacionResponsable>(`/api/reportes/${reporteId}/responsable`);
return asignacion ?? null;
```

**Compatibilidad.** Conviene mantener, durante la transición, el `catch` que traduce el 404 a `null`, por si la PWA nueva habla con un backend viejo. Con el backend nuevo, un 404 significa que el reporte no existe, no que le falta responsable; `useResponsable` ya convierte cualquier error en «sin responsable», así que no rompe nada. Cuando ambos estén desplegados, se puede quitar ese `catch` y dejar que el 404 se trate como «reporte no disponible».

**Por qué 204 y no 200 con `null`:** está en `backend/README.md`, «Ajustes del API tras QA-1». En OpenAPI (`npm run api:sync`) el esquema de la respuesta 200 no cambia.

### Otros cambios de QA-1 en el backend sin cambio de forma (solo para enterarse)

Van en la misma rama y no exigen cambios en la PWA, pero cambian textos que la PWA muestra tal como llegan:

- **Mensajes del `ApiError` con tildes** («Credenciales inválidas», «El correo ya está registrado», «Error de validación», «Ya reportaste este daño», …) y los estados con su etiqueta («Transición de estado inválida: de Resuelto a Recibido»). La PWA no compara textos salvo `esVersionDeTerminosNoVigente`, cuyo `/t[eé]rminos/i` acepta el nuevo «La versión de los términos aceptada no es la vigente…».
- **`details` de un 400 de validación sin el nombre técnico del campo** (M-2): antes `"password: el tamaño debe estar entre 8 y 72"`, ahora `"La contraseña debe tener entre 8 y 72 caracteres"`. La forma de `ApiError` no cambia (`message` sigue siendo «Error de validación» y `details`, una lista de textos). Con oraciones completas, la PWA podría mostrar solo los `details` cuando los hay.
- **Topes que respondían 500 y ahora son 400 con mensaje:** descripción del reporte de más de 1000 caracteres (`POST /api/reportes`) y nombre o apellido de más de 100 (`PATCH /api/auth/me`).
- **Línea de tiempo del ciudadano:** «Se asignó un responsable para la atención del reporte.»
- **Push y correo** con trato de tú: título «Ciudad Viva: tu reporte está en proceso», cuerpo del push «Tu reporte #42 está en proceso.». El payload del push mantiene sus cinco claves (`titulo`, `cuerpo`, `url`, `reporteId`, `estado`).
- **Exportación CSV/XLSX** (M-5): columnas nuevas (ID, título, estado, severidad, adhesiones), fechas en hora de Lima, CSV con BOM UTF-8 y `Content-Type: text/csv;charset=UTF-8`. El nombre del archivo y el `Content-Disposition` no cambian.
- **Categorías estándar con tildes** (V18): «Vereda dañada», «Semáforo averiado», «Señalización faltante». Los `id` no cambian.
