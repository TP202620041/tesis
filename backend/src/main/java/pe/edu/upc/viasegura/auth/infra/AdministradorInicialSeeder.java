package pe.edu.upc.viasegura.auth.infra;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;
import jakarta.validation.Validator;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;

/**
 * Crea el primer ADMIN de un entorno a partir de variables (DEP-04).
 *
 * <p>El registro publico solo crea ciudadanos, asi que en una base nueva nadie
 * podria responder tickets ni administrar categorias. Este seeder lee
 * {@code app.admin-inicial.*} ({@code ADMIN_INICIAL_EMAIL},
 * {@code ADMIN_INICIAL_PASSWORD} y {@code ADMIN_INICIAL_NOMBRE}) en cada
 * arranque, y solo actua en una base <b>sin ningun ADMIN</b> (decision del
 * usuario, 22/10):</p>
 * <ul>
 *   <li><b>Sin correo</b> (ausente o en blanco): no hace nada.</li>
 *   <li><b>Ya hay algun ADMIN:</b> no hace nada, sea cual sea el correo de la
 *       variable, y no valida nada. Asi nunca cambia la contrasena de un ADMIN
 *       (la cuenta ya es de la persona, que puede haberla cambiado), y unas
 *       variables olvidadas no sirven para crear mas ADMIN ni para tumbar el
 *       arranque si alguien se registra despues con ese correo. Los ADMIN
 *       siguientes se gestionan aparte.</li>
 *   <li><b>No hay ADMIN ni cuenta con ese correo:</b> la crea como ADMIN
 *       activo, con la contrasena hasheada por el {@link PasswordEncoder} de
 *       la aplicacion. Exige una contrasena de {@value #LONGITUD_MINIMA_PASSWORD}
 *       caracteres o mas y {@value #BYTES_MAXIMOS_PASSWORD} bytes como maximo;
 *       si no, la aplicacion no arranca.</li>
 *   <li><b>No hay ADMIN y el correo ya tiene cuenta</b> (con otro rol, por
 *       fuerza): la aplicacion no arranca. No la promueve: cualquiera pudo
 *       registrarse antes con ese correo y quedaria como ADMIN (hasta NC-09
 *       el registro no verificaba la propiedad del correo, y una cuenta sin
 *       confirmar tampoco la prueba).</li>
 * </ul>
 *
 * <p>La cuenta nace con el correo confirmado (NC-09): lo dio quien opera el
 * despliegue, no un registro publico.</p>
 *
 * <p>No registra el consentimiento: el ADMIN acepta los terminos vigentes en
 * su primer inicio de sesion, como cualquier cuenta sin aceptacion (D-12;
 * hasta entonces toda ruta privada le responde 403 {@code TERMINOS_PENDIENTES}).
 * No es una migracion porque el hash de la contrasena quedaria versionado y
 * seria el mismo en todos los entornos.</p>
 *
 * <p>Corre despues de los seeders de distritos y municipalidades
 * ({@code @Order(3)}). Como todo {@link ApplicationRunner}, corre cuando
 * Tomcat ya escucha: si falla, el proceso termina con error unos instantes
 * despues de abrir el puerto (README, "Operacion en produccion").</p>
 */
@Slf4j
@Component
@Order(3)
public class AdministradorInicialSeeder implements ApplicationRunner {

    /** Minimo de caracteres de la contrasena inicial: es la de la cuenta con mas permisos. */
    public static final int LONGITUD_MINIMA_PASSWORD = 12;

    /** BCrypt solo usa los primeros 72 bytes, y Spring Security rechaza una contrasena mas larga. */
    public static final int BYTES_MAXIMOS_PASSWORD = 72;

    /** Nombre cuando {@code ADMIN_INICIAL_NOMBRE} no esta definida. */
    public static final String NOMBRE_POR_DEFECTO = "Administrador";

    private static final int LONGITUD_MAXIMA_EMAIL = 150;
    private static final int LONGITUD_MAXIMA_NOMBRE = 100;

    /**
     * Las mismas restricciones que el correo del registro publico
     * ({@code RegistroRequest.email}): un correo que el registro rechazaria
     * tampoco sirve para el ADMIN. Se repiten aqui porque un adaptador no
     * depende de los contratos HTTP ({@code dto}, regla {@code capas}).
     */
    private record CorreoInicial(@NotBlank @Email @Size(max = LONGITUD_MAXIMA_EMAIL) String email) {}

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final Validator validator;
    private final String email;
    private final String password;
    private final String nombreCompleto;

    public AdministradorInicialSeeder(
            UsuarioRepository usuarioRepository,
            PasswordEncoder passwordEncoder,
            Validator validator,
            @Value("${app.admin-inicial.email:}") String email,
            @Value("${app.admin-inicial.password:}") String password,
            @Value("${app.admin-inicial.nombre:}") String nombre) {
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
        this.validator = validator;
        this.email = email == null ? "" : email.strip();
        // La contrasena no se recorta: los espacios son parte de ella, igual que en el registro.
        this.password = password == null ? "" : password;
        this.nombreCompleto = nombre == null ? "" : nombre.strip();
    }

    @Override
    public void run(ApplicationArguments args) {
        if (email.isEmpty()) {
            log.info("Administrador inicial omitido: ADMIN_INICIAL_EMAIL no esta definida.");
            return;
        }
        if (usuarioRepository.existsByRol(Rol.ADMIN)) {
            // Sin repetir el correo: no se valido y podria ser la contrasena pegada en otra variable.
            log.info("Administrador inicial omitido: ya existe un ADMIN, asi que ADMIN_INICIAL_* se ignoran"
                    + " (no se crea ni se modifica ninguna cuenta).");
            if (!password.isEmpty()) {
                log.warn("ADMIN_INICIAL_PASSWORD sigue definida y no se usa: borrela del entorno.");
            }
            return;
        }
        if (!validator.validateValue(CorreoInicial.class, "email", email).isEmpty()) {
            // Sin repetir el valor, por la misma razon.
            throw new IllegalStateException("ADMIN_INICIAL_EMAIL no es un correo valido: debe cumplir las mismas"
                    + " reglas que el registro (forma usuario@dominio, " + LONGITUD_MAXIMA_EMAIL
                    + " caracteres como maximo).");
        }

        Optional<Usuario> existente = usuarioRepository.findByEmail(email);
        if (existente.isPresent()) {
            // Sin ADMIN en la base, una cuenta con ese correo tiene otro rol.
            throw new IllegalStateException("ADMIN_INICIAL_EMAIL corresponde a una cuenta existente con rol "
                    + existente.get().getRol() + ". El administrador inicial solo se crea, nunca se promueve:"
                    + " cualquiera pudo registrarse antes con ese correo."
                    + " Use un correo sin cuenta.");
        }

        validarPassword();
        String[] nombreYApellido = nombreYApellido();
        usuarioRepository.save(Usuario.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .nombre(nombreYApellido[0])
                .apellido(nombreYApellido[1])
                .rol(Rol.ADMIN)
                .activo(true)
                // NC-09: nace confirmado. El correo lo dio el operador del
                // despliegue, no un registro publico; sin esto el ADMIN no
                // podria iniciar sesion hasta pedir un enlace.
                .correoConfirmado(true)
                .correoConfirmadoEn(Instant.now())
                .build());
        log.info("Administrador inicial creado: {}. Borre ADMIN_INICIAL_PASSWORD del entorno;"
                + " la cuenta acepta los terminos en su primer inicio de sesion.", email);
    }

    private void validarPassword() {
        if (password.isBlank()
                || password.codePointCount(0, password.length()) < LONGITUD_MINIMA_PASSWORD) {
            throw new IllegalStateException("ADMIN_INICIAL_PASSWORD debe tener al menos "
                    + LONGITUD_MINIMA_PASSWORD + " caracteres para crear el administrador inicial.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > BYTES_MAXIMOS_PASSWORD) {
            throw new IllegalStateException("ADMIN_INICIAL_PASSWORD supera los " + BYTES_MAXIMOS_PASSWORD
                    + " bytes que admite BCrypt (72 caracteres ASCII; menos si lleva tildes o enes).");
        }
    }

    /**
     * {@code ADMIN_INICIAL_NOMBRE} es el nombre completo: la primera palabra va a
     * {@code nombre} y el resto a {@code apellido} (que puede quedar vacio). La
     * PWA los muestra juntos, asi que la division no cambia lo que se ve.
     */
    private String[] nombreYApellido() {
        String completo = nombreCompleto.isEmpty() ? NOMBRE_POR_DEFECTO : nombreCompleto;
        String[] partes = completo.split("\\s+", 2);
        String nombre = partes[0];
        String apellido = partes.length > 1 ? partes[1] : "";
        if (nombre.length() > LONGITUD_MAXIMA_NOMBRE || apellido.length() > LONGITUD_MAXIMA_NOMBRE) {
            throw new IllegalStateException("ADMIN_INICIAL_NOMBRE es demasiado largo: el nombre y el apellido"
                    + " admiten " + LONGITUD_MAXIMA_NOMBRE + " caracteres cada uno.");
        }
        return new String[] {nombre, apellido};
    }
}
