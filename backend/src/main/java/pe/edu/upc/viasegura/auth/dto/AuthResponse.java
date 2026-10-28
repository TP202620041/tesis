package pe.edu.upc.viasegura.auth.dto;

/**
 * Respuesta de un login exitoso: el token JWT y los datos del usuario
 * autenticado. Desde NC-09 el registro ya no la devuelve (la cuenta nace sin
 * confirmar): responde {@link RegistroResponse}.
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
