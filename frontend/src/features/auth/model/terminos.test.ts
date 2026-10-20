import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esVersionDeTerminosNoVigente, VERSION_TERMINOS } from './terminos';

/** `application.yml` del backend, en el mismo monorepo (Vitest corre desde `frontend/`). */
const APPLICATION_YML = resolve(process.cwd(), '../backend/src/main/resources/application.yml');

describe('VERSION_TERMINOS', () => {
  it('coincide con app.legal.version-terminos del backend (si no, el registro da 409)', () => {
    // El registro no tiene sesion y el API no expone la version en una ruta
    // publica: por eso el cliente la fija y este test la ata a la del backend.
    expect(existsSync(APPLICATION_YML), `no se encontro ${APPLICATION_YML}`).toBe(true);
    const yml = readFileSync(APPLICATION_YML, 'utf8');
    const linea = /version-terminos:\s*\$\{LEGAL_VERSION_TERMINOS:([^}]+)\}/.exec(yml);
    expect(linea?.[1]?.trim()).toBe(VERSION_TERMINOS);
  });
});

describe('esVersionDeTerminosNoVigente', () => {
  it('reconoce el 409 por versión de términos', () => {
    expect(
      esVersionDeTerminosNoVigente(
        409,
        'La version de los terminos aceptada no es la vigente (2026-11-v2): vuelve a leerlos y aceptalos',
      ),
    ).toBe(true);
  });

  it('no confunde el 409 de correo ya registrado', () => {
    expect(esVersionDeTerminosNoVigente(409, 'El email ya esta registrado')).toBe(false);
  });

  it('solo aplica a 409', () => {
    expect(esVersionDeTerminosNoVigente(400, 'aceptaTerminos: debe aceptar los terminos')).toBe(false);
  });
});
