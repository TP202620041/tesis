'use client';

import { useRef, useState } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import type { Severidad } from '@/lib/types/domain';
import { useCategoriasDeReporte } from '../hooks/useCategoriasDeReporte';
import { useCrearReporte } from '../hooks/useCrearReporte';
import { useSugerenciaDeCategoria } from '../hooks/useSugerenciaDeCategoria';
import {
  AVISO_DE_ANALISIS_DE_FOTO,
  avisoDeFotoRechazada,
  vistaDeSugerencia,
} from '../model/sugerencia';
import { erroresDeTituloYSeveridad } from '../model/titulo';
import type { ReporteCreado } from '../model/tipos';
import { CampoSeveridad, CampoTitulo } from './CamposTituloYSeveridad';
import { CampoFoto } from './CampoFoto';
import { CampoUbicacion, type UbicacionElegida } from './CampoUbicacion';
import { SugerenciaDeCategoria } from './SugerenciaDeCategoria';

const ID_SUGERENCIA = 'categoriaId-sugerencia';
const ID_AYUDA_CATEGORIA = 'categoriaId-ayuda';

/**
 * US-05: crear un reporte con foto, categoría y GPS. NC-02: con título
 * (obligatorio) y severidad (obligatoria, sin valor por defecto).
 *
 * US-06: sin conexión, el reporte se guarda en el dispositivo con su
 * `Idempotency-Key` (`onEncolado`) y se envía solo al volver la señal. La
 * clave y el envío los lleva `useCrearReporte`.
 *
 * NC-04: la foto va antes del tipo de daño porque lo puede sugerir. La
 * sugerencia solo se propone (botón «Elegir …»): el selector nunca cambia sin
 * una acción del ciudadano, y la vista previa no bloquea nada (ni el selector
 * ni el envío). Al enviar se descarta si aún no llegó, y si el envío falla y
 * el ciudadano sigue aquí, se vuelve a pedir. La ayuda de la foto avisa del
 * análisis antes de elegirla.
 */
export function FormularioReporte({
  usuarioId,
  onCreado,
  onEncolado,
}: {
  usuarioId: number;
  onCreado: (r: ReporteCreado) => void;
  onEncolado: () => void;
}) {
  const { enviar: enviarReporte, enviando, error, limpiarError } = useCrearReporte(usuarioId);
  const [ubicacion, setUbicacion] = useState<UbicacionElegida | null>(null);
  const [categoriaElegida, setCategoriaElegida] = useState<number | null>(null);
  const [titulo, setTitulo] = useState('');
  const [severidad, setSeveridad] = useState<Severidad | null>(null);
  const [descripcion, setDescripcion] = useState('');
  // Los errores por campo se muestran recien tras el primer intento de envio.
  const [intentado, setIntentado] = useState(false);
  const errores = intentado
    ? erroresDeTituloYSeveridad(titulo, severidad)
    : { titulo: null, severidad: null };
  const [foto, setFoto] = useState<File | null>(null);
  const vistaPrevia = useSugerenciaDeCategoria(foto);
  const selectorDeCategoria = useRef<HTMLSelectElement>(null);

  const distritoId = ubicacion?.distrito?.id ?? null;

  /**
   * Las categorias dependen del distrito (US-29) y se recargan cuando cambia
   * la ubicacion. Si la elegida no es valida en el distrito nuevo, cuenta
   * como no elegida en vez de dejar que el POST falle con 409.
   */
  const catalogo = useCategoriasDeReporte(distritoId);
  const { categorias } = catalogo;
  const categoriaId = categorias.some((c) => c.id === categoriaElegida) ? categoriaElegida : null;
  // Con la elegida tal cual (no la validada): mientras el catalogo recarga por
  // un cambio de distrito, el texto de la sugerencia no cambia ni se re-anuncia.
  const sugerencia = vistaDeSugerencia(vistaPrevia, catalogo, categoriaElegida);

  const fueraDeCobertura = ubicacion != null && ubicacion.distrito === null;
  const puedeEnviar = ubicacion != null && !fueraDeCobertura && categoriaId != null && !enviando;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setIntentado(true);
    // Titulo o severidad invalidos: se marcan en su campo y no se envia (el
    // hook valida igual, pero asi el mensaje no sale dos veces).
    const campos = erroresDeTituloYSeveridad(titulo, severidad);
    if (campos.titulo || campos.severidad) {
      // El error anterior (p. ej. un 409 del intento previo) ya no aplica.
      limpiarError();
      return;
    }
    // NC-04: si la vista previa no llegó, ya no hace falta (el backend
    // calcula la sugerencia oficial sobre la foto guardada).
    vistaPrevia.descartar();
    const desenlace = await enviarReporte({
      ubicacion: ubicacion && {
        latitud: ubicacion.coordenadas.latitud,
        longitud: ubicacion.coordenadas.longitud,
        manual: ubicacion.manual,
      },
      categoriaId,
      titulo,
      severidad,
      descripcion,
      foto,
    });
    if (desenlace?.tipo === 'creado') onCreado(desenlace.reporte);
    else if (desenlace?.tipo === 'encolado') onEncolado();
    // El envío falló (409, 400…) y el ciudadano sigue en el formulario: si la
    // vista previa se había cancelado al enviar, se vuelve a pedir.
    else vistaPrevia.reanudar();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      <CampoUbicacion valor={ubicacion} onCambiar={setUbicacion} />

      <CampoFoto
        valor={foto}
        onCambiar={setFoto}
        aviso={AVISO_DE_ANALISIS_DE_FOTO}
        rechazo={
          vistaPrevia.estado === 'foto-rechazada' ? avisoDeFotoRechazada(vistaPrevia.mensaje) : null
        }
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="categoriaId"
          className="text-sm font-medium text-texto"
        >
          Tipo de daño
        </label>
        <select
          ref={selectorDeCategoria}
          id="categoriaId"
          required
          aria-describedby={distritoId ? ID_SUGERENCIA : `${ID_SUGERENCIA} ${ID_AYUDA_CATEGORIA}`}
          value={categoriaId ?? ''}
          onChange={(e) => setCategoriaElegida(e.target.value ? Number(e.target.value) : null)}
          className="min-h-objetivo rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto focus:border-primario"
        >
          <option value="">Selecciona…</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
              {!categoria.esEstandar ? ' (propia del distrito)' : ''}
            </option>
          ))}
        </select>
        <SugerenciaDeCategoria
          id={ID_SUGERENCIA}
          vista={sugerencia}
          onElegir={(id) => {
            setCategoriaElegida(id);
            // El boton desaparece al elegir: el foco pasa al selector, que
            // anuncia la categoria ya elegida.
            selectorDeCategoria.current?.focus();
          }}
        />
        {!distritoId && (
          <p id={ID_AYUDA_CATEGORIA} className="text-xs text-texto-2">
            Al indicar la ubicación podrían aparecer categorías propias de tu distrito.
          </p>
        )}
      </div>

      <CampoTitulo id="titulo" valor={titulo} onCambiar={setTitulo} error={errores.titulo} />

      <CampoSeveridad
        nombre="severidad"
        valor={severidad}
        onCambiar={setSeveridad}
        error={errores.severidad}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="descripcion"
          className="text-sm font-medium text-texto"
        >
          Descripción <span className="font-normal text-texto-2">(opcional)</span>
        </label>
        <textarea
          id="descripcion"
          rows={3}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej.: bache profundo en el carril derecho, frente al parque."
          className="rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto focus:border-primario"
        />
      </div>

      <Boton cargando={enviando} disabled={!puedeEnviar}>
        Enviar reporte
      </Boton>
    </form>
  );
}
