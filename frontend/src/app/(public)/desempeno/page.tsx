'use client';

import { IndiceDesempeno } from '@/features/desempeno/components/IndiceDesempeno';

/**
 * US-18/US-20: indice publico de desempeno distrital.
 *
 * PUBLICA, sin sesion ni rol. Es la pieza que hace visible el proposito del
 * sistema: comparar como responde cada municipalidad a los reportes de sus
 * vecinos, con datos que los propios ciudadanos generaron.
 */
export default function DesempenoPage() {
  return <IndiceDesempeno />;
}
