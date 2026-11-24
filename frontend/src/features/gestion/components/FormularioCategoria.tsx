'use client';

import { useState, type FormEvent } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useGuardarCategoria } from '../hooks/useGuardarCategoria';
import {
  datosDe,
  MAX_DESCRIPCION_CATEGORIA,
  MAX_NOMBRE_CATEGORIA,
  type CategoriaGestion,
} from '../model/categorias';
import { clasesDeBoton } from '@/components/ui/Boton';
import { IconoDeCategoria } from '@/components/ui/IconoDeCategoria';
import {
  ETIQUETA_DE_ICONO,
  ICONOS_CATEGORIA,
  iconoDeCategoria,
  type IconoCategoria,
} from '@/lib/types/iconoCategoria';

/**
 * US-29: crear (sin `categoria`) o editar una categoría personalizada.
 * Al editar se envían siempre nombre, descripción e ícono: el PATCH
 * reemplaza. El ícono se elige de un conjunto cerrado (US-29 Esc. 1); al
 * lado del selector se ve cómo quedará.
 */
export function FormularioCategoria({
  categoria,
  onGuardado,
  onCancelar,
}: {
  categoria?: CategoriaGestion;
  onGuardado: () => void;
  onCancelar?: () => void;
}) {
  const { guardar, enviando, error } = useGuardarCategoria();
  const inicial = categoria ? datosDe(categoria) : { nombre: '', descripcion: '', icono: null };
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [icono, setIcono] = useState<IconoCategoria | null>(inicial.icono);
  const idBase = categoria ? `categoria-${categoria.id}` : 'categoria-nueva';

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (await guardar(categoria?.id ?? null, { nombre, descripcion, icono })) {
      if (!categoria) {
        setNombre('');
        setDescripcion('');
        setIcono(null);
      }
      onGuardado();
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
      <Campo
        id={`${idBase}-nombre`}
        etiqueta="Nombre"
        value={nombre}
        maxLength={MAX_NOMBRE_CATEGORIA}
        onChange={(e) => setNombre(e.target.value)}
        required
      />
      <Campo
        id={`${idBase}-descripcion`}
        etiqueta="Descripción (opcional)"
        value={descripcion}
        maxLength={MAX_DESCRIPCION_CATEGORIA}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idBase}-icono`} className="text-sm font-medium text-texto">
          Ícono (opcional)
        </label>
        <div className="flex items-center gap-2">
          <span className="flex size-objetivo shrink-0 items-center justify-center rounded-control border border-linea bg-superficie-2 text-texto-2">
            <IconoDeCategoria icono={icono} />
          </span>
          <select
            id={`${idBase}-icono`}
            value={icono ?? ''}
            onChange={(e) => setIcono(iconoDeCategoria(e.target.value))}
            className="min-h-objetivo min-w-0 flex-1 rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto focus:border-primario"
          >
            <option value="">Sin ícono</option>
            {ICONOS_CATEGORIA.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_DE_ICONO[valor]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      <div className="flex flex-wrap gap-2">
        <Boton cargando={enviando}>{categoria ? 'Guardar cambios' : 'Crear categoría'}</Boton>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className={clasesDeBoton('secundario')}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
