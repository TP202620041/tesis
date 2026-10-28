import { describe, expect, it } from 'vitest';
import { ROLES } from '@/lib/types/domain';
import {
  CUENTA,
  descripcionDeCuenta,
  enlacesDeLaPantallaDeCuenta,
  esRegresoDentroDeSuDestino,
  esRutaActual,
  iniciales,
  modoDelMarco,
  navegacionDe,
  type ItemNavegacion,
} from './navegacion';
import { RUTA_SOPORTE_ADMIN, rutaInicialDe } from './rutas';

const hrefs = (items: readonly ItemNavegacion[]) => items.map((i) => i.href);

describe('navegacionDe (DIS-1)', () => {
  it('ciudadano en el móvil: Mapa · Mis reportes · Reportar · Desempeño (+ Cuenta)', () => {
    const nav = navegacionDe('CIUDADANO');
    expect(nav.inferior.map((i) => i.etiqueta)).toEqual(['Mapa', 'Mis reportes', 'Reportar', 'Desempeño']);
    // Reportar es la acción principal y va al centro.
    expect(nav.inferior[2]?.destacado).toBe(true);
    expect(hrefs(nav.cuenta)).toEqual(['/perfil', '/soporte']);
  });

  it('QA-1 E-3: desde /reportar siempre hay salida a «Mis reportes» y al mapa', () => {
    // Antes la página armaba su propia barra «Secciones»; ahora la da el marco.
    const nav = navegacionDe('CIUDADANO');
    for (const items of [nav.principal, nav.inferior]) {
      expect(hrefs(items)).toEqual(expect.arrayContaining(['/mis-reportes', '/mapa']));
    }
  });

  it('funcionario: bandeja, panel y categorías; soporte en la cabecera y en el menú', () => {
    const nav = navegacionDe('FUNCIONARIO_MUNICIPAL');
    expect(hrefs(nav.inferior)).toEqual(['/bandeja', '/dashboard', '/categorias']);
    expect(hrefs(nav.principal)).toContain('/soporte');
    expect(hrefs(nav.cuenta)).toEqual(['/soporte', '/desempeno']);
    // Nada del ciudadano.
    expect(hrefs(nav.principal)).not.toContain('/reportar');
  });

  it('admin: solo la bandeja de soporte', () => {
    expect(hrefs(navegacionDe('ADMIN').inferior)).toEqual([RUTA_SOPORTE_ADMIN]);
  });

  it('visitante: lo público, Reportar (lleva al login) y la entrada', () => {
    const nav = navegacionDe(null);
    expect(hrefs(nav.inferior)).toEqual(['/mapa', '/desempeno', '/reportar', '/login']);
    expect(hrefs(nav.acceso)).toEqual(['/login', '/registro']);
    expect(nav.cuenta).toHaveLength(0);
  });

  it('sesión de rol aún desconocido (sin red): solo lo público', () => {
    expect(hrefs(navegacionDe('desconocido').inferior)).toEqual(['/mapa', '/desempeno']);
  });

  it('la puerta de entrada de cada rol está en su navegación', () => {
    for (const rol of ROLES) {
      expect(hrefs(navegacionDe(rol).principal)).toContain(rutaInicialDe(rol));
    }
  });

  it('la barra inferior cabe: como mucho 4 ítems más «Cuenta»', () => {
    for (const rol of [...ROLES, null, 'desconocido'] as const) {
      expect(navegacionDe(rol).inferior.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('«Cuenta» en el móvil: una pantalla, no un menú (prueba en iPhone del 23/10)', () => {
  it('lleva a /perfil y queda marcada también en /soporte, al que se llega desde ahí', () => {
    expect(CUENTA.href).toBe('/perfil');
    expect(esRutaActual('/perfil', CUENTA)).toBe(true);
    expect(esRutaActual('/soporte', CUENTA)).toBe(true);
    // La bandeja de soporte del ADMIN es su propio destino.
    expect(esRutaActual(RUTA_SOPORTE_ADMIN, CUENTA)).toBe(false);
  });

  it('la pantalla de la cuenta ofrece los enlaces de la cuenta del rol, menos ella misma', () => {
    expect(hrefs(enlacesDeLaPantallaDeCuenta('CIUDADANO'))).toEqual(['/soporte']);
    expect(hrefs(enlacesDeLaPantallaDeCuenta('FUNCIONARIO_MUNICIPAL'))).toEqual(['/soporte', '/desempeno']);
    expect(enlacesDeLaPantallaDeCuenta('ADMIN')).toEqual([]);
  });
});

describe('esRegresoDentroDeSuDestino: volver a donde se estaba, como en las pestañas de iOS', () => {
  it('de lo que cuelga de un destino a ese destino, sí', () => {
    expect(esRegresoDentroDeSuDestino('/soporte', '/perfil')).toBe(true);
    expect(esRegresoDentroDeSuDestino('/mis-reportes/12', '/mis-reportes')).toBe(true);
    expect(esRegresoDentroDeSuDestino('/bandeja/7', '/bandeja?estado=PENDIENTE')).toBe(true);
    expect(esRegresoDentroDeSuDestino('/reportes/3', '/mapa')).toBe(true);
  });

  it('ir hacia adentro, a otro destino o al mismo, no', () => {
    expect(esRegresoDentroDeSuDestino('/perfil', '/soporte')).toBe(false);
    expect(esRegresoDentroDeSuDestino('/mis-reportes', '/mis-reportes/12')).toBe(false);
    expect(esRegresoDentroDeSuDestino('/mis-reportes/12', '/mapa')).toBe(false);
    expect(esRegresoDentroDeSuDestino('/perfil', '/perfil')).toBe(false);
  });
});

describe('esRutaActual', () => {
  const misReportes: ItemNavegacion = { href: '/mis-reportes', etiqueta: 'Mis reportes', icono: 'mis-reportes' };
  const mapa = navegacionDe(null).principal[0]!;

  it('marca la sección y lo que cuelga de ella', () => {
    expect(esRutaActual('/mis-reportes', misReportes)).toBe(true);
    expect(esRutaActual('/mis-reportes/12', misReportes)).toBe(true);
    expect(esRutaActual('/mis-reportes?x=1', misReportes)).toBe(true);
  });

  it('compara por segmentos, no por prefijo de texto', () => {
    expect(esRutaActual('/mis-reportes-viejos', misReportes)).toBe(false);
    expect(esRutaActual('/', misReportes)).toBe(false);
  });

  it('el detalle público de un reporte cuenta como el mapa', () => {
    expect(esRutaActual('/reportes/5', mapa)).toBe(true);
  });
});

describe('modoDelMarco', () => {
  it('las pantallas de acceso llevan su propio marco', () => {
    expect(modoDelMarco('/login')).toBe('ninguno');
    expect(modoDelMarco('/registro')).toBe('ninguno');
    expect(modoDelMarco('/recuperar-password')).toBe('ninguno');
    // NC-09: sin la cabecera ni la navegación alrededor de la tarjeta (dos logos).
    expect(modoDelMarco('/confirmar-cuenta')).toBe('ninguno');
  });

  it('la aceptación de términos lleva solo el logo', () => {
    expect(modoDelMarco('/aceptar-terminos')).toBe('minimo');
  });

  it('el resto, el marco completo', () => {
    for (const ruta of ['/', '/mapa', '/mis-reportes/3', '/bandeja', '/admin/soporte', '/loginx']) {
      expect(modoDelMarco(ruta)).toBe('completo');
    }
  });
});

describe('menú de cuenta', () => {
  it('iniciales del avatar', () => {
    expect(iniciales('Ana', 'Vecina')).toBe('AV');
    expect(iniciales('élida', '')).toBe('É');
    expect(iniciales('', '')).toBe('?');
  });

  it('describe la cuenta según el rol', () => {
    expect(descripcionDeCuenta({ rol: 'CIUDADANO' })).toBe('Ciudadano');
    expect(descripcionDeCuenta({ rol: 'FUNCIONARIO_MUNICIPAL', distritoNombre: 'Miraflores' })).toBe(
      'Municipalidad de Miraflores',
    );
    expect(descripcionDeCuenta({ rol: 'FUNCIONARIO_MUNICIPAL', distritoNombre: null })).toBe(
      'Funcionario municipal',
    );
  });
});
