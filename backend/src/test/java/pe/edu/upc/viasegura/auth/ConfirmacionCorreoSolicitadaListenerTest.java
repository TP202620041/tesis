package pe.edu.upc.viasegura.auth;

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
import pe.edu.upc.viasegura.auth.event.ConfirmacionCorreoSolicitadaEvent;
import pe.edu.upc.viasegura.auth.listener.ConfirmacionCorreoSolicitadaListener;
import pe.edu.upc.viasegura.auth.service.ConfirmacionCorreoService;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Envio del correo de confirmacion (NC-09) sin contexto de Spring, igual que
 * {@code RecuperacionSolicitadaListenerTest}: el listener nunca deja escapar
 * un error y con la cola llena descarta el envio sin correrlo en el hilo de
 * la peticion.
 */
class ConfirmacionCorreoSolicitadaListenerTest {

    private static final ConfirmacionCorreoSolicitadaEvent EVENTO = new ConfirmacionCorreoSolicitadaEvent(7L);
    private static final MensajeCorreo MENSAJE =
            new MensajeCorreo("ana@lima.pe", "Confirma tu correo", "enlace", "confirmacion-correo");
    private static final TaskExecutor EN_EL_MISMO_HILO = Runnable::run;

    private final ConfirmacionCorreoService servicio = mock(ConfirmacionCorreoService.class);
    private final CorreoSaliente correo = mock(CorreoSaliente.class);

    @Test
    void enlacePendiente_enviaElMensajeDelServicio() {
        when(servicio.emitirMensaje(7L)).thenReturn(Optional.of(MENSAJE));

        new ConfirmacionCorreoSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO).alSolicitarConfirmacion(EVENTO);

        verify(correo).enviar(MENSAJE);
    }

    @Test
    void enlaceAnuladoVencidoOCuentaYaConfirmada_noEnvia() {
        when(servicio.emitirMensaje(7L)).thenReturn(Optional.empty());

        new ConfirmacionCorreoSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO).alSolicitarConfirmacion(EVENTO);

        verify(correo, never()).enviar(any());
    }

    @Test
    void elProveedorFalla_noPropaga() {
        when(servicio.emitirMensaje(7L)).thenReturn(Optional.of(MENSAJE));
        doThrow(new CorreoNoEnviadoException("Resend rechazo el correo: HTTP 503", 503)).when(correo).enviar(any());

        assertThatCode(() -> new ConfirmacionCorreoSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO)
                .alSolicitarConfirmacion(EVENTO)).doesNotThrowAnyException();
    }

    @Test
    void emitirElMensajeFalla_noPropagaNiEnvia() {
        when(servicio.emitirMensaje(7L)).thenThrow(new IllegalStateException("base caida"));

        assertThatCode(() -> new ConfirmacionCorreoSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO)
                .alSolicitarConfirmacion(EVENTO)).doesNotThrowAnyException();
        verifyNoInteractions(correo);
    }

    @Test
    void colaLlena_seDescartaSinPropagarNiEnviarEnElHiloDeLaPeticion() {
        TaskExecutor lleno = tarea -> {
            throw new TaskRejectedException("cola llena");
        };

        assertThatCode(() -> new ConfirmacionCorreoSolicitadaListener(servicio, correo, lleno)
                .alSolicitarConfirmacion(EVENTO)).doesNotThrowAnyException();
        verifyNoInteractions(servicio, correo);
    }
}
