package pe.edu.upc.viasegura.auth.infra;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.port.RecepcionDeCorreo;
import pe.edu.upc.viasegura.auth.port.VerificadorDeDominioDeCorreo;

/**
 * Sin consulta al DNS (NC-09): {@code app.dominio-correo.tipo=ninguno}, el
 * valor por defecto fuera de {@code prod} y fijo en los tests, que corren sin
 * red. Permite registrar en local cuentas de dominios de prueba
 * ({@code @viasegura.test}, que no tiene MX). La lista de dominios
 * desechables se aplica igual: no depende de la red.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.dominio-correo.tipo", havingValue = "ninguno", matchIfMissing = true)
public class SinVerificacionDeDominioAdapter implements VerificadorDeDominioDeCorreo {

    public SinVerificacionDeDominioAdapter() {
        log.info("Registro sin verificar el MX del dominio del correo (DOMINIO_CORREO_TIPO=ninguno)");
    }

    @Override
    public RecepcionDeCorreo verificar(String dominio) {
        return RecepcionDeCorreo.DESCONOCIDA;
    }
}
