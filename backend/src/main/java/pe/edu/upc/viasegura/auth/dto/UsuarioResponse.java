package pe.edu.upc.viasegura.auth.dto;

import pe.edu.upc.viasegura.auth.domain.Usuario;

/**
 * Representacion publica de un usuario (sin credenciales). DTO separado de
 * la entidad JPA para no exponer el hash de contrasena ni relaciones lazy.
 *
 * <p>Solo lo recibe el propio usuario ({@code /me}, login y registro), por
 * eso puede llevar {@code debeAceptarTerminos} (D-12): es un dato suyo, no
 * una senal interna. {@code true} si no tiene aceptada la version vigente de
 * los terminos; el frontend muestra entonces la pantalla de aceptacion.</p>
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
        String distritoNombre,
        boolean debeAceptarTerminos
) {
    public static UsuarioResponse from(Usuario u, boolean debeAceptarTerminos) {
        return new UsuarioResponse(
                u.getId(),
                u.getEmail(),
                u.getNombre(),
                u.getApellido(),
                u.getRol().name(),
                u.getPreferenciaNotificacion().name(),
                u.getFotoUrl(),
                u.getDistrito() != null ? u.getDistrito().getId() : null,
                u.getDistrito() != null ? u.getDistrito().getNombre() : null,
                debeAceptarTerminos);
    }
}
