package pe.edu.upc.viasegura.desempeno.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Immutable;

/**
 * Indice publico de desempeno por distrito (US-18, US-19, US-20).
 *
 * <p>Se mapea a la VISTA MATERIALIZADA {@code mv_indice_desempeno_distrital}
 * (ver migracion Flyway): datos derivados/agregados que se recalculan
 * periodicamente, no en tiempo real por request. Por eso la entidad es
 * de solo lectura ({@link Immutable}).</p>
 */
@Entity
@Immutable
@Table(name = "mv_indice_desempeno_distrital")
@Getter
@Setter
@NoArgsConstructor
public class IndiceDesempenoDistrital {

    /** PK sintetica de la fila de la vista (distrito + categoria). */
    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "distrito_id")
    private Long distritoId;

    @Column(name = "distrito_nombre")
    private String distritoNombre;

    /** null = agregado de todas las categorias del distrito. */
    @Column(name = "categoria_id")
    private Long categoriaId;

    @Column(name = "total_reportes")
    private long totalReportes;

    @Column(name = "total_resueltos")
    private long totalResueltos;

    /** Porcentaje de resolucion (0..100). */
    @Column(name = "tasa_resolucion")
    private BigDecimal tasaResolucion;

    /** Tiempo promedio de atencion en horas. */
    @Column(name = "tiempo_promedio_horas")
    private BigDecimal tiempoPromedioHoras;

    /** Promedio de estrellas (1..5) de las calificaciones (US-26); null si no hay. */
    @Column(name = "satisfaccion_promedio")
    private BigDecimal satisfaccionPromedio;

    @Column(name = "total_calificaciones")
    private long totalCalificaciones;

    @Column(name = "calculated_at")
    private Instant calculatedAt;
}
