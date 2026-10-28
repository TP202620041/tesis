package pe.edu.upc.viasegura.clasificacion.port;

import pe.edu.upc.viasegura.clasificacion.domain.OrigenDeConsulta;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/**
 * Puerto al servicio que detecta danos en una foto (NC-04, ARCHITECTURE.md
 * §4.3 y §6). Solo detecta: el umbral y la clase dominante los aplica
 * {@link pe.edu.upc.viasegura.clasificacion.domain.PoliticaDeSugerencia}.
 *
 * <p>Adaptadores, elegidos con {@code app.clasificacion.tipo}
 * ({@code CLASIFICACION_TIPO}):</p>
 * <ul>
 *   <li>{@code falso} ({@code infra/FalsoClasificadorAdapter}): respuestas
 *       fijas por configuracion, incluido un modo que falla (local y tests;
 *       en produccion, la clasificacion apagada).</li>
 *   <li>{@code http} (NC-04b, {@code infra/InferenciaHttpAdapter}):
 *       {@code POST /v1/detecciones} del servicio {@code inferencia/} por la
 *       red privada, con 3 s como maximo entre conexion y lectura.</li>
 * </ul>
 */
public interface ClasificadorDano {

    /**
     * Si este adaptador puede detectar algo. Con {@code false} la vista previa
     * no sanea la foto y la sugerencia oficial no la descarga: no se gasta un
     * turno de saneado, ni memoria ni red, en una respuesta que de antemano es
     * «sin sugerencia».
     *
     * <p>Es el falso sin respuesta configurada, que es como corre produccion
     * con {@code CLASIFICACION_TIPO=falso} (la clasificacion apagada). Lo
     * decide el adaptador y no una propiedad aparte: asi no puede haber una
     * «habilitada» que diga si mientras el adaptador no detecta nada, o al
     * reves. El adaptador HTTP (NC-04b) responde {@code true}: si el servicio
     * esta caido, eso se ve al llamarlo.</p>
     */
    boolean estaDisponible();

    /**
     * Detecta danos en la foto.
     *
     * @param foto foto <b>ya saneada</b> por
     *             {@link pe.edu.upc.viasegura.common.port.SaneadorDeImagen}
     *             (JPEG sin EXIF, orientado, de 2048 px o menos): la misma que
     *             se guarda, para que la vista previa y la sugerencia oficial
     *             vean la misma imagen (D-08)
     * @param origen quien la pide (NC-04c): la vista previa no espera turno;
     *               la sugerencia oficial, asincrona, puede esperarlo. Un
     *               adaptador sin turnos lo ignora
     * @return la version del modelo y lo detectado (vacio si nada)
     * @throws ClasificacionNoDisponibleException si el servicio no responde, se
     *         pasa del timeout, no hay turno a tiempo o responde algo que no
     *         cumple el contrato
     */
    ResultadoDeteccion detectar(ArchivoSubido foto, OrigenDeConsulta origen);
}
