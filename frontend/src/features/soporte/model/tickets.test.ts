import { describe, expect, it } from 'vitest';
import {
  conEstado,
  erroresDeRespuesta,
  erroresDeTicket,
  fechaDeTicket,
  FILTROS_TICKETS_INICIALES,
  MAX_ASUNTO,
  MAX_MENSAJE,
  navegacionDe,
  parametrosDeTickets,
} from './tickets';
import type { EstadoTicket } from '@/lib/types/domain';

describe('erroresDeTicket', () => {
  it('acepta asunto y mensaje dentro de los límites del backend', () => {
    expect(
      erroresDeTicket({ asunto: 'a'.repeat(MAX_ASUNTO), mensaje: 'm'.repeat(MAX_MENSAJE) }),
    ).toEqual([]);
  });

  it('exige ambos campos, sin contar espacios', () => {
    expect(erroresDeTicket({ asunto: '   ', mensaje: '' })).toEqual([
      'Escribe el asunto.',
      'Escribe tu mensaje.',
    ]);
  });

  it('rechaza asunto de más de 200 y mensaje de más de 2000', () => {
    expect(
      erroresDeTicket({ asunto: 'a'.repeat(MAX_ASUNTO + 1), mensaje: 'm'.repeat(MAX_MENSAJE + 1) }),
    ).toEqual([
      'El asunto admite hasta 200 caracteres.',
      'El mensaje admite hasta 2000 caracteres.',
    ]);
  });
});

describe('erroresDeRespuesta', () => {
  it('exige texto y un estado del enum', () => {
    expect(erroresDeRespuesta({ respuesta: ' ', estado: 'OTRO' as EstadoTicket })).toEqual([
      'Escribe la respuesta.',
      'Elige el estado del ticket.',
    ]);
    expect(erroresDeRespuesta({ respuesta: 'Listo', estado: 'CERRADO' })).toEqual([]);
  });
});

describe('parametrosDeTickets', () => {
  it('sin estado no filtra y pide la primera página de 20', () => {
    expect(parametrosDeTickets(FILTROS_TICKETS_INICIALES).toString()).toBe('page=0&size=20');
  });

  it('envía el estado y la página pedida', () => {
    expect(parametrosDeTickets({ estado: 'EN_PROCESO', pagina: 2 }).toString()).toBe(
      'estado=EN_PROCESO&page=2&size=20',
    );
  });

  it('no envía un estado fuera del enum ni una página negativa', () => {
    // El backend no valida de forma amable un estado desconocido.
    const params = parametrosDeTickets({ estado: 'X' as EstadoTicket, pagina: -3 });
    expect(params.has('estado')).toBe(false);
    expect(params.get('page')).toBe('0');
  });
});

describe('conEstado', () => {
  it('cambiar el filtro vuelve a la primera página', () => {
    expect(conEstado({ estado: null, pagina: 4 }, 'ABIERTO')).toEqual({
      estado: 'ABIERTO',
      pagina: 0,
    });
  });
});

describe('navegacionDe', () => {
  it('describe la página y habilita solo lo que existe', () => {
    const base = { tickets: [], total: 45 };
    expect(navegacionDe({ ...base, pagina: 0, totalPaginas: 3 })).toEqual({
      texto: 'Página 1 de 3',
      hayAnterior: false,
      haySiguiente: true,
    });
    expect(navegacionDe({ ...base, pagina: 2, totalPaginas: 3 })).toEqual({
      texto: 'Página 3 de 3',
      hayAnterior: true,
      haySiguiente: false,
    });
  });
});

describe('fechaDeTicket', () => {
  it('muestra un guion si no hay fecha válida', () => {
    expect(fechaDeTicket('')).toBe('—');
    expect(fechaDeTicket('no-es-fecha')).toBe('—');
  });
});
