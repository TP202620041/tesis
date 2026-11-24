package pe.edu.upc.viasegura.desempeno.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

/**
 * KPIs de una municipalidad (= distrito, D-09) en un periodo de gestion
 * (NC-06, indicador OE3-I5).
 *
 * <p>Se mapea a la vista materializada {@code mv_kpi_gestion_distrital}
 * (V25), que refresca el mismo listener que el indice de US-18. Hay una fila
 * por periodo y distrito ({@code categoriaId} null, aunque el distrito no
 * tenga reportes) y una por cada categoria con reportes. Formulas: ver la
 * migracion y la decision del usuario del 23/11.</p>
 */
@Entity
@Immutable
@Table(name = "mv_kpi_gestion_distrital")
@Getter
@NoArgsConstructor
public class KpiGestionDistrital {

    /** PK sintetica: periodo + distrito + categoria (o ALL). */
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "periodo_gestion_id")
    private Long periodoGestionId;

    @Column(name = "distrito_id")
    private Long distritoId;

    @Column(name = "distrito_nombre")
    private String distritoNombre;

    /** null si el distrito todavia no tiene municipalidad sembrada. */
    @Column(name = "municipalidad_nombre")
    private String municipalidadNombre;

    /** null = todas las categorias del distrito en el periodo. */
    @Column(name = "categoria_id")
    private Long categoriaId;

    @Column(name = "reportes_validos")
    private long reportesValidos;

    @Column(name = "reportes_resueltos")
    private long reportesResueltos;

    /** Porcentaje 0..100 con dos decimales; null sin reportes validos. */
    @Column(name = "tasa_resolucion")
    private BigDecimal tasaResolucion;

    /** Dias con un decimal; null sin resueltos. */
    @Column(name = "tiempo_promedio_dias")
    private BigDecimal tiempoPromedioDias;

    /** Promedio de estrellas (1..5); null sin calificaciones. */
    @Column(name = "satisfaccion_promedio")
    private BigDecimal satisfaccionPromedio;

    @Column(name = "total_calificaciones")
    private long totalCalificaciones;

    @Column(name = "calculated_at")
    private Instant calculatedAt;
}
