import { describe, expect, it } from 'vitest';
import {
  esLoginBloqueado,
  MENSAJE_LOGIN_BLOQUEADO,
  mensajeDeLoginBloqueado,
} from './bloqueoDeLogin';

describe('bloqueo temporal del login (US-02 Esc. 2)', () => {
  it('se reconoce por el 409 con código LOGIN_BLOQUEADO', () => {
    expect(esLoginBloqueado(409, 'LOGIN_BLOQUEADO')).toBe(true);
  });

  it('otro 409 (correo sin confirmar) o un 401 no son el bloqueo', () => {
    expect(esLoginBloqueado(409, 'CORREO_NO_CONFIRMADO')).toBe(false);
    expect(esLoginBloqueado(409, null)).toBe(false);
    expect(esLoginBloqueado(401, 'LOGIN_BLOQUEADO')).toBe(false);
  });

  it('muestra el mensaje del servidor; si vino vacío, el de respaldo (15 minutos)', () => {
    expect(mensajeDeLoginBloqueado('Vuelve en 15 minutos.')).toBe('Vuelve en 15 minutos.');
    expect(mensajeDeLoginBloqueado('')).toBe(MENSAJE_LOGIN_BLOQUEADO);
    expect(mensajeDeLoginBloqueado(undefined)).toBe(MENSAJE_LOGIN_BLOQUEADO);
    expect(MENSAJE_LOGIN_BLOQUEADO).toContain('15 minutos');
  });
});
