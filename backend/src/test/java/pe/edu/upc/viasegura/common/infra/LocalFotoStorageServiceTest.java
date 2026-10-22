package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.Resource;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * Fija las validaciones del adaptador de fotos desde que recibe
 * {@link ArchivoSubido} en vez de {@code MultipartFile} (BE-10), y desde
 * DEP-12 que guarda la foto saneada y la lee por el puerto. Sin contexto de
 * Spring: {@code BusinessException} es la que el
 * {@code GlobalExceptionHandler} traduce a 409.
 */
class LocalFotoStorageServiceTest {

    private static final byte[] PNG = ImagenesDePrueba.png(40, 30);

    @TempDir
    Path base;

    private LocalFotoStorageService storage;

    @BeforeEach
    void crear() {
        storage = new LocalFotoStorageService(new ImageIoSaneadorDeImagen(2, Duration.ofSeconds(10)),
                base.toString(), "/media/fotos", "/api/perfiles/fotos");
    }

    private static String nombre(String url) {
        return url.substring(url.lastIndexOf('/') + 1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"animacion.gif", "virus.exe", "sin-extension"})
    void extensionNoPermitida_esBusinessException(String nombre) {
        assertThatThrownBy(() -> storage.almacenarFotoReporte(new ArchivoSubido(PNG, "image/png", nombre)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Formato de foto no permitido");
    }

    @Test
    void nombreNulo_esBusinessException() {
        assertThatThrownBy(() -> storage.almacenarFotoReporte(new ArchivoSubido(PNG, "image/png", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Formato de foto no permitido");
    }

    @Test
    void contenidoQueNoEsImagen_esBusinessExceptionYNoSeGuardaNada() throws IOException {
        byte[] falso = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
        assertThatThrownBy(() -> storage.almacenarFotoReporte(new ArchivoSubido(falso, "image/png", "a.png")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Formato de foto no permitido");
        try (var archivos = Files.list(base.resolve("reportes"))) {
            assertThat(archivos).isEmpty();
        }
    }

    @Test
    void contenidoVacio_esBusinessException() {
        assertThatThrownBy(() -> storage.almacenarFotoReporte(new ArchivoSubido(new byte[0], "image/png", "a.png")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto está vacía");
        assertThatThrownBy(() -> storage.almacenarFotoPerfil(null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto está vacía");
    }

    @Test
    void rutaDelClienteConMayusculas_seGuardaSaneadaComoJpgConUuid() throws IOException {
        String url = storage.almacenarFotoReporte(new ArchivoSubido(PNG, "image/png", "C:\\fotos\\a.PNG"));

        assertThat(url).startsWith("/media/fotos/reportes/").endsWith(".jpg");
        assertThat(nombre(url)).matches("[0-9a-f-]{36}\\.jpg");
        byte[] guardado = Files.readAllBytes(base.resolve("reportes").resolve(nombre(url)));
        // JPEG (FF D8), no el PNG que subio el cliente.
        assertThat(guardado[0]).isEqualTo((byte) 0xFF);
        assertThat(guardado[1]).isEqualTo((byte) 0xD8);
        assertThat(ImagenesDePrueba.leer(guardado).getWidth()).isEqualTo(40);
    }

    @Test
    void fotoConExif_seGuardaSinExif() throws IOException {
        String url = storage.almacenarFotoReporte(
                new ArchivoSubido(ImagenesDePrueba.jpegConExif(120, 80, 1), "image/jpeg", "IMG.jpg"));

        byte[] guardado = Files.readAllBytes(base.resolve("reportes").resolve(nombre(url)));
        assertThat(ImagenesDePrueba.tieneApp1(guardado)).isFalse();
        assertThat(ImagenesDePrueba.contiene(guardado, ImagenesDePrueba.MARCA_EXIF)).isFalse();
    }

    @Test
    void fotoDePerfil_vaAlDirectorioPrivadoYSuUrlAutenticada() {
        String url = storage.almacenarFotoPerfil(new ArchivoSubido(PNG, "image/jpeg", "yo.jpeg"));

        assertThat(url).startsWith("/api/perfiles/fotos/").endsWith(".jpg");
        assertThat(base.resolve("perfiles").resolve(nombre(url))).exists();
        assertThat(base.resolve("reportes").resolve(nombre(url))).doesNotExist();
        assertThat(storage.cargarFotoPerfil(nombre(url))).isNotNull();
        // Una foto de perfil no sale por la ruta publica de reportes.
        assertThat(storage.cargarFotoReporte(nombre(url))).isNull();
    }

    @Test
    void cargarFotoReporte_devuelveElArchivoConSuNombre() throws IOException {
        String url = storage.almacenarFotoReporte(new ArchivoSubido(PNG, "image/png", "a.png"));

        Resource recurso = storage.cargarFotoReporte(nombre(url));

        assertThat(recurso).isNotNull();
        assertThat(recurso.getFilename()).isEqualTo(nombre(url));
        assertThat(recurso.contentLength()).isPositive();
        assertThat(recurso.lastModified()).isPositive();
    }

    @ParameterizedTest
    @ValueSource(strings = {"../perfiles/x.jpg", "../../etc/passwd", "..", "", "reportes", "inexistente.jpg"})
    void cargarFotoReporte_fueraDelDirectorioOInexistente_esNull(String nombre) throws IOException {
        Files.writeString(base.resolve("perfiles").resolve("x.jpg"), "privada");

        assertThat(storage.cargarFotoReporte(nombre)).isNull();
    }

    @Test
    void eliminarFotoPerfil_borraSoloEseArchivoYNoSaleDelDirectorio() throws IOException {
        String url = storage.almacenarFotoPerfil(new ArchivoSubido(PNG, "image/png", "a.png"));
        Path ajeno = Files.writeString(base.resolve("reportes").resolve("ajeno.jpg"), "x");

        storage.eliminarFotoPerfil("../reportes/ajeno.jpg");
        storage.eliminarFotoPerfil(nombre(url));
        storage.eliminarFotoPerfil(nombre(url)); // ya no existe: no lanza
        storage.eliminarFotoPerfil(null);

        assertThat(base.resolve("perfiles").resolve(nombre(url))).doesNotExist();
        assertThat(ajeno).exists();
    }
}
