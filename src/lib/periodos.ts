/**
 * Cálculo de períodos (día, semana, mes, últimos N días).
 * Todo se maneja como cadenas 'YYYY-MM-DD' porque así se guardan en SQLite y
 * comparan correctamente con BETWEEN.
 */
import { aISO, sumarDias } from './format';

export interface Rango {
  desde: string;
  hasta: string;
}

export function rangoDia(ref: Date = new Date()): Rango {
  const d = aISO(ref);
  return { desde: d, hasta: d };
}

export function rangoSemana(ref: Date = new Date()): Rango {
  // Semana ISO: lunes a domingo
  const dia = ref.getDay();
  const offsetLunes = dia === 0 ? -6 : 1 - dia;
  const lunes = sumarDias(ref, offsetLunes);
  return { desde: aISO(lunes), hasta: aISO(sumarDias(lunes, 6)) };
}

export function rangoMes(ref: Date = new Date()): Rango {
  const primero = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { desde: aISO(primero), hasta: aISO(ultimo) };
}

export function rangoMesAnterior(ref: Date = new Date()): Rango {
  return rangoMes(new Date(ref.getFullYear(), ref.getMonth() - 1, 1));
}

export function rangoUltimosDias(n: number, ref: Date = new Date()): Rango {
  return { desde: aISO(sumarDias(ref, -(n - 1))), hasta: aISO(ref) };
}

const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const fmtMesCorto = new Intl.DateTimeFormat('es-CO', { month: 'short' });

export function nombreMes(ref: Date = new Date()): string {
  const s = fmtMes.format(ref);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function nombreMesCorto(ref: Date): string {
  const s = fmtMesCorto.format(ref).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lista de meses hacia atrás: [{ valor: '2026-02', etiqueta: 'Febrero 2026' }] */
export function listaMeses(n: number, ref: Date = new Date()) {
  const out: { valor: string; etiqueta: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push({
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: nombreMes(d),
    });
  }
  return out;
}

/** Etiqueta corta para un día concreto: 'lun 3'. */
export function etiquetaDia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' }).format(fecha);
}
