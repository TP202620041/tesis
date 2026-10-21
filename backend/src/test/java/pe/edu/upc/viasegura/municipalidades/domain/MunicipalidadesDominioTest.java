package pe.edu.upc.viasegura.municipalidades.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** Reglas puras de {@code municipalidades.domain} (NC-01). */
class MunicipalidadesDominioTest {

    @Test
    void nombreOficial_cercadoEsLaMetropolitana_elRestoDistrital() {
        assertThat(Municipalidad.nombreOficial("Lima")).isEqualTo("Municipalidad Metropolitana de Lima");
        assertThat(Municipalidad.nombreOficial("San Juan de Lurigancho"))
                .isEqualTo("Municipalidad Distrital de San Juan de Lurigancho");
    }

    @Test
    void periodo_incluyeAmbosExtremos() {
        PeriodoGestion periodo = PeriodoGestion.builder()
                .fechaInicio(LocalDate.of(2023, 1, 1))
                .fechaFin(LocalDate.of(2026, 12, 31))
                .build();

        assertThat(periodo.incluye(LocalDate.of(2023, 1, 1))).isTrue();
        assertThat(periodo.incluye(LocalDate.of(2026, 12, 31))).isTrue();
        assertThat(periodo.incluye(LocalDate.of(2022, 12, 31))).isFalse();
        assertThat(periodo.incluye(LocalDate.of(2027, 1, 1))).isFalse();
    }
}
