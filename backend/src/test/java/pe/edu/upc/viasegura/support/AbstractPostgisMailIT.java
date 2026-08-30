package pe.edu.upc.viasegura.support;

import com.icegreen.greenmail.configuration.GreenMailConfiguration;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import org.junit.jupiter.api.extension.RegisterExtension;

/**
 * Base para ITs que ejercitan el envio real de email (notificaciones
 * US-16/US-21).
 *
 * <p>Levanta GreenMail (SMTP embebido, puerto 3025 = el que
 * {@link AbstractPostgisIT} fija en {@code spring.mail}) con ciclo por
 * metodo, de modo que los envios se entreguen de verdad ({@code ENVIADA})
 * en lugar de fallar en silencio ({@code FALLIDA}) cuando no hay SMTP.
 * Cualquier suite cuyo flujo dispare notificaciones debe extender esta base
 * (no {@link AbstractPostgisIT} directamente) para no dejar un estado de
 * fallo que ningun test verifica.</p>
 */
public abstract class AbstractPostgisMailIT extends AbstractPostgisIT {

    @RegisterExtension
    protected final GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.SMTP)
            .withConfiguration(GreenMailConfiguration.aConfig().withDisabledAuthentication())
            .withPerMethodLifecycle(true);
}
