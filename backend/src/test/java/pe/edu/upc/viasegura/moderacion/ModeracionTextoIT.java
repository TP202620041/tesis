package pe.edu.upc.viasegura.moderacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.port.VerificadorDeCaptcha;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ComentarioPublicoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * El filtro de groserias fuera de la creacion (NC-10b, D-15): la edicion del
 * reporte (titulo y descripcion), el comentario publico (US-27), y el nombre y
 * el apellido del perfil al registrarse y al editarlo. Cada rechazo es 400
 * {@code TEXTO_NO_PERMITIDO} con el campo en {@code details}, sin la palabra
 * en el cuerpo y sin cambiar nada. La creacion la cubre
 * {@code ModeracionCreacionIT}.
 *
 * <p>El filtro es el real, con la lista versionada. El captcha es un doble
 * que por defecto no se exige; el caso del orden lo exige: en el registro, el
 * captcha va primero (NC-08), como las demas validaciones.</p>
 */
class ModeracionTextoIT extends AbstractPostgisIT {

    @MockitoBean
    VerificadorDeCaptcha verificadorDeCaptcha;

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
    ComentarioPublicoRepository comentarioRepository;

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("texto-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private Reporte reporte(Usuario creador, EstadoReporte estado) {
        CategoriaDano categoria = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).filter(CategoriaDano::isActivo).findFirst().orElseThrow();
        return reporteRepository.save(Reporte.builder()
                .titulo("Hueco frente al parque").descripcion("Profundo").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria).creador(creador)
                .distrito(distritoRepository.findByNombre("Miraflores").orElseThrow())
                .estado(estado).totalAdhesiones(1).build());
    }

    /** El 400 de la moderacion de texto, con el campo, y el cuerpo, para ver que no repite la palabra. */
    private static String rechazado(ResultActions respuesta, String campo) throws Exception {
        return respuesta
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.codigo", is("TEXTO_NO_PERMITIDO")))
                .andExpect(jsonPath("$.details", contains(campo)))
                .andReturn().getResponse().getContentAsString();
    }

    // --- Edicion del reporte (US-08) ------------------------------------------------

    @Test
    void editarElTituloOLaDescripcionConGroserias_400_yElReporteNoCambia() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);

        String cuerpo = rechazado(mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"titulo\": \"Esta pista es una MIERDAAA\"}")
                .header("Authorization", bearer(creador))), "titulo");
        assertThat(cuerpo).doesNotContainIgnoringCase("mierda");

        cuerpo = rechazado(mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"descripcion\": \"Arreglen esto, c.o.j.u.d.o.s\", \"severidad\": \"ALTA\"}")
                .header("Authorization", bearer(creador))), "descripcion");
        assertThat(cuerpo).doesNotContainIgnoringCase("cojudo");

        Reporte guardado = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(guardado.getTitulo()).isEqualTo("Hueco frente al parque");
        assertThat(guardado.getDescripcion()).isEqualTo("Profundo");
        assertThat(guardado.getSeveridad()).isEqualTo(Severidad.MEDIA);
    }

    @Test
    void editarConTextoLegitimo_200() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);

        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"titulo\": \"Vehículo atrapado\", \"descripcion\": \"Conos y obstáculos\"}")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titulo", is("Vehículo atrapado")));
    }

    // --- Comentario publico (US-27) ---------------------------------------------------

    @Test
    void comentarioConGroserias_400_yNoSePublica() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.RESUELTO);

        String cuerpo = rechazado(mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"contenido\": \"Quedo bien, ctm, por fin\"}")
                .header("Authorization", bearer(creador))), "contenido");

        assertThat(cuerpo).doesNotContainIgnoringCase("ctm");
        assertThat(comentarioRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId())).isEmpty();

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contenido\": \"Quedo bien, pusieron conos y señales\"}")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isCreated());
    }

    // --- Nombre del perfil: edicion (US-30) --------------------------------------------

    @Test
    void editarElNombreOElApellidoConGroserias_400_yElPerfilNoCambia() throws Exception {
        Usuario ciudadano = ciudadano();

        rechazado(mockMvc.perform(multipart(HttpMethod.PATCH, "/api/auth/me")
                .param("nombre", "C0jud0")
                .header("Authorization", bearer(ciudadano))), "nombre");
        rechazado(mockMvc.perform(multipart(HttpMethod.PATCH, "/api/auth/me")
                .param("nombre", "Ana María")
                .param("apellido", "Pendejo")
                .header("Authorization", bearer(ciudadano))), "apellido");

        Usuario guardado = usuarioRepository.findByEmail(ciudadano.getEmail()).orElseThrow();
        assertThat(guardado.getNombre()).isEqualTo("Ana");
        assertThat(guardado.getApellido()).isEqualTo("Vecina");
    }

    @Test
    void unApellidoLegitimoQueContieneUnaPalabraDeLaLista_sePuedeUsar() throws Exception {
        Usuario ciudadano = ciudadano();

        mockMvc.perform(multipart(HttpMethod.PATCH, "/api/auth/me")
                        .param("nombre", "Rosa")
                        .param("apellido", "Concha Culqui")
                        .header("Authorization", bearer(ciudadano)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.apellido", is("Concha Culqui")));
    }

    // --- Nombre del perfil: registro (US-01) --------------------------------------------

    private ResultActions registrar(String email, String nombre, String apellido, String captchaToken)
            throws Exception {
        String token = captchaToken == null ? "null" : "\"" + captchaToken + "\"";
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"secreta123","nombre":"%s","apellido":"%s",\
                        "aceptaTerminos":true,"versionTerminos":"%s","captchaToken":%s}
                        """.formatted(email, nombre, apellido, versionTerminos, token)));
    }

    private static String email() {
        return "registro-texto-" + UUID.randomUUID() + "@lima.pe";
    }

    @Test
    void registrarseConUnNombreOApellidoConGroserias_400_yNoCreaLaCuenta() throws Exception {
        String correo = email();

        String cuerpo = rechazado(registrar(correo, "Maricón", "Rojas", null), "nombre");
        assertThat(cuerpo).doesNotContainIgnoringCase("maric");
        rechazado(registrar(correo, "Ana", "Csm", null), "apellido");

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
        registrar(correo, "Ana", "Concha", null).andExpect(status().isCreated());
    }

    @Test
    void enElRegistro_elCaptchaVaPrimero_despuesElNombre() throws Exception {
        when(verificadorDeCaptcha.exigido()).thenReturn(true);
        doThrow(new BusinessException("No pudimos confirmar que no eres un robot. Vuelve a intentarlo."))
                .when(verificadorDeCaptcha).verificar("rechazado");
        String correo = email();

        // Sin token o con uno rechazado, el mensaje es el del captcha aunque el nombre tenga groserias.
        registrar(correo, "Huevón", "Rojas", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("Confirma que no eres un robot")));
        registrar(correo, "Huevón", "Rojas", "rechazado")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("No pudimos confirmar que no eres un robot. Vuelve a intentarlo.")));
        verify(verificadorDeCaptcha, never()).verificar("valido");

        // Con el captcha resuelto, el nombre se rechaza.
        rechazado(registrar(correo, "Huevón", "Rojas", "valido"), "nombre");
        verify(verificadorDeCaptcha).verificar("valido");
        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }
}
