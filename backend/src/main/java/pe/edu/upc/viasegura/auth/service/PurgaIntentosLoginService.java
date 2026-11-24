package pe.edu.upc.viasegura.auth.service;

import java.time.Instant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import pe.edu.upc.viasegura.auth.domain.PoliticaDeBloqueoDeLogin;
import pe.edu.upc.viasegura.auth.repository.IntentoLoginRepository;

/**
 * Purga de {@code intento_login} (US-02 Esc. 2). Sin ella la tabla crece con
 * cada correo que alguien escribio mal una vez, exista o no la cuenta.
 *
 * <p>Borra las filas que ya no cuentan para nada: el ultimo intento fuera de
 * la ventana ({@link PoliticaDeBloqueoDeLogin#DURACION}) y sin bloqueo
 * vigente. Una fila asi, si se conservara, volveria a contar desde 1 en el
 * proximo intento: borrarla no cambia el comportamiento del login.</p>
 *
 * <p>Sigue el patron de las tareas programadas (BE-15, «Tareas programadas»
 * en el README): {@code @Scheduled} en el servicio del modulo dueno, con el
 * cron en {@code app.login.intentos.purga.cron} en hora de Lima ({@code "-"}
 * la apaga, como en los tests, que llaman a {@link #purgar()}); el metodo no
 * es {@code @Transactional} y abre su propia transaccion corta. Es un solo
 * {@code DELETE} condicional, idempotente y seguro con dos corridas a la
 * vez.</p>
 */
@Slf4j
@Service
public class PurgaIntentosLoginService {

    private final IntentoLoginRepository intentoLoginRepository;
    private final TransactionOperations transaccion;

    public PurgaIntentosLoginService(IntentoLoginRepository intentoLoginRepository,
                                     TransactionOperations transaccion) {
        this.intentoLoginRepository = intentoLoginRepository;
        this.transaccion = transaccion;
    }

    /** La corrida diaria. */
    @Scheduled(cron = "${app.login.intentos.purga.cron:0 45 3 * * *}", zone = PurgaCuentasSinConfirmarService.ZONA)
    public void purgarProgramada() {
        try {
            purgar();
        } catch (RuntimeException e) {
            // Sin la traza ni el mensaje: podria traer correos de la base.
            log.error("Purga de intentos de inicio de sesion: la corrida fallo ({}); se reintenta en la proxima",
                    e.getClass().getSimpleName());
        }
    }

    /** Borra las filas vencidas y devuelve cuantas borro. */
    public int purgar() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new IllegalStateException("La purga de intentos de inicio de sesion abre su propia transaccion:"
                    + " no puede llamarse dentro de otra");
        }
        Instant ahora = Instant.now();
        Integer borradas = transaccion.execute(estado -> intentoLoginRepository.purgarVencidos(
                ahora.minus(PoliticaDeBloqueoDeLogin.DURACION), ahora));
        int total = borradas == null ? 0 : borradas;
        log.info("Purga de intentos de inicio de sesion: {} filas borradas", total);
        return total;
    }
}
