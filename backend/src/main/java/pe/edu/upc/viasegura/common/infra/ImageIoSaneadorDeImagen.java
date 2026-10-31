package pe.edu.upc.viasegura.common.infra;

import com.twelvemonkeys.imageio.metadata.Directory;
import com.twelvemonkeys.imageio.metadata.Entry;
import com.twelvemonkeys.imageio.metadata.jpeg.JPEG;
import com.twelvemonkeys.imageio.metadata.jpeg.JPEGSegment;
import com.twelvemonkeys.imageio.metadata.jpeg.JPEGSegmentUtil;
import com.twelvemonkeys.imageio.metadata.tiff.TIFF;
import com.twelvemonkeys.imageio.metadata.tiff.TIFFReader;
import com.twelvemonkeys.imageio.stream.ByteArrayImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * Saneado de fotos con ImageIO y los lectores de TwelveMonkeys (DEP-12):
 * decodifica, aplica la orientacion EXIF, reduce y vuelve a codificar a JPEG
 * sin metadatos. Ver el contrato en {@link SaneadorDeImagen}.
 *
 * <p><b>Memoria acotada</b> (el API corre con {@code -Xmx512m}, runbook):</p>
 * <ol>
 *   <li>Se leen las dimensiones del encabezado, sin decodificar, y se rechaza
 *       lo que pase de {@value #MAX_PIXELES} pixeles (una "bomba de
 *       descompresion": pocos bytes que se expanden a gigas), o de
 *       {@value #MAX_PIXELES_SIN_SUBMUESTREO} si el archivo es de un tipo que
 *       se decodifica entero (JPEG progresivo, WEBP sin perdida o con alfa
 *       sin perdida).</li>
 *   <li>Se decodifica <b>ya submuestreado</b>
 *       ({@code ImageReadParam#setSourceSubsampling}, con paso
 *       {@code n = ceil(lado mayor / 2048)}): el lector descarta filas y
 *       columnas al leer, asi que la imagen en memoria nunca pasa de
 *       {@value #LADO_MAXIMO} px por lado (unos 12 MB) aunque la foto tenga
 *       40 MP. Decodificar entera y despues reducir ocuparia hasta 160 MB.</li>
 *   <li>Un semaforo limita los saneados simultaneos
 *       ({@code app.storage.saneado.max-concurrentes}, 2 por defecto). Una
 *       subida espera turno hasta {@code app.storage.saneado.espera-maxima}
 *       (10 s) y, si no lo obtiene, responde 503 con un mensaje. Cada saneado
 *       en curso ocupa el archivo subido (hasta 10 MB), la imagen decodificada,
 *       la orientada y el JPEG de salida (~0,5 MB).</li>
 * </ol>
 *
 * <p><b>Por que se reduce por submuestreo y no con un reescalado suave:</b>
 * es lo que permite no tener nunca la imagen entera en memoria. El costo es
 * algo de aliasing en texturas finas, imperceptible en la evidencia de un
 * bache y sin efecto en la clasificacion (el modelo trabaja a menor
 * resolucion). El paso es entero, asi que una foto de 4100 px queda en
 * 1367 px y no en 2048.</p>
 *
 * <p><b>Determinismo</b> (D-08): mismo lector, mismo paso, transformaciones
 * exactas (giros de 90 grados con vecino mas cercano) y el mismo codificador
 * con la misma calidad. Lo fija {@code ImageIoSaneadorDeImagenTest}.</p>
 */
@Slf4j
@Component
public class ImageIoSaneadorDeImagen implements SaneadorDeImagen {

    /** Lado mayor de la foto guardada, en pixeles. */
    static final int LADO_MAXIMO = 2048;
    /** Calidad del JPEG de salida: sin diferencia visible para la evidencia de un dano. */
    static final float CALIDAD_JPEG = 0.85f;
    /** Mas pixeles que esto se rechaza sin decodificar (40 MP, la camara principal de un telefono alto). */
    static final long MAX_PIXELES = 40_000_000L;
    /**
     * Tope para lo que no se puede decodificar submuestreado
     * ({@link #seDecodificaEntera}): 16 MP. El decodificador retiene la
     * imagen entera, o todos sus coeficientes, antes de reducirla:
     * <ul>
     *   <li>JPEG progresivo, sin perdida o de cualquier otro tipo que no sea
     *       secuencial ({@code SOF0}/{@code SOF1}): la libreria nativa del JDK
     *       guarda los coeficientes DCT de toda la imagen <b>fuera del heap</b>
     *       (3 a 6 bytes por pixel; 16 MP, hasta ~96 MB), y el lector sin
     *       perdida de TwelveMonkeys no submuestrea;</li>
     *   <li>WEBP sin perdida ({@code VP8L}), animado ({@code ANMF}) o con un
     *       canal alfa comprimido sin perdida ({@code ALPH} con compresion 1):
     *       el decodificador arma un raster entero de 4 bytes por pixel
     *       (16 MP, 64 MB).</li>
     * </ul>
     * Las camaras de los telefonos producen JPEG secuencial: el tope es contra
     * abusos.
     */
    static final long MAX_PIXELES_SIN_SUBMUESTREO = 16_000_000L;

    static final String MENSAJE_VACIA = "La foto está vacía";
    static final String MENSAJE_FORMATO = "Formato de foto no permitido (usa JPG, PNG o WEBP)";
    static final String MENSAJE_INVALIDA =
            "Formato de foto no permitido: el archivo no es una imagen JPG, PNG o WEBP válida";
    static final String MENSAJE_OCUPADO =
            "Hay muchas fotos procesándose en este momento. Intenta de nuevo en unos segundos.";

    private static final Set<String> EXTENSIONES_PERMITIDAS = Set.of("jpg", "jpeg", "png", "webp");
    private static final Set<String> FORMATOS_PERMITIDOS = Set.of("jpeg", "png", "webp");

    private final Semaphore turnos;
    private final Duration esperaMaxima;

    public ImageIoSaneadorDeImagen(
            @Value("${app.storage.saneado.max-concurrentes:2}") int maxConcurrentes,
            @Value("${app.storage.saneado.espera-maxima:10s}") Duration esperaMaxima) {
        if (maxConcurrentes < 1) {
            throw new IllegalStateException("app.storage.saneado.max-concurrentes debe ser 1 o mas");
        }
        // Justo: el que llego primero sanea primero.
        this.turnos = new Semaphore(maxConcurrentes, true);
        this.esperaMaxima = esperaMaxima;
        // El registro de ImageIO es global y se llena con el classloader del
        // primer hilo que lo toca. Dentro del jar de Spring Boot conviene
        // registrar los lectores de TwelveMonkeys de forma explicita, en el
        // arranque (README de TwelveMonkeys, "Deploying the plugins in a web app").
        ImageIO.scanForPlugins();
        log.info("Saneado de fotos: hasta {} simultaneos, espera maxima {}; lectores {}",
                maxConcurrentes, esperaMaxima, lectoresRegistrados());
    }

    @Override
    public FotoSaneada sanear(ArchivoSubido foto) {
        if (foto == null || foto.vacio()) {
            throw new BusinessException(MENSAJE_VACIA);
        }
        // Primer filtro, barato y con el mismo mensaje de siempre; el
        // contenido se valida al decodificar.
        validarExtension(foto.nombreOriginal());

        esperarTurno();
        try {
            byte[] jpeg = recodificar(foto.contenido());
            return new FotoSaneada(jpeg, nombreJpg(foto.nombreOriginal()));
        } finally {
            turnos.release();
        }
    }

    /** Para los tests: ocupar los turnos simula saneados en curso. */
    Semaphore turnos() {
        return turnos;
    }

    private void esperarTurno() {
        try {
            if (!turnos.tryAcquire(esperaMaxima.toMillis(), TimeUnit.MILLISECONDS)) {
                log.warn("Saneado de foto rechazado: sin turno en {}", esperaMaxima);
                throw new ServicioNoDisponibleException(MENSAJE_OCUPADO);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServicioNoDisponibleException(MENSAJE_OCUPADO);
        }
    }

    private byte[] recodificar(byte[] contenido) {
        try (ImageInputStream entrada = new ByteArrayImageInputStream(contenido)) {
            ImageReader lector = lectorPermitido(entrada);
            String formato = formato(lector);
            try {
                lector.setInput(entrada, false, true);
                int ancho = lector.getWidth(0);
                int alto = lector.getHeight(0);
                validarDimensiones(ancho, alto, formato, contenido);

                ImageReadParam parametros = lector.getDefaultReadParam();
                int paso = pasoDeSubmuestreo(ancho, alto);
                parametros.setSourceSubsampling(paso, paso, 0, 0);
                BufferedImage decodificada = lector.read(0, parametros);

                int orientacion = "jpeg".equals(formato) ? orientacionExif(contenido) : 1;
                return codificarJpeg(orientar(decodificada, orientacion));
            } finally {
                lector.dispose();
            }
        } catch (BusinessException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            // Un archivo roto o que no es lo que dice ser es un error del
            // cliente, no del servidor: los decodificadores lanzan desde
            // IIOException hasta IndexOutOfBounds con datos corruptos.
            log.debug("Foto rechazada al decodificar: {}", e.toString());
            throw new BusinessException(MENSAJE_INVALIDA);
        }
    }

    /** El lector que reconoce el contenido (no la extension), solo si es JPEG, PNG o WEBP. */
    private static ImageReader lectorPermitido(ImageInputStream entrada) throws IOException {
        Iterator<ImageReader> lectores = ImageIO.getImageReaders(entrada);
        ImageReader elegido = null;
        while (lectores.hasNext()) {
            ImageReader lector = lectores.next();
            if (elegido == null && FORMATOS_PERMITIDOS.contains(formato(lector))) {
                elegido = lector;
            } else {
                lector.dispose();
            }
        }
        if (elegido == null) {
            throw new BusinessException(MENSAJE_INVALIDA);
        }
        return elegido;
    }

    private static String formato(ImageReader lector) throws IOException {
        String formato = lector.getFormatName().toLowerCase(Locale.ROOT);
        return "jpg".equals(formato) ? "jpeg" : formato;
    }

    private static void validarDimensiones(int ancho, int alto, String formato, byte[] contenido) {
        if (ancho <= 0 || alto <= 0) {
            throw new BusinessException(MENSAJE_INVALIDA);
        }
        long pixeles = (long) ancho * alto;
        long maximo = seDecodificaEntera(formato, contenido) ? MAX_PIXELES_SIN_SUBMUESTREO : MAX_PIXELES;
        if (pixeles > maximo) {
            throw new BusinessException("La foto supera el máximo de %d megapíxeles".formatted(maximo / 1_000_000));
        }
    }

    /** {@code n = ceil(lado mayor / 2048)}: tras submuestrear, ningun lado pasa de 2048 px. */
    static int pasoDeSubmuestreo(int ancho, int alto) {
        int ladoMayor = Math.max(ancho, alto);
        return Math.max(1, (ladoMayor + LADO_MAXIMO - 1) / LADO_MAXIMO);
    }

    /**
     * {@code true} si el decodificador de este archivo retiene la imagen
     * entera antes de submuestrear (ver {@link #MAX_PIXELES_SIN_SUBMUESTREO}).
     * PNG siempre se decodifica fila por fila.
     */
    static boolean seDecodificaEntera(String formato, byte[] contenido) {
        return switch (formato) {
            case "jpeg" -> !esJpegSecuencial(contenido);
            case "webp" -> esWebpSinSubmuestreo(contenido);
            default -> false;
        };
    }

    /**
     * {@code true} si el primer marcador SOF del JPEG es secuencial
     * ({@code SOF0} baseline o {@code SOF1} extendido): el unico que la
     * libreria del JDK decodifica fila por fila. Progresivo ({@code SOF2}),
     * sin perdida ({@code SOF3}), jerarquico o aritmetico: {@code false}. Sin
     * SOF antes de los datos ({@code SOS}): {@code false}, el tope prudente.
     *
     * <p>Recorre los segmentos desde el SOI: {@code FF xx} y, salvo los
     * marcadores sin datos, un largo de 2 bytes (big endian) que lo incluye.</p>
     */
    static boolean esJpegSecuencial(byte[] b) {
        int i = 2; // despues del SOI (FF D8)
        while (i + 3 < b.length) {
            if ((b[i] & 0xFF) != 0xFF) {
                return false;
            }
            int marcador = b[i + 1] & 0xFF;
            if (marcador == 0xFF) {
                i++; // relleno
            } else if (marcador == 0x01 || marcador == 0xD8 || (marcador >= 0xD0 && marcador <= 0xD7)) {
                i += 2; // sin datos
            } else if (esSof(marcador)) {
                return marcador == 0xC0 || marcador == 0xC1;
            } else if (marcador == 0xDA || marcador == 0xD9) {
                return false; // SOS o EOI antes de un SOF
            } else {
                i += 2 + (((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF));
            }
        }
        return false;
    }

    /** SOF0 a SOF15, sin DHT ({@code C4}), JPG ({@code C8}) ni DAC ({@code CC}). */
    private static boolean esSof(int marcador) {
        return marcador >= 0xC0 && marcador <= 0xCF && marcador != 0xC4 && marcador != 0xC8 && marcador != 0xCC;
    }

    /**
     * {@code true} si el WEBP tiene una imagen sin perdida ({@code VP8L}),
     * animada ({@code ANMF}, cuyos cuadros pueden serlo) o un canal alfa
     * comprimido sin perdida ({@code ALPH} cuyo primer byte tiene compresion
     * 1 en sus 2 bits bajos): los tres se decodifican enteros. Recorre los
     * fragmentos RIFF: {@code "RIFF" tamano "WEBP"} y luego
     * {@code fourcc(4) tamano(4, little endian) datos (rellenados a par)};
     * el {@code ALPH} siempre va antes del {@code VP8 } con perdida.
     */
    static boolean esWebpSinSubmuestreo(byte[] b) {
        long posicion = 12;
        while (posicion + 8 <= b.length) {
            int p = (int) posicion;
            String fourcc = new String(b, p, 4, StandardCharsets.US_ASCII);
            if ("VP8L".equals(fourcc) || "ANMF".equals(fourcc)) {
                return true;
            }
            if ("ALPH".equals(fourcc) && p + 8 < b.length && (b[p + 8] & 0x03) == 1) {
                return true;
            }
            if ("VP8 ".equals(fourcc)) {
                return false;
            }
            long tamano = (b[p + 4] & 0xFFL) | (b[p + 5] & 0xFFL) << 8
                    | (b[p + 6] & 0xFFL) << 16 | (b[p + 7] & 0xFFL) << 24;
            posicion += 8 + tamano + (tamano & 1);
        }
        return false;
    }

    /**
     * Orientacion EXIF (1 a 8) de un JPEG, o 1 si no hay o no se puede leer.
     * Solo JPEG: es lo que producen las camaras de los telefonos (Safari
     * convierte HEIC a JPEG al subir). Un EXIF roto no invalida la foto.
     */
    static int orientacionExif(byte[] jpeg) {
        try (ImageInputStream entrada = new ByteArrayImageInputStream(jpeg)) {
            List<JPEGSegment> exif = JPEGSegmentUtil.readSegments(entrada, JPEG.APP1, "Exif");
            if (exif.isEmpty()) {
                return 1;
            }
            byte[] tiff;
            try (InputStream datos = exif.get(0).data()) {
                // data() empieza despues de "Exif\0"; falta el byte de relleno.
                if (datos.read() < 0) {
                    return 1;
                }
                tiff = datos.readAllBytes();
            }
            Directory directorio = new TIFFReader().read(new ByteArrayImageInputStream(tiff));
            Entry etiqueta = directorio.getEntryById(TIFF.TAG_ORIENTATION);
            if (etiqueta != null && etiqueta.getValue() instanceof Number valor) {
                int orientacion = valor.intValue();
                return orientacion >= 1 && orientacion <= 8 ? orientacion : 1;
            }
            return 1;
        } catch (IOException | RuntimeException e) {
            log.debug("EXIF ilegible, se ignora la orientacion: {}", e.toString());
            return 1;
        }
    }

    /**
     * Aplica la orientacion EXIF a los pixeles y deja una imagen RGB sin
     * transparencia (fondo blanco), que es lo que acepta el codificador JPEG.
     * Si ya es RGB y no hay que girarla, se usa tal cual (sin otra copia).
     */
    static BufferedImage orientar(BufferedImage origen, int orientacion) {
        boolean rgbSinAlfa = origen.getType() == BufferedImage.TYPE_3BYTE_BGR
                || origen.getType() == BufferedImage.TYPE_INT_RGB;
        if (orientacion == 1 && rgbSinAlfa) {
            return origen;
        }
        int w = origen.getWidth();
        int h = origen.getHeight();
        boolean traspone = orientacion >= 5;
        // Matrices (m00, m10, m01, m11, m02, m12) de cada orientacion EXIF:
        // llevan el pixel (x, y) guardado a su posicion al mostrarse.
        AffineTransform transformacion = switch (orientacion) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);   // espejo horizontal
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);  // 180 grados
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);   // espejo vertical
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);    // traspuesta
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);   // 90 grados horario
            case 7 -> new AffineTransform(0, -1, -1, 0, h, w);  // traspuesta inversa
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, w);   // 90 grados antihorario
            default -> new AffineTransform();
        };
        BufferedImage destino = new BufferedImage(traspone ? h : w, traspone ? w : h, BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D g = destino.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, destino.getWidth(), destino.getHeight());
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
            g.drawImage(origen, transformacion, null);
        } finally {
            g.dispose();
        }
        return destino;
    }

    /** JPEG de calidad {@value #CALIDAD_JPEG} sin metadatos (solo el JFIF minimo). */
    private static byte[] codificarJpeg(BufferedImage imagen) throws IOException {
        Iterator<ImageWriter> escritores = ImageIO.getImageWritersByFormatName("jpeg");
        if (!escritores.hasNext()) {
            throw new IllegalStateException("No hay codificador JPEG en ImageIO");
        }
        ImageWriter escritor = escritores.next();
        ByteArrayOutputStream salida = new ByteArrayOutputStream(512 * 1024);
        try (MemoryCacheImageOutputStream destino = new MemoryCacheImageOutputStream(salida)) {
            ImageWriteParam parametros = escritor.getDefaultWriteParam();
            parametros.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            parametros.setCompressionQuality(CALIDAD_JPEG);
            escritor.setOutput(destino);
            // Metadatos null: el codificador no copia nada de la foto original.
            escritor.write(null, new IIOImage(imagen, null, null), parametros);
        } finally {
            escritor.dispose();
        }
        return salida.toByteArray();
    }

    private static void validarExtension(String nombreOriginal) {
        String extension = StringUtils.getFilenameExtension(
                nombreOriginal == null ? "" : nombreOriginal.toLowerCase(Locale.ROOT));
        if (extension == null || !EXTENSIONES_PERMITIDAS.contains(extension)) {
            throw new BusinessException(MENSAJE_FORMATO);
        }
    }

    /** Nombre del cliente con extension {@code .jpg}; nunca llega al almacenamiento. */
    private static String nombreJpg(String nombreOriginal) {
        String nombre = nombreOriginal == null ? "" : nombreOriginal;
        nombre = nombre.substring(Math.max(nombre.lastIndexOf('/'), nombre.lastIndexOf('\\')) + 1);
        String base = StringUtils.stripFilenameExtension(nombre);
        return (StringUtils.hasText(base) ? base : "foto") + ".jpg";
    }

    /** Para el log de arranque: que lector atiende cada formato (TwelveMonkeys o el del JDK). */
    private static List<String> lectoresRegistrados() {
        List<String> lectores = new ArrayList<>();
        for (String formato : List.of("jpeg", "png", "webp")) {
            Iterator<ImageReader> it = ImageIO.getImageReadersByFormatName(formato);
            if (it.hasNext()) {
                ImageReader lector = it.next();
                lectores.add(formato + "=" + lector.getClass().getName());
                lector.dispose();
            } else {
                lectores.add(formato + "=NINGUNO");
            }
        }
        return lectores;
    }
}
