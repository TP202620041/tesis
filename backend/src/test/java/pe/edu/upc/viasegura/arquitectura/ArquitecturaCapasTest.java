package pe.edu.upc.viasegura.arquitectura;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.library.freeze.FreezingArchRule.freeze;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.util.Set;

/**
 * Reglas de arquitectura en capas del backend (ARCHITECTURE.md, seccion 4).
 *
 * <p>Es la guarda automatica que mantiene uniforme el codigo aunque lo escriban
 * agentes distintos: si una clase nueva rompe una regla, {@code mvn test} falla
 * con el nombre de la regla y la dependencia exacta.
 *
 * <p><b>Congelamiento ({@code FreezingArchRule}).</b> Cuando se agrego este test,
 * el codigo ya tenia violaciones conocidas (plan de migracion BE-02..BE-07). En
 * vez de desactivar las reglas, se congelan: la primera corrida guarda las
 * violaciones existentes en {@code src/test/resources/archunit_store}, y desde
 * ahi solo fallan las NUEVAS. Al corregir una violacion, ArchUnit la retira del
 * almacen solo. El almacen se versiona en git: su tamanio es la deuda pendiente,
 * y debe llegar a cero al cerrar la migracion (tarea BE-08).
 *
 * <p>Las capas se reconocen por el nombre del subpaquete dentro de cada modulo
 * ({@code <modulo>/controller}, {@code <modulo>/service}, ...), no por el
 * modulo: por eso el test no necesita cambios cuando se agrega un modulo nuevo.
 */
@AnalyzeClasses(packages = ArquitecturaCapasTest.BASE, importOptions = ImportOption.DoNotIncludeTests.class)
class ArquitecturaCapasTest {

    static final String BASE = "pe.edu.upc.viasegura";

    /** Subpaquetes de otro modulo que nadie fuera de ese modulo puede usar. */
    private static final Set<String> INTERNOS_DE_MODULO = Set.of("controller", "listener", "repository", "infra");

    /* ------------------------------------------------------------------
     * 1. Regla de dependencia entre capas
     * ------------------------------------------------------------------ */

    /**
     * Presentacion -> Aplicacion -> Dominio; la persistencia la usa la
     * aplicacion; los adaptadores ({@code infra}) implementan puertos y nadie
     * los referencia directamente (Spring los inyecta por la interfaz).
     *
     * <p>{@code dto} es la capa de contratos: la comparten presentacion y
     * aplicacion porque los servicios devuelven DTO de respuesta (decision D-03).
     */
    @ArchTest
    static final ArchRule capas = freeze(layeredArchitecture()
            .consideringOnlyDependenciesInLayers()
            .withOptionalLayers(true)
            .layer("Presentacion").definedBy(BASE + "..controller..")
            .layer("Contratos").definedBy(BASE + "..dto..")
            .layer("Aplicacion").definedBy(BASE + "..service..", BASE + "..listener..")
            .layer("Dominio").definedBy(BASE + "..domain..", BASE + "..event..", BASE + "..port..")
            .layer("Persistencia").definedBy(BASE + "..repository..")
            .layer("Adaptadores").definedBy(BASE + "..infra..")
            .whereLayer("Presentacion").mayNotBeAccessedByAnyLayer()
            .whereLayer("Contratos").mayOnlyBeAccessedByLayers("Presentacion", "Aplicacion")
            .whereLayer("Aplicacion").mayOnlyBeAccessedByLayers("Presentacion")
            .whereLayer("Persistencia").mayOnlyBeAccessedByLayers("Aplicacion", "Adaptadores")
            .whereLayer("Adaptadores").mayNotBeAccessedByAnyLayer()
            .as("Capas: presentacion -> aplicacion -> dominio; infraestructura solo via puertos"));

    /** El dominio no conoce HTTP, casos de uso, JPA repositories ni adaptadores. */
    @ArchTest
    static final ArchRule dominioSinDependenciasHaciaAfuera = freeze(noClasses()
            .that().resideInAnyPackage(BASE + "..domain..", BASE + "..event..", BASE + "..port..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    BASE + "..controller..", BASE + "..dto..", BASE + "..service..",
                    BASE + "..listener..", BASE + "..repository..", BASE + "..infra..")
            .as("El dominio (domain, event, port) no depende de ninguna otra capa"));

    /* ------------------------------------------------------------------
     * 2. Cada tipo de clase en su capa
     * ------------------------------------------------------------------ */

    @ArchTest
    static final ArchRule controladoresEnPresentacion = freeze(classes()
            .that().areAnnotatedWith("org.springframework.web.bind.annotation.RestController")
            .should().resideInAPackage(BASE + "..controller..")
            .andShould().haveSimpleNameEndingWith("Controller")
            .as("Los @RestController viven en <modulo>.controller y terminan en Controller"));

    @ArchTest
    static final ArchRule entidadesEnDominio = freeze(classes()
            .that().areAnnotatedWith("jakarta.persistence.Entity")
            .should().resideInAPackage(BASE + "..domain..")
            .as("Las @Entity viven en <modulo>.domain"));

    @ArchTest
    static final ArchRule repositoriosEnPersistencia = freeze(classes()
            .that().areAssignableTo(org.springframework.data.repository.Repository.class)
            .should().resideInAPackage(BASE + "..repository..")
            .andShould().haveSimpleNameEndingWith("Repository")
            .as("Los repositorios Spring Data viven en <modulo>.repository y terminan en Repository"));

    @ArchTest
    static final ArchRule contratosSoloRequestResponse = freeze(classes()
            .that().resideInAPackage(BASE + "..dto..")
            .and().areNotEnums()
            .should().haveSimpleNameEndingWith("Request")
            .orShould().haveSimpleNameEndingWith("Response")
            .as("dto/ contiene solo contratos HTTP (*Request, *Response) y sus enums; los *Command van en service/"));

    @ArchTest
    static final ArchRule manejadoresDeEventosEnListener = freeze(methods()
            .that().areAnnotatedWith("org.springframework.transaction.event.TransactionalEventListener")
            .or().areAnnotatedWith("org.springframework.context.event.EventListener")
            .should().beDeclaredInClassesThat().resideInAPackage(BASE + "..listener..")
            .as("Los manejadores de eventos viven en <modulo>.listener"));

    /* ------------------------------------------------------------------
     * 3. Dependencias entre modulos
     * ------------------------------------------------------------------ */

    /** Los modulos (auth, reportes, ...) forman un grafo sin ciclos. */
    @ArchTest
    static final ArchRule modulosSinCiclos = freeze(slices()
            .matching(BASE + ".(*)..")
            .should().beFreeOfCycles()
            .as("Los modulos no tienen dependencias circulares"));

    /**
     * De otro modulo solo se usa su API publica: service, domain, event, port
     * y dto. Nunca su controller, listener, repository ni infra. {@code common}
     * es transversal y queda fuera de esta regla.
     */
    @ArchTest
    static final ArchRule soloApiPublicaDeOtrosModulos = freeze(classes()
            .that().resideInAPackage(BASE + "..")
            .should(noUsarInternosDeOtroModulo())
            .as("Un modulo no usa controller, listener, repository ni infra de otro modulo"));

    private static ArchCondition<JavaClass> noUsarInternosDeOtroModulo() {
        return new ArchCondition<>("usar solo service, domain, event, port o dto de otros modulos") {
            @Override
            public void check(JavaClass origen, ConditionEvents events) {
                String moduloOrigen = modulo(origen.getPackageName());
                if (moduloOrigen == null) {
                    return;
                }
                for (Dependency dependencia : origen.getDirectDependenciesFromSelf()) {
                    String paqueteDestino = dependencia.getTargetClass().getBaseComponentType().getPackageName();
                    String moduloDestino = modulo(paqueteDestino);
                    if (moduloDestino == null
                            || moduloDestino.equals(moduloOrigen)
                            || moduloDestino.equals("common")) {
                        continue;
                    }
                    if (INTERNOS_DE_MODULO.contains(capa(paqueteDestino))) {
                        events.add(SimpleConditionEvent.violated(dependencia, dependencia.getDescription()));
                    }
                }
            }
        };
    }

    /** {@code pe.edu.upc.viasegura.reportes.service} -> {@code reportes}. */
    private static String modulo(String paquete) {
        if (!paquete.startsWith(BASE + ".")) {
            return null;
        }
        String resto = paquete.substring(BASE.length() + 1);
        int punto = resto.indexOf('.');
        return punto < 0 ? resto : resto.substring(0, punto);
    }

    /** {@code pe.edu.upc.viasegura.reportes.service.x} -> {@code service}. */
    private static String capa(String paquete) {
        String resto = paquete.substring(BASE.length() + 1);
        String[] partes = resto.split("\\.");
        return partes.length > 1 ? partes[1] : "";
    }
}
