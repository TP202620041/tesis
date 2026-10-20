package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icegreen.greenmail.util.GreenMailUtil;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.PasswordResetToken;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.PasswordResetTokenRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/** Recuperacion de contrasena por token con expiracion (US-03). */
class PasswordResetIT extends AbstractPostgisMailIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    PasswordResetTokenRepository tokenRepository;
    @Autowired
    PasswordEncoder passwordEncoder;

    @BeforeEach
    void limpiarTokens() {
        // BD de test persistente y compartida entre clases: evita que tokens
        // de corridas previas contaminen los conteos de este suite.
        tokenRepository.deleteAll();
    }

    /**
     * Solo con los terminos: <b>sin</b> el consentimiento NOTIFICACIONES_CORREO,
     * a proposito (D-12): el correo de recuperacion es de seguridad y se envia siempre, asi que estos IT prueban que no depende de ese
     * permiso.
     */
    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("original123"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String cuerpoRecuperar(String email) {
        return "{\"email\":\"%s\"}".formatted(email);
    }

    private String cuerpoRestablecer(String token, String nuevaPassword) {
        return "{\"token\":\"%s\",\"nuevaPassword\":\"%s\"}".formatted(token, nuevaPassword);
    }

    @Test
    void solicitarRecuperacion_conEmailRegistrado_enviaCorreoConToken_202() throws Exception {
        Usuario usuario = ciudadano();

        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(usuario.getEmail())))
                .andExpect(status().isAccepted());

        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        MimeMessage[] recibidos = greenMail.getReceivedMessages();
        assertThat(recibidos).hasSize(1);
        assertThat(recibidos[0].getAllRecipients()[0].toString()).isEqualTo(usuario.getEmail());

        // Marca visible: nombre del remitente y prefijo del asunto.
        InternetAddress remitente = (InternetAddress) recibidos[0].getFrom()[0];
        assertThat(remitente.getPersonal()).isEqualTo("Ciudad Viva");
        assertThat(remitente.getAddress()).isEqualTo("no-reply@viasegura.pe");
        assertThat(recibidos[0].getSubject()).isEqualTo("Ciudad Viva: recuperacion de contrasena");

        // El token persistido es el mismo que se envio por correo.
        var tokens = tokenRepository.findAll();
        assertThat(tokens).hasSize(1);
        assertThat(GreenMailUtil.getBody(recibidos[0])).contains(tokens.get(0).getToken());
    }

    @Test
    void solicitarRecuperacion_conEmailNoRegistrado_noEnviaCorreo_peroResponde202() throws Exception {
        // Sin filtracion de que correos existen: misma respuesta, sin envio.
        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar("nadie-" + UUID.randomUUID() + "@lima.pe")))
                .andExpect(status().isAccepted());

        assertThat(greenMail.getReceivedMessages()).isEmpty();
        assertThat(tokenRepository.findAll()).isEmpty();
    }

    @Test
    void restablecerConTokenValido_actualizaPassword_permiteLoginConNueva_yBloqueaAntigua() throws Exception {
        Usuario usuario = ciudadano();
        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(usuario.getEmail())))
                .andExpect(status().isAccepted());
        String token = tokenRepository.findAll().get(0).getToken();

        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(token, "nuevaClave123")))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"nuevaClave123\"}"
                                .formatted(usuario.getEmail())))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"original123\"}"
                                .formatted(usuario.getEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void restablecerConTokenYaUsado_409() throws Exception {
        Usuario usuario = ciudadano();
        PasswordResetToken token = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES))
                .usedAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                .build());

        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(token.getToken(), "otraClave123")))
                .andExpect(status().isConflict());
    }

    @Test
    void restablecerConTokenVencido_409() throws Exception {
        Usuario usuario = ciudadano();
        PasswordResetToken token = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                .build());

        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(token.getToken(), "otraClave123")))
                .andExpect(status().isConflict());
    }

    @Test
    void restablecerConTokenInexistente_404() throws Exception {
        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(UUID.randomUUID().toString(), "otraClave123")))
                .andExpect(status().isNotFound());
    }
}
