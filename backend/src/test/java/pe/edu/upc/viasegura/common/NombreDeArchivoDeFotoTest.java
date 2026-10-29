package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.common.port.FotoStorageService;

/**
 * {@link FotoStorageService#nombreDeArchivo}: de la URL que devolvio un
 * {@code almacenar…} al nombre que se pasa a cargar o borrar. Lo usan la
 * sugerencia oficial (NC-04) y el borrado de la foto sin usar (BE-11), asi
 * que lo que no tenga la forma de un archivo generado por el servidor no debe
 * llegar al almacenamiento.
 */
class NombreDeArchivoDeFotoTest {

    private static final String UUID = "0b9f1f5e-6c1a-4c55-9a77-3f5b6f2d9e10";

    @ParameterizedTest
    @CsvSource({
            "/media/fotos/reportes/" + UUID + ".jpg, " + UUID + ".jpg",
            "/api/perfiles/fotos/" + UUID + ".png, " + UUID + ".png",
            UUID + ".jpg, " + UUID + ".jpg"
    })
    void deUnaUrlDelServidor_esSuUltimoSegmento(String url, String nombre) {
        assertThat(FotoStorageService.nombreDeArchivo(url)).isEqualTo(nombre);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "/media/fotos/reportes/", "/media/fotos/reportes/../x.jpg",
            "/media/fotos/reportes/foto.jpg", "/media/fotos/reportes/" + UUID + ".jpg.exe",
            "/media/fotos/reportes/" + UUID + ".gif"})
    void loQueNoEsUnArchivoDelServidor_esNull(String url) {
        assertThat(FotoStorageService.nombreDeArchivo(url)).isNull();
    }
}
