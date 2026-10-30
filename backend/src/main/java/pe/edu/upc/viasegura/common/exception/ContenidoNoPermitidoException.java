package pe.edu.upc.viasegura.common.exception;

/**
 * Lo que el ciudadano envio no se puede publicar (NC-10b, D-15): una foto con
 * contenido sexual u obsceno, o un texto con groserias. Se traduce a
 * <b>400</b> con un {@code codigo} estable ({@code FOTO_NO_PERMITIDA} o
 * {@code TEXTO_NO_PERMITIDO}) y el campo en {@code details}, para que la PWA
 * marque el campo sin comparar el texto del mensaje.
 *
 * <p>Es un error de validacion de la entrada, no una precondicion de estado:
 * por eso 400 y no el 409 de {@link BusinessException}. El mensaje
 * <b>nunca repite</b> la palabra que coincidio ni el puntaje de la foto.</p>
 *
 * <p>Vive en {@code common} porque {@code GlobalExceptionHandler} no puede
 * depender de un modulo; los codigos los define {@code moderacion}.</p>
 */
public class ContenidoNoPermitidoException extends RuntimeException {

    private final String codigo;
    private final String campo;

    /**
     * @param mensaje el texto para el ciudadano, sin la palabra ni el puntaje
     * @param codigo  el codigo estable para el cliente
     * @param campo   el campo del pedido que hay que cambiar ({@code titulo},
     *                {@code foto}...), que va en {@code details}
     */
    public ContenidoNoPermitidoException(String mensaje, String codigo, String campo) {
        super(mensaje);
        this.codigo = codigo;
        this.campo = campo;
    }

    public String getCodigo() {
        return codigo;
    }

    public String getCampo() {
        return campo;
    }
}
