/**
 * Números de guía.
 *
 * La guía es lo único que pide la página pública de rastreo, así que funciona
 * como una contraseña de un solo envío: quien la tiene ve el estado, el nombre
 * parcial de quien recibe, la dirección y la placa del vehículo. Por eso **no
 * puede ser correlativa**. Con `TR-20261024-00001`, `…-00002`, `…-00003` bastaba
 * con ir sumando uno para recorrer los envíos de todos los clientes del día.
 *
 * Formato: `TR-AAAAMMDD-XXXXXX`.
 *  - La fecha se conserva porque al personal le sirve para ubicar un envío de un
 *    vistazo, y no da nada que no se sepa ya.
 *  - Los seis caracteres son aleatorios, de un alfabeto sin los que se confunden
 *    al dictarlos o leerlos en una etiqueta (0/O, 1/I/L): 31⁶ ≈ 887 millones de
 *    combinaciones por día. Junto con el límite de consultas fallidas de
 *    `/rastrear`, adivinar una guía ajena deja de ser practicable.
 */
import { randomInt } from 'node:crypto';

const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LARGO = 6;

/** Azar criptográfico en [0, 1): el de la aplicación. */
export function azarSeguro(): number {
  return randomInt(0, 2 ** 32) / 2 ** 32;
}

/**
 * Compone una guía para la fecha dada (`AAAA-MM-DD`).
 *
 * El azar se recibe como parámetro para que el generador de datos de ejemplo
 * pueda usar uno con semilla y producir siempre las mismas guías. La
 * aplicación usa siempre `azarSeguro`.
 */
export function generarGuia(fechaISO: string, azar: () => number = azarSeguro): string {
  let sufijo = '';
  for (let i = 0; i < LARGO; i++) {
    sufijo += ALFABETO[Math.floor(azar() * ALFABETO.length)];
  }
  return `TR-${fechaISO.replace(/-/g, '')}-${sufijo}`;
}
