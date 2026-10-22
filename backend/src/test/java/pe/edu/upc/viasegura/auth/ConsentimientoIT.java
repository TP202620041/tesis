package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import pe.edu.upc.viasegura.auth.domain.Consentimiento;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.ConsentimientoRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Consentimiento por finalidad y version (D-12, NC-07b): registro (US-01),
 * {@code debeAceptarTerminos} en {@code /me}, los endpoints
 * {@code /api/auth/me/consentimientos} y su efecto en las suscripciones push.
 *
 * <p>{@code consentimiento} y {@code suscripcion_push} solo referencian a
 * {@code usuario}, no a {@code reporte}: no entran en {@code limpiezaFkSafe}
 * y esta clase las limpia en su propio {@code @BeforeEach}.</p>
 */
class ConsentimientoIT extends AbstractPostgisIT {

    private static final String RUTA = "/api/auth/me/consentimientos";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    ConsentimientoRepository consentimientoRepository;
    @Autowired
    SuscripcionPushRepository suscripcionPushRepository;

    @Value("${app.legal.version-terminos}")
    String versionVigente;

    @BeforeEach
    void limpiar() {
        suscripcionPushRepository.deleteAll();
        consentimientoRepository.deleteAll();
    }

    // ------------------------------------------------------------------ apoyo

    private static String correo() {
        return "consent-" + UUID.randomUUID() + "@lima.pe";
    }

    private static String registro(String email, String terminos) {
        return """
                {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Ruiz"%s}
                """.formatted(email, terminos);
    }

    /** Usuario creado sin pasar por el registro: como los anteriores a NC-07b, sin fila de consentimiento. */
    private Usuario usuarioSinConsentimiento() {
        return usuarioRepository.save(Usuario.builder()
                .email(correo())
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Antigua").rol(Rol.CIUDADANO).build());
    }

    /** Usuario con los terminos aceptados (ruta normal), sin permisos de notificacion. */
    private Usuario usuarioConTerminos() {
        return guardarConTerminos(Usuario.builder()
                .email(correo())
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Nueva").rol(Rol.CIUDADANO).build());
    }

    private String token(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private static String aceptar(FinalidadConsentimiento finalidad, String version) {
        return "{\"finalidad\":\"%s\",\"version\":\"%s\"}".formatted(finalidad, version);
    }

    private static String suscripcion(String endpoint) {
        return """
                {"endpoint":"%s","keys":{"p256dh":"p256","auth":"auth"},"userAgent":"Chrome"}
                """.formatted(endpoint);
    }

    private long filasDe(Usuario u) {
        return consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(u.getId()).size();
    }

    // -------------------------------------------------------------- registro

    @Test
    void registro_sinAceptarTerminos_400() throws Exception {
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo(), "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(containsString("aceptaTerminos"))))
                .andExpect(jsonPath("$.details", hasItem(containsString("versionTerminos"))));
    }

    @Test
    void registro_aceptaTerminosFalse_400YNoCreaLaCuenta() throws Exception {
        String email = correo();
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(email,
                                ",\"aceptaTerminos\":false,\"versionTerminos\":\"" + versionVigente + "\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details", hasItem(containsString("aceptaTerminos"))));
        assertThat(usuarioRepository.existsByEmail(email)).isFalse();
    }

    @Test
    void registro_conVersionVieja_409YNoCreaLaCuenta() throws Exception {
        String email = correo();
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(email, ",\"aceptaTerminos\":true,\"versionTerminos\":\"2020-01-v0\"")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString(versionVigente)));
        assertThat(usuarioRepository.existsByEmail(email)).isFalse();
    }

    @Test
    void registro_conTerminos_creaLaFilaYNoDebeAceptar() throws Exception {
        String email = correo();
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(email,
                                ",\"aceptaTerminos\":true,\"versionTerminos\":\"" + versionVigente + "\"")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.usuario.debeAceptarTerminos", is(false)))
                .andReturn();
        String token = objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();

        Usuario u = usuarioRepository.findByEmail(email).orElseThrow();
        List<Consentimiento> filas = consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(u.getId());
        assertThat(filas).hasSize(1);
        assertThat(filas.get(0).getFinalidad()).isEqualTo(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD);
        assertThat(filas.get(0).getVersionDocumento()).isEqualTo(versionVigente);
        assertThat(filas.get(0).getRevocadoEn()).isNull();

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.debeAceptarTerminos", is(false)));
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"secreta123\"}".formatted(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.debeAceptarTerminos", is(false)));
        mockMvc.perform(get(RUTA).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versionTerminosVigente", is(versionVigente)))
                .andExpect(jsonPath("$.debeAceptarTerminos", is(false)))
                .andExpect(jsonPath("$.vigentes.length()", is(1)))
                .andExpect(jsonPath("$.vigentes[0].finalidad", is("TERMINOS_Y_PRIVACIDAD")))
                .andExpect(jsonPath("$.vigentes[0].versionDocumento", is(versionVigente)))
                .andExpect(jsonPath("$.vigentes[0].aceptadoEn", notNullValue()))
                .andExpect(jsonPath("$.historial.length()", is(1)));
    }

    // ------------------------------------------------- usuarios sin aceptacion

    @Test
    void usuarioSinFila_debeAceptar_yAceptarLaVigenteLoResuelve() throws Exception {
        Usuario u = usuarioSinConsentimiento();

        mockMvc.perform(get("/api/auth/me").header("Authorization", token(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.debeAceptarTerminos", is(true)));

        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, versionVigente)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.finalidad", is("TERMINOS_Y_PRIVACIDAD")))
                .andExpect(jsonPath("$.vigente", is(true)));

        mockMvc.perform(get("/api/auth/me").header("Authorization", token(u)))
                .andExpect(jsonPath("$.debeAceptarTerminos", is(false)));

        // Repetir la misma aceptacion no agrega otra fila al historial.
        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, versionVigente)))
                .andExpect(status().isOk());
        assertThat(filasDe(u)).isEqualTo(1);
    }

    @Test
    void aceptarTerminosDeVersionNoVigente_409YNoGuarda() throws Exception {
        Usuario u = usuarioSinConsentimiento();
        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, "2020-01-v0")))
                .andExpect(status().isConflict());
        assertThat(filasDe(u)).isZero();
    }

    @Test
    void terminosDeUnaVersionAnterior_debeAceptarDeNuevo() throws Exception {
        // Se publico un texto nuevo: la aceptacion vieja queda en el historial
        // pero ya no autoriza.
        Usuario u = usuarioSinConsentimiento();
        consentimientoRepository.save(Consentimiento.builder()
                .usuario(u).finalidad(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD)
                .versionDocumento("2020-01-v0").aceptadoEn(Instant.now()).build());

        mockMvc.perform(get("/api/auth/me").header("Authorization", token(u)))
                .andExpect(jsonPath("$.debeAceptarTerminos", is(true)));
        mockMvc.perform(get(RUTA).header("Authorization", token(u)))
                .andExpect(jsonPath("$.debeAceptarTerminos", is(true)))
                .andExpect(jsonPath("$.vigentes.length()", is(0)))
                .andExpect(jsonPath("$.historial[0].vigente", is(false)));

        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, versionVigente)))
                .andExpect(status().isCreated());
        mockMvc.perform(get(RUTA).header("Authorization", token(u)))
                .andExpect(jsonPath("$.debeAceptarTerminos", is(false)))
                .andExpect(jsonPath("$.historial.length()", is(2)));
    }

    // ------------------------------------------------------------- revocacion

    @Test
    void revocarPush_borraLasSuscripciones_yLuegoSuscribirseDa409() throws Exception {
        Usuario u = usuarioConTerminos();
        String endpoint = "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID();

        // Sin consentimiento push no hay suscripcion.
        mockMvc.perform(post("/api/notificaciones/suscripciones").header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(suscripcion(endpoint)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("notificaciones push")));

        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.NOTIFICACIONES_PUSH, "push-2026-10-v1")))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/notificaciones/suscripciones").header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(suscripcion(endpoint)))
                .andExpect(status().isCreated());
        assertThat(suscripcionPushRepository.existsByUsuarioIdAndActivaTrue(u.getId())).isTrue();

        mockMvc.perform(delete(RUTA + "/NOTIFICACIONES_PUSH").header("Authorization", token(u)))
                .andExpect(status().isNoContent());

        assertThat(suscripcionPushRepository.findByEndpoint(endpoint)).isEmpty();
        List<Consentimiento> push = consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(u.getId())
                .stream().filter(c -> c.getFinalidad() == FinalidadConsentimiento.NOTIFICACIONES_PUSH).toList();
        assertThat(push).hasSize(1);
        assertThat(push.get(0).getRevocadoEn()).isNotNull();

        mockMvc.perform(get(RUTA).header("Authorization", token(u)))
                .andExpect(jsonPath("$.vigentes[*].finalidad", not(hasItem("NOTIFICACIONES_PUSH"))))
                .andExpect(jsonPath("$.historial[0].finalidad", is("NOTIFICACIONES_PUSH")))
                .andExpect(jsonPath("$.historial[0].revocadoEn", notNullValue()))
                .andExpect(jsonPath("$.historial[0].vigente", is(false)));

        mockMvc.perform(post("/api/notificaciones/suscripciones").header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(suscripcion(endpoint)))
                .andExpect(status().isConflict());

        // Revocar de nuevo es idempotente.
        mockMvc.perform(delete(RUTA + "/NOTIFICACIONES_PUSH").header("Authorization", token(u)))
                .andExpect(status().isNoContent());
    }

    @Test
    void revocarPush_noTocaLasSuscripcionesDeOtroUsuario() throws Exception {
        Usuario a = usuarioConTerminos();
        Usuario b = usuarioConTerminos();
        String endpointB = "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID();
        for (Usuario u : List.of(a, b)) {
            mockMvc.perform(post(RUTA).header("Authorization", token(u))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(aceptar(FinalidadConsentimiento.NOTIFICACIONES_PUSH, "push-2026-10-v1")))
                    .andExpect(status().isCreated());
        }
        mockMvc.perform(post("/api/notificaciones/suscripciones").header("Authorization", token(b))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(suscripcion(endpointB)))
                .andExpect(status().isCreated());

        mockMvc.perform(delete(RUTA + "/NOTIFICACIONES_PUSH").header("Authorization", token(a)))
                .andExpect(status().isNoContent());

        assertThat(suscripcionPushRepository.findByEndpoint(endpointB)).isPresent();
        mockMvc.perform(get(RUTA).header("Authorization", token(b)))
                .andExpect(jsonPath("$.vigentes[0].finalidad", is("NOTIFICACIONES_PUSH")));
    }

    @Test
    void revocarTerminos_409YSiguenVigentes() throws Exception {
        Usuario u = usuarioSinConsentimiento();
        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, versionVigente)))
                .andExpect(status().isCreated());

        mockMvc.perform(delete(RUTA + "/TERMINOS_Y_PRIVACIDAD").header("Authorization", token(u)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("baja de la cuenta")));

        mockMvc.perform(get("/api/auth/me").header("Authorization", token(u)))
                .andExpect(jsonPath("$.debeAceptarTerminos", is(false)));
    }

    @Test
    void revocarFinalidadInexistente_400() throws Exception {
        mockMvc.perform(delete(RUTA + "/MARKETING").header("Authorization", token(usuarioSinConsentimiento())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aceptarSinFinalidadOSinVersion_400() throws Exception {
        Usuario u = usuarioSinConsentimiento();
        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":\"v1\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"finalidad\":\"NOTIFICACIONES_CORREO\",\"version\":\" \"}"))
                .andExpect(status().isBadRequest());
        assertThat(filasDe(u)).isZero();
    }

    // ---------------------------------------------------------- visibilidad

    @Test
    void soloLosPropios_otroUsuarioNoVeLosTuyos() throws Exception {
        Usuario a = usuarioSinConsentimiento();
        Usuario b = usuarioSinConsentimiento();
        mockMvc.perform(post(RUTA).header("Authorization", token(a))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.NOTIFICACIONES_CORREO, "correo-2026-10-v1")))
                .andExpect(status().isCreated());

        mockMvc.perform(get(RUTA).header("Authorization", token(b)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.historial.length()", is(0)))
                .andExpect(jsonPath("$.vigentes[*].finalidad", not(hasItem("NOTIFICACIONES_CORREO"))));
        mockMvc.perform(get(RUTA).header("Authorization", token(a)))
                .andExpect(jsonPath("$.vigentes[0].finalidad", is("NOTIFICACIONES_CORREO")));
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(get(RUTA)).andExpect(status().isUnauthorized());
        mockMvc.perform(post(RUTA).contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.NOTIFICACIONES_PUSH, "v1")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(RUTA + "/NOTIFICACIONES_PUSH")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------- bloqueo por terminos pendientes

    @Test
    void terminosPendientes_rutasPrivadas403ConCodigo() throws Exception {
        Usuario u = usuarioSinConsentimiento();

        mockMvc.perform(multipart("/api/reportes").header("Authorization", token(u)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.codigo", is("TERMINOS_PENDIENTES")))
                .andExpect(jsonPath("$.status", is(403)));
        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", token(u)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.codigo", is("TERMINOS_PENDIENTES")));
        mockMvc.perform(get("/api/soporte/tickets/mis-tickets").header("Authorization", token(u)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.codigo", is("TERMINOS_PENDIENTES")));
    }

    @Test
    void terminosPendientes_meConsentimientosYBajaPushSiguenAbiertas_yLasPublicasNoCambian() throws Exception {
        Usuario u = usuarioSinConsentimiento();

        mockMvc.perform(get("/api/auth/me").header("Authorization", token(u)))
                .andExpect(status().isOk());
        mockMvc.perform(get(RUTA).header("Authorization", token(u)))
                .andExpect(status().isOk());
        // Cerrar sesion: la baja de la suscripcion de este navegador no se bloquea.
        mockMvc.perform(delete("/api/notificaciones/suscripciones").header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/x\"}"))
                .andExpect(status().isNotFound());
        // Ruta publica con el token de un usuario pendiente: igual que anonima.
        mockMvc.perform(get("/api/reportes").header("Authorization", token(u)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/categorias").header("Authorization", token(u)))
                .andExpect(status().isOk());
    }

    @Test
    void terminosPendientes_trasAceptarLaRutaRespondeNormal() throws Exception {
        Usuario u = usuarioSinConsentimiento();
        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", token(u)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post(RUTA).header("Authorization", token(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(aceptar(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, versionVigente)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", token(u)))
                .andExpect(status().isOk());
    }

    @Test
    void terminosPendientes_sinTokenSigueSiendo401() throws Exception {
        mockMvc.perform(get("/api/reportes/mis-reportes"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.codigo").doesNotExist());
    }

    // ------------------------------------------------------- doble POST (V14)

    @Test
    void aceptacionesSimultaneas_unaSolaFila() throws Exception {
        Usuario u = usuarioConTerminos();
        int hilos = 4;
        CountDownLatch salida = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(hilos);
        List<Integer> codigos = new ArrayList<>();
        try {
            Callable<Integer> pedido = () -> {
                salida.await();
                return mockMvc.perform(post(RUTA).header("Authorization", token(u))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(aceptar(FinalidadConsentimiento.NOTIFICACIONES_CORREO, "correo-v1")))
                        .andReturn().getResponse().getStatus();
            };
            List<Future<Integer>> resultados = new ArrayList<>();
            for (int i = 0; i < hilos; i++) {
                resultados.add(pool.submit(pedido));
            }
            salida.countDown();
            for (Future<Integer> f : resultados) {
                codigos.add(f.get(30, TimeUnit.SECONDS));
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(codigos).allMatch(c -> Set.of(200, 201).contains(c));
        assertThat(codigos).containsOnlyOnce(201);
        long correo = consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(u.getId()).stream()
                .filter(c -> c.getFinalidad() == FinalidadConsentimiento.NOTIFICACIONES_CORREO).count();
        assertThat(correo).isEqualTo(1);
    }

    @Test
    void revocarYVolverAAceptarLaMismaVersion_dejaFilaNueva() throws Exception {
        Usuario u = usuarioConTerminos();
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post(RUTA).header("Authorization", token(u))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(aceptar(FinalidadConsentimiento.NOTIFICACIONES_CORREO, "correo-v1")))
                    .andExpect(status().isCreated());
            mockMvc.perform(delete(RUTA + "/NOTIFICACIONES_CORREO").header("Authorization", token(u)))
                    .andExpect(status().isNoContent());
        }
        long correo = consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(u.getId()).stream()
                .filter(c -> c.getFinalidad() == FinalidadConsentimiento.NOTIFICACIONES_CORREO).count();
        assertThat(correo).isEqualTo(2);
    }

    @Test
    void ciudadanoConTerminos_enRutaDeFuncionario_403SinCodigo() throws Exception {
        // El 403 por rol (@PreAuthorize) no se confunde con el de terminos pendientes.
        mockMvc.perform(get("/api/reportes/bandeja").header("Authorization", token(usuarioConTerminos())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message", is("Acceso denegado")))
                .andExpect(jsonPath("$.codigo").doesNotExist());
    }
}
