package pe.edu.upc.viasegura.reportes.service;

import java.io.IOException;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;
import pe.edu.upc.viasegura.clasificacion.service.ClasificacionService;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Sugerencia oficial de categoria de un reporte nuevo (NC-04, D-08,
 * ARCHITECTURE.md 4.3 paso 3): el backend vuelve a clasificar la foto
 * <b>guardada</b> y es la unica fuente de {@code categoria_sugerida_id},
 * {@code confianza_sugerencia} y {@code version_modelo_sugerencia}. Lo que
 * mostro la vista previa, o lo que envie el cliente, no se usa.
 *
 * <p><b>Fuera de la transaccion, como las notificaciones (D-13).</b>
 * {@code SugerenciaCategoriaListener} encola {@link #sugerir} despues del
 * commit de la creacion en el executor acotado de las sugerencias
 * ({@link AsyncConfig#EJECUTOR_SUGERENCIAS}, NC-04c), separado del de los
 * correos y avisos porque la clasificacion puede esperar hasta 10 s un turno
 * del servicio de inferencia y no debe retrasarlos; este
 * metodo no es transaccional: lee la URL de la foto (consulta corta), la
 * descarga del almacenamiento y la clasifica (I/O, sin conexion de la base
 * tomada) y recien entonces escribe en una transaccion corta
 * ({@link ReporteService#registrarSugerencia}). La creacion nunca espera al
 * clasificador ni falla por el: si algo sale mal, los campos quedan nulos y
 * el reporte sigue su curso.</p>
 *
 * <p><b>Una sola vez.</b> La escritura es un {@code UPDATE} condicionado a que
 * las tres columnas sigan nulas, asi que un segundo intento no reemplaza la
 * primera sugerencia.</p>
 *
 * <p>La foto guardada ya esta saneada (DEP-12), asi que no se vuelve a sanear:
 * el modelo ve los mismos pixeles que vio la vista previa (D-08).</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SugerenciaCategoriaService {

    private final ReporteRepository reporteRepository;
    private final FotoStorageService fotoStorageService;
    private final ClasificacionService clasificacionService;
    private final ReporteService reporteService;

    /**
     * Clasifica la foto del reporte y guarda la sugerencia, si la hay.
     *
     * <p>Corre en el executor de las sugerencias; con la cola llena la llamada lanza
     * {@code TaskRejectedException} y el listener registra la sugerencia
     * perdida. Un error inesperado escapa al manejador de {@code @Async}, que
     * lo registra (y en los IT hace fallar el test).</p>
     */
    @Async(AsyncConfig.EJECUTOR_SUGERENCIAS)
    public void sugerir(Long reporteId) {
        // NC-04c: un hilo que llega interrumpido es el executor que se destruye
        // al apagar (la tarea ya estaba tomada de la cola): no se empieza nada.
        if (Thread.currentThread().isInterrupted()) {
            log.info("Reporte {}: el executor de las sugerencias se esta apagando; se pierde su sugerencia",
                    reporteId);
            return;
        }
        // Con la clasificacion apagada (CLASIFICACION_TIPO=falso en produccion)
        // no se lee la base ni se descarga la foto para una respuesta que ya se
        // sabe vacia.
        if (!clasificacionService.estaDisponible()) {
            return;
        }
        Optional<ArchivoSubido> foto = fotoGuardada(reporteId);
        if (foto.isEmpty()) {
            return;
        }
        Optional<Sugerencia> sugerencia = clasificacionService.sugerenciaOficial(foto.get());
        if (sugerencia.isEmpty()) {
            log.debug("Reporte {}: sin sugerencia de categoria", reporteId);
            return;
        }
        if (!reporteService.registrarSugerencia(reporteId, sugerencia.get())) {
            log.info("Reporte {}: ya tenia sugerencia de categoria, no se reemplaza", reporteId);
        }
    }

    /** La foto guardada del reporte, o vacio si no tiene o no se pudo leer. */
    private Optional<ArchivoSubido> fotoGuardada(Long reporteId) {
        String nombre = FotoStorageService.nombreDeArchivo(reporteRepository.findFotoUrlById(reporteId).orElse(null));
        if (nombre == null) {
            return Optional.empty();
        }
        try {
            Resource recurso = fotoStorageService.cargarFotoReporte(nombre);
            if (recurso == null) {
                log.warn("Reporte {}: su foto {} no esta en el almacenamiento, sin sugerencia", reporteId, nombre);
                return Optional.empty();
            }
            return Optional.of(new ArchivoSubido(recurso.getContentAsByteArray(), "image/jpeg", nombre));
        } catch (IOException | ServicioNoDisponibleException e) {
            log.warn("Reporte {}: no se pudo leer su foto {}, sin sugerencia: {}", reporteId, nombre, e.toString());
            return Optional.empty();
        }
    }
}
