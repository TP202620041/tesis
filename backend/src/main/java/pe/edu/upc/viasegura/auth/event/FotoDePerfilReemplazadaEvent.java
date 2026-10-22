package pe.edu.upc.viasegura.auth.event;

/**
 * Un ciudadano reemplazo su foto de perfil (US-30). Lo publica
 * {@code AuthService#editarPerfil}; despues del commit,
 * {@code FotoDePerfilReemplazadaListener} borra la foto anterior del
 * almacenamiento (DEP-12): ya no tiene finalidad y es un dato personal
 * (Ley N.° 29733).
 *
 * @param usuarioId     dueno de la foto, para el registro
 * @param nombreArchivo nombre de la foto anterior ({@code <uuid>.<ext>}),
 *                      tomado de {@code usuario.foto_url}
 */
public record FotoDePerfilReemplazadaEvent(Long usuarioId, String nombreArchivo) {}
