package pe.edu.upc.viasegura.auth.infra;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.naming.Context;
import javax.naming.NameNotFoundException;
import javax.naming.NamingEnumeration;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.port.RecepcionDeCorreo;
import pe.edu.upc.viasegura.auth.port.VerificadorDeDominioDeCorreo;

/**
 * Consulta los registros MX del dominio en el DNS (NC-09). Se activa con
 * {@code app.dominio-correo.tipo=dns}, el valor por defecto en {@code prod}.
 *
 * <p><b>Sin dependencias nuevas:</b> usa el proveedor DNS de JNDI que trae el
 * JDK ({@code com.sun.jndi.dns}, modulo {@code jdk.naming.dns}, incluido en
 * la imagen {@code eclipse-temurin:21-jre}) con los servidores DNS del
 * sistema (en el contenedor, los de {@code /etc/resolv.conf}).</p>
 *
 * <p><b>Que rechaza</b> ({@link RecepcionDeCorreo#NO_RECIBE}): un dominio que
 * no existe (NXDOMAIN), uno sin registros MX y uno que publica un «null MX»
 * (RFC 7505: un unico MX {@code 0 .}, que declara que no recibe correo; lo
 * hace, por ejemplo, {@code example.com}). Tambien, sin consultar, un literal
 * de IP ({@code [192.0.2.1]}) o un nombre sin punto ({@code localhost}).
 * No aplica el «MX implicito» del RFC 5321 (entregar al registro A cuando no
 * hay MX): la decision del usuario fue «sin registro MX, no recibe correo», y
 * un dominio que de verdad recibe correo publica su MX.</p>
 *
 * <p><b>Falla abierto</b> ({@link RecepcionDeCorreo#DESCONOCIDA}, con un
 * WARN): un error del DNS (SERVFAIL, sin servidores configurados, respuesta
 * ilegible) o que no responda dentro del plazo. El enlace de confirmacion es
 * la prueba definitiva, y un DNS caido no debe impedir registrarse.</p>
 *
 * <p><b>Plazo corto y garantizado.</b> La consulta corre en el hilo de la
 * peticion del registro (fuera de la transaccion): el ciudadano espera. JNDI
 * espera {@value #TIMEOUT_INICIAL_MS} ms la primera respuesta y reintenta
 * una vez con el doble, pero eso es <i>por servidor</i>, y el contenedor
 * puede tener varios. Por eso la consulta va a un hilo virtual y la peticion
 * espera como maximo {@code app.dominio-correo.dns.plazo-milisegundos}
 * (3000 por defecto); pasado el plazo, se acepta.</p>
 *
 * <p>En el log va el dominio (no el correo), que sirve para revisar un
 * rechazo que alguien reclame.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.dominio-correo.tipo", havingValue = "dns")
public class DnsVerificadorDeDominioAdapter implements VerificadorDeDominioDeCorreo {

    static final int TIMEOUT_INICIAL_MS = 1000;
    static final int REINTENTOS = 2;

    /** Consulta los registros MX de un dominio; inyectable para los tests. */
    @FunctionalInterface
    interface ResolvedorMx {

        /**
         * Los registros MX tal como los da el DNS ({@code "10 mx.ejemplo.pe."});
         * vacia si el dominio existe pero no tiene MX.
         *
         * @throws NameNotFoundException si el dominio no existe (NXDOMAIN).
         * @throws NamingException       ante cualquier otro error del DNS.
         */
        List<String> registrosMx(String dominio) throws NamingException;
    }

    private final ResolvedorMx resolvedor;
    private final Duration plazo;
    private final ExecutorService consultas;

    @Autowired
    public DnsVerificadorDeDominioAdapter(
            @Value("${app.dominio-correo.dns.plazo-milisegundos:3000}") long plazoMilisegundos) {
        this(new JndiResolvedorMx(), Duration.ofMillis(plazoMilisegundos));
        log.info("Registro con verificacion del dominio del correo por DNS (DOMINIO_CORREO_TIPO=dns), plazo {} ms",
                plazoMilisegundos);
    }

    DnsVerificadorDeDominioAdapter(ResolvedorMx resolvedor, Duration plazo) {
        if (plazo.isNegative() || plazo.isZero()) {
            throw new IllegalStateException("app.dominio-correo.dns.plazo-milisegundos debe ser mayor que 0");
        }
        this.resolvedor = resolvedor;
        this.plazo = plazo;
        this.consultas = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("viasegura-dns-", 0).factory());
    }

    @PreDestroy
    void cerrar() {
        consultas.shutdownNow();
    }

    @Override
    public RecepcionDeCorreo verificar(String dominio) {
        if (dominio == null || dominio.isBlank() || dominio.startsWith("[") || !dominio.contains(".")) {
            log.info("Dominio de correo rechazado sin consultar el DNS (literal de IP o nombre sin punto)");
            return RecepcionDeCorreo.NO_RECIBE;
        }
        Future<List<String>> consulta = consultas.submit(() -> resolvedor.registrosMx(dominio));
        try {
            List<String> registros = consulta.get(plazo.toMillis(), TimeUnit.MILLISECONDS);
            if (tieneServidorDeCorreo(registros)) {
                return RecepcionDeCorreo.RECIBE;
            }
            log.info("El dominio {} no recibe correo: sin MX o con null MX (RFC 7505)", dominio);
            return RecepcionDeCorreo.NO_RECIBE;
        } catch (TimeoutException e) {
            consulta.cancel(true);
            log.warn("El DNS no respondio en {} ms por el MX de {}: se acepta el registro sin verificar",
                    plazo.toMillis(), dominio);
            return RecepcionDeCorreo.DESCONOCIDA;
        } catch (ExecutionException e) {
            if (e.getCause() instanceof NameNotFoundException) {
                log.info("El dominio {} no existe en el DNS (NXDOMAIN)", dominio);
                return RecepcionDeCorreo.NO_RECIBE;
            }
            log.warn("No se pudo consultar el MX de {} ({}): se acepta el registro sin verificar",
                    dominio, e.getCause() == null ? "sin causa" : e.getCause().getClass().getSimpleName());
            return RecepcionDeCorreo.DESCONOCIDA;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            consulta.cancel(true);
            return RecepcionDeCorreo.DESCONOCIDA;
        }
    }

    /**
     * Si algun registro MX apunta a un servidor. Un registro tiene la forma
     * {@code "<preferencia> <servidor>"}; el null MX de RFC 7505 es
     * {@code "0 ."}. Un registro ilegible no cuenta como servidor.
     */
    static boolean tieneServidorDeCorreo(List<String> registros) {
        for (String registro : registros) {
            String[] partes = registro.strip().split("\\s+");
            if (partes.length == 2 && !partes[1].equals(".") && !partes[1].isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /** El proveedor DNS de JNDI con los servidores del sistema. */
    static final class JndiResolvedorMx implements ResolvedorMx {

        private static final String[] SOLO_MX = {"MX"};

        @Override
        public List<String> registrosMx(String dominio) throws NamingException {
            Hashtable<String, String> entorno = new Hashtable<>();
            entorno.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.dns.DnsContextFactory");
            // "dns:" sin servidor: los del sistema operativo.
            entorno.put(Context.PROVIDER_URL, "dns:");
            entorno.put("com.sun.jndi.dns.timeout.initial", String.valueOf(TIMEOUT_INICIAL_MS));
            entorno.put("com.sun.jndi.dns.timeout.retries", String.valueOf(REINTENTOS));
            DirContext contexto = new InitialDirContext(entorno);
            try {
                Attribute mx = contexto.getAttributes(dominio, SOLO_MX).get("MX");
                List<String> registros = new ArrayList<>();
                if (mx != null) {
                    NamingEnumeration<?> valores = mx.getAll();
                    while (valores.hasMore()) {
                        registros.add(String.valueOf(valores.next()));
                    }
                }
                return registros;
            } finally {
                contexto.close();
            }
        }
    }
}
