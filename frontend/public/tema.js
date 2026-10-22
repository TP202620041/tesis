/*
 * Ciudad Viva: aplica el tema ANTES de pintar (US-23, DIS-1).
 *
 * Lo carga `src/app/layout.tsx` en el <head> como script síncrono del mismo
 * origen (la CSP ya permite `script-src 'self'`): corre mientras el navegador
 * lee el HTML, antes del primer pintado, así que no hay un destello del tema
 * claro. Lee la preferencia del dispositivo de `localStorage` (sin cookies:
 * leerlas en el layout raíz lo volvería dinámico) y fija `data-theme` en
 * <html>. Después, React lo mantiene (`features/auth/hooks/useApariencia.ts`).
 *
 * Repite las reglas de `src/features/auth/model/apariencia.ts`;
 * `apariencia.test.ts` ejecuta este archivo y comprueba que resuelven igual.
 */
(function () {
  var temas = ['claro', 'oscuro', 'alto-contraste'];
  var guardada = null;
  try {
    guardada = window.localStorage.getItem('viasegura.apariencia');
  } catch {
    // Sin localStorage (modo privado estricto, almacenamiento bloqueado): se
    // sigue al sistema.
  }
  var tema = 'claro';
  if (temas.indexOf(guardada) >= 0) {
    tema = guardada;
  } else if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-contrast: more)').matches) tema = 'alto-contraste';
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) tema = 'oscuro';
  }
  document.documentElement.setAttribute('data-theme', tema);
})();
