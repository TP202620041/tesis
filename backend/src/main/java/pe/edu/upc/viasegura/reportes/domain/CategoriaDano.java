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

    /**
     * Clase del modelo de deteccion que corresponde a esta categoria (NC-04,
     * V19): {@code bache} para «Bache» y {@code grieta} para «Pista
     * deteriorada»; nula en las demas, que nunca se sugieren. Unica cuando no
     * es nula y solo en categorias estandar (CHECK de V19).
     *
     * <p>Solo lectura para JPA: la fijan las migraciones, junto con el
     * vocabulario del contrato de {@code inferencia/}; ningun caso de uso la
     * escribe.</p>
     */
    @Column(name = "clase_modelo", length = 40, insertable = false, updatable = false)
    private String claseModelo;

    /**
     * Icono de la categoria (ARCHITECTURE.md §8, US-29 Esc. 1), de un conjunto
     * cerrado ({@link IconoCategoria}). Lo elige el funcionario en las
     * personalizadas; las estandar lo reciben de V24. Nulo = sin icono (la
     * PWA muestra el generico).
     */
    @Enumerated(EnumType.STRING)
    @Column(length = 40)
    private IconoCategoria icono;
}
