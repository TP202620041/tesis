import { ApiError, NetworkError, desdeRespuesta } from '@/lib/api/errors';
import { borrarToken, leerToken } from '@/lib/auth/token-storage';

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

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

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
}

/**
 * Sesion invalida: se limpia el token y se manda al login.
 *
 * Ocurre tanto por token vencido (el backend expira a los 120 min) como por
 * token manipulado. Se hace aqui, en un solo lugar, para que ninguna pantalla
 * tenga que acordarse de manejar el 401.
 */
function manejarNoAutenticado(): void {
  borrarToken();
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

export async function apiFetch<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { json, conAuth = true, idempotencyKey, comoBlob, headers, ...resto } = opciones;

  const cabeceras = new Headers(headers);
  if (json !== undefined) {
    cabeceras.set('Content-Type', 'application/json');
  }
  if (idempotencyKey) {
    cabeceras.set('Idempotency-Key', idempotencyKey);
  }
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
    manejarNoAutenticado();
    throw await desdeRespuesta(respuesta);
  }

  if (!respuesta.ok) {
    throw await desdeRespuesta(respuesta);
  }

  // 204 (restablecer-password) y 202 sin cuerpo no traen JSON que parsear.
  if (respuesta.status === 204 || respuesta.headers.get('content-length') === '0') {
    return undefined as T;
  }

  if (comoBlob) {
    return (await respuesta.blob()) as T;
  }

  const tipo = respuesta.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    return (await respuesta.text()) as T;
  }

  return (await respuesta.json()) as T;
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
