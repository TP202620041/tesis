package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.infra.AdministradorInicialSeeder;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;

/**
 * DEP-04: el correo del ADMIN inicial cumple las mismas reglas que el del
 * registro publico ({@code RegistroRequest.email}: {@code @Email} y 150
 * caracteres). Test puro, con el repositorio simulado en una base sin ADMIN;
 * el comportamiento contra la base esta en {@code AdministradorInicialSeederIT},
 * que reutiliza {@link #correosQueElRegistroRechaza()}.
 */
class AdministradorInicialSeederTest {

    private static final String PASSWORD = "Inicial-Segura-2026";
    private static ValidatorFactory fabrica;
    private static Validator validator;

    private UsuarioRepository repositorio;

    /** Correos que el registro rechazaria (400) y que tampoco sirven para el ADMIN. */
    static Stream<String> correosQueElRegistroRechaza() {
        return Stream.of(
                "sin-arroba.admin-inicial.test",
                "dos@@admin-inicial.test",
                "con espacio@admin-inicial.test",
                // Forma usuario@dominio, pero con una etiqueta vacia en el dominio.
                "ana@muni..pe",
                // Forma valida y 189 caracteres: pasa el limite de 150 de la columna y del registro.
                "ana@" + "a".repeat(60) + "." + "b".repeat(60) + "." + "c".repeat(60) + ".pe");
    }

    @BeforeAll
    static void crearValidador() {
        fabrica = Validation.buildDefaultValidatorFactory();
        validator = fabrica.getValidator();
    }

    @AfterAll
    static void cerrarValidador() {
        fabrica.close();
    }

    @BeforeEach
    void baseSinAdmin() {
        repositorio = mock(UsuarioRepository.class);
        when(repositorio.existsByRol(Rol.ADMIN)).thenReturn(false);
        when(repositorio.findByEmail(any())).thenReturn(Optional.empty());
    }

    private void correr(String email, String password) {
        new AdministradorInicialSeeder(repositorio, new BCryptPasswordEncoder(), validator, email, password, null)
                .run(new DefaultApplicationArguments());
    }

    @ParameterizedTest
    @MethodSource("correosQueElRegistroRechaza")
    void correoQueElRegistroRechazaria_fallaAntesDeBuscarLaCuentaYSinRepetirElValor(String email) {
        assertThatThrownBy(() -> correr(email, PASSWORD))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INICIAL_EMAIL no es un correo valido")
                .hasMessageNotContaining(email);

        verify(repositorio, never()).findByEmail(any());
        verify(repositorio, never()).save(any());
    }

    @Test
    void correoValido_pasaALaSiguienteComprobacion() {
        // Con una contrasena corta, el error es el de la contrasena: el correo se acepto.
        assertThatThrownBy(() -> correr("ana@muni.pe", "corta"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INICIAL_PASSWORD");

        verify(repositorio).findByEmail("ana@muni.pe");
        verify(repositorio, never()).save(any());
    }
}
