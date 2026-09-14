/**
 * Generador de iconos de la aplicación.
 *
 *   npm run iconos
 *
 * Escribe los PNG en `public/iconos/` y en `src/app/`. No usa ninguna librería:
 * dibuja en un búfer de píxeles, lo reduce con supermuestreo para suavizar los
 * bordes y lo codifica como PNG con `node:zlib` (el formato PNG es sencillo:
 * firma + IHDR + IDAT comprimido + IEND).
 *
 * Los archivos resultantes se guardan en el repositorio, así que este script
 * solo hay que ejecutarlo si se cambia el diseño del icono o la marca.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ─────────────────────────────────────────────────────────────
// Codificación PNG
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

/** Convierte un búfer RGBA (8 bits por canal) en un archivo PNG. */
function codificarPng(ancho: number, alto: number, rgba: Uint8Array): Buffer {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // tipo de color: RGBA
  ihdr[10] = 0; // compresión deflate
  ihdr[11] = 0; // método de filtro
  ihdr[12] = 0; // sin entrelazado

  // Cada línea lleva delante un byte de filtro (0 = sin filtro).
  const paso = ancho * 4;
  const crudo = Buffer.alloc((paso + 1) * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * (paso + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * paso, paso).copy(
      crudo,
      y * (paso + 1) + 1,
    );
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
type Color = [number, number, number, number];

class Lienzo {
  readonly w: number;
  readonly h: number;
  readonly d: Float64Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Float64Array(w * h * 4); // RGBA en 0-255, con decimales
  }

  pintar(x: number, y: number, c: Color): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = c[3] / 255;
    const inv = 1 - a;
    this.d[i] = c[0] * a + this.d[i] * inv;
    this.d[i + 1] = c[1] * a + this.d[i + 1] * inv;
    this.d[i + 2] = c[2] * a + this.d[i + 2] * inv;
    this.d[i + 3] = Math.min(255, c[3] + this.d[i + 3] * inv);
  }

  /** Degradado lineal de la esquina superior izquierda a la inferior derecha. */
  degradado(c1: [number, number, number], c2: [number, number, number]): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = (x / this.w + y / this.h) / 2;
        const i = (y * this.w + x) * 4;
        this.d[i] = c1[0] + (c2[0] - c1[0]) * t;
        this.d[i + 1] = c1[1] + (c2[1] - c1[1]) * t;
        this.d[i + 2] = c1[2] + (c2[2] - c1[2]) * t;
        this.d[i + 3] = 255;
      }
    }
  }

  /** Rellena un polígono por líneas de barrido. */
  poligono(pts: [number, number][], c: Color): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const desde = Math.max(0, Math.floor(minY));
    const hasta = Math.min(this.h - 1, Math.ceil(maxY));

    for (let y = desde; y <= hasta; y++) {
      const yc = y + 0.5;
      const cortes: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
          cortes.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      cortes.sort((a, b) => a - b);
      for (let i = 0; i + 1 < cortes.length; i += 2) {
        const xa = Math.max(0, Math.round(cortes[i]));
        const xb = Math.min(this.w - 1, Math.round(cortes[i + 1]) - 1);
        for (let x = xa; x <= xb; x++) this.pintar(x, y, c);
      }
    }
  }

  /** Rectángulo con esquinas redondeadas. */
  rectanguloRedondeado(
    x: number,
    y: number,
    w: number,
    h: number,
    radio: number,
    c: Color,
  ): void {
    const r = Math.min(radio, w / 2, h / 2);
    this.poligono(
      [
        [x + r, y],
        [x + w - r, y],
        [x + w, y + r],
        [x + w, y + h - r],
        [x + w - r, y + h],
        [x + r, y + h],
        [x, y + h - r],
        [x, y + r],
      ],
      c,
    );
    this.circulo(x + r, y + r, r, c);
    this.circulo(x + w - r, y + r, r, c);
    this.circulo(x + r, y + h - r, r, c);
    this.circulo(x + w - r, y + h - r, r, c);
  }

  circulo(cx: number, cy: number, radio: number, c: Color): void {
    const r2 = radio * radio;
    const desde = Math.max(0, Math.floor(cx - radio));
    const hasta = Math.min(this.w - 1, Math.ceil(cx + radio));
    const desdeY = Math.max(0, Math.floor(cy - radio));
    const hastaY = Math.min(this.h - 1, Math.ceil(cy + radio));
    for (let y = desdeY; y <= hastaY; y++) {
      for (let x = desde; x <= hasta; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.pintar(x, y, c);
      }
    }
  }

  /** Segmento grueso con extremos redondeados (trazo de la curva). */
  capsula(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radio: number,
    c: Color,
  ): void {
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radio - 1));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(x1, x2) + radio + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radio - 1));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y1, y2) + radio + 1));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const largo2 = dx * dx + dy * dy;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x1;
        const py = y + 0.5 - y1;
        let t = largo2 > 0 ? (px * dx + py * dy) / largo2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = px - dx * t;
        const ey = py - dy * t;
        if (ex * ex + ey * ey <= radio * radio) this.pintar(x, y, c);
      }
    }
  }

  /** Curva de Bézier cuadrática dibujada como sucesión de cápsulas. */
  curva(
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    radio: number,
    c: Color,
    pasos = 64,
  ): void {
    let anterior = p0;
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos;
      const u = 1 - t;
      const punto: [number, number] = [
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
      ];
      this.capsula(anterior[0], anterior[1], punto[0], punto[1], radio, c);
      anterior = punto;
    }
  }

  /** Reduce el lienzo por supermuestreo, promediando cada bloque. */
  reducir(factor: number): { ancho: number; alto: number; rgba: Uint8Array } {
    const ancho = this.w / factor;
    const alto = this.h / factor;
    const salida = new Uint8Array(ancho * alto * 4);

    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < factor; sy++) {
          for (let sx = 0; sx < factor; sx++) {
            const i = ((y * factor + sy) * this.w + (x * factor + sx)) * 4;
            r += this.d[i];
            g += this.d[i + 1];
            b += this.d[i + 2];
            a += this.d[i + 3];
          }
        }
        const n = factor * factor;
        const o = (y * ancho + x) * 4;
        salida[o] = Math.round(r / n);
        salida[o + 1] = Math.round(g / n);
        salida[o + 2] = Math.round(b / n);
        salida[o + 3] = Math.round(a / n);
      }
    }
    return { ancho, alto, rgba: salida };
  }
}

// ─────────────────────────────────────────────────────────────
// Diseño del icono
// ─────────────────────────────────────────────────────────────
const AZUL: [number, number, number] = [14, 165, 233]; // sky-500
const INDIGO: [number, number, number] = [79, 70, 229]; // indigo-600

const BLANCO: Color = [255, 255, 255, 255];
const BLANCO_MEDIO: Color = [255, 255, 255, 185];
const BLANCO_OSCURO: Color = [255, 255, 255, 125];

/**
 * Dibuja el icono: un cubo isométrico (un paquete) sobre un degradado azul.
 * `escala` controla el tamaño del cubo; se reduce para los iconos "maskable",
 * que deben caber dentro de la zona segura porque el sistema recorta los bordes.
 */
function dibujarIcono(
  tamano: number,
  opciones: { escala: number; esquinaRedondeada: boolean },
): { ancho: number; alto: number; rgba: Uint8Array } {
  const SS = 4; // supermuestreo
  const S = tamano * SS;
  const lienzo = new Lienzo(S, S);

  const radio = opciones.esquinaRedondeada ? S * 0.225 : 0;
  lienzo.rectanguloRedondeado(0, 0, S, S, radio, [0, 0, 0, 255]);
  lienzo.degradado(AZUL, INDIGO);

  if (radio > 0) {
    // Recorta las esquinas para que queden transparentes.
    const recorte = new Lienzo(S, S);
    recorte.rectanguloRedondeado(0, 0, S, S, radio, BLANCO);
    for (let i = 0; i < lienzo.d.length; i += 4) {
      const alfaBorde = recorte.d[i + 3] / 255;
      lienzo.d[i + 3] = 255 * alfaBorde;
    }
  }

  // Geometría del cubo isométrico
  const cx = S / 2;
  const cy = S / 2;
  const r = S * opciones.escala;
  const k = 0.866; // cos(30°)

  const arriba: [number, number] = [cx, cy - r];
  const arribaDer: [number, number] = [cx + r * k, cy - r * 0.5];
  const derecha: [number, number] = [cx + r * k, cy + r * 0.5];
  const abajo: [number, number] = [cx, cy + r];
  const izquierda: [number, number] = [cx - r * k, cy + r * 0.5];
  const arribaIzq: [number, number] = [cx - r * k, cy - r * 0.5];
  const centro: [number, number] = [cx, cy];

  // Tres caras con distinta luminosidad para dar volumen
  lienzo.poligono([arribaIzq, centro, abajo, izquierda], BLANCO_OSCURO);
  lienzo.poligono([arribaDer, derecha, abajo, centro], BLANCO_MEDIO);
  lienzo.poligono([arriba, arribaDer, centro, arribaIzq], BLANCO);

  return lienzo.reducir(SS);
}

// ─────────────────────────────────────────────────────────────
// Escritura de los archivos
// ─────────────────────────────────────────────────────────────
const RAIZ = process.cwd();
const DIR_PUBLICO = path.join(RAIZ, 'public', 'iconos');
const DIR_APP = path.join(RAIZ, 'src', 'app');

fs.mkdirSync(DIR_PUBLICO, { recursive: true });

interface Salida {
  ruta: string;
  tamano: number;
  escala: number;
  redondeado: boolean;
  descripcion: string;
}

const SALIDAS: Salida[] = [
  { ruta: path.join(DIR_PUBLICO, 'icono-192.png'), tamano: 192, escala: 0.3, redondeado: true, descripcion: 'Icono estándar 192' },
  { ruta: path.join(DIR_PUBLICO, 'icono-512.png'), tamano: 512, escala: 0.3, redondeado: true, descripcion: 'Icono estándar 512' },
  { ruta: path.join(DIR_PUBLICO, 'icono-maskable-512.png'), tamano: 512, escala: 0.225, redondeado: false, descripcion: 'Icono maskable (zona segura)' },
  // Apple aplica su propia máscara: conviene un cuadrado a sangre.
  { ruta: path.join(DIR_PUBLICO, 'apple-touch-icon.png'), tamano: 180, escala: 0.28, redondeado: false, descripcion: 'Icono para iOS' },
  // Next.js genera el <link rel="icon"> a partir de estos dos.
  { ruta: path.join(DIR_APP, 'icon.png'), tamano: 128, escala: 0.3, redondeado: true, descripcion: 'Favicon' },
  { ruta: path.join(DIR_APP, 'apple-icon.png'), tamano: 180, escala: 0.28, redondeado: false, descripcion: 'Icono de inicio en iOS' },
];

console.log('\n  Generando iconos…\n');

for (const salida of SALIDAS) {
  const { ancho, alto, rgba } = dibujarIcono(salida.tamano, {
    escala: salida.escala,
    esquinaRedondeada: salida.redondeado,
  });
  const png = codificarPng(ancho, alto, rgba);
  fs.mkdirSync(path.dirname(salida.ruta), { recursive: true });
  fs.writeFileSync(salida.ruta, png);
  const relativa = path.relative(RAIZ, salida.ruta);
  console.log(
    `   ${relativa.padEnd(42)} ${String(ancho).padStart(4)}x${alto}  ${(png.length / 1024).toFixed(1)} KB  ${salida.descripcion}`,
  );
}

console.log('');
