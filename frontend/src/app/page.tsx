import Link from 'next/link';

/**
 * Portada publica. En esta fase es solo la puerta al slice de acceso; el mapa
 * (US-10) y el indice de desempeno (US-18) viven en `(public)/` y llegan en
 * sus propios slices.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold text-sky-700 dark:text-sky-400">ViaSegura</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
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
          className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-700"
        >
          Ver el mapa de reportes
        </Link>
        <Link
          href="/desempeno"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700
                     transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200
                     dark:hover:bg-slate-800"
        >
          Desempeño por distrito
        </Link>
      </nav>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6 text-sm dark:border-slate-700">
        <span className="text-slate-600 dark:text-slate-400">¿Quieres reportar un daño?</span>
        <Link href="/login" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className="font-medium text-sky-700 hover:underline dark:text-sky-400"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
