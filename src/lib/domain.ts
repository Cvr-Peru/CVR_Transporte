/**
 * Lógica de negocio pura (sin acceso a datos ni a React).
 * Todo lo que aquí vive es fácilmente testeable y reutilizable.
 */
import { umbrales } from '@/config/empresa';
import { diasHasta, numero } from './format';

// ─────────────────────────────────────────────────────────────
// Semáforo de vencimiento de documentación
// ─────────────────────────────────────────────────────────────
export type NivelAlerta = 'vencido' | 'critico' | 'proximo' | 'vigente';

export interface EstadoVencimiento {
  nivel: NivelAlerta;
  /** Días restantes (negativo si ya venció) */
  dias: number;
  /** Texto corto listo para mostrar */
  texto: string;
  /** Clases de Tailwind para el badge */
  clases: string;
  /** Color hexadecimal, para gráficos y el mapa */
  color: string;
}

const NIVELES: Record<
  NivelAlerta,
  { clases: string; color: string; etiqueta: string }
> = {
  vencido: {
    clases: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30',
    color: '#f43f5e',
    etiqueta: 'Vencido',
  },
  critico: {
    clases: 'bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30',
    color: '#fb923c',
    etiqueta: 'Crítico',
  },
  proximo: {
    clases: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
    color: '#fbbf24',
    etiqueta: 'Por vencer',
  },
  vigente: {
    clases: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30',
    color: '#34d399',
    etiqueta: 'Vigente',
  },
};

/**
 * Traduce una fecha de vencimiento a un nivel de alerta con semáforo.
 * Es la regla central del módulo de flota: una unidad con documentación
 * vencida no debería salir a operar.
 */
export function estadoVencimiento(vencimiento: string | null | undefined): EstadoVencimiento {
  const dias = diasHasta(vencimiento) ?? 0;

  let nivel: NivelAlerta;
  if (dias < 0) nivel = 'vencido';
  else if (dias <= umbrales.critico) nivel = 'critico';
  else if (dias <= umbrales.preventivo) nivel = 'proximo';
  else nivel = 'vigente';

  const { clases, color, etiqueta } = NIVELES[nivel];

  let texto: string;
  if (dias < 0) texto = `Vencido hace ${Math.abs(dias)} d`;
  else if (dias === 0) texto = 'Vence hoy';
  else if (dias === 1) texto = 'Vence mañana';
  else if (dias <= umbrales.preventivo) texto = `Vence en ${dias} d`;
  else texto = etiqueta;

  return { nivel, dias, texto, clases, color };
}

/** Ordena niveles de peor a mejor, para elegir el estado global de una unidad. */
const GRAVEDAD: Record<NivelAlerta, number> = {
  vencido: 3,
  critico: 2,
  proximo: 1,
  vigente: 0,
};

export function nivelMasGrave(niveles: NivelAlerta[]): NivelAlerta {
  return niveles.reduce<NivelAlerta>(
    (peor, n) => (GRAVEDAD[n] > GRAVEDAD[peor] ? n : peor),
    'vigente',
  );
}

export function esOperable(nivel: NivelAlerta): boolean {
  return nivel !== 'vencido';
}

// ─────────────────────────────────────────────────────────────
// Rentabilidad
// ─────────────────────────────────────────────────────────────
export interface EntradaRentabilidad {
  ingresos: number;
  combustible: number;
  gastos: number;
  mantenimiento: number;
  comisionConductor: number;
  km: number;
  envios: number;
}

export interface Rentabilidad extends EntradaRentabilidad {
  /** Combustible + gastos + mantenimiento */
  costoDirecto: number;
  /** Costo directo + comisión del conductor */
  costoTotal: number;
  margen: number;
  margenPct: number;
  costoPorKm: number;
  ingresoPorKm: number;
  ingresoPorEnvio: number;
  costoPorEnvio: number;
  /** 'rentable' | 'ajustado' | 'perdida' */
  diagnostico: 'rentable' | 'ajustado' | 'perdida';
}

/**
 * Calcula la rentabilidad de un viaje o de una unidad.
 *
 * Criterio de diagnóstico:
 *   margen >= 18%  → rentable
 *   margen >= 0%   → ajustado (deja dinero, pero poco)
 *   margen < 0%    → pérdida
 */
export function calcularRentabilidad(entrada: EntradaRentabilidad): Rentabilidad {
  const costoDirecto = entrada.combustible + entrada.gastos + entrada.mantenimiento;
  const costoTotal = costoDirecto + entrada.comisionConductor;
  const margen = entrada.ingresos - costoTotal;
  const margenPct = entrada.ingresos > 0 ? (margen / entrada.ingresos) * 100 : 0;

  const diagnostico: Rentabilidad['diagnostico'] =
    margen < 0 ? 'perdida' : margenPct >= 18 ? 'rentable' : 'ajustado';

  return {
    ...entrada,
    costoDirecto,
    costoTotal,
    margen,
    margenPct,
    costoPorKm: entrada.km > 0 ? costoTotal / entrada.km : 0,
    ingresoPorKm: entrada.km > 0 ? entrada.ingresos / entrada.km : 0,
    ingresoPorEnvio: entrada.envios > 0 ? entrada.ingresos / entrada.envios : 0,
    costoPorEnvio: entrada.envios > 0 ? costoTotal / entrada.envios : 0,
    diagnostico,
  };
}

/** Rendimiento real de combustible (km por unidad de combustible). */
export function rendimientoReal(km: number, galones: number): number {
  return galones > 0 ? km / galones : 0;
}

/**
 * Desviación porcentual del rendimiento real frente al esperado.
 * Positivo = mejor de lo esperado. Negativo = la unidad está gastando de más.
 */
export function desviacionRendimiento(real: number, esperado: number): number {
  return esperado > 0 ? ((real - esperado) / esperado) * 100 : 0;
}

// ─────────────────────────────────────────────────────────────
// Cumplimiento de entregas
// ─────────────────────────────────────────────────────────────
export interface MetricasEntrega {
  total: number;
  entregados: number;
  enReparto: number;
  pendientes: number;
  novedades: number;
  devueltos: number;
  cumplimiento: number;
  tasaNovedad: number;
}

export function calcularMetricasEntrega(
  filas: { estado: string; n: number }[],
): MetricasEntrega {
  const mapa = new Map(filas.map((f) => [f.estado, Number(f.n)]));
  const total = filas.reduce((s, f) => s + Number(f.n), 0);
  const entregados = mapa.get('entregado') ?? 0;
  const novedades = mapa.get('novedad') ?? 0;
  const devueltos = mapa.get('devuelto') ?? 0;

  return {
    total,
    entregados,
    enReparto: mapa.get('en_reparto') ?? 0,
    pendientes: mapa.get('pendiente') ?? 0,
    novedades,
    devueltos,
    cumplimiento: total > 0 ? (entregados / total) * 100 : 0,
    tasaNovedad: total > 0 ? ((novedades + devueltos) / total) * 100 : 0,
  };
}

/** Etiqueta de texto para el diagnóstico de rentabilidad. */
export function textoDiagnostico(d: Rentabilidad['diagnostico']): string {
  return d === 'rentable' ? 'Rentable' : d === 'ajustado' ? 'Ajustado' : 'En pérdida';
}

export function clasesDiagnostico(d: Rentabilidad['diagnostico']): string {
  return d === 'rentable'
    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
    : d === 'ajustado'
      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30'
      : 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30';
}

/** Progreso de una ruta: porcentaje de paradas ya resueltas. */
export function progresoRuta(resueltas: number, total: number): number {
  return total > 0 ? (resueltas / total) * 100 : 0;
}

/** Texto legible de progreso: "5 de 9 paradas". */
export function textoProgreso(resueltas: number, total: number): string {
  return `${numero(resueltas, 0)} de ${numero(total, 0)} paradas`;
}
