package pe.edu.upc.viasegura.distritos.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.locationtech.jts.geom.MultiPolygon;

/**
 * Distrito de Lima Metropolitana (US-05, US-13, US-18..US-20).
 *
 * <p>El poligono {@link #limites} almacena los limites distritales como
 * GEOGRAPHY(MultiPolygon,4326) y es la base del calculo automatico de
 * asignacion de reportes (point-in-polygon, ST_Contains) exigido por la
 * restriccion clave de negocio.</p>
 */
@Entity
@Table(name = "distrito")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Distrito {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 120)
    private String nombre;

    /** Codigo UBIGEO INEI del distrito (6 digitos). */
    @Column(length = 6)
    private String ubigeo;

    @Column(columnDefinition = "geography(MultiPolygon,4326)")
    private MultiPolygon limites;
}
