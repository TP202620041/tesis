package pe.edu.upc.viasegura.auth.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import pe.edu.upc.viasegura.auth.repository.ConsentimientoRepository;
import pe.edu.upc.viasegura.auth.repository.PasswordResetTokenRepository;
import pe.edu.upc.viasegura.auth.repository.TokenConfirmacionCorreoRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.RestriccionDeIntegridad;

/**
 * BE-15: borra las cuentas que nunca confirmaron su correo, una vez al dia
 * (decision del usuario del 28/10). Desde NC-09 una cuenta nace sin confirmar;
 * si nadie abre el enlace, quedaba para siempre con nombre, apellido, correo y
 * la aceptacion de los terminos, sin finalidad (Ley N.° 29733, proporcionalidad),
 * y ocupando el correo («El correo ya está registrado»).
 *
 * <p><b>Que borra.</b> Las cuentas {@code CIUDADANO} con
 * {@code correo_confirmado = false} creadas hace mas de
 * {@code app.cuentas-sin-confirmar.plazo} (30 dias por defecto), salvo las que
 * tienen un enlace de confirmacion vigente: quien pidio «Reenviar» el ultimo
 * dia puede usarlo. Con la cuenta se borran sus enlaces de confirmacion, sus
 * tokens de recuperacion y su historial de consentimientos. Nunca toca una
 * cuenta confirmada, el ADMIN ni un funcionario.</p>
 *
 * <p><b>Lo que no deberia existir.</b> Una cuenta sin confirmar no pudo iniciar
 * sesion, asi que no tiene reportes, adhesiones, comentarios, calificaciones,
 * suscripciones push, claves de idempotencia, tickets ni foto de perfil. Si
 * aparece alguna de esas filas, la clave foranea impide el {@code DELETE} (o,
 * para la foto, la comprobacion previa): la cuenta no se borra y queda un
 * {@code WARN} con su id. La lista de tablas no se repite aqui: la conoce la
 * base, y una tabla nueva que referencie a {@code usuario} queda cubierta sola.</p>
 *
 * <p><b>Una cuenta por transaccion, con candados.</b> Para cada candidata, en
 * su propia transaccion corta:</p>
 * <ol>
 *   <li>el candado consultivo de los reenvios de esa cuenta (el mismo que toma
 *       {@code ConfirmacionCorreoService#reenviar}): un reenvio en curso termina
 *       antes, o empieza despues y ya no encuentra la cuenta;</li>
 *   <li>el candado de la fila ({@code FOR UPDATE}), si sigue sin confirmar:
 *       si una confirmacion la esta modificando, se espera y, si confirmo,
 *       gana la confirmacion. La confirmacion toma el suyo antes de escribir
 *       ({@code UsuarioRepository#bloquearParaConfirmar}): si gana el borrado,
 *       el enlace deja de existir y la PWA muestra {@code CONFIRMACION_INVALIDA};</li>
 *   <li>con los candados tomados, vuelve a mirar si hay un enlace vigente y si
 *       hay foto de perfil;</li>
 *   <li>borra los enlaces, los tokens de recuperacion y los consentimientos, y
 *       al final la cuenta, con un {@code DELETE} que vuelve a exigir
 *       {@code correo_confirmado = false} en la misma sentencia.</li>
 * </ol>
 * <p>Si una cuenta falla, su transaccion se revierte entera y se sigue con la
 * siguiente. Una segunda corrida no encuentra nada que borrar (idempotente), y
 * dos instancias a la vez no se pisan: la segunda espera el candado y ya no
 * encuentra la cuenta.</p>
 *
 * <p><b>Registro.</b> Un {@code INFO} con cuantas borro; nunca un correo ni un
 * nombre, solo ids. Sin aviso por correo antes de borrar: la decision no lo
 * pide y gastaria cuota del proveedor.</p>
 *
 * <p><b>Disparador.</b> Es la primera tarea programada del backend: el
 * {@code @Scheduled} vive en el servicio, en la capa de aplicacion, porque una
 * tarea programada es un caso de uso sin HTTP (como un listener, pero
 * disparado por el reloj) y {@code infra} no puede llamar a {@code service}
 * (ArchUnit). La expresion cron es {@code app.cuentas-sin-confirmar.purga.cron}
 * en hora de Lima; {@code "-"} la apaga (asi corre la suite de tests, que llama
 * a {@link #purgar()} directamente). Ver «Tareas programadas (BE-15)» en el
 * README.</p>
 */
@Slf4j
@Service
public class PurgaCuentasSinConfirmarService {

    /** Zona de la expresion cron: la hora del ciudadano y del operador. */
    public static final String ZONA = "America/Lima";

    /**
     * El plazo mas corto que se acepta. Debajo de un dia una cuenta podria
     * borrarse antes de que venza su primer enlace (24 h) o mientras la
     * persona todavia busca el correo.
     */
    static final Duration PLAZO_MINIMO = Duration.ofDays(1);

    private final UsuarioRepository usuarioRepository;
    private final TokenConfirmacionCorreoRepository tokenConfirmacionRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final ConsentimientoRepository consentimientoRepository;
    private final TransactionOperations transaccion;
    private final Duration plazo;

    public PurgaCuentasSinConfirmarService(UsuarioRepository usuarioRepository,
                                           TokenConfirmacionCorreoRepository tokenConfirmacionRepository,
                                           PasswordResetTokenRepository passwordResetTokenRepository,
                                           ConsentimientoRepository consentimientoRepository,
                                           TransactionOperations transaccion,
                                           @Value("${app.cuentas-sin-confirmar.plazo:30d}") Duration plazo) {
        this.usuarioRepository = usuarioRepository;
        this.tokenConfirmacionRepository = tokenConfirmacionRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.consentimientoRepository = consentimientoRepository;
        this.transaccion = transaccion;
        this.plazo = validarPlazo(plazo);
    }

    /**
     * Un plazo ausente o de menos de {@link #PLAZO_MINIMO} no arranca: un
     * {@code 0} borraria cada cuenta recien creada en la siguiente corrida.
     */
    static Duration validarPlazo(Duration plazo) {
        if (plazo == null || plazo.compareTo(PLAZO_MINIMO) < 0) {
            throw new IllegalStateException("app.cuentas-sin-confirmar.plazo (CUENTAS_SIN_CONFIRMAR_PLAZO) debe ser"
                    + " de al menos 1 dia (p. ej. 30d); vale " + plazo);
        }
        return plazo;
    }

    /** La corrida diaria. */
    @Scheduled(cron = "${app.cuentas-sin-confirmar.purga.cron:0 30 3 * * *}", zone = ZONA)
    public void purgarProgramada() {
        try {
            purgar();
        } catch (RuntimeException e) {
            // Sin la traza ni el mensaje: podria traer valores de la base.
            log.error("Purga de cuentas sin confirmar: la corrida fallo ({}); se reintenta en la proxima",
                    e.getClass().getSimpleName());
        }
    }

    /**
     * Borra las cuentas vencidas y devuelve cuantas borro. No es
     * {@code @Transactional}: abre una transaccion por cuenta. Por eso se niega
     * a correr dentro de otra (sus borrados se confirmarian o revertirian con
     * la de afuera, no uno por uno).
     */
    public int purgar() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new IllegalStateException("La purga de cuentas sin confirmar abre una transaccion por cuenta:"
                    + " no puede llamarse dentro de otra transaccion");
        }
        Instant ahora = Instant.now();
        Instant limite = ahora.minus(plazo);
        List<Long> candidatas = usuarioRepository.candidatasAPurga(limite, ahora);

        int borradas = 0;
        int conservadas = 0;
        for (Long id : candidatas) {
            Desenlace desenlace = purgarUna(id, limite);
            if (desenlace == Desenlace.BORRADA) {
                borradas++;
            } else if (desenlace == Desenlace.CON_DATOS) {
                conservadas++;
            }
        }
        if (conservadas > 0) {
            log.info("Purga de cuentas sin confirmar: {} cuentas borradas y {} conservadas con datos asociados"
                    + " (plazo {} dias)", borradas, conservadas, plazo.toDays());
        } else {
            log.info("Purga de cuentas sin confirmar: {} cuentas borradas (plazo {} dias)",
                    borradas, plazo.toDays());
        }
        return borradas;
    }

    private enum Desenlace { BORRADA, OMITIDA, CON_DATOS }

    private Desenlace purgarUna(Long id, Instant limite) {
        try {
            Desenlace desenlace = transaccion.execute(estado -> {
                tokenConfirmacionRepository.bloquearSolicitudesDeConfirmacion(id);
                if (usuarioRepository.bloquearSinConfirmarParaPurga(id, limite).isEmpty()) {
                    return Desenlace.OMITIDA; // se confirmo mientras tanto
                }
                // Con los candados, una consulta nueva ve lo que se confirmo antes.
                if (tokenConfirmacionRepository.existeVigente(id, Instant.now())) {
                    return Desenlace.OMITIDA; // pidio un enlace mientras tanto
                }
                if (usuarioRepository.existsByIdAndFotoUrlIsNotNull(id)) {
                    log.warn("Purga de cuentas sin confirmar: la cuenta {} tiene foto de perfil; no se borra", id);
                    return Desenlace.CON_DATOS;
                }
                tokenConfirmacionRepository.borrarDeUsuario(id);
                passwordResetTokenRepository.borrarDeUsuario(id);
                consentimientoRepository.borrarDeUsuario(id);
                if (usuarioRepository.borrarSinConfirmar(id, limite) != 1) {
                    estado.setRollbackOnly(); // no deberia pasar con el candado: no se deja la cuenta a medias
                    return Desenlace.OMITIDA;
                }
                return Desenlace.BORRADA;
            });
            return desenlace == null ? Desenlace.OMITIDA : desenlace;
        } catch (DataIntegrityViolationException e) {
            log.warn("Purga de cuentas sin confirmar: la cuenta {} tiene datos asociados ({}); no se borra",
                    id, RestriccionDeIntegridad.nombreDe(e));
            return Desenlace.CON_DATOS;
        } catch (RuntimeException e) {
            log.warn("Purga de cuentas sin confirmar: no se pudo borrar la cuenta {} ({}); se reintenta en la"
                    + " proxima corrida", id, e.getClass().getSimpleName());
            return Desenlace.OMITIDA;
        }
    }
}
