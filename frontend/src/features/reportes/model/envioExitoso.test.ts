import { describe, expect, it } from 'vitest';
import { avisoDeEnvioExitoso } from './envioExitoso';
import type { ReporteCreado } from './tipos';

function creado(id: number, esAdhesion = false): ReporteCreado {
  return {
    id,
    esAdhesion,
    totalAdhesiones: esAdhesion ? 2 : 1,
    distritoNombre: 'Miraflores',
    categoriaNombre: 'Bache',
    fotoUrl: null,
    titulo: 'Bache en Larco',
    severidad: 'MEDIA',
  };
}

describe('avisoDeEnvioExitoso (US-06 Esc. 2)', () => {
  it('sin enviados no hay aviso', () => {
    expect(avisoDeEnvioExitoso([])).toBeNull();
  });

  it('un reporte nuevo enlaza a su detalle', () => {
    expect(avisoDeEnvioExitoso([creado(12)])).toEqual({
      texto: 'Se envió el reporte que guardaste sin conexión.',
      enlace: { href: '/mis-reportes/12', texto: 'Ver el reporte' },
    });
  });

  it('una adhesion (US-09) no dice que se creo un reporte: dice que se sumo el apoyo', () => {
    const aviso = avisoDeEnvioExitoso([creado(12, true)]);
    expect(aviso?.texto).toMatch(/se sumó tu apoyo a ese reporte/);
    // El reporte existente no es del ciudadano: su detalle propio no aplica.
    expect(aviso?.enlace.href).toBe('/mis-reportes');
  });

  it('varios cuentan cuantos se enviaron y cuantos fueron adhesiones', () => {
    expect(avisoDeEnvioExitoso([creado(1), creado(2)])?.texto).toBe(
      'Se enviaron los 2 reportes que guardaste sin conexión.',
    );
    expect(avisoDeEnvioExitoso([creado(1), creado(2, true)])?.texto).toBe(
      'Se enviaron los 2 reportes que guardaste sin conexión. Uno se sumó como apoyo a un reporte que ya existía en el mismo lugar.',
    );
    expect(avisoDeEnvioExitoso([creado(1, true), creado(2, true), creado(3)])?.texto).toBe(
      'Se enviaron los 3 reportes que guardaste sin conexión. 2 se sumaron como apoyo a reportes que ya existían en el mismo lugar.',
    );
    expect(avisoDeEnvioExitoso([creado(1), creado(2)])?.enlace.href).toBe('/mis-reportes');
  });
});
