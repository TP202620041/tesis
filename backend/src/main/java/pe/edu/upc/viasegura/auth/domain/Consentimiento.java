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

/**
 * Una aceptacion de un usuario para una finalidad y una version del texto
 * (CONSENTIMIENTO, D-12). Es un historial: cada aceptacion es una fila
 * nueva y revocar llena {@link #revocadoEn}; nada se sobrescribe ni se
 * borra, porque es la evidencia de que el usuario consintio (Ley N.° 29733).
 *
 * <p>{@code aceptadoEn} se fija a mano y no con el auditing de JPA: es un
 * dato de negocio (la fecha del consentimiento), no un metadato de la fila.</p>
 */
@Entity
@Table(name = "consentimiento")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Consentimiento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private FinalidadConsentimiento finalidad;

    @Column(name = "version_documento", nullable = false, length = 40)
    private String versionDocumento;

    @Column(name = "aceptado_en", nullable = false, updatable = false)
    private Instant aceptadoEn;

    @Column(name = "revocado_en")
    private Instant revocadoEn;

    public boolean estaRevocado() {
        return revocadoEn != null;
    }

    /** Revoca esta aceptacion. Una ya revocada conserva su fecha original. */
    public void revocar(Instant cuando) {
        if (revocadoEn == null) {
            revocadoEn = cuando;
        }
    }
}
