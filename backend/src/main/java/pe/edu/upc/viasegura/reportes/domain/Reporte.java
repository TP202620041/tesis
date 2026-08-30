package pe.edu.upc.viasegura.reportes.domain;

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
import org.locationtech.jts.geom.Point;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.domain.BaseAuditableEntity;
import pe.edu.upc.viasegura.distritos.domain.Distrito;

/**
 * Reporte ciudadano de un dano vial (US-05..US-09).
 *
 * <p>La {@link #ubicacion} es un GEOGRAPHY(Point,4326); su indice GiST
 * habilita tanto la asignacion automatica de distrito (point-in-polygon)
 * como la deteccion de duplicados en radio de 20 m (US-09) y el mapa de
 * calor (US-11).</p>
 */
@Entity
@Table(name = "reporte")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Reporte extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(columnDefinition = "geography(Point,4326)", nullable = false)
    private Point ubicacion;

    @Column(name = "foto_url", length = 500)
    private String fotoUrl;

    @Column(length = 1000)
    private String descripcion;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "categoria_id", nullable = false)
    private CategoriaDano categoria;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private EstadoReporte estado = EstadoReporte.PENDIENTE;

    /** Distrito asignado automaticamente segun {@link #ubicacion}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "distrito_id")
    private Distrito distrito;

    /** Ciudadano que origino el reporte. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "creador_id", nullable = false)
    private Usuario creador;

    /** Cache del numero de adhesiones (US-09), para consultas de mapa. */
    @Column(name = "total_adhesiones", nullable = false)
    @Builder.Default
    private int totalAdhesiones = 1;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    /** Marcado cuando un comentario publico sugiere reincidencia (US-27). */
    @Column(name = "posible_reincidencia", nullable = false)
    @Builder.Default
    private boolean posibleReincidencia = false;
}
