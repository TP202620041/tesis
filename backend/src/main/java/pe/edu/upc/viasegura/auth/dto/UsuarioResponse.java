package pe.edu.upc.viasegura.auth.dto;

import pe.edu.upc.viasegura.auth.domain.Usuario;

/**
 * Representacion publica de un usuario (sin credenciales). DTO separado de
 * la entidad JPA para no exponer el hash de contrasena ni relaciones lazy.
 */
public record UsuarioResponse(
        Long id,
        String email,
        String nombre,
        String apellido,
        String rol,
        String preferenciaNotificacion,
        String fotoUrl,
        Long distritoId,
        String distritoNombre
) {
    public static UsuarioResponse from(Usuario u) {
        return new UsuarioResponse(
                u.getId(),
                u.getEmail(),
                u.getNombre(),
                u.getApellido(),
                u.getRol().name(),
                u.getPreferenciaNotificacion().name(),
                u.getFotoUrl(),
                u.getDistrito() != null ? u.getDistrito().getId() : null,
                u.getDistrito() != null ? u.getDistrito().getNombre() : null);
    }
}
