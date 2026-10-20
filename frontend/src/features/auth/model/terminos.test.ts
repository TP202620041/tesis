import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { esVersionDeTerminosNoVigente, VERSION_TERMINOS } from './terminos';

/**
 * `application.yml` del backend, en el mismo monorepo, relativo a ESTE
 * archivo (no al directorio desde el que se corre Vitest).
 *
 * No se escribe `new URL('…', import.meta.url)`: Vite reconoce ese patrón
 * literal como un recurso y lo reescribe a `http://localhost:3000/…`, y
 * `fileURLToPath` falla («The URL must be of scheme file»). Por eso se parte
 * de la ruta de este archivo y se resuelve con `path`.
 */
const APPLICATION_YML = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../backend/src/main/resources/application.yml',
);

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
