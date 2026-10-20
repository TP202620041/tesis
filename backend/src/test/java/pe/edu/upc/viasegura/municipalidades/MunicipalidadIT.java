package pe.edu.upc.viasegura.municipalidades;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.municipalidades.domain.Municipalidad;
import pe.edu.upc.viasegura.municipalidades.domain.PeriodoGestion;
import pe.edu.upc.viasegura.municipalidades.infra.MunicipalidadSeeder;
import pe.edu.upc.viasegura.municipalidades.service.MunicipalidadService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Modulo municipalidades (NC-01, D-09): una municipalidad por distrito,
 * sembrada despues de los distritos, y el periodo de gestion 2023-2026.
 */
class MunicipalidadIT extends AbstractPostgisIT {

    @Autowired
    MunicipalidadService municipalidadService;

    @Autowired
    MunicipalidadSeeder municipalidadSeeder;

    @Autowired
    JdbcTemplate jdbc;

    private Long distritoId(String nombre) {
        return jdbc.queryForObject("SELECT id FROM distrito WHERE nombre = ?", Long.class, nombre);
    }

    private Integer distritosSinExactamenteUnaMunicipalidad() {
        return jdbc.queryForObject("""
                SELECT count(*) FROM distrito d
                 WHERE (SELECT count(*) FROM municipalidad m WHERE m.distrito_id = d.id) <> 1
                """, Integer.class);
    }

    @Test
    void cadaDistritoTieneExactamenteUnaMunicipalidad() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM distrito", Integer.class)).isEqualTo(43);
        assertThat(distritosSinExactamenteUnaMunicipalidad()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM municipalidad", Integer.class)).isEqualTo(43);
    }

    @Test
    void cercadoDeLima_loGestionaLaMetropolitana_yElRestoSonDistritales() {
        assertThat(municipalidadService.deDistrito(distritoId("Lima")).getNombre())
                .isEqualTo("Municipalidad Metropolitana de Lima");
        assertThat(municipalidadService.deDistrito(distritoId("Miraflores")).getNombre())
                .isEqualTo("Municipalidad Distrital de Miraflores");
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM municipalidad WHERE nombre LIKE 'Municipalidad Distrital de %'",
                Integer.class)).isEqualTo(42);
    }

    @Test
    void deDistrito_devuelveLaDeEseDistrito_conCorreoDeContactoOpcional() {
        Long miraflores = distritoId("Miraflores");
        Municipalidad municipalidad = municipalidadService.deDistrito(miraflores);

        assertThat(jdbc.queryForObject("SELECT distrito_id FROM municipalidad WHERE id = ?",
                Long.class, municipalidad.getId())).isEqualTo(miraflores);
        // El seed no inventa canales oficiales: el correo se registra despues.
        assertThat(municipalidad.getCorreoContacto()).isNull();
    }

    @Test
    void deDistrito_inexistente_404() {
        assertThatThrownBy(() -> municipalidadService.deDistrito(-1L))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void elSeederEsIdempotente_noDuplicaAlVolverACorrer() {
        municipalidadSeeder.run(null);

        assertThat(distritosSinExactamenteUnaMunicipalidad()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM municipalidad", Integer.class)).isEqualTo(43);
    }

    @ParameterizedTest(name = "{0} cae en 2023-2026")
    @ValueSource(strings = {"2023-01-01", "2024-06-15", "2026-12-31"})
    void periodoVigente_dentroDe2023a2026_incluyendoExtremos(String fecha) {
        Optional<PeriodoGestion> periodo = municipalidadService.periodoVigente(LocalDate.parse(fecha));

        assertThat(periodo).isPresent();
        assertThat(periodo.get().getFechaInicio()).isEqualTo(LocalDate.of(2023, 1, 1));
        assertThat(periodo.get().getFechaFin()).isEqualTo(LocalDate.of(2026, 12, 31));
    }

    @Test
    void dosPeriodosNoPuedenSolaparse() {
        // 2026-12-31 ya es de 2023-2026: un periodo que empieza ese dia se cruza.
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO periodo_gestion (fecha_inicio, fecha_fin) VALUES ('2026-12-31', '2030-12-31')"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest(name = "{0} no cae en ningun periodo")
    @ValueSource(strings = {"2022-12-31", "2027-01-01"})
    void periodoVigente_fueraDelPeriodo_vacio(String fecha) {
        assertThat(municipalidadService.periodoVigente(LocalDate.parse(fecha))).isEmpty();
    }
}
