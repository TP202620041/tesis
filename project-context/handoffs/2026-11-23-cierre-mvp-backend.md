# Handoff de contrato: cierre de brechas del MVP (backend)

- **Estado:** pendiente
- **Fecha:** 2026-11-23
- **Origen:** backend, rama `feature/cierre-mvp-backend` (sin PR todavía; los commits los hace el coordinador)
- **Historia o tarea:** US-02, US-04, US-22, US-25, US-29, US-34 (US-17 y US-20 sin cambio de contrato)
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/auth/login` | Nuevo error **409** con `codigo = "LOGIN_BLOQUEADO"` tras 5 intentos fallidos seguidos (15 min), también con la contraseña correcta. Igual para un correo sin cuenta (US-02 Esc. 2). |
| POST | `/api/auth/me/cerrar-sesiones` | **Nuevo.** Autenticado (permitido con términos pendientes), sin cuerpo, **204**. Revoca todos los tokens de la cuenta, el actual incluido (US-04 Esc. 2). |
| POST | `/api/auth/restablecer-password` | Sin cambio de forma: ahora también revoca los tokens emitidos antes. |
| GET | `/api/reportes/{id}/historial` | La primera entrada es siempre la creación del reporte (US-22 Esc. 2). |
| POST | `/api/soporte/tickets`, GET `/api/soporte/tickets/mis-tickets` | Campos nuevos de seguimiento y plazo (US-25 Esc. 1). |
| GET | `/api/soporte/tickets` (ADMIN) | `numeroSeguimiento` nuevo. |
| GET | `/api/categorias`, `/api/categorias/gestion` | `icono` nuevo en cada categoría; 3 estándar nuevas (US-34). |
| POST | `/api/categorias`, PATCH `/api/categorias/{id}` | Aceptan `icono` opcional; fuera del conjunto → **400** (US-29 Esc. 1). |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `HistorialEntradaResponse` | (entrada `CREACION`) | — | `id`, `estadoAnterior`, `autor`, `avisoIndice` nulos | nueva entrada en `[0]` | todos los que ya leen el historial |
| `HistorialEntradaResponse` | `tipoEvento` | string | no | nuevo valor `CREACION` | idem |
| `TicketSoporteResponse` | `numeroSeguimiento` | string (`SOP-000123`) | no | nuevo | autor del ticket |
| `TicketSoporteResponse` | `plazoRespuestaHoras` | number (48) | no | nuevo | autor del ticket |
| `TicketSoporteResponse` | `respuestaEsperadaAntesDe` | string ISO-8601 | no | nuevo | autor del ticket |
| `TicketAdminResponse` | `numeroSeguimiento` | string | no | nuevo | ADMIN |
| `CategoriaDanoResponse` | `icono` | string (enum `IconoCategoria`) | sí (sin icono) | nuevo | público |
| `CategoriaGestionResponse` | `icono` | string | sí | nuevo | funcionario |
| `CrearCategoriaRequest`, `EditarCategoriaRequest` | `icono` | `IconoCategoria` | opcional | nuevo; en la edición **reemplaza** (omitirlo lo quita), como `descripcion` | funcionario |
| `ApiError` (login) | `codigo` | string | — | nuevo valor `LOGIN_BLOQUEADO` | público |

## Enums
| Enum | Valores |
|---|---|
| `IconoCategoria` | `BACHE`, `GRIETA`, `VEREDA`, `SEMAFORO`, `SENALIZACION`, `CICLOVIA`, `DRENAJE`, `ILUMINACION`, `BARANDA`, `PUENTE`, `ARBOL`, `ESCOMBROS`, `OBRA`, `OTRO` |
| `tipoEvento` del historial | se agrega `CREACION` a `CAMBIO_ESTADO`, `ASIGNACION`, `FOTO_OCULTA`, `REPORTE_OCULTO`, `FOTO_RESTABLECIDA`, `REPORTE_RESTABLECIDO` |

## Ejemplo de respuesta
```json
// POST /api/soporte/tickets → 201
{ "id": 123, "numeroSeguimiento": "SOP-000123", "asunto": "No puedo subir foto",
  "mensaje": "El botón no responde", "estado": "ABIERTO", "respuesta": null,
  "createdAt": "2026-11-23T15:00:00Z", "plazoRespuestaHoras": 48,
  "respuestaEsperadaAntesDe": "2026-11-25T15:00:00Z" }

// GET /api/reportes/{id}/historial → [0]
{ "id": null, "tipoEvento": "CREACION", "estadoAnterior": null, "estadoNuevo": "PENDIENTE",
  "comentario": "Se registró el reporte.", "autor": null, "fecha": "2026-11-20T10:00:00Z",
  "avisoIndice": null }

// GET /api/categorias → un elemento
{ "id": 7, "nombre": "Ciclovía dañada", "descripcion": "…", "esEstandar": true,
  "distritoId": null, "distritoNombre": null, "icono": "CICLOVIA" }

// POST /api/auth/login con el correo bloqueado → 409
{ "status": 409, "message": "Demasiados intentos fallidos. Por seguridad, vuelve a intentarlo en 15 minutos.",
  "codigo": "LOGIN_BLOQUEADO", "…": "…" }
```

## Notas para el frontend
- **US-02**: mostrar el `message` del 409 tal cual; no distinguir si el correo existe.
- **US-04**: «Cerrar sesión en todos los dispositivos» llama al nuevo POST y después descarta el token local, como el logout normal. Un 401 en cualquier petición posterior de otro dispositivo debe llevar al login (ya debería).
- **US-22**: ya no hace falta derivar la creación ni el texto «Todavía no hay movimientos registrados»: el historial nunca viene vacío. `id` puede ser `null` (usar otra clave en la lista, p. ej. índice o `tipoEvento + fecha`).
- **US-25**: mostrar `numeroSeguimiento` y `respuestaEsperadaAntesDe` (hora de Lima) al crear el ticket y en «Mis consultas».
- **US-29**: selector de icono con los 14 valores; `icono` nulo → icono genérico.
- **US-34**: el catálogo público trae 8 estándar activas (antes 5). Revisar tests del frontend que cuenten categorías.
- **US-17 / US-20 (sin cambio)**: el aviso se decide en la PWA con `resumen.totalReportes < 5` (dashboard, `GET /api/desempeno/mi-distrito`) y `totalResueltos < 3` por fila de `GET /api/desempeno/distritos?categoriaId=`. El servidor sigue enviando el promedio; el umbral es de presentación.
