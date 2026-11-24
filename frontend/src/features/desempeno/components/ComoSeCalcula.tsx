import { DATOS_INSUFICIENTES, SIN_DATOS } from '../model/formato';
import { MIN_RESUELTOS, MIN_VALIDOS } from '../model/gestion';

/**
 * NC-06: cómo se calcula cada indicador, en la misma página que las cifras.
 *
 * Son las fórmulas de la decisión del 23/11 (`2026-11-23-nc-06-kpis-gestion-y-d10.md`)
 * dichas en llano: quien mira el ranking puede rehacer cualquier cifra con
 * los conteos de la tabla (OE3-I5 pide coincidencia con el cálculo manual).
 */
export function ComoSeCalcula() {
  return (
    <section aria-labelledby="titulo-como-se-calcula" className="flex flex-col gap-3 border-t border-linea pt-4">
      <h2 id="titulo-como-se-calcula" className="text-lg font-semibold text-texto">
        Cómo se calcula cada indicador
      </h2>
      <dl className="grid gap-3 text-sm text-texto sm:grid-cols-2">
        <Definicion termino="Periodo de gestión">
          Los cuatro años de una gestión municipal. Cada reporte cuenta en el periodo en que se
          creó, aunque se resuelva en el siguiente.
        </Definicion>
        <Definicion termino="Reportes válidos">
          Todos los reportes del distrito en el periodo, salvo los que el propio ciudadano retiró y
          los ocultos por moderación. Los rechazados sí cuentan: rechazar un reporte no mejora la
          tasa de nadie.
        </Definicion>
        <Definicion termino="Tasa de resolución">
          Reportes resueltos ÷ reportes válidos × 100, con dos decimales. Ejemplo: 2 resueltos de 3
          válidos dan 66.67 %.
        </Definicion>
        <Definicion termino="Tiempo promedio de atención">
          Promedio, entre los reportes resueltos, de los días que pasaron desde que se reportó el
          daño hasta que se marcó como resuelto. En días, con un decimal.
        </Definicion>
        <Definicion termino="Satisfacción">
          Promedio de las estrellas (de 1 a 5) que dieron los ciudadanos al calificar la atención de
          sus reportes válidos. Entre paréntesis, cuántas calificaciones hay.
        </Definicion>
        <Definicion termino={`«${DATOS_INSUFICIENTES}»`}>
          La cifra existe pero sale de muy pocos reportes para decir algo del distrito: con menos de{' '}
          {MIN_VALIDOS} reportes válidos no se muestran la tasa ni la satisfacción, y con menos de{' '}
          {MIN_RESUELTOS} resueltos no se muestra el tiempo promedio. Esos distritos van al final
          del ranking, sin puesto.
        </Definicion>
        <Definicion termino={`«${SIN_DATOS}»`}>
          No hay con qué calcular la cifra (ningún reporte válido, ninguno resuelto o ninguna
          calificación). No es un cero: ese distrito no participa de la métrica.
        </Definicion>
      </dl>
      <p className="text-xs text-texto-2">
        Las cifras salen de los reportes ciudadanos y de sus cambios de estado, no de datos
        declarados por las municipalidades.
      </p>
    </section>
  );
}

function Definicion({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-semibold">{termino}</dt>
      <dd className="text-texto-2">{children}</dd>
    </div>
  );
}
