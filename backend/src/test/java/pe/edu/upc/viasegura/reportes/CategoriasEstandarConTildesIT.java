package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * V18 (QA-1 M-1): las seis categorías estándar con tildes y eñes.
 *
 * <p>Flyway ya aplicó V18 sobre la base de test al arrancar el contexto, así
 * que el primer caso lee el resultado. Los otros dos vuelven a ejecutar el
 * script de la migración dentro de una transacción que siempre se revierte:
 * uno sobre los textos viejos de V3 (lo que encuentra una base de producción)
 * y otro con una categoría de distrito que ya tiene el nombre corregido, el
 * caso en que la migración debe detenerse.</p>
 *
 * <p>La comprobación de V18 compara con {@code lower()}, que depende del
 * {@code LC_CTYPE} de la base: con uno UTF-8 (el del contenedor, {@code en_US.utf8})
 * baja también las letras con tilde («vereda DAÑADA» → «vereda dañada»); con
 * el locale {@code C} solo las ASCII. Producción arranca sin categorías de
 * distrito, así que ahí no hay nada que comparar. Se anota aquí y en el
 * README, no en el SQL: V18 ya está aplicada y un comentario nuevo cambiaría
 * su checksum.</p>
 */
class CategoriasEstandarConTildesIT extends AbstractPostgisIT {

    private static final String SCRIPT = "db/migration/V18__categorias_estandar_con_tildes.sql";

    /** Las seis estándar, nombre y descripción, tal como deben quedar. */
    private static final Map<String, String> ESTANDAR = new LinkedHashMap<>();

    static {
        ESTANDAR.put("Bache", "Bache o hueco en la calzada");
        ESTANDAR.put("Vereda dañada", "Vereda rota, hundida o levantada");
        ESTANDAR.put("Semáforo averiado", "Semáforo apagado o con mal funcionamiento");
        ESTANDAR.put("Hueco en calzada", "Deterioro profundo de la superficie vial");
        ESTANDAR.put("Señalización faltante", "Señal de tránsito ausente o ilegible");
        ESTANDAR.put("Pista deteriorada", "Desgaste o agrietamiento del pavimento");
    }

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    DistritoRepository distritoRepository;

    private Map<String, String> estandarEnLaBase() {
        Map<String, String> filas = new LinkedHashMap<>();
        jdbcTemplate.query("SELECT nombre, descripcion FROM categoria_dano WHERE es_estandar ORDER BY id",
                rs -> {
                    filas.put(rs.getString("nombre"), rs.getString("descripcion"));
                });
        return filas;
    }

    private static String script() throws IOException {
        return new ClassPathResource(SCRIPT).getContentAsString(StandardCharsets.UTF_8);
    }

    /** Deja las estándar como las sembró V3, sin tildes (solo dentro de la transacción del test). */
    private void volverALosTextosDeV3() {
        jdbcTemplate.update("UPDATE categoria_dano SET nombre = 'Vereda danada' WHERE es_estandar AND nombre = 'Vereda dañada'");
        jdbcTemplate.update("UPDATE categoria_dano SET nombre = 'Semaforo averiado',"
                + " descripcion = 'Semaforo apagado o con mal funcionamiento'"
                + " WHERE es_estandar AND nombre = 'Semáforo averiado'");
        jdbcTemplate.update("UPDATE categoria_dano SET nombre = 'Senalizacion faltante',"
                + " descripcion = 'Senal de transito ausente o ilegible'"
                + " WHERE es_estandar AND nombre = 'Señalización faltante'");
    }

    private TransactionTemplate transaccionQueSeRevierte() {
        return new TransactionTemplate(transactionManager);
    }

    @Test
    void lasSeisEstandarTienenSusTextosConTildes() throws Exception {
        assertThat(estandarEnLaBase()).containsExactlyInAnyOrderEntriesOf(ESTANDAR);

        // Y así las ve el público (catálogo sin distrito: solo las estándar
        // activas). «Hueco en calzada» se desactivó en V19 (NC-04).
        Map<String, String> activas = new LinkedHashMap<>(ESTANDAR);
        activas.remove("Hueco en calzada");
        mockMvc.perform(get("/api/categorias"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].nombre", containsInAnyOrder(activas.keySet().toArray())))
                .andExpect(jsonPath("$[*].descripcion", containsInAnyOrder(activas.values().toArray())));
    }

    @Test
    void sobreLosTextosDeV3_laMigracionLosCorrige() {
        transaccionQueSeRevierte().executeWithoutResult(tx -> {
            volverALosTextosDeV3();
            assertThat(estandarEnLaBase()).containsKeys("Vereda danada", "Semaforo averiado", "Senalizacion faltante");

            try {
                jdbcTemplate.execute(script());
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }

            assertThat(estandarEnLaBase()).containsExactlyInAnyOrderEntriesOf(ESTANDAR);
            tx.setRollbackOnly();
        });
        // Fuera de la transacción revertida, la base sigue como la dejó Flyway.
        assertThat(estandarEnLaBase()).containsExactlyInAnyOrderEntriesOf(ESTANDAR);
    }

    @Test
    void unaCategoriaDeDistritoConElNombreCorregido_detieneLaMigracion() {
        Long miraflores = distritoRepository.findByNombre("Miraflores").orElseThrow().getId();

        transaccionQueSeRevierte().executeWithoutResult(tx -> {
            volverALosTextosDeV3();
            // Posible antes de V18: el servicio compara sin mayúsculas pero con tildes.
            jdbcTemplate.update("INSERT INTO categoria_dano (nombre, descripcion, es_estandar, distrito_id, activo)"
                    + " VALUES ('vereda DAÑADA', 'Creada por el distrito', FALSE, ?, TRUE)", miraflores);

            assertThatThrownBy(() -> jdbcTemplate.execute(script()))
                    .isInstanceOf(DataAccessException.class)
                    .hasMessageContaining("V18: hay categorías de distrito con el nombre corregido")
                    .hasMessageContaining("vereda DAÑADA");
            tx.setRollbackOnly();
        });
        assertThat(estandarEnLaBase()).containsExactlyInAnyOrderEntriesOf(ESTANDAR);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM categoria_dano WHERE nombre = 'vereda DAÑADA'", Long.class)).isZero();
    }
}
