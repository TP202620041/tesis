package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;
import pe.edu.upc.viasegura.reportes.listener.SugerenciaCategoriaListener;
import pe.edu.upc.viasegura.reportes.service.SugerenciaCategoriaService;

/**
 * NC-04: el listener de la sugerencia solo encola, y con la cola llena la
 * sugerencia se descarta sin propagar el error a la creacion del reporte.
 */
class SugerenciaCategoriaListenerTest {

    private final SugerenciaCategoriaService servicio = mock(SugerenciaCategoriaService.class);
    private final SugerenciaCategoriaListener listener = new SugerenciaCategoriaListener(servicio);

    @Test
    void conFoto_encolaLaSugerencia() {
        listener.alCrearReporte(new ReporteCreadoEvent(42L, 1L, 3L, true));

        verify(servicio).sugerir(42L);
    }

    @Test
    void sinFoto_noEncolaNada() {
        listener.alCrearReporte(new ReporteCreadoEvent(42L, 1L, 3L, false));

        verifyNoInteractions(servicio);
    }

    @Test
    void colaLlena_seDescartaSinPropagar() {
        doThrow(new TaskRejectedException("cola llena")).when(servicio).sugerir(any());

        assertThatCode(() -> listener.alCrearReporte(new ReporteCreadoEvent(42L, 1L, 3L, true)))
                .doesNotThrowAnyException();
        verify(servicio).sugerir(42L);
    }
}
