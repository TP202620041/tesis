package pe.edu.upc.viasegura.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Enlace de confirmacion del correo de una cuenta (NC-09). Sigue el patron de
 * {@link PasswordResetToken}: tabla propia, un solo uso y vencimiento.
 *
 * <p><b>Solo se guarda el hash.</b> {@link #tokenHash} es el SHA-256 (hex) del
 * token que viaja en el enlace. Quien lea la base, o un respaldo, no puede
 * confirmar cuentas con lo que encuentre. El hash queda {@code null} desde
 * que se pide el correo hasta que el hilo que lo envia genera el token
 * ({@link #emitir}): el valor nunca pasa por la peticion, por un evento ni
 * por la base.</p>
 *
 * <p>Ciclo: pendiente de emitir &rarr; emitido &rarr; usado. Pedir un enlace
 * nuevo o confirmar la cuenta anula ({@link #invalidatedAt}) los que siguen
 * sin usar.</p>
 */
@Entity
@Table(name = "token_confirmacion_correo")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TokenConfirmacionCorreo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    /** SHA-256 en hexadecimal del token del enlace; {@code null} hasta que se emite. */
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "invalidated_at")
    private Instant invalidatedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Si todavia se puede emitir el token y enviar el correo: no se emitio,
     * no se uso, no se anulo y no vencio. El envio corre despues del commit en
     * una cola asincrona; mientras espera, la persona pudo pedir otro enlace.
     */
    public boolean puedeEmitirse(Instant ahora) {
        return tokenHash == null && usedAt == null && invalidatedAt == null && expiresAt.isAfter(ahora);
    }

    /** Guarda el hash del token recien generado. Solo una vez. */
    public void emitir(String hash) {
        if (tokenHash != null) {
            throw new IllegalStateException("El token de confirmacion ya fue emitido");
        }
        this.tokenHash = hash;
    }

    public boolean vencio(Instant ahora) {
        return !expiresAt.isAfter(ahora);
    }

    public void usar(Instant ahora) {
        this.usedAt = ahora;
    }

    /**
     * SHA-256 del token, en hexadecimal (64 caracteres). Es lo que se guarda y
     * lo que se busca al confirmar. Sin sal: el token ya es aleatorio de 256
     * bits, asi que no hay un diccionario contra el que probar, y la busqueda
     * por igualdad necesita un hash determinista.
     */
    public static String hashDe(String tokenPlano) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(tokenPlano.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            // Todo JDK trae SHA-256 (lo exige la especificacion de la plataforma).
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
