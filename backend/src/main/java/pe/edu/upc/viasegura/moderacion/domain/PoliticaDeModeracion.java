package pe.edu.upc.viasegura.moderacion.domain;

/**
 * Cuando se rechaza una foto (NC-10b, D-15): si el puntaje del servicio de
 * inferencia es <b>mayor o igual</b> que el umbral. El servicio solo mide; la
 * regla vive aqui, como {@code PoliticaDeSugerencia} en la clasificacion.
 *
 * <p><b>Umbral entre {@value #UMBRAL_MINIMO} y {@value #UMBRAL_MAXIMO}</b>
 * (0,70 inicial, decision del usuario del 28/10). El modelo (Marqo
 * {@code nsfw-image-detection-384}) se entreno con <i>label smoothing</i>: su
 * salida queda entre ~0,04 y ~0,96, asi que por encima de 0,9 dejaria pasar
 * casi todo, y la regla de calibracion de NC-10a nunca baja de 0,5.</p>
 */
public final class PoliticaDeModeracion {

    public static final double UMBRAL_MINIMO = 0.5;
    public static final double UMBRAL_MAXIMO = 0.9;

    private final double umbral;

    public PoliticaDeModeracion(double umbral) {
        if (!umbralValido(umbral)) {
            throw new IllegalArgumentException("El umbral de moderacion debe estar entre " + UMBRAL_MINIMO + " y "
                    + UMBRAL_MAXIMO + ", no " + umbral);
        }
        this.umbral = umbral;
    }

    /** Si el umbral esta en el rango admitido (y es un numero). */
    public static boolean umbralValido(double umbral) {
        return Double.isFinite(umbral) && umbral >= UMBRAL_MINIMO && umbral <= UMBRAL_MAXIMO;
    }

    public double umbral() {
        return umbral;
    }

    /** Si la foto con este puntaje se rechaza. */
    public boolean rechaza(PuntajeDeModeracion puntaje) {
        return puntaje.puntaje() >= umbral;
    }
}
