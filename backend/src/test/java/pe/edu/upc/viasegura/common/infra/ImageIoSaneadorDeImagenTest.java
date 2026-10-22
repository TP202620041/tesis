package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.awt.image.BufferedImage;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * Saneado de fotos (DEP-12): sin EXIF, orientada, reducida por submuestreo,
 * determinista y con memoria acotada. Sin contexto de Spring:
 * {@code BusinessException} es la que {@code GlobalExceptionHandler}
 * traduce a 409 y {@code ServicioNoDisponibleException}, a 503.
 */
class ImageIoSaneadorDeImagenTest {

    private static final String MENSAJE_16_MP = "La foto supera el maximo de 16 megapixeles";

    private final ImageIoSaneadorDeImagen saneador = new ImageIoSaneadorDeImagen(2, Duration.ofSeconds(10));

    private ArchivoSubido sanear(byte[] bytes, String nombre) {
        return saneador.sanear(new ArchivoSubido(bytes, "image/x", nombre));
    }

    private static boolean esRojo(int rgb) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return r > 200 && g < 60 && b < 60;
    }

    private static boolean esAzul(int rgb) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return b > 200 && r < 60 && g < 60;
    }

    @Test
    void jpegConGpsEnElExif_saleSinApp1NiGpsNiFabricante() {
        byte[] original = ImagenesDePrueba.jpegConExif(300, 200, 1);
        // La foto de prueba si trae lo que hay que borrar.
        assertThat(ImagenesDePrueba.tieneApp1(original)).isTrue();
        assertThat(ImagenesDePrueba.contiene(original, ImagenesDePrueba.MARCA_EXIF)).isTrue();

        ArchivoSubido saneada = sanear(original, "IMG_0001.JPG");

        byte[] jpeg = saneada.contenido();
        assertThat(jpeg[0]).isEqualTo((byte) 0xFF);
        assertThat(jpeg[1]).isEqualTo((byte) 0xD8);
        assertThat(ImagenesDePrueba.tieneApp1(jpeg)).isFalse();
        assertThat(ImagenesDePrueba.contiene(jpeg, "Exif")).isFalse();
        assertThat(ImagenesDePrueba.contiene(jpeg, ImagenesDePrueba.MARCA_EXIF)).isFalse();
        assertThat(saneada.contentType()).isEqualTo("image/jpeg");
        assertThat(saneada.nombreOriginal()).isEqualTo("IMG_0001.jpg");
    }

    @Test
    void orientacion6_intercambiaAnchoYAltoYGiraLosPixeles() {
        // Guardada de 300x200 con el cuadrante rojo arriba a la izquierda;
        // la orientacion 6 pide girarla 90 grados en sentido horario.
        BufferedImage saneada = ImagenesDePrueba.leer(
                sanear(ImagenesDePrueba.jpegConExif(300, 200, 6), "girada.jpg").contenido());

        assertThat(saneada.getWidth()).isEqualTo(200);
        assertThat(saneada.getHeight()).isEqualTo(300);
        // El rojo pasa a la esquina superior DERECHA.
        assertThat(esRojo(saneada.getRGB(180, 30))).isTrue();
        assertThat(esAzul(saneada.getRGB(20, 30))).isTrue();
        assertThat(esAzul(saneada.getRGB(180, 280))).isTrue();
    }

    @ParameterizedTest(name = "orientacion {0}: rojo en ({3}, {4})")
    @CsvSource({
            "1, 300, 200, 30, 30",
            "2, 300, 200, 270, 30",
            "3, 300, 200, 270, 170",
            "4, 300, 200, 30, 170",
            "5, 200, 300, 30, 30",
            "6, 200, 300, 170, 30",
            "7, 200, 300, 170, 270",
            "8, 200, 300, 30, 270",
    })
    void lasOchoOrientacionesExif_dejanElCuadranteRojoDondeSeVeria(
            int orientacion, int ancho, int alto, int xRojo, int yRojo) {
        BufferedImage saneada = ImagenesDePrueba.leer(
                sanear(ImagenesDePrueba.jpegConExif(300, 200, orientacion), "o.jpg").contenido());

        assertThat(saneada.getWidth()).isEqualTo(ancho);
        assertThat(saneada.getHeight()).isEqualTo(alto);
        assertThat(esRojo(saneada.getRGB(xRojo, yRojo))).as("rojo en (%d, %d)", xRojo, yRojo).isTrue();
        // La esquina opuesta sigue azul.
        assertThat(esAzul(saneada.getRGB(ancho - 1 - xRojo, alto - 1 - yRojo))).isTrue();
    }

    @Test
    void fotoGrande_seDecodificaSubmuestreadaHasta2048PxPorLado() {
        // 4200 px: paso ceil(4200/2048) = 3, asi que queda en 1400 x 700. Un
        // reescalado "hasta 2048" daria 2048 x 1024: estas medidas prueban
        // que la imagen se redujo al decodificar, sin tenerla entera en memoria.
        BufferedImage saneada = ImagenesDePrueba.leer(
                sanear(ImagenesDePrueba.jpeg(4200, 2100), "grande.jpg").contenido());

        assertThat(saneada.getWidth()).isEqualTo(1400);
        assertThat(saneada.getHeight()).isEqualTo(700);
        assertThat(ImageIoSaneadorDeImagen.pasoDeSubmuestreo(4200, 2100)).isEqualTo(3);
    }

    @ParameterizedTest
    @CsvSource({"2048, 1536, 1", "2049, 100, 2", "4096, 3072, 2", "4097, 3000, 3", "100, 8000, 4"})
    void pasoDeSubmuestreo_dejaElLadoMayorEn2048OMenos(int ancho, int alto, int paso) {
        assertThat(ImageIoSaneadorDeImagen.pasoDeSubmuestreo(ancho, alto)).isEqualTo(paso);
        assertThat(Math.ceilDiv(Math.max(ancho, alto), paso)).isLessThanOrEqualTo(ImageIoSaneadorDeImagen.LADO_MAXIMO);
    }

    @Test
    void pngConTransparencia_saleComoJpegConFondoBlanco() {
        ArchivoSubido saneada = sanear(ImagenesDePrueba.pngTransparente(50, 40), "logo.png");

        BufferedImage imagen = ImagenesDePrueba.leer(saneada.contenido());
        assertThat(saneada.nombreOriginal()).isEqualTo("logo.jpg");
        assertThat(imagen.getWidth()).isEqualTo(50);
        assertThat(imagen.getRGB(25, 20) & 0xFFFFFF).isGreaterThan(0xF0F0F0);
    }

    @Test
    void mismosBytes_mismaSalida() {
        byte[] original = ImagenesDePrueba.jpegConExif(640, 480, 6);

        byte[] primera = sanear(original, "a.jpg").contenido();
        byte[] segunda = sanear(original.clone(), "b.jpg").contenido();

        // D-08: la sugerencia de categoria de la vista previa y la oficial
        // ven la misma entrada.
        assertThat(segunda).isEqualTo(primera);
        assertThat(sanear(ImagenesDePrueba.png(640, 480), "c.png").contenido())
                .isEqualTo(sanear(ImagenesDePrueba.png(640, 480), "d.png").contenido());
    }

    @Test
    void bytesQueNoSonImagen_esBusinessExceptionDeFormato() {
        assertThatThrownBy(() -> sanear("esto no es una foto".getBytes(), "bache.jpg"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ImageIoSaneadorDeImagen.MENSAJE_INVALIDA)
                .hasMessageStartingWith("Formato de foto no permitido");
    }

    @Test
    void unGifConExtensionPng_seRechazaPorSuContenido() {
        assertThatThrownBy(() -> sanear(ImagenesDePrueba.gif(20, 20), "foto.png"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ImageIoSaneadorDeImagen.MENSAJE_INVALIDA);
    }

    @Test
    void unaImagenRotaTrasElEncabezado_esBusinessExceptionNoUnError500() {
        // IHDR valido de 10x10 y datos que no se pueden descomprimir.
        assertThatThrownBy(() -> sanear(ImagenesDePrueba.pngConDimensiones(10, 10), "rota.png"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ImageIoSaneadorDeImagen.MENSAJE_INVALIDA);
    }

    @Test
    void masDe40Megapixeles_seRechazaSinDecodificar() {
        // 8000 x 5001 = 40,008 MP. El archivo no trae imagen decodificable:
        // si se intentara decodificar, el error seria el de formato.
        assertThatThrownBy(() -> sanear(ImagenesDePrueba.pngConDimensiones(8000, 5001), "enorme.png"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto supera el maximo de 40 megapixeles");
    }

    @Test
    void webpSinPerdidaDeMasDe16Megapixeles_seRechazaSinDecodificar() {
        // Su decodificador arma la imagen entera: el tope baja a 16 MP.
        byte[] webp = ImagenesDePrueba.webpSinPerdidaConDimensiones(5000, 4000);
        assertThat(ImageIoSaneadorDeImagen.esWebpSinSubmuestreo(webp)).isTrue();

        assertThatThrownBy(() -> sanear(webp, "grande.webp"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(MENSAJE_16_MP);
    }

    @Test
    void webpConAlfaSinPerdidaDeMasDe16Megapixeles_seRechazaSinDecodificar() {
        // Con perdida (VP8), pero su canal alfa comprimido sin perdida se
        // decodifica entero en un raster de 4 bytes por pixel.
        byte[] webp = ImagenesDePrueba.webpConAlfa(5000, 4000, 1);
        assertThat(ImageIoSaneadorDeImagen.esWebpSinSubmuestreo(webp)).isTrue();

        assertThatThrownBy(() -> sanear(webp, "transparente.webp"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(MENSAJE_16_MP);
    }

    @Test
    void webpConAlfaSinComprimir_conservaElTopeDe40Megapixeles() {
        byte[] webp = ImagenesDePrueba.webpConAlfa(5000, 4000, 0);
        assertThat(ImageIoSaneadorDeImagen.esWebpSinSubmuestreo(webp)).isFalse();

        // 20 MP pasan el tope; el archivo no trae una imagen decodificable,
        // asi que termina en el error de formato, no en el de tamano.
        assertThat(catchThrowable(() -> sanear(webp, "transparente.webp")))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ImageIoSaneadorDeImagen.MENSAJE_INVALIDA);
    }

    @Test
    void jpegProgresivo_seSaneaYSeReconoceComoNoSecuencial() {
        byte[] progresivo = ImagenesDePrueba.jpegProgresivo(300, 200);
        assertThat(ImageIoSaneadorDeImagen.esJpegSecuencial(progresivo)).isFalse();
        assertThat(ImageIoSaneadorDeImagen.esJpegSecuencial(ImagenesDePrueba.jpeg(300, 200))).isTrue();
        assertThat(ImageIoSaneadorDeImagen.esJpegSecuencial(ImagenesDePrueba.jpegConExif(300, 200, 6))).isTrue();

        BufferedImage saneada = ImagenesDePrueba.leer(sanear(progresivo, "web.jpg").contenido());

        assertThat(saneada.getWidth()).isEqualTo(300);
        assertThat(saneada.getHeight()).isEqualTo(200);
    }

    @Test
    void jpegProgresivoDeMasDe16Megapixeles_seRechazaSinDecodificar() {
        // La libreria nativa del JDK guardaria los coeficientes de toda la
        // imagen fuera del heap: el tope baja a 16 MP.
        byte[] progresivo = ImagenesDePrueba.conDimensionesJpeg(ImagenesDePrueba.jpegProgresivo(300, 200), 5000, 4000);

        assertThatThrownBy(() -> sanear(progresivo, "web.jpg"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(MENSAJE_16_MP);
    }

    @Test
    void jpegSecuencialDe20Megapixeles_noSeRechazaPorTamano() {
        // El mismo encabezado de 5000 x 4000 en un JPEG secuencial pasa el
        // tope (40 MP): lo que pase despues depende de los datos, pero nunca
        // es el rechazo por megapixeles.
        byte[] secuencial = ImagenesDePrueba.conDimensionesJpeg(ImagenesDePrueba.jpeg(300, 200), 5000, 4000);
        assertThat(ImageIoSaneadorDeImagen.esJpegSecuencial(secuencial)).isTrue();

        Throwable error = catchThrowable(() -> sanear(secuencial, "camara.jpg"));

        assertThat(error == null ? "" : error.getMessage()).doesNotContain("megapixeles");
    }

    @Test
    void jpegSinMarcadorSof_seTrataConElTopePrudente() {
        byte[] soloEncabezado = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDA, 0, 2};
        assertThat(ImageIoSaneadorDeImagen.esJpegSecuencial(soloEncabezado)).isFalse();
        assertThat(ImageIoSaneadorDeImagen.seDecodificaEntera("jpeg", soloEncabezado)).isTrue();
        // PNG se decodifica siempre fila por fila.
        assertThat(ImageIoSaneadorDeImagen.seDecodificaEntera("png", ImagenesDePrueba.png(10, 10))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"animacion.gif", "virus.exe", "sin-extension", "foto.jpg.exe"})
    void extensionNoPermitida_esBusinessExceptionSinMirarElContenido(String nombre) {
        assertThatThrownBy(() -> sanear(ImagenesDePrueba.png(10, 10), nombre))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ImageIoSaneadorDeImagen.MENSAJE_FORMATO);
    }

    @Test
    void vaciaONula_esBusinessException() {
        assertThatThrownBy(() -> sanear(new byte[0], "a.png"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto esta vacia");
        assertThatThrownBy(() -> saneador.sanear(null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("La foto esta vacia");
    }

    @Test
    void conLosDosTurnosOcupados_laTerceraEsperaYAlVencerElPlazoEs503() {
        ImageIoSaneadorDeImagen conPlazoCorto = new ImageIoSaneadorDeImagen(2, Duration.ofMillis(300));
        // Dos saneados en curso.
        conPlazoCorto.turnos().acquireUninterruptibly(2);
        try {
            long inicio = System.nanoTime();
            assertThatThrownBy(() -> conPlazoCorto.sanear(new ArchivoSubido(ImagenesDePrueba.png(10, 10), null, "a.png")))
                    .isInstanceOf(ServicioNoDisponibleException.class)
                    .hasMessage(ImageIoSaneadorDeImagen.MENSAJE_OCUPADO);
            assertThat(Duration.ofNanos(System.nanoTime() - inicio)).isGreaterThanOrEqualTo(Duration.ofMillis(300));
        } finally {
            conPlazoCorto.turnos().release(2);
        }
        // Un rechazo no se queda con un turno.
        assertThat(conPlazoCorto.turnos().availablePermits()).isEqualTo(2);
    }

    @Test
    void siUnTurnoSeLiberaDentroDelPlazo_laFotoSeSanea() throws Exception {
        ImageIoSaneadorDeImagen conDosTurnos = new ImageIoSaneadorDeImagen(2, Duration.ofSeconds(5));
        conDosTurnos.turnos().acquireUninterruptibly(2);
        CompletableFuture<ArchivoSubido> tercera = CompletableFuture.supplyAsync(
                () -> conDosTurnos.sanear(new ArchivoSubido(ImagenesDePrueba.png(10, 10), null, "a.png")));

        TimeUnit.MILLISECONDS.sleep(200);
        assertThat(tercera).isNotDone();
        conDosTurnos.turnos().release();

        assertThat(tercera.get(5, TimeUnit.SECONDS).contentType()).isEqualTo("image/jpeg");
        conDosTurnos.turnos().release();
        assertThat(conDosTurnos.turnos().availablePermits()).isEqualTo(2);
    }

    @Test
    void sinTurnosConfigurados_noArranca() {
        assertThatThrownBy(() -> new ImageIoSaneadorDeImagen(0, Duration.ofSeconds(1)))
                .isInstanceOf(IllegalStateException.class);
    }
}
