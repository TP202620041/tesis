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
import java.math.BigDecimal;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.locationtech.jts.geom.Point;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.domain.BaseAuditableEntity;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.municipalidades.domain.PeriodoGestion;

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

    /** Titulo corto del dano (NC-02): {@value #TITULO_MIN}-{@value #TITULO_MAX} caracteres, sin espacios al borde. */
    @Column(nullable = false, length = TITULO_MAX)
    private String titulo;

    @Column(length = DESCRIPCION_MAX)
    private String descripcion;

    /** Severidad declarada por el ciudadano (NC-02). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Severidad severidad;

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

    /**
     * Periodo de gestion de su fecha de creacion (NC-02), base de los KPIs
     * por periodo (NC-06). Nulo si se creo fuera de todo periodo registrado.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "periodo_gestion_id")
    private PeriodoGestion periodoGestion;

    /*
     * Sugerencia oficial de categoria (NC-04, D-08): la calcula el backend
     * sobre la foto guardada, despues del commit, y la escribe UNA vez con
     * ReporteRepository#registrarSugerencia (UPDATE condicional). Las tres van
     * juntas: o todas nulas (sin foto, sin sugerencia clara o el servicio
     * fallo) o todas con valor (CHECK de V19).
     *
     * Solo lectura para JPA (insertable/updatable = false): ni la creacion ni
     * un save() posterior pueden escribirlas, asi que lo que envie el cliente
     * no llega a la base, y una edicion concurrente del reporte no pisa la
     * sugerencia con un valor viejo. Es una SENAL INTERNA: no va en ningun DTO
     * (SugerenciaFueraDeDtosIT); para la tesis se mide por SQL.
     */

    /** Categoria que sugirio el modelo; puede diferir de {@link #categoria}, que confirmo el ciudadano. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "categoria_sugerida_id", insertable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    private CategoriaDano categoriaSugerida;

    /** Puntaje de la sugerencia, en [0, 1] con 3 decimales. */
    @Column(name = "confianza_sugerencia", precision = 4, scale = 3, insertable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    private BigDecimal confianzaSugerencia;

    /** Version del modelo que produjo la sugerencia (evaluacion de OE3). */
    @Column(name = "version_modelo_sugerencia", length = 40, insertable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    private String versionModeloSugerencia;

    /*
     * Moderacion (NC-11a, D-15): solo el ADMIN los cambia, por
     * ModeracionReporteService y con ReporteRepository#cambiarOculto /
     * #cambiarFotoOculta (UPDATE condicional). Solo lectura para JPA, como la
     * sugerencia: un save() del ciudadano o del funcionario no puede
     * restablecer un reporte con un valor viejo, y ocultar no mueve
     * updated_at (que mide los reportes estancados de US-17).
     *
     * Ninguno va en un DTO que no sea del ADMIN: lo oculto se nota porque el
     * reporte no aparece o porque fotoUrl llega en null (fotoUrlPublica).
     */

    /** Todo el reporte fuera de lo publico, de la bandeja municipal y del indice. */
    @Column(name = "oculto", nullable = false, insertable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    @Builder.Default
    private boolean oculto = false;

    /** Solo la foto: el reporte sigue publico y sigue contando en el indice. */
    @Column(name = "foto_oculta", nullable = false, insertable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    @Builder.Default
    private boolean fotoOculta = false;

    /**
     * La URL de la foto para cualquier DTO que no sea del ADMIN: {@code null}
     * si no hay foto, si el ADMIN oculto la foto o si oculto el reporte entero
     * (su creador lo sigue viendo en "mis reportes", sin foto). En esos casos
     * {@code /media/...} responde 404. La foto se conserva en el almacenamiento
     * y solo la sirve la ruta del ADMIN (NC-11a).
     */
    public String fotoUrlPublica() {
        return oculto || fotoOculta ? null : fotoUrl;
    }

    public static final int TITULO_MIN = 5;
    public static final int TITULO_MAX = 120;
    public static final int DESCRIPCION_MAX = 1000;

    /**
     * Descripcion opcional de hasta {@value #DESCRIPCION_MAX} caracteres
     * (QA-1 M-2). La creacion es multipart y no pasa por {@code @Valid}: sin
     * esta regla, una descripcion mas larga llegaba a la columna y respondia
     * 500. Se cuentan code points, como el {@code varchar} de la base.
     */
    public static void validarDescripcion(String descripcion) {
        if (descripcion != null && descripcion.codePointCount(0, descripcion.length()) > DESCRIPCION_MAX) {
            throw new IllegalArgumentException(
                    "La descripción puede tener como máximo " + DESCRIPCION_MAX + " caracteres");
        }
    }

    /**
     * Titulo sin espacios al borde, validado: obligatorio y de
     * {@value #TITULO_MIN} a {@value #TITULO_MAX} caracteres despues del trim.
     * Invalido: {@link IllegalArgumentException} (400). Se cuentan code points,
     * como el {@code char_length} del CHECK de V17: con {@code length()} un emoji
     * contaria doble y el CHECK lo rechazaria con un 500 en vez de un 400.
     */
    public static String normalizarTitulo(String titulo) {
        String limpio = titulo == null ? "" : titulo.strip();
        int largo = limpio.codePointCount(0, limpio.length());
        if (largo < TITULO_MIN || largo > TITULO_MAX) {
            throw new IllegalArgumentException(
                    "El título debe tener entre " + TITULO_MIN + " y " + TITULO_MAX + " caracteres");
        }
        return limpio;
    }
}
