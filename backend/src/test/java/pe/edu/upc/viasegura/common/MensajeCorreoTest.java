package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/** El mensaje del puerto de correo (DEP-08): validaciones y un {@code toString} sin datos personales. */
class MensajeCorreoTest {

    @Test
    void toString_soloLaEtiqueta() {
        MensajeCorreo mensaje = new MensajeCorreo("ana@lima.pe", "Recuperacion", "token-secreto", "recuperacion");

        assertThat(mensaje.toString())
                .isEqualTo("MensajeCorreo[etiqueta=recuperacion]")
                .doesNotContain("ana@lima.pe", "token-secreto");
    }

    @Test
    void sinDestinatarioOAsunto_noSeConstruye() {
        assertThatThrownBy(() -> new MensajeCorreo(" ", "Asunto", "texto", "soporte"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MensajeCorreo("ana@lima.pe", "", "texto", "soporte"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MensajeCorreo("ana@lima.pe", "Asunto", null, "soporte"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Soporte", "aviso reporte", "ana@lima.pe", "recuperación"})
    void etiquetaFueraDelFormatoDeResend_noSeConstruye(String etiqueta) {
        assertThatThrownBy(() -> new MensajeCorreo("ana@lima.pe", "Asunto", "texto", etiqueta))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageNotContaining("ana@lima.pe");
    }

    @Test
    void lasEtiquetasDeLosTresUsos_sonValidas() {
        for (String etiqueta : new String[] {"recuperacion", "soporte", "aviso-reporte"}) {
            assertThat(new MensajeCorreo("ana@lima.pe", "Asunto", "", etiqueta).etiqueta()).isEqualTo(etiqueta);
        }
    }
}
