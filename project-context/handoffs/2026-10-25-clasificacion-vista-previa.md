# Handoff de contrato: vista previa de la categoría por la foto (NC-04)

- **Estado:** atendido <!-- pendiente | atendido -->
- **Fecha:** 2026-10-25
- **Origen:** backend, rama `feature/nc-04-clasificacion`, commit `6106cb8` y las observaciones de la revisión en el commit siguiente (PR por abrir)
- **Historia o tarea:** NC-04 fase 0 (cambia US-05; propuesta aceptada `decisions/propuestas/2026-10-21-ml-clases-modelo.md`)
- **Atendido por:** frontend, rama `feature/nc-04-vista-previa`, 2026-10-26 (propone la categoría con un botón, sin preseleccionarla: `frontend/README.md`, «Sugerencia de la categoría por la foto (NC-04)»)

## Endpoints afectados
| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/clasificaciones` (multipart) | **Nuevo.** Vista previa: recibe la foto y devuelve la categoría sugerida, o ninguna. **No guarda nada.** Solo `CIUDADANO` con los términos aceptados. |
| GET | `/api/categorias` | **Cambia (datos, no forma).** Sin `distritoId` devuelve **5** estándar, no 6: «Hueco en calzada» quedó inactiva (V19). Con `distritoId`, lo mismo más las del distrito. |
| GET | `/api/categorias/gestion` (funcionario) | Sin cambio de forma: «Hueco en calzada» sigue listada, ahora con `activo: false`. |
| POST | `/api/reportes` | **Sin cambio de contrato.** Con `categoriaId` de «Hueco en calzada» responde **409** «La categoría seleccionada no está activa», como con cualquier inactiva. La sugerencia oficial la calcula el backend después de crear; no hay campos nuevos que enviar, y si se envían se ignoran. |

Ningún DTO existente cambia. La sugerencia oficial que guarda el backend (`categoria_sugerida_id`, `confianza_sugerencia`, `version_modelo_sugerencia`) es una **señal interna** y **no aparece en ninguna respuesta** (ni del ciudadano, ni pública, ni del funcionario).

## Campos
| DTO | Campo | Tipo | ¿Nulo? | Cambio | Quién lo ve |
|---|---|---|---|---|---|
| `POST /api/clasificaciones` (multipart) | `foto` | archivo (JPEG, PNG o WEBP, ≤ 10 MB) | no (**obligatoria**) | nuevo | — (entrada) |
| `ClasificacionResponse` | `categoriaId` | number (int64) | **sí**: `null` = sin sugerencia | nuevo | el ciudadano que está reportando |
| `ClasificacionResponse` | `categoriaNombre` | string | **sí**: `null` = sin sugerencia | nuevo | el ciudadano que está reportando |

Los dos campos son nulos o no nulos a la vez. **No hay confianza ni versión del modelo** en la respuesta, a propósito (ver notas).

## Enums
| Enum | Valores |
|---|---|
| — | Ninguno nuevo. |

## Ejemplo de respuesta
`POST /api/clasificaciones` con sugerencia (200):
```json
{ "categoriaId": 1, "categoriaNombre": "Bache" }
```

Sin sugerencia (200): el modelo no encontró un daño claro, el clasificador falló, otra vista previa estaba en curso (no se espera turno) o la clasificación está apagada.
```json
{ "categoriaId": null, "categoriaNombre": null }
```

Errores:
- Sin token: **401**. Con rol FUNCIONARIO_MUNICIPAL o ADMIN: **403** «Acceso denegado». Términos pendientes: **403** `TERMINOS_PENDIENTES`, como cualquier ruta privada.
- Sin la parte `foto`: **400** «Falta la parte obligatoria 'foto' del formulario». Parte vacía: **400** «Adjunta la foto del daño para sugerir una categoría».
- No es una imagen JPEG, PNG o WEBP válida: **409** «Formato de foto no permitido…», el mismo mensaje que al crear el reporte. Más de 40 MP: 409. **Solo con la clasificación encendida**: apagada (producción hasta NC-04b) la foto ni se sanea y la respuesta es 200 «sin sugerencia» aunque no sea una imagen válida. La PWA no puede usar este endpoint para validar la foto.
- Más de 10 MB: **413**.
- **Nunca 503 ni otro 5xx por el clasificador.** Si el servidor está ocupado saneando fotos, o el clasificador falla por cualquier motivo, la respuesta es 200 «sin sugerencia». (Un 5xx solo puede venir de un fallo general del servidor, como en cualquier ruta.)

## Notas para el frontend

**Qué es.** Una ayuda de interfaz (W-07/W-08): cuando el ciudadano elige la foto, la PWA la envía aquí y, si hay sugerencia, **preselecciona** esa categoría en el formulario y lo dice («Parece un bache, ¿es correcto?»). El ciudadano **siempre** puede cambiarla; el reporte se crea con la que confirme. No hace falta ni conviene reenviar nada de la sugerencia al crear: el backend la recalcula sobre la foto guardada (D-08) y descarta lo que mande el cliente.

**La IA nunca bloquea un reporte.** Una respuesta sin sugerencia, un error de red o un 5xx de este endpoint no deben impedir enviar el reporte: el ciudadano elige la categoría a mano, como hoy. No reintentar en bucle; un único intento por foto elegida basta. Este endpoint **no** va en la cola offline (US-06): sin conexión, simplemente no hay sugerencia.

**No bloquear el envío mientras la vista previa está en curso.** El botón de enviar y el selector de categoría siguen habilitados durante la petición (a lo sumo, un indicador discreto de «analizando la foto»). Si el ciudadano envía antes de que llegue la respuesta, se descarta la vista previa (cancelar la petición o ignorar su respuesta): el backend calcula la sugerencia oficial igual, sobre la foto guardada.

**No reemplazar una categoría que el ciudadano ya eligió.** Si eligió una categoría a mano antes de que llegue la sugerencia, o cambió la sugerida, la respuesta tardía no la pisa: a lo sumo se muestra como un aviso («¿Es un bache?») que el ciudadano puede aceptar con un toque. Preseleccionar solo cuando el selector sigue vacío o con la sugerencia anterior de esa misma foto. Si cambia la foto, la sugerencia de la foto anterior se descarta. Así se evita el anclaje: la decisión es del ciudadano y la sugerencia no debe sobrescribirla.

**El `categoriaId` sugerido siempre es seleccionable**: es una categoría estándar activa («Bache» o «Pista deteriorada»), presente en `GET /api/categorias` con o sin `distritoId`. Si por un desfase de caché no estuviera en el catálogo que tiene la PWA, ignorar la sugerencia.

**Sin confianza ni versión del modelo, a propósito.** La sugerencia es una señal interna (regla del proyecto): la respuesta trae solo lo que la interfaz necesita. No mostrar porcentajes ni inferirlos. Por debajo del umbral (0,50) el backend ya responde «sin sugerencia».

**Errores de la foto.** Con la clasificación encendida, el 409 de formato es el mismo que devolvería `POST /api/reportes` con esa foto: conviene mostrarlo junto a la foto en ese momento, porque el envío del reporte fallaría igual. Con la clasificación apagada no llega: que la PWA no dependa de este endpoint para validar la foto.

**«Hueco en calzada» ya no se ofrece.** Sale del catálogo público. Los reportes existentes con esa categoría se siguen mostrando con su nombre (`categoriaNombre` en los DTO de siempre). Al **editar** uno de esos reportes (US-08), el selector puede no tener su categoría actual: mostrarla igual como opción seleccionada (o no enviar `categoriaId`), porque reenviar la misma categoría inactiva está permitido; cambiar a ella desde otra no. En el mapa ya no se puede filtrar por «Hueco en calzada».

**Aviso de privacidad.** El texto de privacidad debe decir que la foto se analiza automáticamente para sugerir una categoría y que la decisión final es del ciudadano (DS 016-2024-JUS, art. 6.1). Lo decide el usuario junto con el texto legal.

**Hoy el clasificador es falso** (NC-04 fase 0): en el perfil `local` del backend sugiere «Bache» para cualquier foto (`CLASIFICACION_FALSO_RESPUESTA=bache:0.87`); con `CLASIFICACION_FALSO_RESPUESTA=` (vacío) nunca sugiere y con `falla` simula el servicio caído (la respuesta es «sin sugerencia»). En producción está apagado hasta NC-04b: el endpoint existe y responde siempre «sin sugerencia», sin sanear la foto. El contrato no cambia cuando llegue el modelo real.

**Tipos.** Con el backend de esta rama corriendo: `npm run api:sync`. springdoc marca los campos como opcionales; el tipo real es `{ categoriaId: number | null; categoriaNombre: string | null }`.
