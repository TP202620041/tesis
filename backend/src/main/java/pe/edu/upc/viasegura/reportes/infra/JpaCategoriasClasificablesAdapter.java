package pe.edu.upc.viasegura.reportes.infra;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.clasificacion.domain.CategoriaClasificable;
import pe.edu.upc.viasegura.clasificacion.port.CategoriasClasificables;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;

/**
 * Implementa el puerto {@link CategoriasClasificables} de {@code clasificacion}
 * con las categorias de este modulo (NC-04). Vive aqui y no en
 * {@code clasificacion} para no crear un ciclo entre modulos: ver la
 * justificacion en el puerto.
 *
 * <p>Una consulta derivada corta, sin transaccion propia: la usa
 * {@code ClasificacionService}, que corre fuera de toda transaccion para no
 * retener una conexion mientras espera al servicio de inferencia. Solo lee
 * columnas simples, nada perezoso.</p>
 */
@Component
@RequiredArgsConstructor
public class JpaCategoriasClasificablesAdapter implements CategoriasClasificables {

    private final CategoriaDanoRepository categoriaRepository;

    @Override
    public List<CategoriaClasificable> activas() {
        return categoriaRepository.findByActivoTrueAndEsEstandarTrueAndClaseModeloIsNotNull().stream()
                .map(c -> new CategoriaClasificable(c.getId(), c.getNombre(), c.getClaseModelo()))
                .toList();
    }
}
