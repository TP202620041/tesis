import {
  estaIncompleto,
  type DatosParaCompletar,
  type ReporteEnCola,
} from '@/features/reportes/model/colaOffline';

/**
 * US-06: almacen en IndexedDB de los reportes creados sin conexion.
 *
 * Solo guarda y lee; no envia nada. El reenvio (con el token VIGENTE, que se
 * lee en el momento de enviar via `lib/api/client`) lo hace la feature de
 * reportes desde la pagina, no el Service Worker: ver "Cola offline" en el
 * README del frontend. Por eso aqui nunca hay cabeceras ni tokens: solo los
 * datos del formulario, la foto y la `Idempotency-Key`.
 *
 * IndexedDB y no `localStorage`: la foto pesa megas y `localStorage` solo
 * guarda texto, con un limite de ~5 MB por origen.
 */

const BASE = 'viasegura-offline';
const VERSION = 1;
const ALMACEN = 'reportes-pendientes';
const CANAL = 'viasegura-cola';

export interface AlmacenDeCola {
  listar(): Promise<ReporteEnCola[]>;
  /** Inserta o reemplaza (la clave es la `idempotencyKey`). */
  guardar(reporte: ReporteEnCola): Promise<void>;
  quitar(idempotencyKey: string): Promise<void>;
  /**
   * Marca `rechazado` con su motivo, leyendo y escribiendo en la MISMA
   * transaccion, y solo si la clave sigue en la cola: si otra pestaña ya lo
   * envio o el ciudadano lo descarto, no se resucita.
   */
  marcarRechazado(idempotencyKey: string, motivo: string | null): Promise<void>;
  /**
   * NC-02: agrega titulo y severidad a un reporte que no los tenia y lo
   * vuelve a `pendiente`, leyendo y escribiendo en la MISMA transaccion. La
   * clave (y `creadoEn`, que mide su vigencia) NO cambia: si la primera
   * peticion si llego al backend, el reenvio con la misma clave devuelve el
   * reporte original. Si la clave ya no esta (otra pestaña lo envio o se
   * descarto) o el reporte ya no esta incompleto (otra pestaña lo completo),
   * no escribe nada y devuelve `false`: no pisa lo que ya se completo.
   */
  completar(idempotencyKey: string, campos: DatosParaCompletar): Promise<boolean>;
  /** Quita `idempotencyKey` y guarda `nuevo` en una sola transaccion. */
  reemplazar(idempotencyKey: string, nuevo: ReporteEnCola): Promise<void>;
  /**
   * Avisa de cada cambio, en esta pestaña y en las demas del mismo origen
   * (`BroadcastChannel`). Devuelve la funcion para desuscribirse.
   */
  suscribir(alCambiar: () => void): () => void;
}

/** `true` si el navegador tiene IndexedDB (no la hay en SSR ni en algunos modos privados). */
export function hayIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'idempotencyKey' });
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/** Una transaccion sobre el almacen; resuelve cuando la transaccion termina. */
async function enTransaccion<T>(
  modo: IDBTransactionMode,
  operar: (almacen: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((resolver, rechazar) => {
      const tx = db.transaction(ALMACEN, modo);
      const peticion = operar(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolver(peticion ? peticion.result : undefined);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  } finally {
    db.close();
  }
}

const oyentes = new Set<() => void>();

function avisarLocal(): void {
  for (const oyente of oyentes) oyente();
}

/** Canal entre pestañas; `null` donde no existe. */
const canal: BroadcastChannel | null = (() => {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const c = new BroadcastChannel(CANAL);
    c.onmessage = avisarLocal;
    // En Node (tests) el canal mantendria vivo el proceso.
    (c as unknown as { unref?: () => void }).unref?.();
    return c;
  } catch {
    return null;
  }
})();

function avisar(): void {
  avisarLocal();
  canal?.postMessage('cambio');
}

export const colaDeReportes: AlmacenDeCola = {
  async listar() {
    if (!hayIndexedDb()) return [];
    const todos = await enTransaccion<ReporteEnCola[]>('readonly', (a) => a.getAll());
    return todos ?? [];
  },

  async guardar(reporte) {
    await enTransaccion('readwrite', (a) => {
      a.put(reporte);
    });
    avisar();
  },

  async quitar(idempotencyKey) {
    if (!hayIndexedDb()) return;
    await enTransaccion('readwrite', (a) => {
      a.delete(idempotencyKey);
    });
    avisar();
  },

  async marcarRechazado(idempotencyKey, motivo) {
    if (!hayIndexedDb()) return;
    await enTransaccion('readwrite', (a) => {
      const lectura = a.get(idempotencyKey);
      lectura.onsuccess = () => {
        const actual = lectura.result as ReporteEnCola | undefined;
        if (actual) a.put({ ...actual, estado: 'rechazado', motivo });
      };
    });
    avisar();
  },

  async completar(idempotencyKey, campos) {
    if (!hayIndexedDb()) return false;
    let completado = false;
    await enTransaccion('readwrite', (a) => {
      const lectura = a.get(idempotencyKey);
      lectura.onsuccess = () => {
        const actual = lectura.result as ReporteEnCola | undefined;
        if (!actual || !estaIncompleto(actual)) return;
        a.put({
          ...actual,
          datos: { ...actual.datos, titulo: campos.titulo, severidad: campos.severidad },
          estado: 'pendiente',
          motivo: null,
        });
        completado = true;
      };
    });
    if (completado) avisar();
    return completado;
  },

  async reemplazar(idempotencyKey, nuevo) {
    if (!hayIndexedDb()) return;
    await enTransaccion('readwrite', (a) => {
      a.delete(idempotencyKey);
      a.put(nuevo);
    });
    avisar();
  },

  suscribir(alCambiar) {
    oyentes.add(alCambiar);
    return () => {
      oyentes.delete(alCambiar);
    };
  },
};
