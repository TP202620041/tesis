package pe.edu.upc.viasegura.soporte;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;
import pe.edu.upc.viasegura.soporte.event.TicketRespondidoEvent;
import pe.edu.upc.viasegura.soporte.listener.TicketRespondidoListener;
import pe.edu.upc.viasegura.soporte.service.TicketSoporteService;

/** Aviso por correo de la respuesta a un ticket (US-25, DEP-08), sin contexto de Spring. */
class TicketRespondidoListenerTest {

    private static final TicketRespondidoEvent EVENTO = new TicketRespondidoEvent(7L);
    private static final MensajeCorreo MENSAJE = new MensajeCorreo("ana@lima.pe", "Respuesta", "Hecho", "soporte");
    private static final TaskExecutor EN_EL_MISMO_HILO = Runnable::run;

    private final TicketSoporteService servicio = mock(TicketSoporteService.class);
    private final CorreoSaliente correo = mock(CorreoSaliente.class);

    @Test
    void ticketRespondido_enviaElMensajeDelServicio() {
        when(servicio.mensajeDeRespuesta(7L)).thenReturn(Optional.of(MENSAJE));

        new TicketRespondidoListener(servicio, correo, EN_EL_MISMO_HILO).alResponder(EVENTO);

        verify(correo).enviar(MENSAJE);
    }

    @Test
    void sinNadaQueAvisar_noEnvia() {
        when(servicio.mensajeDeRespuesta(7L)).thenReturn(Optional.empty());

        new TicketRespondidoListener(servicio, correo, EN_EL_MISMO_HILO).alResponder(EVENTO);

        verify(correo, never()).enviar(any());
    }

    @Test
    void elProveedorFalla_noPropaga() {
        when(servicio.mensajeDeRespuesta(7L)).thenReturn(Optional.of(MENSAJE));
        doThrow(new CorreoNoEnviadoException("SMTP caido")).when(correo).enviar(any());

        assertThatCode(() -> new TicketRespondidoListener(servicio, correo, EN_EL_MISMO_HILO).alResponder(EVENTO))
                .doesNotThrowAnyException();
    }

    @Test
    void colaLlena_seDescartaSinPropagar() {
        TaskExecutor lleno = tarea -> {
            throw new TaskRejectedException("cola llena");
        };

        assertThatCode(() -> new TicketRespondidoListener(servicio, correo, lleno).alResponder(EVENTO))
                .doesNotThrowAnyException();
        verifyNoInteractions(servicio, correo);
    }
}
