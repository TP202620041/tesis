package pe.edu.upc.viasegura.common.infra;

import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Almacenamiento de fotos en un servicio con API S3 (DEP-12): Cloudflare R2
 * en produccion y un emulador (Adobe S3Mock) en la CI. Se activa con
 * {@code app.storage.tipo=s3} ({@code FOTOS_ALMACEN=s3}); se llama por el
 * protocolo y no por el proveedor porque el mismo adaptador habla con los
 * dos (ARCHITECTURE.md 4.5).
 *
 * <p><b>Dos buckets privados</b>, uno por visibilidad (ver
 * {@link FotoStorageService}): un error de configuracion que hiciera publico
 * uno de ellos no expondria las caras de los ciudadanos, y la migracion
 * futura a una CDN consiste en publicar solo el de reportes. El arranque
 * falla si los dos nombres coinciden.</p>
 *
 * <p><b>Mismas URL que con el disco local:</b> devuelve
 * {@code /media/fotos/reportes/<uuid>.jpg} y {@code /api/perfiles/fotos/<uuid>.jpg},
 * y el backend lee del bucket para servirlas ({@code WebMvcConfig} y
 * {@code PerfilFotoController}). El navegador nunca habla con R2: sin cambio
 * de contrato ni de CSP.</p>
 *
 * <p><b>Configuracion del cliente</b> (ejemplo oficial de Cloudflare para el
 * AWS SDK for Java v2):</p>
 * <ul>
 *   <li>{@code endpointOverride} al endpoint de la cuenta y region {@code auto}
 *       (R2 la ignora, pero el SDK la exige); direccionamiento por ruta.</li>
 *   <li>{@code chunkedEncodingEnabled(false)}: sin esto {@code PutObject}
 *       falla en R2 con 403 {@code SignatureDoesNotMatch}.</li>
 *   <li>Checksums solo cuando la operacion los exige: desde la 2.30 el SDK
 *       calcula CRC32 en cada subida, y R2 tuvo un incidente con eso.</li>
 *   <li>Timeouts: 5 s por intento y 10 s por llamada, con los reintentos
 *       estandar del SDK. La foto de un reporte se sube sin transaccion
 *       abierta (BE-11), asi que una subida lenta no retiene una conexion a la
 *       base; la de perfil todavia se sube dentro de la transaccion de la
 *       edicion del perfil, y ahi el timeout acota cuanto se retiene (deuda
 *       conocida del README).</li>
 *   <li>Cliente HTTP de {@code java.net.URLConnection}: una llamada sincrona
 *       por peticion no necesita Apache ni Netty, y pesa menos en la imagen.</li>
 * </ul>
 *
 * <p>Las fotos se leen enteras a memoria: despues del saneado pesan unos
 * cientos de KB, y asi {@code contentLength()} y los pedidos de rango
 * funcionan sin una segunda llamada.</p>
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "app.storage.tipo", havingValue = "s3")
public class S3FotoStorageService implements FotoStorageService {

    static final String CONTENT_TYPE = "image/jpeg";
    static final String MENSAJE_SIN_ALMACENAMIENTO =
            "No se pudo guardar la foto en este momento. Intenta de nuevo en unos minutos.";
    static final String MENSAJE_SIN_LECTURA =
            "No se pudo leer la foto en este momento. Intenta de nuevo en unos minutos.";

    private static final Duration TIMEOUT_INTENTO = Duration.ofSeconds(5);
    private static final Duration TIMEOUT_LLAMADA = Duration.ofSeconds(10);
    private static final Duration TIMEOUT_CONEXION = Duration.ofSeconds(3);

    private final SaneadorDeImagen saneador;
    private final S3Client s3;
    private final String bucketReportes;
    private final String bucketPerfiles;
    private final String urlBaseReportes;
    private final String urlBasePerfiles;

    @Autowired
    public S3FotoStorageService(
            SaneadorDeImagen saneador,
            @Value("${app.storage.s3.endpoint:}") String endpoint,
            @Value("${app.storage.s3.region:auto}") String region,
            @Value("${app.storage.s3.bucket-reportes:}") String bucketReportes,
            @Value("${app.storage.s3.bucket-perfiles:}") String bucketPerfiles,
            @Value("${app.storage.s3.access-key-id:}") String accessKeyId,
            @Value("${app.storage.s3.secret-access-key:}") String secretAccessKey,
            @Value("${app.storage.fotos-url:/media/fotos}") String fotosUrl,
            @Value("${app.storage.fotos-perfil-url:/api/perfiles/fotos}") String fotosPerfilUrl) {
        this(saneador,
                crearCliente(
                        requerida(endpoint, "FOTOS_S3_ENDPOINT", "app.storage.s3.endpoint"),
                        requerida(region, "FOTOS_S3_REGION", "app.storage.s3.region"),
                        requerida(accessKeyId, "FOTOS_S3_ACCESS_KEY_ID", "app.storage.s3.access-key-id"),
                        requerida(secretAccessKey, "FOTOS_S3_SECRET_ACCESS_KEY", "app.storage.s3.secret-access-key")),
                bucketReportes, bucketPerfiles, fotosUrl, fotosPerfilUrl);
        log.info("Fotos en almacenamiento S3: {} (buckets {} y {})", endpoint, bucketReportes, bucketPerfiles);
    }

    /** Con un cliente ya armado: lo usan los tests unitarios con un {@link S3Client} simulado. */
    S3FotoStorageService(SaneadorDeImagen saneador, S3Client s3, String bucketReportes, String bucketPerfiles,
                         String fotosUrl, String fotosPerfilUrl) {
        this.saneador = saneador;
        this.s3 = s3;
        this.bucketReportes = requerida(bucketReportes, "FOTOS_S3_BUCKET_REPORTES", "app.storage.s3.bucket-reportes");
        this.bucketPerfiles = requerida(bucketPerfiles, "FOTOS_S3_BUCKET_PERFILES", "app.storage.s3.bucket-perfiles");
        if (this.bucketReportes.equals(this.bucketPerfiles)) {
            throw new IllegalStateException("FOTOS_S3_BUCKET_REPORTES y FOTOS_S3_BUCKET_PERFILES deben ser"
                    + " buckets distintos: las fotos de perfil no pueden compartir bucket con la evidencia publica");
        }
        this.urlBaseReportes = sinBarraFinal(fotosUrl) + "/" + LocalFotoStorageService.SUBDIR_REPORTES;
        this.urlBasePerfiles = sinBarraFinal(fotosPerfilUrl);
    }

    static S3Client crearCliente(String endpoint, String region, String accessKeyId, String secretAccessKey) {
        URI uri = URI.create(endpoint);
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) {
            throw new IllegalStateException("FOTOS_S3_ENDPOINT debe ser una URL http(s)");
        }
        return S3Client.builder()
                .endpointOverride(uri)
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .chunkedEncodingEnabled(false)
                        .build())
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .overrideConfiguration(c -> c
                        .apiCallAttemptTimeout(TIMEOUT_INTENTO)
                        .apiCallTimeout(TIMEOUT_LLAMADA))
                .httpClientBuilder(UrlConnectionHttpClient.builder()
                        .connectionTimeout(TIMEOUT_CONEXION)
                        .socketTimeout(TIMEOUT_INTENTO))
                .build();
    }

    @Override
    public String almacenarFotoReporteSaneada(ArchivoSubido fotoSaneada) {
        return guardar(LocalFotoStorageService.contenidoSaneado(fotoSaneada), bucketReportes, urlBaseReportes);
    }

    @Override
    public String almacenarFotoPerfil(ArchivoSubido foto) {
        return guardar(saneador.sanear(foto).contenido(), bucketPerfiles, urlBasePerfiles);
    }

    @Override
    public Resource cargarFotoPerfil(String nombreArchivo) {
        return cargar(bucketPerfiles, nombreArchivo);
    }

    @Override
    public Resource cargarFotoReporte(String nombreArchivo) {
        return cargar(bucketReportes, nombreArchivo);
    }

    @Override
    public void eliminarFotoPerfil(String nombreArchivo) {
        eliminar(bucketPerfiles, nombreArchivo, "la foto de perfil reemplazada");
    }

    @Override
    public void eliminarFotoReporte(String nombreArchivo) {
        eliminar(bucketReportes, nombreArchivo, "la foto de reporte sin usar");
    }

    private void eliminar(String bucket, String nombreArchivo, String queFoto) {
        if (!FotoStorageService.esNombreDeArchivoValido(nombreArchivo)) {
            return;
        }
        try {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(nombreArchivo).build());
        } catch (RuntimeException e) {
            log.warn("No se pudo borrar {} {} del bucket {}: {}", queFoto, nombreArchivo, bucket, e.toString());
        }
    }

    private String guardar(byte[] jpegSaneado, String bucket, String urlBase) {
        // El nombre lo genera el servidor (UUID): el del cliente nunca llega al bucket.
        String clave = UUID.randomUUID() + ".jpg";
        try {
            s3.putObject(PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(clave)
                            .contentType(CONTENT_TYPE)
                            .contentLength((long) jpegSaneado.length)
                            .build(),
                    RequestBody.fromBytes(jpegSaneado));
        } catch (SdkException e) {
            log.error("No se pudo subir la foto {} al bucket {}", clave, bucket, e);
            throw new ServicioNoDisponibleException(MENSAJE_SIN_ALMACENAMIENTO);
        }
        log.debug("Foto almacenada en {}/{}", bucket, clave);
        return urlBase + "/" + clave;
    }

    private Resource cargar(String bucket, String nombreArchivo) {
        // Lo que no tiene la forma <uuid>.<ext> no llega a R2.
        if (!FotoStorageService.esNombreDeArchivoValido(nombreArchivo)) {
            return null;
        }
        try {
            ResponseBytes<GetObjectResponse> objeto = s3.getObjectAsBytes(
                    GetObjectRequest.builder().bucket(bucket).key(nombreArchivo).build());
            return new FotoEnMemoria(objeto.asByteArrayUnsafe(), nombreArchivo, objeto.response().lastModified());
        } catch (NoSuchKeyException e) {
            return null;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return null;
            }
            log.error("No se pudo leer la foto {} del bucket {}", nombreArchivo, bucket, e);
            throw new ServicioNoDisponibleException(MENSAJE_SIN_LECTURA);
        } catch (SdkException e) {
            log.error("No se pudo leer la foto {} del bucket {}", nombreArchivo, bucket, e);
            throw new ServicioNoDisponibleException(MENSAJE_SIN_LECTURA);
        }
    }

    @PreDestroy
    void cerrar() {
        s3.close();
    }

    private static String requerida(String valor, String variable, String propiedad) {
        if (!StringUtils.hasText(valor)) {
            throw new IllegalStateException("Falta " + variable + " (" + propiedad + "): es obligatoria con FOTOS_ALMACEN=s3");
        }
        return valor.trim();
    }

    private static String sinBarraFinal(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    /**
     * Foto leida del bucket, con lo que Spring necesita para servirla: el
     * nombre (de ahi saca el {@code Content-Type}) y la fecha de
     * modificacion ({@code Last-Modified} y los GET condicionales).
     * {@link ByteArrayResource} no tiene ninguna de las dos.
     */
    static final class FotoEnMemoria extends ByteArrayResource {

        private final String nombre;
        private final long modificada;

        FotoEnMemoria(byte[] contenido, String nombre, Instant modificada) {
            super(contenido, "foto " + nombre);
            this.nombre = nombre;
            this.modificada = modificada != null ? modificada.toEpochMilli() : -1;
        }

        @Override
        public String getFilename() {
            return nombre;
        }

        @Override
        public long lastModified() {
            return modificada;
        }

        @Override
        public boolean equals(Object otro) {
            return otro instanceof FotoEnMemoria foto && foto.nombre.equals(nombre) && super.equals(otro);
        }

        @Override
        public int hashCode() {
            return nombre.hashCode();
        }
    }
}
