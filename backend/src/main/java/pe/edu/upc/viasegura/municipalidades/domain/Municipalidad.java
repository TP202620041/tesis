package pe.edu.upc.viasegura.municipalidades.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import pe.edu.upc.viasegura.distritos.domain.Distrito;

/**
 * Municipalidad que gestiona los reportes de un distrito (MUNICIPALIDAD, D-09).
 *
 * <p>Referencia a su distrito (1:1, {@code distrito_id NOT NULL UNIQUE}) y no
 * tiene geometria propia: los limites siguen solo en {@link Distrito}. Son 43:
 * 42 distritales y la Municipalidad Metropolitana de Lima, que gestiona
 * Cercado de Lima (el distrito {@value #DISTRITO_CERCADO}).</p>
 */
@Entity
@Table(name = "municipalidad")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Municipalidad {

    /** Nombre del distrito de Cercado de Lima en el catalogo de distritos. */
    public static final String DISTRITO_CERCADO = "Lima";

    public static final String NOMBRE_METROPOLITANA = "Municipalidad Metropolitana de Lima";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "distrito_id", nullable = false, unique = true)
    private Distrito distrito;

    @Column(nullable = false, unique = true, length = 160)
    private String nombre;

    /** Canal oficial de recepcion. Nulo hasta que se registre. */
    @Column(name = "correo_contacto")
    private String correoContacto;

    /**
     * Nombre oficial de la municipalidad de un distrito: la Metropolitana para
     * Cercado de Lima y "Municipalidad Distrital de X" para el resto.
     */
    public static String nombreOficial(String nombreDistrito) {
        return DISTRITO_CERCADO.equals(nombreDistrito)
                ? NOMBRE_METROPOLITANA
                : "Municipalidad Distrital de " + nombreDistrito;
    }
}
