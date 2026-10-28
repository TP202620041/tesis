import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VistaDeSugerencia } from '../model/sugerencia';
import { SugerenciaDeCategoria } from './SugerenciaDeCategoria';

const SUGERIDA: VistaDeSugerencia = {
  tipo: 'sugerida',
  categoriaId: 1,
  nombre: 'Bache',
  yaElegida: false,
  seleccionable: true,
};

function montar(vista: VistaDeSugerencia) {
  const onElegir = vi.fn();
  const resultado = render(<SugerenciaDeCategoria id="sug" vista={vista} onElegir={onElegir} />);
  return { onElegir, ...resultado };
}

describe('SugerenciaDeCategoria (NC-04)', () => {
  it('la región de estado existe aunque no haya nada que decir (para que se anuncie después)', () => {
    montar({ tipo: 'oculta' });
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('id', 'sug');
    expect(region).toHaveTextContent('');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mientras analiza lo anuncia', () => {
    montar({ tipo: 'analizando' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Analizando la foto para sugerirte un tipo de daño…',
    );
  });

  it('sin sugerencia lo dice y manda a elegir en la lista', () => {
    montar({ tipo: 'sin-sugerencia' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'No hay una sugerencia para esta foto. Elige el tipo de daño en la lista.',
    );
  });

  it('la sugerencia se anuncia como automática y la decisión queda del ciudadano', () => {
    montar(SUGERIDA);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sugerencia por la foto: Bache. Es automática: el tipo de daño lo eliges tú.',
    );
  });

  it('elegirla exige un toque: el botón la propone y nada se elige solo', async () => {
    const { onElegir } = montar(SUGERIDA);
    expect(onElegir).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Elegir «Bache»' }));

    expect(onElegir).toHaveBeenCalledWith(1);
  });

  it('el botón queda fuera de la región: el anuncio es solo el texto', () => {
    montar(SUGERIDA);
    expect(screen.getByRole('status')).not.toContainElement(screen.getByRole('button'));
  });

  it('si ya la eligió, lo dice y no ofrece el botón', () => {
    montar({ ...SUGERIDA, yaElegida: true });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sugerencia por la foto: Bache, el tipo que elegiste. Es automática: si no es correcto, cámbialo.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con el catálogo recargando muestra el mismo texto, sin el botón', () => {
    montar({ ...SUGERIDA, seleccionable: false });
    expect(screen.getByRole('status')).toHaveTextContent('Sugerencia por la foto: Bache.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('no muestra porcentajes ni «confianza»', () => {
    montar(SUGERIDA);
    expect(document.body).not.toHaveTextContent(/%|confianza|probabilidad/i);
  });
});
