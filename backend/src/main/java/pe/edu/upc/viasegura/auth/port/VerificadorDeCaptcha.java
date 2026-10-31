package pe.edu.upc.viasegura.auth.port;

/**
 * Verificacion del captcha del registro de cuenta (NC-08): el widget de
 * Cloudflare Turnstile (NC-08b; hasta el 28/10, Google reCAPTCHA v2). Es I/O
 * externo (una llamada HTTP a Cloudflare), asi que vive detras de este puerto
 * y su adaptador va en {@code auth/infra}, elegido por
 * {@code app.captcha.tipo} ({@code CAPTCHA_TIPO}):
 * <ul>
 *   <li>{@code turnstile} &rarr; {@code TurnstileAdapter} (produccion);</li>
 *   <li>{@code ninguno} &rarr; {@code SinCaptchaAdapter} (por defecto fuera de
 *       {@code prod}: desarrollo y tests sin red).</li>
 * </ul>
 *
 * <p>El servicio lo llama <b>antes</b> de cualquier otra comprobacion del
 * registro y <b>fuera</b> de la transaccion (D-13): la espera al proveedor no
 * retiene una conexion del pool.</p>
 */
public interface VerificadorDeCaptcha {

    /** Si el registro exige un token de captcha. Con {@code ninguno}, {@code false}. */
    boolean exigido();

    /**
     * Comprueba el token que el widget entrego al navegador. Falla cerrado:
     * <ul>
     *   <li>token rechazado por el proveedor &rarr; {@code BusinessException} (409);</li>
     *   <li>el proveedor no responde, responde un error o algo ilegible &rarr;
     *       {@code ServicioNoDisponibleException} (503).</li>
     * </ul>
     * Nunca deja pasar un registro sin una respuesta afirmativa.
     */
    void verificar(String token);
}
