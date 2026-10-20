package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/**
 * Fija las validaciones del adaptador de fotos desde que recibe
 * {@link ArchivoSubido} en vez de {@code MultipartFile} (BE-10). Sin
 * contexto de Spring: {@code BusinessException} es la que el
 * {@code GlobalExceptionHandler} traduce a 409.
 */
class LocalFotoStorageServiceTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};

    @TempDir
    Path base;

    private LocalFotoStorageService storage;

    @BeforeEach
    void crear() {
        storage = new LocalFotoStorageService(base.toString(), "/media/fotos", "/api/perfiles/fotos");
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
    void contenidoVacio_esBusinessException() {
        assertThatThrownBy(() -> storage.almacenarFotoReporte(new ArchivoSubido(new byte[0], "image/png", "a.png")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto esta vacia");
        assertThatThrownBy(() -> storage.almacenarFotoPerfil(null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto esta vacia");
    }

    @Test
    void rutaDelClienteConMayusculas_seGuardaConUuidYExtensionEnMinusculas() throws IOException {
        String url = storage.almacenarFotoReporte(new ArchivoSubido(PNG, "image/png", "C:\\fotos\\a.PNG"));

        assertThat(url).startsWith("/media/fotos/reportes/").endsWith(".png");
        String nombre = url.substring(url.lastIndexOf('/') + 1);
        assertThat(nombre).matches("[0-9a-f-]{36}\\.png");
        Path guardado = base.resolve("reportes").resolve(nombre);
        assertThat(Files.readAllBytes(guardado)).isEqualTo(PNG);
    }

    @Test
    void fotoDePerfil_vaAlDirectorioPrivadoYSuUrlAutenticada() throws IOException {
        String url = storage.almacenarFotoPerfil(new ArchivoSubido(PNG, "image/jpeg", "yo.jpeg"));

        assertThat(url).startsWith("/api/perfiles/fotos/").endsWith(".jpeg");
        String nombre = url.substring(url.lastIndexOf('/') + 1);
        assertThat(Files.readAllBytes(base.resolve("perfiles").resolve(nombre))).isEqualTo(PNG);
        assertThat(storage.cargarFotoPerfil(nombre)).isNotNull();
    }
}
