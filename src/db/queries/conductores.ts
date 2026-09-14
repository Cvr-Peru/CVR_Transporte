/**
 * Consultas del módulo de conductores (plantilla de reparto) y de liquidaciones
 * (pago al conductor).
 *
 * Criterios que se repiten en todo el archivo:
 *  - Los cortes de fecha se calculan en JavaScript con `hoyISO()` / `sumarDias()`
 *    y se pasan como parámetro. Nunca se usa `date('now')` de SQLite, que trabaja
 *    en UTC y desplazaría un día en Colombia.
 *  - Los valores van siempre como parámetros `$1, $2, …`; lo único que se
 *    interpola son los `LIMIT`, ya validados como número entero.
 *  - El desempeño se calcula sobre rutas no canceladas, para no castigar al
 *    conductor con rutas que nunca salieron a reparto.
 *  - El desempeño se resuelve con subconsultas correlacionadas y no con JOIN +
 *    GROUP BY: al combinar rutas y envíos en un mismo JOIN las filas se
 *    multiplican y los conteos saldrían inflados.
 */
import { all, escalar, get } from '@/db/client';
import type { Conductor, Liquidacion } from '@/db/tipos';
import { umbrales } from '@/config/empresa';
import { aISO, hoyISO, sumarDias } from '@/lib/format';
import { rangoMes, type Rango } from '@/lib/periodos';

// ─────────────────────────────────────────────────────────────
// Conductores: listado con desempeño del período
// ─────────────────────────────────────────────────────────────
export interface FiltrosConductores {
  tipoVinculacion?: 'empleado' | 'contratista' | 'todas';
  estado?: Conductor['estado'] | 'todos';
  /** Texto libre: nombre, documento o código. */
  busqueda?: string;
  limite?: number;
}

export type Vinculacion = Conductor['tipo_vinculacion'];

/** Fila de la tabla de conductores: datos base + desempeño del período. */
export interface ConductorDesempeno extends Conductor {
  /** Rutas asignadas (no canceladas) en el período. */
  rutas: number;
  /** Rutas que llegaron a completarse. */
  rutas_completadas: number;
  /** Envíos asociados a esas rutas. */
  envios: number;
  /** Envíos entregados. */
  entregados: number;
  /** Envíos con novedad o devueltos. */
  novedades: number;
  /** Ingresos por flete de los envíos entregados. */
  ingresos: number;
  /** Entregados / envíos × 100. */
  cumplimiento: number;
}

export interface KpisConductores {
  total: number;
  activos: number;
  contratistas: number;
  empleados: number;
  /** Licencia vencida o que vence dentro del umbral preventivo. */
  licenciasAlerta: number;
  /** Subconjunto ya vencido: no pueden operar. */
  licenciasVencidas: number;
}

/** Conteos de la plantilla. Se resuelven con una sola pasada sobre la tabla. */
export async function kpisConductores(diasVentana = umbrales.preventivo): Promise<KpisConductores> {
  const corte = aISO(sumarDias(new Date(), diasVentana));
  const fila = await get<{
    total: number;
    activos: number;
    contratistas: number;
    empleados: number;
    alerta: number;
    vencidas: number;
  }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END), 0) AS activos,
            COALESCE(SUM(CASE WHEN tipo_vinculacion = 'contratista' THEN 1 ELSE 0 END), 0) AS contratistas,
            COALESCE(SUM(CASE WHEN tipo_vinculacion = 'empleado' THEN 1 ELSE 0 END), 0) AS empleados,
            COALESCE(SUM(CASE WHEN licencia_vencimiento IS NOT NULL AND licencia_vencimiento <= $1 THEN 1 ELSE 0 END), 0) AS alerta,
            COALESCE(SUM(CASE WHEN licencia_vencimiento IS NOT NULL AND licencia_vencimiento < $2 THEN 1 ELSE 0 END), 0) AS vencidas
     FROM conductores`,
    corte,
    hoyISO(),
  );

  return {
    total: Number(fila?.total ?? 0),
    activos: Number(fila?.activos ?? 0),
    contratistas: Number(fila?.contratistas ?? 0),
    empleados: Number(fila?.empleados ?? 0),
    licenciasAlerta: Number(fila?.alerta ?? 0),
    licenciasVencidas: Number(fila?.vencidas ?? 0),
  };
}

/**
 * WHERE compartido por el listado y el conteo de conductores.
 *
 * `inicio` es el número del primer marcador libre: `listarConductores` usa
 * `$1`/`$2` para el rango de fechas, así que allí los filtros empiezan en `$3`.
 */
function whereConductores(f: FiltrosConductores, inicio = 1): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  /** Número del siguiente marcador libre. */
  const marca = () => `$${inicio + params.length}`;

  if (f.tipoVinculacion && f.tipoVinculacion !== 'todas') {
    condiciones.push(`tipo_vinculacion = ${marca()}`);
    params.push(f.tipoVinculacion);
  }
  if (f.estado && f.estado !== 'todos') {
    condiciones.push(`estado = ${marca()}`);
    params.push(f.estado);
  }
  if (f.busqueda) {
    // Tres marcadores: se calculan juntos porque se consumen antes de empujarlos.
    const primero = inicio + params.length;
    condiciones.push(
      `(nombre LIKE $${primero} OR documento LIKE $${primero + 1} OR codigo LIKE $${primero + 2})`,
    );
    const like = `%${f.busqueda}%`;
    params.push(like, like, like);
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

/**
 * Plantilla de reparto con su desempeño en el período indicado (mes en curso por
 * defecto). Las subconsultas van en el SELECT, así que un conductor sin actividad
 * sigue apareciendo con ceros: la plantilla no desaparece nunca.
 */
export async function listarConductores(
  filtros: FiltrosConductores = {},
  rango: Rango = rangoMes(),
): Promise<ConductorDesempeno[]> {
  const { sql, params } = whereConductores(filtros, 3);
  const limite = Math.min(Math.max(Math.trunc(filtros.limite ?? 200), 1), 1000);
  const desde = rango.desde;
  const hasta = rango.hasta;
  // El rango se reutiliza en todas las subconsultas: es el mismo par de valores,
  // así que basta con `$1`/`$2` en lugar de repetir marcadores nuevos.
  const noCancelada = "r.fecha BETWEEN $1 AND $2 AND r.estado <> 'cancelado'";

  const filas = await all<ConductorDesempeno>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM rutas r
              WHERE r.conductor_id = c.id AND ${noCancelada}) AS rutas,
            (SELECT COUNT(*) FROM rutas r
              WHERE r.conductor_id = c.id AND r.fecha BETWEEN $1 AND $2
                AND r.estado = 'completado') AS rutas_completadas,
            (SELECT COUNT(*) FROM envios e JOIN rutas r ON r.id = e.ruta_id
              WHERE r.conductor_id = c.id AND ${noCancelada}) AS envios,
            (SELECT COUNT(*) FROM envios e JOIN rutas r ON r.id = e.ruta_id
              WHERE r.conductor_id = c.id AND ${noCancelada}
                AND e.estado = 'entregado') AS entregados,
            (SELECT COUNT(*) FROM envios e JOIN rutas r ON r.id = e.ruta_id
              WHERE r.conductor_id = c.id AND ${noCancelada}
                AND e.estado IN ('novedad','devuelto')) AS novedades,
            (SELECT COALESCE(SUM(e.flete), 0) FROM envios e JOIN rutas r ON r.id = e.ruta_id
              WHERE r.conductor_id = c.id AND ${noCancelada}
                AND e.estado = 'entregado') AS ingresos
     FROM conductores c
     ${sql}
     ORDER BY c.estado = 'activo' DESC, c.nombre
     LIMIT ${limite}`,
    // El rango primero (`$1`/`$2`), después los filtros del WHERE (`$3`…).
    desde,
    hasta,
    ...params,
  );

  return filas.map((fila) => {
    // `ingresos` llega como number, pero el resto de agregados también:
    // se normalizan para que la vista no tenga que hacer Number(...) en cada celda.
    const envios = Number(fila.envios ?? 0);
    const entregados = Number(fila.entregados ?? 0);
    return {
      ...fila,
      rutas: Number(fila.rutas ?? 0),
      rutas_completadas: Number(fila.rutas_completadas ?? 0),
      envios,
      entregados,
      novedades: Number(fila.novedades ?? 0),
      ingresos: Number(fila.ingresos ?? 0),
      cumplimiento: envios > 0 ? (entregados / envios) * 100 : 0,
    };
  });
}

/** Número de conductores que cumplen los filtros (para el pie del listado). */
export async function contarConductores(filtros: FiltrosConductores = {}): Promise<number> {
  const { sql, params } = whereConductores(filtros);
  return Number((await escalar<number>(`SELECT COUNT(*) FROM conductores ${sql}`, ...params)) ?? 0);
}

/** Catálogo completo, para poblar el selector de conductor de los filtros. */
export async function catalogoConductores(): Promise<Conductor[]> {
  return all<Conductor>('SELECT * FROM conductores ORDER BY nombre');
}

/** Ficha de un conductor concreto. */
export async function obtenerConductor(id: number): Promise<Conductor | null> {
  if (!Number.isFinite(id)) return null;
  return get<Conductor>('SELECT * FROM conductores WHERE id = $1', id);
}

// ─────────────────────────────────────────────────────────────
// Liquidaciones
// ─────────────────────────────────────────────────────────────
export type EstadoLiquidacion = Liquidacion['estado'];

export interface FiltrosLiquidaciones {
  conductorId?: number;
  estado?: EstadoLiquidacion | 'todas';
  desde?: string;
  hasta?: string;
  limite?: number;
}

export interface LiquidacionDetallada extends Liquidacion {
  conductor: string;
  conductor_codigo: string;
  tipo_vinculacion: Vinculacion;
  comision_pct: number;
  salario_base: number;
  documento: string | null;
}

/**
 * WHERE compartido por el listado y los totales de liquidaciones.
 * Aquí los filtros son los únicos parámetros, así que empiezan en `$1`.
 */
function whereLiquidaciones(f: FiltrosLiquidaciones, inicio = 1): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  /** Número del siguiente marcador libre. */
  const marca = () => `$${inicio + params.length}`;

  if (f.conductorId) {
    condiciones.push(`l.conductor_id = ${marca()}`);
    params.push(f.conductorId);
  }
  if (f.estado && f.estado !== 'todas') {
    condiciones.push(`l.estado = ${marca()}`);
    params.push(f.estado);
  }
  // El período de la liquidación (inicio–fin) se cruza con la ventana pedida:
  // basta con que se solapen, porque una liquidación semanal puede caer a
  // caballo entre dos meses.
  if (f.desde) {
    condiciones.push(`l.periodo_fin >= ${marca()}`);
    params.push(f.desde);
  }
  if (f.hasta) {
    condiciones.push(`l.periodo_inicio <= ${marca()}`);
    params.push(f.hasta);
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

/** Liquidaciones ordenadas por período descendente (la más reciente primero). */
export async function listarLiquidaciones(
  f: FiltrosLiquidaciones = {},
): Promise<LiquidacionDetallada[]> {
  const { sql, params } = whereLiquidaciones(f);
  const limite = Math.min(Math.max(Math.trunc(f.limite ?? 300), 1), 1000);
  return all<LiquidacionDetallada>(
    `SELECT l.*,
            c.nombre           AS conductor,
            c.codigo           AS conductor_codigo,
            c.tipo_vinculacion AS tipo_vinculacion,
            c.comision_pct     AS comision_pct,
            c.salario_base     AS salario_base,
            c.documento        AS documento
     FROM liquidaciones l
     JOIN conductores c ON c.id = l.conductor_id
     ${sql}
     ORDER BY l.periodo_fin DESC, l.periodo_inicio DESC, l.id DESC
     LIMIT ${limite}`,
    ...params,
  );
}

export interface KpisLiquidaciones {
  /** Suma de `total_pagar` de todas las liquidaciones visibles. */
  totalLiquidado: number;
  /** Pendiente de pago: estados `borrador` y `aprobada`. */
  totalPendiente: number;
  /** Ya desembolsado: estado `pagada`. */
  totalPagado: number;
  /** Número de liquidaciones visibles. */
  numero: number;
}

/** Totales del conjunto visible, con una única consulta agregada. */
export async function kpisLiquidaciones(f: FiltrosLiquidaciones = {}): Promise<KpisLiquidaciones> {
  const { sql, params } = whereLiquidaciones(f);
  const fila = await get<{
    liquidado: number;
    pendiente: number;
    pagado: number;
    numero: number;
  }>(
    `SELECT COALESCE(SUM(l.total_pagar), 0) AS liquidado,
            COALESCE(SUM(CASE WHEN l.estado IN ('borrador','aprobada') THEN l.total_pagar ELSE 0 END), 0) AS pendiente,
            COALESCE(SUM(CASE WHEN l.estado = 'pagada' THEN l.total_pagar ELSE 0 END), 0) AS pagado,
            COUNT(*) AS numero
     FROM liquidaciones l
     ${sql}`,
    ...params,
  );

  return {
    totalLiquidado: Number(fila?.liquidado ?? 0),
    totalPendiente: Number(fila?.pendiente ?? 0),
    totalPagado: Number(fila?.pagado ?? 0),
    numero: Number(fila?.numero ?? 0),
  };
}

/**
 * Actividad del conductor dentro del período liquidado: es la auditoría del
 * cálculo de la comisión. Las rutas se cuentan sobre las completadas y los
 * ingresos solo sobre los envíos efectivamente entregados, que es exactamente
 * la base que usa el generador de liquidaciones.
 */
export interface ActividadLiquidada {
  conductor_id: number;
  conductor: string;
  conductor_codigo: string;
  tipo_vinculacion: Vinculacion;
  comision_pct: number;
  salario_base: number;
  rutas_completadas: number;
  entregados: number;
  novedades: number;
  /** Ingresos por flete de los envíos entregados en esas rutas. */
  ingresos: number;
  /** Comisión que correspondería con los ingresos y el porcentaje vigente. */
  comisionCalculada: number;
  /** Suma de las liquidaciones del conductor en la ventana. */
  liquidaciones: number;
  baseLiquidada: number;
  comisionesLiquidadas: number;
  bonificaciones: number;
  deducciones: number;
  totalPagado: number;
  totalPendiente: number;
}

export async function actividadLiquidada(
  conductorId: number,
  rango: Rango,
): Promise<ActividadLiquidada | null> {
  const conductor = await obtenerConductor(conductorId);
  if (!conductor) return null;

  const operacion = await get<{
    rutas_completadas: number;
    entregados: number;
    novedades: number;
    ingresos: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM rutas r
         WHERE r.conductor_id = $1 AND r.fecha BETWEEN $2 AND $3
           AND r.estado = 'completado') AS rutas_completadas,
       (SELECT COUNT(*) FROM envios e JOIN rutas r ON r.id = e.ruta_id
         WHERE r.conductor_id = $4 AND r.fecha BETWEEN $5 AND $6
           AND r.estado <> 'cancelado' AND e.estado = 'entregado') AS entregados,
       (SELECT COUNT(*) FROM envios e JOIN rutas r ON r.id = e.ruta_id
         WHERE r.conductor_id = $7 AND r.fecha BETWEEN $8 AND $9
           AND r.estado <> 'cancelado'
           AND e.estado IN ('novedad','devuelto')) AS novedades,
       (SELECT COALESCE(SUM(e.flete), 0) FROM envios e JOIN rutas r ON r.id = e.ruta_id
         WHERE r.conductor_id = $10 AND r.fecha BETWEEN $11 AND $12
           AND r.estado <> 'cancelado' AND e.estado = 'entregado') AS ingresos`,
    conductorId,
    rango.desde,
    rango.hasta,
    conductorId,
    rango.desde,
    rango.hasta,
    conductorId,
    rango.desde,
    rango.hasta,
    conductorId,
    rango.desde,
    rango.hasta,
  );

  const pagos = await get<{
    liquidaciones: number;
    base: number;
    comisiones: number;
    bonificaciones: number;
    deducciones: number;
    pagado: number;
    pendiente: number;
  }>(
    `SELECT COUNT(*) AS liquidaciones,
            COALESCE(SUM(base), 0) AS base,
            COALESCE(SUM(comisiones), 0) AS comisiones,
            COALESCE(SUM(bonificaciones), 0) AS bonificaciones,
            COALESCE(SUM(deducciones), 0) AS deducciones,
            COALESCE(SUM(CASE WHEN estado = 'pagada' THEN total_pagar ELSE 0 END), 0) AS pagado,
            COALESCE(SUM(CASE WHEN estado IN ('borrador','aprobada') THEN total_pagar ELSE 0 END), 0) AS pendiente
     FROM liquidaciones
     WHERE conductor_id = $1 AND periodo_fin >= $2 AND periodo_inicio <= $3`,
    conductorId,
    rango.desde,
    rango.hasta,
  );

  const ingresos = Number(operacion?.ingresos ?? 0);
  const pct = conductor.tipo_vinculacion === 'contratista' ? Number(conductor.comision_pct) : 0;

  return {
    conductor_id: conductor.id,
    conductor: conductor.nombre,
    conductor_codigo: conductor.codigo,
    tipo_vinculacion: conductor.tipo_vinculacion,
    comision_pct: Number(conductor.comision_pct),
    salario_base: Number(conductor.salario_base),
    rutas_completadas: Number(operacion?.rutas_completadas ?? 0),
    entregados: Number(operacion?.entregados ?? 0),
    novedades: Number(operacion?.novedades ?? 0),
    ingresos,
    comisionCalculada: ingresos * (pct / 100),
    liquidaciones: Number(pagos?.liquidaciones ?? 0),
    baseLiquidada: Number(pagos?.base ?? 0),
    comisionesLiquidadas: Number(pagos?.comisiones ?? 0),
    bonificaciones: Number(pagos?.bonificaciones ?? 0),
    deducciones: Number(pagos?.deducciones ?? 0),
    totalPagado: Number(pagos?.pagado ?? 0),
    totalPendiente: Number(pagos?.pendiente ?? 0),
  };
}

/** Una liquidación concreta, con los datos del conductor. */
export async function obtenerLiquidacion(id: number): Promise<LiquidacionDetallada | null> {
  if (!Number.isFinite(id)) return null;
  return get<LiquidacionDetallada>(
    `SELECT l.*,
            c.nombre           AS conductor,
            c.codigo           AS conductor_codigo,
            c.tipo_vinculacion AS tipo_vinculacion,
            c.comision_pct     AS comision_pct,
            c.salario_base     AS salario_base,
            c.documento        AS documento
     FROM liquidaciones l
     JOIN conductores c ON c.id = l.conductor_id
     WHERE l.id = $1`,
    id,
  );
}

/**
 * Conductores que se pueden liquidar: empleados o contratistas vigentes.
 * Quien está inactivo no genera operación, así que no debería recibir un pago.
 */
export async function conductoresLiquidables(): Promise<Conductor[]> {
  return all<Conductor>(
    `SELECT * FROM conductores
      WHERE estado IN ('activo','vacaciones')
      ORDER BY nombre`,
  );
}
