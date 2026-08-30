package pe.edu.upc.viasegura.auth.service;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.reportes.storage.FotoStorageService;

/**
 * Acceso a la foto de perfil (US-30) verificando que quien la pide sea su
 * dueno.
 */
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
     * entrada aceptada es un valor que el propio servidor genero.
     * {@code LocalFotoStorageService#cargarFotoPerfil} agrega ademas una
     * verificacion de contencion de ruta como segunda barrera.</p>
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

    /** Ultimo segmento de la URL registrada (`/api/perfiles/fotos/<uuid>.png`). */
    private static String nombreDeArchivo(String fotoUrl) {
        int ultimaBarra = fotoUrl.lastIndexOf('/');
        String nombre = ultimaBarra >= 0 ? fotoUrl.substring(ultimaBarra + 1) : fotoUrl;
        return StringUtils.hasText(nombre) ? nombre : null;
    }

    /** Solo se aceptan estos formatos al subir (LocalFotoStorageService). */
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
