import { describe, expect, it } from 'vitest';
import {
  CAMPOS_DE_TEXTO_MODERADOS,
  errorDelCampo,
  esCampoDeTextoModerado,
  esRechazoDeModeracion,
  mensajeDeTextoNoPermitido,
  textoRechazado,
  type ErrorDelApi,
} from './moderacion';

const DESCRIPCION =
  'La descripción tiene palabras que no están permitidas. Cámbiala para continuar.';

function error(cambios: Partial<ErrorDelApi> = {}): ErrorDelApi {
  return {
    status: 400,
    codigo: 'TEXTO_NO_PERMITIDO',
    details: ['descripcion'],
    message: DESCRIPCION,
    ...cambios,
  };
}

describe('textoRechazado (NC-10c)', () => {
  it('lleva el campo de details[0], el mensaje del backend y lo que se envió', () => {
    expect(textoRechazado(error(), { titulo: 'Bache grande', descripcion: 'texto enviado' })).toEqual({
      campo: 'descripcion',
      mensaje: DESCRIPCION,
      valor: 'texto enviado',
    });
  });

  it.each(CAMPOS_DE_TEXTO_MODERADOS)('reconoce el campo %s', (campo) => {
    expect(textoRechazado(error({ details: [campo] }), { [campo]: 'x' })?.campo).toBe(campo);
  });

  it('se decide por el código, no por el texto', () => {
    expect(textoRechazado(error({ codigo: null }), { descripcion: 'x' })).toBeNull();
    expect(textoRechazado(error({ codigo: 'FOTO_NO_PERMITIDA', details: ['foto'] }), { descripcion: 'x' })).toBeNull();
    expect(textoRechazado(error({ status: 409 }), { descripcion: 'x' })).toBeNull();
    expect(
      textoRechazado(error({ message: 'cualquier otro texto' }), { descripcion: 'x' })?.mensaje,
    ).toBe('cualquier otro texto');
  });

  it('un campo que el formulario no tiene (o desconocido) no se asigna: queda como error general', () => {
    expect(textoRechazado(error({ details: ['contenido'] }), { titulo: 'x', descripcion: 'y' })).toBeNull();
    expect(textoRechazado(error({ details: ['email'] }), { descripcion: 'y' })).toBeNull();
    expect(textoRechazado(error({ details: [] }), { descripcion: 'y' })).toBeNull();
  });

  it('un valor enviado vacío también cuenta (el campo existe)', () => {
    expect(textoRechazado(error(), { descripcion: '' })?.valor).toBe('');
  });

  it('sin mensaje del backend usa el del campo, sin la palabra', () => {
    expect(textoRechazado(error({ message: '  ' }), { descripcion: 'x' })?.mensaje).toBe(DESCRIPCION);
  });
});

describe('errorDelCampo (NC-10c)', () => {
  const rechazo = { campo: 'nombre' as const, mensaje: 'El nombre tiene…', valor: 'Juanito' };

  it('se muestra en su campo mientras diga lo mismo que se envió', () => {
    expect(errorDelCampo(rechazo, 'nombre', 'Juanito')).toBe('El nombre tiene…');
  });

  it('deja de mostrarse en cuanto el campo cambia', () => {
    expect(errorDelCampo(rechazo, 'nombre', 'Juanit')).toBeNull();
  });

  it('nunca en otro campo, ni sin rechazo', () => {
    expect(errorDelCampo(rechazo, 'apellido', 'Juanito')).toBeNull();
    expect(errorDelCampo(null, 'nombre', 'Juanito')).toBeNull();
  });
});

describe('los códigos y los campos (NC-10c)', () => {
  it('esRechazoDeModeracion: los tres de NC-10b, nada más', () => {
    expect(esRechazoDeModeracion('FOTO_NO_PERMITIDA')).toBe(true);
    expect(esRechazoDeModeracion('TEXTO_NO_PERMITIDO')).toBe(true);
    expect(esRechazoDeModeracion('MODERACION_NO_DISPONIBLE')).toBe(true);
    expect(esRechazoDeModeracion('TERMINOS_PENDIENTES')).toBe(false);
    expect(esRechazoDeModeracion(null)).toBe(false);
    expect(esRechazoDeModeracion(undefined)).toBe(false);
  });

  it('esCampoDeTextoModerado solo acepta los cinco campos del contrato', () => {
    expect(CAMPOS_DE_TEXTO_MODERADOS).toEqual(['titulo', 'descripcion', 'contenido', 'nombre', 'apellido']);
    expect(esCampoDeTextoModerado('foto')).toBe(false);
    expect(esCampoDeTextoModerado(undefined)).toBe(false);
  });

  it('mensajeDeTextoNoPermitido repite los mensajes del backend, con el género del campo', () => {
    expect(mensajeDeTextoNoPermitido('titulo')).toBe(
      'El título tiene palabras que no están permitidas. Cámbialo para continuar.',
    );
    expect(mensajeDeTextoNoPermitido('descripcion')).toBe(DESCRIPCION);
    expect(mensajeDeTextoNoPermitido('contenido')).toBe(
      'El comentario tiene palabras que no están permitidas. Cámbialo para continuar.',
    );
    expect(mensajeDeTextoNoPermitido('apellido')).toBe(
      'El apellido tiene palabras que no están permitidas. Cámbialo para continuar.',
    );
  });
});
