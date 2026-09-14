/**
 * Comprueba que las rutas de los `import` coinciden EXACTAMENTE con el nombre
 * real del archivo en disco.
 *
 *   npm run verificar-imports
 *
 * ¿Por qué hace falta? Windows y macOS no distinguen mayúsculas en las rutas,
 * pero Linux sí. Un `import { Card } from '@/components/ui/card'` cuando el
 * archivo se llama `Card.tsx` compila sin problema en el equipo de desarrollo y
 * **rompe el build en el servidor** (Railway, Docker, CI) con un «module not
 * found» difícil de relacionar con la causa.
 *
 * Revisa tanto las rutas relativas (`./`, `../`) como las del alias `@/`, que
 * apunta a `src/`.
 *
 * Salida: 0 si todo está correcto, 1 si encuentra alguna discrepancia.
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const CARPETAS = ['src', 'scripts'];

/** Extensiones y sufijos que un empaquetador resolvería sin escribirlos. */
const SUFIJOS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function recorrer(entrada: string): string[] {
  const salida: string[] = [];
  for (const e of fs.readdirSync(entrada, { withFileTypes: true })) {
    const ruta = path.join(entrada, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      salida.push(...recorrer(ruta));
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Elimina los comentarios respetando los literales de cadena, para no confundir
 * un ejemplo escrito en un comentario con una importación real.
 */
function sinComentarios(codigo: string): string {
  let salida = '';
  let i = 0;

  while (i < codigo.length) {
    const c = codigo[i];

    if (c === '/' && codigo[i + 1] === '/') {
      while (i < codigo.length && codigo[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && codigo[i + 1] === '*') {
      i += 2;
      while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const comilla = c;
      salida += c;
      i++;
      while (i < codigo.length) {
        if (codigo[i] === '\\') {
          salida += codigo[i] + (codigo[i + 1] ?? '');
          i += 2;
          continue;
        }
        salida += codigo[i];
        if (codigo[i] === comilla) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    salida += c;
    i++;
  }

  return salida;
}

/**
 * Recorre la ruta segmento a segmento comparando con la grafía real del disco.
 * Devuelve el nombre correcto si existe con otra combinación de mayúsculas.
 */
function revisarGrafia(rutaRelativa: string): { ok: boolean; real?: string } {
  let actual = RAIZ;

  for (const segmento of rutaRelativa.split(/[\\/]/)) {
    if (segmento === '' || segmento === '.') continue;
    if (segmento === '..') {
      actual = path.dirname(actual);
      continue;
    }

    let entradas: string[];
    try {
      entradas = fs.readdirSync(actual);
    } catch {
      return { ok: false };
    }

    const exacto = entradas.find((c) => c === segmento);
    if (exacto) {
      actual = path.join(actual, exacto);
      continue;
    }

    // Existe, pero con otra grafía: este es el fallo que buscamos.
    const otraGrafia = entradas.find((c) => c.toLowerCase() === segmento.toLowerCase());
    return { ok: false, real: otraGrafia };
  }

  return { ok: true };
}

/** Resuelve un especificador probando las extensiones habituales. */
function resolver(desdeArchivo: string, especificador: string): { ok: boolean; real?: string } {
  // El alias `@/` apunta a `src/` (ver `paths` en tsconfig.json).
  const base = especificador.startsWith('@/')
    ? path.join(RAIZ, 'src', especificador.slice(2))
    : path.resolve(path.dirname(desdeArchivo), especificador);

  const relativo = path.relative(RAIZ, base);

  let ultimo: { ok: boolean; real?: string } = { ok: false };
  for (const sufijo of SUFIJOS) {
    const resultado = revisarGrafia(relativo + sufijo);
    if (resultado.ok) return resultado;
    if (resultado.real) ultimo = resultado;
  }
  return ultimo;
}

const PATRONES = [
  // Rutas relativas y del alias `@/`. Se excluyen los paquetes con ámbito de
  // npm (`@electric-sql/pglite`), que empiezan por `@` pero no son rutas.
  /\bfrom\s*['"]((?:\.{1,2}\/|@\/)[^'"]*)['"]/g,
  /\bimport\s*\(\s*['"]((?:\.{1,2}\/|@\/)[^'"]*)['"]\s*\)/g,
];

const archivos = CARPETAS.flatMap((c) =>
  fs.existsSync(path.join(RAIZ, c)) ? recorrer(path.join(RAIZ, c)) : [],
);

let revisados = 0;
const problemas: string[] = [];

for (const archivo of archivos) {
  const contenido = sinComentarios(fs.readFileSync(archivo, 'utf8'));
  const relativoArchivo = path.relative(RAIZ, archivo);

  for (const patron of PATRONES) {
    patron.lastIndex = 0;
    let coincidencia: RegExpExecArray | null;

    while ((coincidencia = patron.exec(contenido)) !== null) {
      const especificador = coincidencia[1];
      revisados++;

      const resultado = resolver(archivo, especificador);
      if (!resultado.ok) {
        problemas.push(
          resultado.real
            ? `${relativoArchivo}\n       '${especificador}'  →  debería ser  '${resultado.real}'`
            : `${relativoArchivo}\n       '${especificador}'  →  no se encontró`,
        );
      }
    }
  }
}

console.log(`\n  ${revisados} importaciones revisadas en ${archivos.length} archivos.\n`);

if (problemas.length === 0) {
  console.log('  Todas las rutas coinciden con la grafía real del disco.');
  console.log('  El proyecto compilará igual en Linux que en Windows.\n');
  process.exit(0);
}

console.log(`  ${problemas.length} problema(s) de grafía:\n`);
for (const p of problemas) console.log(`   · ${p}\n`);
console.log('  En Windows compilan, pero fallarán al desplegar en Linux.\n');
process.exit(1);
