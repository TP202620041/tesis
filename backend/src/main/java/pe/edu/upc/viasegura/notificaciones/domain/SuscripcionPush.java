package pe.edu.upc.viasegura.notificaciones.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.domain.BaseAuditableEntity;

/**
 * Suscripcion Web Push de un navegador (SUSCRIPCION_PUSH, NC-07).
 *
 * <p>Guarda lo que entrega {@code PushSubscription.toJSON()}: el
 * {@code endpoint} del servicio de push y las claves {@code p256dh} y
 * {@code auth} con las que se cifra cada mensaje. El {@code endpoint}
 * identifica al navegador (es unico), no a la persona: la fila pertenece a
 * quien inicio sesion en ese navegador por ultima vez (ver
 * {@code SuscripcionPushService#suscribir}).</p>
 */
@Entity
@Table(name = "suscripcion_push")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SuscripcionPush extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(nullable = false, unique = true, columnDefinition = "TEXT")
    private String endpoint;

    @Column(nullable = false, length = 255)
    private String p256dh;

    @Column(nullable = false, length = 255)
    private String auth;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    /**
     * {@code false} cuando el servicio de push la da por caducada (US-21).
     * La baja que pide el usuario borra la fila; no pasa por aqui.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean activa = true;
}
