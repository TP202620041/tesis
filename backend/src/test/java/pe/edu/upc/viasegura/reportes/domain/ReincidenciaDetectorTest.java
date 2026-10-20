package pe.edu.upc.viasegura.reportes.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Unit test del detector de reincidencia (US-27); sin contexto de Spring. */
class ReincidenciaDetectorTest {

    private final ReincidenciaDetector detector = new ReincidenciaDetector();

    @Test
    void detecta_indiciosDeReincidencia_conYSinTildes() {
        assertThat(detector.pareceReincidencia("El bache reaparecio a la semana")).isTrue();
        assertThat(detector.pareceReincidencia("El hueco REAPARECIÓ igual que antes")).isTrue();
        assertThat(detector.pareceReincidencia("Hay reincidencia del mismo dano")).isTrue();
        assertThat(detector.pareceReincidencia("Otra vez se abrio el forado")).isTrue();
        assertThat(detector.pareceReincidencia("Volvio a salir el bache")).isTrue();
        assertThat(detector.pareceReincidencia("Quedo mal reparado, sigue igual")).isTrue();
    }

    @Test
    void noDetecta_comentariosSinIndicios_niVacios() {
        assertThat(detector.pareceReincidencia("Excelente trabajo, quedo impecable")).isFalse();
        assertThat(detector.pareceReincidencia("Gracias a la municipalidad por resolverlo")).isFalse();
        assertThat(detector.pareceReincidencia("")).isFalse();
        assertThat(detector.pareceReincidencia(null)).isFalse();
        // Solo espacios (incluidos tab y salto de linea): misma semantica que
        // StringUtils.hasText, que se reemplazo al pasar a domain/ (BE-06).
        assertThat(detector.pareceReincidencia(" \t\n ")).isFalse();
    }
}
