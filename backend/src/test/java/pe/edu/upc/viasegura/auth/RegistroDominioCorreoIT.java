package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.port.RecepcionDeCorreo;
import pe.edu.upc.viasegura.auth.port.VerificadorDeDominioDeCorreo;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * El registro exige un correo veridico (NC-09): rechaza con 409, sin crear la
 * cuenta, un dominio desechable (la lista versionada, sin red) y uno que no
 * recibe correo segun el DNS; si el DNS falla, registra igual (falla
 * abierto).
 *
 * <p>El puerto del DNS se simula: la suite no depende de la red. El
 * adaptador real lo prueba {@code DnsVerificadorDeDominioAdapterTest}.</p>
 */
class RegistroDominioCorreoIT extends AbstractPostgisIT {

    private static final String MENSAJE_DESECHABLE = "No aceptamos correos temporales o desechables. Usa una"
            + " dirección que revises seguido: ahí te avisaremos cómo avanzan tus reportes.";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;

    @MockitoBean
    VerificadorDeDominioDeCorreo verificadorDeDominio;

    @BeforeEach
    void porDefectoElDominioRecibeCorreo() {
        when(verificadorDeDominio.verificar(anyString())).thenReturn(RecepcionDeCorreo.RECIBE);
    }

    private ResultActions registrar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Ruiz","aceptaTerminos":true,"versionTerminos":"%s"}
                        """.formatted(email, versionTerminos)));
    }

    private static String usuario() {
        return "dominio-" + UUID.randomUUID();
    }

    @Test
    void dominioQueRecibeCorreo_201_yElPuertoRecibioElDominio() throws Exception {
        String email = usuario() + "@lima.pe";

        registrar(email).andExpect(status().isCreated());

        verify(verificadorDeDominio).verificar("lima.pe");
        assertThat(usuarioRepository.existsByEmail(email)).isTrue();
    }

    @Test
    void dominioSinMx_409ConElDominioEnElMensaje_yNoCreaLaCuenta() throws Exception {
        String email = usuario() + "@gmail.con";
        when(verificadorDeDominio.verificar("gmail.con")).thenReturn(RecepcionDeCorreo.NO_RECIBE);

        registrar(email)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("DOMINIO_SIN_CORREO")))
                .andExpect(jsonPath("$.message", is("El dominio «gmail.con» no puede recibir correos. Revisa"
                        + " que esté bien escrito o usa otra dirección.")));

        assertThat(usuarioRepository.existsByEmail(email)).isFalse();
    }

    @Test
    void dominioDesechable_409SinConsultarElDns_yNoCreaLaCuenta() throws Exception {
        for (String dominio : new String[] {"mailinator.com", "10minutemail.com", "temp-mail.org", "yopmail.com"}) {
            String email = usuario() + "@" + dominio;

            registrar(email)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.codigo", is("CORREO_DESECHABLE")))
                    .andExpect(jsonPath("$.message", is(MENSAJE_DESECHABLE)));

            assertThat(usuarioRepository.existsByEmail(email)).isFalse();
        }
        verify(verificadorDeDominio, never()).verificar(anyString());
    }

    @Test
    void subdominioDeUnDesechable_yConMayusculas_409() throws Exception {
        String email = usuario() + "@Bandeja.MAILINATOR.com";

        registrar(email)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("CORREO_DESECHABLE")));

        assertThat(usuarioRepository.existsByEmail(email)).isFalse();
    }

    @Test
    void dnsCaido_registraIgual() throws Exception {
        // Falla abierto (decision del usuario, 28/10): el adaptador registra
        // el WARN y devuelve DESCONOCIDA; el enlace es la prueba definitiva.
        String email = usuario() + "@municipio-sin-dns.pe";
        when(verificadorDeDominio.verificar("municipio-sin-dns.pe")).thenReturn(RecepcionDeCorreo.DESCONOCIDA);

        registrar(email).andExpect(status().isCreated());

        assertThat(usuarioRepository.existsByEmail(email)).isTrue();
        assertThat(usuarioRepository.findByEmail(email).orElseThrow().isCorreoConfirmado()).isFalse();
    }

    @Test
    void elDominioSeVerificaAntesQueElCorreoDuplicado() throws Exception {
        // Un correo ya registrado con un dominio que deja de recibir correo:
        // el 409 es el del dominio, que no dice nada de las cuentas.
        String email = usuario() + "@lima.pe";
        registrar(email).andExpect(status().isCreated());
        when(verificadorDeDominio.verificar("lima.pe")).thenReturn(RecepcionDeCorreo.NO_RECIBE);

        registrar(email)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("DOMINIO_SIN_CORREO")));
    }
}
