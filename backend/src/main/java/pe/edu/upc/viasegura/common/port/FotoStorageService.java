package pe.edu.upc.viasegura.common.port;

import java.util.regex.Pattern;
import org.springframework.core.io.Resource;

/**
 * Abstraccion del almacenamiento de fotos (US-05 reportes, US-30 perfil).
 *
 * <p>Patron Adapter: la logica de negocio depende de esta interfaz, no de
 * un proveedor concreto. Hay dos implementaciones, elegidas por
 * {@code app.storage.tipo} (DEP-12): el filesystem local
 * ({@link pe.edu.upc.viasegura.common.infra.LocalFotoStorageService}, para
 * desarrollo y tests) y cualquier almacenamiento con API S3
 * ({@link pe.edu.upc.viasegura.common.infra.S3FotoStorageService}: Cloudflare
 * R2 en produccion). Por eso la lectura devuelve un {@link Resource} de
 * Spring y no un {@code java.nio.file.Path}: un {@code Path} ataria la
 * interfaz al filesystem.</p>
 *
 * <p><b>Los dos tipos de foto se guardan por separado a proposito, y esa
 * separacion es de seguridad, no de orden.</b> La foto de un reporte es
 * evidencia publica: el mapa y la busqueda de reportes (US-10/US-12) no
 * exigen autenticacion y devuelven {@code fotoUrl}, asi que debe poder
 * cargarse sin token. La foto de perfil es un dato personal del ciudadano y
 * solo la puede ver su dueno. Guardarlas juntas obligaria a elegir una sola
 * politica para ambas, y cualquiera de las dos elecciones seria incorrecta
 * para la otra: o se filtran las caras de los ciudadanos, o el mapa publico
 * muestra imagenes rotas. Por eso son metodos distintos en vez de un
 * parametro: al escribir el codigo hay que decidir explicitamente cual es.</p>
 *
 * <p>Toda foto pasa por {@link SaneadorDeImagen} antes de guardarse (DEP-12):
 * sale como JPEG sin EXIF, asi que las URL nuevas siempre terminan en
 * {@code .jpg}. Para el cliente la URL sigue siendo una cadena opaca.
 * <b>Quien sanea depende del tipo de foto</b> (BE-11): la de perfil la sanea
 * el adaptador dentro de {@link #almacenarFotoPerfil}; la de reporte llega
 * <b>ya saneada</b> a {@link #almacenarFotoReporteSaneada}, porque la
 * creacion del reporte la sanea una sola vez, sin transaccion abierta, y
 * guarda esos mismos bytes (los que vio la vista previa, D-08, y los que
 * revisara la moderacion, D-15).</p>
 *
 * <p>El archivo llega como {@link ArchivoSubido}, no como el
 * {@code MultipartFile} de Spring Web: el puerto no conoce HTTP (BE-10).</p>
 */
public interface FotoStorageService {

    /**
     * Unico nombre de archivo que generan los adaptadores: {@code <uuid>.<ext>}.
     * Las extensiones distintas de {@code jpg} son de fotos guardadas antes
     * del saneado (DEP-12).
     */
    Pattern NOMBRE_DE_ARCHIVO = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)");

    /**
     * {@code true} si {@code nombre} tiene la forma de un archivo generado por
     * el servidor. Lo que no la tiene se rechaza sin tocar el almacenamiento:
     * no hay ruta relativa, prefijo ni caracter raro que pueda pasar.
     */
    static boolean esNombreDeArchivoValido(String nombre) {
        return nombre != null && NOMBRE_DE_ARCHIVO.matcher(nombre).matches();
    }

    /**
     * Almacena la foto de evidencia de un reporte (US-05) <b>tal como llega</b>:
     * no la vuelve a sanear (BE-11).
     *
     * <p>La foto tiene que salir de {@link SaneadorDeImagen#sanear}: es lo que
     * se publica en el mapa, asi que una foto cruda llevaria el EXIF del
     * telefono (la ubicacion GPS de quien reporta). Volver a sanearla aqui
     * la recomprimiria y daria otros pixeles que los que ya vio la vista
     * previa (D-08) y que revisa la moderacion (D-15).</p>
     *
     * <p>Se llama <b>sin transaccion abierta</b> (BE-11): con R2 es una
     * llamada de red, y dentro de la transaccion retendria una conexion del
     * pool. Si el reporte no llega a guardarse, quien la subio la borra con
     * {@link #eliminarFotoReporte}.</p>
     *
     * @param fotoSaneada la foto que devolvio {@link SaneadorDeImagen#sanear}
     * @return URL relativa <b>publica</b> de la foto almacenada
     * @throws IllegalArgumentException si la foto es {@code null} o esta vacia
     *         (un error de programacion: el saneado nunca devuelve eso)
     */
    String almacenarFotoReporteSaneada(ArchivoSubido fotoSaneada);

    /**
     * Sanea con {@link SaneadorDeImagen} y almacena la foto de perfil de un
     * ciudadano (US-30).
     *
     * @param foto archivo tal como lo envio el cliente
     * @return URL relativa <b>autenticada</b>: apunta al endpoint que valida
     *         que quien la pide sea el dueno
     */
    String almacenarFotoPerfil(ArchivoSubido foto);

    /**
     * Carga una foto de perfil ya almacenada.
     *
     * @param nombreArchivo nombre simple del archivo, <b>ya validado contra
     *                      lo que consta en {@code usuario.foto_url}</b>: este
     *                      metodo no debe recibir texto crudo de la URL
     * @return el recurso, o {@code null} si no existe o no es legible
     */
    Resource cargarFotoPerfil(String nombreArchivo);

    /**
     * Carga una foto de reporte ya almacenada, para servirla en
     * {@code /media/fotos/reportes/**} ({@code WebMvcConfig}) y, con NC-04,
     * para la sugerencia de categoria (D-08).
     *
     * @param nombreArchivo nombre simple del archivo ({@code <uuid>.<ext>})
     * @return el recurso con su nombre y fecha de modificacion, o {@code null}
     *         si el nombre no es valido o la foto no existe
     */
    Resource cargarFotoReporte(String nombreArchivo);

    /**
     * Borra una foto de perfil que el ciudadano reemplazo: ya no tiene
     * finalidad y es un dato personal (Ley N.° 29733). Nunca lanza: si no
     * se puede borrar, se registra y la operacion que la reemplazo sigue.
     *
     * @param nombreArchivo nombre simple del archivo ({@code <uuid>.<ext>})
     */
    void eliminarFotoPerfil(String nombreArchivo);

    /**
     * Borra una foto de reporte que ningun reporte llego a usar (BE-11): la
     * transaccion de creacion se revirtio, o el pedido termino en una
     * adhesion (US-09) o en un reenvio idempotente (US-06). Nunca lanza: si
     * no se puede borrar, se registra con el nombre y el objeto queda
     * huerfano; la respuesta al ciudadano no cambia.
     *
     * <p>No es para retirar la foto de un reporte publicado: hoy ningun caso
     * de uso lo hace.</p>
     *
     * @param nombreArchivo nombre simple del archivo ({@code <uuid>.<ext>})
     */
    void eliminarFotoReporte(String nombreArchivo);
}
