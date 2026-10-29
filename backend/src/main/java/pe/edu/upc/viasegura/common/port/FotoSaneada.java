package pe.edu.upc.viasegura.common.port;

/**
 * Una foto que ya paso por {@link SaneadorDeImagen#sanear}: un JPEG sin EXIF,
 * orientado y de 2048 px como maximo (DEP-12).
 *
 * <p><b>Es un tipo aparte para que una foto cruda no compile donde se espera
 * una saneada</b> (BE-11). La foto de un reporte se publica en el mapa, y
 * {@link FotoStorageService#almacenarFotoReporteSaneada} la guarda tal cual:
 * si recibiera el {@link ArchivoSubido} del cliente, publicaria el EXIF del
 * telefono (la ubicacion GPS de quien reporta). La moderacion de NC-10b
 * (D-15) tambien analiza la foto saneada. Solo la construye el saneado; el
 * constructor es publico porque un record no puede restringirlo, y los tests
 * lo usan para armar dobles.</p>
 *
 * @param contenido los bytes del JPEG saneado; nunca vacio
 * @param nombre    el nombre del cliente con extension {@code .jpg}; nunca
 *                  llega al almacenamiento (el nombre lo genera el servidor)
 */
public record FotoSaneada(byte[] contenido, String nombre) {

    /** El tipo de toda foto saneada. */
    public static final String TIPO = "image/jpeg";

    public FotoSaneada {
        if (contenido == null || contenido.length == 0) {
            throw new IllegalArgumentException("Una foto saneada no puede estar vacia");
        }
    }

    /**
     * La misma foto como {@link ArchivoSubido}, para un puerto que recibe
     * archivos (el clasificador de {@code clasificacion}). No la recodifica:
     * son los mismos bytes.
     */
    public ArchivoSubido comoArchivo() {
        return new ArchivoSubido(contenido, TIPO, nombre);
    }

    /** Sin los bytes: un log o un mensaje de error no debe volcar la foto. */
    @Override
    public String toString() {
        return "FotoSaneada[" + nombre + ", " + contenido.length + " bytes]";
    }
}
