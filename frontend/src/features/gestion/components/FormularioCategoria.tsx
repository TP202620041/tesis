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

/**
 * US-29: crear (sin `categoria`) o editar una categoría personalizada.
 * Al editar se envían siempre nombre y descripción: el PATCH reemplaza.
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
  const inicial = categoria ? datosDe(categoria) : { nombre: '', descripcion: '' };
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const idBase = categoria ? `categoria-${categoria.id}` : 'categoria-nueva';

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (await guardar(categoria?.id ?? null, { nombre, descripcion })) {
      if (!categoria) {
        setNombre('');
        setDescripcion('');
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
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      <div className="flex flex-wrap gap-2">
        <Boton cargando={enviando}>{categoria ? 'Guardar cambios' : 'Crear categoría'}</Boton>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
