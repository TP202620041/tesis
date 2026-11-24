package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionOperations;
import pe.edu.upc.viasegura.auth.service.PurgaIntentosLoginService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * US-02 Esc. 2: la purga de {@code intento_login} borra solo las filas que ya
 * no cuentan (ultimo intento fuera de la ventana y sin bloqueo vigente).
 */
class PurgaIntentosLoginIT extends AbstractPostgisIT {

    @Autowired
    PurgaIntentosLoginService purga;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    TransactionOperations transaccion;

    private void fila(String email, String ultimoFallo, String bloqueadoHasta) {
        jdbcTemplate.update("INSERT INTO intento_login (email, fallidos, ultimo_fallo, bloqueado_hasta) VALUES (?, 3, "
                + ultimoFallo + ", " + bloqueadoHasta + ")", email);
    }

    private List<String> quedan() {
        return jdbcTemplate.queryForList("SELECT email FROM intento_login ORDER BY email", String.class);
    }

    @Test
    void borraSoloLasVencidas_yEsIdempotente() {
        fila("a-reciente@lima.pe", "now() - interval '5 minutes'", "NULL");
        fila("b-vieja@lima.pe", "now() - interval '16 minutes'", "NULL");
        fila("c-bloqueo-vencido@lima.pe", "now() - interval '40 minutes'", "now() - interval '25 minutes'");
        fila("d-bloqueo-vigente@lima.pe", "now() - interval '20 minutes'", "now() + interval '5 minutes'");

        assertThat(purga.purgar()).isEqualTo(2);
        assertThat(quedan()).containsExactly("a-reciente@lima.pe", "d-bloqueo-vigente@lima.pe");

        assertThat(purga.purgar()).isZero();
    }

    @Test
    void laCorridaProgramada_noPropagaErrores() {
        fila("vieja@lima.pe", "now() - interval '1 day'", "NULL");

        purga.purgarProgramada();

        assertThat(quedan()).isEmpty();
    }

    @Test
    void dentroDeOtraTransaccion_seNiega() {
        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> purga.purgar()))
                .isInstanceOf(IllegalStateException.class);
    }
}
