package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.mail.internet.MimeMessage;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.domain.EstadoEntrega;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;
import pe.edu.upc.viasegura.notificaciones.domain.Notificacion;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;
import pe.edu.upc.viasegura.notificaciones.domain.TipoEvento;
import pe.edu.upc.viasegura.notificaciones.repository.NotificacionRepository;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;
import pe.edu.upc.viasegura.notificaciones.service.NotificacionService;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;
import pe.edu.upc.viasegura.support.EnviadorWebPushFake;

/**
 * Notificacion al ciudadano ante un cambio de estado (US-16, US-21).
 *
 * <p>Usa GreenMail (SMTP embebido en la JVM, puerto 3025 configurado en
 * {@link AbstractPostgisIT}) para verificar el envio real de email, sin
 * depender de Docker/Mailhog. El canal PUSH esta disponible solo con una
 * suscripcion activa (NC-07), permiso (D-12) y claves VAPID; el envio real
 * (US-21) pasa por el puerto {@code EnviadorWebPush}, que aqui es el fake
 * {@link EnviadorWebPushFake}: nunca se llama a un servicio de push real.</p>
 */
class NotificacionIT extends AbstractPostgisMailIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    NotificacionRepository notificacionRepository;
    @Autowired
    SuscripcionPushRepository suscripcionPushRepository;
    @Autowired
    ObjectMapper objectMapper;

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL)
                .distrito(distritoGestion)
                .build());
    }

    /**
     * Ciudadano con el consentimiento de correo vigente: desde NC-07b (D-12)
     * los avisos de cambio de estado solo salen por correo con ese permiso.
     */
    private Usuario ciudadano(PreferenciaNotificacion preferencia) {
        Usuario u = ciudadanoSinPermisos(preferencia);
        otorgar(u, FinalidadConsentimiento.NOTIFICACIONES_CORREO);
        return u;
    }

    /** Solo con los terminos aceptados: sin permiso de correo ni de push. */
    private Usuario ciudadanoSinPermisos(PreferenciaNotificacion preferencia) {
        Usuario.UsuarioBuilder builder = Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina")
                .rol(Rol.CIUDADANO);
        if (preferencia != null) {
            builder.preferenciaNotificacion(preferencia);
        }
        return guardarConTerminos(builder.build());
    }

    private Reporte reporte(Distrito distrito, EstadoReporte estado, Usuario creador) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria())
                .creador(creador)
                .distrito(distrito)
                .estado(estado)
                .totalAdhesiones(1)
                .build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** PATCH del funcionario que lleva el reporte a EN_PROCESO. */
    private void cambiarAEnProceso(Usuario funcionario, Long reporteId) throws Exception {
        mockMvc.perform(patch("/api/reportes/{id}/estado", reporteId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"EN_PROCESO\",\"comentario\":\"Cuadrilla asignada\"}")
                        .header("Authorization", "Bearer " + token(funcionario)))
                .andExpect(status().isOk());
    }

    @Test
    void preferenciaEmail_persisteNotificacionEmailYEnviaCorreo() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.EMAIL);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        // Se persistio exactamente una notificacion, por EMAIL, enviada.
        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(1);
        Notificacion n = notifs.get(0);
        assertThat(n.getCanal()).isEqualTo(CanalNotificacion.EMAIL);
        assertThat(n.getEstadoEntrega()).isEqualTo(EstadoEntrega.ENVIADA);
        assertThat(n.getSentAt()).isNotNull();

        // Y el correo real llego a GreenMail, dirigido al ciudadano.
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        MimeMessage[] recibidos = greenMail.getReceivedMessages();
        assertThat(recibidos).hasSize(1);
        assertThat(recibidos[0].getAllRecipients()[0].toString()).isEqualTo(ciudadano.getEmail());
    }

    @Test
    void preferenciaPush_caeAEmail_fallbackUS16Esc2() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        // Push fallido (no disponible) + email de fallback entregado.
        assertThat(notifs).hasSize(2);
        Notificacion push = notifs.stream()
                .filter(x -> x.getCanal() == CanalNotificacion.PUSH).findFirst().orElseThrow();
        Notificacion email = notifs.stream()
                .filter(x -> x.getCanal() == CanalNotificacion.EMAIL).findFirst().orElseThrow();
        assertThat(push.getEstadoEntrega()).isEqualTo(EstadoEntrega.FALLIDA);
        assertThat(email.getEstadoEntrega()).isEqualTo(EstadoEntrega.ENVIADA);

        // El fallback envio un correo real al ciudadano.
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        assertThat(greenMail.getReceivedMessages()[0].getAllRecipients()[0].toString())
                .isEqualTo(ciudadano.getEmail());
    }

    /**
     * Suscripcion push activa (NC-07) con su consentimiento (D-12): el canal
     * PUSH pasa a estar disponible.
     */
    private String suscribirPush(Usuario usuario) {
        otorgar(usuario, FinalidadConsentimiento.NOTIFICACIONES_PUSH);
        return guardarSuscripcion(usuario);
    }

    /** Fila de suscripcion sin consentimiento, como las anteriores a NC-07b. Devuelve el endpoint. */
    private String guardarSuscripcion(Usuario usuario) {
        String endpoint = "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID();
        suscripcionPushRepository.save(SuscripcionPush.builder()
                .usuario(usuario)
                .endpoint(endpoint)
                .p256dh("p256").auth("auth")
                .build());
        return endpoint;
    }

    @Test
    void preferenciaPush_conSuscripcionActiva_enviaPushYNoCorreo() throws Exception {
        // US-21: con permiso, suscripcion y claves VAPID, el push se entrega
        // y no hace falta el fallback a correo.
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        suscribirPush(ciudadano);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(1);
        assertThat(notifs.get(0).getCanal()).isEqualTo(CanalNotificacion.PUSH);
        assertThat(notifs.get(0).getEstadoEntrega()).isEqualTo(EstadoEntrega.ENVIADA);
        assertThat(enviadorPush.enviados()).hasSize(1);
        assertThat(greenMail.waitForIncomingEmail(1500, 1)).isFalse();
    }

    @Test
    void preferenciaPush_errorDelServicioPush_caeACorreo() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        String endpoint = suscribirPush(ciudadano);
        enviadorPush.responder(endpoint, ResultadoEnvioPush.ERROR);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(2);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.PUSH && n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        // La suscripcion sigue activa: un error puede ser transitorio.
        assertThat(suscripcionPushRepository.findByEndpoint(endpoint).orElseThrow().isActiva()).isTrue();
    }

    @Test
    void preferenciaAmbas_conSuscripcionActiva_pushYCorreo() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.AMBAS);
        suscribirPush(ciudadano);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(2);
        assertThat(notifs).allMatch(n -> n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
        assertThat(enviadorPush.enviados()).hasSize(1);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        assertThat(greenMail.getReceivedMessages()).hasSize(1);
    }

    // ------------------------------------------------------- US-21: push real

    @Test
    void cambioDeEstado_enviaATodasLasSuscripcionesActivas_conPayloadSinSenalesInternas() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        String movil = suscribirPush(ciudadano);
        String pc = guardarSuscripcion(ciudadano);
        String inactiva = guardarSuscripcion(ciudadano);
        SuscripcionPush s = suscripcionPushRepository.findByEndpoint(inactiva).orElseThrow();
        s.setActiva(false);
        suscripcionPushRepository.save(s);
        Usuario otro = ciudadano(PreferenciaNotificacion.PUSH);
        String deOtro = suscribirPush(otro);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<EnviadorWebPushFake.Envio> enviados = enviadorPush.enviados();
        assertThat(enviados).extracting(e -> e.destino().endpoint()).containsExactlyInAnyOrder(movil, pc);
        assertThat(enviados).extracting(e -> e.destino().endpoint()).doesNotContain(inactiva, deOtro);
        EnviadorWebPushFake.Envio envio = enviados.get(0);
        assertThat(envio.topico()).isEqualTo("reporte-" + reporte.getId());
        var json = objectMapper.readTree(envio.payload());
        assertThat(json.get("url").asText()).isEqualTo("/mis-reportes/" + reporte.getId());
        assertThat(json.get("reporteId").asLong()).isEqualTo(reporte.getId());
        assertThat(json.get("estado").asText()).isEqualTo("EN_PROCESO");
        assertThat(json.get("titulo").asText()).isNotBlank();
        // Cuerpo legible para el ciudadano; el valor tecnico va solo en "estado".
        assertThat(json.get("cuerpo").asText()).contains("esta en proceso").doesNotContain("EN_PROCESO");
        // Solo esas cinco claves: ninguna senal interna ni datos de otros usuarios.
        assertThat(json.fieldNames()).toIterable()
                .containsExactlyInAnyOrder("titulo", "cuerpo", "url", "reporteId", "estado");
        assertThat(envio.payload()).doesNotContain("Cuadrilla", ciudadano.getEmail(), "Reincidencia");
    }

    @Test
    void servicioPushResponde410_laSuscripcionQuedaInactiva() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        String caducada = suscribirPush(ciudadano);
        String vigente = guardarSuscripcion(ciudadano);
        enviadorPush.responder(caducada, ResultadoEnvioPush.SUSCRIPCION_CADUCADA);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        assertThat(suscripcionPushRepository.findByEndpoint(caducada).orElseThrow().isActiva()).isFalse();
        assertThat(suscripcionPushRepository.findByEndpoint(vigente).orElseThrow().isActiva()).isTrue();
        // Se entrego a la otra: el aviso cuenta como enviado por push.
        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).singleElement().satisfies(n -> {
            assertThat(n.getCanal()).isEqualTo(CanalNotificacion.PUSH);
            assertThat(n.getEstadoEntrega()).isEqualTo(EstadoEntrega.ENVIADA);
        });
    }

    @Test
    void todasLasSuscripcionesResponden410_quedanInactivas_yCaeACorreo() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        String movil = suscribirPush(ciudadano);
        String pc = guardarSuscripcion(ciudadano);
        enviadorPush.responder(movil, ResultadoEnvioPush.SUSCRIPCION_CADUCADA);
        enviadorPush.responder(pc, ResultadoEnvioPush.SUSCRIPCION_CADUCADA);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        assertThat(suscripcionPushRepository.findByEndpoint(movil).orElseThrow().isActiva()).isFalse();
        assertThat(suscripcionPushRepository.findByEndpoint(pc).orElseThrow().isActiva()).isFalse();
        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(2);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.PUSH && n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        // Sin suscripciones activas, el canal ya no esta disponible para el proximo aviso.
        assertThat(notificacionService.canalDisponible(ciudadano, CanalNotificacion.PUSH)).isFalse();
    }

    @Test
    void sinClavesVapid_noSeIntentaPush_yCaeACorreo() throws Exception {
        enviadorPush.setConfigurado(false);
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        suscribirPush(ciudadano);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        assertThat(enviadorPush.enviados()).isEmpty();
        assertThat(notificacionService.canalDisponible(ciudadano, CanalNotificacion.PUSH)).isFalse();
        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.PUSH && n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
    }

    @Test
    void notificacion_asociadaAReporteYCiudadanoConContenidoCorrecto() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.EMAIL);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        Notificacion n = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId()).get(0);
        assertThat(n.getUsuario().getId()).isEqualTo(ciudadano.getId());
        assertThat(n.getReporte().getId()).isEqualTo(reporte.getId());
        assertThat(n.getTipoEvento()).isEqualTo(TipoEvento.REPORTE_EN_PROCESO);
        // El mensaje se compuso desde el evento (distrito, transicion, comentario).
        assertThat(n.getMensaje())
                .contains("Miraflores")
                .contains("RECIBIDO")
                .contains("EN_PROCESO")
                .contains("Cuadrilla asignada");
    }

    @Test
    void ciudadanoSinPreferencia_usaDefaultAmbas_yEntregaEmail() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        // Sin setear preferencia: aplica el default NOT NULL de la entidad (AMBAS).
        Usuario ciudadano = ciudadano(null);
        assertThat(ciudadano.getPreferenciaNotificacion()).isEqualTo(PreferenciaNotificacion.AMBAS);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        // AMBAS => intenta push (falla, stub) y email (entrega). El default es
        // "notificar por todos los canales", nunca silencio.
        assertThat(notifs).hasSize(2);
        assertThat(notifs.stream().anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA))
                .isTrue();
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
    }

    // ---------------------------------------------------- D-12: el permiso manda

    @Autowired
    NotificacionService notificacionService;

    @Test
    void suscripcionSinConsentimientoPush_elCanalPushNoEstaDisponible() {
        // Suscripcion previa a NC-07b (o que no se pudo borrar al revocar):
        // queda inerte porque falta el permiso.
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        guardarSuscripcion(ciudadano);
        assertThat(notificacionService.canalDisponible(ciudadano, CanalNotificacion.PUSH)).isFalse();

        otorgar(ciudadano, FinalidadConsentimiento.NOTIFICACIONES_PUSH);
        assertThat(notificacionService.canalDisponible(ciudadano, CanalNotificacion.PUSH)).isTrue();
    }

    @Test
    void preferenciaEmail_sinConsentimientoDeCorreo_noEnviaYRegistraFallida() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadanoSinPermisos(PreferenciaNotificacion.EMAIL);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(1);
        assertThat(notifs.get(0).getCanal()).isEqualTo(CanalNotificacion.EMAIL);
        assertThat(notifs.get(0).getEstadoEntrega()).isEqualTo(EstadoEntrega.FALLIDA);
        assertThat(greenMail.waitForIncomingEmail(1500, 1)).isFalse();
    }

    @Test
    void preferenciaPush_sinConsentimientoDeCorreo_elFallbackNoEnviaCorreo() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadanoSinPermisos(PreferenciaNotificacion.PUSH);
        enviadorPush.responder(suscribirPush(ciudadano), ResultadoEnvioPush.ERROR);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(2);
        assertThat(notifs).allMatch(n -> n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(greenMail.waitForIncomingEmail(1500, 1)).isFalse();
    }

    @Test
    void sinNingunPermiso_ningunCanal_registraFallidasSinError() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadanoSinPermisos(PreferenciaNotificacion.AMBAS);
        guardarSuscripcion(ciudadano);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        // El cambio de estado se confirma igual (200): el aviso no lo bloquea.
        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(2);
        assertThat(notifs).allMatch(n -> n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(greenMail.waitForIncomingEmail(1500, 1)).isFalse();
    }
}
