/**
 * Comprueba que los colores de los dos temas se leen bien.
 *
 *   npm run verificar-contraste
 *
 * Un cambio de tema se puede romper de una forma que no salta a la vista hasta
 * que alguien se queja: un texto que queda casi del mismo color que su fondo.
 * Esta comprobación lee los colores **del propio `globals.css`** —no de una copia,
 * para que no puedan desincronizarse— y calcula el contraste de las
 * combinaciones que la aplicación usa de verdad: tarjetas, insignias de estado,
 * botones sólidos, avisos y el mapa.
 *
 * El umbral es el de las pautas de accesibilidad (WCAG): 4,5:1 para texto normal
 * y 3:1 para texto grande o elementos no textuales. Las insignias son de 11 px,
 * así que se les exige el primero.
 */
import fs from 'node:fs';
import path from 'node:path';

const RUTA_CSS = path.join(process.cwd(), 'src', 'app', 'globals.css');
const css = fs.readFileSync(RUTA_CSS, 'utf8');

/** Lee las variables de un bloque de la hoja de estilos. */
function leerBloque(selector: string): Record<string, string> {
  const inicio = css.indexOf(`${selector} {`);
  if (inicio < 0) throw new Error(`No se encontró el bloque «${selector}» en globals.css`);

  const desde = css.indexOf('{', inicio);
  const hasta = css.indexOf('\n}', desde);
  const cuerpo = css.slice(desde + 1, hasta);

  const salida: Record<string, string> = {};
  for (const linea of cuerpo.split('\n')) {
    const encontrado = linea.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (encontrado) salida[encontrado[1]] = encontrado[2].trim();
  }
  return salida;
}

/**
 * Colores que la aplicación usa y que no se declaran por tema, porque son
 * iguales en los dos: los tonos 500 de los acentos, que son tintes y bordes. Se
 * copian aquí tal cual están en la paleta de Tailwind.
 *
 * Los tonos que sí se declaran en `globals.css` —incluidos los 600, que son
 * fondos de botón— se leen de allí: esta lista solo cubre lo que no está.
 */
const FIJOS: Record<string, string> = {
  white: '#ffffff',
  'sky-500': '#0ea5e9',
  'emerald-500': '#10b981',
  'amber-500': '#f59e0b',
  'rose-500': '#f43f5e',
  'violet-500': '#8b5cf6',
  'indigo-600': '#4f46e5',
  'yellow-500': '#eab308',
  'orange-500': '#f97316',
};

interface Tema {
  nombre: string;
  variables: Record<string, string>;
}

const TEMAS: Tema[] = [
  { nombre: 'claro', variables: leerBloque(':root') },
  { nombre: 'oscuro', variables: leerBloque('.dark') },
];

/** Color hexadecimal de un nombre tipo `slate-950` o `sky-300`. */
function color(tema: Tema, nombre: string): string {
  if (nombre === 'white') return '#ffffff';

  const [familia, tono] = nombre.split('-');

  if (familia === 'slate') {
    const valor = tema.variables[`--s${tono}`];
    if (!valor) throw new Error(`Falta --s${tono} en el tema ${tema.nombre}`);
    return valor;
  }

  // Lo declarado en la hoja manda; la lista fija es solo para lo que no está.
  const declarado = tema.variables[`--${familia}${tono}`];
  if (declarado) return declarado;

  if (FIJOS[nombre]) return FIJOS[nombre];
  throw new Error(`No sé el color de «${nombre}» en el tema ${tema.nombre}`);
}

// ─────────────────────────────────────────────────────────────
// Cálculo de contraste (WCAG)
// ─────────────────────────────────────────────────────────────
function aRgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '');
  const completo =
    limpio.length === 3
      ? limpio
          .split('')
          .map((c) => c + c)
          .join('')
      : limpio;

  return [
    Number.parseInt(completo.slice(0, 2), 16),
    Number.parseInt(completo.slice(2, 4), 16),
    Number.parseInt(completo.slice(4, 6), 16),
  ];
}

/** Superpone un color con transparencia sobre otro. */
function mezclar(encima: string, alfa: number, debajo: string): string {
  const [r1, g1, b1] = aRgb(encima);
  const [r2, g2, b2] = aRgb(debajo);

  const canal = (a: number, b: number) => Math.round(a * alfa + b * (1 - alfa));
  const hex = (n: number) => n.toString(16).padStart(2, '0');

  return `#${hex(canal(r1, r2))}${hex(canal(g1, g2))}${hex(canal(b1, b2))}`;
}

function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

// ─────────────────────────────────────────────────────────────
// Combinaciones que la aplicación usa de verdad
// ─────────────────────────────────────────────────────────────
interface Caso {
  descripcion: string;
  fondo: string;
  /** Capa tenue encima del fondo, si la hay (`bg-X-500/10`). */
  tinte?: { color: string; alfa: number };
  texto: string;
  minimo: number;
}

const CASOS: Caso[] = [
  // Texto sobre las dos superficies base
  { descripcion: 'Página · texto principal', fondo: 'slate-950', texto: 'slate-200', minimo: 4.5 },
  { descripcion: 'Página · texto secundario', fondo: 'slate-950', texto: 'slate-400', minimo: 4.5 },
  { descripcion: 'Tarjeta · texto principal', fondo: 'slate-900', texto: 'slate-200', minimo: 4.5 },
  { descripcion: 'Tarjeta · texto secundario', fondo: 'slate-900', texto: 'slate-400', minimo: 4.5 },
  { descripcion: 'Tarjeta · texto tenue', fondo: 'slate-900', texto: 'slate-500', minimo: 3 },
  { descripcion: 'Tarjeta · cifra destacada', fondo: 'slate-900', texto: 'slate-50', minimo: 4.5 },

  // Insignias de estado: texto de acento sobre su propio tinte
  {
    descripcion: 'Insignia información',
    fondo: 'slate-900',
    tinte: { color: 'sky-500', alfa: 0.15 },
    texto: 'sky-300',
    minimo: 4.5,
  },
  {
    descripcion: 'Insignia éxito',
    fondo: 'slate-900',
    tinte: { color: 'emerald-500', alfa: 0.15 },
    texto: 'emerald-300',
    minimo: 4.5,
  },
  {
    descripcion: 'Insignia aviso',
    fondo: 'slate-900',
    tinte: { color: 'amber-500', alfa: 0.15 },
    texto: 'amber-300',
    minimo: 4.5,
  },
  {
    descripcion: 'Insignia peligro',
    fondo: 'slate-900',
    tinte: { color: 'rose-500', alfa: 0.15 },
    texto: 'rose-300',
    minimo: 4.5,
  },
  {
    descripcion: 'Insignia violeta',
    fondo: 'slate-900',
    tinte: { color: 'violet-500', alfa: 0.15 },
    texto: 'violet-300',
    minimo: 4.5,
  },
  {
    descripcion: 'Insignia neutra',
    fondo: 'slate-900',
    tinte: { color: 'slate-700', alfa: 0.4 },
    texto: 'slate-300',
    minimo: 4.5,
  },

  // Avisos grandes: fondo tenue y texto del tono 200
  {
    descripcion: 'Aviso de error',
    fondo: 'slate-950',
    tinte: { color: 'rose-500', alfa: 0.1 },
    texto: 'rose-200',
    minimo: 4.5,
  },
  {
    descripcion: 'Aviso correcto',
    fondo: 'slate-950',
    tinte: { color: 'emerald-500', alfa: 0.1 },
    texto: 'emerald-200',
    minimo: 4.5,
  },
  {
    descripcion: 'Aviso de atención',
    fondo: 'slate-950',
    tinte: { color: 'amber-500', alfa: 0.1 },
    texto: 'amber-200',
    minimo: 4.5,
  },

  // Botones sólidos con texto blanco
  { descripcion: 'Botón principal', fondo: 'sky-600', texto: 'white', minimo: 4.5 },
  { descripcion: 'Botón de entregar', fondo: 'emerald-600', texto: 'white', minimo: 4.5 },
  { descripcion: 'Botón de novedad', fondo: 'amber-600', texto: 'white', minimo: 4.5 },

  // El mapa esquemático
  { descripcion: 'Mapa · etiqueta', fondo: 'mapa-fondo', texto: 'mapa-texto', minimo: 4.5 },
  { descripcion: 'Mapa · etiqueta tenue', fondo: 'mapa-fondo', texto: 'mapa-texto-tenue', minimo: 4.5 },
];

function colorDe(tema: Tema, nombre: string): string {
  if (nombre.startsWith('mapa-')) {
    const valor = tema.variables[`--${nombre}`];
    if (!valor) throw new Error(`Falta --${nombre} en el tema ${tema.nombre}`);
    return valor;
  }
  return color(tema, nombre);
}

// ─────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────
let correctas = 0;
let flojas = 0;

for (const tema of TEMAS) {
  console.log(`\n  ── Tema ${tema.nombre} ──\n`);

  for (const caso of CASOS) {
    const base = colorDe(tema, caso.fondo);
    const fondo = caso.tinte
      ? mezclar(colorDe(tema, caso.tinte.color), caso.tinte.alfa, base)
      : base;
    const texto = colorDe(tema, caso.texto);
    const ratio = contraste(fondo, texto);

    const bien = ratio >= caso.minimo;
    if (bien) correctas++;
    else flojas++;

    console.log(
      `  ${bien ? 'OK   ' : 'FLOJO'} ${caso.descripcion.padEnd(26)} ${ratio.toFixed(2)}:1` +
        `  (mínimo ${caso.minimo}:1)  ${texto} sobre ${fondo}`,
    );
  }
}

console.log('');
if (flojas > 0) {
  console.log(`  ${correctas} combinaciones correctas, ${flojas} con contraste insuficiente.`);
  console.log('  Ajusta los tonos en globals.css o cambia la clase en el componente.\n');
  process.exit(1);
}

console.log(`  Las ${correctas} combinaciones superan el contraste mínimo en los dos temas.\n`);
