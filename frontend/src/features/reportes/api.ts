import { apiFetch, api, conFotoAbsoluta, urlDeFoto } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { HistorialEntrada } from '@/lib/types/domain';
import type {
  Calificacion,
  ComentarioPublico,
  NuevoReporte,
  PaginaReportes,
  ReporteCreado,
  ReporteResponse,
  ReporteResumen,
} from './model/tipos';

/**
 * Categorias seleccionables (US-05, US-29). El catalogo es compartido y vive
 * en `lib/api/catalogos.ts` (FE-08, anticipado en FE-05); se reexporta aqui
 * solo para `FormularioReporte` y `EditarReporte`, que todavia llaman a
 * `../api` desde el componente (pasan a hooks en FE-06).
 */
export { listarCategorias } from '@/lib/api/catalogos';

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

/* -------------------------------------------------------------------------
 * Ciclo del ciudadano sobre sus propios reportes
 * ---------------------------------------------------------------------- */

/**
 * US-07: reportes que el ciudadano autenticado ENVIO.
 *
 * Solo los que creo, no aquellos a los que se adhirio (US-09) — decision
 * tomada en el backend: "mis reportes" es mas estrecho que la matriz de
 * acceso de US-22, donde el adherido si puede ver el historial.
 */
export async function misReportes(): Promise<ReporteResumen[]> {
  const reportes = await api.get<ReporteResumen[]>('/api/reportes/mis-reportes');
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

/** US-08: edita categoria y/o descripcion. Campos ausentes no se modifican. */
export function editarReporte(
  reporteId: number,
  cambios: { categoriaId?: number; descripcion?: string },
): Promise<ReporteResumen> {
  return api.patch<ReporteResumen>(`/api/reportes/${reporteId}`, cambios);
}

/**
 * US-08: el creador retira su reporte.
 *
 * No borra la fila: lo pasa a CANCELADO. Afecta tambien a los vecinos
 * adheridos (US-09), porque es un unico dano fisico modelado en una sola
 * fila; aceptable porque solo aplica en PENDIENTE.
 */
export function cancelarReporte(reporteId: number): Promise<ReporteResumen> {
  return api.delete<ReporteResumen>(`/api/reportes/${reporteId}`);
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
export async function crearReporte(datos: NuevoReporte): Promise<ReporteCreado> {
  const cuerpo = new FormData();
  cuerpo.append('latitud', String(datos.latitud));
  cuerpo.append('longitud', String(datos.longitud));
  cuerpo.append('categoriaId', String(datos.categoriaId));
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
  });

  return {
    id: creado.id ?? 0,
    esAdhesion: creado.esAdhesion ?? false,
    totalAdhesiones: creado.totalAdhesiones ?? 1,
    distritoNombre: creado.distritoNombre ?? null,
    categoriaNombre: creado.categoriaNombre ?? null,
    fotoUrl: urlDeFoto(creado.fotoUrl),
  };
}
