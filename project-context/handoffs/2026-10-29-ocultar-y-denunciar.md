# Handoff de contrato: ocultar y denunciar (NC-11a → NC-11b)

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-29
- **Origen:** backend, rama `feature/nc-11a-ocultar-denunciar` (PR pendiente). Commits en la ficha NC-11a de `decisions/plan-migracion-capas.md`.
- **Historia o tarea:** NC-11a (D-15, propuesta decidida `decisions/propuestas/2026-10-28-moderacion-de-contenido.md`, §6); lo consume **NC-11b**
- **Atendido por:** _(frontend, rama y fecha)_

Detalle y justificación en `backend/README.md`, sección «Ocultar y denunciar (NC-11a, D-15)».

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/reportes/{id}/denuncias` | **Nuevo** (CIUDADANO). Cuerpo `DenunciarReporteRequest`. 201 `DenunciaRegistradaResponse`. |
| GET | `/api/admin/moderacion/reportes?estado=&page=&size=` | **Nuevo** (ADMIN). Bandeja paginada (`Page<ReporteModeracionResumenResponse>`). `estado` por defecto `PENDIENTE`. |
| GET | `/api/admin/moderacion/reportes/{id}` | **Nuevo** (ADMIN). `ReporteModeracionResponse`. |
| GET | `/api/admin/moderacion/reportes/{id}/foto` | **Nuevo** (ADMIN). La foto (`image/jpeg`), aunque esté oculta. |
| POST | `/api/admin/moderacion/reportes/{id}/ocultamiento` | **Nuevo** (ADMIN). Cuerpo `ModerarContenidoRequest`. 200 `ReporteModeracionResponse`. |
| POST | `/api/admin/moderacion/reportes/{id}/restablecimiento` | **Nuevo** (ADMIN). Cuerpo `ModerarContenidoRequest`. 200 `ReporteModeracionResponse`. |
| POST | `/api/admin/moderacion/reportes/{id}/desestimacion` | **Nuevo** (ADMIN). Cuerpo opcional `DesestimarDenunciasRequest`. 200 `ReporteModeracionResponse`. |
| GET | `/api/reportes/{id}/historial` | `HistorialEntradaResponse` suma `avisoIndice`; cuatro `tipoEvento` nuevos; **404** al funcionario y a los adheridos mientras el reporte esté oculto. |
| GET | `/api/reportes/{id}`, `/api/reportes/{id}/comentarios`, POST `/api/reportes/{id}/comentarios` | 404 si el reporte está oculto. |
| GET | `/api/reportes`, `/densidad`, `/mis-adhesiones`, `/bandeja`, `/exportar` | No traen los reportes ocultos. `mis-reportes` sí (sin foto). |
| PATCH | `/api/reportes/{id}/estado`; GET y POST `/api/reportes/{id}/responsable` | 404 al funcionario del distrito si el reporte está oculto (el de otro distrito sigue con 403). |
| GET | `/media/fotos/reportes/{archivo}` | 404 si la foto está oculta, si el reporte está oculto o si no es de ningún reporte. `Cache-Control` suma `s-maxage=3600`. |

**Ninguna ruta nueva es pública.** El funcionario y el ciudadano reciben **403** en `/api/admin/moderacion/**`; el funcionario y el ADMIN reciben 403 en `POST .../denuncias`. Sin token, 401. Las respuestas del ADMIN llevan `Cache-Control: no-store, private`.

## Campos

### Del ciudadano
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `DenunciarReporteRequest` | `motivo` | enum `MotivoDenuncia` | no | nuevo | — (lo envía el CIUDADANO) |
| `DenunciarReporteRequest` | `detalle` | `string`, ≤ 500 | sí | nuevo | — (solo lo lee el ADMIN) |
| `DenunciaRegistradaResponse` | `id`, `reporteId`, `motivo`, `createdAt` | `number`, `number`, `string`, ISO | no | nuevo | El CIUDADANO que denunció (solo su denuncia) |
| `HistorialEntradaResponse` | `avisoIndice` | `string` | **sí**: solo viene en `REPORTE_OCULTO` y `REPORTE_RESTABLECIDO` | nuevo | Quien tiene acceso al historial |
| `HistorialEntradaResponse` | `tipoEvento` | `string` | no | valores nuevos | Quien tiene acceso al historial |

`ReporteResumenResponse`, `ReporteResponse`, `ReporteGestionResponse` y `ComentarioPublicoResponse` **no cambian**: una foto oculta llega con `fotoUrl: null` (igual que un reporte sin foto), y un reporte oculto no aparece. «¿Ya denuncié?» no va en ningún DTO.

### Del ADMIN
| DTO | Campo | Tipo | ¿Nulo? | Notas |
|---|---|---|---|---|
| `ModerarContenidoRequest` | `alcance` | `"REPORTE" \| "FOTO"` | no | |
| `ModerarContenidoRequest` | `motivo` | `string` | no | 10 a 500 caracteres sin los espacios del borde |
| `DesestimarDenunciasRequest` | `motivo` | `string`, ≤ 500 | sí | el cuerpo entero es opcional |
| `ReporteModeracionResponse` | `id`, `latitud`, `longitud`, `titulo`, `descripcion`, `severidad`, `categoriaId`, `categoriaNombre`, `estado`, `distritoId`, `distritoNombre`, `createdAt` | como `ReporteResumenResponse` | `descripcion`, `distritoId`, `distritoNombre` pueden ser nulos | sin `fotoUrl`: la foto va por `.../{id}/foto` |
| `ReporteModeracionResponse` | `tieneFoto`, `oculto`, `fotoOculta` | `boolean` | no | |
| `ReporteModeracionResponse` | `denuncias` | `DenunciaResponse[]` | no (puede ser `[]`) | todas, de la más antigua a la más nueva |
| `DenunciaResponse` | `id`, `motivo`, `estado`, `createdAt` | | no | |
| `DenunciaResponse` | `detalle`, `resueltaEn`, `motivoResolucion` | | sí | |
| `DenunciaResponse` | `denuncianteId`, `denuncianteNombre`, `denuncianteEmail` | | sí: nulos si la cuenta se cerró (BE-14) | |
| `ReporteModeracionResumenResponse` | `reporteId`, `titulo`, `estado`, `distritoId`, `distritoNombre`, `tieneFoto`, `oculto`, `fotoOculta` | | `distrito*` pueden ser nulos | |
| `ReporteModeracionResumenResponse` | `totalDenuncias` | `number` | no | en el estado pedido |
| `ReporteModeracionResumenResponse` | `porMotivo` | `Record<MotivoDenuncia, number>` | no | solo los motivos presentes |
| `ReporteModeracionResumenResponse` | `primeraDenuncia`, `ultimaDenuncia` | ISO | no | |

## Enums
| Enum | Valores |
|---|---|
| `MotivoDenuncia` | `CONTENIDO_SEXUAL`, `OFENSIVO`, `DATOS_PERSONALES`, `FALSO`, `OTRO` |
| `EstadoDenuncia` (parámetro `estado` de la bandeja y `DenunciaResponse.estado`) | `PENDIENTE`, `ATENDIDA`, `DESESTIMADA` |
| `AlcanceModeracion` | `REPORTE`, `FOTO` |
| `tipoEvento` del historial | `CAMBIO_ESTADO`, `ASIGNACION`, **`FOTO_OCULTA`**, **`REPORTE_OCULTO`**, **`FOTO_RESTABLECIDA`**, **`REPORTE_RESTABLECIDO`** |

## Errores y textos
| Ruta | Código HTTP | `codigo` | `message` |
|---|---|---|---|
| POST denuncias | 409 | `DENUNCIA_REPETIDA` | «Ya denunciaste este reporte» |
| POST denuncias | 409 | `LIMITE_DENUNCIAS` | «Alcanzaste el máximo de denuncias por hoy» (10 en las últimas 24 h) |
| POST denuncias | 409 | `DENUNCIA_PROPIA` | «No puedes denunciar tu propio reporte» |
| POST denuncias | 404 | — | el reporte no existe, está cancelado u oculto |
| POST denuncias | 400 | — | motivo ausente o fuera del enum, detalle > 500 |
| ocultamiento | 409 | `YA_OCULTO` | «El reporte ya está oculto» / «La foto ya está oculta» |
| restablecimiento | 409 | `NO_OCULTO` | «El reporte no está oculto» / «La foto no está oculta» |
| ocultamiento / restablecimiento con `FOTO` | 409 | `SIN_FOTO` | «El reporte no tiene foto» |
| ocultamiento / restablecimiento | 400 | `MOTIVO_IDENTIFICA_DENUNCIANTE` | «El motivo no puede incluir el correo de quien denunció: lo leerán el autor y la municipalidad»; `details: ["motivo"]` |
| ocultamiento / restablecimiento | 400 | — | «El motivo debe tener entre 10 y 500 caracteres», o `alcance` inválido |
| cualquiera del ADMIN | 404 | — | el reporte no existe (en `/foto`, tampoco si no tiene foto) |

## Línea de tiempo (lo que manda el servidor)
| Quién lee | `comentario` | `autor` |
|---|---|---|
| ADMIN | el motivo | nombre y apellido del ADMIN |
| Creador y funcionario | el motivo | «Moderación de Ciudad Viva» |
| Adheridos | «Se ocultó contenido de este reporte por las reglas de uso.» (`FOTO_OCULTA`, `REPORTE_OCULTO`) o «Se restableció contenido de este reporte.» (`*_RESTABLECIDA/O`) | «Moderación de Ciudad Viva» |

`avisoIndice`: «Mientras esté oculto, este reporte no cuenta en el índice de desempeño.» en `REPORTE_OCULTO`, «Vuelve a contar en el índice de desempeño.» en `REPORTE_RESTABLECIDO`; `null` en el resto. Mostrarlo tal cual, aparte del comentario. En las entradas de moderación `estadoAnterior` y `estadoNuevo` son `null`.

Mientras el reporte está oculto, el historial responde 200 solo al creador y al ADMIN; el funcionario del distrito y los adheridos reciben **404**.

## Ejemplo de respuesta
`POST /api/admin/moderacion/reportes/42/ocultamiento` con `{"alcance":"FOTO","motivo":"La foto muestra la placa de un vehículo particular"}`:
```json
{
  "id": 42, "latitud": -12.1215, "longitud": -77.0297,
  "titulo": "Bache en la avenida", "descripcion": null, "severidad": "MEDIA",
  "categoriaId": 1, "categoriaNombre": "Bache", "estado": "RECIBIDO",
  "distritoId": 15, "distritoNombre": "Miraflores", "createdAt": "2026-10-29T15:02:11Z",
  "tieneFoto": true, "oculto": false, "fotoOculta": true,
  "denuncias": [
    {"id": 7, "motivo": "DATOS_PERSONALES", "detalle": null, "estado": "ATENDIDA",
     "createdAt": "2026-10-29T14:50:00Z", "denuncianteId": 31, "denuncianteNombre": "Ana Vecina",
     "denuncianteEmail": "ana@ejemplo.pe", "resueltaEn": "2026-10-29T15:10:00Z",
     "motivoResolucion": "La foto muestra la placa de un vehículo particular"}
  ]
}
```

## Notas para el frontend
- **Botón «Denunciar contenido»** en el detalle público: mostrarlo siempre al CIUDADANO con sesión; el 409 decide el mensaje por `codigo` (`DENUNCIA_REPETIDA` → «Ya denunciaste este reporte», `LIMITE_DENUNCIAS` → «Alcanzaste el máximo de denuncias por hoy», `DENUNCIA_PROPIA` → no ofrecer el botón en un reporte propio, si la PWA lo sabe). Sin sesión, el enlace lleva a iniciar sesión.
- **Foto en el área del ADMIN:** traerla con `apiFetch` (lleva el token) y mostrarla como `blob:`, como la foto de perfil. No usar `/media/...`: con la foto oculta da 404.
- **Diálogo de ocultar:** con `REPORTE`, avisar que el reporte sale del índice de desempeño del distrito; con `FOTO`, que el índice no cambia. Junto al motivo, en ocultar y en restablecer, el aviso fijo «El autor y la municipalidad leerán este motivo. No nombres a quien denunció ni digas cuántas denuncias hubo.». El 400 `MOTIVO_IDENTIFICA_DENUNCIANTE` va en el campo del motivo.
- **Bandeja del ADMIN:** `estado` cambia entre pendientes, atendidas y desestimadas. Un reporte oculto **sin denuncias** no aparece en la bandeja: el ADMIN lo abre por su id (`/admin/moderacion/{id}`), que funciona con cualquier reporte.
- **Caché de la PWA:** tras ocultar una foto, la que el Service Worker o el navegador ya guardaron puede seguir viéndose ahí (hasta 30 días); el servidor no puede retirarla. Las rutas `/api/admin/**` no deben guardarse en caché.
- `springdoc` marca casi todo como opcional: tipar en `lib/types/domain.ts` las uniones literales de los tres enums y de `tipoEvento`, y `avisoIndice: string | null`.
