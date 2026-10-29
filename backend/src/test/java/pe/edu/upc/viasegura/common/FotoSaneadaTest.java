package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoSaneada;

/**
 * BE-11: {@link FotoSaneada} es el tipo que separa una foto saneada de la que
 * mando el cliente. No puede estar vacia, se pasa al clasificador sin
 * recodificar y no vuelca sus bytes en un log.
 */
class FotoSaneadaTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, 1, 2};

    @Test
    void sinContenido_noSePuedeConstruir() {
        assertThatThrownBy(() -> new FotoSaneada(null, "a.jpg")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new FotoSaneada(new byte[0], "a.jpg")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void comoArchivo_sonLosMismosBytesComoJpeg() {
        ArchivoSubido archivo = new FotoSaneada(JPEG, "bache.jpg").comoArchivo();

        assertThat(archivo.contenido()).isSameAs(JPEG);
        assertThat(archivo.contentType()).isEqualTo("image/jpeg");
        assertThat(archivo.nombreOriginal()).isEqualTo("bache.jpg");
    }

    @Test
    void toString_noIncluyeLosBytes() {
        assertThat(new FotoSaneada(JPEG, "bache.jpg")).hasToString("FotoSaneada[bache.jpg, 4 bytes]");
    }
}
