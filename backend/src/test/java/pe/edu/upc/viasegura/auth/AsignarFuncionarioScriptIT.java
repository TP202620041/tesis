package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.util.PSQLException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * NC-09b: {@code backend/scripts/asignar-funcionario.sql} (DEP-05) no asigna
 * el rol a una cuenta sin confirmar.
 *
 * <p>Corre contra {@code viasegura_test} el bloque {@code DO} del script, que
 * tiene todas las comprobaciones y el {@code UPDATE}, leido del archivo
 * versionado (no una copia). No corre el script entero con {@code psql}
 * porque la CI no lo tiene garantizado y en Windows no esta en el PATH: lo que
 * el {@code psql} agrega (variables, {@code ROLLBACK} y codigo de salida) se
 * verifico a mano, ver «Alta y baja de funcionarios» en el README. Los
 * valores llegan como en el script, con {@code SET LOCAL} (aqui
 * {@code set_config(..., true)}) dentro de una transaccion.</p>
 *
 * <p>La transaccion se revierte siempre, tambien cuando asigna: la base es
 * compartida entre clases y {@code usuario} no se limpia, asi que no debe
 * quedar ningun funcionario de prueba en un distrito.</p>
 */
class AsignarFuncionarioScriptIT extends AbstractPostgisIT {

    private static final Path SCRIPT = Path.of("scripts", "asignar-funcionario.sql");
    private static final String INICIO_DEL_BLOQUE = "DO $$\nDECLARE";

    private static String bloque;

    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    PlatformTransactionManager transactionManager;

    /** El bloque {@code DO} principal del script, sin el {@code ;} final. Leerlo en ASCII ya exige que el archivo lo sea. */
    @BeforeAll
    static void leerElBloqueDelScript() throws IOException {
        String sql = Files.readString(SCRIPT, StandardCharsets.US_ASCII).replace("\r\n", "\n");
        int inicio = sql.indexOf(INICIO_DEL_BLOQUE);
        assertThat(inicio).as("el bloque DO principal de %s", SCRIPT).isNotNegative();
        assertThat(sql.indexOf(INICIO_DEL_BLOQUE, inicio + 1)).as("un solo bloque DO principal").isNegative();
        int fin = sql.indexOf("\n$$;", inicio);
        assertThat(fin).as("el cierre del bloque").isPositive();
        bloque = sql.substring(inicio, fin + "\n$$".length());
        assertThat(bloque).contains("correo_confirmado");
    }

    private Usuario ciudadano(boolean correoConfirmado) {
        Usuario usuario = Usuario.builder()
                .email("dep05-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("secreta123"))
                .nombre("Rosa").apellido("Vecina").rol(Rol.CIUDADANO).build();
        if (correoConfirmado) {
            usuario.confirmarCorreo(Instant.now());
        }
        return usuarioRepository.save(usuario);
    }

    /**
     * Asigna como lo hace el script y devuelve el rol y el distrito de la
     * cuenta leidos en la misma transaccion, que despues se revierte.
     */
    private Map<String, Object> asignar(String email, String distrito) {
        return new TransactionTemplate(transactionManager).execute(estado -> {
            estado.setRollbackOnly();
            jdbcTemplate.queryForObject("SELECT set_config('asignar_funcionario.email', ?, true)", String.class, email);
            jdbcTemplate.queryForObject("SELECT set_config('asignar_funcionario.distrito', ?, true)", String.class,
                    distrito);
            jdbcTemplate.queryForObject("SELECT set_config('asignar_funcionario.accion', 'asignar', true)",
                    String.class);
            jdbcTemplate.execute(bloque);
            return jdbcTemplate.queryForMap("""
                    SELECT u.rol, d.nombre AS distrito
                      FROM usuario u LEFT JOIN distrito d ON d.id = u.distrito_id
                     WHERE u.email = ?""", email);
        });
    }

    @Test
    void cuentaSinConfirmar_fallaConUnMensajeClaro_yNoAsignaNada() {
        Usuario usuario = ciudadano(false);

        assertThatThrownBy(() -> asignar(usuario.getEmail(), "Miraflores"))
                .isInstanceOf(DataAccessException.class)
                .rootCause()
                .isInstanceOfSatisfying(PSQLException.class, e -> {
                    assertThat(e.getServerErrorMessage().getMessage())
                            .isEqualTo("La cuenta " + usuario.getEmail()
                                    + " no confirmo su correo: no se le asigna el rol.");
                    assertThat(e.getServerErrorMessage().getHint())
                            .contains("enlace de confirmacion", "Reenviar", "vuelva a correr el script");
                });

        Usuario despues = usuarioRepository.findById(usuario.getId()).orElseThrow();
        assertThat(despues.getRol()).isEqualTo(Rol.CIUDADANO);
        assertThat(jdbcTemplate.queryForObject("SELECT distrito_id FROM usuario WHERE id = ?", Long.class,
                usuario.getId())).isNull();
    }

    @Test
    void cuentaConfirmada_seAsignaComoAntes() {
        Usuario usuario = ciudadano(true);

        Map<String, Object> fila = asignar(usuario.getEmail(), "miraflores");

        assertThat(fila).containsEntry("rol", "FUNCIONARIO_MUNICIPAL").containsEntry("distrito", "Miraflores");
        // Revertida: no queda un funcionario de prueba en Miraflores.
        assertThat(usuarioRepository.findById(usuario.getId()).orElseThrow().getRol()).isEqualTo(Rol.CIUDADANO);
    }
}
