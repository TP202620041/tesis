package pe.edu.upc.viasegura.clasificacion.domain;

import java.util.List;

/**
 * Respuesta del servicio de inferencia para una foto (contrato {@code /v1},
 * ARCHITECTURE.md §6): la version del modelo que la produjo y lo que detecto.
 * El servicio solo detecta; el umbral y la clase dominante los aplica
 * {@link PoliticaDeSugerencia}.
 *
 * @param versionModelo version del modelo, obligatoria y de hasta
 *                      {@value #VERSION_MODELO_MAX} caracteres (la columna
 *                      {@code reporte.version_modelo_sugerencia})
 * @param detecciones   lo detectado; vacia si no encontro nada
 */
public record ResultadoDeteccion(String versionModelo, List<Deteccion> detecciones) {

    /** Largo de {@code reporte.version_modelo_sugerencia} (V19). */
    public static final int VERSION_MODELO_MAX = 40;

    public ResultadoDeteccion {
        if (versionModelo == null || versionModelo.isBlank() || versionModelo.length() > VERSION_MODELO_MAX) {
            throw new IllegalArgumentException(
                    "La version del modelo es obligatoria y de hasta " + VERSION_MODELO_MAX + " caracteres");
        }
        detecciones = detecciones == null ? List.of() : List.copyOf(detecciones);
    }
}
