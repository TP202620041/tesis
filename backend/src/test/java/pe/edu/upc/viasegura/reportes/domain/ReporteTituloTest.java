package pe.edu.upc.viasegura.reportes.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** Regla pura del titulo del reporte (NC-02): 5-120 caracteres despues del trim. */
class ReporteTituloTest {

    @Test
    void quitaLosEspaciosDelBorde_yAceptaLosExtremos() {
        assertThat(Reporte.normalizarTitulo("  Bache  ")).isEqualTo("Bache");
        assertThat(Reporte.normalizarTitulo("x".repeat(120))).hasSize(120);
    }

    @Test
    void rechazaNuloVacioCortoYLargo() {
        for (String invalido : new String[] {null, "", "    ", "Bach", "x".repeat(121)}) {
            assertThatThrownBy(() -> Reporte.normalizarTitulo(invalido))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("titulo");
        }
    }
}
