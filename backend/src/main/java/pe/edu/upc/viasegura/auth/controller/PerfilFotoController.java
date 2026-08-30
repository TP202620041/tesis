package pe.edu.upc.viasegura.auth.controller;

import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.auth.service.PerfilFotoService;

import java.time.Duration;

/**
 * Entrega la foto de perfil de un ciudadano (US-30) solo a su dueno.
 *
 * <p>Es un controlador y no un recurso estatico porque la regla de acceso es
 * <b>por instancia</b>, no por patron de ruta: "solo el dueno de ESTE
 * archivo". {@code SecurityConfig} protege rutas por rol y no puede
 * expresarlo; hace falta leer al usuario autenticado y compararlo con el
 * dueno real del archivo, que es lo que hace {@link PerfilFotoService}.</p>
 */
@RestController
@RequestMapping("/api/perfiles/fotos")
@RequiredArgsConstructor
public class PerfilFotoController {

    /** Nombres de archivo UUID: el contenido de una URL nunca cambia. */
    private static final Duration CACHE = Duration.ofDays(30);

    private final PerfilFotoService perfilFotoService;

    /**
     * Foto de perfil del usuario autenticado.
     *
     * <p>Devuelve <b>404 y no 403</b> cuando el archivo pedido no es el del
     * solicitante. Es una desviacion deliberada del criterio general del
     * proyecto (403 para "autenticado pero sin permiso"): un 403 confirmaria
     * que ese archivo existe, y tratandose de fotos de personas conviene no
     * revelar nada. Desde el punto de vista de quien pregunta, ese archivo
     * simplemente no forma parte de su perfil.</p>
     */
    @GetMapping("/{archivo}")
    public ResponseEntity<Resource> foto(@PathVariable("archivo") String archivo, Principal principal) {
        return perfilFotoService.fotoDelUsuario(principal.getName(), archivo)
                .map(foto -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(foto.contentType()))
                        .cacheControl(CacheControl.maxAge(CACHE).cachePrivate())
                        .body(foto.recurso()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
