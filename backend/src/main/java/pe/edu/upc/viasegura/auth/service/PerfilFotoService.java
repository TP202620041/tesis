package pe.edu.upc.viasegura.auth.service;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.event.FotoDePerfilReemplazadaEvent;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.port.FotoStorageService;

/**
 * Acceso a la foto de perfil (US-30) verificando que quien la pide sea su
 * dueno, y borrado de la foto reemplazada (DEP-12).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PerfilFotoService {

    private final UsuarioRepository usuarioRepository;
    private final FotoStorageService fotoStorageService;

    /** Foto lista para servir, con su tipo de contenido. */
    public record FotoPerfil(Resource recurso, String contentType) {}

    /**
     * Foto de perfil del usuario indicado, si el archivo pedido es
     * efectivamente el suyo.
     *
     * <p><b>Defensa contra path traversal.</b> El nombre que llega en la URL
     * NO se usa para tocar el disco: se usa solo para <em>comparar</em>. Se
     * lee el {@code foto_url} registrado del usuario, se extrae su nombre de
     * archivo y, si coincide con lo pedido, se carga usando <em>el nombre
     * registrado</em>. Una entrada como {@code ../../../etc/passwd} nunca
     * coincidira con un nombre UUID guardado en la base, asi que se rechaza
     * antes de llegar al filesystem. Es mas fuerte que sanear la cadena: no
     * hay que anticipar todas las formas de escaparse, porque la unica
     * entrada aceptada es un valor que el propio servidor genero. Los
     * adaptadores agregan una segunda barrera: el local verifica que la ruta
     * quede dentro del directorio de perfiles y el S3 solo acepta nombres
     * {@code <uuid>.<ext>}.</p>
     *
     * @return vacio si el usuario no tiene foto, si el archivo pedido no es
     *         el suyo, o si el archivo ya no existe en disco
     */
    @Transactional(readOnly = true)
    public Optional<FotoPerfil> fotoDelUsuario(String email, String archivoSolicitado) {
        if (!StringUtils.hasText(archivoSolicitado)) {
            return Optional.empty();
        }

        Usuario usuario = usuarioRepository.findByEmail(email).orElse(null);
        if (usuario == null || !StringUtils.hasText(usuario.getFotoUrl())) {
            return Optional.empty();
        }

        String archivoRegistrado = nombreDeArchivo(usuario.getFotoUrl());
        if (archivoRegistrado == null || !archivoRegistrado.equals(archivoSolicitado)) {
            return Optional.empty();
        }

        Resource recurso = fotoStorageService.cargarFotoPerfil(archivoRegistrado);
        if (recurso == null) {
            return Optional.empty();
        }
        return Optional.of(new FotoPerfil(recurso, contentType(archivoRegistrado)));
    }

    /**
     * Borra la foto de perfil que el ciudadano reemplazo (DEP-12). La encola
     * {@code FotoDePerfilReemplazadaListener} despues del commit.
     *
     * <p>{@code @Async} en el executor acotado ({@link AsyncConfig#EJECUTOR}) y
     * sin transaccion, como las notificaciones (D-13): el borrado en R2 es una
     * llamada HTTP que no debe correr en el hilo de la peticion ni con una
     * conexion a la base tomada. Nunca lanza: si el borrado falla, la foto
     * queda huerfana y se registra.</p>
     */
    @Async(AsyncConfig.EJECUTOR)
    public void eliminarFotoReemplazada(FotoDePerfilReemplazadaEvent evento) {
        try {
            fotoStorageService.eliminarFotoPerfil(evento.nombreArchivo());
        } catch (RuntimeException e) {
            log.warn("No se pudo borrar la foto de perfil reemplazada {} del usuario {}: {}",
                    evento.nombreArchivo(), evento.usuarioId(), e.toString());
        }
    }

    /**
     * Ultimo segmento de la URL registrada (`/api/perfiles/fotos/<uuid>.jpg`),
     * o {@code null} si no hay. Tambien lo usa {@code AuthService} para borrar
     * la foto reemplazada.
     */
    static String nombreDeArchivo(String fotoUrl) {
        if (!StringUtils.hasText(fotoUrl)) {
            return null;
        }
        int ultimaBarra = fotoUrl.lastIndexOf('/');
        String nombre = ultimaBarra >= 0 ? fotoUrl.substring(ultimaBarra + 1) : fotoUrl;
        return StringUtils.hasText(nombre) ? nombre : null;
    }

    /**
     * Por la extension del nombre registrado: desde DEP-12 siempre {@code .jpg}
     * (la foto se guarda saneada); las demas son de fotos anteriores.
     */
    private static String contentType(String nombreArchivo) {
        String extension = StringUtils.getFilenameExtension(nombreArchivo.toLowerCase());
        if (extension == null) {
            return "application/octet-stream";
        }
        return switch (extension) {
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "jpg", "jpeg" -> "image/jpeg";
            default -> "application/octet-stream";
        };
    }
}
