import { ApiError, NetworkError, desdeRespuesta } from '@/lib/api/errors';
import { borrarTokenSi, generacionDeSesion, leerToken } from '@/lib/auth/token-storage';

/**
 * Cliente HTTP tipado contra el API REST de Spring Boot.
 *
 * Se usa `fetch` nativo con un wrapper en vez de axios/ky: el App Router
 * extiende `fetch` con su propia semantica de cache y revalidacion, que los
 * Server Components aprovechan de forma nativa; una libreria externa la
 * pierde del lado servidor y ademas envia peso al cliente para resolver lo
 * que aqui son unas pocas decenas de lineas.
 *
 * Responsabilidades: URL base, JSON, header `Authorization`, traduccion de
 * errores del backend a {@link ApiError} y manejo centralizado del 401.
 */

// Mismo valor que usa la CSP de `next.config.ts`: sin espacios, y vacia
// cuenta como ausente (si no, las llamadas irian al origen de la PWA).
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:8080';

/** Ruta a la que se envia al usuario cuando su sesion deja de ser valida. */
const RUTA_LOGIN = '/login';

export interface OpcionesPeticion extends Omit<RequestInit, 'body'> {
  /** Cuerpo JSON. Se serializa y se fija `Content-Type` automaticamente. */
  json?: unknown;
  /** Cuerpo crudo (`FormData` para el multipart de US-05). */
  body?: BodyInit;
  /** `false` para llamadas publicas donde no interesa adjuntar el token. */
  conAuth?: boolean;
  /** Clave de idempotencia de US-06 (reintentos de sincronizacion offline). */
  idempotencyKey?: string;
  /**
   * `true` para respuestas binarias (la foto de perfil de US-30).
   *
   * Sin esto el cliente intentaria interpretar la imagen como texto y
   * devolveria una cadena corrupta: el parseo por defecto solo distingue
   * JSON de texto plano.
   */
  comoBlob?: boolean;
  /**
   * `false` para trabajo en segundo plano (la cola offline de US-06): ante un
   * 401 se borra el token igual y se lanza el `ApiError`, pero NO se navega
   * al login. Una tarea que el usuario no inicio no debe sacarlo de la
   * pantalla; la UI muestra un aviso para que inicie sesion cuando quiera, y
   * la UI en primer plano se entera en su proxima peticion (que, ya sin
   * token, da 401 y si redirige). Por defecto `true`: el 401 sigue
   * centralizado aqui. Con `false` tampoco se navega ante el 403
   * `TERMINOS_PENDIENTES` (NC-07b): se lanza el `ApiError` y nada mas.
   */
  redirigirEn401?: boolean;
}

/**
 * Sesion invalida: se limpia el token y se manda al login.
 *
 * Ocurre tanto por token vencido (el backend expira a los 120 min) como por
 * token manipulado. Se hace aqui, en un solo lugar, para que ninguna pantalla
 * tenga que acordarse de manejar el 401.
 */
function manejarNoAutenticado(): void {
  // El token ya lo borro `ejecutar` (solo si la sesion no cambio).
  if (typeof window !== 'undefined' && window.location.pathname !== RUTA_LOGIN) {
    const destino = window.location.pathname + window.location.search;
    // Navegacion dura a proposito, en vez de `useRouter().push`: este modulo
    // no es un componente y no puede usar hooks, pero sobre todo interesa que
    // se descarte TODO el estado en memoria de la sesion anterior (caches de
    // datos del usuario, formularios a medio llenar). Un `push` conserva el
    // arbol de React montado; una recarga completa garantiza que no quede
    // nada del usuario cuya sesion acaba de invalidarse.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${RUTA_LOGIN}?redirect=${encodeURIComponent(destino)}`);
  }
}

/**
 * Pantalla donde el usuario acepta los terminos vigentes (NC-07b). La misma
 * ruta esta en `features/auth/model/rutas.ts` (`RUTA_ACEPTAR_TERMINOS`):
 * `lib/` no puede importar features, y los tests de ambos lados la fijan.
 */
export const RUTA_ACEPTAR_TERMINOS = '/aceptar-terminos';

/**
 * 403 `TERMINOS_PENDIENTES`: navegacion dura a la pantalla de aceptacion,
 * conservando el destino para volver despues. Dura por lo mismo que el 401:
 * la pantalla que fallo no debe quedar montada a medias. No borra el token:
 * la sesion es valida, solo le falta aceptar.
 */
function manejarTerminosPendientes(): void {
  if (typeof window === 'undefined' || window.location.pathname === RUTA_ACEPTAR_TERMINOS) return;
  const destino = window.location.pathname + window.location.search;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`${RUTA_ACEPTAR_TERMINOS}?redirect=${encodeURIComponent(destino)}`);
}

/**
 * Ejecuta la peticion y devuelve la respuesta ya validada (2xx). Concentra
 * URL base, cabeceras, token, errores de red y el 401 centralizado, para que
 * {@link apiFetch} y {@link apiDescargar} no los repitan.
 */
async function ejecutar(ruta: string, opciones: OpcionesPeticion): Promise<Response> {
  // `comoBlob` lo interpreta apiFetch al leer el cuerpo, no viaja en el fetch.
  const {
    json,
    conAuth = true,
    idempotencyKey,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    comoBlob,
    redirigirEn401 = true,
    headers,
    ...resto
  } = opciones;

  const cabeceras = new Headers(headers);
  if (json !== undefined) {
    cabeceras.set('Content-Type', 'application/json');
  }
  if (idempotencyKey) {
    cabeceras.set('Idempotency-Key', idempotencyKey);
  }
  // La sesion con la que sale la peticion (ver el manejo del 401).
  const generacion = generacionDeSesion();
  if (conAuth) {
    const token = leerToken();
    if (token) cabeceras.set('Authorization', `Bearer ${token}`);
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_URL}${ruta}`, {
      ...resto,
      headers: cabeceras,
      body: json !== undefined ? JSON.stringify(json) : resto.body,
    });
  } catch {
    // fetch solo rechaza por fallo de red/CORS, nunca por status HTTP.
    throw new NetworkError();
  }

  if (respuesta.status === 401) {
    // Solo si la sesion sigue siendo la que envio la peticion: un 401 tardio
    // de una sesion anterior no borra el token de quien entro despues, ni lo
    // saca de la pantalla.
    const borrado = borrarTokenSi(generacion);
    if (borrado && redirigirEn401) manejarNoAutenticado();
    throw await desdeRespuesta(respuesta);
  }

  if (!respuesta.ok) {
    const error = await desdeRespuesta(respuesta);
    // NC-07b (D-12): no es "acceso denegado" sino "faltan los terminos". Se
    // centraliza aqui, igual que el 401, para que ninguna pantalla tenga que
    // distinguir ese 403. El trabajo en segundo plano (`redirigirEn401:
    // false`) tampoco navega por esto: solo recibe el error.
    if (error.esTerminosPendientes && redirigirEn401) manejarTerminosPendientes();
    throw error;
  }

  return respuesta;
}

export async function apiFetch<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const respuesta = await ejecutar(ruta, opciones);

  // 204 (restablecer-password) y 202 sin cuerpo no traen JSON que parsear.
  if (respuesta.status === 204 || respuesta.headers.get('content-length') === '0') {
    return undefined as T;
  }

  if (opciones.comoBlob) {
    return (await respuesta.blob()) as T;
  }

  const tipo = respuesta.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    return (await respuesta.text()) as T;
  }

  return (await respuesta.json()) as T;
}

/** Archivo binario devuelto por el API, con la cabecera que trae su nombre. */
export interface ArchivoDescargado {
  contenido: Blob;
  /**
   * `Content-Disposition` tal como llegó, o `null` si no vino o si el
   * navegador no la deja leer: en una petición entre orígenes solo es
   * visible si el backend la expone (`Access-Control-Expose-Headers`).
   */
  contentDisposition: string | null;
}

/**
 * Descarga un archivo autenticado (US-28: exportación). No sirve un enlace
 * directo porque la descarga exige el header `Authorization`; por eso se trae
 * como `Blob` y la UI lo guarda con una URL `blob:`.
 */
export async function apiDescargar(
  ruta: string,
  opciones: OpcionesPeticion = {},
): Promise<ArchivoDescargado> {
  const respuesta = await ejecutar(ruta, { ...opciones, method: 'GET' });
  return {
    contenido: await respuesta.blob(),
    contentDisposition: respuesta.headers.get('Content-Disposition'),
  };
}

/**
 * URL absoluta de una foto a partir del `fotoUrl` que devuelve el API.
 *
 * El backend devuelve rutas RELATIVAS (`/media/fotos/reportes/<uuid>.png`
 * para la evidencia de un reporte, `/api/perfiles/fotos/<uuid>.png` para la
 * foto de perfil) y eso es deliberado: el backend no conoce su propio
 * hostname publico, y codificarlo lo ataria a un entorno. Componerla es
 * responsabilidad del cliente.
 *
 * Ojo con la diferencia de visibilidad: las fotos de reporte se cargan sin
 * token y sirven directo en un `<img src>`; la foto de perfil exige la
 * cabecera `Authorization`, asi que un `<img src>` plano devolveria 401 —
 * hay que traerla con {@link apiFetch} y convertirla a `blob:`.
 */
export function urlDeFoto(fotoUrl: string | null | undefined): string | null {
  if (!fotoUrl) return null;
  if (fotoUrl.startsWith('http://') || fotoUrl.startsWith('https://')) return fotoUrl;
  return `${BASE_URL}${fotoUrl}`;
}

/**
 * Copia de `entidad` con su `fotoUrl` ya absoluta ({@link urlDeFoto}). La
 * usan los `api.ts` de las features para que paginas y componentes reciban
 * la URL lista para `<img src>`. Solo para fotos publicas (de reporte).
 *
 * Se aplica UNA vez, en el gateway (FE-07): con una base relativa en
 * `NEXT_PUBLIC_API_BASE_URL`, aplicarla dos veces duplicaria el prefijo.
 * Por eso ningun componente vuelve a llamar a {@link urlDeFoto}.
 */
export function conFotoAbsoluta<T extends { fotoUrl?: string | null }>(entidad: T): T {
  // Sin foto se devuelve tal cual: no se cambia un `undefined` por `null`.
  if (!entidad.fotoUrl) return entidad;
  return { ...entidad, fotoUrl: urlDeFoto(entidad.fotoUrl) ?? entidad.fotoUrl };
}

/** `true` si la foto exige token (perfil) en vez de ser publica (reporte). */
export function fotoRequiereAuth(fotoUrl: string): boolean {
  return fotoUrl.startsWith('/api/');
}

export const api = {
  get: <T>(ruta: string, opciones?: OpcionesPeticion) =>
    apiFetch<T>(ruta, { ...opciones, method: 'GET' }),

  post: <T>(ruta: string, json?: unknown, opciones?: OpcionesPeticion) =>
    apiFetch<T>(ruta, { ...opciones, method: 'POST', json }),

  patch: <T>(ruta: string, json?: unknown, opciones?: OpcionesPeticion) =>
    apiFetch<T>(ruta, { ...opciones, method: 'PATCH', json }),

  delete: <T>(ruta: string, opciones?: OpcionesPeticion) =>
    apiFetch<T>(ruta, { ...opciones, method: 'DELETE' }),
};

export { ApiError, NetworkError };
