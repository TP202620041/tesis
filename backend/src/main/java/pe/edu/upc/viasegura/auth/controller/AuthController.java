package pe.edu.upc.viasegura.auth.controller;

import jakarta.validation.Valid;
import java.io.IOException;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.upc.viasegura.auth.dto.ActualizarPreferenciaRequest;
import pe.edu.upc.viasegura.auth.dto.AuthResponse;
import pe.edu.upc.viasegura.auth.dto.ConfirmarCorreoRequest;
import pe.edu.upc.viasegura.auth.dto.LoginRequest;
import pe.edu.upc.viasegura.auth.dto.RecuperarPasswordRequest;
import pe.edu.upc.viasegura.auth.dto.ReenviarConfirmacionRequest;
import pe.edu.upc.viasegura.auth.dto.RegistroRequest;
import pe.edu.upc.viasegura.auth.dto.RegistroResponse;
import pe.edu.upc.viasegura.auth.dto.RestablecerPasswordRequest;
import pe.edu.upc.viasegura.auth.dto.UsuarioResponse;
import pe.edu.upc.viasegura.auth.service.AuthService;
import pe.edu.upc.viasegura.auth.service.ConfirmacionCorreoService;
import pe.edu.upc.viasegura.auth.service.PasswordResetService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/**
 * API de acceso y autenticacion.
 *
 * <p>Endpoints publicos: registro, login, recuperacion de contrasena y
 * confirmacion del correo (NC-09). {@code /me} requiere token.</p>
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final ConfirmacionCorreoService confirmacionCorreoService;

    /**
     * US-01: registro de cuenta ciudadana. Desde NC-09 la cuenta nace sin
     * confirmar y la respuesta no trae token: la persona confirma su correo
     * con el enlace que recibe y despues inicia sesion.
     */
    @PostMapping("/registro")
    public ResponseEntity<RegistroResponse> registrar(@Valid @RequestBody RegistroRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.registrar(request));
    }

    /**
     * NC-09: confirma el correo con el token del enlace. No inicia sesion
     * (204 sin cuerpo); un token desconocido, vencido, reemplazado o de una
     * cuenta ya confirmada es 409 con {@code codigo}.
     */
    @PostMapping("/confirmar-correo")
    public ResponseEntity<Void> confirmarCorreo(@Valid @RequestBody ConfirmarCorreoRequest request) {
        confirmacionCorreoService.confirmar(request.token());
        return ResponseEntity.noContent().build();
    }

    /**
     * NC-09: pide un enlace de confirmacion nuevo. Responde 202 siempre
     * (exista o no la cuenta, este o no confirmada, o se haya alcanzado el
     * tope), igual que la recuperacion de contrasena: no revela que correos
     * tienen cuenta.
     */
    @PostMapping("/reenviar-confirmacion")
    public ResponseEntity<Void> reenviarConfirmacion(@Valid @RequestBody ReenviarConfirmacionRequest request) {
        confirmacionCorreoService.reenviar(request.email());
        return ResponseEntity.accepted().build();
    }

    /** US-02: inicio de sesion. */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    /**
     * US-03: solicita el token de recuperacion por email. Responde 202
     * siempre (exista o no la cuenta) para no revelar que correos estan
     * registrados.
     */
    @PostMapping("/recuperar-password")
    public ResponseEntity<Void> recuperarPassword(@Valid @RequestBody RecuperarPasswordRequest request) {
        passwordResetService.solicitarRecuperacion(request.email());
        return ResponseEntity.accepted().build();
    }

    /** US-03: restablece la contrasena con el token recibido por email. */
    @PostMapping("/restablecer-password")
    public ResponseEntity<Void> restablecerPassword(@Valid @RequestBody RestablecerPasswordRequest request) {
        passwordResetService.restablecer(request.token(), request.nuevaPassword());
        return ResponseEntity.noContent().build();
    }

    /** Datos del usuario autenticado (verifica que el JWT funciona). */
    @GetMapping("/me")
    public ResponseEntity<UsuarioResponse> perfil(Principal principal) {
        return ResponseEntity.ok(authService.perfilActual(principal.getName()));
    }

    /** US-30 (minimo): el ciudadano cambia su canal de notificacion preferido. */
    @PatchMapping("/me/preferencia-notificacion")
    public ResponseEntity<UsuarioResponse> actualizarPreferencia(
            @Valid @RequestBody ActualizarPreferenciaRequest request, Principal principal) {
        return ResponseEntity.ok(authService.actualizarPreferenciaNotificacion(
                principal.getName(), request.preferenciaNotificacion()));
    }

    /**
     * US-30: edita nombre/apellido, foto y distrito de residencia. Multipart
     * (no JSON) porque acepta un archivo junto con los demas campos, mismo
     * enfoque que {@code POST /api/reportes} (US-05). Todos los campos son
     * opcionales -- PATCH parcial. Solo CIUDADANO: ver justificacion en
     * {@code AuthService#editarPerfil}.
     */
    @PatchMapping(value = "/me", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<UsuarioResponse> editarPerfil(
            @RequestParam(value = "nombre", required = false) String nombre,
            @RequestParam(value = "apellido", required = false) String apellido,
            @RequestParam(value = "distritoId", required = false) Long distritoId,
            @RequestPart(value = "foto", required = false) MultipartFile foto,
            Principal principal) {
        return ResponseEntity.ok(authService.editarPerfil(
                principal.getName(), nombre, apellido, distritoId, archivoSubido(foto)));
    }

    /**
     * Convierte la parte multipart en {@link ArchivoSubido} para que el
     * servicio no reciba tipos de Spring Web (BE-10). Sin parte, {@code null};
     * una parte vacia llega como archivo vacio y el servicio la ignora, igual
     * que antes con {@code MultipartFile#isEmpty}.
     */
    private static ArchivoSubido archivoSubido(MultipartFile archivo) {
        if (archivo == null) {
            return null;
        }
        try {
            return new ArchivoSubido(archivo.getBytes(), archivo.getContentType(), archivo.getOriginalFilename());
        } catch (IOException e) {
            throw new BusinessException("No se pudo almacenar la foto");
        }
    }
}
