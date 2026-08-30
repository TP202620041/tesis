package pe.edu.upc.viasegura.reportes.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.reportes.domain.ComentarioPublico;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.dto.ComentarPublicoRequest;
import pe.edu.upc.viasegura.reportes.dto.ComentarioPublicoResponse;
import pe.edu.upc.viasegura.reportes.repository.ComentarioPublicoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Comentarios publicos de ciudadanos sobre reportes resueltos (US-27).
 *
 * <p>A diferencia de la calificacion (US-26, solo el creador), comentar es
 * <strong>opinion publica</strong>: cualquier ciudadano autenticado puede
 * confirmar si la reparacion fue efectiva. La lectura es publica (sin auth).</p>
 */
@Service
@RequiredArgsConstructor
public class ComentarioPublicoService {

    private final ReporteRepository reporteRepository;
    private final UsuarioRepository usuarioRepository;
    private final ComentarioPublicoRepository comentarioRepository;
    private final ReincidenciaDetector reincidenciaDetector;

    /** US-27: publica un comentario sobre un reporte resuelto. */
    @Transactional
    public ComentarioPublicoResponse comentar(String emailCiudadano, Long reporteId,
                                              ComentarPublicoRequest req) {
        Usuario ciudadano = usuarioRepository.findByEmail(emailCiudadano)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        // Solo reportes resueltos: el comentario confirma la efectividad de la
        // reparacion (mismo criterio de precondicion de estado -> 409 que US-26).
        if (reporte.getEstado() != EstadoReporte.RESUELTO) {
            throw new BusinessException("Solo se puede comentar un reporte resuelto");
        }

        boolean reincidencia = reincidenciaDetector.pareceReincidencia(req.contenido());

        ComentarioPublico comentario = comentarioRepository.save(ComentarioPublico.builder()
                .reporte(reporte)
                .usuario(ciudadano)
                .contenido(req.contenido())
                .posibleReincidencia(reincidencia)
                .build());

        // Etiqueta el reporte para que el funcionario lo vea resaltado en la
        // bandeja (US-13). Una vez marcado no se desmarca solo: el funcionario
        // lo revisa (p.ej. reabriendo un caso nuevo).
        if (reincidencia && !reporte.isPosibleReincidencia()) {
            reporte.setPosibleReincidencia(true);
            reporteRepository.save(reporte);
        }

        return ComentarioPublicoResponse.from(comentario);
    }

    /** US-27: comentarios de un reporte (lectura publica). */
    @Transactional(readOnly = true)
    public List<ComentarioPublicoResponse> listar(Long reporteId) {
        return comentarioRepository.findByReporteIdOrderByCreatedAtAsc(reporteId).stream()
                .map(ComentarioPublicoResponse::from)
                .toList();
    }
}
