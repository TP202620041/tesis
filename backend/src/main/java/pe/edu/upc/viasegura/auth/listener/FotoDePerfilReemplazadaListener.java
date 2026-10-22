package pe.edu.upc.viasegura.auth.listener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.auth.event.FotoDePerfilReemplazadaEvent;
import pe.edu.upc.viasegura.auth.service.PerfilFotoService;

/**
 * Borra la foto de perfil reemplazada (DEP-12) despues de que el cambio de
 * perfil se confirma.
 *
 * <p>Mismo patron que las notificaciones (D-13): {@code AFTER_COMMIT}, para
 * no borrar la foto anterior si el cambio de perfil hiciera rollback, y el
 * listener solo encola {@code PerfilFotoService#eliminarFotoReemplazada}, que
 * es {@code @Async} en el executor acotado de {@code AsyncConfig}. El borrado
 * en R2 (una llamada HTTP) no corre en el hilo de la peticion ni con la
 * conexion a la base tomada.</p>
 *
 * <p>Nunca lanza: si la cola esta llena, la foto anterior queda huerfana en
 * el almacenamiento y se registra cual. El perfil ya actualizado no se ve
 * afectado.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FotoDePerfilReemplazadaListener {

    private final PerfilFotoService perfilFotoService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alReemplazarFoto(FotoDePerfilReemplazadaEvent evento) {
        try {
            perfilFotoService.eliminarFotoReemplazada(evento);
        } catch (TaskRejectedException e) {
            log.warn("Cola asincrona llena: queda sin borrar la foto de perfil reemplazada {} del usuario {}",
                    evento.nombreArchivo(), evento.usuarioId());
        }
    }
}
