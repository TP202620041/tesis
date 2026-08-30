package pe.edu.upc.viasegura.reportes.service;

import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.dto.CategoriaDanoResponse;
import pe.edu.upc.viasegura.reportes.dto.CrearCategoriaRequest;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;

/**
 * Categorias de dano personalizadas por distrito (US-29). Las estandar
 * (seed V3, {@code distrito = null}) no se gestionan aqui.
 */
@Service
@RequiredArgsConstructor
public class CategoriaDanoService {

    private final CategoriaDanoRepository categoriaRepository;
    private final UsuarioRepository usuarioRepository;

    /**
     * Catalogo de categorias seleccionables, para poblar el selector de
     * "crear reporte" (US-05) y los filtros de busqueda/mapa (US-10/US-12).
     *
     * <p><b>Comportamiento por defecto (sin {@code distritoId}): solo las
     * estandar.</b> No se devuelven las personalizadas de los 43 distritos
     * porque una categoria personalizada solo es valida en SU distrito
     * ({@code ReporteService#validarCategoriaParaDistrito}): ofrecerlas todas
     * dejaria elegir una que el POST rechaza con 409. Con {@code distritoId},
     * se devuelve exactamente lo valido ahi: estandar + personalizadas de ese
     * distrito. Asi, todo lo que este endpoint devuelve es siempre
     * seleccionable.</p>
     *
     * <p>Solo categorias {@code activo = true}: una inactiva tambien seria
     * rechazada al crear el reporte.</p>
     *
     * <p>Un {@code distritoId} inexistente no es un error: devuelve solo las
     * estandar, mismo criterio que los filtros de busqueda de US-12 (que
     * tampoco validan el distrito, solo devuelven vacio).</p>
     */
    @Transactional(readOnly = true)
    public List<CategoriaDanoResponse> listarDisponibles(Long distritoId) {
        List<CategoriaDano> categorias =
                new ArrayList<>(categoriaRepository.findByActivoTrueAndEsEstandarTrueOrderByNombreAsc());
        if (distritoId != null) {
            categorias.addAll(categoriaRepository.findByActivoTrueAndDistritoIdOrderByNombreAsc(distritoId));
        }
        return categorias.stream().map(CategoriaDanoResponse::from).toList();
    }

    /** El funcionario crea una categoria propia de SU distrito de gestion. */
    @Transactional
    public CategoriaDanoResponse crear(String emailFuncionario, CrearCategoriaRequest req) {
        Usuario funcionario = usuarioRepository.findByEmail(emailFuncionario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        Distrito distrito = funcionario.getDistrito();
        if (distrito == null) {
            throw new AccessDeniedException("El funcionario no tiene un distrito de gestion asignado");
        }

        if (categoriaRepository.existsByNombreIgnoreCaseAndDistritoId(req.nombre(), distrito.getId())) {
            throw new BusinessException(
                    "Ya existe una categoria con ese nombre en " + distrito.getNombre());
        }

        CategoriaDano categoria = categoriaRepository.save(CategoriaDano.builder()
                .nombre(req.nombre())
                .descripcion(req.descripcion())
                .esEstandar(false)
                .distrito(distrito)
                .activo(true)
                .build());

        return CategoriaDanoResponse.from(categoria);
    }
}
