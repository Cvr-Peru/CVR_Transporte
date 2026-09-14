import type { ReactNode } from 'react';

/** Encabezado estándar de cada página del sistema. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">{titulo}</h1>
        {descripcion ? (
          <p className="mt-1 max-w-3xl text-sm text-slate-400">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  );
}
