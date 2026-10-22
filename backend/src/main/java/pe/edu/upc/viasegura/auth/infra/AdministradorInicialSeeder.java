package pe.edu.upc.viasegura.auth.infra;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;
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
 * arranque:</p>
 * <ul>
 *   <li><b>Sin correo</b> (ausente o en blanco): no hace nada.</li>
 *   <li><b>No existe ninguna cuenta con ese correo:</b> la crea como ADMIN
 *       activo, con la contrasena hasheada por el {@link PasswordEncoder} de
 *       la aplicacion. Exige una contrasena de {@value #LONGITUD_MINIMA_PASSWORD}
 *       caracteres o mas; si no, la aplicacion no arranca.</li>
 *   <li><b>Ya es ADMIN:</b> no hace nada y <b>nunca</b> cambia su contrasena,
 *       aunque la variable traiga otra: desde el primer arranque la cuenta es
 *       de la persona, que puede haberla cambiado.</li>
 *   <li><b>Existe con otro rol:</b> la aplicacion no arranca. No la promueve:
 *       el registro no verifica la propiedad del correo, asi que cualquiera
 *       pudo registrarse antes con ese correo y quedaria como ADMIN.</li>
 * </ul>
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
    private static final Pattern FORMA_DE_CORREO = Pattern.compile("[^@\\s]+@[^@\\s]+");

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;
    private final String nombreCompleto;

    public AdministradorInicialSeeder(
            UsuarioRepository usuarioRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.admin-inicial.email:}") String email,
            @Value("${app.admin-inicial.password:}") String password,
            @Value("${app.admin-inicial.nombre:}") String nombre) {
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
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
        if (email.length() > LONGITUD_MAXIMA_EMAIL || !FORMA_DE_CORREO.matcher(email).matches()) {
            // Sin repetir el valor: podria ser la contrasena pegada en la variable equivocada.
            throw new IllegalStateException("ADMIN_INICIAL_EMAIL no es un correo valido (forma usuario@dominio, "
                    + LONGITUD_MAXIMA_EMAIL + " caracteres como maximo).");
        }

        Optional<Usuario> existente = usuarioRepository.findByEmail(email);
        if (existente.isPresent()) {
            omitirSiYaEsAdmin(existente.get());
            return;
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
                .build());
        log.info("Administrador inicial creado: {}. Borre ADMIN_INICIAL_PASSWORD del entorno;"
                + " la cuenta acepta los terminos en su primer inicio de sesion.", email);
    }

    private void omitirSiYaEsAdmin(Usuario usuario) {
        if (usuario.getRol() != Rol.ADMIN) {
            throw new IllegalStateException("ADMIN_INICIAL_EMAIL corresponde a una cuenta existente con rol "
                    + usuario.getRol() + ". El administrador inicial solo se crea, nunca se promueve: el registro"
                    + " no verifica la propiedad del correo y cualquiera pudo registrarse antes con el. Use un"
                    + " correo sin cuenta, o quite ADMIN_INICIAL_EMAIL si el ADMIN ya existe.");
        }
        log.info("Administrador inicial omitido: {} ya es ADMIN (su contrasena no se modifica).", email);
        if (!password.isEmpty()) {
            log.warn("ADMIN_INICIAL_PASSWORD sigue definida y ya no se usa: borrela del entorno.");
        }
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
