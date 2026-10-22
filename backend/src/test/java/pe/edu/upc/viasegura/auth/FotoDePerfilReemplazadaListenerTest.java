package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;
import pe.edu.upc.viasegura.auth.event.FotoDePerfilReemplazadaEvent;
import pe.edu.upc.viasegura.auth.listener.FotoDePerfilReemplazadaListener;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.auth.service.PerfilFotoService;
import pe.edu.upc.viasegura.common.port.FotoStorageService;

/**
 * Borrado de la foto de perfil reemplazada (DEP-12): el listener solo encola
 * el borrado asincrono (D-13), y ni la cola llena ni un almacenamiento caido
 * llegan al hilo de la peticion.
 */
class FotoDePerfilReemplazadaListenerTest {

    private static final FotoDePerfilReemplazadaEvent EVENTO =
            new FotoDePerfilReemplazadaEvent(7L, "0b9f1f5e-6c1a-4c55-9a77-3f5b6f2d9e10.jpg");

    @Test
    void encolaElBorradoDeLaFotoAnterior() {
        PerfilFotoService servicio = mock(PerfilFotoService.class);

        new FotoDePerfilReemplazadaListener(servicio).alReemplazarFoto(EVENTO);

        verify(servicio).eliminarFotoReemplazada(EVENTO);
    }

    @Test
    void colaLlena_seDescartaSinPropagar() {
        PerfilFotoService servicio = mock(PerfilFotoService.class);
        doThrow(new TaskRejectedException("cola llena")).when(servicio).eliminarFotoReemplazada(any());

        assertThatCode(() -> new FotoDePerfilReemplazadaListener(servicio).alReemplazarFoto(EVENTO))
                .doesNotThrowAnyException();
        verify(servicio).eliminarFotoReemplazada(EVENTO);
    }

    @Test
    void elBorradoAsincrono_borraEsaFotoYNuncaLanza() {
        FotoStorageService almacenamiento = mock(FotoStorageService.class);
        doThrow(new IllegalStateException("R2 caido")).when(almacenamiento).eliminarFotoPerfil(any());
        PerfilFotoService servicio = new PerfilFotoService(mock(UsuarioRepository.class), almacenamiento);

        assertThatCode(() -> servicio.eliminarFotoReemplazada(EVENTO)).doesNotThrowAnyException();
        verify(almacenamiento).eliminarFotoPerfil("0b9f1f5e-6c1a-4c55-9a77-3f5b6f2d9e10.jpg");
    }
}
