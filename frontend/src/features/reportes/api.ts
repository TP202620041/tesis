import { apiFetch, api } from '@/lib/api/client';
import type { CategoriaDano } from '@/lib/types/domain';
import type { components } from '@/lib/api/generated/schema';

type ReporteResponse = components['schemas']['ReporteResponse'];

/** Reporte recien creado (o al que el ciudadano se adhirio). */
export interface ReporteCreado {
  id: number;
  /** true = se sumo a un reporte existente cercano (US-09). */
  esAdhesion: boolean;
  totalAdhesiones: number;
  distritoNombre: string | null;
  categoriaNombre: string | null;
  fotoUrl: string | null;
}

/**
 * Categorias seleccionables (US-05, US-29).
 *
 * Sin `distritoId` el backend devuelve solo las 6 estandar; con el, agrega
 * las personalizadas de ese distrito. Por eso el formulario vuelve a
 * pedirlas cuando se resuelve la ubicacion: antes de conocer el distrito no
 * hay forma de saber que categorias propias ofrece esa municipalidad.
 */
export function listarCategorias(distritoId?: number | null): Promise<CategoriaDano[]> {
  const query = distritoId != null ? `?distritoId=${distritoId}` : '';
  return api.get<CategoriaDano[]>(`/api/categorias${query}`, { conAuth: false });
}

/** Resumen de reporte que devuelve la busqueda publica (US-10/US-12). */
export type ReporteResumen = components['schemas']['ReporteResumenResponse'];

export interface PaginaReportes {
  contenido: ReporteResumen[];
  /** Total que cumple los filtros, no solo los de esta pagina. */
  total: number;
}

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
    contenido: pagina.content ?? [],
    total: pagina.totalElements ?? 0,
  };
}

export interface NuevoReporte {
  latitud: number;
  longitud: number;
  categoriaId: number;
  descripcion?: string;
  /** true si el ciudadano marco el punto a mano (US-05, escenario 2). */
  ubicacionManual: boolean;
  foto?: File | null;
  /**
   * Clave de idempotencia (US-06): identifica el INTENTO logico de creacion,
   * no la peticion HTTP. Debe ser la MISMA si se reintenta el mismo reporte,
   * para que el backend devuelva la respuesta original en vez de crear un
   * duplicado o rechazarlo con el 409 de acumulacion.
   */
  idempotencyKey: string;
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
    fotoUrl: creado.fotoUrl ?? null,
  };
}
