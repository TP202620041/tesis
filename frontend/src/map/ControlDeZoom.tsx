'use client';

import { ZoomControl } from 'react-leaflet';

/**
 * Botones +/- de Leaflet con nombre en castellano (QA-1). El control por
 * defecto los nombra «Zoom in» y «Zoom out» (Leaflet usa el titulo como
 * `title` y `aria-label`), asi que un lector de pantalla los anunciaba en
 * ingles en una app en `es-PE`. Quien lo use pone `zoomControl={false}` en el
 * `MapContainer` para no tener dos controles.
 */
export function ControlDeZoom() {
  return <ZoomControl position="topleft" zoomInTitle="Acercar" zoomOutTitle="Alejar" />;
}
