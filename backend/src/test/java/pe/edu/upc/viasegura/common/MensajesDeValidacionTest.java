package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.lang.annotation.Annotation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * QA-1 M-2: cada restriccion de Bean Validation de un DTO lleva su propio
 * mensaje, una oracion para la persona («La contraseña debe tener entre 8 y
 * 72 caracteres»).
 *
 * <p>Con el mensaje por defecto, el 400 decia «password: el tamaño debe estar
 * entre 8 y 72»: el nombre tecnico del campo, en ingles, delante de una frase
 * sin sujeto. {@code GlobalExceptionHandler} devuelve el mensaje propio tal
 * cual; esta prueba impide que un DTO nuevo vuelva al mensaje por defecto.</p>
 *
 * <p>Recorre todas las clases de los paquetes {@code ..dto..} (tambien los
 * records anidados, como {@code SuscripcionPushRequest.ClavesRequest}) y
 * falla si no encuentra ninguna restriccion: asi no pasa en vacio.</p>
 */
class MensajesDeValidacionTest {

    private static final String PAQUETE_RESTRICCIONES = "jakarta.validation.constraints";

    @Test
    void cadaRestriccionDeUnDtoTieneMensajePropio() throws Exception {
        List<String> revisadas = new ArrayList<>();
        List<String> sinMensajePropio = new ArrayList<>();

        for (JavaClass clase : new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("pe.edu.upc.viasegura")) {
            if (!clase.getPackageName().contains(".dto")) {
                continue;
            }
            for (Field campo : clase.reflect().getDeclaredFields()) {
                for (Annotation anotacion : campo.getAnnotations()) {
                    if (!anotacion.annotationType().getPackageName().equals(PAQUETE_RESTRICCIONES)) {
                        continue;
                    }
                    String donde = "%s.%s @%s".formatted(clase.getSimpleName(), campo.getName(),
                            anotacion.annotationType().getSimpleName());
                    revisadas.add(donde);
                    Method message = anotacion.annotationType().getMethod("message");
                    String plantilla = (String) message.invoke(anotacion);
                    if (plantilla.startsWith("{jakarta.validation.")) {
                        sinMensajePropio.add(donde);
                    }
                }
            }
        }

        assertThat(revisadas).as("restricciones encontradas en los DTO").hasSizeGreaterThan(40);
        assertThat(sinMensajePropio).as("restricciones con el mensaje por defecto").isEmpty();
    }
}
