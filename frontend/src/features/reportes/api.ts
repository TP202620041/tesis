import { apiFetch, api, conFotoAbsoluta, urlDeFoto } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import {
  esSeveridad,
  type ClasificacionResponse,
  type HistorialEntrada,
  type Severidad,
} from '@/lib/types/domain';
import { sugerenciaDeRespuesta, type SugerenciaDeCategoria } from './model/sugerencia';
import type {
  Calificacion,
  ComentarioPublico,
  DensidadReportes,
  NuevoReporte,
  PaginaReportes,
  ReporteCreado,
  ReporteResponse,
  ReporteResumen,
} from './model/tipos';

/**
 * US-06: la cola offline en IndexedDB (adaptador en `src/pwa/`). Se expone
 * por el gateway de la feature para que los hooks no dependan del adaptador
 * directamente: `api.ts` sigue siendo la unica puerta de I/O de `reportes`.
 */
export { colaDeReportes, hayIndexedDb, type AlmacenDeCola } from '@/pwa/colaReportes';

/**
 * US-10/US-12: busqueda publica de reportes. SIN token — el endpoint es
 * publico y adjuntar un `Authorization` inexistente no aporta nada.
 *
 * `query` la construye {@link construirQuery} a partir del area visible y
 * los filtros del panel.
 */
export async function buscarReportes(query: string): Promise<PaginaReportes> {
  const pagina = await api.get<{ content?: ReporteResumen[]; totalElements?: number }>(
    `/api/reportes?${query}`,
    { conAuth: false },
  );
  return {
    contenido: (pagina.content ?? []).map(conFotoAbsoluta),
    total: pagina.totalElements ?? 0,
  };
}

/**
 * US-11: densidad de reportes para el mapa de calor. **Publica**, SIN token,
 * igual que la busqueda.
 *
 * `query` la construye `construirQueryDensidad` (solo filtros, sin area).
 * No se fuerza `cache: 'no-store'`: el backend responde con
 * `Cache-Control: public, max-age=60` y `ETag`, y el navegador reutiliza su
 * copia o revalida (304) por su cuenta cuando la misma consulta se repite
 * (p. ej. al apagar y volver a encender la capa).
 */
export function densidadDeReportes(query: string): Promise<DensidadReportes> {
  return api.get<DensidadReportes>(`/api/reportes/densidad${query ? `?${query}` : ''}`, {
    conAuth: false,
  });
}

/* -------------------------------------------------------------------------
 * Ciclo del ciudadano sobre sus propios reportes
 * ---------------------------------------------------------------------- */

/**
 * US-07: reportes que el ciudadano autenticado ENVIO.
 *
 * Solo los que creo, no aquellos a los que se adhirio (US-09) — decision
 * tomada en el backend: "mis reportes" es mas estrecho que la matriz de
 * acceso de US-22, donde el adherido si puede ver el historial. Los que
 * apoya van por {@link misAdhesiones}.
 */
export async function misReportes(): Promise<ReporteResumen[]> {
  const reportes = await api.get<ReporteResumen[]>('/api/reportes/mis-reportes');
  return reportes.map(conFotoAbsoluta);
}

/**
 * QA-1 M-6 (US-09): reportes de OTROS vecinos a los que el ciudadano se
 * adhirio, del apoyo mas reciente al mas antiguo y en cualquier estado
 * (tambien CANCELADO, que no tiene detalle publico: 404).
 *
 * Endpoint aparte de `mis-reportes` (handoff del 22/10): la relacion «lo
 * apoyo, no lo cree» la da la ruta, no un campo, porque el resumen lo
 * comparte el mapa anonimo; y el detalle `/mis-reportes/[id]` ofrece editar y
 * retirar, que en un reporte ajeno el backend rechaza con 403.
 */
export async function misAdhesiones(): Promise<ReporteResumen[]> {
  const reportes = await api.get<ReporteResumen[]>('/api/reportes/mis-adhesiones');
  return reportes.map(conFotoAbsoluta);
}

/**
 * US-26 (Escenario 2): reportes propios resueltos hace 3+ dias que siguen
 * sin calificar. El backend lo resuelve como consulta bajo demanda, no como
 * un job de recordatorios.
 */
export async function pendientesDeCalificacion(): Promise<ReporteResumen[]> {
  const reportes = await api.get<ReporteResumen[]>(
    '/api/reportes/mis-reportes/pendientes-calificacion',
  );
  return reportes.map(conFotoAbsoluta);
}

/** US-22: linea de tiempo del reporte. Al ciudadano le llega REDACTADA. */
export function historialDeReporte(reporteId: number): Promise<HistorialEntrada[]> {
  return api.get<HistorialEntrada[]>(`/api/reportes/${reporteId}/historial`);
}

/**
 * US-08: edita categoria, descripcion y (NC-02) titulo y severidad. Campos
 * ausentes no se modifican. El backend valida el titulo igual que al crear
 * (400 si no tiene de 5 a 120 caracteres tras el trim).
 */
export async function editarReporte(
  reporteId: number,
  cambios: { categoriaId?: number; descripcion?: string; titulo?: string; severidad?: Severidad },
): Promise<ReporteResumen> {
  return conFotoAbsoluta(await api.patch<ReporteResumen>(`/api/reportes/${reporteId}`, cambios));
}

/**
 * US-08: el creador retira su reporte.
 *
 * No borra la fila: lo pasa a CANCELADO. Afecta tambien a los vecinos
 * adheridos (US-09), porque es un unico dano fisico modelado en una sola
 * fila; aceptable porque solo aplica en PENDIENTE.
 */
export async function cancelarReporte(reporteId: number): Promise<ReporteResumen> {
  return conFotoAbsoluta(await api.delete<ReporteResumen>(`/api/reportes/${reporteId}`));
}

/**
 * Un reporte por id. **Publico** — sin token: la misma informacion que ya
 * devuelve la busqueda, solo que de a uno. Devuelve `null` si no existe o
 * si fue retirado por su creador (el backend responde 404 en ambos casos:
 * un CANCELADO no es informacion publica).
 */
export async function reportePorId(reporteId: number): Promise<ReporteResumen | null> {
  try {
    return conFotoAbsoluta(
      await api.get<ReporteResumen>(`/api/reportes/${reporteId}`, { conAuth: false }),
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * US-27: comentarios de un reporte. **Lectura publica** — sin token: es
 * informacion que cualquiera debe poder consultar, igual que el mapa.
 */
export function listarComentarios(reporteId: number): Promise<ComentarioPublico[]> {
  return api.get<ComentarioPublico[]>(`/api/reportes/${reporteId}/comentarios`, {
    conAuth: false,
  });
}

/**
 * US-27: publica un comentario. Exige sesion, pero la puede escribir
 * CUALQUIER ciudadano autenticado, no solo el creador — asimetria
 * deliberada frente a calificar (US-26): comentar es opinion publica
 * verificable, calificar es el juicio de quien reporto.
 */
export function comentar(reporteId: number, contenido: string): Promise<ComentarioPublico> {
  return api.post<ComentarioPublico>(`/api/reportes/${reporteId}/comentarios`, {
    contenido: contenido.trim(),
  });
}

/**
 * US-26: la calificacion que el propio ciudadano dejo, o `null` si todavia
 * no califico.
 *
 * El 404 del backend NO es un error: es la senal de "aun no calificaste", y
 * es lo que decide si la pantalla muestra el formulario o lo ya emitido. Va
 * en un endpoint propio porque "ya calificado" depende de QUIEN pregunta, y
 * el resumen del reporte lo comparten el mapa publico y la bandeja.
 */
export async function miCalificacion(reporteId: number): Promise<Calificacion | null> {
  try {
    return await api.get<Calificacion>(`/api/reportes/${reporteId}/calificacion`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** US-26: califica la atencion recibida. Solo el creador y una sola vez. */
export function calificar(
  reporteId: number,
  estrellas: number,
  comentario?: string,
): Promise<Calificacion> {
  return api.post(`/api/reportes/${reporteId}/calificacion`, {
    estrellas,
    comentario: comentario?.trim() || undefined,
  });
}

/**
 * US-05: crea el reporte. `multipart/form-data` porque lleva la foto junto
 * con los datos.
 *
 * El distrito NO se envia: lo asigna el servidor por point-in-polygon sobre
 * las coordenadas. Es la restriccion clave del proyecto — el ciudadano no
 * tiene que saber ni elegir a que municipalidad pertenece el daño.
 */
export async function crearReporte(
  datos: NuevoReporte,
  opciones: { redirigirEn401?: boolean } = {},
): Promise<ReporteCreado> {
  const cuerpo = new FormData();
  cuerpo.append('latitud', String(datos.latitud));
  cuerpo.append('longitud', String(datos.longitud));
  cuerpo.append('categoriaId', String(datos.categoriaId));
  // NC-02: obligatorios (400 si faltan). El titulo va recortado, como lo
  // guarda el backend.
  cuerpo.append('titulo', datos.titulo.trim());
  cuerpo.append('severidad', datos.severidad);
  cuerpo.append('ubicacionManual', String(datos.ubicacionManual));
  if (datos.descripcion?.trim()) {
    cuerpo.append('descripcion', datos.descripcion.trim());
  }
  if (datos.foto) {
    cuerpo.append('foto', datos.foto);
  }

  // Sin `json`, el cliente no fija Content-Type: lo hace el navegador, que es
  // el unico que conoce el boundary del multipart.
  const creado = await apiFetch<ReporteResponse>('/api/reportes', {
    method: 'POST',
    body: cuerpo,
    idempotencyKey: datos.idempotencyKey,
    // El reenvio de la cola offline (US-06) pasa `false`: un 401 en segundo
    // plano no debe sacar al usuario de la pantalla.
    redirigirEn401: opciones.redirigirEn401,
  });

  return {
    id: creado.id ?? 0,
    esAdhesion: creado.esAdhesion ?? false,
    totalAdhesiones: creado.totalAdhesiones ?? 1,
    distritoNombre: creado.distritoNombre ?? null,
    categoriaNombre: creado.categoriaNombre ?? null,
    fotoUrl: urlDeFoto(creado.fotoUrl),
    // NC-02: los de la RESPUESTA (en una adhesion, los del reporte
    // existente). `null` si es la respuesta guardada de un envio anterior a
    // NC-02 (reenvio idempotente).
    titulo: creado.titulo ?? null,
    severidad: esSeveridad(creado.severidad) ? creado.severidad : null,
  };
}

/**
 * NC-04: vista previa de la categoría que sugiere la foto, mientras el
 * ciudadano arma el reporte. El servidor **no guarda nada** y responde 200
 * aun sin sugerencia (devuelve `null`); el reporte se crea después con la
 * categoría que el ciudadano elija, y la sugerencia oficial la recalcula el
 * backend sobre la foto guardada (D-08), así que aquí no se reenvía nada.
 *
 * - `signal`: la cancela el hook cuando cambia la foto, se envía el reporte o
 *   se agota la espera. Una petición cancelada llega como `NetworkError`.
 * - `redirigirEn401: false`: es una ayuda que el ciudadano no pidió. Con la
 *   sesión vencida, no debe tirar el formulario a medio llenar con una
 *   navegación al login (ni con el 403 de términos pendientes); el token se
 *   borra igual y el envío del reporte, que sí es la acción del ciudadano,
 *   lleva al login como siempre.
 * - Errores: 409 = la foto no es una imagen válida (el mismo mensaje que al
 *   crear el reporte). Los demás los traduce el hook a «sin sugerencia».
 */
export async function clasificarFoto(
  foto: File,
  signal?: AbortSignal,
): Promise<SugerenciaDeCategoria | null> {
  const cuerpo = new FormData();
  cuerpo.append('foto', foto);
  // Sin `json`: el navegador fija el Content-Type con el boundary del multipart.
  const respuesta = await apiFetch<ClasificacionResponse | undefined>('/api/clasificaciones', {
    method: 'POST',
    body: cuerpo,
    signal,
    redirigirEn401: false,
  });
  return sugerenciaDeRespuesta(respuesta);
}
