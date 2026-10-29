package pe.edu.upc.viasegura.common.port;

/**
 * Sanea una foto subida antes de guardarla o clasificarla (DEP-12).
 *
 * <p>Las fotos de los telefonos traen metadatos EXIF: la ubicacion GPS del
 * telefono, el modelo del equipo y la fecha. La foto de un reporte es
 * publica, asi que publicarlos expondria donde vive o por donde anda quien
 * reporta. Sanear es <b>volver a codificar la imagen</b>, no quitar
 * metadatos formato por formato: lo que sale son solo los pixeles, sin nada
 * que haya que conocer para borrarlo (propuesta
 * {@code 2026-10-21-fotos-r2.md}, opcion A).</p>
 *
 * <p>La implementacion:</p>
 * <ul>
 *   <li>valida que el archivo sea una imagen JPEG, PNG o WEBP de verdad (no
 *       solo por su extension) y rechaza las de mas de 40 megapixeles sin
 *       decodificarlas;</li>
 *   <li>aplica la orientacion del EXIF a los pixeles (si no, la foto se
 *       veria girada al quitar el EXIF);</li>
 *   <li>reduce el lado mayor a 2048 px o menos;</li>
 *   <li>devuelve un JPEG de calidad 0,85 sin metadatos;</li>
 *   <li>es <b>determinista</b>: los mismos bytes de entrada dan los mismos
 *       bytes de salida. La sugerencia de categoria (D-08) depende de eso.</li>
 * </ul>
 *
 * <p>Vive en {@code common/port} porque lo usan varios modulos (D-11): la
 * creacion de un reporte ({@code reportes.service.ReporteService}, que sanea
 * la foto una sola vez y sin transaccion antes de subirla, BE-11), el
 * adaptador de almacenamiento para la foto de perfil de {@code auth} y, con
 * NC-04, la vista previa de {@code clasificacion}. No expone tipos de
 * ImageIO.</p>
 */
public interface SaneadorDeImagen {

    /**
     * Foto saneada, lista para guardar o clasificar.
     *
     * @param foto archivo tal como lo envio el cliente
     * @return la foto como JPEG sin metadatos, con el nombre terminado en
     *         {@code .jpg}; un tipo propio ({@link FotoSaneada}) para que una
     *         foto cruda no pueda pasar por saneada (BE-11)
     * @throws pe.edu.upc.viasegura.common.exception.BusinessException si esta
     *         vacia, no es una imagen JPEG, PNG o WEBP valida o es demasiado
     *         grande (409, el mismo error que una extension no permitida)
     * @throws pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException
     *         si no hay turno para sanearla dentro del plazo (503)
     */
    FotoSaneada sanear(ArchivoSubido foto);
}
