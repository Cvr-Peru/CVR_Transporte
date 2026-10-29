/**
 * Reglas y catálogos de los maestros: unidades, conductores y clientes.
 *
 * Lógica pura, sin base de datos, para que el formulario (que sugiere valores) y
 * la acción de servidor (que valida) usen exactamente las mismas listas.
 */
import { empresa } from '@/config/empresa';

const fmtTarifa = new Intl.NumberFormat(empresa.locale, {
  style: 'currency',
  currency: empresa.moneda,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Símbolo de la moneda de la instalación («S/»), para las etiquetas de los importes. */
export const SIMBOLO_MONEDA =
  fmtTarifa.formatToParts(0).find((p) => p.type === 'currency')?.value ?? empresa.moneda;

/** Importe con céntimos, que es como se expresan las tarifas: «S/ 2.50». */
export function tarifa(n: number): string {
  return fmtTarifa.format(n);
}

export const TIPOS_UNIDAD = ['moto', 'furgoneta', 'camion_ligero', 'camion', 'camion_pesado'] as const;
export type TipoUnidad = (typeof TIPOS_UNIDAD)[number];

/**
 * Valores típicos por tipo de unidad, para sugerir en el formulario.
 *
 * El rendimiento importa más de lo que parece: costos y rentabilidad comparan el
 * consumo real de cada unidad con este valor, y una desviación sostenida es la
 * señal de robo de combustible o de avería. Un rendimiento esperado inventado
 * dispararía alertas falsas, así que se sugiere uno razonable y se pide confirmarlo.
 */
export const REFERENCIA_UNIDAD: Record<
  TipoUnidad,
  { etiqueta: string; rendimiento: number; capacidadKg: number; capacidadM3: number }
> = {
  moto: { etiqueta: 'Moto', rendimiento: 105, capacidadKg: 60, capacidadM3: 0.2 },
  furgoneta: { etiqueta: 'Furgoneta', rendimiento: 38, capacidadKg: 750, capacidadM3: 3.5 },
  camion_ligero: { etiqueta: 'Camión ligero', rendimiento: 27, capacidadKg: 2500, capacidadM3: 14 },
  camion: { etiqueta: 'Camión', rendimiento: 18, capacidadKg: 6000, capacidadM3: 28 },
  camion_pesado: { etiqueta: 'Camión pesado', rendimiento: 12, capacidadKg: 15000, capacidadM3: 48 },
};

/**
 * Placa en su forma canónica: mayúsculas, sin espacios ni guiones («abc-123» →
 * «ABC123»), que es como se guardan. Devuelve cadena vacía si no parece una placa.
 * Comparar siempre en esta forma es lo que evita dar de alta dos veces la misma
 * unidad escrita de dos maneras.
 */
export function normalizarPlaca(valor: string): string {
  const limpia = valor.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{5,8}$/.test(limpia) ? limpia : '';
}

/** Categorías de licencia de conducir en Perú (clase A para vehículos, B para motos). */
export const CATEGORIAS_LICENCIA = [
  'A-I',
  'A-IIa',
  'A-IIb',
  'A-IIIa',
  'A-IIIb',
  'A-IIIc',
  'B-IIa',
  'B-IIb',
  'B-IIc',
] as const;

export const VINCULACIONES = ['empleado', 'contratista'] as const;
export type Vinculacion = (typeof VINCULACIONES)[number];

/**
 * Documento de identidad: DNI (8 dígitos) o carné de extranjería (hasta 12
 * caracteres). Se guarda sin espacios y en mayúsculas.
 */
export function normalizarDocumento(valor: string): string {
  const limpio = valor.toUpperCase().replace(/[\s.-]/g, '');
  return /^[0-9A-Z]{8,12}$/.test(limpio) ? limpio : '';
}

/**
 * Identificador de un registro llegado de un formulario o de la URL: entero
 * positivo, o `null`. El de la ficha que se edita viaja en un campo oculto, y un
 * campo oculto se puede cambiar como cualquier otro.
 */
export function aId(valor: unknown): number | null {
  const n = typeof valor === 'string' && /^\d{1,9}$/.test(valor.trim()) ? Number(valor) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
