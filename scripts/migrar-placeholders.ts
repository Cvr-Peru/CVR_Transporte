/**
 * Convierte los marcadores de parámetros de SQL de `?` a `$1, $2, …`.
 *
 *   node scripts/migrar-placeholders.ts <archivo> [<archivo> …]
 *   node scripts/migrar-placeholders.ts src/db/queries/*.ts
 *
 * Es parte de la migración de SQLite a PostgreSQL. Recorre el archivo
 * distinguiendo los literales de cadena (comillas simples, dobles y
 * plantillas) del código, y solo sustituye dentro de los literales que
 * contienen SQL. Los `${…}` de las plantillas se respetan: son interpolaciones
 * de JavaScript, no parámetros de consulta.
 *
 * Es idempotente: si ya hay `$n` y ningún `?`, no cambia nada.
 */
import fs from 'node:fs';
import path from 'node:path';

const PALABRAS_SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;

interface Literal {
  inicio: number;
  fin: number;
  contenido: string;
  comilla: string;
}

/** Extrae los literales de cadena de un archivo, con sus posiciones. */
function extraerLiterales(codigo: string): Literal[] {
  const literales: Literal[] = [];
  let i = 0;

  while (i < codigo.length) {
    const c = codigo[i];

    // Comentarios de línea
    if (c === '/' && codigo[i + 1] === '/') {
      while (i < codigo.length && codigo[i] !== '\n') i++;
      continue;
    }
    // Comentarios de bloque
    if (c === '/' && codigo[i + 1] === '*') {
      i += 2;
      while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      const comilla = c;
      const inicio = i;
      i++;
      let contenido = '';
      while (i < codigo.length) {
        if (codigo[i] === '\\') {
          contenido += codigo[i] + (codigo[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (codigo[i] === comilla) break;
        contenido += codigo[i];
        i++;
      }
      literales.push({ inicio, fin: i + 1, contenido, comilla });
      i++;
      continue;
    }

    i++;
  }

  return literales;
}

/** Cuenta los `?` de un literal ignorando los `${…}` de las plantillas. */
function convertirPlaceholders(contenido: string): { texto: string; cambios: number } {
  let salida = '';
  let n = 0;
  let i = 0;

  while (i < contenido.length) {
    // Se salta las interpolaciones ${...} sin tocarlas.
    if (contenido[i] === '$' && contenido[i + 1] === '{') {
      let profundidad = 1;
      salida += '${';
      i += 2;
      while (i < contenido.length && profundidad > 0) {
        if (contenido[i] === '{') profundidad++;
        else if (contenido[i] === '}') profundidad--;
        if (profundidad > 0) salida += contenido[i];
        i++;
      }
      salida += '}';
      continue;
    }

    if (contenido[i] === '?') {
      n++;
      salida += `$${n}`;
      i++;
      continue;
    }

    salida += contenido[i];
    i++;
  }

  return { texto: salida, cambios: n };
}

/** Recorre un directorio y devuelve los archivos .ts y .tsx. */
function recorrer(entrada: string): string[] {
  const stats = fs.statSync(entrada);
  if (stats.isFile()) return [entrada];

  const salida: string[] = [];
  for (const hijo of fs.readdirSync(entrada, { withFileTypes: true })) {
    const ruta = path.join(entrada, hijo.name);
    if (hijo.isDirectory()) {
      if (hijo.name === 'node_modules' || hijo.name.startsWith('.')) continue;
      salida.push(...recorrer(ruta));
    } else if (/\.tsx?$/.test(hijo.name) && !hijo.name.endsWith('.d.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

const entradas = process.argv.slice(2);

if (entradas.length === 0) {
  console.error('Uso: node scripts/migrar-placeholders.ts <archivo|directorio> […]');
  process.exit(1);
}

const archivos = entradas.flatMap((e) => (fs.existsSync(e) ? recorrer(e) : []));

let totalArchivos = 0;
let totalCambios = 0;

for (const ruta of archivos) {
  const original = fs.readFileSync(ruta, 'utf8');
  const literales = extraerLiterales(original);
  let resultado = '';
  let cursor = 0;
  let cambiosArchivo = 0;

  for (const lit of literales) {
    resultado += original.slice(cursor, lit.inicio);

    // Solo se tocan los literales que contienen una sentencia SQL.
    const esSql = PALABRAS_SQL.test(lit.contenido) && lit.contenido.includes('?');

    if (esSql) {
      const { texto, cambios } = convertirPlaceholders(lit.contenido);
      cambiosArchivo += cambios;
      resultado += lit.comilla + texto + lit.comilla;
    } else {
      resultado += original.slice(lit.inicio, lit.fin);
    }

    cursor = lit.fin;
  }

  resultado += original.slice(cursor);

  if (cambiosArchivo > 0) {
    fs.writeFileSync(ruta, resultado);
    totalArchivos++;
    totalCambios += cambiosArchivo;
    console.log(`  ${path.basename(ruta).padEnd(24)} ${String(cambiosArchivo).padStart(4)} marcadores convertidos`);
  } else {
    console.log(`  ${path.basename(ruta).padEnd(24)} sin cambios`);
  }
}

console.log(`\n  ${totalCambios} marcadores en ${totalArchivos} archivos.\n`);
