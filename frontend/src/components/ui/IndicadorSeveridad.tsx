import { nivelDeSeveridad, textoDeSeveridad } from '@/lib/types/tituloYSeveridad';

const ALTOS = ['h-1.5', 'h-2.5', 'h-3.5'] as const;

/**
 * Severidad que declaró el vecino (NC-02), con tres barras crecientes en
 * tinta y SIEMPRE con el texto («Severidad alta»). Sin rojo a propósito
 * (propuesta §4): no compite con el color del estado ni alarma, y la
 * severidad es una apreciación del ciudadano, no una medición.
 *
 * Sin severidad (respuestas anteriores a NC-02) no dibuja nada, como
 * `textoDeSeveridad`: no se inventa un nivel.
 */
export function IndicadorSeveridad({ severidad, className }: { severidad: string | null | undefined; className?: string }) {
  const nivel = nivelDeSeveridad(severidad);
  const texto = textoDeSeveridad(severidad);
  if (nivel === null || texto === null) return null;
  return (
    <span className={['inline-flex items-center gap-1.5', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true" className="flex h-3.5 items-end gap-0.5">
        {ALTOS.map((alto, i) => (
          <span
            key={alto}
            data-llena={i < nivel ? 'si' : 'no'}
            className={`w-1 rounded-[1px] ${alto} ${i < nivel ? 'bg-severidad' : 'bg-severidad-pista'}`}
          />
        ))}
      </span>
      {texto}
    </span>
  );
}
