import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardCabecera({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">{titulo}</h2>
        {descripcion ? (
          <p className="mt-0.5 text-xs text-slate-400">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex shrink-0 items-center gap-2">{acciones}</div> : null}
    </header>
  );
}

export function CardCuerpo({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>;
}

/** Rejilla estándar de tarjetas KPI. */
export function RejillaKpi({
  children,
  columnas = 4,
}: {
  children: ReactNode;
  columnas?: 2 | 3 | 4 | 5;
}) {
  const clases = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
  }[columnas];
  return <div className={cn('grid grid-cols-1 gap-3', clases)}>{children}</div>;
}
