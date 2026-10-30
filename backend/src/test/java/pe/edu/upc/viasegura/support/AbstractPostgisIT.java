package pe.edu.upc.viasegura.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.dto.AceptarConsentimientoRequest;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.auth.service.ConsentimientoService;
import pe.edu.upc.viasegura.notificaciones.repository.NotificacionRepository;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.IdempotencyKeyRepository;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.CalificacionRepository;
import pe.edu.upc.viasegura.reportes.repository.ComentarioPublicoRepository;
import pe.edu.upc.viasegura.reportes.repository.DenunciaReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Base para tests de integracion contra un PostGIS real.
 *
 * <p>H2 no soporta {@code geography}/{@code ST_Covers}/GiST, por lo que la
 * asignacion geoespacial solo puede probarse con fidelidad sobre PostGIS.
 * Los tests corren contra una base dedicada {@code viasegura_test} en el
 * mismo contenedor PostGIS de desarrollo (imagen postgis/postgis), aislada
 * por nombre de base. Flyway y el DistritoSeeder se ejecutan sobre ella
 * igual que en produccion.</p>
 *
 * <p>Nota: se eligio este enfoque (pre-aprobado) en lugar de Testcontainers
 * porque la version bleeding-edge de Docker Desktop en este entorno (API
 * 1.54) no negocia con el docker-java que trae Testcontainers 1.20.x. La
 * migracion a Testcontainers para CI es directa cuando el tooling lo
 * soporte: solo cambia este archivo.</p>
 *
 * <p>Prerequisito: {@code docker compose up -d} y la base {@code viasegura_test}
 * creada. Configurable por variables de entorno TEST_DB_*.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({EnviadorWebPushFake.Config.class, EjecutorSincronoTestConfig.class})
public abstract class AbstractPostgisIT {

    /**
     * Version vigente de los terminos (D-12), leida de la configuracion y no
     * fija en cada test: al publicar un texto nuevo los IT no cambian.
     */
    @Value("${app.legal.version-terminos}")
    protected String versionTerminos;

    @Autowired
    private UsuarioRepository usuarioRepositoryBase;
    @Autowired
    private ConsentimientoService consentimientoServiceBase;
    @Autowired
    private JdbcTemplate jdbcTemplateBase;
    @Autowired
    private MockMvc mockMvcBase;
    @Autowired
    private ObjectMapper objectMapperBase;

    /** Puerto de envio push falso (US-21): nunca se llama a un servicio real. */
    @Autowired
    protected EnviadorWebPushFake enviadorPush;

    /** Executor de test: guarda los errores de los metodos @Async. */
    @Autowired
    private EjecutorSincronoTestConfig asincrono;

    /** Un fallo en el hilo asincrono hace fallar el test con su causa. */
    @AfterEach
    void fallarSiHuboErrorAsincrono() {
        asincrono.relanzarSiHuboError();
    }

    /**
     * Guarda el usuario y le registra la aceptacion de los terminos vigentes,
     * como si se hubiera registrado por {@code POST /api/auth/registro}. Desde
     * NC-07b, sin ella toda ruta privada responde 403
     * {@code TERMINOS_PENDIENTES}; los casos sin terminos estan en
     * {@code auth/ConsentimientoIT}. Idempotente: no duplica la aceptacion.
     */
    protected Usuario guardarConTerminos(Usuario usuario) {
        // NC-09: un usuario de fixture es una cuenta en uso, con el correo
        // confirmado; los casos sin confirmar estan en auth/ConfirmacionCorreoIT.
        if (!usuario.isCorreoConfirmado()) {
            usuario.confirmarCorreo(Instant.now());
        }
        Usuario guardado = usuarioRepositoryBase.save(usuario);
        if (consentimientoServiceBase.debeAceptarTerminos(guardado.getId())) {
            consentimientoServiceBase.registrarAceptacionDeTerminos(guardado, versionTerminos);
        }
        return guardado;
    }

    /**
     * NC-09: marca confirmado el correo de una cuenta registrada por
     * {@code POST /api/auth/registro}, como si la persona hubiera abierto el
     * enlace. Directo en la base porque el token solo existe en el correo (se
     * guarda su hash); el flujo real del enlace lo prueba
     * {@code auth/ConfirmacionCorreoIT}. Falla si el correo no tiene cuenta.
     */
    protected void confirmarCorreo(String email) {
        int filas = jdbcTemplateBase.update(
                "UPDATE usuario SET correo_confirmado = TRUE, correo_confirmado_en = now() WHERE email = ?", email);
        if (filas != 1) {
            throw new IllegalStateException("No hay una cuenta con el correo " + email + " para confirmar");
        }
    }

    /**
     * NC-09: el registro ya no devuelve un token de sesion. Para los IT que
     * registran por el API y luego usan la cuenta: confirma el correo
     * ({@link #confirmarCorreo}) e inicia sesion por {@code POST /api/auth/login},
     * sin debilitar la regla de que una cuenta sin confirmar no entra.
     * Devuelve el JWT.
     */
    protected String confirmarEIniciarSesion(String email, String password) throws Exception {
        confirmarCorreo(email);
        String cuerpo = mockMvcBase.perform(MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapperBase.writeValueAsString(Map.of("email", email, "password", password))))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapperBase.readTree(cuerpo).get("token").asText();
    }

    /** Otorga un consentimiento de notificaciones (push o correo) al usuario. */
    protected void otorgar(Usuario usuario, FinalidadConsentimiento finalidad) {
        consentimientoServiceBase.aceptar(usuario.getEmail(),
                new AceptarConsentimientoRequest(finalidad, "test-" + finalidad.name().toLowerCase()));
    }

    // Repositorios de reportes: usados solo para la limpieza FK-safe comun.
    // Opcionales (required=false) para no exigir el contexto de reportes en
    // suites que no lo tocan; si estan presentes, se limpian en orden de FK.
    @Autowired(required = false)
    private NotificacionRepository notificacionRepository;
    @Autowired(required = false)
    private IdempotencyKeyRepository idempotencyKeyRepository;
    @Autowired(required = false)
    private HistorialEstadoReporteRepository historialEstadoReporteRepository;
    @Autowired(required = false)
    private AsignacionResponsableRepository asignacionResponsableRepository;
    @Autowired(required = false)
    private CalificacionRepository calificacionRepository;
    @Autowired(required = false)
    private ComentarioPublicoRepository comentarioPublicoRepository;
    @Autowired(required = false)
    private AdhesionReporteRepository adhesionReporteRepository;
    @Autowired(required = false)
    private DenunciaReporteRepository denunciaReporteRepository;
    @Autowired(required = false)
    private ReporteRepository reporteRepositoryBase;

    /**
     * Estado limpio antes de cada test. La BD de test es persistente y
     * compartida entre clases IT, asi que se borra en orden inverso al de las
     * llaves foraneas: hijos que referencian al reporte (historial,
     * asignaciones, calificaciones, comentarios, adhesiones, denuncias de
     * NC-11a, notificaciones)
     * antes que el reporte (padre). Corre antes
     * que cualquier {@code @BeforeEach} de subclase (JUnit ejecuta los de la
     * superclase primero), evitando violaciones de FK como
     * {@code historial_estado_reporte_reporte_id_fkey} o
     * {@code notificacion_reporte_id_fkey}.
     */
    @BeforeEach
    void limpiezaFkSafe() {
        enviadorPush.reiniciar();
        asincrono.reiniciar();
        if (notificacionRepository != null) {
            notificacionRepository.deleteAll();
        }
        if (idempotencyKeyRepository != null) {
            idempotencyKeyRepository.deleteAll();
        }
        if (historialEstadoReporteRepository != null) {
            historialEstadoReporteRepository.deleteAll();
        }
        if (asignacionResponsableRepository != null) {
            asignacionResponsableRepository.deleteAll();
        }
        if (calificacionRepository != null) {
            calificacionRepository.deleteAll();
        }
        if (comentarioPublicoRepository != null) {
            comentarioPublicoRepository.deleteAll();
        }
        if (adhesionReporteRepository != null) {
            adhesionReporteRepository.deleteAll();
        }
        if (denunciaReporteRepository != null) {
            denunciaReporteRepository.deleteAllInBatch();
        }
        if (reporteRepositoryBase != null) {
            reporteRepositoryBase.deleteAll();
        }
    }

    private static String env(String clave, String porDefecto) {
        String valor = System.getenv(clave);
        return (valor == null || valor.isBlank()) ? porDefecto : valor;
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",
                () -> env("TEST_DB_URL", "jdbc:postgresql://localhost:5433/viasegura_test"));
        registry.add("spring.datasource.username", () -> env("TEST_DB_USER", "viasegura"));
        registry.add("spring.datasource.password", () -> env("TEST_DB_PASSWORD", "viasegura"));
        // Evita escribir fotos de test dentro del repo del proyecto.
        registry.add("app.storage.fotos-dir",
                () -> System.getProperty("java.io.tmpdir") + "/viasegura-test-fotos");
        // SMTP de tests -> GreenMail embebido (ServerSetupTest.SMTP = 3025),
        // por SmtpCorreoAdapter (app.correo.tipo=smtp en application-test.yml,
        // DEP-08). Lo levantan las suites que extienden AbstractPostgisMailIT.
        registry.add("spring.mail.host", () -> "127.0.0.1");
        registry.add("spring.mail.port", () -> "3025");
    }
}
