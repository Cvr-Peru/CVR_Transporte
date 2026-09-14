/**
 * Lectura de valores de un formulario.
 *
 * Estaban repetidos en cada módulo de acciones. Al unificarlos apareció un fallo
 * latente que conviene entender: `Number('')` es `0`, no `NaN`. Con la versión
 * anterior, un `<select>` sin elegir («Sin asignar») llegaba a la consulta como
 * el identificador `0` en lugar de como «ninguno», y un `INSERT` con
 * `unidad_id = 0` habría reventado contra la clave ajena. Aquí un campo vacío es
 * `null`, que es lo que significa.
 */

/** Texto recortado, o `null` si venía vacío. */
export function aTexto(valor: FormDataEntryValue | null): string | null {
  const s = typeof valor === 'string' ? valor.trim() : '';
  return s.length > 0 ? s : null;
}

/** Número, o `null` si venía vacío o no era un número. */
export function aNumero(valor: FormDataEntryValue | null): number | null {
  const s = typeof valor === 'string' ? valor.trim() : '';
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Entero dentro de un rango, con valor por defecto. */
export function aEntero(
  valor: FormDataEntryValue | null,
  porDefecto: number,
  minimo: number,
  maximo: number,
): number {
  const n = aNumero(valor);
  if (n === null) return porDefecto;
  return Math.min(maximo, Math.max(minimo, Math.round(n)));
}

/**
 * Coordenada, o `null`.
 *
 * Separada de `aNumero` por claridad de intención: si aquí se colara un `0`, una
 * foto quedaría situada en el golfo de Guinea en lugar de sin coordenadas.
 */
export function aCoordenada(valor: FormDataEntryValue | null): number | null {
  return aNumero(valor);
}

/** Marca de tiempo local en formato `YYYY-MM-DD HH:MM:SS`. */
export function ahoraTexto(d: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

/** Fecha local en formato `YYYY-MM-DD`. */
export function hoyTexto(d: Date = new Date()): string {
  return ahoraTexto(d).slice(0, 10);
}
