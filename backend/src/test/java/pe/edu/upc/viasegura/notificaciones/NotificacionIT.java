package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.mail.internet.MimeMessage;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
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
import pe.edu.upc.viasegura.notificaciones.domain.Notificacion;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;
import pe.edu.upc.viasegura.notificaciones.domain.TipoEvento;
import pe.edu.upc.viasegura.notificaciones.repository.NotificacionRepository;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/**
 * Notificacion al ciudadano ante un cambio de estado (US-16, US-21).
 *
 * <p>Usa GreenMail (SMTP embebido en la JVM, puerto 3025 configurado en
 * {@link AbstractPostgisIT}) para verificar el envio real de email, sin
 * depender de Docker/Mailhog. El canal PUSH esta disponible solo con una
 * suscripcion activa (NC-07) y su envio real es US-21, asi que toda
 * preferencia que lo incluya cae a email (fallback US-16 Esc.2).</p>
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

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return usuarioRepository.save(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL)
                .distrito(distritoGestion)
                .build());
    }

    private Usuario ciudadano(PreferenciaNotificacion preferencia) {
        Usuario.UsuarioBuilder builder = Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina")
                .rol(Rol.CIUDADANO);
        if (preferencia != null) {
            builder.preferenciaNotificacion(preferencia);
        }
        return usuarioRepository.save(builder.build());
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

    /** Suscripcion push activa (NC-07): el canal PUSH pasa a estar disponible. */
    private void suscribirPush(Usuario usuario) {
        suscripcionPushRepository.save(SuscripcionPush.builder()
                .usuario(usuario)
                .endpoint("https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID())
                .p256dh("p256").auth("auth")
                .build());
    }

    @Test
    void preferenciaPush_conSuscripcionActiva_envioPendienteUS21_caeAEmail() throws Exception {
        // NC-07: con suscripcion el canal esta disponible, pero el envio real
        // es US-21 y todavia lanza. El orquestador lo registra FALLIDA y cae a
        // email igual que cuando no estaba disponible: no se pierde el aviso.
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.PUSH);
        suscribirPush(ciudadano);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).hasSize(2);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.PUSH && n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        assertThat(greenMail.getReceivedMessages()[0].getAllRecipients()[0].toString())
                .isEqualTo(ciudadano.getEmail());
    }

    @Test
    void preferenciaAmbas_conSuscripcionActiva_unSoloCorreo() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano(PreferenciaNotificacion.AMBAS);
        suscribirPush(ciudadano);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        cambiarAEnProceso(func, reporte.getId());

        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        // Push FALLIDA + email ENVIADA; el email ya era objetivo, sin fallback duplicado.
        assertThat(notifs).hasSize(2);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.PUSH && n.getEstadoEntrega() == EstadoEntrega.FALLIDA);
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        assertThat(greenMail.getReceivedMessages()).hasSize(1);
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
}
