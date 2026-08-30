package pe.edu.upc.viasegura.reportes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import pe.edu.upc.viasegura.auth.domain.Usuario;

/**
 * Respuesta ya emitida para una clave de idempotencia (header
 * {@code Idempotency-Key}, US-06) en la creacion de reportes.
 *
 * <p>Guarda el cuerpo de la respuesta completo para poder devolver
 * EXACTAMENTE lo mismo ante un reintento, en vez de re-ejecutar la
 * logica de negocio (que podria fallar distinto la segunda vez, p.ej.
 * con el 409 de acumulacion de US-09 si el propio intento original ya
 * creo el reporte o la adhesion).</p>
 */
@Entity
@Table(name = "idempotency_key")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IdempotencyKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String clave;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(name = "response_body", nullable = false, columnDefinition = "text")
    private String responseBody;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public boolean vigente() {
        return expiresAt.isAfter(Instant.now());
    }
}
