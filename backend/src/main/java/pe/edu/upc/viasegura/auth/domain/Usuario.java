package pe.edu.upc.viasegura.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import pe.edu.upc.viasegura.common.domain.BaseAuditableEntity;
import pe.edu.upc.viasegura.distritos.domain.Distrito;

/**
 * Cuenta de un usuario del sistema (US-01, US-02, US-30).
 *
 * <p>El campo {@link #distrito} tiene doble semantica segun el rol:
 * distrito de residencia para el CIUDADANO y distrito de gestion para el
 * FUNCIONARIO_MUNICIPAL (base de la bandeja de US-13).</p>
 */
@Entity
@Table(name = "usuario")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Usuario extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    /** Hash BCrypt de la contrasena. Nunca se expone en DTOs. */
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false, length = 100)
    private String nombre;

    @Column(nullable = false, length = 100)
    private String apellido;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Rol rol;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "distrito_id")
    private Distrito distrito;

    @Column(name = "foto_url", length = 500)
    private String fotoUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "preferencia_notificacion", nullable = false, length = 10)
    @Builder.Default
    private PreferenciaNotificacion preferenciaNotificacion = PreferenciaNotificacion.AMBAS;

    @Column(nullable = false)
    @Builder.Default
    private boolean activo = true;

    /**
     * NC-09: si la persona abrio el enlace de confirmacion que recibio por
     * correo. Sin confirmar no puede iniciar sesion. Por defecto {@code false}
     * (tambien en el builder): una cuenta nace sin confirmar salvo que quien
     * la crea diga lo contrario, como el ADMIN inicial (DEP-04). Las cuentas
     * anteriores a NC-09 las dio por confirmadas la migracion V20.
     */
    @Column(name = "correo_confirmado", nullable = false)
    private boolean correoConfirmado;

    /** Cuando se confirmo el correo; {@code null} en las cuentas confirmadas por la migracion V20. */
    @Column(name = "correo_confirmado_en")
    private Instant correoConfirmadoEn;

    /** NC-09: la persona abrio el enlace de confirmacion. */
    public void confirmarCorreo(Instant ahora) {
        this.correoConfirmado = true;
        this.correoConfirmadoEn = ahora;
    }
}
