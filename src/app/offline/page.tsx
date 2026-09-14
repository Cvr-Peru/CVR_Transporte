import Link from 'next/link';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { IconoAlerta, IconoMapa, IconoReloj } from '@/components/ui/Iconos';

/**
 * Página que se muestra cuando no hay conexión y la ruta pedida no está
 * guardada. El service worker la precarga durante la instalación, así que está
 * disponible desde el primer momento.
 *
 * No consulta la base de datos a propósito: debe poder servirse desde la caché.
 */
export const metadata = {
  title: 'Sin conexión',
};

const SUGERENCIAS = [
  {
    href: '/despachos',
    titulo: 'Despachos',
    detalle: 'Hojas de ruta y avance de paradas del día',
    Icono: IconoMapa,
  },
  {
    href: '/',
    titulo: 'Tablero',
    detalle: 'Indicadores de la última consulta',
    Icono: IconoReloj,
  },
];

export default function PaginaSinConexion() {
  return (
    <>
      <Card>
        <CardCuerpo className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="rounded-full bg-amber-500/15 p-3 text-amber-300">
            <IconoAlerta width={26} height={26} />
          </span>
          <h1 className="text-lg font-semibold text-slate-100">Sin conexión</h1>
          <p className="max-w-md text-sm text-slate-400">
            No se pudo contactar con el servidor. Puedes seguir consultando la información que ya
            visitaste antes; lo que no es posible es registrar entregas ni cambios hasta recuperar
            la conexión.
          </p>
          <p className="text-xs text-slate-500">
            La página se actualizará sola en cuanto vuelvas a tener señal.
          </p>
        </CardCuerpo>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGERENCIAS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800/40"
          >
            <span className="mb-2 inline-flex rounded-lg bg-slate-800/70 p-2 text-sky-300">
              <s.Icono width={18} height={18} />
            </span>
            <p className="text-sm font-medium text-slate-200">{s.titulo}</p>
            <p className="mt-0.5 text-xs text-slate-500">{s.detalle}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
