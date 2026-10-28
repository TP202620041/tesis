package pe.edu.upc.viasegura.clasificacion.service;

import java.util.Optional;
import java.util.concurrent.Semaphore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.clasificacion.domain.OrigenDeConsulta;
import pe.edu.upc.viasegura.clasificacion.domain.PoliticaDeSugerencia;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;
import pe.edu.upc.viasegura.clasificacion.dto.ClasificacionResponse;
import pe.edu.upc.viasegura.clasificacion.port.CategoriasClasificables;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * Sugiere la categoria de una foto (NC-04, ARCHITECTURE.md 4.3 pasos 1 y 3):
 * pide las detecciones a {@link ClasificadorDano} y aplica
 * {@link PoliticaDeSugerencia} sobre las categorias clasificables.
 *
 * <p>Dos usos:</p>
 * <ul>
 *   <li>{@link #vistaPrevia}: el ciudadano sube la foto mientras arma el
 *       reporte. No guarda nada. No espera turno de inferencia.</li>
 *   <li>{@link #sugerenciaOficial}: la que
 *       {@code reportes.service.SugerenciaCategoriaService} pide sobre la foto
 *       ya guardada, despues del commit (D-08). Puede esperar un turno de
 *       inferencia (NC-04c).</li>
 * </ul>
 *
 * <p>El clasificador recibe en cada llamada su {@link OrigenDeConsulta}: el
 * adaptador decide con eso cuanto espera un turno.</p>
 *
 * <p><b>Sin {@code @Transactional} a proposito.</b> La llamada al servicio de
 * inferencia (hasta 3 s con el adaptador HTTP de NC-04b) no debe retener una
 * conexion del pool (D-13). La unica lectura de la base, el catalogo de
 * categorias, es una consulta corta propia del adaptador.</p>
 *
 * <p><b>La IA nunca bloquea un reporte.</b> Si el clasificador falla, por la
 * razon que sea, el resultado es «sin sugerencia», nunca un error para el
 * ciudadano. Y la vista previa no le quita a la creacion de reportes los
 * turnos de saneado: ver {@link #vistaPrevia}.</p>
 */
@Slf4j
@Service
public class ClasificacionService {

    /**
     * Vistas previas saneando a la vez. El saneado admite
     * {@code app.storage.saneado.max-concurrentes} (2) en todo el servidor y lo
     * comparten las subidas de fotos; con una sola vista previa a la vez, las
     * vistas previas nunca ocupan mas de un turno y queda al menos otro para las
     * creaciones (con {@code max-concurrentes} de 2 o mas). Si las creaciones
     * ocupan todos, la vista previa que ya tiene su turno espera el del saneado
     * como cualquier subida y, sin el, responde «sin sugerencia».
     */
    static final int VISTAS_PREVIAS_SIMULTANEAS = 1;

    private final ClasificadorDano clasificador;
    private final CategoriasClasificables categorias;
    private final SaneadorDeImagen saneador;
    private final PoliticaDeSugerencia politica;
    private final Semaphore turnoDeVistaPrevia = new Semaphore(VISTAS_PREVIAS_SIMULTANEAS);

    public ClasificacionService(ClasificadorDano clasificador,
                                CategoriasClasificables categorias,
                                SaneadorDeImagen saneador,
                                @Value("${app.clasificacion.umbral:0.50}") double umbral) {
        this.clasificador = clasificador;
        this.categorias = categorias;
        this.saneador = saneador;
        this.politica = new PoliticaDeSugerencia(umbral);
    }

    /**
     * Si la clasificacion puede sugerir algo. Con {@code false} (el falso sin
     * respuesta: produccion con {@code CLASIFICACION_TIPO=falso}) nadie sanea
     * ni descarga una foto para clasificarla.
     */
    public boolean estaDisponible() {
        return clasificador.estaDisponible();
    }

    /**
     * Vista previa (W-07/W-08): sugiere una categoria para la foto que el
     * ciudadano esta por reportar, sin guardar nada.
     *
     * <p>La foto pasa antes por el mismo {@link SaneadorDeImagen} que el
     * almacenamiento: el modelo ve la imagen que vera la sugerencia oficial
     * (orientada, a 2048 px, recomprimida), y como el saneado y el modelo son
     * deterministas, la misma foto da la misma sugerencia en los dos momentos
     * (D-08). Por eso una foto que no es una imagen valida recibe el mismo 409
     * que al crear el reporte.</p>
     *
     * <p><b>La vista previa nunca compite con las subidas.</b> Tiene un turno
     * propio ({@value #VISTAS_PREVIAS_SIMULTANEAS} a la vez) que <b>no
     * espera</b>: si esta ocupado, o si el saneado no da turno a tiempo, la
     * respuesta es «sin sugerencia» y no un 503. El ciudadano elige a mano y su
     * reporte no espera a nadie. Con la clasificacion apagada
     * ({@link #estaDisponible()} en {@code false}) ni siquiera se sanea: la
     * respuesta es «sin sugerencia» aunque la foto no sea una imagen valida.</p>
     *
     * @throws IllegalArgumentException si la foto llega vacia (400)
     */
    public ClasificacionResponse vistaPrevia(ArchivoSubido foto) {
        if (foto == null || foto.vacio()) {
            throw new IllegalArgumentException("Adjunta la foto del daño para sugerir una categoría");
        }
        if (!clasificador.estaDisponible()) {
            return ClasificacionResponse.sinSugerencia();
        }
        return sanearSiHayTurno(foto)
                .flatMap(saneada -> sugerir(saneada, OrigenDeConsulta.VISTA_PREVIA))
                .map(ClasificacionResponse::de)
                .orElseGet(ClasificacionResponse::sinSugerencia);
    }

    /**
     * Sugerencia oficial para la foto <b>ya saneada</b> y guardada de un
     * reporte; no la vuelve a sanear (recomprimirla daria otros pixeles que los
     * de la vista previa). La llama la sugerencia oficial asincrona, asi que el
     * clasificador puede esperar un turno ({@link OrigenDeConsulta#SUGERENCIA_OFICIAL},
     * NC-04c).
     *
     * @return la sugerencia, o vacio si no hay una clara, la clasificacion
     *         esta apagada o el clasificador fallo (tambien sin turno a tiempo)
     */
    public Optional<Sugerencia> sugerenciaOficial(ArchivoSubido fotoSaneada) {
        return sugerir(fotoSaneada, OrigenDeConsulta.SUGERENCIA_OFICIAL);
    }

    private Optional<Sugerencia> sugerir(ArchivoSubido fotoSaneada, OrigenDeConsulta origen) {
        if (!clasificador.estaDisponible()) {
            return Optional.empty();
        }
        ResultadoDeteccion resultado;
        try {
            resultado = clasificador.detectar(fotoSaneada, origen);
        } catch (ClasificacionNoDisponibleException e) {
            log.warn("Clasificacion no disponible, sin sugerencia: {}", e.getMessage());
            return Optional.empty();
        } catch (RuntimeException e) {
            // Un error del adaptador que no tradujo (un bug, una respuesta que no
            // cumple el contrato): tampoco llega al ciudadano ni al reporte.
            log.warn("Error inesperado del clasificador, sin sugerencia", e);
            return Optional.empty();
        }
        if (resultado.detecciones().isEmpty()) {
            return Optional.empty();
        }
        return politica.aplicar(resultado, categorias.activas());
    }

    /** La foto saneada, o vacio si no hay turno de vista previa o de saneado, sin esperar el primero. */
    private Optional<ArchivoSubido> sanearSiHayTurno(ArchivoSubido foto) {
        if (!turnoDeVistaPrevia.tryAcquire()) {
            log.debug("Otra vista previa esta saneando: sin sugerencia");
            return Optional.empty();
        }
        try {
            return Optional.of(saneador.sanear(foto));
        } catch (ServicioNoDisponibleException e) {
            log.info("Vista previa sin turno de saneado, sin sugerencia: {}", e.getMessage());
            return Optional.empty();
        } finally {
            turnoDeVistaPrevia.release();
        }
    }
}
