package pe.edu.upc.viasegura.common;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import pe.edu.upc.viasegura.common.infra.SmtpCorreoAdapter;

/**
 * Criterio de DEP-08: ningun {@code JavaMailSender} fuera de
 * {@link SmtpCorreoAdapter}. Todo correo sale por el puerto
 * {@code CorreoSaliente}, para que cambiar de proveedor (SMTP en desarrollo,
 * Resend en produccion) sea solo configuracion.
 *
 * <p>Es una regla propia de esta tarea, sin congelar: no toca
 * {@code ArquitecturaCapasTest} ni su almacen.</p>
 */
@AnalyzeClasses(packages = "pe.edu.upc.viasegura", importOptions = ImportOption.DoNotIncludeTests.class)
class CorreoSoloPorElPuertoTest {

    @ArchTest
    static final ArchRule soloElAdaptadorSmtpUsaLaApiDeCorreo = noClasses()
            .that().doNotHaveFullyQualifiedName(SmtpCorreoAdapter.class.getName())
            .should().dependOnClassesThat().resideInAnyPackage("org.springframework.mail..", "jakarta.mail..")
            .as("Solo SmtpCorreoAdapter usa Spring Mail o Jakarta Mail; el resto envia por CorreoSaliente (DEP-08)");
}
