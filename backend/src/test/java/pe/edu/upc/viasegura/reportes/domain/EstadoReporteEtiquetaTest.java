package pe.edu.upc.viasegura.reportes.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;

/**
 * Etiquetas legibles de los estados (QA-1 M-1): las mismas que muestra la PWA
 * ({@code frontend/src/lib/types/estados.ts}), para que un correo o una
 * exportacion no digan «EN_PROCESO» donde la pantalla dice «En proceso».
 */
class EstadoReporteEtiquetaTest {

    @Test
    void cadaEstadoTieneLaEtiquetaDeLaPwa() {
        assertThat(Arrays.stream(EstadoReporte.values()).map(EstadoReporte::etiqueta))
                .containsExactly("Pendiente", "Recibido", "En proceso", "Resuelto", "Rechazado", "Cancelado");
    }

    @Test
    void ningunaEtiquetaEsElValorDelEnum() {
        for (EstadoReporte estado : EstadoReporte.values()) {
            assertThat(estado.etiqueta()).isNotEqualTo(estado.name()).doesNotContain("_");
        }
    }
}
