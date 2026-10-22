package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.ConfigurableEnvironment;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Sin perfil activo explicito, el secreto de desarrollo no arranca (DEP-01,
 * SEC-03).
 *
 * <p>{@code application.yml} declara {@code spring.profiles.default: local}.
 * Si en el despliegue falta {@code SPRING_PROFILES_ACTIVE} (o queda vacia),
 * Spring Boot activa {@code local} <i>por defecto</i> y carga
 * {@code application-local.yml}, con la bandera
 * {@code permitir-secreto-de-desarrollo} en {@code true}. La bandera sola no
 * protege ese caso; por eso {@code JwtService} exige ademas que {@code local}
 * o {@code test} esten activos de forma explicita.</p>
 *
 * <p>Arranca la aplicacion real, sin BD: {@code JwtService} falla al crear
 * Tomcat, antes de que Flyway o JPA abran una conexion. Por si acaso, la URL
 * apunta a un puerto cerrado y el secreto se fija por argumento, para no
 * depender de un {@code JWT_SECRET} de la maquina.</p>
 */
class ArranqueSinPerfilExplicitoIT {

    private static final String SECRETO_DE_DESARROLLO_PUBLICADO =
            "Y2hhbmdlLW1lLXRoaXMtaXMtYS1kZXYtb25seS1zZWNyZXQtMDEyMzQ1Njc4OQ==";

    @Test
    void sinPerfilExplicito_elSecretoDeDesarrolloSeRechazaAunqueLaBanderaQuedeEnTrue() {
        AtomicReference<ConfigurableEnvironment> entorno = new AtomicReference<>();
        SpringApplication aplicacion = new SpringApplication(ViaSeguraApplication.class);
        aplicacion.addListeners((ApplicationListener<ApplicationEnvironmentPreparedEvent>)
                evento -> entorno.set(evento.getEnvironment()));

        assertThatThrownBy(() -> aplicacion.run(
                "--security.jwt.secret=" + SECRETO_DE_DESARROLLO_PUBLICADO,
                "--server.port=0",
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:1/ninguna"))
                .rootCause()
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("secreto JWT es el de desarrollo")
                .hasMessageContaining("de forma explicita");

        // El escenario es el que se queria probar: ningun perfil explicito,
        // `local` solo por defecto y, con el, la bandera en true.
        assertThat(entorno.get().getActiveProfiles()).isEmpty();
        assertThat(entorno.get().getDefaultProfiles()).containsExactly("local");
        assertThat(entorno.get().getProperty("security.jwt.permitir-secreto-de-desarrollo")).isEqualTo("true");
    }
}
