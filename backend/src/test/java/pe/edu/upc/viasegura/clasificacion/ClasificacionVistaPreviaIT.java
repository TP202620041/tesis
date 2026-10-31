package pe.edu.upc.viasegura.clasificacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * Vista previa de la categoria (NC-04, {@code POST /api/clasificaciones}):
 * solo para el ciudadano autenticado, con la foto saneada como al guardarla, y
 * sin guardar nada. El clasificador es el falso de {@code application-test.yml}
 * (un bache de 0,87 y una grieta de 0,30 en cualquier foto).
 */
class ClasificacionVistaPreviaIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    UsuarioRepository usuarioRepository;

    @Value("${app.storage.fotos-dir}")
    String fotosDir;

    private Usuario usuario(Rol rol) {
        return guardarConTerminos(Usuario.builder()
                .email(rol.name().toLowerCase() + "-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(rol)
                .distrito(rol == Rol.FUNCIONARIO_MUNICIPAL
                        ? distritoRepository.findByNombre("Miraflores").orElseThrow() : null)
                .build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private static MockMultipartFile foto(byte[] contenido, String nombre) {
        return new MockMultipartFile("foto", nombre, "image/jpeg", contenido);
    }

    private ResultActions previa(MockMultipartFile foto, Usuario u) throws Exception {
        var peticion = multipart("/api/clasificaciones").file(foto);
        if (u != null) {
            peticion.header("Authorization", bearer(u));
        }
        return mockMvc.perform(peticion);
    }

    private long idDe(String nombreCategoria) {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals(nombreCategoria)).findFirst().orElseThrow().getId();
    }

    /** Archivos guardados en los dos directorios de fotos (reportes y perfiles). */
    private long fotosGuardadas() throws IOException {
        long total = 0;
        for (String sub : new String[] {"reportes", "perfiles"}) {
            Path dir = Paths.get(fotosDir, sub);
            if (Files.isDirectory(dir)) {
                try (Stream<Path> archivos = Files.list(dir)) {
                    total += archivos.count();
                }
            }
        }
        return total;
    }

    @Test
    void ciudadano_recibeLaCategoriaSugerida() throws Exception {
        previa(foto(ImagenesDePrueba.jpegConExif(320, 240, 6), "IMG_0001.JPG"), usuario(Rol.CIUDADANO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categoriaId", is((int) idDe("Bache"))))
                .andExpect(jsonPath("$.categoriaNombre", is("Bache")))
                // NC-10b: con la moderacion apagada (application-test.yml), la foto no se rechaza.
                .andExpect(jsonPath("$.fotoRechazada", is(false)))
                // Solo la categoria: ni confianza ni version del modelo (senal interna).
                .andExpect(jsonPath("$.confianza").doesNotExist())
                .andExpect(jsonPath("$.confianzaSugerencia").doesNotExist())
                .andExpect(jsonPath("$.versionModelo").doesNotExist());
    }

    @Test
    void noGuardaNiLaFotoNiUnReporte() throws Exception {
        long reportes = reporteRepository.count();
        long fotos = fotosGuardadas();

        previa(foto(ImagenesDePrueba.png(64, 48), "bache.png"), usuario(Rol.CIUDADANO))
                .andExpect(status().isOk());

        assertThat(reporteRepository.count()).isEqualTo(reportes);
        assertThat(fotosGuardadas()).isEqualTo(fotos);
    }

    @Test
    void sinToken_401() throws Exception {
        previa(foto(ImagenesDePrueba.png(64, 48), "bache.png"), null)
                .andExpect(status().isUnauthorized());
    }

    @Test
    void funcionarioYAdmin_403() throws Exception {
        // Solo el ciudadano crea reportes, y la vista previa es parte de crearlo.
        previa(foto(ImagenesDePrueba.png(64, 48), "bache.png"), usuario(Rol.FUNCIONARIO_MUNICIPAL))
                .andExpect(status().isForbidden());
        previa(foto(ImagenesDePrueba.png(64, 48), "bache.png"), usuario(Rol.ADMIN))
                .andExpect(status().isForbidden());
    }

    @Test
    void ciudadanoConLosTerminosPendientes_403TerminosPendientes() throws Exception {
        // Como cualquier ruta privada (D-12): sin aceptar los terminos vigentes no se clasifica.
        Usuario sinTerminos = usuarioRepository.save(Usuario.builder()
                .email("sin-terminos-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());

        previa(foto(ImagenesDePrueba.png(64, 48), "bache.png"), sinTerminos)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.codigo", is("TERMINOS_PENDIENTES")))
                .andExpect(jsonPath("$.categoriaId").doesNotExist());
    }

    @Test
    void sinFotoOVacia_400() throws Exception {
        Usuario ciudadano = usuario(Rol.CIUDADANO);

        mockMvc.perform(multipart("/api/clasificaciones").header("Authorization", bearer(ciudadano)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", is("Falta la parte obligatoria 'foto' del formulario")));
        previa(foto(new byte[0], "vacia.jpg"), ciudadano)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", is("Adjunta la foto del daño para sugerir una categoría")));
    }

    @Test
    void unArchivoQueNoEsUnaImagen_409ComoAlCrearElReporte() throws Exception {
        // Pasa por el mismo saneado que la foto guardada: un GIF con nombre .png no se clasifica.
        previa(foto(ImagenesDePrueba.gif(40, 40), "falso.png"), usuario(Rol.CIUDADANO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.categoriaId").doesNotExist());
    }
}
