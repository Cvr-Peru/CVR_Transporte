import { cn } from '@/lib/cn';
import { porcentaje } from '@/lib/format';

/** Barra de progreso con color según el nivel de cumplimiento. */
export function Progreso({
  valor,
  className,
  mostrarTexto = false,
  colorManual,
}: {
  valor: number;
  className?: string;
  mostrarTexto?: boolean;
  colorManual?: string;
}) {
  const v = Math.max(0, Math.min(100, valor));
  const color =
    colorManual ??
    (v >= 85
      ? 'bg-emerald-500'
      : v >= 60
        ? 'bg-amber-500'
        : v > 0
          ? 'bg-rose-500'
          : 'bg-slate-600');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${v}%` }}
        />
      </div>
      {mostrarTexto ? (
        <span className="num w-11 text-right text-xs text-slate-400">{porcentaje(v, 0)}</span>
      ) : null}
    </div>
  );
}

/** Indicador compacto de proporción: usado en listas de costos. */
export function BarraProporcion({
  etiqueta,
  valor,
  total,
  color = 'bg-sky-500',
  detalle,
}: {
  etiqueta: string;
  valor: number;
  total: number;
  color?: string;
  detalle?: string;
}) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-slate-300">{etiqueta}</span>
        <span className="num text-slate-400">{detalle ?? porcentaje(pct, 1)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
