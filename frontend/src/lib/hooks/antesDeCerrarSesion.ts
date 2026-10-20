/**
 * Pasos previos al cierre de sesion (US-04 + US-06), sin acoplar features.
 *
 * `auth` cierra la sesion, pero lo que hay que preguntar antes (por ejemplo
 * "tienes reportes sin enviar en este dispositivo") es de otra feature. En
 * vez de que `auth` importe a `reportes`, quien compone la app (`app/`)
 * registra aqui una guarda y `useCerrarSesion` las espera antes de borrar
 * el token. Una guarda resuelve cuando el usuario decidio; no puede cancelar
 * el cierre, solo prepararlo.
 */

type Guarda = () => Promise<void>;

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

/** Ejecuta las guardas en orden de registro; un fallo de una no impide cerrar. */
export async function antesDeCerrarSesion(): Promise<void> {
  for (const guarda of [...guardas]) {
    try {
      await guarda();
    } catch {
      // Cerrar sesion no puede quedar bloqueado por un paso previo.
    }
  }
}
