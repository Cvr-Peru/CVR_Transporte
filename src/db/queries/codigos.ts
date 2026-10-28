/**
 * Códigos internos correlativos de los maestros: `CLI-001`, `CON-014`.
 *
 * Al contrario que las guías de envío, estos códigos no se publican en ningún
 * sitio sin sesión, así que pueden ser correlativos: es lo que los hace cómodos
 * de dictar y de ordenar.
 */
import { escalar } from '@/db/client';

const PREFIJOS = { clientes: 'CLI', conductores: 'CON' } as const;
export type TablaConCodigo = keyof typeof PREFIJOS;

/**
 * Siguiente código libre. Se llama dentro de la transacción del alta, así que dos
 * altas simultáneas no pueden quedarse con el mismo número sin que una choque
 * contra el `UNIQUE` de la columna y se deshaga entera.
 */
export async function siguienteCodigo(tabla: TablaConCodigo): Promise<string> {
  const prefijo = PREFIJOS[tabla];
  // `tabla` solo puede ser una de las claves de PREFIJOS: no hay texto del usuario
  // en la consulta.
  const ultimo = await escalar<number>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM ${prefijo.length + 2}) AS INTEGER)), 0)
     FROM ${tabla}
     WHERE codigo ~ '^${prefijo}-[0-9]+$'`,
  );
  return `${prefijo}-${String(Number(ultimo ?? 0) + 1).padStart(3, '0')}`;
}
