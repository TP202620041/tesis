import { describe, expect, it } from 'vitest';
import { DATOS_INSUFICIENTES, ORDEN_INICIAL, SIN_DATOS } from './formato';
import {
  etiquetaPeriodo,
  formatearDias,
  formatearSatisfaccionGestion,
  formatearTasaGestion,
  MENOS_DE_UN_DECIMO_DE_DIA,
  MIN_RESUELTOS,
  MIN_VALIDOS,
  municipalidadDistinta,
  opcionDePeriodo,
  ordenarGestion,
  periodoElegido,
  periodoSinDatos,
  posiciones,
  tasaInsuficiente,
  textoConteo,
  textoSatisfaccion,
  textoTasa,
  textoTiempo,
  tiempoInsuficiente,
  type KpiGestion,
  type PeriodoGestion,
} from './gestion';

function kpi(distritoNombre: string, extra: Partial<KpiGestion> = {}): KpiGestion {
  return {
    distritoId: distritoNombre.length,
    distritoNombre,
    municipalidadNombre: `Municipalidad de ${distritoNombre}`,
    categoriaId: null,
    reportesValidos: 0,
    reportesResueltos: 0,
    tasaResolucion: null,
    tiempoPromedioDias: null,
    satisfaccionPromedio: null,
    totalCalificaciones: 0,
    ...extra,
  };
}

const ACTUAL: PeriodoGestion = { id: 1, fechaInicio: '2023-01-01', fechaFin: '2026-12-31', vigente: true };
const SIGUIENTE: PeriodoGestion = { id: 2, fechaInicio: '2027-01-01', fechaFin: '2030-12-31', vigente: false };

describe('periodos de gestión', () => {
  it('un periodo de enero a diciembre se nombra por sus años', () => {
    expect(etiquetaPeriodo(ACTUAL)).toBe('2023–2026');
  });

  it('otro periodo muestra sus fechas, sin correrse un día por la zona horaria', () => {
    expect(etiquetaPeriodo({ fechaInicio: '2023-07-01', fechaFin: '2027-06-30' })).toBe('01/07/2023 – 30/06/2027');
  });

  it('la opción del vigente lo dice con palabras', () => {
    expect(opcionDePeriodo(ACTUAL)).toBe('2023–2026 (vigente)');
    expect(opcionDePeriodo(SIGUIENTE)).toBe('2027–2030');
  });

  it('por defecto se elige el vigente; el de la URL si existe', () => {
    const periodos = [SIGUIENTE, ACTUAL];
    expect(periodoElegido(periodos, null)).toBe(ACTUAL);
    expect(periodoElegido(periodos, 2)).toBe(SIGUIENTE);
    expect(periodoElegido(periodos, 99)).toBe(ACTUAL);
  });

  it('si ninguno es vigente, el más reciente; sin periodos, null', () => {
    expect(periodoElegido([{ ...SIGUIENTE }, { ...ACTUAL, vigente: false }], null)?.id).toBe(2);
    expect(periodoElegido([], null)).toBeNull();
  });
});

// es-PE: punto decimal y coma de miles (1,234.56). No «corregir» a es-ES.
describe('formato de los KPIs', () => {
  it('la tasa lleva los dos decimales del servidor, para coincidir con el cálculo manual', () => {
    expect(formatearTasaGestion(66.67)).toBe('66.67 %');
    expect(formatearTasaGestion(100)).toBe('100 %');
    expect(formatearTasaGestion(0)).toBe('0 %');
    expect(formatearTasaGestion(null)).toBe(SIN_DATOS);
  });

  it('el tiempo va en días con un decimal, en singular o plural', () => {
    expect(formatearDias(1.9)).toBe('1.9 días');
    expect(formatearDias(1)).toBe('1 día');
    expect(formatearDias(12)).toBe('12 días');
    expect(formatearDias(0.4)).toBe('0.4 días');
    expect(formatearDias(1234.5)).toBe('1,234.5 días');
  });

  it('un promedio que redondeó a 0 días no se muestra como «0 días»', () => {
    expect(formatearDias(0)).toBe(MENOS_DE_UN_DECIMO_DE_DIA);
    expect(formatearDias(0)).toBe('< 0.1 días');
    expect(formatearDias(0.1)).toBe('0.1 días');
  });

  it('sin resueltos no hay tiempo: «Sin datos», nunca 0', () => {
    expect(formatearDias(null)).toBe(SIN_DATOS);
    expect(formatearDias(undefined)).toBe(SIN_DATOS);
  });

  it('la satisfacción es sobre 5', () => {
    expect(formatearSatisfaccionGestion(4)).toBe('4 / 5');
    expect(formatearSatisfaccionGestion(4.25)).toBe('4.25 / 5');
    expect(formatearSatisfaccionGestion(null)).toBe(SIN_DATOS);
  });

  it('los conteos son hechos: «resueltos / válidos», también con ceros reales', () => {
    expect(textoConteo(kpi('A', { reportesValidos: 1234, reportesResueltos: 40 }))).toBe('40 / 1,234');
    expect(textoConteo(kpi('A'))).toBe('0 / 0');
    // Sin fila (tipo de daño sin reportes en ese distrito) no se afirma «0 / 0».
    expect(textoConteo(null)).toBe(SIN_DATOS);
  });

  it('la municipalidad solo se muestra si dice algo más que el distrito', () => {
    expect(municipalidadDistinta(kpi('Lince'))).toBe('Municipalidad de Lince');
    expect(municipalidadDistinta(kpi('Lince', { municipalidadNombre: null }))).toBeNull();
    expect(municipalidadDistinta(kpi('Lince', { municipalidadNombre: 'Lince' }))).toBeNull();
  });
});

describe('datos insuficientes (US-17 Esc. 2, US-20 Esc. 2)', () => {
  it('los umbrales son 5 válidos y 3 resueltos', () => {
    expect(MIN_VALIDOS).toBe(5);
    expect(MIN_RESUELTOS).toBe(3);
  });

  it('con menos de 5 válidos la tasa y la satisfacción dicen «Datos insuficientes»; con 5 no', () => {
    const cuatro = kpi('A', { reportesValidos: 4, reportesResueltos: 4, tasaResolucion: 100, satisfaccionPromedio: 5, totalCalificaciones: 2 });
    expect(tasaInsuficiente(cuatro)).toBe(true);
    expect(textoTasa(cuatro)).toBe(DATOS_INSUFICIENTES);
    expect(textoSatisfaccion(cuatro)).toBe(DATOS_INSUFICIENTES);

    const cinco = { ...cuatro, reportesValidos: 5, tasaResolucion: 80 };
    expect(tasaInsuficiente(cinco)).toBe(false);
    expect(textoTasa(cinco)).toBe('80 %');
    expect(textoSatisfaccion(cinco)).toBe('5 / 5');
  });

  it('con menos de 3 resueltos el tiempo dice «Datos insuficientes»; con 3 no', () => {
    const dos = kpi('A', { reportesValidos: 10, reportesResueltos: 2, tasaResolucion: 20, tiempoPromedioDias: 0.5 });
    expect(tiempoInsuficiente(dos)).toBe(true);
    expect(textoTiempo(dos)).toBe(DATOS_INSUFICIENTES);
    expect(textoTiempo({ ...dos, reportesResueltos: 3 })).toBe('0.5 días');
  });

  it('aplica también al agregado general, no solo por tipo de daño', () => {
    expect(textoTiempo(kpi('A', { categoriaId: null, reportesValidos: 9, reportesResueltos: 1, tiempoPromedioDias: 3 }))).toBe(
      DATOS_INSUFICIENTES,
    );
  });

  it('una métrica null sigue siendo «Sin datos» aunque los conteos sean bajos', () => {
    const sinReportes = kpi('A');
    expect(textoTasa(sinReportes)).toBe(SIN_DATOS);
    expect(textoTiempo(sinReportes)).toBe(SIN_DATOS);
    expect(textoSatisfaccion(sinReportes)).toBe(SIN_DATOS);
    // Y 0 % con suficientes válidos es un cero real (ninguno resuelto).
    expect(textoTasa(kpi('B', { reportesValidos: 6, tasaResolucion: 0 }))).toBe('0 %');
  });
});

describe('ordenarGestion', () => {
  const nombres = (fs: KpiGestion[]) => fs.map((f) => f.distritoNombre);
  const ate = kpi('Ate', { reportesValidos: 10, reportesResueltos: 3, tasaResolucion: 30, tiempoPromedioDias: 9 });
  const lince = kpi('Lince', { reportesValidos: 8, reportesResueltos: 4, tasaResolucion: 50, tiempoPromedioDias: 3, satisfaccionPromedio: 4 });
  // 1 de 1 resuelto: 100 %, pero con datos insuficientes.
  const barranco = kpi('Barranco', { reportesValidos: 1, reportesResueltos: 1, tasaResolucion: 100, tiempoPromedioDias: 0.2, satisfaccionPromedio: 5 });
  const comas = kpi('Comas');
  const filas = [ate, barranco, comas, lince];

  it('por defecto, tasa de mayor a menor', () => {
    expect(nombres(ordenarGestion(filas, ORDEN_INICIAL))).toEqual(['Lince', 'Ate', 'Barranco', 'Comas']);
  });

  it('un distrito con datos insuficientes no encabeza el ranking con su 100 %: va al final, como null', () => {
    expect(ordenarGestion(filas, ORDEN_INICIAL)[0]).toBe(lince);
    const asc = ordenarGestion(filas, { columna: 'tasa', descendente: false });
    expect(nombres(asc)).toEqual(['Ate', 'Lince', 'Barranco', 'Comas']);
  });

  it('por tiempo, el promedio de menos de 3 resueltos tampoco es el «más rápido»', () => {
    expect(nombres(ordenarGestion(filas, { columna: 'tiempo', descendente: false }))).toEqual([
      'Lince',
      'Ate',
      'Barranco',
      'Comas',
    ]);
  });

  it('por satisfacción, con menos de 5 válidos va al final', () => {
    expect(nombres(ordenarGestion(filas, { columna: 'satisfaccion', descendente: true }))).toEqual([
      'Lince',
      'Ate',
      'Barranco',
      'Comas',
    ]);
  });

  it('por volumen de válidos y por nombre', () => {
    expect(nombres(ordenarGestion(filas, { columna: 'reportes', descendente: true }))).toEqual([
      'Ate',
      'Lince',
      'Barranco',
      'Comas',
    ]);
    expect(nombres(ordenarGestion(filas, { columna: 'distrito', descendente: false }))).toEqual([
      'Ate',
      'Barranco',
      'Comas',
      'Lince',
    ]);
  });

  it('desempata por nombre y no muta la lista', () => {
    const original = [...filas];
    const empatados = [
      kpi('Surco', { reportesValidos: 5, tasaResolucion: 40 }),
      kpi('Breña', { reportesValidos: 5, tasaResolucion: 40 }),
    ];
    expect(nombres(ordenarGestion(empatados, ORDEN_INICIAL))).toEqual(['Breña', 'Surco']);
    ordenarGestion(filas, { columna: 'distrito', descendente: true });
    expect(filas).toEqual(original);
  });

  it('solo llevan puesto las filas con valor en la columna de orden', () => {
    const ordenadas = ordenarGestion(filas, ORDEN_INICIAL);
    expect(posiciones(ordenadas, ORDEN_INICIAL)).toEqual([1, 2, null, null]);
    const porNombre = { columna: 'distrito', descendente: false } as const;
    expect(posiciones(ordenarGestion(filas, porNombre), porNombre)).toEqual([1, 2, 3, 4]);
  });
});

describe('periodoSinDatos', () => {
  it('un periodo sin ningún reporte válido (2027-2030) es «Sin datos», no 43 filas de ceros', () => {
    expect(periodoSinDatos({ distritos: [kpi('A'), kpi('B')] })).toBe(true);
    expect(periodoSinDatos({ distritos: [] })).toBe(true);
    expect(periodoSinDatos({ distritos: [kpi('A'), kpi('B', { reportesValidos: 1 })] })).toBe(false);
  });
});
