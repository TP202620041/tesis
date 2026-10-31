package pe.edu.upc.viasegura.moderacion.domain;

/**
 * Los textos que se filtran antes de publicarlos (NC-10b, D-15,
 * propuesta §5, «Campos»): los del reporte, el comentario publico y el nombre
 * del perfil, que se muestra junto a cada comentario. Los tickets de soporte,
 * el responsable asignado y las categorias no se filtran: son privados o los
 * escribe el personal municipal.
 *
 * <p>Cada campo lleva el nombre que tiene en el pedido (va en
 * {@code details} del 400, para que la PWA marque el campo) y el mensaje para
 * el ciudadano, que <b>nunca repite la palabra</b>.</p>
 */
public enum CampoDeTexto {

    TITULO("titulo", "El título tiene palabras que no están permitidas. Cámbialo para continuar."),
    DESCRIPCION("descripcion", "La descripción tiene palabras que no están permitidas. Cámbiala para continuar."),
    /** El comentario publico de US-27 ({@code ComentarPublicoRequest.contenido}). */
    COMENTARIO("contenido", "El comentario tiene palabras que no están permitidas. Cámbialo para continuar."),
    NOMBRE("nombre", "El nombre tiene palabras que no están permitidas. Cámbialo para continuar."),
    APELLIDO("apellido", "El apellido tiene palabras que no están permitidas. Cámbialo para continuar.");

    private final String nombreEnElPedido;
    private final String mensaje;

    CampoDeTexto(String nombreEnElPedido, String mensaje) {
        this.nombreEnElPedido = nombreEnElPedido;
        this.mensaje = mensaje;
    }

    /** El nombre del campo en el pedido, para {@code details}. */
    public String nombreEnElPedido() {
        return nombreEnElPedido;
    }

    /** El mensaje para el ciudadano. */
    public String mensaje() {
        return mensaje;
    }
}
