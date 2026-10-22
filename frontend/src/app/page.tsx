import Link from 'next/link';
import { clasesDeBoton } from '@/components/ui/Boton';

/**
 * Portada publica. En esta fase es solo la puerta al slice de acceso; el mapa
 * (US-10) y el indice de desempeno (US-18) viven en `(public)/` y llegan en
 * sus propios slices.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold text-texto">Ciudad Viva</h1>
        <p className="mt-2 text-texto-2">
          Reporta baches, veredas dañadas y semáforos averiados en Lima Metropolitana. Tu reporte
          llega automáticamente a la municipalidad del distrito donde ocurre.
        </p>
      </div>

      {/* Las dos vistas públicas van primero y sin pedir cuenta: cualquiera
          —un vecino, un periodista, el jurado— debe poder ver los reportes y
          el desempeño de las municipalidades sin registrarse. */}
      <nav className="flex flex-wrap gap-3">
        <Link
          href="/mapa"
          className={clasesDeBoton('primario')}
        >
          Ver el mapa de reportes
        </Link>
        <Link
          href="/desempeno"
          className={clasesDeBoton('secundario')}
        >
          Desempeño por distrito
        </Link>
      </nav>

      <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-6 text-sm">
        <span className="text-texto-2">¿Quieres reportar un daño?</span>
        <Link href="/login" className="font-medium text-enlace hover:underline">
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className="font-medium text-enlace hover:underline"
        >
          Crear cuenta
        </Link>
      </div>

      {/* QA-1 E-3: la politica de privacidad se enlazaba solo desde el registro. */}
      <footer className="text-sm text-texto-2">
        <Link href="/privacidad" className="hover:underline">
          Términos de uso y privacidad
        </Link>
      </footer>
    </main>
  );
}
