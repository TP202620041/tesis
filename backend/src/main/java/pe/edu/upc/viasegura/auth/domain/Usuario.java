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
}
