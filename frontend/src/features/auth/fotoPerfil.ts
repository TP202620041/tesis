import { apiFetch, fotoRequiereAuth } from '@/lib/api/client';

/**
 * Descarga de la foto de PERFIL (US-30).
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTO NO PUEDE SER UN `<img src="...">` NORMAL
 * ---------------------------------------------------------------------------
 * La foto de un reporte es publica y se sirve como recurso estatico, asi que
 * basta ponerla en `src`. La de perfil NO: el backend la entrega por
 * `GET /api/perfiles/fotos/{archivo}`, un endpoint que exige la cabecera
 * `Authorization` y comprueba que quien la pide sea su dueno. El navegador
 * NO adjunta esa cabecera al resolver un `src`, asi que un `<img>` directo
 * recibe un 401 y muestra una imagen rota.
 *
 * La via correcta: pedirla con `fetch` adjuntando el token (lo hace
 * `apiFetch`), quedarse con el `Blob` y convertirlo en una URL local con
 * `URL.createObjectURL`. Esa URL sí sirve en `src` porque apunta a memoria
 * del navegador, no a la red.
 *
 * Quien la use DEBE liberar la URL con `URL.revokeObjectURL` al cambiar de
 * foto o desmontar; si no, el blob queda retenido toda la sesion.
 */
export async function descargarFotoDePerfil(fotoUrl: string): Promise<string> {
  // Defensa contra un cambio futuro del backend: si la URL dejara de ser
  // autenticada, no hace falta este rodeo.
  if (!fotoRequiereAuth(fotoUrl)) {
    return fotoUrl;
  }
  const blob = await apiFetch<Blob>(fotoUrl, { method: 'GET', comoBlob: true });
  return URL.createObjectURL(blob);
}
