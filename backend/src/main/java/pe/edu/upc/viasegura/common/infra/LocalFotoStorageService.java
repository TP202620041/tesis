package pe.edu.upc.viasegura.common.infra;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * Almacenamiento de fotos en el filesystem local: el de desarrollo y de los
 * tests (sin credenciales ni dependencias externas). Es el adaptador por
 * defecto ({@code app.storage.tipo=local} o sin definir); en produccion las
 * fotos van a R2 con {@link S3FotoStorageService} (DEP-12). La ruta base y
 * las URL publicas son configurables (app.storage.*).
 *
 * <p>Las fotos se separan en dos subdirectorios segun su visibilidad (ver
 * {@link FotoStorageService}): {@value #SUBDIR_REPORTES} se sirve en la ruta
 * publica ({@code WebMvcConfig}, por {@link #cargarFotoReporte}),
 * {@value #SUBDIR_PERFILES} solo a traves del endpoint que verifica al
 * dueno.</p>
 *
 * <p>Toda foto pasa antes por {@link SaneadorDeImagen} (DEP-12): se guarda el
 * JPEG saneado, sin EXIF, con extension {@code .jpg}.</p>
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "app.storage.tipo", havingValue = "local", matchIfMissing = true)
public class LocalFotoStorageService implements FotoStorageService {

    static final String SUBDIR_REPORTES = "reportes";
    static final String SUBDIR_PERFILES = "perfiles";

    private final SaneadorDeImagen saneador;
    private final Path directorioReportes;
    private final Path directorioPerfiles;
    private final String urlBaseReportes;
    private final String urlBasePerfiles;

    public LocalFotoStorageService(
            SaneadorDeImagen saneador,
            @Value("${app.storage.fotos-dir:./uploads/fotos}") String fotosDir,
            @Value("${app.storage.fotos-url:/media/fotos}") String fotosUrl,
            @Value("${app.storage.fotos-perfil-url:/api/perfiles/fotos}") String fotosPerfilUrl) {

        this.saneador = saneador;
        Path base = Paths.get(fotosDir).toAbsolutePath().normalize();
        this.directorioReportes = base.resolve(SUBDIR_REPORTES);
        this.directorioPerfiles = base.resolve(SUBDIR_PERFILES);
        this.urlBaseReportes = sinBarraFinal(fotosUrl) + "/" + SUBDIR_REPORTES;
        this.urlBasePerfiles = sinBarraFinal(fotosPerfilUrl);

        crear(directorioReportes);
        crear(directorioPerfiles);
    }

    @Override
    public String almacenarFotoReporte(ArchivoSubido foto) {
        return guardar(foto, directorioReportes, urlBaseReportes);
    }

    @Override
    public String almacenarFotoPerfil(ArchivoSubido foto) {
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
        return cargar(directorioPerfiles, nombreArchivo);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Antes de DEP-12 Spring servia el directorio entero como recurso
     * estatico; ahora pasa por aqui, igual que con el adaptador S3. Mismas
     * barreras que {@link #cargarFotoPerfil}.</p>
     */
    @Override
    public Resource cargarFotoReporte(String nombreArchivo) {
        return cargar(directorioReportes, nombreArchivo);
    }

    @Override
    public void eliminarFotoPerfil(String nombreArchivo) {
        Path archivo = dentroDe(directorioPerfiles, nombreArchivo);
        if (archivo == null) {
            return;
        }
        try {
            Files.deleteIfExists(archivo);
        } catch (IOException | RuntimeException e) {
            log.warn("No se pudo borrar la foto de perfil reemplazada {}: {}", nombreArchivo, e.toString());
        }
    }

    private Resource cargar(Path directorio, String nombreArchivo) {
        Path archivo = dentroDe(directorio, nombreArchivo);
        if (archivo == null || !Files.isReadable(archivo) || Files.isDirectory(archivo)) {
            return null;
        }
        return new FileSystemResource(archivo);
    }

    /** Ruta del archivo si el nombre es simple y queda dentro del directorio; si no, {@code null}. */
    private static Path dentroDe(Path directorio, String nombreArchivo) {
        if (!StringUtils.hasText(nombreArchivo)) {
            return null;
        }
        Path destino;
        try {
            destino = directorio.resolve(nombreArchivo).normalize();
        } catch (InvalidPathException e) {
            return null;
        }
        if (!destino.startsWith(directorio) || destino.equals(directorio)) {
            log.warn("Intento de acceso fuera del directorio de fotos: {}", nombreArchivo);
            return null;
        }
        return destino;
    }

    private String guardar(ArchivoSubido foto, Path directorio, String urlBase) {
        ArchivoSubido saneada = saneador.sanear(foto);
        // El nombre lo genera el servidor (UUID): el nombre original del
        // cliente nunca llega al filesystem.
        String nombreArchivo = UUID.randomUUID() + ".jpg";
        Path destino = directorio.resolve(nombreArchivo).normalize();

        try {
            Files.write(destino, saneada.contenido());
        } catch (IOException e) {
            throw new BusinessException("No se pudo almacenar la foto");
        }
        log.debug("Foto almacenada en {}", destino);
        return urlBase + "/" + nombreArchivo;
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
