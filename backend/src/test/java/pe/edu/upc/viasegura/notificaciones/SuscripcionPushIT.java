package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.dto.AceptarConsentimientoRequest;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.auth.service.ConsentimientoService;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;
import pe.edu.upc.viasegura.notificaciones.port.NotificacionCanalAdapter;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Suscripciones Web Push del navegador (SUSCRIPCION_PUSH, NC-07).
 *
 * <p>{@code suscripcion_push} no referencia a {@code reporte}, asi que no
 * entra en {@code limpiezaFkSafe}: esta clase la limpia en su propio
 * {@code @BeforeEach}.</p>
 */
class SuscripcionPushIT extends AbstractPostgisIT {

    private static final String RUTA = "/api/notificaciones/suscripciones";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    SuscripcionPushRepository suscripcionRepository;
    @Autowired
    List<NotificacionCanalAdapter> adapters;
    @Autowired
    TransactionTemplate transactionTemplate;
    @Autowired
    ConsentimientoService consentimientoService;

    @BeforeEach
    void limpiarSuscripciones() {
        suscripcionRepository.deleteAll();
    }

    /**
     * Usuario con el consentimiento NOTIFICACIONES_PUSH vigente, requisito
     * para suscribirse desde NC-07b (D-12). El caso sin consentimiento esta
     * en {@code auth/ConsentimientoIT}.
     */
    private Usuario usuario(Rol rol) {
        Usuario u = usuarioRepository.save(Usuario.builder()
                .email("push-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(rol).build());
        consentimientoService.aceptar(u.getEmail(), new AceptarConsentimientoRequest(
                FinalidadConsentimiento.NOTIFICACIONES_PUSH, "push-2026-10-v1"));
        return u;
    }

    private String token(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private static String endpointNuevo() {
        return "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID();
    }

    /** El JSON tal como lo arma el frontend: PushSubscription.toJSON() + userAgent. */
    private static String cuerpo(String endpoint, String p256dh, String auth) {
        return """
                {"endpoint":"%s","expirationTime":null,
                 "keys":{"p256dh":"%s","auth":"%s"},
                 "userAgent":"Mozilla/5.0 (Android 14) Chrome/129"}
                """.formatted(endpoint, p256dh, auth);
    }

    private static String cuerpoBaja(String endpoint) {
        return "{\"endpoint\":\"%s\"}".formatted(endpoint);
    }

    private Long duenoDe(String endpoint) {
        return transactionTemplate.execute(tx -> suscripcionRepository.findByEndpoint(endpoint)
                .map(s -> s.getUsuario().getId()).orElse(null));
    }

    private NotificacionCanalAdapter push() {
        return adapters.stream().filter(a -> a.canal() == CanalNotificacion.PUSH).findFirst().orElseThrow();
    }

    @Test
    void crear_201_guardaClavesYNoLasDevuelve() throws Exception {
        Usuario ciu = usuario(Rol.CIUDADANO);
        String endpoint = endpointNuevo();

        mockMvc.perform(post(RUTA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA", "tBHItJI5svbpez7KI4CCXg"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.endpoint", is(endpoint)))
                .andExpect(jsonPath("$.activa", is(true)))
                .andExpect(jsonPath("$.userAgent", containsString("Chrome")))
                .andExpect(jsonPath("$.creadaEn", notNullValue()))
                .andExpect(jsonPath("$.keys").doesNotExist())
                .andExpect(jsonPath("$.p256dh").doesNotExist())
                .andExpect(jsonPath("$.auth").doesNotExist());

        SuscripcionPush guardada = suscripcionRepository.findByEndpoint(endpoint).orElseThrow();
        assertThat(guardada.getP256dh()).isEqualTo("BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA");
        assertThat(guardada.getAuth()).isEqualTo("tBHItJI5svbpez7KI4CCXg");
        assertThat(guardada.isActiva()).isTrue();
        assertThat(duenoDe(endpoint)).isEqualTo(ciu.getId());
    }

    @Test
    void funcionarioTambienPuedeSuscribirse_201() throws Exception {
        mockMvc.perform(post(RUTA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpointNuevo(), "p256", "auth"))
                        .header("Authorization", token(usuario(Rol.FUNCIONARIO_MUNICIPAL))))
                .andExpect(status().isCreated());
    }

    @Test
    void mismoEndpointMismoUsuario_200_actualizaClavesSinDuplicar() throws Exception {
        Usuario ciu = usuario(Rol.CIUDADANO);
        String endpoint = endpointNuevo();
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256-v1", "auth-v1"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isCreated());

        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256-v2", "auth-v2"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endpoint", is(endpoint)));

        assertThat(suscripcionRepository.count()).isEqualTo(1);
        SuscripcionPush s = suscripcionRepository.findByEndpoint(endpoint).orElseThrow();
        assertThat(s.getP256dh()).isEqualTo("p256-v2");
        assertThat(s.getAuth()).isEqualTo("auth-v2");
    }

    @Test
    void mismoEndpointOtroUsuario_200_seReasignaAlUltimoQueInicioSesion() throws Exception {
        Usuario anterior = usuario(Rol.CIUDADANO);
        Usuario actual = usuario(Rol.CIUDADANO);
        String endpoint = endpointNuevo();
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256", "auth"))
                        .header("Authorization", token(anterior)))
                .andExpect(status().isCreated());

        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256", "auth"))
                        .header("Authorization", token(actual)))
                .andExpect(status().isOk());

        assertThat(suscripcionRepository.count()).isEqualTo(1);
        assertThat(duenoDe(endpoint)).isEqualTo(actual.getId());
        // El anterior ya no puede darla de baja: dejo de ser suya.
        mockMvc.perform(delete(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoBaja(endpoint))
                        .header("Authorization", token(anterior)))
                .andExpect(status().isNotFound());
        // Y el canal push deja de estar disponible para el anterior.
        assertThat(push().estaDisponible(anterior)).isFalse();
        assertThat(push().estaDisponible(actual)).isTrue();
    }

    @Test
    void suscripcionInactiva_sereactivaAlVolverASuscribirse() throws Exception {
        Usuario ciu = usuario(Rol.CIUDADANO);
        String endpoint = endpointNuevo();
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256", "auth"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isCreated());
        SuscripcionPush s = suscripcionRepository.findByEndpoint(endpoint).orElseThrow();
        s.setActiva(false);
        suscripcionRepository.save(s);
        assertThat(push().estaDisponible(ciu)).isFalse();

        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256", "auth"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activa", is(true)));
        assertThat(push().estaDisponible(ciu)).isTrue();
    }

    @Test
    void canalPush_disponibleSoloConAlgunaSuscripcionActiva() throws Exception {
        Usuario ciu = usuario(Rol.CIUDADANO);
        assertThat(push().estaDisponible(ciu)).isFalse();

        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpointNuevo(), "p256", "auth"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isCreated());

        assertThat(push().estaDisponible(ciu)).isTrue();
    }

    @Test
    void bajaDeLaPropia_204_yBorraLaFila() throws Exception {
        Usuario ciu = usuario(Rol.CIUDADANO);
        String endpoint = endpointNuevo();
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256", "auth"))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isCreated());

        mockMvc.perform(delete(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoBaja(endpoint))
                        .header("Authorization", token(ciu)))
                .andExpect(status().isNoContent());

        assertThat(suscripcionRepository.findByEndpoint(endpoint)).isEmpty();
        assertThat(push().estaDisponible(ciu)).isFalse();
    }

    @Test
    void bajaDeUnaAjena_404_yNoLaToca() throws Exception {
        Usuario duena = usuario(Rol.CIUDADANO);
        Usuario otro = usuario(Rol.CIUDADANO);
        String endpoint = endpointNuevo();
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoint, "p256", "auth"))
                        .header("Authorization", token(duena)))
                .andExpect(status().isCreated());

        mockMvc.perform(delete(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoBaja(endpoint))
                        .header("Authorization", token(otro)))
                .andExpect(status().isNotFound());

        assertThat(duenoDe(endpoint)).isEqualTo(duena.getId());
    }

    @Test
    void bajaDeUnaInexistente_404() throws Exception {
        mockMvc.perform(delete(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoBaja(endpointNuevo()))
                        .header("Authorization", token(usuario(Rol.CIUDADANO))))
                .andExpect(status().isNotFound());
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpointNuevo(), "p256", "auth")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoBaja(endpointNuevo())))
                .andExpect(status().isUnauthorized());
        assertThat(suscripcionRepository.count()).isZero();
    }

    @Test
    void hostNoPermitidoOEnganoso_400_yNoSeGuarda() throws Exception {
        // Contra SSRF (US-21 hara peticiones a este endpoint): solo servicios
        // de push de la lista blanca, comparando el host parseado.
        String auth = token(usuario(Rol.CIUDADANO));
        for (String endpoint : List.of(
                "https://evil.example/push",
                "https://fcm.googleapis.com.evil.com/fcm/send/abc",
                "https://fcm.googleapis.com@evil.com/fcm/send/abc",
                "https://evil.com/fcm.googleapis.com",
                "https://fcm.googleapis.com:8443/fcm/send/abc",
                "https://169.254.169.254/latest/meta-data",
                "https://localhost/push")) {
            mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                            .content(cuerpo(endpoint, "p256", "auth")).header("Authorization", auth))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message", containsString("no esta permitido")));
        }
        assertThat(suscripcionRepository.count()).isZero();
    }

    @Test
    void otrosServiciosDePushConocidos_201() throws Exception {
        String auth = token(usuario(Rol.CIUDADANO));
        for (String endpoint : List.of(
                "https://updates.push.services.mozilla.com/wpush/v2/" + UUID.randomUUID(),
                "https://wns2-par02p.notify.windows.com/w/?token=" + UUID.randomUUID(),
                "https://web.push.apple.com/" + UUID.randomUUID())) {
            mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                            .content(cuerpo(endpoint, "p256", "auth")).header("Authorization", auth))
                    .andExpect(status().isCreated());
        }
    }

    @Test
    void alSuperarElTope_seBorraLaMenosRecientementeRegistrada() throws Exception {
        // Tope por defecto: 10 por usuario (app.notificaciones.push.max-por-usuario).
        Usuario ciu = usuario(Rol.CIUDADANO);
        List<String> endpoints = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String endpoint = endpointNuevo();
            endpoints.add(endpoint);
            mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                            .content(cuerpo(endpoint, "p256", "auth")).header("Authorization", token(ciu)))
                    .andExpect(status().isCreated());
        }
        // Volver a registrar la primera la hace la mas reciente: no se desaloja.
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpoints.get(0), "p256", "auth")).header("Authorization", token(ciu)))
                .andExpect(status().isOk());

        String undecima = endpointNuevo();
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(undecima, "p256", "auth")).header("Authorization", token(ciu)))
                .andExpect(status().isCreated());

        assertThat(suscripcionRepository.count()).isEqualTo(10);
        assertThat(suscripcionRepository.findByEndpoint(undecima)).isPresent();
        assertThat(suscripcionRepository.findByEndpoint(endpoints.get(0))).isPresent();
        // La desalojada es la segunda: la menos recientemente registrada.
        assertThat(suscripcionRepository.findByEndpoint(endpoints.get(1))).isEmpty();
    }

    @Test
    void altasSimultaneasDelMismoEndpoint_ningun500_unaSolaFila() throws Exception {
        Usuario ciu = usuario(Rol.CIUDADANO);
        String auth = token(ciu);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(4);
        try {
            for (int ronda = 0; ronda < 5; ronda++) {
                String endpoint = endpointNuevo();
                java.util.concurrent.CountDownLatch largada = new java.util.concurrent.CountDownLatch(1);
                List<java.util.concurrent.Future<Integer>> respuestas = new java.util.ArrayList<>();
                for (int i = 0; i < 4; i++) {
                    respuestas.add(pool.submit(() -> {
                        largada.await();
                        return mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                                        .content(cuerpo(endpoint, "p256", "auth"))
                                        .header("Authorization", auth))
                                .andReturn().getResponse().getStatus();
                    }));
                }
                largada.countDown();
                List<Integer> codigos = new java.util.ArrayList<>();
                for (java.util.concurrent.Future<Integer> r : respuestas) {
                    codigos.add(r.get(30, java.util.concurrent.TimeUnit.SECONDS));
                }
                assertThat(codigos).allMatch(c -> c == 200 || c == 201);
                assertThat(codigos).filteredOn(c -> c == 201).hasSize(1);
                assertThat(suscripcionRepository.findByEndpoint(endpoint)).isPresent();
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(suscripcionRepository.count()).isEqualTo(5);
    }

    @Test
    void validacion_400() throws Exception {
        String auth = token(usuario(Rol.CIUDADANO));
        // endpoint vacio
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("", "p256", "auth")).header("Authorization", auth))
                .andExpect(status().isBadRequest());
        // endpoint que no es https
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("http://push.example/abc", "p256", "auth")).header("Authorization", auth))
                .andExpect(status().isBadRequest());
        // claves vacias
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpointNuevo(), "", "auth")).header("Authorization", auth))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0]", containsString("keys.p256dh")));
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(endpointNuevo(), "p256", " ")).header("Authorization", auth))
                .andExpect(status().isBadRequest());
        // sin el objeto keys
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpoint\":\"%s\"}".formatted(endpointNuevo())).header("Authorization", auth))
                .andExpect(status().isBadRequest());
        // baja sin endpoint
        mockMvc.perform(delete(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpoint\":\"\"}").header("Authorization", auth))
                .andExpect(status().isBadRequest());

        assertThat(suscripcionRepository.count()).isZero();
    }
}
