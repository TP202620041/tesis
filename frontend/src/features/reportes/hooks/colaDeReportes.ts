import { ApiError, NetworkError } from '@/lib/api/errors';
import { colaDeReportes, type AlmacenDeCola } from '@/pwa/colaReportes';
import { crearReporte } from '../api';
import {
  desenlaceDeEnvio,
  pendientesDe,
  type DesenlaceDeEnvio,
  type ReporteEnCola,
} from '../model/colaOffline';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';

/**
 * US-06: casos de uso de la cola offline (capa de aplicacion, sin React).
 *
 * El reenvio usa `crearReporte`, es decir, el mismo cliente HTTP que el
 * formulario: el token se lee de `token-storage` en el momento de enviar.
 * Por eso un reporte encolado con una sesion que luego vence se envia con el
 * token NUEVO tras volver a iniciar sesion, y nunca con el viejo.
 */

export interface Dependencias {
  almacen: AlmacenDeCola;
  enviar: (nuevo: NuevoReporte) => Promise<ReporteCreado>;
  ahora: () => Date;
}

const POR_DEFECTO: Dependencias = {
  almacen: colaDeReportes,
  enviar: crearReporte,
  ahora: () => new Date(),
};

/**
 * Guarda en el dispositivo un reporte que no se pudo enviar por falta de
 * red, CON SU `Idempotency-Key`. Si la primera peticion si llego al backend
 * y solo se perdio la respuesta, el reenvio con la misma clave devuelve el
 * reporte original en vez de crear otro.
 */
export async function encolarReporte(
  nuevo: NuevoReporte,
  usuarioId: number,
  deps: Pick<Dependencias, 'almacen' | 'ahora'> = POR_DEFECTO,
): Promise<void> {
  const { foto, idempotencyKey, ...datos } = nuevo;
  await deps.almacen.guardar({
    idempotencyKey,
    usuarioId,
    creadoEn: deps.ahora().toISOString(),
    datos,
    foto: foto
      ? { contenido: await foto.arrayBuffer(), nombre: foto.name, tipo: foto.type }
      : null,
    estado: 'pendiente',
    motivo: null,
  });
}

/** Reconstruye la peticion original a partir de lo guardado. */
export function comoNuevoReporte(enCola: ReporteEnCola): NuevoReporte {
  return {
    ...enCola.datos,
    idempotencyKey: enCola.idempotencyKey,
    foto: enCola.foto
      ? new File([enCola.foto.contenido], enCola.foto.nombre, { type: enCola.foto.tipo })
      : null,
  };
}

function statusDe(e: unknown): number | null {
  if (e instanceof ApiError) return e.status;
  if (e instanceof NetworkError) return null;
  throw e;
}

export interface ResultadoDeSincronizacion {
  enviados: ReporteCreado[];
  /** Por que se detuvo, si no termino la cola: sin red o sin sesion. */
  detenidaPor: Extract<DesenlaceDeEnvio, 'sin-conexion' | 'sin-sesion'> | null;
}

let enCurso: Promise<ResultadoDeSincronizacion> | null = null;

/**
 * Reenvia, del mas antiguo al mas nuevo, los reportes pendientes de
 * `usuarioId`.
 *
 * - Exito: se quita de la cola.
 * - Sin red / 5xx: se conserva y se detiene (los demas fallarian igual).
 * - 401: se conserva y se detiene. El cliente HTTP ya manda al login; al
 *   volver a iniciar sesion se reenvia con el token nuevo.
 * - Otro 4xx: se marca `rechazado` con el motivo y se sigue con el resto.
 *
 * Una sola sincronizacion a la vez por pestaña: si ya hay una en curso se
 * devuelve esa. Entre pestañas podria enviarse dos veces el mismo reporte,
 * pero la `Idempotency-Key` hace que el backend lo cree una sola vez.
 */
export function sincronizarCola(
  usuarioId: number,
  deps: Dependencias = POR_DEFECTO,
): Promise<ResultadoDeSincronizacion> {
  if (!enCurso) {
    enCurso = sincronizar(usuarioId, deps).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function sincronizar(
  usuarioId: number,
  deps: Dependencias,
): Promise<ResultadoDeSincronizacion> {
  const enviados: ReporteCreado[] = [];
  const pendientes = pendientesDe(await deps.almacen.listar(), usuarioId).filter(
    (r) => r.estado === 'pendiente',
  );

  for (const enCola of pendientes) {
    let status: number;
    let creado: ReporteCreado | null = null;
    let motivo: string | null = null;
    try {
      creado = await deps.enviar(comoNuevoReporte(enCola));
      status = 201;
    } catch (e) {
      const s = statusDe(e);
      if (s === null) return { enviados, detenidaPor: 'sin-conexion' };
      status = s;
      motivo = e instanceof Error ? e.message : null;
    }

    const desenlace = desenlaceDeEnvio(status);
    if (desenlace === 'enviado' && creado) {
      await deps.almacen.quitar(enCola.idempotencyKey);
      enviados.push(creado);
    } else if (desenlace === 'rechazado') {
      await deps.almacen.guardar({ ...enCola, estado: 'rechazado', motivo });
    } else if (desenlace === 'sin-conexion' || desenlace === 'sin-sesion') {
      return { enviados, detenidaPor: desenlace };
    }
  }
  return { enviados, detenidaPor: null };
}

/** El ciudadano descarta un reporte rechazado (o que ya no quiere enviar). */
export function descartarDeLaCola(
  idempotencyKey: string,
  deps: Pick<Dependencias, 'almacen'> = POR_DEFECTO,
): Promise<void> {
  return deps.almacen.quitar(idempotencyKey);
}
