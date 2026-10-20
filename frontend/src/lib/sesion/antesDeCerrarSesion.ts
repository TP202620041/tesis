/**
 * Pasos previos al cierre de sesion (US-04 + US-06), sin acoplar features.
 *
 * `auth` cierra la sesion, pero lo que hay que preguntar antes (por ejemplo
 * "tienes reportes sin enviar en este dispositivo") es de otra feature. En
 * vez de que `auth` importe a `reportes`, quien compone la app (`app/`)
 * registra aqui una guarda y `useCerrarSesion` las espera antes de borrar
 * el token. Una guarda resuelve cuando el usuario decidio; no puede cancelar
 * el cierre, solo prepararlo.
 *
 * El cierre NUNCA se cuelga: una guarda que falla se ignora, y si alguna no
 * responde en {@link TOPE_DE_ESPERA_MS} se cierra igual.
 *
 * Vive en `lib/sesion/` (D-14): capa de aplicacion compartida para el ciclo
 * de vida de la sesion. No toca el JWT (eso sigue solo en
 * `lib/auth/token-storage.ts`).
 */

type Guarda = () => Promise<void>;

/** Tiempo maximo que se espera a las guardas antes de cerrar igual. */
export const TOPE_DE_ESPERA_MS = 120_000;

const guardas = new Set<Guarda>();

/** Registra una guarda. Devuelve la funcion para quitarla. */
export function registrarAntesDeCerrarSesion(guarda: Guarda): () => void {
  guardas.add(guarda);
  return () => {
    guardas.delete(guarda);
  };
}

/** `true` si hay alguna guarda: sin ninguna, el cierre puede ser inmediato. */
export function hayPasosAntesDeCerrarSesion(): boolean {
  return guardas.size > 0;
}

/** Ejecuta las guardas en orden de registro, con un tope de espera total. */
export async function antesDeCerrarSesion(topeMs: number = TOPE_DE_ESPERA_MS): Promise<void> {
  const todas = (async () => {
    for (const guarda of [...guardas]) {
      try {
        await guarda();
      } catch {
        // Cerrar sesion no puede quedar bloqueado por un paso previo.
      }
    }
  })();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, topeMs);
  });
  try {
    await Promise.race([todas, tope]);
  } finally {
    clearTimeout(temporizador);
  }
}
