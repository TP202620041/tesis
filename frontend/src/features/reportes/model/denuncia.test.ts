import { describe, expect, it } from 'vitest';
import { MOTIVOS_DENUNCIA } from '@/lib/types/domain';
import type { ErrorDelApi } from '@/lib/types/moderacion';
import {
  CODIGO_DENUNCIA_PROPIA,
  CODIGO_DENUNCIA_REPETIDA,
  CODIGO_LIMITE_DENUNCIAS,
  erroresDeDenuncia,
  esDenunciaDefinitiva,
  ETIQUETA_DE_MOTIVO,
  etiquetaDeMotivo,
  MAX_DETALLE_DENUNCIA,
  mensajeDeDenunciaRechazada,
  MOTIVOS_PARA_DENUNCIAR,
  TEXTOS_DENUNCIA,
} from './denuncia';

function error(status: number, codigo: string | null = null, message = 'del backend'): ErrorDelApi {
  return { status, codigo, details: [], message };
}

describe('denuncia (NC-11b)', () => {
  it('ofrece los cinco motivos del enum, cada uno con su etiqueta', () => {
    expect(MOTIVOS_PARA_DENUNCIAR).toEqual(MOTIVOS_DENUNCIA);
    for (const motivo of MOTIVOS_DENUNCIA) {
      expect(ETIQUETA_DE_MOTIVO[motivo]).toBeTruthy();
      expect(etiquetaDeMotivo(motivo)).toBe(ETIQUETA_DE_MOTIVO[motivo]);
    }
    // Un motivo que el backend sume despues no rompe la bandeja.
    expect(etiquetaDeMotivo('NUEVO')).toBe('NUEVO');
  });

  it('exige el motivo y limita el detalle a 500 caracteres', () => {
    expect(erroresDeDenuncia({ motivo: null, detalle: '' })).toEqual(['Elige el motivo de la denuncia.']);
    expect(erroresDeDenuncia({ motivo: 'OTRO', detalle: 'x'.repeat(MAX_DETALLE_DENUNCIA) })).toEqual([]);
    expect(erroresDeDenuncia({ motivo: 'OTRO', detalle: 'x'.repeat(MAX_DETALLE_DENUNCIA + 1) })).toEqual([
      'El detalle admite hasta 500 caracteres.',
    ]);
    // El detalle se recorta antes de medirlo, como lo guarda el backend.
    expect(erroresDeDenuncia({ motivo: 'OTRO', detalle: ` ${'x'.repeat(MAX_DETALLE_DENUNCIA)} ` })).toEqual([]);
  });

  it.each([
    [CODIGO_DENUNCIA_REPETIDA, TEXTOS_DENUNCIA.repetida],
    [CODIGO_LIMITE_DENUNCIAS, TEXTOS_DENUNCIA.limite],
    [CODIGO_DENUNCIA_PROPIA, TEXTOS_DENUNCIA.propia],
  ])('el 409 %s se traduce por código, no por el texto', (codigo, esperado) => {
    expect(mensajeDeDenunciaRechazada(error(409, codigo, 'otro texto'))).toBe(esperado);
  });

  it('un 409 sin código conocido muestra el mensaje del backend', () => {
    expect(mensajeDeDenunciaRechazada(error(409, 'RARO', 'Algo pasó'))).toBe('Algo pasó');
    expect(mensajeDeDenunciaRechazada(error(409, null, '  '))).toBeNull();
  });

  it('el 404 es un reporte retirado u oculto; lo demás lo traduce el hook', () => {
    expect(mensajeDeDenunciaRechazada(error(404))).toBe(TEXTOS_DENUNCIA.noDisponible);
    expect(mensajeDeDenunciaRechazada(error(400))).toBeNull();
    expect(mensajeDeDenunciaRechazada(error(500))).toBeNull();
  });

  it('repetida y propia son definitivas (no se reintenta); el límite diario no', () => {
    expect(esDenunciaDefinitiva(error(409, CODIGO_DENUNCIA_REPETIDA))).toBe(true);
    expect(esDenunciaDefinitiva(error(409, CODIGO_DENUNCIA_PROPIA))).toBe(true);
    expect(esDenunciaDefinitiva(error(409, CODIGO_LIMITE_DENUNCIAS))).toBe(false);
    expect(esDenunciaDefinitiva(error(404))).toBe(false);
  });
});
