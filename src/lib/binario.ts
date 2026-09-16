/**
 * Normalización de datos binarios que vienen de la base de datos.
 *
 * Los dos motores no devuelven un `bytea` igual: `pg` entrega un `Buffer` y
 * PGlite puede entregar la cadena hexadecimal `\x89504e47…`. Aceptar las dos
 * formas en un solo sitio evita tener que descubrir en producción que las
 * imágenes no se ven.
 */

/**
 * Convierte lo que devuelva el motor en bytes.
 *
 * Siempre devuelve un búfer propio: los `Buffer` de Node suelen ser una vista
 * sobre un bloque de memoria compartido más grande, y arrastrar ese bloque
 * entero a la respuesta enviaría bytes de más.
 */
export function aBytes(valor: unknown): Uint8Array<ArrayBuffer> {
  if (valor instanceof Uint8Array) return new Uint8Array(valor);

  if (typeof valor === 'string') {
    const hex = valor.startsWith('\\x') ? valor.slice(2) : valor;
    if (hex.length === 0 || hex.length % 2 !== 0) return new Uint8Array(0);

    const salida = new Uint8Array(hex.length / 2);
    for (let i = 0; i < salida.length; i++) {
      const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      if (!Number.isFinite(byte)) return new Uint8Array(0);
      salida[i] = byte;
    }
    return salida;
  }

  return new Uint8Array(0);
}
