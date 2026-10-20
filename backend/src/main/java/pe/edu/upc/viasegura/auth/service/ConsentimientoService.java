package pe.edu.upc.viasegura.auth.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Consentimiento;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.dto.AceptarConsentimientoRequest;
import pe.edu.upc.viasegura.auth.dto.ConsentimientoResponse;
import pe.edu.upc.viasegura.auth.dto.ConsentimientosResponse;
import pe.edu.upc.viasegura.auth.event.ConsentimientoRevocadoEvent;
import pe.edu.upc.viasegura.auth.repository.ConsentimientoRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;

/**
 * Consentimientos del usuario por finalidad y version (CONSENTIMIENTO, D-12;
 * Ley N.° 29733).
 *
 * <p>Es un historial: aceptar inserta una fila, revocar llena
 * {@code revocado_en}. Una finalidad esta <b>vigente</b> si su aceptacion
 * mas reciente no esta revocada y, para {@link
 * FinalidadConsentimiento#TERMINOS_Y_PRIVACIDAD}, si ademas es de la version
 * que la app exige hoy ({@code app.legal.version-terminos}). Al publicar una
 * version nueva de los terminos, todos pasan a {@code debeAceptarTerminos}
 * sin migrar datos.</p>
 *
 * <p>Es tambien la API publica de {@code auth} para que otros modulos
 * comprueben un permiso ({@link #tieneVigente}) sin tocar el repositorio.</p>
 */
@Service
public class ConsentimientoService {

    private final ConsentimientoRepository consentimientoRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final ApplicationEventPublisher eventPublisher;
    private final String versionTerminos;

    public ConsentimientoService(
            ConsentimientoRepository consentimientoRepository,
            UsuarioConsultaService usuarioConsultaService,
            ApplicationEventPublisher eventPublisher,
            @Value("${app.legal.version-terminos}") String versionTerminos) {
        if (!StringUtils.hasText(versionTerminos)) {
            throw new IllegalStateException("app.legal.version-terminos no puede estar vacio");
        }
        this.consentimientoRepository = consentimientoRepository;
        this.usuarioConsultaService = usuarioConsultaService;
        this.eventPublisher = eventPublisher;
        this.versionTerminos = versionTerminos;
    }

    /** Resultado de una aceptacion: si se creo una fila (201) o ya estaba vigente (200). */
    public record ResultadoAceptacion(boolean creado, ConsentimientoResponse consentimiento) {}

    /** Version de los terminos y la politica de privacidad que la app exige hoy. */
    public String versionTerminosVigente() {
        return versionTerminos;
    }

    /**
     * Registro (US-01): exige la version vigente de los terminos y deja la
     * fila {@code TERMINOS_Y_PRIVACIDAD} en la transaccion del registro, asi
     * que no puede existir una cuenta nueva sin su aceptacion. El
     * {@code aceptaTerminos=true} ya lo valida Bean Validation (400).
     */
    @Transactional
    public void registrarAceptacionDeTerminos(Usuario usuario, String version) {
        exigirVersionVigenteDeTerminos(version);
        insertar(usuario, FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, version);
    }

    /**
     * Version vigente o 409. Se valida antes de crear la cuenta para que un
     * cliente con un texto viejo no deje un usuario a medio registrar.
     */
    public void exigirVersionVigenteDeTerminos(String version) {
        if (!versionTerminos.equals(version)) {
            throw new BusinessException(
                    "La version de los terminos aceptada no es la vigente (" + versionTerminos
                            + "): vuelve a leerlos y aceptalos");
        }
    }

    /** {@code true} si el usuario no tiene aceptados los terminos vigentes (US-01, D-12). */
    @Transactional(readOnly = true)
    public boolean debeAceptarTerminos(Long usuarioId) {
        return !tieneVigente(usuarioId, FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD);
    }

    /** API publica: si el usuario autoriza hoy esa finalidad (p. ej. push, NC-07). */
    @Transactional(readOnly = true)
    public boolean tieneVigente(Long usuarioId, FinalidadConsentimiento finalidad) {
        return ultimaNoRevocada(usuarioId, finalidad)
                .filter(this::esVigente)
                .isPresent();
    }

    /** Vigentes e historial del propio usuario. */
    @Transactional(readOnly = true)
    public ConsentimientosResponse listar(String email) {
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        List<Consentimiento> historial =
                consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(usuario.getId());

        // La primera no revocada de cada finalidad (el historial va de la mas
        // reciente a la mas antigua) es la candidata a vigente.
        Map<FinalidadConsentimiento, Long> vigentePorFinalidad = new EnumMap<>(FinalidadConsentimiento.class);
        for (Consentimiento c : historial) {
            if (!c.estaRevocado() && !vigentePorFinalidad.containsKey(c.getFinalidad())) {
                vigentePorFinalidad.put(c.getFinalidad(), esVigente(c) ? c.getId() : null);
            }
        }

        List<ConsentimientoResponse> filas = new ArrayList<>();
        List<ConsentimientoResponse> vigentes = new ArrayList<>();
        for (Consentimiento c : historial) {
            boolean vigente = c.getId().equals(vigentePorFinalidad.get(c.getFinalidad()));
            ConsentimientoResponse fila = ConsentimientoResponse.desde(c, vigente);
            filas.add(fila);
            if (vigente) {
                vigentes.add(fila);
            }
        }
        boolean debeAceptar = vigentePorFinalidad.get(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD) == null;
        return new ConsentimientosResponse(versionTerminos, debeAceptar, vigentes, filas);
    }

    /**
     * Acepta una finalidad. Si ya esta vigente con la misma version, no crea
     * otra fila (idempotente, 200): el historial registra decisiones, no
     * clics repetidos. Una version distinta si deja fila nueva; la anterior
     * queda en el historial como evidencia de lo que se acepto antes.
     */
    @Transactional
    public ResultadoAceptacion aceptar(String email, AceptarConsentimientoRequest req) {
        if (req.finalidad() == FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD) {
            exigirVersionVigenteDeTerminos(req.version());
        }
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        Optional<Consentimiento> actual = ultimaNoRevocada(usuario.getId(), req.finalidad());
        if (actual.isPresent() && actual.get().getVersionDocumento().equals(req.version())) {
            return new ResultadoAceptacion(false, ConsentimientoResponse.desde(actual.get(), true));
        }
        Consentimiento nuevo = insertar(usuario, req.finalidad(), req.version());
        return new ResultadoAceptacion(true, ConsentimientoResponse.desde(nuevo, true));
    }

    /**
     * Revoca la finalidad: cierra todas sus aceptaciones no revocadas y
     * publica {@link ConsentimientoRevocadoEvent} en la misma transaccion
     * (por eso {@code notificaciones} borra las suscripciones push antes del
     * commit). Es idempotente: revocar algo no autorizado deja el mismo
     * estado (204) y vuelve a publicar el evento, que tambien limpia
     * suscripciones anteriores a NC-07b, creadas sin consentimiento.
     *
     * <p>{@code TERMINOS_Y_PRIVACIDAD} no se revoca (409): sin ellos no se
     * puede usar la app, y retirarlos es la baja de la cuenta (derecho de
     * cancelacion de la Ley N.° 29733), un caso de uso distinto.</p>
     */
    @Transactional
    public void revocar(String email, FinalidadConsentimiento finalidad) {
        if (finalidad.esObligatoria()) {
            throw new BusinessException(
                    "No se puede revocar " + finalidad + ": es necesario para usar la aplicacion. "
                            + "Para retirarlo hay que solicitar la baja de la cuenta");
        }
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        Instant ahora = Instant.now();
        consentimientoRepository.findByUsuarioIdAndFinalidadAndRevocadoEnIsNull(usuario.getId(), finalidad)
                .forEach(c -> c.revocar(ahora));
        eventPublisher.publishEvent(new ConsentimientoRevocadoEvent(usuario.getId(), finalidad));
    }

    private Optional<Consentimiento> ultimaNoRevocada(Long usuarioId, FinalidadConsentimiento finalidad) {
        return consentimientoRepository
                .findFirstByUsuarioIdAndFinalidadAndRevocadoEnIsNullOrderByAceptadoEnDescIdDesc(usuarioId, finalidad);
    }

    /** Una aceptacion no revocada autoriza hoy salvo terminos de una version anterior. */
    private boolean esVigente(Consentimiento c) {
        if (c.estaRevocado()) {
            return false;
        }
        return c.getFinalidad() != FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD
                || versionTerminos.equals(c.getVersionDocumento());
    }

    private Consentimiento insertar(Usuario usuario, FinalidadConsentimiento finalidad, String version) {
        return consentimientoRepository.save(Consentimiento.builder()
                .usuario(usuario)
                .finalidad(finalidad)
                .versionDocumento(version)
                .aceptadoEn(Instant.now())
                .build());
    }
}
