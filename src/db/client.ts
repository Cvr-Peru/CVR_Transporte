import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
// Extensión explícita: este módulo también lo carga Node directamente desde
// `scripts/seed.ts`, sin pasar por el empaquetador.
import { SCHEMA_SQL } from './schema.ts';

/**
 * Acceso a la base de datos (PostgreSQL).
 *
 * Un solo dialecto SQL y dos motores posibles:
 *
 *   - **`pg`** contra un PostgreSQL real, cuando existe `DATABASE_URL`.
 *     Es lo que se usa en producción (Railway).
 *   - **PGlite** (PostgreSQL compilado a WebAssembly) cuando no hay
 *     `DATABASE_URL`. Permite desarrollar y probar en local sin instalar ni
 *     arrancar ningún servidor, hablando el mismo dialecto.
 *
 * La API es **asíncrona** porque PostgreSQL es un servicio aparte: `all`, `get`,
 * `escalar`, `run` y `transaccion` devuelven promesas. Todos los llamadores
 * deben usar `await`.
 *
 * Detalles que importan:
 *  - Los marcadores son `$1, $2, …`, no `?`.
 *  - Para obtener el identificador de una fila insertada hay que añadir
 *    `RETURNING id` al INSERT; `run()` lo devuelve en `id`.
 *  - PostgreSQL exige que toda columna del SELECT esté en el GROUP BY (o
 *    agregada). Es más estricto que SQLite y conviene tenerlo presente.
 *  - `ROUND(x, n)` solo existe para NUMERIC. Con DOUBLE PRECISION hay que
 *    convertir: `ROUND((x)::numeric, n)`.
 *  - `MAX(a, b)` no existe; se usa `GREATEST(a, b)`.
 */

export type ValorSql = string | number | boolean | null | Uint8Array;

export interface ResultadoRun {
  changes: number;
  /** Valor de `id` si la sentencia incluye `RETURNING id`. */
  id: number | null;
}

interface Motor {
  readonly tipo: 'postgres' | 'pglite';
  consultar<T>(sql: string, params: ValorSql[]): Promise<T[]>;
  ejecutar(
    sql: string,
    params: ValorSql[],
  ): Promise<{ changes: number; filas: Record<string, unknown>[] }>;
  exec(sql: string): Promise<void>;
  transaccion<T>(fn: () => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
}

/** Ruta del archivo de PGlite cuando se usa el motor local. */
export const DIR_PGLITE =
  process.env.PGLITE_DIR ?? path.join(process.cwd(), 'data', 'pgdata');

/** Descripción legible del motor en uso, para diagnóstico. */
export function descripcionMotor(): string {
  return process.env.DATABASE_URL
    ? 'PostgreSQL (DATABASE_URL)'
    : `PGlite local (${DIR_PGLITE})`;
}

// ─────────────────────────────────────────────────────────────
// Normalización de valores
// ─────────────────────────────────────────────────────────────
function normalizar(valor: unknown): ValorSql {
  if (valor === undefined || valor === null) return null;
  // El esquema guarda los booleanos como INTEGER 0/1.
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  if (valor instanceof Date) return valor.toISOString();
  return valor as ValorSql;
}

function normalizarParams(params: unknown[]): ValorSql[] {
  return params.map(normalizar);
}

// ─────────────────────────────────────────────────────────────
// Motores
// ─────────────────────────────────────────────────────────────
/**
 * Decide si la conexión debe usar TLS.
 *
 * No basta con activarlo siempre: la red **interna** de Railway, un PostgreSQL
 * en `localhost` o el nombre de un servicio de Docker Compose NO hablan TLS, y
 * forzarlo hace que el servidor rechace la conexión. Y tampoco vale
 * desactivarlo siempre, porque los proveedores gestionados (Neon, Supabase,
 * Render…) sí lo exigen.
 *
 * Criterio: manda lo que diga la propia cadena de conexión; si no dice nada, se
 * activa TLS salvo que el host sea claramente interno o local.
 */
function configuracionSsl(url: string): false | { rejectUnauthorized: boolean } {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=(require|verify-ca|verify-full)/i.test(url)) {
    // Muchos proveedores usan certificados que Node no puede verificar contra su
    // almacén de confianza; se cifra igualmente la conexión.
    return { rejectUnauthorized: false };
  }

  const host = url.match(/@\[?([^\]/:@]+)\]?/)?.[1] ?? '';

  // Local, red interna o nombre de servicio de contenedor.
  if (/^(localhost|127\.0\.0\.1|::1|host\.docker\.internal)$/i.test(host)) return false;
  if (host.toLowerCase().endsWith('.internal')) return false;
  // Un nombre sin puntos es un nombre de servicio (Docker Compose, Kubernetes),
  // no un dominio público: esos nunca llevan TLS.
  if (host !== '' && !host.includes('.')) return false;

  return { rejectUnauthorized: false };
}

async function crearMotorPostgres(url: string): Promise<Motor> {
  // Se importa dinámicamente para no cargar el controlador en el motor local.
  const pg = await import('pg');

  // Por defecto node-postgres devuelve BIGINT y NUMERIC como texto, para no
  // perder precisión. Aquí se convierten a número para que la aplicación reciba
  // siempre los mismos tipos, independientemente del motor.
  pg.types.setTypeParser(20, (v: string) => Number(v)); // int8 / bigint
  pg.types.setTypeParser(1700, (v: string) => Number(v)); // numeric

  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    ssl: configuracionSsl(url),
  });

  // Falla pronto si la cadena de conexión es incorrecta.
  const prueba = await pool.connect();
  prueba.release();

  return {
    tipo: 'postgres',

    async consultar<T>(sql: string, params: ValorSql[]) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },

    async ejecutar(sql: string, params: ValorSql[]) {
      const res = await pool.query(sql, params);
      return { changes: res.rowCount ?? 0, filas: res.rows };
    },

    async exec(sql: string) {
      await pool.query(sql);
    },

    async transaccion<T>(fn: () => Promise<T>) {
      // Una transacción necesita recorrer SIEMPRE la misma conexión, así que se
      // reserva una y las consultas de dentro se enrutan a ella mediante
      // AsyncLocalStorage (ver `motorActual`).
      const cliente = await pool.connect();
      const motorTx: Motor = {
        tipo: 'postgres',
        async consultar<T2>(sql: string, params: ValorSql[]) {
          const res = await cliente.query(sql, params);
          return res.rows as T2[];
        },
        async ejecutar(sql: string, params: ValorSql[]) {
          const res = await cliente.query(sql, params);
          return { changes: res.rowCount ?? 0, filas: res.rows };
        },
        async exec(sql: string) {
          await cliente.query(sql);
        },
        async transaccion<T2>(fnInterna: () => Promise<T2>) {
          // Transacciones anidadas: se reutiliza la que ya está abierta.
          return fnInterna();
        },
        async cerrar() {
          /* la libera el bloque exterior */
        },
      };

      try {
        await cliente.query('BEGIN');
        const resultado = await almacenTx.run(motorTx, fn);
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    },

    async cerrar() {
      await pool.end();
    },
  };
}

async function crearMotorPglite(dir: string): Promise<Motor> {
  // PGlite es una dependencia de desarrollo: solo se instala en local. En
  // producción debe existir DATABASE_URL, así que si falta damos un mensaje
  // que explique qué hacer en lugar de un error de módulo no encontrado.
  const modulo = await import('@electric-sql/pglite').catch(() => null);
  if (!modulo) {
    throw new Error(
      'No hay DATABASE_URL definida y PGlite (la base de datos local) no está instalado.\n' +
        'Define DATABASE_URL para conectarte a un PostgreSQL, o instala también las ' +
        'dependencias de desarrollo con `npm install` (sin --omit=dev) para trabajar en local.',
    );
  }

  fs.mkdirSync(dir, { recursive: true });

  // PGlite no admite dos procesos sobre el mismo directorio. Si el servidor
  // quedó arrancado —o murió de golpe y dejó un `postmaster.pid` huérfano— el
  // arranque aborta con un error del motor poco descriptivo. Se traduce a algo
  // accionable.
  const db = await (async () => {
    try {
      const instancia = new modulo.PGlite(dir);
      await instancia.waitReady;
      return instancia;
    } catch (error) {
      throw new Error(
        `No se pudo abrir la base de datos local en ${dir}.\n` +
          'PGlite no admite dos procesos a la vez: si tienes el servidor arrancado, páralo ' +
          'antes de usar `npm run seed` o `npm run db`. Si el proceso murió de golpe, dejó un ' +
          'archivo postmaster.pid que impide reabrir la base.\n' +
          'Solución: borra la carpeta data/pgdata y ejecuta `npm run seed`.\n' +
          'Con PostgreSQL real (DATABASE_URL) esta limitación no existe.\n' +
          `Causa original: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();

  return {
    tipo: 'pglite',

    async consultar<T>(sql: string, params: ValorSql[]) {
      const res = await db.query<T>(sql, params);
      return res.rows;
    },

    async ejecutar(sql: string, params: ValorSql[]) {
      const res = await db.query(sql, params);
      return {
        changes: res.affectedRows ?? 0,
        filas: res.rows as Record<string, unknown>[],
      };
    },

    async exec(sql: string) {
      await db.exec(sql);
    },

    async transaccion<T>(fn: () => Promise<T>) {
      // PGlite es un único proceso en memoria: BEGIN/COMMIT afecta a todas las
      // consultas, así que no hace falta enrutar nada.
      await db.exec('BEGIN');
      try {
        const resultado = await fn();
        await db.exec('COMMIT');
        return resultado;
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    },

    async cerrar() {
      await db.close();
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Motor único (singleton)
// ─────────────────────────────────────────────────────────────
type GlobalConMotor = typeof globalThis & {
  __transporteMotor?: Promise<Motor>;
};

const almacenTx = new AsyncLocalStorage<Motor>();

async function motorBase(): Promise<Motor> {
  const g = globalThis as GlobalConMotor;

  if (!g.__transporteMotor) {
    g.__transporteMotor = (async () => {
      const url = process.env.DATABASE_URL;
      const motor = url
        ? await crearMotorPostgres(url)
        : await crearMotorPglite(DIR_PGLITE);

      // El esquema se crea si no existe. Es idempotente (IF NOT EXISTS) y
      // suficiente para este prototipo; un sistema en producción con cambios
      // frecuentes de esquema debería usar migraciones versionadas.
      await motor.exec(SCHEMA_SQL);
      return motor;
    })().catch((error) => {
      // Si falla la conexión no se cachea el fallo, para permitir reintentar.
      g.__transporteMotor = undefined;
      throw error;
    });
  }

  return g.__transporteMotor;
}

/** Devuelve el motor de la transacción abierta o, si no hay, el global. */
async function motorActual(): Promise<Motor> {
  return almacenTx.getStore() ?? motorBase();
}

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────
/** Ejecuta un SELECT y devuelve todas las filas. */
export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  return (await motorActual()).consultar<T>(sql, normalizarParams(params));
}

/** Ejecuta un SELECT y devuelve la primera fila, o null. */
export async function get<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const filas = await all<T>(sql, ...params);
  return filas[0] ?? null;
}

/** Ejecuta un SELECT que devuelve un único valor escalar. */
export async function escalar<T = number>(
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const fila = await get<Record<string, T>>(sql, ...params);
  if (!fila) return null;
  const valores = Object.values(fila);
  return valores.length > 0 ? valores[0] : null;
}

/**
 * Ejecuta un INSERT/UPDATE/DELETE.
 * Para conocer el identificador insertado, la sentencia debe terminar en
 * `RETURNING id`.
 */
export async function run(
  sql: string,
  ...params: unknown[]
): Promise<ResultadoRun> {
  const { changes, filas } = await (await motorActual()).ejecutar(
    sql,
    normalizarParams(params),
  );
  const primero = filas[0];
  const id = primero && typeof primero.id === 'number' ? primero.id : null;
  return { changes, id };
}

/** Ejecuta varias sentencias dentro de una transacción. */
export async function transaccion<T>(fn: () => Promise<T>): Promise<T> {
  return (await motorActual()).transaccion(fn);
}

/** Comprueba que la base de datos responde. Útil para el punto de salud. */
export async function comprobarConexion(): Promise<boolean> {
  const fila = await escalar<number>('SELECT 1 AS ok');
  return Number(fila) === 1;
}

/**
 * Ejecuta un script SQL con varias sentencias.
 * Se usa en los scripts (regenerar datos), no en el servidor.
 */
export async function ejecutarScript(sql: string): Promise<void> {
  await (await motorActual()).exec(sql);
}

/** Cierra el motor. Solo se usa en scripts, no en el servidor. */
export async function cerrarMotor(): Promise<void> {
  const g = globalThis as GlobalConMotor;
  if (g.__transporteMotor) {
    const motor = await g.__transporteMotor;
    await motor.cerrar();
    g.__transporteMotor = undefined;
  }
}
