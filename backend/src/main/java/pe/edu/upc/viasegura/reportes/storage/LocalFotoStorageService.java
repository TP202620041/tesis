package pe.edu.upc.viasegura.reportes.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.upc.viasegura.common.exception.BusinessException;

/**
 * Almacenamiento de fotos en el filesystem local. Elegido para el entorno
 * academico/local: sin credenciales ni dependencias externas. La ruta base
 * y las URL publicas son configurables (app.storage.*).
 *
 * <p>Las fotos se separan en dos subdirectorios segun su visibilidad (ver
 * {@link FotoStorageService}): {@value #SUBDIR_REPORTES} se sirve como
 * recurso estatico publico, {@value #SUBDIR_PERFILES} solo a traves del
 * endpoint que verifica al dueno.</p>
 */
@Slf4j
@Service
public class LocalFotoStorageService implements FotoStorageService {

    private static final Set<String> EXTENSIONES_PERMITIDAS = Set.of("jpg", "jpeg", "png", "webp");

    static final String SUBDIR_REPORTES = "reportes";
    static final String SUBDIR_PERFILES = "perfiles";

    private final Path directorioReportes;
    private final Path directorioPerfiles;
    private final String urlBaseReportes;
    private final String urlBasePerfiles;

    public LocalFotoStorageService(
            @Value("${app.storage.fotos-dir:./uploads/fotos}") String fotosDir,
            @Value("${app.storage.fotos-url:/media/fotos}") String fotosUrl,
            @Value("${app.storage.fotos-perfil-url:/api/perfiles/fotos}") String fotosPerfilUrl) {

        Path base = Paths.get(fotosDir).toAbsolutePath().normalize();
        this.directorioReportes = base.resolve(SUBDIR_REPORTES);
        this.directorioPerfiles = base.resolve(SUBDIR_PERFILES);
        this.urlBaseReportes = sinBarraFinal(fotosUrl) + "/" + SUBDIR_REPORTES;
        this.urlBasePerfiles = sinBarraFinal(fotosPerfilUrl);

        crear(directorioReportes);
        crear(directorioPerfiles);
    }

    @Override
    public String almacenarFotoReporte(MultipartFile foto) {
        return guardar(foto, directorioReportes, urlBaseReportes);
    }

    @Override
    public String almacenarFotoPerfil(MultipartFile foto) {
        return guardar(foto, directorioPerfiles, urlBasePerfiles);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Segunda barrera contra path traversal: aunque quien llama ya debe
     * haber validado el nombre contra {@code usuario.foto_url}, aqui se
     * normaliza la ruta resuelta y se verifica que siga dentro del
     * directorio de perfiles. Una entrada como {@code ../../etc/passwd}
     * saldria del directorio al normalizarse y se rechaza sin tocar disco.</p>
     */
    @Override
    public Resource cargarFotoPerfil(String nombreArchivo) {
        if (!StringUtils.hasText(nombreArchivo)) {
            return null;
        }
        Path destino = directorioPerfiles.resolve(nombreArchivo).normalize();
        if (!destino.startsWith(directorioPerfiles)) {
            log.warn("Intento de acceso fuera del directorio de perfiles: {}", nombreArchivo);
            return null;
        }
        if (!Files.isReadable(destino) || Files.isDirectory(destino)) {
            return null;
        }
        return new FileSystemResource(destino);
    }

    private String guardar(MultipartFile foto, Path directorio, String urlBase) {
        if (foto == null || foto.isEmpty()) {
            throw new BusinessException("La foto esta vacia");
        }
        String extension = extensionValida(foto.getOriginalFilename());
        // El nombre lo genera el servidor (UUID): el nombre original del
        // cliente nunca llega al filesystem, solo se usa su extension.
        String nombreArchivo = UUID.randomUUID() + "." + extension;
        Path destino = directorio.resolve(nombreArchivo).normalize();

        try {
            Files.copy(foto.getInputStream(), destino, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new BusinessException("No se pudo almacenar la foto");
        }
        log.debug("Foto almacenada en {}", destino);
        return urlBase + "/" + nombreArchivo;
    }

    private String extensionValida(String nombreOriginal) {
        String extension = StringUtils.getFilenameExtension(
                nombreOriginal == null ? "" : nombreOriginal.toLowerCase());
        if (extension == null || !EXTENSIONES_PERMITIDAS.contains(extension)) {
            throw new BusinessException("Formato de foto no permitido (use JPG, PNG o WEBP)");
        }
        return extension;
    }

    private static String sinBarraFinal(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static void crear(Path directorio) {
        try {
            Files.createDirectories(directorio);
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo crear el directorio de fotos: " + directorio, e);
        }
    }
}
