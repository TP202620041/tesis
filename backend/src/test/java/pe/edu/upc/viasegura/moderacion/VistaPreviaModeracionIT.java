package pe.edu.upc.viasegura.moderacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * La moderacion en la vista previa (NC-10b, D-15): {@code POST
 * /api/clasificaciones} suma {@code fotoRechazada}. Si la foto se rechaza,
 * avisa y no clasifica; si la moderacion no responde, {@code false} y la
 * sugerencia de siempre. Nunca expone el puntaje.
 *
 * <p>El puerto {@link ModeradorDeImagen} es un doble, encendido; el
 * clasificador es el falso de {@code application-test.yml}, que sugiere
 * «Bache» en cualquier foto: si la respuesta no trae categoria, es que no se
 * clasifico.</p>
 */
class VistaPreviaModeracionIT extends AbstractPostgisIT {

    private static final String VERSION = "nsfw-vit-tiny-384-0c26ec2-1ba7cf26";

    @MockitoBean
    ModeradorDeImagen moderador;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ClasificadorDano clasificador;

    @BeforeEach
    void moderacionEncendida() {
        when(moderador.estaActivo()).thenReturn(true);
    }

    private ResultActions previa() throws Exception {
        Usuario ciudadano = guardarConTerminos(Usuario.builder()
                .email("previa-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
        MockMultipartFile foto = new MockMultipartFile("foto", "IMG_0001.JPG", "image/jpeg",
                ImagenesDePrueba.jpegConExif(640, 480, 6));
        return mockMvc.perform(multipart("/api/clasificaciones").file(foto)
                .header("Authorization", "Bearer " + jwtService.generarToken(ciudadano.getEmail(), "CIUDADANO")));
    }

    private long bacheId() {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals("Bache")).findFirst().orElseThrow().getId();
    }

    @Test
    void fotoRechazada_avisaConFotoRechazada_sinCategoriaNiPuntaje() throws Exception {
        when(moderador.medir(any(), eq(OrigenDeModeracion.VISTA_PREVIA)))
                .thenReturn(new PuntajeDeModeracion(VERSION, 0.97));

        String cuerpo = previa()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoRechazada", is(true)))
                .andExpect(jsonPath("$.categoriaId", nullValue()))
                .andExpect(jsonPath("$.categoriaNombre", nullValue()))
                .andReturn().getResponse().getContentAsString();

        // Ni el puntaje ni la version del modelo de moderacion (senal interna).
        assertThat(cuerpo).doesNotContain("0.97").doesNotContainIgnoringCase("puntaje").doesNotContain(VERSION);
        assertThat(cuerpo).doesNotContainIgnoringCase("version");
    }

    @Test
    void fotoAceptada_fotoRechazadaFalse_yLaSugerenciaDeSiempre() throws Exception {
        when(moderador.medir(any(), eq(OrigenDeModeracion.VISTA_PREVIA)))
                .thenReturn(new PuntajeDeModeracion(VERSION, 0.06));

        previa()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoRechazada", is(false)))
                .andExpect(jsonPath("$.categoriaId", is((int) bacheId())))
                .andExpect(jsonPath("$.categoriaNombre", is("Bache")));
        verify(moderador).medir(any(), eq(OrigenDeModeracion.VISTA_PREVIA));
    }

    @Test
    void sinServicio_fotoRechazadaFalse_yLaSugerenciaDeSiempre_nuncaUnError() throws Exception {
        when(moderador.medir(any(), any())).thenThrow(new ModeracionNoDisponibleException("sin turno"));

        previa()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoRechazada", is(false)))
                .andExpect(jsonPath("$.categoriaNombre", is("Bache")));
    }

    @Test
    void laVistaPreviaNoUsaLaEsperaDeLaCreacion() throws Exception {
        when(moderador.medir(any(), any())).thenReturn(new PuntajeDeModeracion(VERSION, 0.06));

        previa().andExpect(status().isOk());

        verify(moderador, never()).medir(any(), eq(OrigenDeModeracion.CREACION));
        assertThat(clasificador.estaDisponible()).isTrue();
    }
}
