'use client';

import { useCallback, useEffect } from 'react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { generacionDeSesion } from '@/lib/auth/token-storage';
import { useCarga } from '@/lib/hooks/useCarga';
import { esSeveridad, type Severidad } from '@/lib/types/domain';
import { colaDeReportes, crearReporte, type AlmacenDeCola } from '../api';
import {
  debePurgarse,
  desenlaceDeEnvio,
  desglosar,
  estadoVisible,
  estaIncompleto,
  pendientesDe,
  seReenviaSolo,
  type DesenlaceDeEnvio,
  type EstadoVisible,
  type ReporteEnCola,
} from '../model/colaOffline';
import { motivoDeRechazoEnLaCola } from '../model/moderacion';
import { errorDelTitulo, MENSAJE_SIN_SEVERIDAD } from '../model/titulo';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';

/*
 * US-06: cola offline (capa de aplicacion). Arriba, los casos de uso sin
 * React (encolar, sincronizar, completar, descartar, reenviar con clave
 * nueva); abajo, los hooks que los exponen a la UI. Todo el I/O pasa por `../api`: el POST
 * (`crearReporte`, que lee el token vigente al enviar) y el almacen de la
 * cola (`colaDeReportes`, IndexedDB).
 */

export interface Dependencias {
  almacen: AlmacenDeCola;
  enviar: (nuevo: NuevoReporte) => Promise<ReporteCreado>;
  ahora: () => Date;
  /** Generacion de sesion de `token-storage`: si cambia, se corta el bucle. */
  generacion: () => number;
}

const POR_DEFECTO: Dependencias = {
  almacen: colaDeReportes,
  // Un 401 en segundo plano no lleva al login: borra el token y lanza.
  enviar: (nuevo) => crearReporte(nuevo, { redirigirEn401: false }),
  ahora: () => new Date(),
  generacion: generacionDeSesion,
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

/**
 * Reconstruye la peticion original a partir de lo guardado, o `null` si el
 * reporte esta `incompleto` (NC-02: le falta el titulo o la severidad): esa
 * peticion no se puede armar, y asi tampoco se puede enviar por descuido.
 */
export function comoNuevoReporte(enCola: ReporteEnCola): NuevoReporte | null {
  const { titulo, severidad } = enCola.datos;
  if (estaIncompleto(enCola) || titulo === undefined || severidad === undefined) return null;
  return {
    ...enCola.datos,
    titulo,
    severidad,
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

/**
 * Desenlace de un reenvio fallido. El 403 `TERMINOS_PENDIENTES` (NC-07b)
 * cuenta como `sin-sesion`: el reporte queda pendiente y se detiene, y se
 * reenvia cuando el usuario acepte los terminos.
 */
function desenlaceDe(e: unknown): DesenlaceDeEnvio {
  return desenlaceDeEnvio(statusDe(e), {
    terminosPendientes: e instanceof ApiError && e.esTerminosPendientes,
  });
}

export interface ResultadoDeSincronizacion {
  enviados: ReporteCreado[];
  /**
   * Por que se detuvo antes de terminar: sin red, sin sesion (401), o porque
   * la sesion cambio o el llamador cancelo (`interrumpida`).
   */
  detenidaPor: Extract<DesenlaceDeEnvio, 'sin-conexion' | 'sin-sesion'> | 'interrumpida' | null;
}

/** Una sincronizacion en curso por usuario (no global: no se mezclan sesiones). */
const enCurso = new Map<
  number,
  { promesa: Promise<ResultadoDeSincronizacion>; generacion: number; senal?: AbortSignal }
>();

/**
 * Reenvia, del mas antiguo al mas nuevo, los reportes de `usuarioId` que se
 * reenvian solos (pendientes, completos y con la clave vigente). Un reporte
 * `incompleto` (NC-02: sin titulo o sin severidad) NUNCA se envia aqui: el
 * backend lo rechazaria con 400; espera a que el ciudadano lo complete.
 *
 * - Exito: se quita de la cola.
 * - Sin red, 5xx, 408 o 429: se conserva y se detiene.
 * - 401: se conserva y se detiene. El token ya quedo borrado (sin navegar);
 *   la UI pide iniciar sesion y entonces se reenvia con el token nuevo.
 * - 403 `TERMINOS_PENDIENTES` (NC-07b): igual que el 401 (`sin-sesion`),
 *   pero sin borrar el token; se reenvia tras aceptar los terminos.
 * - Otro 4xx: se marca `rechazado` con el motivo y se sigue con el resto.
 *   Nunca se borra: un 400 de validacion tampoco saca un reporte de la cola.
 *   NC-10c: los 400 de la moderacion (`FOTO_NO_PERMITIDA`,
 *   `TEXTO_NO_PERMITIDO`) tambien, con un motivo que dice que hacer en la
 *   cola ({@link motivoDeRechazoEnLaCola}). El 503 `MODERACION_NO_DISPONIBLE`
 *   es un 5xx: sigue pendiente, con la misma clave.
 *
 * **Nunca envia con la sesion de otro:** `generacionEsperada` es la
 * generacion de sesion en la que se identifico a `usuarioId` (la devuelve
 * `useIdentidadEnSegundoPlano`, tomada ANTES de preguntar a `/me`). Se
 * compara con la actual al empezar y antes de CADA envio; si difiere (se
 * cerro la sesion, entro otra persona, otra pestaña cambio el token) o
 * `senal` se aborto, se detiene sin enviar nada mas. No depende de cuando
 * React confirme los cambios ni de si esta llamada quedo encolada detras de
 * otra.
 *
 * Antes de empezar purga los rechazados/caducados de mas de 30 dias.
 */
export function sincronizarCola(
  usuarioId: number,
  generacionEsperada: number,
  senal?: AbortSignal,
  deps: Dependencias = POR_DEFECTO,
): Promise<ResultadoDeSincronizacion> {
  const actual = enCurso.get(usuarioId);
  if (actual && !actual.senal?.aborted && actual.generacion === generacionEsperada) {
    return actual.promesa;
  }

  // Si la anterior se cancelo (o era de otra sesion), la nueva arranca cuando
  // esa termine, y vuelve a comprobar la sesion al empezar.
  const previa = actual?.promesa.catch(() => undefined) ?? Promise.resolve();
  const promesa = previa
    .then(() => sincronizar(usuarioId, generacionEsperada, senal, deps))
    .finally(() => {
      if (enCurso.get(usuarioId)?.promesa === promesa) enCurso.delete(usuarioId);
    });
  enCurso.set(usuarioId, { promesa, generacion: generacionEsperada, senal });
  return promesa;
}

async function sincronizar(
  usuarioId: number,
  generacion: number,
  senal: AbortSignal | undefined,
  deps: Dependencias,
): Promise<ResultadoDeSincronizacion> {
  const enviados: ReporteCreado[] = [];
  const sesionVigente = () => !senal?.aborted && deps.generacion() === generacion;
  if (!sesionVigente()) return { enviados, detenidaPor: 'interrumpida' };
  const ahora = deps.ahora();
  const cola = await deps.almacen.listar();

  for (const viejo of cola.filter((r) => debePurgarse(r, ahora))) {
    await deps.almacen.quitar(viejo.idempotencyKey);
  }

  const aEnviar = pendientesDe(cola, usuarioId).filter((r) => seReenviaSolo(r, ahora));
  for (const enCola of aEnviar) {
    if (!sesionVigente()) return { enviados, detenidaPor: 'interrumpida' };
    const peticion = comoNuevoReporte(enCola);
    if (!peticion) continue;

    let creado: ReporteCreado;
    try {
      creado = await deps.enviar(peticion);
    } catch (e) {
      const desenlace = desenlaceDe(e);
      if (desenlace === 'rechazado') {
        await deps.almacen.marcarRechazado(
          enCola.idempotencyKey,
          e instanceof ApiError ? motivoDeRechazoEnLaCola(e) : e instanceof Error ? e.message : null,
        );
        continue;
      }
      if (desenlace === 'sin-conexion' || desenlace === 'sin-sesion') {
        return { enviados, detenidaPor: desenlace };
      }
      continue;
    }
    await deps.almacen.quitar(enCola.idempotencyKey);
    enviados.push(creado);
  }
  return { enviados, detenidaPor: null };
}

/** El ciudadano descarta un reporte de la cola (rechazado, caducado o al cerrar sesion). */
export function descartarDeLaCola(
  idempotencyKey: string,
  deps: Pick<Dependencias, 'almacen'> = POR_DEFECTO,
): Promise<void> {
  return deps.almacen.quitar(idempotencyKey);
}

/** Descarta todos los reportes en cola de `usuarioId` (cerrar sesion en un dispositivo compartido). */
export async function descartarTodosDe(
  usuarioId: number,
  deps: Pick<Dependencias, 'almacen'> = POR_DEFECTO,
): Promise<void> {
  for (const r of pendientesDe(await deps.almacen.listar(), usuarioId)) {
    await deps.almacen.quitar(r.idempotencyKey);
  }
}

/** Resultado de completar un reporte incompleto: `null` si se guardo, o el motivo. */
export type ErrorAlCompletar = string | null;

/**
 * NC-02: el ciudadano completa un reporte `incompleto` (armado por la
 * version anterior del formulario, sin titulo ni severidad). Se valida como
 * el backend y se guarda con el titulo recortado, en una sola transaccion y
 * con la MISMA `Idempotency-Key`: nunca se regenera la clave de un reporte
 * encolado. Queda `pendiente`, y la sincronizacion automatica lo envia
 * (o pasa a `caducado` si la clave ya vencio).
 */
export async function completarEnCola(
  idempotencyKey: string,
  campos: { titulo: string; severidad: Severidad | null },
  deps: Pick<Dependencias, 'almacen'> = POR_DEFECTO,
): Promise<ErrorAlCompletar> {
  const errorTitulo = errorDelTitulo(campos.titulo);
  if (errorTitulo) return errorTitulo;
  if (!esSeveridad(campos.severidad)) return MENSAJE_SIN_SEVERIDAD;
  const guardado = await deps.almacen.completar(idempotencyKey, {
    titulo: campos.titulo.trim(),
    severidad: campos.severidad,
  });
  return guardado
    ? null
    : 'Este reporte ya no está por completar: pudo haberse completado o enviado en otra pestaña.';
}

/**
 * Reenvia un reporte CADUCADO con una clave nueva: el ciudadano ya reviso
 * "Mis reportes" y confirmo que no llego. Es un intento logico distinto, asi
 * que vuelve a la cola como pendiente con clave y fecha nuevas.
 */
export async function reencolarConClaveNueva(
  enCola: ReporteEnCola,
  deps: Pick<Dependencias, 'almacen' | 'ahora'> & { nuevaClave: () => string } = {
    ...POR_DEFECTO,
    nuevaClave: () => crypto.randomUUID(),
  },
): Promise<void> {
  await deps.almacen.reemplazar(enCola.idempotencyKey, {
    ...enCola,
    idempotencyKey: deps.nuevaClave(),
    creadoEn: deps.ahora().toISOString(),
    estado: 'pendiente',
    motivo: null,
  });
}

/* ------------------------------------------------------------------------
 * Hooks
 * --------------------------------------------------------------------- */

/** Cada cuanto se reintenta mientras quedan reportes pendientes (ms). */
export const INTERVALO_DE_REINTENTO = 30_000;

const NINGUNO: ReporteEnCola[] = [];

/** Reporte en cola con lo que ve el ciudadano de el. */
export interface ReporteEnColaVisible extends ReporteEnCola {
  visible: EstadoVisible;
}

/** Lee la cola y la vuelve a leer en cada cambio (aqui o en otra pestaña). */
function useCola<T>(seleccionar: (cola: ReporteEnCola[]) => T, dependencias: readonly unknown[]) {
  const carga = useCarga<T>(
    async () => seleccionar(await colaDeReportes.listar().catch(() => NINGUNO)),
    dependencias,
  );
  const { recargar } = carga;
  useEffect(() => colaDeReportes.suscribir(recargar), [recargar]);
  return carga.datos;
}

/**
 * US-06: reportes de `usuarioId` guardados en el dispositivo que todavia no
 * llegaron al backend, y las acciones sobre ellos.
 */
export function useReportesEnCola(usuarioId: number) {
  const pendientes =
    useCola(
      (cola) => {
        const ahora = new Date();
        return pendientesDe(cola, usuarioId).map((r) => ({ ...r, visible: estadoVisible(r, ahora) }));
      },
      [usuarioId],
    ) ?? (NINGUNO as ReporteEnColaVisible[]);
  const descartar = useCallback((clave: string) => descartarDeLaCola(clave), []);
  const reenviarConClaveNueva = useCallback((r: ReporteEnCola) => reencolarConClaveNueva(r), []);
  const descartarTodos = useCallback(() => descartarTodosDe(usuarioId), [usuarioId]);
  const completar = useCallback(
    (clave: string, campos: { titulo: string; severidad: Severidad | null }) =>
      completarEnCola(clave, campos),
    [],
  );
  return { pendientes, descartar, reenviarConClaveNueva, descartarTodos, completar };
}

export interface ResumenDeLaCola {
  /** Reportes en cola en el dispositivo, de cualquier usuario y estado. */
  total: number;
  /** De ellos, los que se reenviarian solos (pendientes con la clave vigente). */
  reenviables: number;
}

const COLA_VACIA: ResumenDeLaCola = { total: 0, reenviables: 0 };

/**
 * Resumen de la cola de todo el dispositivo. Sirve para decidir si hace
 * falta averiguar la sesion: con la cola vacia no se hace nada.
 */
export function useResumenDeLaCola(): ResumenDeLaCola {
  return (
    useCola((cola) => {
      const ahora = new Date();
      return { total: cola.length, reenviables: cola.filter((r) => seReenviaSolo(r, ahora)).length };
    }, []) ?? COLA_VACIA
  );
}

/**
 * NC-02: cuantos reportes de `usuarioId` en la cola estan `incompleto`
 * (guardados por la version anterior, sin titulo o sin severidad). No se
 * envian solos: el aviso con sesion invita a completarlos.
 */
export function useCantidadDeIncompletos(usuarioId: number): number {
  return (
    useCola(
      (cola) => {
        const ahora = new Date();
        return desglosar(pendientesDe(cola, usuarioId).map((r) => estadoVisible(r, ahora)))
          .incompletos;
      },
      [usuarioId],
    ) ?? 0
  );
}

/** US-06: guarda un reporte que no se pudo enviar por falta de red. */
export function useEncolarReporte(usuarioId: number) {
  return useCallback((nuevo: NuevoReporte) => encolarReporte(nuevo, usuarioId), [usuarioId]);
}

/**
 * US-06: reenvia sola la cola del usuario identificado al montarse, al
 * volver la conexion (`online`), al volver a la pestaña y cada
 * {@link INTERVALO_DE_REINTENTO} mientras queden reenviables. `generacion` es
 * la generacion de sesion en que se identifico al usuario: el bucle no envia
 * nada si ya no es la vigente. Con `null` (sin sesion) no hace nada. Al
 * desmontarse (o cambiar de usuario o de sesion) cancela el bucle en curso
 * con un `AbortSignal`.
 */
export function useSincronizacionAutomatica(
  identidad: { usuarioId: number; generacion: number } | null,
) {
  const usuarioId = identidad?.usuarioId ?? null;
  const generacion = identidad?.generacion ?? null;
  const hayReenviables =
    useCola(
      (cola) => {
        if (usuarioId == null) return false;
        const ahora = new Date();
        return pendientesDe(cola, usuarioId).some((r) => seReenviaSolo(r, ahora));
      },
      [usuarioId],
    ) ?? false;

  useEffect(() => {
    if (usuarioId == null || generacion == null || !hayReenviables) return;
    const control = new AbortController();
    const intentar = () => {
      void sincronizarCola(usuarioId, generacion, control.signal).catch(() => {
        // Un fallo inesperado no debe romper la pantalla: se reintenta luego.
      });
    };
    const alVolverALaPestana = () => {
      if (document.visibilityState === 'visible') intentar();
    };

    intentar();
    window.addEventListener('online', intentar);
    document.addEventListener('visibilitychange', alVolverALaPestana);
    const intervalo = window.setInterval(intentar, INTERVALO_DE_REINTENTO);
    return () => {
      control.abort();
      window.removeEventListener('online', intentar);
      document.removeEventListener('visibilitychange', alVolverALaPestana);
      window.clearInterval(intervalo);
    };
  }, [usuarioId, generacion, hayReenviables]);
}
