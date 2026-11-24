package pe.edu.upc.viasegura.desempeno;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.municipalidades.domain.PeriodoGestion;
import pe.edu.upc.viasegura.municipalidades.service.MunicipalidadService;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.CalificacionRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * NC-06, evidencia del indicador OE3-I5: el dashboard publico por periodo de
 * gestion muestra la tasa de resolucion y el tiempo promedio de atencion de
 * cada municipalidad, desagregados por periodo, con 100 % de coincidencia
 * frente al calculo manual, y se consulta sin iniciar sesion.
 *
 * <p>Los datos son fijos: fechas de creacion y de resolucion exactas en los
 * dos periodos sembrados (2023-2026 de V15 y 2027-2030 de V25) y en tres
 * distritos con reportes, mas uno sin ninguno. El calculo manual esta escrito
 * abajo, cifra por cifra, con las formulas de la decision del usuario del
 * 23/11 (propuestas/2026-11-23-nc-06-kpis-gestion-y-d10.md). Todas las
 * peticiones van sin {@code Authorization}.</p>
 */
class KpiGestionPorPeriodoIT extends AbstractPostgisIT {

    private static final ZoneId LIMA = ZoneId.of("America/Lima");

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
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
    CalificacionRepository calificacionRepository;
    @Autowired
    MunicipalidadService municipalidadService;
    @Autowired
    DesempenoService desempenoService;
    @Autowired
    JdbcTemplate jdbc;

    private PeriodoGestion p2023;
    private PeriodoGestion p2027;
    private CategoriaDano catA;
    private CategoriaDano catB;
    private Usuario ciudadano;

    /** Lector que conserva la escala de los decimales ("60.00" no es "60.0"). */
    private ObjectMapper lectorExacto;

    @BeforeEach
    void preparar() {
        // Sin la fabrica exacta, el arbol normaliza 4.00 a 4 y no se veria la escala.
        lectorExacto = objectMapper.copy()
                .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                .setNodeFactory(JsonNodeFactory.withExactBigDecimals(true));
        p2023 = municipalidadService.periodoVigente(LocalDate.of(2024, 6, 1)).orElseThrow();
        p2027 = municipalidadService.periodoVigente(LocalDate.of(2028, 6, 1)).orElseThrow();
        List<CategoriaDano> estandar = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).filter(CategoriaDano::isActivo).toList();
        catA = estandar.get(0);
        catB = estandar.get(1);
        ciudadano = guardarConTerminos(Usuario.builder()
                .email("kpi-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    // ------------------------------------------------------------------
    // Datos fijos
    // ------------------------------------------------------------------

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    /**
     * Guarda un reporte con fechas exactas. El periodo lo decide la fecha de
     * creacion en hora de Lima, con el mismo servicio que usa
     * {@code ReporteService} al crear (NC-02); el test afirma cual es.
     */
    private Reporte reporte(Distrito distrito, CategoriaDano categoria, EstadoReporte estado,
                            String creado, String resuelto, boolean oculto, PeriodoGestion periodoEsperado) {
        Reporte r = reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria).creador(ciudadano).distrito(distrito)
                .estado(estado).totalAdhesiones(1).build());
        Instant creadoEn = Instant.parse(creado);
        PeriodoGestion periodo = municipalidadService
                .periodoVigente(LocalDate.ofInstant(creadoEn, LIMA)).orElseThrow();
        assertThat(periodo.getId()).as("periodo de %s", creado).isEqualTo(periodoEsperado.getId());
        jdbc.update("""
                UPDATE reporte SET created_at = ?, updated_at = ?, resolved_at = ?,
                       periodo_gestion_id = ?, oculto = ?
                WHERE id = ?""",
                Timestamp.from(creadoEn), Timestamp.from(creadoEn),
                resuelto == null ? null : Timestamp.from(Instant.parse(resuelto)),
                periodo.getId(), oculto, r.getId());
        return r;
    }

    private void calificar(Reporte r, int estrellas) {
        calificacionRepository.save(Calificacion.builder().reporte(r).usuario(ciudadano).estrellas(estrellas).build());
    }

    private void sembrar() {
        Distrito miraflores = distrito("Miraflores");
        Distrito barranco = distrito("Barranco");
        Distrito sanIsidro = distrito("San Isidro");
        // Surquillo: sin ningun reporte, en ninguno de los dos periodos.
        EstadoReporte resuelto = EstadoReporte.RESUELTO;

        // ---- Periodo 2023-2026 ----
        // Miraflores
        Reporte m1 = reporte(miraflores, catA, resuelto, "2025-03-01T10:00:00Z", "2025-03-03T10:00:00Z", false, p2023); // 2,0 dias
        Reporte m2 = reporte(miraflores, catA, resuelto, "2025-04-01T00:00:00Z", "2025-04-06T12:00:00Z", false, p2023); // 5,5 dias
        // Creado en diciembre de 2026 y resuelto en enero de 2027: cuenta en 2023-2026.
        reporte(miraflores, catA, resuelto, "2026-12-20T15:00:00Z", "2027-01-05T15:00:00Z", false, p2023);              // 16,0 dias
        reporte(miraflores, catA, EstadoReporte.RECHAZADO, "2025-05-01T00:00:00Z", null, false, p2023);                  // cuenta (SEC-01)
        reporte(miraflores, catB, EstadoReporte.EN_PROCESO, "2025-06-01T00:00:00Z", null, false, p2023);
        reporte(miraflores, catA, EstadoReporte.CANCELADO, "2025-07-01T00:00:00Z", null, false, p2023);                  // no cuenta
        Reporte m7 = reporte(miraflores, catA, resuelto, "2025-08-01T00:00:00Z", "2025-08-02T00:00:00Z", true, p2023);  // oculto: no cuenta
        calificar(m1, 5);
        calificar(m2, 3);
        calificar(m7, 1); // de un reporte oculto: no cuenta
        // Barranco: ningun resuelto ni calificacion
        reporte(barranco, catA, EstadoReporte.PENDIENTE, "2024-03-01T00:00:00Z", null, false, p2023);
        reporte(barranco, catA, EstadoReporte.RECIBIDO, "2024-04-01T00:00:00Z", null, false, p2023);
        reporte(barranco, catA, EstadoReporte.RECHAZADO, "2024-05-01T00:00:00Z", null, false, p2023);
        reporte(barranco, catA, EstadoReporte.CANCELADO, "2024-06-01T00:00:00Z", null, false, p2023);
        // San Isidro
        Reporte s1 = reporte(sanIsidro, catA, resuelto, "2024-01-10T12:00:00Z", "2024-01-11T00:00:00Z", false, p2023); // 0,5 dias
        reporte(sanIsidro, catA, resuelto, "2024-02-01T00:00:00Z", "2024-02-04T08:00:00Z", false, p2023);              // 3,333... dias
        // 2027-01-01 03:00 UTC es el 31/12/2026 a las 22:00 en Lima: periodo 2023-2026.
        reporte(sanIsidro, catA, EstadoReporte.PENDIENTE, "2027-01-01T03:00:00Z", null, false, p2023);
        calificar(s1, 4);

        // ---- Periodo 2027-2030 ----
        Reporte p1 = reporte(miraflores, catA, resuelto, "2027-02-01T00:00:00Z", "2027-02-11T06:00:00Z", false, p2027); // 10,25 dias
        reporte(miraflores, catA, EstadoReporte.PENDIENTE, "2027-03-01T00:00:00Z", null, false, p2027);
        calificar(p1, 2);
        reporte(barranco, catA, EstadoReporte.CANCELADO, "2027-05-01T00:00:00Z", null, false, p2027);
        Reporte s3 = reporte(sanIsidro, catA, resuelto, "2027-03-01T00:00:00Z", "2027-03-02T00:00:00Z", true, p2027);  // oculto
        calificar(s3, 5); // oculto: no cuenta
        reporte(sanIsidro, catA, EstadoReporte.RECHAZADO, "2027-04-01T00:00:00Z", null, false, p2027);

        desempenoService.refrescarIndice();
    }

    // ------------------------------------------------------------------
    // Calculo manual
    // ------------------------------------------------------------------

    /** Cifras esperadas de una fila; null en una metrica = «Sin datos». */
    record Esperado(long validos, long resueltos, BigDecimal tasa, BigDecimal tiempoDias,
                    BigDecimal satisfaccion, long calificaciones) {}

    private static final Esperado SIN_DATOS = new Esperado(0, 0, null, null, null, 0);

    /** resueltos / validos x 100, dos decimales (redondeo hacia arriba en el medio). */
    private static BigDecimal tasa(long resueltos, long validos) {
        return BigDecimal.valueOf(100L * resueltos)
                .divide(BigDecimal.valueOf(validos), 2, RoundingMode.HALF_UP);
    }

    /** Promedio de dias, un decimal. */
    private static BigDecimal dias(String... valores) {
        return promedio(1, valores);
    }

    /** Promedio de estrellas, dos decimales. */
    private static BigDecimal estrellas(String... valores) {
        return promedio(2, valores);
    }

    private static BigDecimal promedio(int escala, String... valores) {
        BigDecimal suma = BigDecimal.ZERO;
        for (String v : valores) {
            suma = suma.add(new BigDecimal(v));
        }
        return suma.divide(BigDecimal.valueOf(valores.length), 10, RoundingMode.HALF_UP)
                .setScale(escala, RoundingMode.HALF_UP);
    }

    /**
     * Fila general (todas las categorias) de cada distrito con datos, por
     * periodo. Los 40 distritos restantes valen {@link #SIN_DATOS}.
     */
    private Map<String, Esperado> esperadoGeneral(PeriodoGestion periodo) {
        Map<String, Esperado> e = new HashMap<>();
        if (periodo.getId().equals(p2023.getId())) {
            // Miraflores: 7 reportes - 1 CANCELADO - 1 oculto = 5 validos
            // (3 RESUELTO + 1 RECHAZADO + 1 EN_PROCESO); 3 resueltos.
            // Tasa 3/5 = 60,00. Tiempo (2 + 5,5 + 16) / 3 = 7,833 -> 7,8.
            // Satisfaccion (5 + 3) / 2 = 4,00 (la de 1 estrella es del oculto).
            e.put("Miraflores", new Esperado(5, 3, tasa(3, 5), dias("2.0", "5.5", "16.0"), estrellas("5", "3"), 2));
            // Barranco: 4 - 1 CANCELADO = 3 validos, 0 resueltos. Tasa 0,00
            // (hay validos: 0 y no null). Tiempo y satisfaccion null.
            e.put("Barranco", new Esperado(3, 0, tasa(0, 3), null, null, 0));
            // San Isidro: 3 validos, 2 resueltos. Tasa 2/3 = 66,666 -> 66,67.
            // Tiempo (0,5 + 3,333...) / 2 = 1,9166 -> 1,9. Satisfaccion 4,00.
            e.put("San Isidro", new Esperado(3, 2, tasa(2, 3), dias("0.5", "3.3333333333"), estrellas("4"), 1));
        } else {
            // Miraflores: 2 validos, 1 resuelto. Tasa 50,00. Tiempo 10,25 -> 10,3.
            // Satisfaccion 2,00.
            e.put("Miraflores", new Esperado(2, 1, tasa(1, 2), dias("10.25"), estrellas("2"), 1));
            // Barranco: solo un CANCELADO -> 0 validos: tasa null (no 0).
            e.put("Barranco", SIN_DATOS);
            // San Isidro: el resuelto esta oculto; queda el RECHAZADO.
            // 1 valido, 0 resueltos: tasa 0,00, tiempo null, satisfaccion null.
            e.put("San Isidro", new Esperado(1, 0, tasa(0, 1), null, null, 0));
        }
        return e;
    }

    // ------------------------------------------------------------------
    // Consulta
    // ------------------------------------------------------------------

    private JsonNode gestion(PeriodoGestion periodo, CategoriaDano categoria) throws Exception {
        MockHttpServletRequestBuilder req = get("/api/desempeno/gestion");
        if (periodo != null) {
            req = req.param("periodoId", periodo.getId().toString());
        }
        if (categoria != null) {
            req = req.param("categoriaId", categoria.getId().toString());
        }
        String json = mockMvc.perform(req) // sin Authorization
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return lectorExacto.readTree(json);
    }

    private static BigDecimal decimal(JsonNode n) {
        return n == null || n.isNull() ? null : n.decimalValue();
    }

    /** Compara cifra por cifra; devuelve cuantas cifras comparo. */
    private int comparar(String contexto, JsonNode fila, Esperado e) {
        assertThat(fila.path("reportesValidos").asLong()).as(contexto + " validos").isEqualTo(e.validos());
        assertThat(fila.path("reportesResueltos").asLong()).as(contexto + " resueltos").isEqualTo(e.resueltos());
        assertThat(decimal(fila.get("tasaResolucion"))).as(contexto + " tasa").isEqualTo(e.tasa());
        assertThat(decimal(fila.get("tiempoPromedioDias"))).as(contexto + " tiempo").isEqualTo(e.tiempoDias());
        assertThat(decimal(fila.get("satisfaccionPromedio"))).as(contexto + " satisfaccion").isEqualTo(e.satisfaccion());
        assertThat(fila.path("totalCalificaciones").asLong()).as(contexto + " calificaciones").isEqualTo(e.calificaciones());
        return 6;
    }

    // ------------------------------------------------------------------
    // Pruebas
    // ------------------------------------------------------------------

    /**
     * OE3-I5: cada cifra de cada distrito, en los dos periodos, coincide con
     * el calculo manual. Los 43 distritos aparecen en cada periodo; los que
     * no tienen reportes, con conteos 0 y metricas null.
     */
    @Test
    void cadaCifraPorDistritoYPeriodo_coincideConElCalculoManual() throws Exception {
        sembrar();
        long distritos = distritoRepository.count();
        int cifras = 0;

        for (PeriodoGestion periodo : List.of(p2023, p2027)) {
            JsonNode resp = gestion(periodo, null);
            assertThat(resp.path("periodo").path("id").asLong()).isEqualTo(periodo.getId());
            assertThat(resp.path("periodo").path("fechaInicio").asText()).isEqualTo(periodo.getFechaInicio().toString());
            assertThat(resp.path("periodo").path("fechaFin").asText()).isEqualTo(periodo.getFechaFin().toString());
            assertThat(resp.path("categoriaId").isNull()).isTrue();

            JsonNode filas = resp.path("distritos");
            assertThat(filas.size()).as("una fila por distrito").isEqualTo((int) distritos);

            Map<String, Esperado> esperado = esperadoGeneral(periodo);
            List<String> vistos = new ArrayList<>();
            for (JsonNode fila : filas) {
                String nombre = fila.path("distritoNombre").asText();
                vistos.add(nombre);
                assertThat(fila.path("categoriaId").isNull()).isTrue();
                assertThat(fila.path("municipalidadNombre").asText()).isNotBlank();
                cifras += comparar(periodo.getFechaInicio() + " " + nombre, fila,
                        esperado.getOrDefault(nombre, SIN_DATOS));
            }
            assertThat(vistos).as("sin distritos repetidos").doesNotHaveDuplicates()
                    .contains("Miraflores", "Barranco", "San Isidro", "Surquillo");
        }
        // 43 distritos x 2 periodos x 6 cifras: ninguna se dejo de comparar.
        assertThat(cifras).isEqualTo((int) (distritos * 2 * 6));
    }

    /** Mismo orden que el indice de US-18: tasa descendente, sin datos al final. */
    @Test
    void ordenPorTasa_conLosSinDatosAlFinal() throws Exception {
        sembrar();
        JsonNode filas = gestion(p2023, null).path("distritos");

        assertThat(filas.get(0).path("distritoNombre").asText()).isEqualTo("San Isidro"); // 66,67
        assertThat(filas.get(1).path("distritoNombre").asText()).isEqualTo("Miraflores"); // 60,00
        assertThat(filas.get(2).path("distritoNombre").asText()).isEqualTo("Barranco");   // 0,00
        assertThat(filas.get(3).path("tasaResolucion").isNull()).isTrue();
    }

    /**
     * Desglose por categoria, como el de US-20: solo los distritos con
     * reportes validos de esa categoria en el periodo, con las mismas
     * formulas.
     */
    @Test
    void desglosePorCategoria_coincideConElCalculoManual() throws Exception {
        sembrar();

        // 2023-2026, categoria A: Miraflores pierde el EN_PROCESO de la B.
        JsonNode a2023 = gestion(p2023, catA);
        assertThat(a2023.path("categoriaId").asLong()).isEqualTo(catA.getId());
        Map<String, JsonNode> filas = porNombre(a2023.path("distritos"));
        assertThat(filas.keySet()).containsExactlyInAnyOrder("Miraflores", "Barranco", "San Isidro");
        // 4 validos (3 RESUELTO + 1 RECHAZADO), tasa 3/4 = 75,00.
        comparar("A 2023 Miraflores", filas.get("Miraflores"),
                new Esperado(4, 3, tasa(3, 4), dias("2.0", "5.5", "16.0"), estrellas("5", "3"), 2));
        comparar("A 2023 Barranco", filas.get("Barranco"), new Esperado(3, 0, tasa(0, 3), null, null, 0));
        comparar("A 2023 San Isidro", filas.get("San Isidro"),
                new Esperado(3, 2, tasa(2, 3), dias("0.5", "3.3333333333"), estrellas("4"), 1));

        // 2023-2026, categoria B: solo el EN_PROCESO de Miraflores.
        Map<String, JsonNode> b2023 = porNombre(gestion(p2023, catB).path("distritos"));
        assertThat(b2023.keySet()).containsExactly("Miraflores");
        comparar("B 2023 Miraflores", b2023.get("Miraflores"), new Esperado(1, 0, tasa(0, 1), null, null, 0));

        // 2027-2030, categoria A: Barranco solo tiene un cancelado y no aparece.
        Map<String, JsonNode> a2027 = porNombre(gestion(p2027, catA).path("distritos"));
        assertThat(a2027.keySet()).containsExactlyInAnyOrder("Miraflores", "San Isidro");
        comparar("A 2027 Miraflores", a2027.get("Miraflores"),
                new Esperado(2, 1, tasa(1, 2), dias("10.25"), estrellas("2"), 1));
        comparar("A 2027 San Isidro", a2027.get("San Isidro"), new Esperado(1, 0, tasa(0, 1), null, null, 0));
    }

    private static Map<String, JsonNode> porNombre(JsonNode filas) {
        Map<String, JsonNode> m = new HashMap<>();
        for (JsonNode f : filas) {
            m.put(f.path("distritoNombre").asText(), f);
        }
        return m;
    }

    /**
     * Consulta sin iniciar sesion: los dos endpoints nuevos responden 200 sin
     * {@code Authorization}, y abrirlos no abrio el dashboard interno de
     * US-17 (rutas exactas, no un comodin).
     */
    @Test
    void seConsultaSinAuthorization() throws Exception {
        String json = mockMvc.perform(get("/api/desempeno/periodos"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode periodos = objectMapper.readTree(json);
        // El mas reciente primero.
        assertThat(periodos.get(0).path("id").asLong()).isEqualTo(p2027.getId());
        assertThat(periodos.get(1).path("id").asLong()).isEqualTo(p2023.getId());
        LocalDate hoy = LocalDate.now(LIMA);
        for (JsonNode p : periodos) {
            boolean incluyeHoy = !hoy.isBefore(LocalDate.parse(p.path("fechaInicio").asText()))
                    && !hoy.isAfter(LocalDate.parse(p.path("fechaFin").asText()));
            assertThat(p.path("vigente").asBoolean()).isEqualTo(incluyeHoy);
        }

        mockMvc.perform(get("/api/desempeno/gestion").param("periodoId", p2023.getId().toString()))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/desempeno/mi-distrito"))
                .andExpect(status().isUnauthorized());
    }

    /** Sin periodoId, el vigente hoy en Lima. */
    @Test
    void sinPeriodo_usaElVigente() throws Exception {
        var vigente = municipalidadService.periodoVigente(LocalDate.now(LIMA));
        if (vigente.isEmpty()) {
            mockMvc.perform(get("/api/desempeno/gestion")).andExpect(status().isNotFound());
            return;
        }
        JsonNode resp = gestion(null, null);
        assertThat(resp.path("periodo").path("id").asLong()).isEqualTo(vigente.get().getId());
        assertThat(resp.path("periodo").path("vigente").asBoolean()).isTrue();
    }

    @Test
    void periodoInexistente_404() throws Exception {
        mockMvc.perform(get("/api/desempeno/gestion").param("periodoId", "999999"))
                .andExpect(status().isNotFound());
    }

    /**
     * Ninguna senal operativa en el DTO publico: solo los campos acordados en
     * el contrato (handoff de NC-06).
     */
    @Test
    void elDtoSoloExponeLosCamposAcordados() throws Exception {
        sembrar();
        JsonNode resp = gestion(p2023, null);
        List<String> raiz = new ArrayList<>();
        resp.fieldNames().forEachRemaining(raiz::add);
        assertThat(raiz).containsExactlyInAnyOrder("periodo", "categoriaId", "calculatedAt", "distritos");
        List<String> campos = new ArrayList<>();
        resp.path("distritos").get(0).fieldNames().forEachRemaining(campos::add);
        assertThat(campos).containsExactlyInAnyOrder(
                "distritoId", "distritoNombre", "municipalidadNombre", "categoriaId",
                "reportesValidos", "reportesResueltos", "tasaResolucion",
                "tiempoPromedioDias", "satisfaccionPromedio", "totalCalificaciones");
    }
}
