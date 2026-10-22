package pe.edu.upc.viasegura.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.DecodingException;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.security.MessageDigest;
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
 *
 * <p><b>Falla temprana con el secreto (DEP-01, SEC-03).</b> Quien conoce el
 * secreto puede firmar un token con el email de cualquier cuenta, ADMIN
 * incluido. Por eso el constructor no arranca la aplicacion si el secreto
 * falta, no es Base64, tiene menos de 32 bytes (lo minimo para HS256) o es el
 * secreto de desarrollo publicado en el repositorio; este ultimo solo se
 * acepta con {@code security.jwt.permitir-secreto-de-desarrollo=true}, que
 * marcan los perfiles {@code local} y {@code test}. Los mensajes nunca
 * repiten el valor recibido.</p>
 */
@Service
public class JwtService {

    private static final String CLAIM_ROL = "rol";

    /** HS256 exige una clave de al menos 256 bits (RFC 7518, seccion 3.2). */
    static final int LONGITUD_MINIMA_BYTES = 32;

    /**
     * Secreto de desarrollo, publicado en el repositorio: fue el valor por
     * defecto de {@code application.yml} hasta DEP-01 y hoy es el de los
     * perfiles {@code local} y {@code test}. Se compara por bytes decodificados,
     * asi que otra codificacion de la misma clave tambien se rechaza.
     */
    static final String SECRETO_DE_DESARROLLO =
            "Y2hhbmdlLW1lLXRoaXMtaXMtYS1kZXYtb25seS1zZWNyZXQtMDEyMzQ1Njc4OQ==";

    private static final String COMO_GENERARLO =
            " Genera uno con `openssl rand -base64 48` y pasalo en la variable de entorno JWT_SECRET"
                    + " (ver SEC-03 en backend/README.md).";

    private final SecretKey signingKey;
    private final long expirationMinutes;

    public JwtService(
            @Value("${security.jwt.secret:}") String secret,
            @Value("${security.jwt.expiration-minutes}") long expirationMinutes,
            @Value("${security.jwt.permitir-secreto-de-desarrollo:false}") boolean permitirSecretoDeDesarrollo) {
        this.signingKey = Keys.hmacShaKeyFor(validarSecreto(secret, permitirSecretoDeDesarrollo));
        this.expirationMinutes = expirationMinutes;
    }

    /**
     * Decodifica y valida el secreto de firma.
     *
     * @return los bytes de la clave HMAC
     * @throws IllegalStateException si el secreto no sirve para firmar
     */
    static byte[] validarSecreto(String secreto, boolean permitirSecretoDeDesarrollo) {
        if (secreto == null || secreto.isBlank()) {
            throw new IllegalStateException(
                    "Falta el secreto JWT (security.jwt.secret): no tiene valor por defecto." + COMO_GENERARLO);
        }
        byte[] clave;
        try {
            clave = Decoders.BASE64.decode(secreto.strip());
        } catch (DecodingException e) {
            throw new IllegalStateException("El secreto JWT no es Base64 valido." + COMO_GENERARLO);
        }
        if (clave.length < LONGITUD_MINIMA_BYTES) {
            throw new IllegalStateException(
                    "El secreto JWT es demasiado corto: tiene %d bytes y HS256 exige al menos %d."
                            .formatted(clave.length, LONGITUD_MINIMA_BYTES) + COMO_GENERARLO);
        }
        if (!permitirSecretoDeDesarrollo
                && MessageDigest.isEqual(clave, Decoders.BASE64.decode(SECRETO_DE_DESARROLLO))) {
            throw new IllegalStateException(
                    "El secreto JWT es el de desarrollo, publicado en el repositorio: cualquiera podria"
                            + " firmar tokens. Solo los perfiles local y test lo aceptan"
                            + " (security.jwt.permitir-secreto-de-desarrollo=true)." + COMO_GENERARLO);
        }
        return clave;
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
