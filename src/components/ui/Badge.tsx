import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tono = 'neutro' | 'info' | 'exito' | 'aviso' | 'peligro' | 'violeta';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-slate-700/40 text-slate-300 ring-slate-600/40',
  info: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  exito: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  aviso: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  peligro: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  violeta: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
};

export function Badge({
  children,
  tono = 'neutro',
  className,
}: {
  children: ReactNode;
  tono?: Tono;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Traduce un estado del dominio a un tono visual. Centralizar este mapa evita
 * que cada página invente su propia paleta de estados.
 */
export function tonoDeEstado(estado: string): Tono {
  switch (estado) {
    // Envíos
    case 'entregado':
    case 'completado':
    case 'pagada':
    case 'activo':
    case 'disponible':
    case 'vigente':
      return 'exito';
    case 'en_reparto':
    case 'en_curso':
    case 'en_ruta':
    case 'emitida':
    case 'aprobada':
      return 'info';
    case 'pendiente':
    case 'planificado':
    case 'borrador':
    case 'programado':
    case 'proximo':
    case 'vacaciones':
      return 'aviso';
    case 'novedad':
    case 'devuelto':
    case 'fallido':
    case 'vencida':
    case 'vencido':
    case 'fuera_servicio':
    case 'critico':
      return 'peligro';
    case 'cancelado':
    case 'anulada':
    case 'inactivo':
    case 'incapacidad':
      return 'neutro';
    default:
      return 'neutro';
  }
}

export function BadgeEstado({ estado, texto }: { estado: string; texto: string }) {
  return <Badge tono={tonoDeEstado(estado)}>{texto}</Badge>;
}
