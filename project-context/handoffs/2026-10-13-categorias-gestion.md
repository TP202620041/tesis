# Handoff de contrato: gestión de categorías personalizadas

- **Estado:** pendiente <!-- pendiente | atendido -->
- **Fecha:** 2026-10-13
- **Origen:** backend, rama `feature/us-29-categorias`, commit `88118d8` (PR pendiente; la rama sale de `feature/us-25-soporte-admin`)
- **Historia o tarea:** US-29
- **Atendido por:** _(frontend, rama y fecha)_

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| GET | `/api/categorias/gestion` | **Nuevo.** Rol `FUNCIONARIO_MUNICIPAL`. Estándar + personalizadas de su distrito, **incluidas las inactivas**. Devuelve `CategoriaGestionResponse[]`. |
| PATCH | `/api/categorias/{id}` | **Nuevo.** Rol `FUNCIONARIO_MUNICIPAL`. Cuerpo `EditarCategoriaRequest`. Devuelve `CategoriaGestionResponse`. |
| PATCH | `/api/categorias/{id}/activa` | **Nuevo.** Rol `FUNCIONARIO_MUNICIPAL`. Cuerpo `CambiarActivaCategoriaRequest`. Devuelve `CategoriaGestionResponse`. |
| GET | `/api/categorias?distritoId=` | **Sin cambios** de forma (público, solo activas, sin `activo`). Una categoría desactivada deja de aparecer. |
| POST | `/api/categorias` | Forma sin cambios. **Nueva regla:** un nombre igual a una estándar (sin distinguir mayúsculas) da 409. Funcionario sin distrito: sigue 403, ahora con mensaje. |
| PATCH | `/api/reportes/{id}` (US-08) | Forma sin cambios. **Corrección:** la categoría solo se valida cuando *cambia*; reenviar la actual o editar solo la descripción funciona aunque la categoría esté inactiva. |

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio (nuevo / cambia / se elimina) | Quién lo ve |
|---|---|---|---|---|---|
| `CategoriaGestionResponse` | `id` | number (Long) | No | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `CategoriaGestionResponse` | `nombre` | string | No | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `CategoriaGestionResponse` | `descripcion` | string | **Sí** | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `CategoriaGestionResponse` | `esEstandar` | boolean | No | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `CategoriaGestionResponse` | `activo` | boolean | No | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `CategoriaGestionResponse` | `distritoId` | number (Long) | **Sí** (null en las estándar) | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `CategoriaGestionResponse` | `distritoNombre` | string | **Sí** (null en las estándar) | nuevo DTO | FUNCIONARIO_MUNICIPAL |
| `EditarCategoriaRequest` | `nombre` | string, 1..100, no en blanco | No (obligatorio) | nuevo | — |
| `EditarCategoriaRequest` | `descripcion` | string, ≤ 300 | Sí | nuevo. **Reemplaza**: ausente o `null` deja la categoría sin descripción (enviar siempre el valor actual si no se edita). | — |
| `CambiarActivaCategoriaRequest` | `activa` | boolean | No (obligatorio) | nuevo | — |

`CategoriaDanoResponse` (catálogo público) **no cambia** y sigue sin `activo`.

## Enums
| Enum | Valores |
|---|---|
| _(ninguno nuevo)_ | |

## Ejemplo de respuesta
`GET /api/categorias/gestion` (funcionario de Miraflores; recortado a 3 de las 6 estándar)
```json
[
  { "id": 1, "nombre": "Bache", "descripcion": "Bache o hueco en la calzada", "esEstandar": true, "activo": true, "distritoId": null, "distritoNombre": null },
  { "id": 4, "nombre": "Hueco en calzada", "descripcion": "Deterioro profundo de la superficie vial", "esEstandar": true, "activo": true, "distritoId": null, "distritoNombre": null },
  { "id": 6, "nombre": "Pista deteriorada", "descripcion": "Desgaste o agrietamiento del pavimento", "esEstandar": true, "activo": true, "distritoId": null, "distritoNombre": null },
  { "id": 58, "nombre": "Ciclovia obstruida", "descripcion": null, "esEstandar": false, "activo": false, "distritoId": 15, "distritoNombre": "Miraflores" },
  { "id": 57, "nombre": "Malecon erosionado", "descripcion": "Borde del acantilado", "esEstandar": false, "activo": true, "distritoId": 15, "distritoNombre": "Miraflores" }
]
```
Orden: primero las estándar y luego las personalizadas, cada grupo por `nombre` ascendente.

`PATCH /api/categorias/58/activa` con `{ "activa": true }` → 200 con el `CategoriaGestionResponse` de la 58 y `"activo": true`.

## Notas para el frontend
- **Errores** (cuerpo `ApiError`, usar `message` cuando exista):
  - 400: `nombre` vacío o largo, `descripcion` > 300, `activa` ausente.
  - 401: sin token. 403 "Acceso denegado": rol distinto de `FUNCIONARIO_MUNICIPAL`.
  - 403 **con mensaje**: categoría estándar ("Las categorias estandar no se pueden editar ni desactivar"), personalizada de otro distrito ("Solo puede gestionar las categorias personalizadas de <distrito>"), funcionario sin distrito asignado.
  - 404: categoría inexistente.
  - 409: nombre repetido en el distrito o igual a una estándar (sin distinguir mayúsculas).
- En la pantalla de gestión, las estándar se muestran de solo lectura (sin editar ni interruptor); `esEstandar` decide eso.
- Desactivar **solo deja de ofrecerla**: los reportes que ya la tienen no cambian y el ciudadano puede seguir editando la descripción de un reporte PENDIENTE con esa categoría. En el formulario de edición de reporte (US-08) conviene no reenviar `categoriaId` si no cambió (aunque reenviar la misma ya no falla); elegir *otra* categoría inactiva da 409.
- Tras desactivar o reactivar, el catálogo público (`GET /api/categorias?distritoId=`) ya refleja el cambio: invalidar su caché si se guarda en el cliente o en el Service Worker.
- `activo` no existe en el DTO público: no tiparlo en `CategoriaDanoResponse`.
