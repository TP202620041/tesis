package pe.edu.upc.viasegura.reportes.service;

import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.OperacionNoPermitidaException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.dto.CategoriaDanoResponse;
import pe.edu.upc.viasegura.reportes.dto.CategoriaGestionResponse;
import pe.edu.upc.viasegura.reportes.dto.CrearCategoriaRequest;
import pe.edu.upc.viasegura.reportes.dto.EditarCategoriaRequest;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;

/**
 * Categorias de dano personalizadas por distrito (US-29). Las estandar
 * (seed V3, {@code distrito = null}) no se gestionan aqui: se listan en la
 * vista de gestion, pero no se editan ni se desactivan.
 *
 * <p>El usuario autenticado se obtiene con {@link UsuarioConsultaService}, la
 * API publica de {@code auth}, no con su repositorio (ARCHITECTURE.md 4.3).</p>
 */
@Service
@RequiredArgsConstructor
public class CategoriaDanoService {

    private final CategoriaDanoRepository categoriaRepository;
    private final UsuarioConsultaService usuarioConsultaService;

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

    /**
     * US-29: vista de gestion del funcionario. Estandar (solo lectura) mas
     * las personalizadas de SU distrito, <b>incluidas las inactivas</b>, para
     * poder reactivarlas. Dos consultas derivadas combinadas, mismo criterio
     * que {@link #listarDisponibles}.
     */
    @Transactional(readOnly = true)
    public List<CategoriaGestionResponse> listarParaGestion(String emailFuncionario) {
        Distrito distrito = distritoDeGestion(emailFuncionario);
        List<CategoriaDano> categorias =
                new ArrayList<>(categoriaRepository.findByEsEstandarTrueOrderByNombreAsc());
        categorias.addAll(categoriaRepository.findByDistritoIdOrderByNombreAsc(distrito.getId()));
        return categorias.stream().map(CategoriaGestionResponse::from).toList();
    }

    /** El funcionario crea una categoria propia de SU distrito de gestion. */
    @Transactional
    public CategoriaDanoResponse crear(String emailFuncionario, CrearCategoriaRequest req) {
        Distrito distrito = distritoDeGestion(emailFuncionario);
        validarNombreDisponible(req.nombre(), distrito, null);

        CategoriaDano categoria = categoriaRepository.save(CategoriaDano.builder()
                .nombre(req.nombre())
                .descripcion(req.descripcion())
                .esEstandar(false)
                .distrito(distrito)
                .activo(true)
                .build());

        return CategoriaDanoResponse.from(categoria);
    }

    /** US-29: edita nombre y descripcion de una personalizada de su distrito. */
    @Transactional
    public CategoriaGestionResponse editar(String emailFuncionario, Long categoriaId, EditarCategoriaRequest req) {
        Distrito distrito = distritoDeGestion(emailFuncionario);
        CategoriaDano categoria = categoriaGestionable(categoriaId, distrito);
        // Si el nombre no cambia (salvo mayusculas) no se revalida contra las
        // estandar: una personalizada anterior a esa regla que se llame como
        // una estandar debe poder seguir editando su descripcion.
        if (!req.nombre().equalsIgnoreCase(categoria.getNombre())) {
            validarNombreDisponible(req.nombre(), distrito, categoria.getId());
        }

        categoria.setNombre(req.nombre());
        categoria.setDescripcion(req.descripcion());
        return CategoriaGestionResponse.from(categoriaRepository.save(categoria));
    }

    /**
     * US-29: activa o desactiva una personalizada de su distrito.
     *
     * <p>Desactivar <b>solo</b> hace que deje de ofrecerse (catalogo publico) y
     * que no se pueda elegir para un reporte nuevo ni al cambiar la categoria
     * de uno existente. Los reportes que ya la usan quedan intactos y siguen
     * editables (ver {@code ReporteService#editar}). No cambia ningun KPI
     * (el desglose de US-20 agrupa por la categoria que ya tiene cada
     * reporte), por eso no publica evento. Es reversible.</p>
     */
    @Transactional
    public CategoriaGestionResponse cambiarActiva(String emailFuncionario, Long categoriaId, boolean activa) {
        Distrito distrito = distritoDeGestion(emailFuncionario);
        CategoriaDano categoria = categoriaGestionable(categoriaId, distrito);
        categoria.setActivo(activa);
        return CategoriaGestionResponse.from(categoriaRepository.save(categoria));
    }

    private Distrito distritoDeGestion(String emailFuncionario) {
        Distrito distrito = usuarioConsultaService.usuarioPorEmail(emailFuncionario).getDistrito();
        if (distrito == null) {
            throw new OperacionNoPermitidaException(
                    "El funcionario no tiene un distrito de gestion asignado");
        }
        return distrito;
    }

    /**
     * Inexistente → 404. Estandar o de otro distrito → 403 con mensaje: el
     * funcionario solo gestiona las personalizadas de su jurisdiccion.
     */
    private CategoriaDano categoriaGestionable(Long categoriaId, Distrito distrito) {
        CategoriaDano categoria = categoriaRepository.findById(categoriaId)
                .orElseThrow(() -> new ResourceNotFoundException("Categoria no encontrada: " + categoriaId));
        if (categoria.isEsEstandar()) {
            throw new OperacionNoPermitidaException(
                    "Las categorias estandar no se pueden editar ni desactivar");
        }
        if (categoria.getDistrito() == null || !categoria.getDistrito().getId().equals(distrito.getId())) {
            throw new OperacionNoPermitidaException(
                    "Solo puede gestionar las categorias personalizadas de " + distrito.getNombre());
        }
        return categoria;
    }

    /**
     * Nombre unico (sin distinguir mayusculas) entre las personalizadas del
     * distrito y las estandar: dos opciones iguales en el mismo selector
     * serian ambiguas para el ciudadano. {@code excluirId} es la propia
     * categoria al editar ({@code null} al crear).
     */
    private void validarNombreDisponible(String nombre, Distrito distrito, Long excluirId) {
        boolean duplicadaEnDistrito = excluirId == null
                ? categoriaRepository.existsByNombreIgnoreCaseAndDistritoId(nombre, distrito.getId())
                : categoriaRepository.existsByNombreIgnoreCaseAndDistritoIdAndIdNot(
                        nombre, distrito.getId(), excluirId);
        if (duplicadaEnDistrito) {
            throw new BusinessException("Ya existe una categoria con ese nombre en " + distrito.getNombre());
        }
        if (categoriaRepository.existsByNombreIgnoreCaseAndEsEstandarTrue(nombre)) {
            throw new BusinessException("Ya existe una categoria estandar con ese nombre");
        }
    }
}
