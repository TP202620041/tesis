package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.scheduling.annotation.Async;
import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;
import pe.edu.upc.viasegura.clasificacion.service.ClasificacionService;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.reportes.service.ReporteService;
import pe.edu.upc.viasegura.reportes.service.SugerenciaCategoriaService;

/**
 * Sugerencia oficial (NC-04) en los caminos que la suite de IT no alcanza con
 * el disco local: la foto ya no esta, el almacenamiento externo no responde o
 * la URL guardada no es un nombre del servidor. En todos, sin sugerencia y sin
 * error: la IA nunca rompe nada del reporte.
 */
class SugerenciaCategoriaServiceTest {

    private static final String NOMBRE = "3f2a8c1e-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg";
    private static final Sugerencia BACHE = new Sugerencia(1L, "Bache", new BigDecimal("0.870"), "falso-0");

    private final ReporteRepository reporteRepository = mock(ReporteRepository.class);
    private final FotoStorageService fotos = mock(FotoStorageService.class);
    private final ClasificacionService clasificacion = mock(ClasificacionService.class);
    private final ReporteService reporteService = mock(ReporteService.class);
    private final SugerenciaCategoriaService servicio =
            new SugerenciaCategoriaService(reporteRepository, fotos, clasificacion, reporteService);

    @BeforeEach
    void clasificacionEncendida() {
        when(clasificacion.estaDisponible()).thenReturn(true);
    }

    private void conFoto(String url) {
        when(reporteRepository.findFotoUrlById(42L)).thenReturn(Optional.ofNullable(url));
    }

    @Test
    void conFotoYSugerencia_laGuardaConLaFotoTalCual() {
        conFoto("/media/fotos/reportes/" + NOMBRE);
        when(fotos.cargarFotoReporte(NOMBRE)).thenReturn(new ByteArrayResource(new byte[] {7, 7, 7}));
        when(clasificacion.sugerenciaOficial(any())).thenReturn(Optional.of(BACHE));
        when(reporteService.registrarSugerencia(42L, BACHE)).thenReturn(true);

        servicio.sugerir(42L);

        ArgumentCaptor<ArchivoSubido> foto = ArgumentCaptor.forClass(ArchivoSubido.class);
        verify(clasificacion).sugerenciaOficial(foto.capture());
        assertThat(foto.getValue().contenido()).containsExactly(7, 7, 7);
        verify(reporteService).registrarSugerencia(42L, BACHE);
    }

    @Test
    void siYaTeniaSugerencia_noFalla() {
        conFoto("/media/fotos/reportes/" + NOMBRE);
        when(fotos.cargarFotoReporte(NOMBRE)).thenReturn(new ByteArrayResource(new byte[] {7}));
        when(clasificacion.sugerenciaOficial(any())).thenReturn(Optional.of(BACHE));
        when(reporteService.registrarSugerencia(42L, BACHE)).thenReturn(false);

        assertThatCode(() -> servicio.sugerir(42L)).doesNotThrowAnyException();
    }

    @Test
    void sinSugerencia_noEscribe() {
        conFoto("/media/fotos/reportes/" + NOMBRE);
        when(fotos.cargarFotoReporte(NOMBRE)).thenReturn(new ByteArrayResource(new byte[] {7}));
        when(clasificacion.sugerenciaOficial(any())).thenReturn(Optional.empty());

        servicio.sugerir(42L);

        verifyNoInteractions(reporteService);
    }

    @Test
    void conLaClasificacionApagada_niLeeLaBaseNiDescargaLaFoto() {
        // Produccion hasta NC-04b: el falso sin respuesta no detectaria nada.
        when(clasificacion.estaDisponible()).thenReturn(false);
        conFoto("/media/fotos/reportes/" + NOMBRE);

        servicio.sugerir(42L);

        verifyNoInteractions(reporteRepository, fotos, reporteService);
        verify(clasificacion, never()).sugerenciaOficial(any());
    }

    @Test
    void sinFoto_niLeeElAlmacenamiento() {
        conFoto(null);

        servicio.sugerir(42L);

        verifyNoInteractions(fotos, reporteService);
        verify(clasificacion, never()).sugerenciaOficial(any());
    }

    @Test
    void unaUrlQueNoEsUnNombreDelServidor_noSeLee() {
        conFoto("/media/fotos/reportes/../../perfiles/" + NOMBRE.replace(".jpg", ".txt"));

        servicio.sugerir(42L);

        verifyNoInteractions(fotos, reporteService);
        verify(clasificacion, never()).sugerenciaOficial(any());
    }

    @Test
    void laFotoYaNoEstaEnElAlmacenamiento_sinSugerencia() {
        conFoto("/media/fotos/reportes/" + NOMBRE);
        when(fotos.cargarFotoReporte(NOMBRE)).thenReturn(null);

        servicio.sugerir(42L);

        verifyNoInteractions(reporteService);
        verify(clasificacion, never()).sugerenciaOficial(any());
    }

    @Test
    void elAlmacenamientoNoResponde_sinSugerenciaNiError() {
        conFoto("/media/fotos/reportes/" + NOMBRE);
        when(fotos.cargarFotoReporte(NOMBRE)).thenThrow(new ServicioNoDisponibleException("R2 caido"));

        assertThatCode(() -> servicio.sugerir(42L)).doesNotThrowAnyException();
        verify(clasificacion, never()).sugerenciaOficial(any());
        verify(reporteService, never()).registrarSugerencia(anyLong(), any());
    }

    @Test
    void conElHiloInterrumpido_noLeeLaBaseNiClasifica() {
        // NC-04c: es la tarea que el executor de las sugerencias ya habia
        // tomado de la cola cuando se destruye al apagar.
        Thread.currentThread().interrupt();
        try {
            servicio.sugerir(42L);

            verifyNoInteractions(reporteRepository, fotos, clasificacion, reporteService);
            assertThat(Thread.currentThread().isInterrupted()).as("conserva la interrupcion").isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    @Test
    void correEnElExecutorDeLasSugerencias_noEnElDeLosCorreosYAvisos() throws Exception {
        // NC-04c: puede esperar hasta 10 s un turno de inferencia; en el executor
        // general dejaria sin hilos a los correos de confirmacion y a los avisos.
        Async async = SugerenciaCategoriaService.class.getMethod("sugerir", Long.class).getAnnotation(Async.class);

        assertThat(async).isNotNull();
        assertThat(async.value()).isEqualTo(AsyncConfig.EJECUTOR_SUGERENCIAS);
    }
}
