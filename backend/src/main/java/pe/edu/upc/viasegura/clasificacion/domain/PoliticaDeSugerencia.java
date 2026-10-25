package pe.edu.upc.viasegura.clasificacion.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Decide que categoria sugerir a partir de lo que detecto el modelo (NC-04;
 * propuesta aceptada {@code 2026-10-21-ml-clases-modelo.md}, «Politica de
 * sugerencia»). Regla pura: sin I/O, sin Spring.
 *
 * <ol>
 *   <li>Se descartan las detecciones cuya clase no corresponde a ninguna
 *       categoria <b>activa</b> con {@code clase_modelo}, y las de confianza
 *       fuera de [0, 1].</li>
 *   <li>El puntaje de cada categoria es la <b>maxima</b> confianza entre sus
 *       detecciones (no la suma: tres grietas de 0,4 no hacen una de 1,2).</li>
 *   <li>Se sugiere la categoria de mayor puntaje si es <b>mayor o igual que el
 *       umbral</b>. Un empate exacto en el primer lugar o ningun puntaje sobre
 *       el umbral dan «sin sugerencia»: ante la duda no se sugiere, porque una
 *       sugerencia equivocada empuja al ciudadano a la categoria erronea
 *       (anclaje).</li>
 *   <li>La confianza de la sugerencia es ese puntaje, con
 *       {@value #DECIMALES_CONFIANZA} decimales (redondeo al mas cercano), y
 *       la version es la del modelo que respondio.</li>
 * </ol>
 *
 * <p>El umbral se compara con el puntaje <b>sin redondear</b>: 0,4996 no se
 * sugiere con un umbral de 0,50 aunque se guardaria como 0,500.</p>
 *
 * <p>El umbral inicial es 0,50 ({@code app.clasificacion.umbral}) y se calibra
 * en NC-03b con fotos de Lima. La agregacion por maximo es una eleccion
 * razonable sin respaldo especifico en la literatura; las alternativas (suma
 * de confianzas, area de la caja) se comparan con ese mismo conjunto.</p>
 */
public final class PoliticaDeSugerencia {

    /** Escala de {@code reporte.confianza_sugerencia} ({@code NUMERIC(4,3)}). */
    public static final int DECIMALES_CONFIANZA = 3;

    private final double umbral;

    /**
     * @param umbral confianza minima para sugerir, en (0, 1]
     * @throws IllegalArgumentException si esta fuera de ese rango: con 0 se
     *         sugeriria cualquier deteccion, y con mas de 1 nunca nada
     */
    public PoliticaDeSugerencia(double umbral) {
        if (!(umbral > 0 && umbral <= 1)) {
            throw new IllegalArgumentException(
                    "El umbral de sugerencia (app.clasificacion.umbral) debe estar en (0, 1]: " + umbral);
        }
        this.umbral = umbral;
    }

    public double umbral() {
        return umbral;
    }

    /**
     * @param resultado         lo que detecto el modelo en la foto
     * @param categoriasActivas categorias activas con clase del modelo
     * @return la sugerencia, o vacio si no hay ninguna clara
     */
    public Optional<Sugerencia> aplicar(ResultadoDeteccion resultado,
                                        Collection<CategoriaClasificable> categoriasActivas) {
        Map<String, CategoriaClasificable> porClase = new HashMap<>();
        for (CategoriaClasificable categoria : categoriasActivas) {
            if (categoria.claseModelo() != null) {
                porClase.put(categoria.claseModelo(), categoria);
            }
        }

        // 1 y 2: puntaje por categoria = maxima confianza de sus detecciones.
        Map<CategoriaClasificable, Double> puntajes = new LinkedHashMap<>();
        for (Deteccion deteccion : resultado.detecciones()) {
            CategoriaClasificable categoria = porClase.get(deteccion.clase());
            if (categoria != null && confianzaValida(deteccion.confianza())) {
                puntajes.merge(categoria, deteccion.confianza(), Math::max);
            }
        }

        // 3: la de mayor puntaje, si no empata y alcanza el umbral.
        CategoriaClasificable mejor = null;
        double maximo = -1;
        boolean empate = false;
        for (Map.Entry<CategoriaClasificable, Double> puntaje : puntajes.entrySet()) {
            if (puntaje.getValue() > maximo) {
                mejor = puntaje.getKey();
                maximo = puntaje.getValue();
                empate = false;
            } else if (puntaje.getValue() == maximo) {
                empate = true;
            }
        }
        if (mejor == null || empate || maximo < umbral) {
            return Optional.empty();
        }

        // 4: confianza con la escala de la columna y version del modelo.
        BigDecimal confianza = BigDecimal.valueOf(maximo).setScale(DECIMALES_CONFIANZA, RoundingMode.HALF_UP);
        return Optional.of(new Sugerencia(mejor.id(), mejor.nombre(), confianza, resultado.versionModelo()));
    }

    /** En [0, 1]; {@code NaN} no lo esta. */
    private static boolean confianzaValida(double confianza) {
        return confianza >= 0 && confianza <= 1;
    }
}
