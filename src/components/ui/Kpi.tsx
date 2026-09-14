import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tarjeta de indicador. El valor se muestra con cifras tabulares para que no
 * baile cuando los datos se refrescan.
 */
export function Kpi({
  etiqueta,
  valor,
  detalle,
  icono,
  acento = 'slate',
  pie,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  icono?: ReactNode;
  acento?: 'slate' | 'esmeralda' | 'ambar' | 'rosa' | 'cielo' | 'violeta';
  pie?: ReactNode;
}) {
  const acentos = {
    slate: 'text-slate-300 bg-slate-700/30',
    esmeralda: 'text-emerald-300 bg-emerald-500/10',
    ambar: 'text-amber-300 bg-amber-500/10',
    rosa: 'text-rose-300 bg-rose-500/10',
    cielo: 'text-sky-300 bg-sky-500/10',
    violeta: 'text-violet-300 bg-violet-500/10',
  }[acento];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {etiqueta}
        </p>
        {icono ? (
          <span className={cn('rounded-lg p-1.5', acentos)}>{icono}</span>
        ) : null}
      </div>
      <p className="num mt-2 text-2xl font-semibold leading-none text-slate-50">{valor}</p>
      {detalle ? <p className="mt-1.5 text-xs text-slate-400">{detalle}</p> : null}
      {pie ? <div className="mt-3">{pie}</div> : null}
    </div>
  );
}
