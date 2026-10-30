package pe.edu.upc.viasegura.clasificacion.controller;

import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.upc.viasegura.clasificacion.dto.ClasificacionResponse;
import pe.edu.upc.viasegura.clasificacion.service.ClasificacionService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/** Vista previa de la categoria de una foto (NC-04, ARCHITECTURE.md 4.3 paso 1). */
@RestController
@RequestMapping("/api/clasificaciones")
@RequiredArgsConstructor
public class ClasificacionController {

    private final ClasificacionService clasificacionService;

    /**
     * El ciudadano sube la foto mientras arma el reporte y recibe la categoria
     * sugerida, o ninguna. <b>No guarda nada</b>: ni la foto ni el resultado.
     * Responde 200 aun sin sugerencia; el reporte se crea despues con
     * {@code POST /api/reportes} y la categoria que el ciudadano confirme.
     * Tambien 200 si la moderacion rechaza la foto (NC-10b): con
     * {@code fotoRechazada: true} y sin categoria.
     *
     * <p>Solo CIUDADANO (el unico que crea reportes) y con los terminos
     * aceptados, como el resto de las rutas privadas ({@code SecurityConfig}).
     * Sin la parte {@code foto}, o vacia: 400. Si no es una imagen JPEG, PNG o
     * WEBP valida: 409, como al crear el reporte.</p>
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<ClasificacionResponse> clasificar(@RequestPart("foto") MultipartFile foto) {
        return ResponseEntity.ok(clasificacionService.vistaPrevia(archivoSubido(foto)));
    }

    /**
     * La parte multipart como {@link ArchivoSubido}, para que el servicio no
     * reciba tipos de Spring Web (BE-10); el mismo criterio que
     * {@code ReporteController} y {@code AuthController}.
     */
    private static ArchivoSubido archivoSubido(MultipartFile archivo) {
        try {
            return new ArchivoSubido(archivo.getBytes(), archivo.getContentType(), archivo.getOriginalFilename());
        } catch (IOException e) {
            throw new BusinessException("No se pudo leer la foto");
        }
    }
}
