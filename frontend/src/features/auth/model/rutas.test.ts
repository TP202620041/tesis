import { describe, expect, it } from 'vitest';
import {
  descripcionDeArea,
  destinoInterno,
  puedeAcceder,
  rutaAceptarTerminos,
  rutaInicialDe,
  RUTA_ACEPTAR_TERMINOS,
  ROLES_AREA_ADMIN,
  ROLES_AREA_MUNICIPAL,
  ROLES_CON_SESION,
  RUTA_SOPORTE_ADMIN,
} from './rutas';
import { ROLES } from '@/lib/types/domain';

describe('rutaInicialDe', () => {
  it('lleva al funcionario a su bandeja', () => {
    expect(rutaInicialDe('FUNCIONARIO_MUNICIPAL')).toBe('/bandeja');
  });

  it('lleva al admin a su bandeja de soporte, no a la pantalla de sesión', () => {
    expect(rutaInicialDe('ADMIN')).toBe(RUTA_SOPORTE_ADMIN);
    expect(RUTA_SOPORTE_ADMIN).toBe('/admin/soporte');
  });

  it('lleva al ciudadano a sus propios reportes', () => {
    // No al mapa público: quien inicia sesión lo hace para reportar o para
    // ver cómo van los suyos.
    expect(rutaInicialDe('CIUDADANO')).toBe('/mis-reportes');
  });

  it('da una ruta a todos los roles del backend', () => {
    // Recorre el enum real: un rol nuevo sin destino dejaría el login
    // mandando al usuario a `undefined`.
    for (const rol of ROLES) {
      expect(rutaInicialDe(rol)).toMatch(/^\//);
    }
  });

  it('no manda al ciudadano a un área municipal', () => {
    expect(rutaInicialDe('CIUDADANO')).not.toBe(rutaInicialDe('FUNCIONARIO_MUNICIPAL'));
  });
});

describe('puedeAcceder', () => {
  it('deja entrar al funcionario al área municipal', () => {
    expect(puedeAcceder('FUNCIONARIO_MUNICIPAL', ROLES_AREA_MUNICIPAL)).toBe(true);
  });

  it('no deja entrar al ciudadano ni al admin', () => {
    // El backend lo impone con @PreAuthorize; esto solo evita que el
    // usuario vea cargar una pantalla que terminaría en 403.
    expect(puedeAcceder('CIUDADANO', ROLES_AREA_MUNICIPAL)).toBe(false);
    expect(puedeAcceder('ADMIN', ROLES_AREA_MUNICIPAL)).toBe(false);
  });
});

describe('áreas por rol', () => {
  it('el área ADMIN es solo del admin', () => {
    expect(puedeAcceder('ADMIN', ROLES_AREA_ADMIN)).toBe(true);
    expect(puedeAcceder('CIUDADANO', ROLES_AREA_ADMIN)).toBe(false);
    expect(puedeAcceder('FUNCIONARIO_MUNICIPAL', ROLES_AREA_ADMIN)).toBe(false);
  });

  it('las páginas de sesión (soporte) admiten todos los roles', () => {
    for (const rol of ROLES) expect(puedeAcceder(rol, ROLES_CON_SESION)).toBe(true);
  });
});

describe('descripcionDeArea', () => {
  it('describe cada área según sus roles', () => {
    expect(descripcionDeArea(ROLES_AREA_MUNICIPAL)).toMatch(/área municipal/);
    expect(descripcionDeArea(ROLES_AREA_ADMIN)).toMatch(/administración/);
    expect(descripcionDeArea(['CIUDADANO'])).toMatch(/ciudadanos/);
  });

  it('usa un texto genérico para combinaciones sin área propia', () => {
    expect(descripcionDeArea(['CIUDADANO', 'ADMIN'])).toMatch(/no está disponible/);
  });
});

describe('aceptación de términos (NC-07b)', () => {
  it('la ruta coincide con la que usa el cliente HTTP ante el 403', () => {
    expect(RUTA_ACEPTAR_TERMINOS).toBe('/aceptar-terminos');
  });

  it('rutaAceptarTerminos conserva el destino codificado', () => {
    expect(rutaAceptarTerminos('/mis-reportes?p=2')).toBe(
      '/aceptar-terminos?redirect=%2Fmis-reportes%3Fp%3D2',
    );
  });

  it('destinoInterno acepta rutas internas', () => {
    expect(destinoInterno('/bandeja/7?x=1', '/inicio')).toBe('/bandeja/7?x=1');
  });

  it.each([
    null,
    undefined,
    '',
    'mis-reportes',
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    // El parser WHATWG quita \t, \n y \r: sin validar tras parsear, estos
    // serian `//evil.example`.
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
  ])('destinoInterno rechaza %j (redirect abierto)', (valor) => {
    expect(destinoInterno(valor, '/inicio')).toBe('/inicio');
  });

  it('destinoInterno conserva la consulta y el fragmento', () => {
    expect(destinoInterno('/mapa?d=3#lista', '/inicio')).toBe('/mapa?d=3#lista');
  });

  it('destinoInterno no vuelve a la propia pantalla de aceptación', () => {
    expect(destinoInterno('/aceptar-terminos', '/inicio')).toBe('/inicio');
    expect(destinoInterno('/aceptar-terminos?redirect=%2Fx', '/inicio')).toBe('/inicio');
  });
});
