package pe.edu.upc.viasegura.auth.port;

/**
 * Si el dominio de un correo puede recibir correo, segun sus registros MX
 * (NC-09). Es I/O externo (una consulta DNS), asi que vive detras de este
 * puerto y su adaptador va en {@code auth/infra}, elegido por
 * {@code app.dominio-correo.tipo} ({@code DOMINIO_CORREO_TIPO}):
 * <ul>
 *   <li>{@code dns} &rarr; {@code DnsVerificadorDeDominioAdapter}
 *       (por defecto en {@code prod});</li>
 *   <li>{@code ninguno} &rarr; {@code SinVerificacionDeDominioAdapter} (por
 *       defecto fuera de {@code prod} y fijo en los tests: sin red).</li>
 * </ul>
 *
 * <p>El registro lo consulta <b>fuera</b> de la transaccion (D-13), despues
 * del captcha y antes de crear nada. <b>Falla abierto</b>: solo
 * {@link RecepcionDeCorreo#NO_RECIBE} rechaza el registro; si el DNS falla o
 * no responde a tiempo, el adaptador registra un WARN y devuelve
 * {@link RecepcionDeCorreo#DESCONOCIDA}.</p>
 */
public interface VerificadorDeDominioDeCorreo {

    /**
     * @param dominio la parte del correo despues de la {@code @}, ya
     *                normalizada (minusculas, ASCII, sin punto final).
     */
    RecepcionDeCorreo verificar(String dominio);
}
