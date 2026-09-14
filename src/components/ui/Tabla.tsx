import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Contenedor con desplazamiento horizontal para tablas anchas. */
export function TablaCaja({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  alineacion = 'izquierda',
  className,
}: {
  children?: ReactNode;
  alineacion?: 'izquierda' | 'derecha' | 'centro';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-slate-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400',
        alineacion === 'derecha' && 'text-right',
        alineacion === 'centro' && 'text-center',
        alineacion === 'izquierda' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  alineacion = 'izquierda',
  className,
  colSpan,
}: {
  children?: ReactNode;
  alineacion?: 'izquierda' | 'derecha' | 'centro';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-slate-800/70 px-3 py-2 align-middle text-slate-300',
        alineacion === 'derecha' && 'text-right num',
        alineacion === 'centro' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn('transition-colors hover:bg-slate-800/40', className)}>{children}</tr>
  );
}

/** Fila para cuando la tabla no tiene datos. */
export function FilaVacia({ colSpan, mensaje }: { colSpan: number; mensaje: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-500">
        {mensaje}
      </td>
    </tr>
  );
}
