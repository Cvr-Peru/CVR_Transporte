import { empresa } from '@/config/empresa';

/**
 * Utilidades de formato.
 *
 * Regla importante: las fechas se guardan como TEXT ('YYYY-MM-DD' o
 * 'YYYY-MM-DD HH:MM:SS') SIN zona horaria. Por eso NUNCA se usa
 * `new Date(cadena)` directamente: JavaScript lo interpretaría como UTC y en
 * Colombia (UTC-5) mostraría el día anterior. Se parsea a mano.
 */

/** Convierte 'YYYY-MM-DD[ HH:MM:SS]' a un Date en hora LOCAL. */
export function parseFecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const [fecha, hora] = valor.split(' ');
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh = 0, mm = 0, ss = 0] = (hora ?? '').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

/** Fecha de hoy en formato ISO corto, en hora local. */
export function hoyISO(): string {
  return aISO(new Date());
}

/** Convierte un Date a 'YYYY-MM-DD' en hora local. */
export function aISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/** Convierte un Date a 'YYYY-MM-DD HH:MM:SS' en hora local. */
export function aISOCompleto(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${aISO(d)} ${hh}:${mm}:${ss}`;
}

/** Suma (o resta) días a un Date sin mutarlo. */
export function sumarDias(d: Date, dias: number): Date {
  const copia = new Date(d.getTime());
  copia.setDate(copia.getDate() + dias);
  return copia;
}

/** Días completos desde hoy hasta la fecha dada. Negativo = ya pasó. */
export function diasHasta(valor: string | null | undefined): number | null {
  const objetivo = parseFecha(valor);
  if (!objetivo) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  objetivo.setHours(0, 0, 0, 0);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}

const fmtMoneda = new Intl.NumberFormat(empresa.locale, {
  style: 'currency',
  currency: empresa.moneda,
  maximumFractionDigits: 0,
});

const fmtNumero = new Intl.NumberFormat(empresa.locale, { maximumFractionDigits: 2 });
const fmtNumeroEntero = new Intl.NumberFormat(empresa.locale, { maximumFractionDigits: 0 });

export function moneda(n: number | null | undefined): string {
  return fmtMoneda.format(Number(n ?? 0));
}

/** Versión compacta para KPIs: $1,2 M */
export function monedaCorta(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${fmtNumero.format(v / 1_000_000_000)} MM`;
  if (abs >= 1_000_000) return `$${fmtNumero.format(v / 1_000_000)} M`;
  if (abs >= 1_000) return `$${fmtNumeroEntero.format(v / 1_000)} K`;
  return `$${fmtNumeroEntero.format(v)}`;
}

export function numero(n: number | null | undefined, decimales = 2): string {
  return new Intl.NumberFormat(empresa.locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number(n ?? 0));
}

export function entero(n: number | null | undefined): string {
  return fmtNumeroEntero.format(Number(n ?? 0));
}

export function porcentaje(n: number | null | undefined, decimales = 1): string {
  return `${numero(n, decimales)}%`;
}

export function fecha(valor: string | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat(empresa.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function fechaCorta(valor: string | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat(empresa.locale, { day: '2-digit', month: 'short' }).format(d);
}

export function fechaHora(valor: string | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat(empresa.locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function hora(valor: string | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  return new Intl.DateTimeFormat(empresa.locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** "hace 3 min", "hace 2 h" — para telemetría GPS. */
export function haceCuanto(valor: string | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  const segundos = Math.floor((Date.now() - d.getTime()) / 1000);
  if (segundos < 60) return 'hace instantes';
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86_400) return `hace ${Math.floor(segundos / 3600)} h`;
  return `hace ${Math.floor(segundos / 86_400)} d`;
}

const ETIQUETAS: Record<string, string> = {
  // unidades
  moto: 'Moto',
  furgoneta: 'Furgoneta',
  camion_ligero: 'Camión ligero',
  camion: 'Camión',
  camion_pesado: 'Camión pesado',
  // estados de unidad
  disponible: 'Disponible',
  en_ruta: 'En ruta',
  mantenimiento: 'En mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  // estados de ruta
  planificado: 'Planificado',
  en_curso: 'En curso',
  completado: 'Completado',
  cancelado: 'Cancelado',
  // estados de envío
  pendiente: 'Pendiente',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  novedad: 'Con novedad',
  devuelto: 'Devuelto',
  // documentos
  soat: 'SOAT',
  revision_tecnica: 'Revisión técnico-mecánica',
  seguro_todo_riesgo: 'Seguro todo riesgo',
  tarjeta_propiedad: 'Tarjeta de propiedad',
  permiso_transito: 'Permiso de tránsito',
  // mantenimiento
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  programado: 'Programado',
  en_taller: 'En taller',
  // vinculación
  empleado: 'Empleado',
  contratista: 'Contratista',
  activo: 'Activo',
  inactivo: 'Inactivo',
  vacaciones: 'Vacaciones',
  incapacidad: 'Incapacidad',
  // gastos
  peaje: 'Peaje',
  parqueadero: 'Parqueadero',
  viatico: 'Viáticos',
  lavado: 'Lavado',
  multa: 'Multa',
  otro: 'Otro',
  // facturas / liquidaciones
  borrador: 'Borrador',
  emitida: 'Emitida',
  pagada: 'Pagada',
  vencida: 'Vencida',
  anulada: 'Anulada',
  aprobada: 'Aprobada',
  // novedades
  ausente: 'Destinatario ausente',
  direccion_errada: 'Dirección errada',
  rechazado: 'Rechazado',
  danado: 'Paquete dañado',
  reprogramado: 'Reprogramado',
  // paradas
  en_camino: 'En camino',
  fallido: 'Fallido',
};

/** Traduce un valor técnico a una etiqueta legible en español. */
export function etiqueta(valor: string | null | undefined): string {
  if (!valor) return '—';
  return ETIQUETAS[valor] ?? valor.replace(/_/g, ' ');
}

/** Convierte 'EN_RUTA' / 'en_ruta' a un nombre de clase CSS estable. */
export function slug(valor: string): string {
  return valor.toLowerCase().replace(/_/g, '-');
}

export function plural(n: number, singular: string, plural_: string): string {
  return `${entero(n)} ${n === 1 ? singular : plural_}`;
}
