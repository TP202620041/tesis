package pe.edu.upc.viasegura.municipalidades.infra;

import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.municipalidades.domain.Municipalidad;
import pe.edu.upc.viasegura.municipalidades.repository.MunicipalidadRepository;

/**
 * Siembra una municipalidad por distrito (NC-01, D-09): 42 distritales y la
 * Municipalidad Metropolitana de Lima para Cercado de Lima.
 *
 * <p>No es una migracion porque depende de los distritos, que carga
 * {@code DistritoSeeder} al arrancar, despues de Flyway: en una base vacia
 * (IT) la migracion no tendria a quien referenciar. Corre despues de ese
 * seeder ({@link Order}) y es idempotente: solo crea las que faltan.</p>
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class MunicipalidadSeeder implements ApplicationRunner {

    private final MunicipalidadRepository municipalidadRepository;

    @Override
    public void run(ApplicationArguments args) {
        List<Municipalidad> faltantes = municipalidadRepository.distritosSinMunicipalidad().stream()
                // El Distrito solo lleva el id: sirve para escribir la FK. No hay
                // cascada en la relacion y esta instancia no se lee despues.
                .map(d -> Municipalidad.builder()
                        .distrito(Distrito.builder().id(d.getId()).build())
                        .nombre(Municipalidad.nombreOficial(d.getNombre()))
                        .build())
                .toList();
        if (faltantes.isEmpty()) {
            log.info("Seeder de municipalidades omitido: todos los distritos tienen municipalidad.");
            return;
        }
        municipalidadRepository.saveAll(faltantes);
        log.info("Seeder de municipalidades: {} municipalidades creadas.", faltantes.size());
    }
}
