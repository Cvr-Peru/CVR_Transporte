/**
 * Marca del programa, que no es la de la empresa que lo usa.
 *
 * Son dos cosas distintas y conviene no mezclarlas:
 *
 *  - **La empresa que contrata** aparece en la cabecera, en la pantalla de
 *    acceso y en la aplicación del conductor. Su nombre y su logo se configuran
 *    desde `/configuracion`, porque cada instalación es de una empresa distinta.
 *  - **El programa** aparece discreto en el pie: es de quien lo ha hecho, no de
 *    quien lo usa. Va fijo aquí porque no cambia entre instalaciones.
 */
export const producto = {
  nombre: 'CVR Express',
  lema: 'Última Milla',
  /** Cómo se nombra el programa completo, en una línea. */
  completo: 'CVR Express · Última Milla',
} as const;
