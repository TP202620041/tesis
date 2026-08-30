package pe.edu.upc.viasegura.reportes.storage;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

/**
 * Abstraccion del almacenamiento de fotos (US-05 reportes, US-30 perfil).
 *
 * <p>Patron Adapter: la logica de negocio depende de esta interfaz, no de
 * un proveedor concreto. Hoy se implementa en filesystem local
 * ({@link LocalFotoStorageService}); manana podria ser S3-compatible sin
 * tocar los servicios de negocio. Por eso la lectura devuelve un
 * {@link Resource} de Spring y no un {@code java.nio.file.Path}: un
 * {@code Path} ataria la interfaz al filesystem.</p>
 *
 * <p><b>Los dos tipos de foto se guardan por separado a proposito, y esa
 * separacion es de seguridad, no de orden.</b> La foto de un reporte es
 * evidencia publica: el mapa y la busqueda de reportes (US-10/US-12) no
 * exigen autenticacion y devuelven {@code fotoUrl}, asi que debe poder
 * cargarse sin token. La foto de perfil es un dato personal del ciudadano y
 * solo la puede ver su dueno. Guardarlas juntas obligaria a elegir una sola
 * politica para ambas, y cualquiera de las dos elecciones seria incorrecta
 * para la otra: o se filtran las caras de los ciudadanos, o el mapa publico
 * muestra imagenes rotas. Por eso son dos metodos distintos en vez de un
 * parametro: al escribir el codigo hay que decidir explicitamente cual es.</p>
 */
public interface FotoStorageService {

    /**
     * Almacena la foto de evidencia de un reporte (US-05).
     *
     * @return URL relativa <b>publica</b> de la foto almacenada
     */
    String almacenarFotoReporte(MultipartFile foto);

    /**
     * Almacena la foto de perfil de un ciudadano (US-30).
     *
     * @return URL relativa <b>autenticada</b>: apunta al endpoint que valida
     *         que quien la pide sea el dueno
     */
    String almacenarFotoPerfil(MultipartFile foto);

    /**
     * Carga una foto de perfil ya almacenada.
     *
     * @param nombreArchivo nombre simple del archivo, <b>ya validado contra
     *                      lo que consta en {@code usuario.foto_url}</b>: este
     *                      metodo no debe recibir texto crudo de la URL
     * @return el recurso, o {@code null} si no existe o no es legible
     */
    Resource cargarFotoPerfil(String nombreArchivo);
}
