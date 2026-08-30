package pe.edu.upc.viasegura.auth.dto;

/**
 * Respuesta de un login/registro exitoso: el token JWT y los datos del
 * usuario autenticado.
 */
public record AuthResponse(
        String token,
        String tokenType,
        long expiresInMinutes,
        UsuarioResponse usuario
) {
    public static AuthResponse of(String token, long expiresInMinutes, UsuarioResponse usuario) {
        return new AuthResponse(token, "Bearer", expiresInMinutes, usuario);
    }
}
