package pe.edu.upc.viasegura.desempeno;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * BE-12: muchos eventos seguidos dan pocos refrescos del indice, siempre uno
 * final, y la peticion no espera al refresco.
 *
 * <p>Los demas IT esperan al refresco (el executor de prueba de
 * {@code support/EjecutorSincronoTestConfig} corre la tarea y la espera).
 * Este reemplaza ese bean por el executor real del indice
 * ({@link AsyncConfig#ejecutorIndice}: un hilo, cola de una) y espia
 * {@link DesempenoService#refrescarIndice} para retener el primer refresco:
 * mientras esta retenido, 15 creaciones mas por el endpoint real terminan en
 * 201 (no lo esperan), el indice todavia no las refleja, y al soltarlo hay
 * exactamente <b>un</b> refresco mas por todas ellas.</p>
 */
class IndiceCoalescidoIT extends AbstractPostgisIT {

    private static final int CREACIONES = 16;

    @TestBean(name = AsyncConfig.EJECUTOR_INDICE, methodName = "ejecutorDelIndiceReal")
    TaskExecutor ejecutorIndice;

    @MockitoSpyBean
    DesempenoService desempenoService;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;

    static TaskExecutor ejecutorDelIndiceReal() {
        return new AsyncConfig().ejecutorIndice();
    }

    @BeforeEach
    void indiceAlDiaTrasLaLimpieza() {
        desempenoService.refrescarIndice();
    }

    private long totalEnPuebloLibre() {
        Long id = distritoRepository.findByNombre("Pueblo Libre").orElseThrow().getId();
        return jdbcTemplate.queryForObject(
                "SELECT total_reportes FROM mv_indice_desempeno_distrital WHERE id = ?",
                Long.class, id + "-ALL");
    }

    private String ciudadanoNuevo() {
        Usuario u = guardarConTerminos(Usuario.builder()
                .email("coalescido-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** Cada uno en otro punto de Pueblo Libre, a ~55 m: reportes nuevos, no adhesiones (US-09). */
    private void crear(int i, String bearer, long categoriaId) throws Exception {
        double lat = -12.0750 - (i / 4) * 0.0005;
        double lon = -77.0600 - (i % 4) * 0.0005;
        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(lat))
                        .param("longitud", String.valueOf(lon))
                        .param("titulo", "Dano " + i).param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaId))
                        .header("Authorization", "Bearer " + bearer))
                .andExpect(status().isCreated());
    }

    @Test
    void dieciseisCreacionesSeguidas_dosRefrescos_elUltimoDespuesDeTodas_yNingunaLoEspera() throws Exception {
        long categoriaId = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow().getId();
        List<String> ciudadanos = new ArrayList<>();
        for (int i = 0; i < CREACIONES; i++) {
            ciudadanos.add(ciudadanoNuevo());
        }
        assertThat(totalEnPuebloLibre()).isZero();

        AtomicInteger refrescos = new AtomicInteger();
        CountDownLatch primeroEmpezo = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        doAnswer(inv -> {
            if (refrescos.incrementAndGet() == 1) {
                primeroEmpezo.countDown();
                soltar.await(30, TimeUnit.SECONDS);
            }
            return inv.callRealMethod();
        }).when(desempenoService).refrescarIndice();

        try {
            crear(0, ciudadanos.get(0), categoriaId);
            assertThat(primeroEmpezo.await(10, TimeUnit.SECONDS)).as("el primer refresco empezo").isTrue();

            // Con ese refresco retenido (y su hilo ocupado), las demas
            // creaciones vuelven igual: ninguna lo espera.
            for (int i = 1; i < CREACIONES; i++) {
                crear(i, ciudadanos.get(i), categoriaId);
            }
            assertThat(refrescos).as("solo el retenido, todavia").hasValue(1);
            assertThat(totalEnPuebloLibre()).as("el indice aun no refleja las creaciones").isZero();
        } finally {
            soltar.countDown();
        }

        long limite = System.currentTimeMillis() + 15_000;
        while (totalEnPuebloLibre() < CREACIONES && System.currentTimeMillis() < limite) {
            Thread.sleep(50);
        }
        assertThat(totalEnPuebloLibre()).as("el refresco final las cuenta todas").isEqualTo(CREACIONES);

        // 16 eventos, 2 refrescos: el retenido y uno solo por los 15 que
        // llegaron mientras corria. Ninguno mas despues.
        Thread.sleep(300);
        assertThat(refrescos).hasValue(2);
    }
}
