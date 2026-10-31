import { describe, expect, it } from 'vitest';
import type { ErrorDelApi } from '@/lib/types/moderacion';
import {
  accionesDisponibles,
  AVISO_MOTIVO,
  avisoDeAlcance,
  CODIGO_MOTIVO_IDENTIFICA_DENUNCIANTE,
  CODIGO_NO_OCULTO,
  CODIGO_SIN_FOTO,
  CODIGO_YA_OCULTO,
  conVista,
  errorDeModeracion,
  errorDeMotivo,
  errorDeMotivoDeDesestimacion,
  esVistaDeBandeja,
  etiquetaDeVista,
  etiquetasDeVisibilidad,
  fechaDeModeracion,
  FILTROS_MODERACION_INICIALES,
  hayDenunciasPendientes,
  navegacionDe,
  parametrosDeBandeja,
  tituloDeAccion,
  VISTAS_DE_BANDEJA,
} from './moderacion';
import type { Denuncia } from './tipos';

function error(status: number, codigo: string | null = null, message = '', details: string[] = []): ErrorDelApi {
  return { status, codigo, details, message };
}

const denuncia = (estado: Denuncia['estado']): Denuncia => ({
  id: 1,
  motivo: 'OTRO',
  estado,
  detalle: null,
  createdAt: '2026-10-29T14:50:00Z',
  denunciante: null,
  resueltaEn: null,
  motivoResolucion: null,
});

describe('bandeja de moderación (NC-11b)', () => {
  it('ofrece los tres estados y «Ocultos», y arranca en pendientes', () => {
    expect(VISTAS_DE_BANDEJA).toEqual(['PENDIENTE', 'ATENDIDA', 'DESESTIMADA', 'OCULTOS']);
    expect(FILTROS_MODERACION_INICIALES).toEqual({ vista: 'PENDIENTE', pagina: 0 });
    for (const vista of VISTAS_DE_BANDEJA) expect(etiquetaDeVista(vista)).toBeTruthy();
    expect(esVistaDeBandeja('OCULTOS')).toBe(true);
    expect(esVistaDeBandeja('ATENDIDA')).toBe(true);
    expect(esVistaDeBandeja('todo')).toBe(false);
  });

  it('un estado va como `estado`; «Ocultos» como `ocultos=true`, sin `estado`', () => {
    expect(parametrosDeBandeja({ vista: 'ATENDIDA', pagina: 2 }).toString()).toBe(
      'estado=ATENDIDA&page=2&size=20',
    );
    const ocultos = parametrosDeBandeja({ vista: 'OCULTOS', pagina: 0 });
    expect(ocultos.get('ocultos')).toBe('true');
    expect(ocultos.has('estado')).toBe(false);
    expect(ocultos.toString()).toBe('ocultos=true&page=0&size=20');
  });

  it('la página nunca es negativa ni decimal', () => {
    expect(parametrosDeBandeja({ vista: 'PENDIENTE', pagina: -3 }).get('page')).toBe('0');
    expect(parametrosDeBandeja({ vista: 'PENDIENTE', pagina: 1.7 }).get('page')).toBe('1');
    expect(parametrosDeBandeja({ vista: 'PENDIENTE', pagina: NaN }).get('page')).toBe('0');
  });

  it('cambiar la vista vuelve a la primera página', () => {
    expect(conVista({ vista: 'PENDIENTE', pagina: 4 }, 'OCULTOS')).toEqual({ vista: 'OCULTOS', pagina: 0 });
  });

  it('navegación entre páginas', () => {
    expect(navegacionDe({ filas: [], pagina: 0, totalPaginas: 3, total: 50 })).toEqual({
      texto: 'Página 1 de 3',
      hayAnterior: false,
      haySiguiente: true,
    });
    expect(navegacionDe({ filas: [], pagina: 2, totalPaginas: 3, total: 50 })).toMatchObject({
      hayAnterior: true,
      haySiguiente: false,
    });
  });
});

describe('visibilidad y acciones (NC-11b)', () => {
  it('dice qué está oculto', () => {
    expect(etiquetasDeVisibilidad({ tieneFoto: true, oculto: false, fotoOculta: false })).toEqual([]);
    expect(etiquetasDeVisibilidad({ tieneFoto: true, oculto: true, fotoOculta: false })).toEqual(['Reporte oculto']);
    expect(etiquetasDeVisibilidad({ tieneFoto: true, oculto: true, fotoOculta: true })).toEqual([
      'Reporte oculto',
      'Foto oculta',
    ]);
  });

  it('solo ofrece lo que el backend no rechazaría con 409', () => {
    expect(
      accionesDisponibles({ tieneFoto: true, oculto: false, fotoOculta: false, denuncias: [denuncia('PENDIENTE')] }),
    ).toEqual({
      ocultarReporte: true,
      restablecerReporte: false,
      ocultarFoto: true,
      restablecerFoto: false,
      desestimar: true,
    });
    expect(
      accionesDisponibles({ tieneFoto: false, oculto: true, fotoOculta: false, denuncias: [denuncia('ATENDIDA')] }),
    ).toEqual({
      ocultarReporte: false,
      restablecerReporte: true,
      ocultarFoto: false, // SIN_FOTO
      restablecerFoto: false,
      desestimar: false,
    });
    expect(
      accionesDisponibles({ tieneFoto: true, oculto: false, fotoOculta: true, denuncias: [] }),
    ).toMatchObject({ ocultarFoto: false, restablecerFoto: true, desestimar: false });
  });

  it('hay pendientes solo si alguna lo está', () => {
    expect(hayDenunciasPendientes([])).toBe(false);
    expect(hayDenunciasPendientes([denuncia('DESESTIMADA'), denuncia('PENDIENTE')])).toBe(true);
  });

  it('la fecha va en es-PE y tolera lo que no es fecha', () => {
    expect(fechaDeModeracion(null)).toBe('—');
    expect(fechaDeModeracion('no es fecha')).toBe('—');
    expect(fechaDeModeracion('2026-10-29T15:10:00Z')).toBe(new Date('2026-10-29T15:10:00Z').toLocaleString('es-PE'));
  });
});

describe('ocultar y restablecer (NC-11b)', () => {
  it('el aviso del motivo es el texto decidido por el usuario', () => {
    expect(AVISO_MOTIVO).toBe(
      'El autor y la municipalidad leerán este motivo. No nombres a quien denunció ni digas cuántas denuncias hubo.',
    );
  });

  it('con REPORTE avisa que sale del índice; con FOTO, que el índice no cambia', () => {
    expect(avisoDeAlcance('ocultar', 'REPORTE')).toMatch(/dejará de contar en el índice de desempeño/);
    expect(avisoDeAlcance('ocultar', 'FOTO')).toMatch(/el índice de desempeño no cambia/);
    expect(avisoDeAlcance('restablecer', 'REPORTE')).toMatch(/vuelve a contar en el índice/);
    expect(avisoDeAlcance('restablecer', 'FOTO')).toMatch(/índice de desempeño no cambia/);
    expect(tituloDeAccion('ocultar', 'REPORTE')).toBe('Ocultar el reporte');
    expect(tituloDeAccion('restablecer', 'FOTO')).toBe('Restablecer la foto');
  });

  it('el motivo mide de 10 a 500 sin los espacios del borde', () => {
    expect(errorDeMotivo('   corto   ')).toBe('El motivo debe tener entre 10 y 500 caracteres.');
    expect(errorDeMotivo('  diez letras ')).toBeNull();
    expect(errorDeMotivo('x'.repeat(500))).toBeNull();
    expect(errorDeMotivo('x'.repeat(501))).not.toBeNull();
    expect(errorDeMotivoDeDesestimacion('')).toBeNull();
    expect(errorDeMotivoDeDesestimacion('x'.repeat(501))).toBe('El motivo admite hasta 500 caracteres.');
  });

  it('el 400 MOTIVO_IDENTIFICA_DENUNCIANTE va en el campo del motivo, con el mensaje del backend', () => {
    expect(
      errorDeModeracion(error(400, CODIGO_MOTIVO_IDENTIFICA_DENUNCIANTE, 'El motivo no puede incluir el correo…', ['motivo'])),
    ).toEqual({ campo: 'motivo', mensaje: 'El motivo no puede incluir el correo…' });
    // Un 400 de @Valid que señala el motivo tambien va al campo.
    expect(errorDeModeracion(error(400, null, 'El motivo debe tener entre 10 y 500 caracteres', ['motivo']))).toEqual({
      campo: 'motivo',
      mensaje: 'El motivo debe tener entre 10 y 500 caracteres',
    });
    // Otro 400 (alcance invalido) lo traduce el hook.
    expect(errorDeModeracion(error(400, null, 'alcance inválido'))).toBeNull();
  });

  it.each([CODIGO_YA_OCULTO, CODIGO_NO_OCULTO, CODIGO_SIN_FOTO])(
    'el 409 %s avisa que lo que se veía está desactualizado',
    (codigo) => {
      expect(errorDeModeracion(error(409, codigo, 'La foto ya está oculta'))).toEqual({
        campo: null,
        mensaje: 'La foto ya está oculta',
        desactualizado: true,
      });
      // Sin mensaje, uno fijo.
      expect(errorDeModeracion(error(409, codigo))?.mensaje).toBeTruthy();
    },
  );

  it('lo demás no es del contrato', () => {
    expect(errorDeModeracion(error(409, 'OTRO'))).toBeNull();
    expect(errorDeModeracion(error(404))).toBeNull();
    expect(errorDeModeracion(error(500))).toBeNull();
  });
});
