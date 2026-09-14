/**
 * Consultas del buzón de pedidos.
 *
 * Un «pedido» es un envío que **todavía no está en ninguna ruta**. Esa es toda la
 * diferencia con la tabla `envios` vista desde despachos: aquí interesa lo que
 * está por planificar, y la situación se deduce de si tiene ruta asignada o no.
 */
import { all, escalar, get } from '@/db/client';
import type { Envio } from '@/db/tipos';

/** En qué punto del camino está un pedido. */
export type SituacionPedido = 'sin_asignar' | 'en_ruta' | 'resuelto';

export interface PedidoResumen extends Envio {
  cliente: string;
  ruta_codigo: string | null;
  conductor: string | null;
  situacion: SituacionPedido;
}

export interface FiltrosPedidos {
  situacion?: SituacionPedido | 'todos';
  zona?: string;
  clienteId?: number;
  busqueda?: string;
  limite?: number;
}

/**
 * Situación calculada a partir del estado y de si tiene ruta.
 *
 * Se deriva en el SELECT en lugar de guardarse en una columna: un pedido no
 * «pasa a estar asignado», es que tiene ruta o no la tiene. Guardarlo aparte
 * sería un dato más que se puede quedar desincronizado.
 */
const SITUACION = `
  CASE
    WHEN e.ruta_id IS NULL THEN 'sin_asignar'
    WHEN e.estado IN ('entregado','novedad','devuelto') THEN 'resuelto'
    ELSE 'en_ruta'
  END`;

const SELECT_PEDIDO = `
  SELECT e.*,
    cl.nombre AS cliente,
    r.codigo  AS ruta_codigo,
    co.nombre AS conductor,
    ${SITUACION} AS situacion
  FROM envios e
  JOIN clientes cl         ON cl.id = e.cliente_id
  LEFT JOIN rutas r        ON r.id = e.ruta_id
  LEFT JOIN conductores co ON co.id = r.conductor_id
`;

function wherePedidos(f: FiltrosPedidos): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (f.situacion === 'sin_asignar') {
    condiciones.push('e.ruta_id IS NULL');
  } else if (f.situacion === 'en_ruta') {
    condiciones.push("e.ruta_id IS NOT NULL AND e.estado NOT IN ('entregado','novedad','devuelto')");
  } else if (f.situacion === 'resuelto') {
    condiciones.push("e.estado IN ('entregado','novedad','devuelto')");
  }

  if (f.zona) {
    params.push(f.zona);
    condiciones.push(`e.zona = $${params.length}`);
  }

  if (f.clienteId) {
    params.push(f.clienteId);
    condiciones.push(`e.cliente_id = $${params.length}`);
  }

  if (f.busqueda) {
    const like = `%${f.busqueda}%`;
    params.push(like, like, like, like);
    const n = params.length - 3;
    condiciones.push(
      `(e.guia LIKE $${n} OR e.destinatario LIKE $${n + 1} OR e.direccion LIKE $${n + 2} OR e.destinatario_tel LIKE $${n + 3})`,
    );
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

export async function listarPedidos(filtros: FiltrosPedidos = {}): Promise<PedidoResumen[]> {
  const { sql, params } = wherePedidos(filtros);
  const limite = filtros.limite ?? 300;

  return all<PedidoResumen>(
    `${SELECT_PEDIDO} ${sql} ORDER BY e.created_at DESC, e.id DESC LIMIT ${limite}`,
    ...params,
  );
}

export async function contarPedidosPorSituacion(
  filtros: FiltrosPedidos = {},
): Promise<Record<string, number>> {
  const { sql, params } = wherePedidos({ ...filtros, situacion: 'todos' });
  const filas = await all<{ situacion: string; n: number }>(
    `SELECT ${SITUACION} AS situacion, COUNT(*) AS n
     FROM envios e ${sql} GROUP BY ${SITUACION}`,
    ...params,
  );
  return Object.fromEntries(filas.map((f) => [f.situacion, Number(f.n)]));
}

export async function obtenerPedido(id: number): Promise<PedidoResumen | null> {
  return get<PedidoResumen>(`${SELECT_PEDIDO} WHERE e.id = $1`, id);
}

/** Pedidos que siguen sin ruta, para asignarlos a un despacho. */
export async function pedidosSinAsignar(limite = 200): Promise<PedidoResumen[]> {
  return listarPedidos({ situacion: 'sin_asignar', limite });
}

/** Clientes que pueden tener pedidos, con su tarifa para calcular el flete. */
export async function clientesParaPedidos(): Promise<
  { id: number; nombre: string; tarifa_base: number; tarifa_kg: number }[]
> {
  return all<{ id: number; nombre: string; tarifa_base: number; tarifa_kg: number }>(
    'SELECT id, nombre, tarifa_base, tarifa_kg FROM clientes ORDER BY nombre',
  );
}

/**
 * Siguiente número de guía del día.
 *
 * El contador sale del mayor que haya con ese prefijo, así que las guías de un
 * mismo día quedan correlativas y legibles. Se calcula una vez y se incrementa en
 * memoria al crear un lote: consultar por cada pedido sería absurdo.
 */
export async function siguienteNumeroDeGuia(prefijo: string): Promise<number> {
  const fila = await get<{ ultima: string | null }>(
    'SELECT MAX(guia) AS ultima FROM envios WHERE guia LIKE $1',
    `${prefijo}%`,
  );

  const ultimo = fila?.ultima ? Number.parseInt(fila.ultima.slice(prefijo.length), 10) : 0;
  return (Number.isFinite(ultimo) ? ultimo : 0) + 1;
}

/** Totales para la cabecera del buzón. */
export async function resumenBuzon(): Promise<{
  sinAsignar: number;
  enRuta: number;
  porCobrar: number;
}> {
  const sinAsignar = (await contarPedidosPorSituacion({ situacion: 'sin_asignar' })).sin_asignar ?? 0;
  const enRuta = (await contarPedidosPorSituacion({ situacion: 'en_ruta' })).en_ruta ?? 0;
  const porCobrar =
    (await escalar<number>(
      `SELECT COALESCE(SUM(cobro_entrega), 0) FROM envios
       WHERE cobro_entrega > 0 AND estado NOT IN ('entregado','devuelto')`,
    )) ?? 0;

  return { sinAsignar, enRuta, porCobrar };
}
