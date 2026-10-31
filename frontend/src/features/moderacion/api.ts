import { api, apiFetch } from '@/lib/api/client';
import {
  esEstadoDenuncia,
  esSeveridad,
  type EstadoDenuncia,
  type HistorialEntrada,
} from '@/lib/types/domain';
import { parametrosDeBandeja } from './model/moderacion';
import type {
  Denuncia,
  DenunciaResponse,
  FilaDeModeracion,
  FiltrosDeModeracion,
  OrdenDeModeracion,
  PaginaDeModeracion,
  PaginaModeracionResponse,
  ReporteEnModeracion,
  ReporteModeracionResponse,
  ReporteModeracionResumenResponse,
} from './model/tipos';

/**
 * API de moderacion del ADMIN (NC-11b, D-15). Todas las rutas son solo
 * ADMIN (403 para otro rol; 401 sin token) y responden `Cache-Control:
 * no-store, private`; el Service Worker tampoco guarda nada de `/api/**`
 * (`pwa/cachesDeSesion.ts`). Contrato:
 * `project-context/handoffs/2026-10-29-ocultar-y-denunciar.md`.
 */

const BASE = '/api/admin/moderacion/reportes';

/** Un estado desconocido (no deberia llegar) se trata como pendiente: hay que mirarlo. */
function estado(valor: string | undefined): EstadoDenuncia {
  return esEstadoDenuncia(valor) ? valor : 'PENDIENTE';
}

export function aDenuncia(d: DenunciaResponse): Denuncia {
  return {
    id: d.id ?? 0,
    motivo: d.motivo ?? 'OTRO',
    estado: estado(d.estado),
    detalle: d.detalle ?? null,
    createdAt: d.createdAt ?? '',
    // Los tres son nulos a la vez cuando la cuenta se cerro (BE-14).
    denunciante:
      d.denuncianteId != null
        ? { id: d.denuncianteId, nombre: d.denuncianteNombre ?? '', email: d.denuncianteEmail ?? '' }
        : null,
    resueltaEn: d.resueltaEn ?? null,
    motivoResolucion: d.motivoResolucion ?? null,
  };
}

export function aReporteEnModeracion(r: ReporteModeracionResponse): ReporteEnModeracion {
  return {
    id: r.id ?? 0,
    latitud: r.latitud ?? 0,
    longitud: r.longitud ?? 0,
    titulo: r.titulo ?? '',
    descripcion: r.descripcion ?? null,
    severidad: esSeveridad(r.severidad) ? r.severidad : null,
    categoriaNombre: r.categoriaNombre ?? null,
    estado: r.estado ?? '',
    distritoNombre: r.distritoNombre ?? null,
    createdAt: r.createdAt ?? '',
    tieneFoto: r.tieneFoto ?? false,
    oculto: r.oculto ?? false,
    fotoOculta: r.fotoOculta ?? false,
    denuncias: (r.denuncias ?? []).map(aDenuncia),
  };
}

export function aFilaDeModeracion(f: ReporteModeracionResumenResponse): FilaDeModeracion {
  return {
    reporteId: f.reporteId ?? 0,
    titulo: f.titulo ?? '',
    estado: f.estado ?? '',
    distritoNombre: f.distritoNombre ?? null,
    tieneFoto: f.tieneFoto ?? false,
    oculto: f.oculto ?? false,
    fotoOculta: f.fotoOculta ?? false,
    totalDenuncias: f.totalDenuncias ?? 0,
    porMotivo: f.porMotivo ?? {},
    primeraDenuncia: f.primeraDenuncia ?? null,
    ultimaDenuncia: f.ultimaDenuncia ?? null,
  };
}

export function aPaginaDeModeracion(p: PaginaModeracionResponse): PaginaDeModeracion {
  return {
    filas: (p.content ?? []).map(aFilaDeModeracion),
    pagina: p.number ?? 0,
    totalPaginas: Math.max(1, p.totalPages ?? 1),
    total: p.totalElements ?? 0,
  };
}

/**
 * Bandeja paginada: los reportes con denuncias en un estado, o (`ocultos=true`,
 * decision del 30/10) los que tienen el reporte o la foto ocultos, tengan
 * denuncias o no. Un reporte oculto sin denuncias solo aparece en esa vista.
 */
export async function bandejaDeModeracion(filtros: FiltrosDeModeracion): Promise<PaginaDeModeracion> {
  const pagina = await api.get<PaginaModeracionResponse>(
    `${BASE}?${parametrosDeBandeja(filtros).toString()}`,
  );
  return aPaginaDeModeracion(pagina);
}

/** El reporte con su estado de moderacion y todas sus denuncias; 404 si no existe. */
export async function detalleDeModeracion(reporteId: number): Promise<ReporteEnModeracion> {
  return aReporteEnModeracion(await api.get<ReporteModeracionResponse>(`${BASE}/${reporteId}`));
}

/**
 * La linea de tiempo del reporte, que al ADMIN le llega completa (con el
 * autor de cada evento de moderacion). Es la misma ruta que usan el
 * ciudadano y el funcionario; el servidor redacta segun quien pide.
 */
export function historialDeModeracion(reporteId: number): Promise<HistorialEntrada[]> {
  return api.get<HistorialEntrada[]>(`/api/reportes/${reporteId}/historial`);
}

/**
 * La foto del reporte aunque este oculta, como URL `blob:`. Se trae con
 * `apiFetch` porque la ruta exige `Authorization` y un `<img src>` no lo
 * envia; `/media/...` no sirve: con la foto oculta responde 404. Quien la use
 * DEBE liberarla con `URL.revokeObjectURL` (lo hace `hooks/useFotoModerada`).
 */
export async function descargarFotoModerada(reporteId: number): Promise<string> {
  const blob = await apiFetch<Blob>(`${BASE}/${reporteId}/foto`, { method: 'GET', comoBlob: true });
  return URL.createObjectURL(blob);
}

/** Oculta el reporte o su foto. 409 `YA_OCULTO` / `SIN_FOTO`; 400 `MOTIVO_IDENTIFICA_DENUNCIANTE`. */
export async function ocultarContenido(
  reporteId: number,
  orden: OrdenDeModeracion,
): Promise<ReporteEnModeracion> {
  return aReporteEnModeracion(
    await api.post<ReporteModeracionResponse>(`${BASE}/${reporteId}/ocultamiento`, {
      alcance: orden.alcance,
      motivo: orden.motivo.trim(),
    }),
  );
}

/** Restablece el reporte o su foto. 409 `NO_OCULTO` / `SIN_FOTO`; 400 `MOTIVO_IDENTIFICA_DENUNCIANTE`. */
export async function restablecerContenido(
  reporteId: number,
  orden: OrdenDeModeracion,
): Promise<ReporteEnModeracion> {
  return aReporteEnModeracion(
    await api.post<ReporteModeracionResponse>(`${BASE}/${reporteId}/restablecimiento`, {
      alcance: orden.alcance,
      motivo: orden.motivo.trim(),
    }),
  );
}

/** Desestima las denuncias pendientes sin ocultar nada. El motivo es opcional. */
export async function desestimarDenuncias(
  reporteId: number,
  motivo?: string,
): Promise<ReporteEnModeracion> {
  const texto = motivo?.trim();
  return aReporteEnModeracion(
    await api.post<ReporteModeracionResponse>(
      `${BASE}/${reporteId}/desestimacion`,
      texto ? { motivo: texto } : undefined,
    ),
  );
}
