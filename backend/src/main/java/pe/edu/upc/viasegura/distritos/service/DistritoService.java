package pe.edu.upc.viasegura.distritos.service;

import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.dto.DistritoResponse;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;

/**
 * Catalogo de distritos de Lima Metropolitana (dato de referencia).
 *
 * <p>Los 43 distritos los carga {@code infra.DistritoSeeder} al arrancar; aqui
 * solo se leen.</p>
 */
@Service
@RequiredArgsConstructor
public class DistritoService {

    private final DistritoRepository distritoRepository;

    /** Los 43 distritos en orden alfabetico, para selectores y filtros. */
    @Transactional(readOnly = true)
    public List<DistritoResponse> listar() {
        return distritoRepository.findAllByOrderByNombreAsc().stream()
                .map(DistritoResponse::from)
                .toList();
    }

    /**
     * Distrito por id, para otros modulos (BE-06: {@code auth} lo usa al
     * editar el perfil en vez de {@link DistritoRepository}). Inexistente: 404.
     */
    @Transactional(readOnly = true)
    public Distrito porId(Long id) {
        return distritoRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Distrito no encontrado: " + id));
    }

    /**
     * Distrito que contiene el punto dado, o vacio si cae fuera de la
     * cobertura de Lima Metropolitana.
     *
     * <p>Expone al cliente la MISMA resolucion espacial que usa la asignacion
     * automatica de reportes ({@code PointInPolygonAssignmentStrategy}):
     * ambas pasan por {@link DistritoRepository#findDistritoQueContiene}
     * ({@code ST_Covers} sobre {@code geography}, con indice GiST). Es
     * deliberado que sea el mismo camino y no una copia: si el frontend
     * calculara el distrito por su cuenta, podria discrepar de lo que el
     * backend asigne al crear el reporte.</p>
     *
     * <p>Existe para que la PWA pueda (a) ofrecer las categorias
     * personalizadas del distrito correcto al crear un reporte (US-29) y
     * (b) mostrarle al ciudadano a que municipalidad ira su reporte antes de
     * enviarlo. Esto ultimo hace visible la restriccion clave del proyecto
     * — la asignacion es automatica por GPS — sin pedirle que seleccione
     * nada.</p>
     */
    @Transactional(readOnly = true)
    public Optional<DistritoResponse> porCoordenadas(double latitud, double longitud) {
        if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
            throw new IllegalArgumentException("Coordenadas fuera de rango");
        }
        return distritoRepository.findDistritoQueContiene(longitud, latitud)
                .map(DistritoResponse::from);
    }
}
