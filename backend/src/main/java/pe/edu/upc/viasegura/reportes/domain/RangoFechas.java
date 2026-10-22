package pe.edu.upc.viasegura.reportes.domain;

import java.time.Instant;

/**
 * Regla del filtro por fechas de creacion (US-12), compartida por la
 * busqueda publica y la exportacion municipal.
 *
 * <p>Ambos bordes son inclusivos ({@code created_at >= desde} y
 * {@code <= hasta}), asi que {@code desde == hasta} es valido. Un rango
 * invertido no puede tener resultados; responder con una lista vacia
 * ocultaria el error del cliente (p. ej. campos cruzados en el formulario),
 * por eso es 400 ({@link IllegalArgumentException}).</p>
 */
public final class RangoFechas {

    private RangoFechas() {
    }

    /** Lanza si ambos bordes estan presentes y {@code desde} es posterior a {@code hasta}. */
    public static void validar(Instant desde, Instant hasta) {
        if (desde != null && hasta != null && desde.isAfter(hasta)) {
            throw new IllegalArgumentException("La fecha de inicio no puede ser posterior a la fecha de fin");
        }
    }
}
