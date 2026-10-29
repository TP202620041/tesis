package pe.edu.upc.viasegura.moderacion.port;

import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;

/**
 * Puerto al servicio que mide el contenido sexual de una foto (NC-10b, D-15,
 * ARCHITECTURE.md §4.3 y §6). Solo mide: el umbral lo aplica
 * {@link pe.edu.upc.viasegura.moderacion.domain.PoliticaDeModeracion}.
 *
 * <p>Adaptadores, elegidos con {@code app.moderacion.tipo}
 * ({@code MODERACION_TIPO}):</p>
 * <ul>
 *   <li>{@code ninguna} ({@code infra/SinModeracionAdapter}): no revisa nada.
 *       Por defecto en local y en los tests; en produccion, el interruptor de
 *       emergencia, que acepta toda foto sin revisarla.</li>
 *   <li>{@code http} ({@code infra/InferenciaModeracionHttpAdapter}):
 *       {@code POST /v1/moderacion} del servicio {@code inferencia/} por la red
 *       privada.</li>
 * </ul>
 *
 * <p>Recibe una {@link FotoSaneada}, no el archivo del cliente: se analiza la
 * misma foto que se guarda, saneada una sola vez, y la vista previa y la
 * creacion ven los mismos pixeles.</p>
 */
public interface ModeradorDeImagen {

    /**
     * Si este adaptador revisa algo. Con {@code false}
     * ({@code MODERACION_TIPO=ninguna}) nadie lo llama: toda foto se acepta y
     * la vista previa no sanea una foto solo para moderarla. El adaptador HTTP
     * responde {@code true}: si el servicio esta caido, eso se ve al
     * llamarlo.
     */
    boolean estaActivo();

    /**
     * Mide la foto.
     *
     * @param foto   la foto ya saneada, la misma que se guardaria
     * @param origen para que es (la creacion espera un turno; la vista previa
     *               no)
     * @return el puntaje y la version del modelo
     * @throws ModeracionNoDisponibleException si el servicio no responde, se
     *         pasa del timeout, no hay turno a tiempo o responde algo que no
     *         cumple el contrato
     */
    PuntajeDeModeracion medir(FotoSaneada foto, OrigenDeModeracion origen);
}
