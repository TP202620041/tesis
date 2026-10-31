package pe.edu.upc.viasegura.reportes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import pe.edu.upc.viasegura.auth.domain.Usuario;

/**
 * Denuncia de un ciudadano sobre un reporte publico (NC-11a, D-15).
 *
 * <p>Una por ciudadano y reporte ({@code uq_denuncia_reporte_usuario}). <b>No
 * tiene ningun efecto automatico</b> (SEC-01): solo pone el reporte en la
 * bandeja del ADMIN, que decide si oculta algo. Si lo hiciera, cualquiera que
 * juntara cuentas podria sacar un reporte del mapa y del indice.</p>
 *
 * <p>Las denuncias son una senal interna: solo aparecen en los DTO del ADMIN.
 * Ni el creador del reporte ni el funcionario saben quien ni cuantos
 * denunciaron (terminos v2, seccion 5).</p>
 *
 * <p><b>Conservacion y BE-14.</b> Se conservan mientras exista el reporte. Al
 * cerrar una cuenta, BE-14 (todavia no existe) tiene que anonimizar al
 * denunciante con {@code DenunciaReporteRepository#anonimizarDenunciante}:
 * {@code denunciante_id} admite NULL solo para eso.</p>
 */
@Entity
@Table(name = "denuncia_reporte")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DenunciaReporte {

    public static final int DETALLE_MAX = 500;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reporte_id", nullable = false)
    private Reporte reporte;

    /** Quien denuncio; {@code null} solo despues de que BE-14 lo anonimice. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "denunciante_id")
    private Usuario denunciante;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MotivoDenuncia motivo;

    @Column(length = DETALLE_MAX)
    private String detalle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    @Builder.Default
    private EstadoDenuncia estado = EstadoDenuncia.PENDIENTE;

    /** El ADMIN que la atendio o desestimo. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resuelta_por")
    private Usuario resueltaPor;

    @Column(name = "resuelta_en")
    private Instant resueltaEn;

    /** Lo que escribio el ADMIN al resolverla; solo lo leen los DTO del ADMIN. */
    @Column(name = "motivo_resolucion", length = 500)
    private String motivoResolucion;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
