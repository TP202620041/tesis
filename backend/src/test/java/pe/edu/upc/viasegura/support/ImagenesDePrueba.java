package pe.edu.upc.viasegura.support;

import com.twelvemonkeys.imageio.metadata.jpeg.JPEG;
import com.twelvemonkeys.imageio.metadata.jpeg.JPEGSegmentUtil;
import com.twelvemonkeys.imageio.stream.ByteArrayImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * Fotos de prueba armadas en memoria (DEP-12): imagenes reales que el
 * saneado acepta, con EXIF (GPS, fabricante y orientacion) para comprobar
 * que se borra, y archivos con encabezados falsos para los rechazos.
 */
public final class ImagenesDePrueba {

    /** Fabricante del telefono que se escribe en el EXIF: no debe salir nunca en una foto guardada. */
    public static final String MARCA_EXIF = "TelefonoSecreto";

    private ImagenesDePrueba() {
    }

    /** PNG de {@code ancho} x {@code alto}, azul con el cuadrante superior izquierdo rojo. */
    public static byte[] png(int ancho, int alto) {
        return codificar(dibujo(ancho, alto, BufferedImage.TYPE_INT_RGB), "png");
    }

    /** JPEG de {@code ancho} x {@code alto} (mismo dibujo que {@link #png}), sin EXIF. */
    public static byte[] jpeg(int ancho, int alto) {
        return codificar(dibujo(ancho, alto, BufferedImage.TYPE_3BYTE_BGR), "jpeg");
    }

    /** JPEG progresivo (marcador SOF2), como los que guardan algunas aplicaciones y la web. */
    public static byte[] jpegProgresivo(int ancho, int alto) {
        try {
            ImageWriter escritor = ImageIO.getImageWritersByFormatName("jpeg").next();
            ByteArrayOutputStream salida = new ByteArrayOutputStream();
            try (MemoryCacheImageOutputStream destino = new MemoryCacheImageOutputStream(salida)) {
                ImageWriteParam parametros = escritor.getDefaultWriteParam();
                parametros.setProgressiveMode(ImageWriteParam.MODE_DEFAULT);
                escritor.setOutput(destino);
                escritor.write(null, new IIOImage(dibujo(ancho, alto, BufferedImage.TYPE_3BYTE_BGR), null, null),
                        parametros);
            } finally {
                escritor.dispose();
            }
            return salida.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * Copia del JPEG con otras dimensiones en su marcador SOF: el encabezado
     * declara {@code ancho} x {@code alto} aunque los datos sean de una
     * imagen chica. Sirve para probar los topes sin armar imagenes enormes.
     */
    public static byte[] conDimensionesJpeg(byte[] jpeg, int ancho, int alto) {
        byte[] copia = jpeg.clone();
        int i = 2;
        while (i + 3 < copia.length) {
            int marcador = copia[i + 1] & 0xFF;
            int largo = ((copia[i + 2] & 0xFF) << 8) | (copia[i + 3] & 0xFF);
            if (marcador >= 0xC0 && marcador <= 0xCF && marcador != 0xC4 && marcador != 0xC8 && marcador != 0xCC) {
                // FF Cn, largo(2), precision(1), alto(2), ancho(2)
                copia[i + 5] = (byte) (alto >> 8);
                copia[i + 6] = (byte) alto;
                copia[i + 7] = (byte) (ancho >> 8);
                copia[i + 8] = (byte) ancho;
                return copia;
            }
            i += 2 + largo;
        }
        throw new IllegalArgumentException("JPEG sin marcador SOF");
    }

    /**
     * Encabezado de un WEBP extendido ({@code VP8X}) de {@code ancho} x
     * {@code alto} con canal alfa ({@code ALPH}, cuyo primer byte lleva la
     * {@code compresion}: 0 sin comprimir, 1 sin perdida) y un {@code VP8 }
     * con perdida sin datos de imagen validos.
     */
    public static byte[] webpConAlfa(int ancho, int alto, int compresion) {
        ByteBuffer webp = ByteBuffer.allocate(12 + 18 + 24 + 40).order(ByteOrder.LITTLE_ENDIAN);
        webp.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(4 + 18 + 24 + 40);
        webp.put("WEBP".getBytes(StandardCharsets.US_ASCII));
        // VP8X: banderas (0x10 = alfa), 3 reservados, ancho-1 y alto-1 en 24 bits.
        webp.put("VP8X".getBytes(StandardCharsets.US_ASCII)).putInt(10).put((byte) 0x10)
                .put((byte) 0).put((byte) 0).put((byte) 0);
        tresBytes(webp, ancho - 1);
        tresBytes(webp, alto - 1);
        webp.put("ALPH".getBytes(StandardCharsets.US_ASCII)).putInt(16).put((byte) compresion).put(new byte[15]);
        webp.put("VP8 ".getBytes(StandardCharsets.US_ASCII)).putInt(32).put(new byte[32]);
        return webp.array();
    }

    private static void tresBytes(ByteBuffer b, int valor) {
        b.put((byte) valor).put((byte) (valor >> 8)).put((byte) (valor >> 16));
    }

    /** GIF real: un formato que el saneado no admite aunque se suba como {@code .png}. */
    public static byte[] gif(int ancho, int alto) {
        return codificar(dibujo(ancho, alto, BufferedImage.TYPE_INT_RGB), "gif");
    }

    /** PNG totalmente transparente: al sanear debe quedar blanco. */
    public static byte[] pngTransparente(int ancho, int alto) {
        return codificar(new BufferedImage(ancho, alto, BufferedImage.TYPE_INT_ARGB), "png");
    }

    /**
     * JPEG con un segmento APP1/Exif como el de un telefono: fabricante
     * ({@link #MARCA_EXIF}), orientacion y latitud GPS (12° 7' 30" S).
     */
    public static byte[] jpegConExif(int ancho, int alto, int orientacion) {
        byte[] jpeg = jpeg(ancho, alto);
        byte[] tiff = exifTiff(orientacion);
        byte[] cabecera = "Exif\0\0".getBytes(StandardCharsets.US_ASCII);
        int largo = 2 + cabecera.length + tiff.length;

        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        salida.write(jpeg, 0, 2); // SOI
        salida.write(0xFF);
        salida.write(0xE1); // APP1
        salida.write(largo >> 8);
        salida.write(largo & 0xFF);
        salida.writeBytes(cabecera);
        salida.writeBytes(tiff);
        salida.write(jpeg, 2, jpeg.length - 2);
        return salida.toByteArray();
    }

    /**
     * PNG que declara {@code ancho} x {@code alto} en su encabezado (IHDR
     * valido) pero no trae una imagen decodificable: sirve para probar que
     * el tamano se rechaza antes de decodificar.
     */
    public static byte[] pngConDimensiones(int ancho, int alto) {
        ByteBuffer ihdr = ByteBuffer.allocate(13).order(ByteOrder.BIG_ENDIAN);
        ihdr.putInt(ancho).putInt(alto).put((byte) 8).put((byte) 2).put((byte) 0).put((byte) 0).put((byte) 0);
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        salida.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
        fragmentoPng(salida, "IHDR", ihdr.array());
        fragmentoPng(salida, "IDAT", new byte[] {1, 2, 3, 4});
        fragmentoPng(salida, "IEND", new byte[0]);
        return salida.toByteArray();
    }

    /**
     * Encabezado de un WEBP sin perdida (fragmento {@code VP8L}) que declara
     * {@code ancho} x {@code alto}, sin datos de imagen.
     */
    public static byte[] webpSinPerdidaConDimensiones(int ancho, int alto) {
        int bits = (ancho - 1) | (alto - 1) << 14;
        // Firma, 14 bits de ancho, 14 de alto, alfa y version; despues ceros
        // (el lector de bits de TwelveMonkeys lee de a 8 bytes).
        ByteBuffer vp8l = ByteBuffer.allocate(32).order(ByteOrder.LITTLE_ENDIAN);
        vp8l.put((byte) 0x2F).putInt(bits);
        ByteBuffer webp = ByteBuffer.allocate(12 + 8 + 32).order(ByteOrder.LITTLE_ENDIAN);
        webp.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(4 + 8 + 32);
        webp.put("WEBP".getBytes(StandardCharsets.US_ASCII));
        webp.put("VP8L".getBytes(StandardCharsets.US_ASCII)).putInt(32).put(vp8l.array());
        return webp.array();
    }

    /** {@code true} si el JPEG tiene algun segmento APP1 (Exif o XMP). */
    public static boolean tieneApp1(byte[] jpeg) {
        try (ImageInputStream entrada = new ByteArrayImageInputStream(jpeg)) {
            // Identificador null: cualquier APP1, sea Exif o XMP.
            return !JPEGSegmentUtil.readSegments(entrada, JPEG.APP1, null).isEmpty();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** {@code true} si {@code texto} aparece en los bytes. */
    public static boolean contiene(byte[] bytes, String texto) {
        return new String(bytes, StandardCharsets.ISO_8859_1).contains(texto);
    }

    public static BufferedImage leer(byte[] imagen) {
        try {
            BufferedImage leida = ImageIO.read(new java.io.ByteArrayInputStream(imagen));
            if (leida == null) {
                throw new IllegalArgumentException("No es una imagen legible");
            }
            return leida;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Azul con el cuadrante superior izquierdo (un tercio por lado) en rojo. */
    private static BufferedImage dibujo(int ancho, int alto, int tipo) {
        BufferedImage imagen = new BufferedImage(ancho, alto, tipo);
        Graphics2D g = imagen.createGraphics();
        try {
            g.setColor(Color.BLUE);
            g.fillRect(0, 0, ancho, alto);
            g.setColor(Color.RED);
            g.fillRect(0, 0, ancho / 3, alto / 3);
        } finally {
            g.dispose();
        }
        return imagen;
    }

    private static byte[] codificar(BufferedImage imagen, String formato) {
        try {
            ByteArrayOutputStream salida = new ByteArrayOutputStream();
            if (!ImageIO.write(imagen, formato, salida)) {
                throw new IllegalStateException("Sin codificador " + formato);
            }
            return salida.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void fragmentoPng(ByteArrayOutputStream salida, String tipo, byte[] datos) {
        byte[] tipoBytes = tipo.getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(tipoBytes);
        crc.update(datos);
        salida.writeBytes(ByteBuffer.allocate(4).putInt(datos.length).array());
        salida.writeBytes(tipoBytes);
        salida.writeBytes(datos);
        salida.writeBytes(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
    }

    /**
     * Estructura TIFF del EXIF (little endian): IFD0 con Make, Orientation y
     * el puntero al IFD de GPS; IFD de GPS con GPSLatitudeRef y GPSLatitude.
     */
    private static byte[] exifTiff(int orientacion) {
        byte[] marca = (MARCA_EXIF + "\0").getBytes(StandardCharsets.US_ASCII); // 16 bytes
        int ifd0 = 8;
        int datosMarca = ifd0 + 2 + 3 * 12 + 4;          // 50
        int ifdGps = datosMarca + marca.length;          // 66
        int datosLatitud = ifdGps + 2 + 2 * 12 + 4;      // 96
        ByteBuffer b = ByteBuffer.allocate(datosLatitud + 24).order(ByteOrder.LITTLE_ENDIAN);

        b.put((byte) 'I').put((byte) 'I').putShort((short) 42).putInt(ifd0);
        // IFD0: las entradas van ordenadas por etiqueta.
        b.putShort((short) 3);
        entrada(b, 0x010F, 2, marca.length, datosMarca);           // Make (ASCII)
        b.putShort((short) 0x0112).putShort((short) 3).putInt(1)   // Orientation (SHORT)
                .putShort((short) orientacion).putShort((short) 0);
        entrada(b, 0x8825, 4, 1, ifdGps);                          // GPSInfo (LONG)
        b.putInt(0);
        b.put(marca);
        // IFD de GPS.
        b.putShort((short) 2);
        b.putShort((short) 1).putShort((short) 2).putInt(2)        // GPSLatitudeRef = "S"
                .put((byte) 'S').put((byte) 0).put((byte) 0).put((byte) 0);
        entrada(b, 2, 5, 3, datosLatitud);                         // GPSLatitude (RATIONAL x3)
        b.putInt(0);
        b.putInt(12).putInt(1).putInt(7).putInt(1).putInt(30).putInt(1);
        return b.array();
    }

    private static void entrada(ByteBuffer b, int etiqueta, int tipo, int cantidad, int valor) {
        b.putShort((short) etiqueta).putShort((short) tipo).putInt(cantidad).putInt(valor);
    }
}
