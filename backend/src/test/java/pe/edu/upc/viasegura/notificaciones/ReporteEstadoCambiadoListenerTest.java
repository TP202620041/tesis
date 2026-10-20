package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;
import pe.edu.upc.viasegura.notificaciones.listener.ReporteEstadoCambiadoListener;
import pe.edu.upc.viasegura.notificaciones.service.NotificacionService;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;

/** Cola asincrona llena (US-21): el aviso se descarta sin romper ni correr en el hilo de la peticion. */
class ReporteEstadoCambiadoListenerTest {

    private static final ReporteEstadoCambiadoEvent EVENTO = new ReporteEstadoCambiadoEvent(
            42L, 7L, 1L, "Miraflores", EstadoReporte.RECIBIDO, EstadoReporte.EN_PROCESO, null);

    @Test
    void colaLlena_seDescartaSinPropagar() {
        NotificacionService servicio = mock(NotificacionService.class);
        doThrow(new TaskRejectedException("cola llena")).when(servicio).notificarCambioEstado(any());

        assertThatCode(() -> new ReporteEstadoCambiadoListener(servicio).alCambiarEstado(EVENTO))
                .doesNotThrowAnyException();
        verify(servicio).notificarCambioEstado(EVENTO);
    }
}
