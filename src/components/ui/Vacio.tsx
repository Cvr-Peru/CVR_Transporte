import type { ReactNode } from 'react';
import { IconoBuscar } from './Iconos';

/** Estado vacío reutilizable. */
export function Vacio({
  titulo = 'Sin resultados',
  mensaje,
  icono,
  accion,
}: {
  titulo?: string;
  mensaje?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <span className="rounded-full bg-slate-800/70 p-3 text-slate-500">
        {icono ?? <IconoBuscar width={22} height={22} />}
      </span>
      <p className="text-sm font-medium text-slate-300">{titulo}</p>
      {mensaje ? <p className="max-w-sm text-xs text-slate-500">{mensaje}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
