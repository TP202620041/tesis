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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import pe.edu.upc.viasegura.distritos.domain.Distrito;

/**
 * Categoria de dano vial (US-05, US-29).
 *
 * <p>No es un enum fijo: existe un set estandar ({@code esEstandar = true},
 * {@code distrito = null}) y categorias personalizadas por distrito
 * ({@code distrito != null}).</p>
 */
@Entity
@Table(name = "categoria_dano")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategoriaDano {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String nombre;

    @Column(length = 300)
    private String descripcion;

    /** true = categoria estandar global; false = personalizada por distrito. */
    @Column(name = "es_estandar", nullable = false)
    @Builder.Default
    private boolean esEstandar = false;

    /** null cuando es una categoria estandar global. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "distrito_id")
    private Distrito distrito;

    @Column(nullable = false)
    @Builder.Default
    private boolean activo = true;
}
