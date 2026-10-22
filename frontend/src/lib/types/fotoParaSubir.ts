/**
 * DEP-11: la foto que el ciudadano elige para subir, la del reporte (US-05,
 * `features/reportes/components/CampoFoto.tsx`) y la de perfil (US-30,
 * `features/auth/components/CampoFotoDePerfil.tsx`). Es la misma regla para
 * las dos, y vive en `lib/` porque la usan dos features (ARCHITECTURE §5.3).
 *
 * Repite lo que el backend comprueba primero, para no enviar (ni guardar en
 * la cola offline) una foto que va a rechazar igual:
 *
 * - **Tamaño**: hasta 10 MB, los 10 × 1024 × 1024 bytes de
 *   `spring.servlet.multipart.max-file-size`. Más que eso recibe 413; por
 *   encima de 32 MB el servidor corta la conexión y la PWA solo vería
 *   «No se pudo conectar con el servidor» (backend/README, DEP-11).
 * - **Formato**: la extensión del nombre, sin distinguir mayúsculas (`jpg`,
 *   `jpeg`, `png` o `webp`: lo primero que mira `ImageIoSaneadorDeImagen`, que
 *   responde 409 si no está) y, si el navegador declara el tipo MIME, que sea
 *   `image/jpeg`, `image/png` o `image/webp`. Un tipo vacío no se rechaza: el
 *   navegador lo deja así cuando no reconoce el archivo, y el contenido lo
 *   valida el backend de todos modos.
 *
 * Lo que solo se sabe leyendo los bytes (que de verdad sea una imagen, sus
 * megapíxeles) queda en el backend: 409 «Formato de foto no permitido…».
 */

/** Tipos MIME admitidos; también el `accept` del `<input type="file">`. */
export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Extensiones que admite el backend (`EXTENSIONES_PERMITIDAS`). */
export const EXTENSIONES_DE_FOTO = ['jpg', 'jpeg', 'png', 'webp'] as const;

/** Coincide con `spring.servlet.multipart.max-file-size` (10MB). */
export const TAMANO_MAXIMO_DE_FOTO_MB = 10;

const BYTES_POR_MB = 1024 * 1024;

/** Valor del atributo `accept` del selector de archivos. */
export const ACEPTA_FOTO = TIPOS_DE_FOTO.join(',');

/** Indicación que se ve antes de elegir la foto. */
export const AYUDA_DE_FOTO = `JPG, PNG o WEBP, de hasta ${TAMANO_MAXIMO_DE_FOTO_MB} MB.`;

export const MENSAJE_FORMATO_DE_FOTO = 'Formato no permitido. Usa JPG, PNG o WEBP.';
export const MENSAJE_TAMANO_DE_FOTO = `La foto supera ${TAMANO_MAXIMO_DE_FOTO_MB} MB.`;

/** Lo que la regla mira de un `File` (así se prueba sin armar 10 MB). */
export type FotoElegida = Pick<File, 'name' | 'type' | 'size'>;

/**
 * Motivo por el que la foto no se puede subir, o `null` si se puede. El
 * formato va primero: a un archivo que no es una foto no le sirve saber
 * cuánto pesa.
 */
export function errorDeFoto(foto: FotoElegida): string | null {
  if (!tieneFormatoPermitido(foto)) return MENSAJE_FORMATO_DE_FOTO;
  if (foto.size > TAMANO_MAXIMO_DE_FOTO_MB * BYTES_POR_MB) return MENSAJE_TAMANO_DE_FOTO;
  return null;
}

function tieneFormatoPermitido({ name, type }: FotoElegida): boolean {
  const extension = extensionDe(name);
  const extensionValida =
    extension !== null && (EXTENSIONES_DE_FOTO as readonly string[]).includes(extension);
  const tipoValido = type === '' || (TIPOS_DE_FOTO as readonly string[]).includes(type);
  return extensionValida && tipoValido;
}

/**
 * Lo que va después del último punto, en minúsculas; `null` sin punto. Igual
 * que `StringUtils.getFilenameExtension` del backend sobre el nombre en
 * minúsculas (`foto.` da `''`, que no es una extensión admitida).
 */
function extensionDe(nombre: string): string | null {
  const punto = nombre.lastIndexOf('.');
  return punto < 0 ? null : nombre.slice(punto + 1).toLowerCase();
}
