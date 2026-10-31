package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import pe.edu.upc.viasegura.common.exception.RestriccionDeIntegridad;

/** El nombre de la restriccion violada, sin el mensaje del controlador (BE-15). */
class RestriccionDeIntegridadTest {

    @Test
    void conLaViolacionDeHibernateEnLaCadena_devuelveElNombreDeLaRestriccion() {
        DataIntegrityViolationException error = new DataIntegrityViolationException("x@y.pe",
                new RuntimeException("envoltorio", new ConstraintViolationException("x@y.pe",
                        new SQLException("x@y.pe"), "reporte_creador_id_fkey")));

        assertThat(RestriccionDeIntegridad.nombreDe(error)).isEqualTo("reporte_creador_id_fkey");
    }

    @Test
    void sinViolacionDeHibernate_esDesconocida() {
        assertThat(RestriccionDeIntegridad.nombreDe(new DataIntegrityViolationException("x@y.pe")))
                .isEqualTo(RestriccionDeIntegridad.DESCONOCIDA);
    }

    @Test
    void conLaViolacionSinNombre_esDesconocida() {
        assertThat(RestriccionDeIntegridad.nombreDe(new DataIntegrityViolationException("x",
                new ConstraintViolationException("x", new SQLException("x"), null))))
                .isEqualTo(RestriccionDeIntegridad.DESCONOCIDA);
    }
}
