package pe.edu.upc.viasegura.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Generacion y validacion de JSON Web Tokens (US-02).
 *
 * <p>El token porta el email como subject y el rol como claim, para que
 * el filtro de seguridad reconstruya la autenticacion sin consultar la BD
 * en cada request (stateless).</p>
 */
@Service
public class JwtService {

    private static final String CLAIM_ROL = "rol";

    private final SecretKey signingKey;
    private final long expirationMinutes;

    public JwtService(
            @Value("${security.jwt.secret}") String secret,
            @Value("${security.jwt.expiration-minutes}") long expirationMinutes) {
        this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        this.expirationMinutes = expirationMinutes;
    }

    /** Genera un token firmado para el usuario autenticado. */
    public String generarToken(String email, String rol) {
        Instant ahora = Instant.now();
        Instant expira = ahora.plus(expirationMinutes, ChronoUnit.MINUTES);
        return Jwts.builder()
                .subject(email)
                .claims(Map.of(CLAIM_ROL, rol))
                .issuedAt(Date.from(ahora))
                .expiration(Date.from(expira))
                .signWith(signingKey)
                .compact();
    }

    /** Extrae el email (subject) del token, validando firma y expiracion. */
    public String extraerEmail(String token) {
        return parse(token).getSubject();
    }

    /** Extrae el rol del token. */
    public String extraerRol(String token) {
        return parse(token).get(CLAIM_ROL, String.class);
    }

    /** Minutos de validez del token (para exponerlo en la respuesta de login). */
    public long getExpirationMinutes() {
        return expirationMinutes;
    }

    private Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
