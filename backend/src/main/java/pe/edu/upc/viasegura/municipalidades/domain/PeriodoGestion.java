package pe.edu.upc.viasegura.municipalidades.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Periodo de gestion municipal (PERIODO_GESTION), p. ej. 2023-2026. Los KPIs
 * del dashboard se miden por periodo, y un reporte cuenta en el periodo de su
 * fecha de creacion (ARCHITECTURE.md §4.3, paso 6).
 *
 * <p>Ambas fechas son inclusivas.</p>
 */
@Entity
@Table(name = "periodo_gestion")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PeriodoGestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fecha_inicio", nullable = false, unique = true)
    private LocalDate fechaInicio;

    @Column(name = "fecha_fin", nullable = false)
    private LocalDate fechaFin;

    /** Si la fecha cae dentro del periodo, con ambos extremos incluidos. */
    public boolean incluye(LocalDate fecha) {
        return !fecha.isBefore(fechaInicio) && !fecha.isAfter(fechaFin);
    }
}
