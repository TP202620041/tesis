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
import pe.edu.upc.viasegura.auth.event.RecuperacionSolicitadaEvent;
import pe.edu.upc.viasegura.auth.listener.RecuperacionSolicitadaListener;
import pe.edu.upc.viasegura.auth.service.PasswordResetService;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Envio del correo de recuperacion (DEP-08) sin contexto de Spring: el
 * listener nunca deja escapar un error (corre despues del commit, en otro
 * hilo) y con la cola llena descarta el envio sin correrlo en el hilo de la
 * peticion.
 */
class RecuperacionSolicitadaListenerTest {

    private static final RecuperacionSolicitadaEvent EVENTO = new RecuperacionSolicitadaEvent(42L);
    private static final MensajeCorreo MENSAJE =
            new MensajeCorreo("ana@lima.pe", "Recuperacion", "token", "recuperacion");
    /** Corre la tarea en el mismo hilo: el comportamiento del envio, sin concurrencia. */
    private static final TaskExecutor EN_EL_MISMO_HILO = Runnable::run;

    private final PasswordResetService servicio = mock(PasswordResetService.class);
    private final CorreoSaliente correo = mock(CorreoSaliente.class);

    @Test
    void tokenVigente_enviaElMensajeDelServicio() {
        when(servicio.mensajeDeRecuperacion(42L)).thenReturn(Optional.of(MENSAJE));

        new RecuperacionSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO).alSolicitarRecuperacion(EVENTO);

        verify(correo).enviar(MENSAJE);
    }

    @Test
    void tokenUsadoOVencido_noEnvia() {
        when(servicio.mensajeDeRecuperacion(42L)).thenReturn(Optional.empty());

        new RecuperacionSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO).alSolicitarRecuperacion(EVENTO);

        verify(correo, never()).enviar(any());
    }

    @Test
    void elProveedorFalla_noPropaga() {
        when(servicio.mensajeDeRecuperacion(42L)).thenReturn(Optional.of(MENSAJE));
        doThrow(new CorreoNoEnviadoException("Resend rechazo el correo: HTTP 503", 503)).when(correo).enviar(any());

        assertThatCode(() -> new RecuperacionSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO)
                .alSolicitarRecuperacion(EVENTO)).doesNotThrowAnyException();
    }

    @Test
    void leerElMensajeFalla_noPropagaNiEnvia() {
        when(servicio.mensajeDeRecuperacion(42L)).thenThrow(new IllegalStateException("base caida"));

        assertThatCode(() -> new RecuperacionSolicitadaListener(servicio, correo, EN_EL_MISMO_HILO)
                .alSolicitarRecuperacion(EVENTO)).doesNotThrowAnyException();
        verifyNoInteractions(correo);
    }

    @Test
    void colaLlena_seDescartaSinPropagarNiEnviarEnElHiloDeLaPeticion() {
        TaskExecutor lleno = tarea -> {
            throw new TaskRejectedException("cola llena");
        };

        assertThatCode(() -> new RecuperacionSolicitadaListener(servicio, correo, lleno)
                .alSolicitarRecuperacion(EVENTO)).doesNotThrowAnyException();
        verifyNoInteractions(servicio, correo);
    }
}
