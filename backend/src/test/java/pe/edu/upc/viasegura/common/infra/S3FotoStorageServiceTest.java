package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.Resource;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Adaptador S3 de las fotos (DEP-12) con un {@link S3Client} simulado: a que
 * bucket va cada foto, que URL devuelve, que nombres llegan al bucket y como
 * se traducen los errores. El comportamiento contra un servicio S3 de verdad
 * lo prueba {@code S3FotoStorageServiceIT} (emulador) y, antes del primer
 * despliegue, una corrida manual contra R2 (runbook).
 */
class S3FotoStorageServiceTest {

    private static final String REPORTES = "fotos-reportes";
    private static final String PERFILES = "fotos-perfiles";
    private static final byte[] SANEADA = {(byte) 0xFF, (byte) 0xD8, 1, 2, 3};
    private static final String UUID_JPG = "0b9f1f5e-6c1a-4c55-9a77-3f5b6f2d9e10.jpg";

    private S3Client s3;
    private S3FotoStorageService storage;

    /** Cuantas veces se llamo al saneado (BE-11: la foto de reporte llega ya saneada). */
    private final AtomicInteger saneados = new AtomicInteger();

    /** Saneado de mentira: cualquier foto sale como {@link #SANEADA}. */
    private final SaneadorDeImagen saneador = foto -> {
        saneados.incrementAndGet();
        if (foto == null || foto.vacio()) {
            throw new BusinessException("La foto está vacía");
        }
        return new ArchivoSubido(SANEADA, "image/jpeg", "x.jpg");
    };

    @BeforeEach
    void crear() {
        s3 = mock(S3Client.class);
        storage = new S3FotoStorageService(saneador, s3, REPORTES, PERFILES, "/media/fotos", "/api/perfiles/fotos/");
    }

    private PutObjectRequest subidaCapturada(ArgumentCaptor<RequestBody> cuerpo) {
        ArgumentCaptor<PutObjectRequest> pedido = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(pedido.capture(), cuerpo.capture());
        return pedido.getValue();
    }

    private static byte[] bytes(RequestBody cuerpo) throws IOException {
        try (InputStream entrada = cuerpo.contentStreamProvider().newStream()) {
            return entrada.readAllBytes();
        }
    }

    @Test
    void fotoDeReporte_subeTalCualLaSaneadaAlBucketDeReportesYDevuelveLaUrlPublica() throws IOException {
        byte[] yaSaneada = {(byte) 0xFF, (byte) 0xD8, 7, 7};
        String url = storage.almacenarFotoReporteSaneada(new ArchivoSubido(yaSaneada, "image/jpeg", "a.jpg"));

        ArgumentCaptor<RequestBody> cuerpo = ArgumentCaptor.forClass(RequestBody.class);
        PutObjectRequest pedido = subidaCapturada(cuerpo);
        assertThat(pedido.bucket()).isEqualTo(REPORTES);
        assertThat(pedido.key()).matches("[0-9a-f-]{36}\\.jpg");
        assertThat(pedido.contentType()).isEqualTo("image/jpeg");
        assertThat(pedido.contentLength()).isEqualTo(yaSaneada.length);
        // BE-11: los mismos bytes, sin volver a sanearlos (D-08).
        assertThat(bytes(cuerpo.getValue())).isEqualTo(yaSaneada);
        assertThat(saneados).hasValue(0);
        // La misma URL que con el disco local.
        assertThat(url).isEqualTo("/media/fotos/reportes/" + pedido.key());
    }

    @Test
    void fotoDePerfil_subeLaSaneadaAlBucketDePerfilesYDevuelveLaUrlAutenticada() throws IOException {
        String url = storage.almacenarFotoPerfil(new ArchivoSubido(new byte[] {9}, "image/png", "yo.png"));

        ArgumentCaptor<RequestBody> cuerpo = ArgumentCaptor.forClass(RequestBody.class);
        PutObjectRequest pedido = subidaCapturada(cuerpo);
        assertThat(pedido.bucket()).isEqualTo(PERFILES);
        assertThat(bytes(cuerpo.getValue())).isEqualTo(SANEADA);
        assertThat(saneados).hasValue(1);
        assertThat(url).isEqualTo("/api/perfiles/fotos/" + pedido.key());
    }

    @Test
    void unaFotoDePerfilQueNoPasaElSaneado_noLlegaAlBucket() {
        assertThatThrownBy(() -> storage.almacenarFotoPerfil(new ArchivoSubido(new byte[0], null, "a.png")))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(s3);
    }

    @Test
    void unaFotoDeReporteNulaOVacia_esUnErrorDeProgramacionYNoLlegaAlBucket() {
        assertThatThrownBy(() -> storage.almacenarFotoReporteSaneada(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.almacenarFotoReporteSaneada(new ArchivoSubido(new byte[0], null, "a.jpg")))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(s3);
    }

    @Test
    void siElBucketNoResponde_alSubirEs503ConMensaje() {
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(SdkClientException.create("timeout"));

        assertThatThrownBy(() -> storage.almacenarFotoReporteSaneada(new ArchivoSubido(SANEADA, null, "a.jpg")))
                .isInstanceOf(ServicioNoDisponibleException.class)
                .hasMessage(S3FotoStorageService.MENSAJE_SIN_ALMACENAMIENTO);
    }

    @Test
    void cargarFotoReporte_leeDelBucketDeReportesConNombreYFecha() throws IOException {
        Instant modificada = Instant.parse("2026-10-21T15:00:00Z");
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(ResponseBytes.fromByteArray(
                GetObjectResponse.builder().lastModified(modificada).build(), SANEADA));

        Resource recurso = storage.cargarFotoReporte(UUID_JPG);

        ArgumentCaptor<GetObjectRequest> pedido = ArgumentCaptor.forClass(GetObjectRequest.class);
        verify(s3).getObjectAsBytes(pedido.capture());
        assertThat(pedido.getValue().bucket()).isEqualTo(REPORTES);
        assertThat(pedido.getValue().key()).isEqualTo(UUID_JPG);
        assertThat(recurso.getFilename()).isEqualTo(UUID_JPG);
        assertThat(recurso.lastModified()).isEqualTo(modificada.toEpochMilli());
        assertThat(recurso.contentLength()).isEqualTo(SANEADA.length);
        assertThat(recurso.getContentAsByteArray()).isEqualTo(SANEADA);
    }

    @Test
    void cargarFotoPerfil_leeDelBucketDePerfiles() throws IOException {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(ResponseBytes.fromByteArray(
                GetObjectResponse.builder().build(), SANEADA));

        Resource recurso = storage.cargarFotoPerfil(UUID_JPG);

        ArgumentCaptor<GetObjectRequest> pedido = ArgumentCaptor.forClass(GetObjectRequest.class);
        verify(s3).getObjectAsBytes(pedido.capture());
        assertThat(pedido.getValue().bucket()).isEqualTo(PERFILES);
        assertThat(recurso).isNotNull();
        // Sin fecha en la respuesta: Spring no envia Last-Modified.
        assertThat(recurso.lastModified()).isEqualTo(-1);
    }

    @Test
    void objetoInexistente_esNull() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().statusCode(404).message("no").build());

        assertThat(storage.cargarFotoReporte(UUID_JPG)).isNull();
    }

    @Test
    void un404SinCodigoNoSuchKey_tambienEsNull() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(404).message("no").build());

        assertThat(storage.cargarFotoPerfil(UUID_JPG)).isNull();
    }

    @Test
    void siElBucketFalla_alLeerEs503() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(500).message("caido").build());

        assertThatThrownBy(() -> storage.cargarFotoReporte(UUID_JPG))
                .isInstanceOf(ServicioNoDisponibleException.class)
                .hasMessage(S3FotoStorageService.MENSAJE_SIN_LECTURA);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "../perfiles/" + UUID_JPG, "perfiles/" + UUID_JPG, "foto.jpg",
            "0B9F1F5E-6C1A-4C55-9A77-3F5B6F2D9E10.jpg", UUID_JPG + ".exe", "0b9f1f5e-6c1a-4c55-9a77-3f5b6f2d9e10.gif"})
    void unNombreQueNoEsUuidConExtension_noLlegaAlBucket(String nombre) {
        assertThat(storage.cargarFotoReporte(nombre)).isNull();
        assertThat(storage.cargarFotoPerfil(nombre)).isNull();
        storage.eliminarFotoPerfil(nombre);
        storage.eliminarFotoReporte(nombre);
        verifyNoInteractions(s3);
    }

    @Test
    void eliminarFotoPerfil_borraDelBucketDePerfilesYNoLanzaSiFalla() {
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(SdkClientException.create("caido"));

        storage.eliminarFotoPerfil(UUID_JPG);

        ArgumentCaptor<DeleteObjectRequest> pedido = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3).deleteObject(pedido.capture());
        assertThat(pedido.getValue().bucket()).isEqualTo(PERFILES);
        assertThat(pedido.getValue().key()).isEqualTo(UUID_JPG);
        verify(s3, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    void eliminarFotoReporte_borraDelBucketDeReportesYNoLanzaSiFalla() {
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(SdkClientException.create("caido"));

        storage.eliminarFotoReporte(UUID_JPG);

        ArgumentCaptor<DeleteObjectRequest> pedido = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3).deleteObject(pedido.capture());
        assertThat(pedido.getValue().bucket()).isEqualTo(REPORTES);
        assertThat(pedido.getValue().key()).isEqualTo(UUID_JPG);
    }

    @Test
    void elMismoBucketParaLasDosVisibilidades_noArranca() {
        assertThatThrownBy(() -> new S3FotoStorageService(saneador, s3, "fotos", "fotos", "/media/fotos", "/x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("buckets distintos");
    }

    @Test
    void sinBucket_noArrancaYNombraLaVariable() {
        assertThatThrownBy(() -> new S3FotoStorageService(saneador, s3, " ", PERFILES, "/media/fotos", "/x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOTOS_S3_BUCKET_REPORTES");
    }

    @Test
    void sinEndpointNiCredenciales_noArrancaYNombraLaVariable() {
        assertThatThrownBy(() -> new S3FotoStorageService(saneador, "", "auto", REPORTES, PERFILES,
                "id", "secreto", "/media/fotos", "/x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOTOS_S3_ENDPOINT");
        assertThatThrownBy(() -> new S3FotoStorageService(saneador, "https://cuenta.r2.cloudflarestorage.com",
                "auto", REPORTES, PERFILES, "id", "", "/media/fotos", "/x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOTOS_S3_SECRET_ACCESS_KEY");
    }

    @Test
    void endpointQueNoEsHttp_noArranca() {
        assertThatThrownBy(() -> S3FotoStorageService.crearCliente("ftp://cuenta", "auto", "id", "secreto"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOTOS_S3_ENDPOINT");
    }

    @Test
    void conTodaLaConfiguracion_armaElClienteSinConectarse() {
        // El cliente no se conecta al construirse: el arranque no depende de R2.
        S3FotoStorageService real = new S3FotoStorageService(saneador, "https://cuenta.r2.cloudflarestorage.com",
                "auto", REPORTES, PERFILES, "id", "secreto", "/media/fotos", "/api/perfiles/fotos");
        real.cerrar();
    }
}
