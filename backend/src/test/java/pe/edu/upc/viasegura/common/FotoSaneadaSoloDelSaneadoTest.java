package pe.edu.upc.viasegura.common;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;

/**
 * BE-11: en el codigo de produccion, solo el saneado construye una
 * {@link FotoSaneada}. El tipo impide pasar el archivo del cliente donde se
 * espera una foto saneada, pero su constructor es publico (es un record):
 * sin esta regla, {@code new FotoSaneada(cruda.contenido(), ...)} compilaria y
 * {@code FotoStorageService#almacenarFotoReporteSaneada} publicaria la foto
 * con el EXIF del telefono (la ubicacion GPS de quien reporta). Los tests
 * quedan fuera: arman dobles.
 *
 * <p>Es una regla propia de esta tarea, sin congelar, como
 * {@link CorreoSoloPorElPuertoTest}: no toca {@code ArquitecturaCapasTest} ni
 * su almacen.</p>
 */
@AnalyzeClasses(packages = "pe.edu.upc.viasegura", importOptions = ImportOption.DoNotIncludeTests.class)
class FotoSaneadaSoloDelSaneadoTest {

    @ArchTest
    static final ArchRule soloElSaneadoConstruyeUnaFotoSaneada = noClasses()
            .that().doNotImplement(SaneadorDeImagen.class)
            .should().callConstructor(FotoSaneada.class, byte[].class, String.class)
            .as("Solo un SaneadorDeImagen construye una FotoSaneada (BE-11): una foto cruda no puede pasar por saneada");
}
