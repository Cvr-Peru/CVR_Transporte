/**
 * Consultas de la cartera de clientes.
 *
 * Hasta ahora los clientes solo existían como los sembraba el generador de datos:
 * no había pantalla para verlos ni para dar de alta uno. En una instalación real,
 * sin clientes no se puede registrar ni un pedido.
 */
import { all, escalar, get } from '@/db/client';
import type { Cliente } from '@/db/tipos';

export interface ClienteResumen extends Cliente {
  /** Envíos registrados en los últimos 30 días. */
  envios_30d: number;
  /** Lo facturado y todavía no cobrado (emitidas y vencidas). */
  saldo_pendiente: number;
}

export async function listarClientes(desde30d: string): Promise<ClienteResumen[]> {
  const filas = await all<ClienteResumen>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM envios e
              WHERE e.cliente_id = c.id AND e.created_at >= $1) AS envios_30d,
            COALESCE((SELECT SUM(f.total) FROM facturas f
              WHERE f.cliente_id = c.id AND f.estado IN ('emitida','vencida')), 0) AS saldo_pendiente
     FROM clientes c
     ORDER BY c.activo DESC, c.nombre`,
    desde30d,
  );
  // COUNT y SUM llegan como texto desde `pg` (bigint/numeric): se normalizan aquí.
  return filas.map((f) => ({
    ...f,
    envios_30d: Number(f.envios_30d),
    saldo_pendiente: Number(f.saldo_pendiente),
  }));
}

/**
 * ¿Hay ya otro cliente con ese identificador fiscal? Se ignoran guiones y espacios.
 * Al editar se pasa el propio cliente en `excluirId`: conservar su RUC no es un duplicado.
 */
export async function existeIdFiscal(idFiscal: string, excluirId: number | null = null): Promise<boolean> {
  const n = await escalar<number>(
    `SELECT COUNT(*) FROM clientes
     WHERE REPLACE(REPLACE(id_fiscal, '-', ''), ' ', '') = $1 AND id <> $2`,
    idFiscal.replace(/[-\s]/g, ''),
    excluirId ?? 0,
  );
  return Number(n ?? 0) > 0;
}

/** Ficha de un cliente para editarla. */
export async function obtenerCliente(id: number): Promise<Cliente | null> {
  return get<Cliente>('SELECT * FROM clientes WHERE id = $1', id);
}
