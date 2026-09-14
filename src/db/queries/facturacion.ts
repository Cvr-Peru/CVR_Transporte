/**
 * Consultas del módulo de facturación y cartera.
 *
 * Criterios contables usados en todo el módulo:
 *  - «Facturado» son las facturas emitidas, vencidas o pagadas (se excluyen los
 *    borradores, que aún no son exigibles, y las anuladas).
 *  - «Cobrado» es lo que ya está en estado `pagada`.
 *  - «Por cobrar» es facturado menos cobrado, es decir, lo que sigue en
 *    `emitida` o `vencida`.
 *  - «Vencido» es la parte de lo pendiente cuya fecha de vencimiento ya pasó.
 *
 * Los cortes de fecha se calculan en JavaScript (`hoyISO()` / `sumarDias()`)
 * porque `date('now')` de SQLite trabaja en UTC y en Colombia (UTC-5) desplaza
 * un día los vencimientos.
 */
import { all, escalar, get } from '@/db/client';
import type { Factura, FacturaItem } from '@/db/tipos';
import { hoyISO } from '@/lib/format';

/** Estados posibles de una factura, derivados del tipo base de la tabla. */
export type EstadoFactura = Factura['estado'];

// ─────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────
export interface FiltrosFacturas {
  /** Estado exacto; `'todas'` (o sin definir) no filtra. */
  estado?: EstadoFactura | 'todas';
  clienteId?: number;
  /** Mes en formato `'YYYY-MM'` sobre la fecha de emisión. */
  mes?: string;
  /** Texto libre: número de factura o nombre del cliente. */
  busqueda?: string;
  limite?: number;
}

/** Estados de una factura que representan dinero pendiente de cobro. */
const ESTADOS_PENDIENTES = "('emitida','vencida')";

/**
 * Días de mora transcurridos desde el vencimiento hasta hoy (0 si no ha vencido).
 *
 * Las fechas son TEXT con formato `'YYYY-MM-DD'`, así que se convierten a `date`:
 * en PostgreSQL la resta de dos fechas ya devuelve un entero de días y no hace
 * falta ningún `CAST`. El marcador `$1` es el corte de vencimiento, que en las
 * tres consultas que interpolan este fragmento viaja siempre como primer
 * parámetro (en `facturasEnMora` el segundo parámetro es el filtro de
 * vencimiento y va como `$2`).
 */
const DIAS_MORA_SQL = '($1::date - f.fecha_vencimiento::date)';

/**
 * WHERE compartido por el listado, los indicadores y el ranking.
 *
 * `inicio` es el número del primer marcador libre: lo indican las consultas que
 * ya consumen marcadores antes del WHERE (el corte de vencimiento en `$1`, o el
 * rango de fechas en `$1`/`$2`), de modo que cada `$n` corresponda al parámetro
 * que realmente ocupa esa posición.
 */
function whereFacturas(f: FiltrosFacturas, inicio = 1): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  /** Número del siguiente marcador libre. */
  const marca = () => `$${inicio + params.length}`;

  if (f.estado && f.estado !== 'todas') {
    condiciones.push(`f.estado = ${marca()}`);
    params.push(f.estado);
  }
  if (f.clienteId) {
    condiciones.push(`f.cliente_id = ${marca()}`);
    params.push(f.clienteId);
  }
  if (f.mes) {
    // Las fechas son TEXT `'YYYY-MM-DD'`: los 7 primeros caracteres son `'YYYY-MM'`.
    condiciones.push(`substr(f.fecha_emision, 1, 7) = ${marca()}`);
    params.push(f.mes);
  }
  if (f.busqueda) {
    // Dos marcadores: se calculan juntos porque se consumen antes de empujarlos.
    const primero = inicio + params.length;
    condiciones.push(`(f.numero LIKE $${primero} OR cl.nombre LIKE $${primero + 1})`);
    const like = `%${f.busqueda}%`;
    params.push(like, like);
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

/** Filtros del período para los indicadores: sin el estado, que se desglosa aparte. */
function wherePeriodo(f: FiltrosFacturas): { sql: string; params: unknown[] } {
  return whereFacturas({ clienteId: f.clienteId, mes: f.mes, busqueda: f.busqueda });
}

// ─────────────────────────────────────────────────────────────
// Listado y detalle
// ─────────────────────────────────────────────────────────────
/** Factura con el contexto del cliente y los días de mora ya calculados. */
export interface FacturaResumen extends Factura {
  cliente: string;
  cliente_codigo: string;
  cliente_id_fiscal: string | null;
  cliente_contacto: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  /** Días transcurridos desde el vencimiento; 0 si todavía no vence. */
  dias_mora: number;
}

const SELECT_FACTURA = `
  SELECT f.*,
         cl.nombre    AS cliente,
         cl.codigo    AS cliente_codigo,
         cl.id_fiscal AS cliente_id_fiscal,
         cl.contacto  AS cliente_contacto,
         cl.telefono  AS cliente_telefono,
         cl.email     AS cliente_email,
         GREATEST(0, ${DIAS_MORA_SQL}) AS dias_mora
  FROM facturas f
  JOIN clientes cl ON cl.id = f.cliente_id
`;

/**
 * Facturas del módulo, de la más reciente a la más antigua.
 * `corteVencimiento` es la fecha con la que se miden los días de mora (hoy).
 * El `LIMIT` se interpola porque es un número ya validado; el resto de valores
 * viajan como parámetros `$1, $2, …`. El corte ocupa `$1` (lo consume
 * `SELECT_FACTURA`) y los filtros empiezan en `$2`.
 */
export async function listarFacturas(
  filtros: FiltrosFacturas = {},
  corteVencimiento: string = hoyISO(),
): Promise<FacturaResumen[]> {
  const { sql, params } = whereFacturas(filtros, 2);
  const limite = Math.max(1, Math.trunc(filtros.limite ?? 500));
  return all<FacturaResumen>(
    `${SELECT_FACTURA} ${sql} ORDER BY f.fecha_emision DESC, f.id DESC LIMIT ${limite}`,
    corteVencimiento,
    ...params,
  );
}

/** Una factura con los datos de su cliente, o `null` si no existe. */
export async function obtenerFactura(
  id: number,
  corteVencimiento: string = hoyISO(),
): Promise<FacturaResumen | null> {
  if (!Number.isFinite(id)) return null;
  // El corte de mora lo consume `$1` dentro de `SELECT_FACTURA`; el id va en `$2`.
  return get<FacturaResumen>(`${SELECT_FACTURA} WHERE f.id = $2`, corteVencimiento, id);
}

/** Ítem de factura con el número de guía del envío facturado, si lo tiene. */
export interface ItemFacturaDetalle extends FacturaItem {
  guia: string | null;
}

export async function itemsDeFactura(facturaId: number): Promise<ItemFacturaDetalle[]> {
  return all<ItemFacturaDetalle>(
    `SELECT i.*, e.guia AS guia
     FROM factura_items i
     LEFT JOIN envios e ON e.id = i.envio_id
     WHERE i.factura_id = $1
     ORDER BY i.id`,
    facturaId,
  );
}

// ─────────────────────────────────────────────────────────────
// Indicadores de cartera
// ─────────────────────────────────────────────────────────────
export interface GrupoEstadoFactura {
  estado: string;
  n: number;
  total: number;
}

export interface ResumenFacturacion {
  /** Suma de conceptos de las facturas emitidas, vencidas y pagadas (sin IVA). */
  subtotalFacturado: number;
  impuestoFacturado: number;
  /** Valor facturado, impuestos incluidos. */
  totalFacturado: number;
  totalCobrado: number;
  porCobrar: number;
  vencido: number;
  /** Número de facturas pendientes de cobro. */
  facturasPendientes: number;
  /** Número de facturas ya vencidas y no pagadas. */
  facturasVencidas: number;
  porEstado: GrupoEstadoFactura[];
}

/**
 * Indicadores de cartera del período filtrado.
 * `corteVencimiento` es la fecha contra la que se decide si una factura venció.
 */
export async function resumenFacturacion(
  filtros: FiltrosFacturas,
  corteVencimiento: string,
): Promise<ResumenFacturacion> {
  const { sql, params } = wherePeriodo(filtros);
  const porEstado = (
    await all<GrupoEstadoFactura>(
      `SELECT f.estado AS estado, COUNT(*) AS n, COALESCE(SUM(f.total), 0) AS total
       FROM facturas f
       JOIN clientes cl ON cl.id = f.cliente_id
       ${sql}
       GROUP BY f.estado`,
      ...params,
    )
  ).map((f) => ({ estado: f.estado, n: Number(f.n), total: Number(f.total) }));

  const totalDe = (estado: string) => porEstado.find((e) => e.estado === estado)?.total ?? 0;
  const nDe = (estado: string) => porEstado.find((e) => e.estado === estado)?.n ?? 0;

  // En las consultas de vencido el corte viaja después de los filtros, así que su
  // marcador depende de cuántos parámetros haya aportado el WHERE.
  const marcaCorte = `$${params.length + 1}`;

  const subtotalFacturado = Number(
    (await escalar<number>(
      `SELECT COALESCE(SUM(f.subtotal), 0)
       FROM facturas f JOIN clientes cl ON cl.id = f.cliente_id
       ${sql} ${sql ? 'AND' : 'WHERE'} f.estado IN ('emitida','vencida','pagada')`,
      ...params,
    )) ?? 0,
  );
  const impuestoFacturado = Number(
    (await escalar<number>(
      `SELECT COALESCE(SUM(f.impuesto), 0)
       FROM facturas f JOIN clientes cl ON cl.id = f.cliente_id
       ${sql} ${sql ? 'AND' : 'WHERE'} f.estado IN ('emitida','vencida','pagada')`,
      ...params,
    )) ?? 0,
  );

  const porCobrar = totalDe('emitida') + totalDe('vencida');
  const totalFacturado = subtotalFacturado + impuestoFacturado;
  const totalCobrado = totalDe('pagada');

  const vencido = Number(
    (await escalar<number>(
      `SELECT COALESCE(SUM(f.total), 0)
       FROM facturas f JOIN clientes cl ON cl.id = f.cliente_id
       ${sql} ${sql ? 'AND' : 'WHERE'} f.estado IN ('emitida','vencida')
         AND f.fecha_vencimiento < ${marcaCorte}`,
      ...params,
      corteVencimiento,
    )) ?? 0,
  );
  const facturasVencidas = Number(
    (await escalar<number>(
      `SELECT COUNT(*)
       FROM facturas f JOIN clientes cl ON cl.id = f.cliente_id
       ${sql} ${sql ? 'AND' : 'WHERE'} f.estado IN ('emitida','vencida')
         AND f.fecha_vencimiento < ${marcaCorte}`,
      ...params,
      corteVencimiento,
    )) ?? 0,
  );

  return {
    subtotalFacturado,
    impuestoFacturado,
    totalFacturado,
    totalCobrado,
    porCobrar,
    vencido,
    facturasPendientes: nDe('emitida') + nDe('vencida'),
    facturasVencidas,
    porEstado,
  };
}

// ─────────────────────────────────────────────────────────────
// Antigüedad de cartera (aging)
// ─────────────────────────────────────────────────────────────
export interface TramoAging {
  clave: string;
  etiqueta: string;
  n: number;
  monto: number;
}

/** Tramos de antigüedad sobre las facturas pendientes de cobro. */
export const TRAMOS_AGING: { clave: string; etiqueta: string }[] = [
  { clave: 'por_vencer', etiqueta: 'Por vencer' },
  { clave: 'd1_30', etiqueta: '1 a 30 días' },
  { clave: 'd31_60', etiqueta: '31 a 60 días' },
  { clave: 'd61_90', etiqueta: '61 a 90 días' },
  { clave: 'mas_90', etiqueta: 'Más de 90 días' },
];

/**
 * Antigüedad de la cartera pendiente, agrupada en tramos.
 * Se calcula siempre sobre todas las facturas pendientes (no sobre el filtro de
 * la pantalla): el aging es una foto de la cartera, no del listado.
 */
export async function agingCartera(corteVencimiento: string): Promise<TramoAging[]> {
  const filas = await all<{ tramo: string; n: number; monto: number }>(
    `WITH pendientes AS (
       SELECT f.total AS total,
              ($1::date - f.fecha_vencimiento::date) AS mora
       FROM facturas f
       WHERE f.estado IN ${ESTADOS_PENDIENTES}
     )
     SELECT CASE
              WHEN mora <= 0  THEN 'por_vencer'
              WHEN mora <= 30 THEN 'd1_30'
              WHEN mora <= 60 THEN 'd31_60'
              WHEN mora <= 90 THEN 'd61_90'
              ELSE 'mas_90'
            END AS tramo,
            COUNT(*) AS n,
            COALESCE(SUM(total), 0) AS monto
     FROM pendientes
     GROUP BY tramo`,
    corteVencimiento,
  );

  const porClave = new Map(filas.map((f) => [f.tramo, f]));
  return TRAMOS_AGING.map((t) => {
    const fila = porClave.get(t.clave);
    return {
      clave: t.clave,
      etiqueta: t.etiqueta,
      n: Number(fila?.n ?? 0),
      monto: Number(fila?.monto ?? 0),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Gestión de cobro
// ─────────────────────────────────────────────────────────────
/** Factura vencida con los datos de contacto necesarios para cobrar. */
export type FacturaEnMora = FacturaResumen;

/**
 * Facturas ya vencidas y sin pagar, con la mora más alta primero.
 * Es la bandeja con la que trabaja a diario el área administrativa.
 */
export async function facturasEnMora(
  corteVencimiento: string,
  limite = 100,
): Promise<FacturaEnMora[]> {
  const tope = Math.max(1, Math.trunc(limite));
  // `$1` es el corte de mora (dentro de `SELECT_FACTURA`); el mismo corte acota
  // los vencimientos en `$2`.
  return all<FacturaEnMora>(
    `${SELECT_FACTURA}
     WHERE f.estado IN ${ESTADOS_PENDIENTES} AND f.fecha_vencimiento < $2
     ORDER BY dias_mora DESC, f.total DESC
     LIMIT ${tope}`,
    corteVencimiento,
    corteVencimiento,
  );
}

// ─────────────────────────────────────────────────────────────
// Concentración por cliente
// ─────────────────────────────────────────────────────────────
export interface ConcentracionCliente {
  cliente_id: number;
  cliente: string;
  n: number;
  facturado: number;
  pendiente: number;
}

/**
 * Clientes que más facturan en el período, con lo que todavía tienen pendiente
 * de pago. El filtro de estado se ignora a propósito: el ranking mide el peso de
 * cada cliente en la facturación, no el estado de una factura concreta.
 */
export async function concentracionPorCliente(
  filtros: FiltrosFacturas = {},
  limite = 8,
): Promise<ConcentracionCliente[]> {
  const { sql, params } = wherePeriodo(filtros);
  const tope = Math.max(1, Math.trunc(limite));
  return all<ConcentracionCliente>(
    `SELECT cl.id   AS cliente_id,
            cl.nombre AS cliente,
            COUNT(f.id) AS n,
            COALESCE(SUM(CASE WHEN f.estado IN ('emitida','vencida','pagada') THEN f.total ELSE 0 END), 0) AS facturado,
            COALESCE(SUM(CASE WHEN f.estado IN ${ESTADOS_PENDIENTES} THEN f.total ELSE 0 END), 0) AS pendiente
     FROM facturas f
     JOIN clientes cl ON cl.id = f.cliente_id
     ${sql}
     GROUP BY cl.id, cl.nombre
     HAVING COALESCE(SUM(CASE WHEN f.estado IN ('emitida','vencida','pagada') THEN f.total ELSE 0 END), 0) > 0
     ORDER BY facturado DESC
     LIMIT ${tope}`,
    ...params,
  );
}

// ─────────────────────────────────────────────────────────────
// Catálogos para los filtros
// ─────────────────────────────────────────────────────────────
/** Clientes que tienen al menos una factura, para poblar el `<select>`. */
export async function clientesConFacturas(): Promise<{ id: number; nombre: string }[]> {
  return all<{ id: number; nombre: string }>(
    `SELECT DISTINCT cl.id AS id, cl.nombre AS nombre
     FROM facturas f
     JOIN clientes cl ON cl.id = f.cliente_id
     ORDER BY cl.nombre`,
  );
}
