/**
 * Qué imágenes se aceptan y cómo se sirven.
 *
 * Las fotos de entrega y el logo los sube un usuario y después los abre otro en
 * el mismo dominio de la aplicación. Si se aceptara cualquier `image/*`, un SVG
 * —que es un documento con JavaScript dentro— se ejecutaría con la sesión de
 * quien lo abre: un conductor podría subir una «foto» que, al abrirla un
 * administrador, cree otra cuenta de administración en su nombre.
 *
 * Por eso:
 *  - Solo se admiten formatos de mapa de bits que no ejecutan nada.
 *  - El formato se deduce de **los bytes**, no del tipo que declara el
 *    navegador ni de la extensión: ambos los escribe quien envía el formulario.
 *  - Al servir se vuelve a deducir de los bytes. Así también quedan neutralizadas
 *    las imágenes que se hubieran guardado antes de existir este filtro.
 */

export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp';

function empiezaCon(bytes: Uint8Array, firma: number[], desde = 0): boolean {
  if (bytes.byteLength < desde + firma.length) return false;
  return firma.every((b, i) => bytes[desde + i] === b);
}

/** Formato real de la imagen según su firma, o `null` si no es uno admitido. */
export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // RIFF....WEBP
  if (empiezaCon(bytes, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/**
 * Cabeceras para servir una imagen subida por un usuario.
 *
 * `nosniff` impide que el navegador la reinterprete como otro tipo, y la
 * política `sandbox` hace que, aunque algún día se colara un documento, se abra
 * sin poder ejecutar código ni leer la sesión.
 */
export function cabecerasImagen(tipo: TipoImagen, bytes: number): Record<string, string> {
  return {
    'Content-Type': tipo,
    'Content-Length': String(bytes),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
}
