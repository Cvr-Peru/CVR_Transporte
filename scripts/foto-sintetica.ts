/**
 * Fotos de prueba de entrega sintéticas para los datos de ejemplo.
 *
 * `npm run seed` las genera. No son fotografías reales, sino un dibujo pequeño
 * que evoca la escena —una puerta, una persona con un paquete— para que la ficha
 * del despacho tenga pruebas que enseñar desde el primer minuto, sin esperar a
 * que alguien reparta de verdad.
 *
 * Se codifica el PNG a mano con `node:zlib`, igual que los iconos de la
 * aplicación: el formato es sencillo (firma + IHDR + IDAT + IEND) y así el
 * generador de datos no arrastra ninguna dependencia de imágenes.
 */
import zlib from 'node:zlib';

// ─────────────────────────────────────────────────────────────
// Codificación PNG (color RGB, sin canal alfa)
// ─────────────────────────────────────────────────────────────
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) {
    c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function bloque(tipo: string, datos: Buffer): Buffer {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length, 0);
  const tipoBuf = Buffer.from(tipo, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, datos])), 0);
  return Buffer.concat([longitud, tipoBuf, datos, crc]);
}

/** Convierte un búfer RGB (8 bits por canal) en un archivo PNG. */
function codificarPng(ancho: number, alto: number, rgb: Uint8Array): Buffer {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 2; // tipo de color: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada línea lleva delante un byte de filtro (0 = sin filtro).
  const paso = ancho * 3;
  const crudo = Buffer.alloc((paso + 1) * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * (paso + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * paso, paso).copy(crudo, y * (paso + 1) + 1);
  }

  return Buffer.concat([
    firma,
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

// ─────────────────────────────────────────────────────────────
// Dibujo
// ─────────────────────────────────────────────────────────────
type Color = [number, number, number];

class Lienzo {
  private readonly w: number;
  private readonly h: number;
  private readonly d: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 3);
  }

  pixel(x: number, y: number, c: Color, alfa = 1): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.d[i] = Math.round(c[0] * alfa + this.d[i] * (1 - alfa));
    this.d[i + 1] = Math.round(c[1] * alfa + this.d[i + 1] * (1 - alfa));
    this.d[i + 2] = Math.round(c[2] * alfa + this.d[i + 2] * (1 - alfa));
  }

  rect(x: number, y: number, w: number, h: number, c: Color, alfa = 1): void {
    for (let py = Math.floor(y); py < y + h; py++) {
      for (let px = Math.floor(x); px < x + w; px++) this.pixel(px, py, c, alfa);
    }
  }

  circulo(cx: number, cy: number, radio: number, c: Color, alfa = 1): void {
    for (let py = Math.floor(cy - radio); py <= cy + radio; py++) {
      for (let px = Math.floor(cx - radio); px <= cx + radio; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if (dx * dx + dy * dy <= radio * radio) this.pixel(px, py, c, alfa);
      }
    }
  }

  /** Banda vertical con transparencia: se usa para la luz de la escena. */
  brillo(cx: number, cy: number, radio: number, c: Color, intensidad: number): void {
    for (let py = 0; py < this.h; py++) {
      for (let px = 0; px < this.w; px++) {
        const dx = (px - cx) / radio;
        const dy = (py - cy) / radio;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        this.pixel(px, py, c, intensidad * (1 - d2));
      }
    }
  }

  /**
   * Búfer RGB final, con una variación suave de la luz.
   *
   * Se usan dos ondas de baja frecuencia en lugar de ruido. Probado con ruido
   * por píxel y por bloques de 8x8: el primero dejaba el PNG sin nada que
   * comprimir (170 KB para una imagen de 320x240) y el segundo se veía como un
   * recorte de cartón ondulado. Una variación suave se aprecia igual, no ensucia
   * la imagen y el archivo se queda en unos pocos KB, cosa que importa porque
   * estas fotos se guardan en la base de datos.
   */
  conTextura(rnd: () => number): Uint8Array {
    const salida = new Uint8Array(this.d);
    const faseX = rnd() * Math.PI * 2;
    const faseY = rnd() * Math.PI * 2;

    for (let y = 0; y < this.h; y++) {
      const ondaY = Math.cos((y / this.h) * 2.4 + faseY);
      for (let x = 0; x < this.w; x++) {
        const onda = Math.sin((x / this.w) * 3.1 + faseX) * ondaY;
        const delta = onda * 9;
        const i = (y * this.w + x) * 3;
        for (let canal = 0; canal < 3; canal++) {
          salida[i + canal] = Math.max(0, Math.min(255, salida[i + canal] + delta));
        }
      }
    }

    return salida;
  }
}

// ─────────────────────────────────────────────────────────────
// Escena
// ─────────────────────────────────────────────────────────────
const ANCHO = 320;
const ALTO = 240;

/** Generador con semilla: la misma entrega produce siempre la misma foto. */
function aleatorio(semilla: number): () => number {
  let estado = semilla * 2654435761;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x100000000;
  };
}

export interface FotoSintetica {
  datos: Uint8Array;
  ancho: number;
  alto: number;
}

/**
 * Dibuja la escena: una persona con un paquete delante de una puerta.
 *
 * `semilla` varía el color de la pared, la posición de la figura y la luz, para
 * que no parezcan todas la misma foto repetida.
 */
export function fotoDePrueba(semilla: number): FotoSintetica {
  const rnd = aleatorio(semilla);
  const lienzo = new Lienzo(ANCHO, ALTO);

  // Pared, con un tono distinto en cada foto.
  const tono = 90 + Math.floor(rnd() * 70);
  const pared: Color = [tono, tono - 8, tono - 22];
  lienzo.rect(0, 0, ANCHO, ALTO, pared);

  // Suelo.
  const suelo: Color = [58, 52, 48];
  lienzo.rect(0, ALTO * 0.74, ANCHO, ALTO * 0.26, suelo);

  // Puerta a la derecha.
  const puertaX = ANCHO * (0.6 + rnd() * 0.08);
  lienzo.rect(puertaX, ALTO * 0.14, ANCHO * 0.26, ALTO * 0.62, [76, 58, 44]);
  lienzo.rect(puertaX, ALTO * 0.14, ANCHO * 0.26, ALTO * 0.02, [120, 96, 74]);
  lienzo.circulo(puertaX + ANCHO * 0.22, ALTO * 0.45, 2.6, [212, 190, 130]);

  // Persona: cabeza y torso, en silueta.
  const centroX = ANCHO * (0.3 + rnd() * 0.06);
  const cabezaY = ALTO * 0.3;
  const cabezaR = ALTO * 0.085;
  const ropa: Color = rnd() > 0.5 ? [52, 74, 104] : [96, 56, 56];

  lienzo.circulo(centroX, cabezaY, cabezaR, [196, 152, 118]);
  lienzo.circulo(centroX, cabezaY - cabezaR * 0.55, cabezaR * 0.95, [42, 34, 30]);
  lienzo.rect(centroX - cabezaR * 2.1, cabezaY + cabezaR * 0.9, cabezaR * 4.2, ALTO * 0.4, ropa);

  // Paquete sostenido delante.
  const cajaX = centroX - cabezaR * 1.5;
  const cajaY = cabezaY + cabezaR * 2.1;
  const cajaW = cabezaR * 3;
  lienzo.rect(cajaX, cajaY, cajaW, cajaW * 0.78, [186, 146, 92]);
  lienzo.rect(cajaX, cajaY, cajaW, cajaW * 0.16, [206, 168, 116]);
  lienzo.rect(cajaX + cajaW * 0.44, cajaY, cajaW * 0.12, cajaW * 0.78, [150, 116, 70]);

  // Luz de la escena, como si entrara por un lado.
  lienzo.brillo(ANCHO * 0.28, ALTO * 0.22, ALTO * 0.95, [255, 244, 214], 0.22);

  return { datos: codificarPng(ANCHO, ALTO, lienzo.conTextura(rnd)), ancho: ANCHO, alto: ALTO };
}
