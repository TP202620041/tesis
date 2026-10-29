package pe.edu.upc.viasegura.moderacion.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * La regla de la foto (NC-10b, D-15): se rechaza si el puntaje es mayor o
 * igual que el umbral, que tiene que estar entre 0,5 y 0,9.
 */
class PoliticaDeModeracionTest {

    private static PuntajeDeModeracion puntaje(double valor) {
        return new PuntajeDeModeracion("nsfw-vit-tiny-384-0c26ec2-1ba7cf26", valor);
    }

    @Test
    void elBordeDelUmbral_rechaza() {
        PoliticaDeModeracion politica = new PoliticaDeModeracion(0.70);

        assertThat(politica.rechaza(puntaje(0.70))).isTrue();
        assertThat(politica.rechaza(puntaje(0.7000001))).isTrue();
        assertThat(politica.rechaza(puntaje(1.0))).isTrue();
        assertThat(politica.rechaza(puntaje(0.6999999))).isFalse();
        assertThat(politica.rechaza(puntaje(0.059))).isFalse();
        assertThat(politica.rechaza(puntaje(0.0))).isFalse();
        assertThat(politica.umbral()).isEqualTo(0.70);
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.5, 0.7, 0.9})
    void umbralesDelRango_seAceptan(double umbral) {
        assertThat(new PoliticaDeModeracion(umbral).umbral()).isEqualTo(umbral);
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.0, 0.49, 0.4999, 0.9001, 0.95, 1.0, -0.7, Double.NaN, Double.POSITIVE_INFINITY})
    void umbralesFueraDelRango_noSeAceptan(double umbral) {
        assertThat(PoliticaDeModeracion.umbralValido(umbral)).isFalse();
        assertThatThrownBy(() -> new PoliticaDeModeracion(umbral))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("entre 0.5 y 0.9");
    }

    @ParameterizedTest
    @ValueSource(doubles = {-0.01, 1.01, Double.NaN, Double.NEGATIVE_INFINITY})
    void unPuntajeFueraDe0a1_noExiste(double valor) {
        assertThatThrownBy(() -> puntaje(valor)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void laVersionDelModelo_de1a40Caracteres() {
        assertThat(new PuntajeDeModeracion("v".repeat(40), 0.1).versionModelo()).hasSize(40);
        assertThatThrownBy(() -> new PuntajeDeModeracion("v".repeat(41), 0.1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PuntajeDeModeracion(" ", 0.1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PuntajeDeModeracion(null, 0.1)).isInstanceOf(IllegalArgumentException.class);
    }
}
