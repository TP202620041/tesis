package pe.edu.upc.viasegura.auth.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.naming.CommunicationException;
import javax.naming.NameNotFoundException;
import javax.naming.ServiceUnavailableException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.auth.port.RecepcionDeCorreo;

/**
 * El adaptador DNS del dominio del correo (NC-09) con un resolvedor inyectado:
 * sin red. Cubre lo que rechaza (sin MX, null MX, NXDOMAIN, literal de IP),
 * lo que acepta y que falla abierto, dentro del plazo, si el DNS falla o se
 * cuelga.
 */
class DnsVerificadorDeDominioAdapterTest {

    private DnsVerificadorDeDominioAdapter adaptador;

    private DnsVerificadorDeDominioAdapter con(DnsVerificadorDeDominioAdapter.ResolvedorMx resolvedor) {
        adaptador = new DnsVerificadorDeDominioAdapter(resolvedor, Duration.ofMillis(300));
        return adaptador;
    }

    @AfterEach
    void cerrar() {
        if (adaptador != null) {
            adaptador.cerrar();
        }
    }

    @Test
    void conUnMx_recibe() {
        assertThat(con(dominio -> List.of("10 mx.lima.pe.")).verificar("lima.pe")).isEqualTo(RecepcionDeCorreo.RECIBE);
        assertThat(con(dominio -> List.of("5 alt1.gmail-smtp-in.l.google.com.", "1 gmail-smtp-in.l.google.com."))
                .verificar("gmail.com")).isEqualTo(RecepcionDeCorreo.RECIBE);
    }

    @Test
    void sinMx_noRecibe() {
        assertThat(con(dominio -> List.of()).verificar("sin-correo.pe")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
    }

    @Test
    void conNullMx_rfc7505_noRecibe() {
        assertThat(con(dominio -> List.of("0 .")).verificar("example.com")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
    }

    @Test
    void unNullMxJuntoAUnoReal_recibe() {
        // Mal configurado, pero hay un servidor al que entregar.
        assertThat(con(dominio -> List.of("0 .", "10 mx.raro.pe.")).verificar("raro.pe"))
                .isEqualTo(RecepcionDeCorreo.RECIBE);
    }

    @Test
    void unRegistroIlegible_noCuentaComoServidor() {
        assertThat(con(dominio -> List.of("basura")).verificar("raro.pe")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
    }

    @Test
    void dominioInexistente_nxdomain_noRecibe() {
        assertThat(con(dominio -> {
            throw new NameNotFoundException("DNS name not found [response code 3]");
        }).verificar("no-existe-xyz.pe")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
    }

    @Test
    void literalDeIpONombreSinPunto_noRecibe_sinConsultar() {
        AtomicInteger consultas = new AtomicInteger();
        DnsVerificadorDeDominioAdapter sinRed = con(dominio -> {
            consultas.incrementAndGet();
            return List.of("10 mx.algo.");
        });

        assertThat(sinRed.verificar("[192.0.2.1]")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
        assertThat(sinRed.verificar("localhost")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
        assertThat(sinRed.verificar("")).isEqualTo(RecepcionDeCorreo.NO_RECIBE);
        assertThat(consultas).hasValue(0);
    }

    @Test
    void errorDelDns_fallaAbierto() {
        assertThat(con(dominio -> {
            throw new ServiceUnavailableException("SERVFAIL");
        }).verificar("lima.pe")).isEqualTo(RecepcionDeCorreo.DESCONOCIDA);
        assertThat(con(dominio -> {
            throw new CommunicationException("DNS error");
        }).verificar("lima.pe")).isEqualTo(RecepcionDeCorreo.DESCONOCIDA);
        assertThat(con(dominio -> {
            throw new IllegalStateException("inesperado");
        }).verificar("lima.pe")).isEqualTo(RecepcionDeCorreo.DESCONOCIDA);
    }

    @Test
    void dnsColgado_fallaAbiertoDentroDelPlazo() {
        CountDownLatch nunca = new CountDownLatch(1);
        DnsVerificadorDeDominioAdapter colgado = con(dominio -> {
            try {
                nunca.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                // El adaptador cancela la consulta al vencer el plazo.
                Thread.currentThread().interrupt();
            }
            return List.of("10 mx.lima.pe.");
        });

        long inicio = System.nanoTime();
        RecepcionDeCorreo resultado = colgado.verificar("lima.pe");
        long milisegundos = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - inicio);

        assertThat(resultado).isEqualTo(RecepcionDeCorreo.DESCONOCIDA);
        // Plazo de 300 ms: vuelve poco despues, sin esperar al resolvedor.
        assertThat(milisegundos).isBetween(250L, 3000L);
    }

    @Test
    void unPlazoNoPositivo_noArranca() {
        assertThatThrownBy(() -> new DnsVerificadorDeDominioAdapter(dominio -> List.of(), Duration.ZERO))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("plazo-milisegundos");
    }

    @Test
    void tieneServidorDeCorreo_leeLaFormaDeJndi() {
        assertThat(DnsVerificadorDeDominioAdapter.tieneServidorDeCorreo(List.of("10 mx.lima.pe."))).isTrue();
        assertThat(DnsVerificadorDeDominioAdapter.tieneServidorDeCorreo(List.of(" 0  . "))).isFalse();
        assertThat(DnsVerificadorDeDominioAdapter.tieneServidorDeCorreo(List.of())).isFalse();
    }
}
