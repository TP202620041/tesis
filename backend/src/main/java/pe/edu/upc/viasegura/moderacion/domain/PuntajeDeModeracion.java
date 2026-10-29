package pe.edu.upc.viasegura.moderacion.domain;

/**
 * Lo que mide el servicio de inferencia sobre una foto (NC-10b, contrato
 * {@code POST /v1/moderacion}): la probabilidad de contenido sexual
 * explicito y la version del modelo que la dio. El servicio <b>solo
 * mide</b>; la decision la toma {@link PoliticaDeModeracion}.
 *
 * <p><b>Es una senal interna:</b> no va en ningun DTO ni se guarda. Solo el
 * log de una foto rechazada lleva el puntaje, redondeado.</p>
 *
 * @param versionModelo la version del modelo, de {@value #VERSION_MODELO_MAX}
 *                      caracteres como maximo
 * @param puntaje       entre 0 y 1
 */
public record PuntajeDeModeracion(String versionModelo, double puntaje) {

    /** El tope del contrato para {@code version_modelo}. */
    public static final int VERSION_MODELO_MAX = 40;

    public PuntajeDeModeracion {
        if (versionModelo == null || versionModelo.isBlank() || versionModelo.length() > VERSION_MODELO_MAX) {
            throw new IllegalArgumentException("La version del modelo de moderacion debe tener de 1 a "
                    + VERSION_MODELO_MAX + " caracteres");
        }
        if (!Double.isFinite(puntaje) || puntaje < 0 || puntaje > 1) {
            throw new IllegalArgumentException("El puntaje de moderacion debe estar entre 0 y 1");
        }
    }
}
