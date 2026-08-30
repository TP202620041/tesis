package pe.edu.upc.viasegura.common.exception;

/**
 * El usuario esta autenticado y tiene acceso al recurso, pero esa operacion
 * concreta no le corresponde a su rol. Se traduce a <b>403</b>
 * <em>conservando el mensaje</em>.
 *
 * <p>Existe separada de {@link org.springframework.security.access.AccessDeniedException}
 * porque el manejador global responde a esa con un "Acceso denegado" fijo, y
 * hay casos en que el mensaje ES la parte util: cuando la accion esta
 * prohibida para este actor pero SI existe una via correcta, decirla evita
 * que el usuario crea que se trata de un fallo de permisos de su cuenta.
 * Caso que la motivo: un funcionario intentando cancelar un reporte, donde
 * lo que corresponde es rechazarlo con justificacion.</p>
 *
 * <p>No se cambio el manejador de {@code AccessDeniedException} para que
 * propagara su mensaje porque esa excepcion tambien la lanza Spring Security
 * desde {@code @PreAuthorize}, y sus textos internos no estan pensados para
 * mostrarse al usuario final.</p>
 */
public class OperacionNoPermitidaException extends RuntimeException {

    public OperacionNoPermitidaException(String mensaje) {
        super(mensaje);
    }
}
