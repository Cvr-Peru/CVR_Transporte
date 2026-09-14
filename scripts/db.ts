/**
 * Consulta rápida a la base de datos.
 *
 *   npm run db -- "SELECT * FROM unidades LIMIT 5"
 *   npm run db -- "SELECT COUNT(*) AS n FROM envios" --json
 *
 * Es una herramienta de **solo lectura**: la consulta se ejecuta dentro de una
 * transacción que siempre se revierte, así que un `DELETE` o un `UPDATE`
 * escritos por error no cambian nada.
 *
 * Funciona contra el mismo motor que la aplicación: PostgreSQL si existe
 * `DATABASE_URL`, y PGlite en local si no.
 */
import { all, descripcionMotor, ejecutarScript } from '../src/db/client.ts';

const args = process.argv.slice(2);
const comoJson = args.includes('--json');
const sql = args.filter((a) => a !== '--json').join(' ').trim();

if (!sql) {
  console.error('Uso: npm run db -- "<consulta SQL>" [--json]');
  process.exit(1);
}

/** Sin `$1` no hay parámetros que enlazar, que es el caso de esta herramienta. */
async function principal() {
  // En modo JSON solo se emite el JSON, para que la salida se pueda procesar
  // desde otro programa (por ejemplo tuberías o scripts de verificación).
  if (!comoJson) console.log(`  Motor: ${descripcionMotor()}\n`);

  await ejecutarScript('BEGIN');
  try {
    const filas = (await all(sql)) as Record<string, unknown>[];

    if (comoJson || filas.length === 0) {
      console.log(JSON.stringify(filas, null, 2));
      return;
    }

    const columnas = Object.keys(filas[0]);
    const anchos = columnas.map((c) =>
      Math.max(c.length, ...filas.map((f) => (f[c] === null ? 4 : String(f[c]).length))),
    );

    const linea = (vals: unknown[]) =>
      vals.map((v, i) => String(v).padEnd(anchos[i])).join('  ');

    console.log(linea(columnas));
    console.log(anchos.map((a) => '─'.repeat(a)).join('──'));
    for (const fila of filas.slice(0, 200)) {
      console.log(linea(columnas.map((c) => (fila[c] === null ? 'NULL' : fila[c]))));
    }
    if (filas.length > 200) console.log(`… ${filas.length - 200} filas más`);
    console.log(`\n${filas.length} fila(s).`);
  } finally {
    // Siempre se revierte: esta herramienta nunca modifica datos.
    await ejecutarScript('ROLLBACK');
  }
}

try {
  await principal();
} catch (error) {
  console.error(`Error en la consulta: ${(error as Error).message}`);
  process.exit(1);
}

process.exit(0);
