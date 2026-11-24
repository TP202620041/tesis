package pe.edu.upc.viasegura.soporte.domain;

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
import java.time.Duration;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.domain.BaseAuditableEntity;

/**
 * Consulta de soporte tecnico enviada desde la plataforma (US-25).
 * El usuario es opcional para permitir consultas de visitantes.
 */
@Entity
@Table(name = "ticket_soporte")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketSoporte extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_id")
    private Usuario usuario;

    @Column(name = "email_contacto", nullable = false, length = 150)
    private String emailContacto;

    @Column(nullable = false, length = 200)
    private String asunto;

    @Column(nullable = false, length = 2000)
    private String mensaje;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    @Builder.Default
    private EstadoTicket estado = EstadoTicket.ABIERTO;

    /** Respuesta del equipo de soporte (US-25 Esc.2); null hasta que responden. */
    @Column(length = 2000)
    private String respuesta;

    /**
     * US-25 Esc. 1: plazo de atencion que se le informa a quien escribe. El
     * criterio no fija la cifra; se eligieron 48 horas corridas (ver
     * backend/README.md, «Soporte: número de seguimiento y plazo (US-25)»).
     */
    public static final Duration PLAZO_RESPUESTA = Duration.ofHours(48);

    /** Prefijo del numero de seguimiento. */
    public static final String PREFIJO_SEGUIMIENTO = "SOP-";

    /**
     * US-25 Esc. 1: numero de seguimiento que se muestra al usuario, derivado
     * de la PK (unica y secuencial): {@code SOP-000123}. No se guarda aparte.
     */
    public String numeroSeguimiento() {
        return id == null ? null : PREFIJO_SEGUIMIENTO + String.format("%06d", id);
    }

    /** Hasta cuando se espera la respuesta: la creacion mas {@link #PLAZO_RESPUESTA}. */
    public Instant respuestaEsperadaAntesDe() {
        Instant creado = getCreatedAt();
        return creado == null ? null : creado.plus(PLAZO_RESPUESTA);
    }
}
