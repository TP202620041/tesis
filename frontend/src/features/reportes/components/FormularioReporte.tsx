'use client';

import { useRef, useState } from 'react';
import { Aviso } from '@/components/ui/Aviso';
import { clasesDeBoton } from '@/components/ui/Boton';
import { AlertaError, Boton, CLASE_CONTROL_INVALIDO, ErrorDelCampo } from '@/components/ui/form';
import type { Severidad } from '@/lib/types/domain';
import { errorDelCampo } from '@/lib/types/moderacion';
import { useCategoriasDeReporte } from '../hooks/useCategoriasDeReporte';
import {
  useCrearReporte,
  type DatosDelReporte,
  type DesenlaceDelEnvio,
  type MotivoDeEspera,
} from '../hooks/useCrearReporte';
import { useSugerenciaDeCategoria } from '../hooks/useSugerenciaDeCategoria';
import {
  ACCION_ENVIAR_SIN_FOTO,
  ACCION_GUARDAR_PARA_DESPUES,
  MENSAJE_FOTO_NO_PERMITIDA,
} from '../model/moderacion';
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
const ID_ERROR_DESCRIPCION = 'descripcion-error';

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
 *
 * NC-10c, la moderación (todo por `codigo`, sin repetir la palabra):
 * - **Foto no permitida** (400 al crear, o `fotoRechazada` en la vista
 *   previa): se quita la foto, se avisa junto al campo («La foto no está
 *   permitida. Toma otra.») hasta que se elija otra, y el resto del
 *   formulario queda como estaba.
 * - **Texto no permitido**: el mensaje del backend va en el título o en la
 *   descripción, mientras ese campo diga lo mismo que se envió.
 * - **Sin moderación** (503, solo con foto): junto al botón de envío se
 *   ofrece «Guardar para enviar después» (la cola de US-06, misma clave) o
 *   «Enviar sin foto» (quita la foto y envía con la misma clave).
 */
export function FormularioReporte({
  usuarioId,
  onCreado,
  onEncolado,
}: {
  usuarioId: number;
  onCreado: (r: ReporteCreado) => void;
  onEncolado: (motivo: MotivoDeEspera) => void;
}) {
  const {
    enviar: enviarReporte,
    guardarParaDespues,
    enviando,
    error,
    textoRechazado,
    moderacionNoDisponible,
    limpiarError,
  } = useCrearReporte(usuarioId);
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
  // NC-10c: el texto que rechazó la moderación, mientras el campo no cambie.
  const errorTitulo = errores.titulo ?? errorDelCampo(textoRechazado, 'titulo', titulo);
  const errorDeDescripcion = errorDelCampo(textoRechazado, 'descripcion', descripcion);
  const [foto, setFoto] = useState<File | null>(null);
  // NC-10c: la moderación rechazó la foto y se quitó; se avisa hasta elegir otra.
  const [fotoNoPermitida, setFotoNoPermitida] = useState(false);
  const quitarFotoNoPermitida = () => {
    setFoto(null);
    setFotoNoPermitida(true);
  };
  const elegirFoto = (elegida: File | null) => {
    setFoto(elegida);
    setFotoNoPermitida(false);
  };
  const vistaPrevia = useSugerenciaDeCategoria(foto, quitarFotoNoPermitida);
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

  /** Lo que el formulario tiene ahora, con la foto que se quiere enviar. */
  function datos(fotoAEnviar: File | null): DatosDelReporte {
    return {
      ubicacion: ubicacion && {
        latitud: ubicacion.coordenadas.latitud,
        longitud: ubicacion.coordenadas.longitud,
        manual: ubicacion.manual,
      },
      categoriaId,
      titulo,
      severidad,
      descripcion,
      foto: fotoAEnviar,
    };
  }

  /**
   * Titulo o severidad invalidos: se marcan en su campo y no se envia (el
   * hook valida igual, pero asi el mensaje no sale dos veces).
   */
  function camposValidos(): boolean {
    setIntentado(true);
    const campos = erroresDeTituloYSeveridad(titulo, severidad);
    if (campos.titulo || campos.severidad) {
      // El error anterior (p. ej. un 409 del intento previo) ya no aplica.
      limpiarError();
      return false;
    }
    // NC-04: si la vista previa no llegó, ya no hace falta (el backend
    // calcula la sugerencia oficial sobre la foto guardada).
    vistaPrevia.descartar();
    return true;
  }

  function alTerminar(desenlace: DesenlaceDelEnvio) {
    if (desenlace?.tipo === 'creado') onCreado(desenlace.reporte);
    else if (desenlace?.tipo === 'encolado') onEncolado(desenlace.motivo);
    // NC-10c: la foto no viaja más; el resto del formulario queda igual.
    else if (desenlace?.tipo === 'foto-no-permitida') quitarFotoNoPermitida();
    // El envío falló (409, 400…) y el ciudadano sigue en el formulario: si la
    // vista previa se había cancelado al enviar, se vuelve a pedir.
    else vistaPrevia.reanudar();
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!camposValidos()) return;
    alTerminar(await enviarReporte(datos(foto)));
  }

  /** NC-10c, tras el 503: a la cola de US-06 con la misma clave, con la foto. */
  async function guardarDespues() {
    if (!camposValidos()) return;
    alTerminar(await guardarParaDespues(datos(foto)));
  }

  /** NC-10c, tras el 503: se quita la foto y se envía sin ella, con la misma clave. */
  async function enviarSinFoto() {
    if (!camposValidos()) return;
    setFoto(null);
    alTerminar(await enviarReporte(datos(null)));
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      <CampoUbicacion valor={ubicacion} onCambiar={setUbicacion} />

      <CampoFoto
        valor={foto}
        onCambiar={elegirFoto}
        aviso={AVISO_DE_ANALISIS_DE_FOTO}
        rechazo={
          vistaPrevia.estado === 'foto-rechazada' ? avisoDeFotoRechazada(vistaPrevia.mensaje) : null
        }
        noPermitida={fotoNoPermitida ? MENSAJE_FOTO_NO_PERMITIDA : null}
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

      <CampoTitulo id="titulo" valor={titulo} onCambiar={setTitulo} error={errorTitulo} />

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
          aria-invalid={errorDeDescripcion ? true : undefined}
          aria-describedby={errorDeDescripcion ? ID_ERROR_DESCRIPCION : undefined}
          className={`rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto focus:border-primario ${CLASE_CONTROL_INVALIDO}`}
        />
        {errorDeDescripcion && (
          <ErrorDelCampo id={ID_ERROR_DESCRIPCION} mensaje={errorDeDescripcion} />
        )}
      </div>

      {/* NC-10c: solo mientras haya una foto que revisar; sin ella, el envío
          normal ya no necesita la moderación. */}
      {moderacionNoDisponible && foto && (
        <Aviso tono="advertencia" rol="alert">
          <p>{moderacionNoDisponible}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => void guardarDespues()}
              className={clasesDeBoton('secundario', 'compacto')}
            >
              {ACCION_GUARDAR_PARA_DESPUES}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => void enviarSinFoto()}
              className={clasesDeBoton('secundario', 'compacto')}
            >
              {ACCION_ENVIAR_SIN_FOTO}
            </button>
          </div>
        </Aviso>
      )}

      <Boton cargando={enviando} disabled={!puedeEnviar}>
        Enviar reporte
      </Boton>
    </form>
  );
}
