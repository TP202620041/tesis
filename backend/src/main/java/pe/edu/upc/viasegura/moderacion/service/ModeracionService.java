package pe.edu.upc.viasegura.moderacion.service;

import java.util.Locale;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.common.exception.ContenidoNoPermitidoException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.moderacion.domain.CampoDeTexto;
import pe.edu.upc.viasegura.moderacion.domain.FiltroDeGroserias;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PoliticaDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;

/**
 * Revision automatica del contenido antes de publicarlo (NC-10b, D-15,
 * ARCHITECTURE.md §4.3). Lo usan {@code reportes} (creacion, edicion y
 * comentarios), {@code clasificacion} (vista previa) y {@code auth} (el nombre
 * del perfil). <b>No guarda nada</b>: ni la foto rechazada, ni el puntaje, ni
 * el texto.
 *
 * <ul>
 *   <li><b>Texto</b> ({@link #exigirTextoPermitido}): {@link FiltroDeGroserias},
 *       una regla pura sobre la lista versionada. No depende de ningun
 *       servicio. 400 {@value #CODIGO_TEXTO_NO_PERMITIDO} con el campo en
 *       {@code details} y un mensaje que no repite la palabra.</li>
 *   <li><b>Foto en la creacion</b> ({@link #exigirFotoPermitida}): el puerto
 *       {@link ModeradorDeImagen} mide la foto ya saneada y
 *       {@link PoliticaDeModeracion} decide. 400
 *       {@value #CODIGO_FOTO_NO_PERMITIDA} si se rechaza; <b>503
 *       {@value #CODIGO_MODERACION_NO_DISPONIBLE} si no se pudo revisar</b>
 *       (falla cerrada, decision del usuario del 28/10): una foto sin revisar
 *       no se publica.</li>
 *   <li><b>Foto en la vista previa</b> ({@link #fotoRechazadaEnVistaPrevia}):
 *       solo avisa. Si no se pudo revisar, {@code false}: el veredicto oficial
 *       es el de la creacion.</li>
 * </ul>
 *
 * <p><b>Sin {@code @Transactional} a proposito.</b> La llamada al servicio de
 * inferencia (hasta 1 s de espera de turno mas 3 s de llamada) no debe
 * retener una conexion del pool (D-13); quien llama lo hace antes de abrir su
 * transaccion ({@code ReporteService#crear}).</p>
 */
@Slf4j
@Service
public class ModeracionService {

    public static final String CODIGO_FOTO_NO_PERMITIDA = "FOTO_NO_PERMITIDA";
    public static final String CODIGO_TEXTO_NO_PERMITIDO = "TEXTO_NO_PERMITIDO";
    public static final String CODIGO_MODERACION_NO_DISPONIBLE = "MODERACION_NO_DISPONIBLE";

    public static final String MENSAJE_FOTO_NO_PERMITIDA = "La foto no está permitida. Toma otra.";
    public static final String MENSAJE_MODERACION_NO_DISPONIBLE = "No pudimos revisar la foto en este momento."
            + " Guarda el reporte para enviarlo después o envíalo sin foto.";

    /** El campo de la foto en {@code POST /api/reportes}, para {@code details}. */
    public static final String CAMPO_FOTO = "foto";

    private final ModeradorDeImagen moderador;
    private final FiltroDeGroserias filtro;
    private final PoliticaDeModeracion politica;

    public ModeracionService(ModeradorDeImagen moderador, FiltroDeGroserias filtro,
                             @Value("${app.moderacion.umbral:0.70}") double umbral) {
        this.moderador = moderador;
        this.filtro = filtro;
        this.politica = new PoliticaDeModeracion(umbral);
    }

    /**
     * Si las fotos se revisan. Con {@code MODERACION_TIPO=ninguna}, {@code false}:
     * toda foto se acepta, y la vista previa no sanea una foto solo para
     * moderarla.
     */
    public boolean revisaFotos() {
        return moderador.estaActivo();
    }

    /**
     * Rechaza un texto con groserias. Un texto nulo o en blanco no tiene nada
     * que revisar (si es obligatorio, lo dice otra validacion).
     *
     * <p>El log deja el campo, la entrada de la lista que coincidio y la version
     * de la lista; <b>nunca el texto</b> del ciudadano.</p>
     *
     * @throws ContenidoNoPermitidoException 400 {@value #CODIGO_TEXTO_NO_PERMITIDO}
     */
    public void exigirTextoPermitido(CampoDeTexto campo, String texto) {
        Optional<String> coincidencia = filtro.coincidencia(texto);
        if (coincidencia.isEmpty()) {
            return;
        }
        log.warn("Moderacion: texto no permitido en {}, coincide con la entrada «{}» de la lista {}",
                campo.nombreEnElPedido(), coincidencia.get(), filtro.version());
        throw new ContenidoNoPermitidoException(campo.mensaje(), CODIGO_TEXTO_NO_PERMITIDO,
                campo.nombreEnElPedido());
    }

    /**
     * El veredicto oficial sobre la foto de un reporte, al crearlo. Se llama
     * <b>sin transaccion abierta</b>, sobre la foto ya saneada y antes de
     * subirla: una foto rechazada no se guarda.
     *
     * <p>Con la moderacion apagada ({@code ninguna}) no hace nada. Si se
     * rechaza, el log deja un WARN con el usuario, el puntaje redondeado y la
     * version del modelo, para ver si alguien insiste; no se guarda nada
     * mas.</p>
     *
     * @param usuarioId quien la envia, solo para el log
     * @throws ContenidoNoPermitidoException 400 {@value #CODIGO_FOTO_NO_PERMITIDA}
     * @throws ServicioNoDisponibleException 503 {@value #CODIGO_MODERACION_NO_DISPONIBLE}
     *         si no se pudo revisar: sin respuesta, sin turno a tiempo o fuera
     *         del contrato
     */
    public void exigirFotoPermitida(FotoSaneada foto, Long usuarioId) {
        if (!moderador.estaActivo()) {
            return;
        }
        PuntajeDeModeracion puntaje;
        try {
            puntaje = moderador.medir(foto, OrigenDeModeracion.CREACION);
        } catch (ModeracionNoDisponibleException e) {
            log.warn("Moderacion no disponible al crear un reporte (usuario {}): {}; 503 {}", usuarioId,
                    e.getMessage(), CODIGO_MODERACION_NO_DISPONIBLE);
            throw noDisponible();
        } catch (RuntimeException e) {
            // Un error que el adaptador no tradujo (un bug): tampoco se publica una
            // foto sin revisar.
            log.error("Error inesperado del moderador al crear un reporte (usuario {}); 503 {}", usuarioId,
                    CODIGO_MODERACION_NO_DISPONIBLE, e);
            throw noDisponible();
        }
        if (politica.rechaza(puntaje)) {
            log.warn("Moderacion: foto rechazada al crear un reporte (usuario {}), puntaje {}, modelo {}",
                    usuarioId, redondeado(puntaje), puntaje.versionModelo());
            throw new ContenidoNoPermitidoException(MENSAJE_FOTO_NO_PERMITIDA, CODIGO_FOTO_NO_PERMITIDA, CAMPO_FOTO);
        }
    }

    /**
     * El aviso de la vista previa ({@code POST /api/clasificaciones}): si la
     * foto se rechazaria al crear el reporte. No espera turno, y nunca falla:
     * si la moderacion esta apagada o no se pudo revisar, {@code false}.
     */
    public boolean fotoRechazadaEnVistaPrevia(FotoSaneada foto) {
        if (!moderador.estaActivo()) {
            return false;
        }
        PuntajeDeModeracion puntaje;
        try {
            puntaje = moderador.medir(foto, OrigenDeModeracion.VISTA_PREVIA);
        } catch (ModeracionNoDisponibleException e) {
            log.info("Moderacion no disponible en la vista previa, la foto queda sin revisar: {}", e.getMessage());
            return false;
        } catch (RuntimeException e) {
            log.warn("Error inesperado del moderador en la vista previa, la foto queda sin revisar", e);
            return false;
        }
        boolean rechazada = politica.rechaza(puntaje);
        if (rechazada) {
            log.warn("Moderacion: foto rechazada en la vista previa, puntaje {}, modelo {}", redondeado(puntaje),
                    puntaje.versionModelo());
        }
        return rechazada;
    }

    private static ServicioNoDisponibleException noDisponible() {
        return new ServicioNoDisponibleException(MENSAJE_MODERACION_NO_DISPONIBLE, CODIGO_MODERACION_NO_DISPONIBLE);
    }

    private static String redondeado(PuntajeDeModeracion puntaje) {
        return String.format(Locale.ROOT, "%.2f", puntaje.puntaje());
    }
}
