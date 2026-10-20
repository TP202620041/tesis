package pe.edu.upc.viasegura;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Punto de entrada del backend de Ciudad Viva.
 *
 * <p>Sistema de crowdsourcing geoespacial para el reporte ciudadano y la
 * gestion municipal de infraestructura vial en Lima Metropolitana.</p>
 */
@SpringBootApplication
@EnableJpaAuditing
public class ViaSeguraApplication {

    public static void main(String[] args) {
        SpringApplication.run(ViaSeguraApplication.class, args);
    }
}
