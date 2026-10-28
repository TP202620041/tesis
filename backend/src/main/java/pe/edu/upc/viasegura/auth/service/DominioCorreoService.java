package pe.edu.upc.viasegura.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.auth.domain.DominiosDesechables;
import pe.edu.upc.viasegura.auth.port.RecepcionDeCorreo;
import pe.edu.upc.viasegura.auth.port.VerificadorDeDominioDeCorreo;
import pe.edu.upc.viasegura.common.exception.BusinessException;

/**
 * NC-09: el correo de una cuenta nueva tiene que ser veridico (decision del
 * usuario, 28/10). Antes de crear nada, el registro rechaza con 409:
 * <ol>
 *   <li>un dominio <b>desechable</b> conocido (temp-mail, 10minutemail,
 *       mailinator…), segun la lista fija versionada
 *       ({@link DominiosDesechables}, subdominios incluidos). No necesita red,
 *       asi que se aplica en todos los perfiles;</li>
 *   <li>un dominio que <b>no recibe correo</b> segun el DNS (sin MX, null MX
 *       o inexistente), por el puerto {@link VerificadorDeDominioDeCorreo}.</li>
 * </ol>
 *
 * <p>Sin {@code @Transactional} a proposito: la consulta DNS no debe retener
 * una conexion del pool (D-13). Si el DNS falla, el puerto devuelve
 * {@link RecepcionDeCorreo#DESCONOCIDA} y el registro sigue (falla abierto):
 * el enlace de confirmacion es la prueba definitiva.</p>
 */
@Service
@RequiredArgsConstructor
public class DominioCorreoService {

    public static final String CODIGO_CORREO_DESECHABLE = "CORREO_DESECHABLE";
    public static final String CODIGO_DOMINIO_SIN_CORREO = "DOMINIO_SIN_CORREO";

    static final String MENSAJE_DESECHABLE = "No aceptamos correos temporales o desechables. Usa una dirección"
            + " que revises seguido: ahí te avisaremos cómo avanzan tus reportes.";

    private final DominiosDesechables dominiosDesechables;
    private final VerificadorDeDominioDeCorreo verificador;

    /** Lanza 409 si el dominio del correo es desechable o no recibe correo. */
    public void exigirQueRecibaCorreo(String email) {
        String dominio = DominiosDesechables.normalizar(dominioDe(email));
        if (dominiosDesechables.incluye(dominio)) {
            throw new BusinessException(MENSAJE_DESECHABLE, CODIGO_CORREO_DESECHABLE);
        }
        if (verificador.verificar(dominio) == RecepcionDeCorreo.NO_RECIBE) {
            throw new BusinessException(mensajeSinCorreo(dominioDe(email)), CODIGO_DOMINIO_SIN_CORREO);
        }
    }

    /**
     * El mensaje nombra el dominio tal como lo escribio la persona: casi
     * siempre es un error de tipeo ({@code gmail.con}) que asi se ve enseguida.
     */
    static String mensajeSinCorreo(String dominio) {
        return "El dominio «%s» no puede recibir correos. Revisa que esté bien escrito o usa otra dirección."
                .formatted(dominio.strip());
    }

    /** Lo que sigue a la ultima {@code @}. El correo ya paso por {@code @Email}. */
    private static String dominioDe(String email) {
        return email.substring(email.lastIndexOf('@') + 1);
    }
}
