/**
 * Consultas del tablero principal: KPIs del día, tendencia, alertas y cartera.
 */
import { all, escalar } from '@/db/client';
import type { DocumentoConUnidad, MantenimientoConUnidad } from '@/db/tipos';
import { calcularMetricasEntrega, calcularRentabilidad, type MetricasEntrega } from '@/lib/domain';
import { aISO, hoyISO, sumarDias } from '@/lib/format';
import { rangoDia, rangoMes, rangoUltimosDias, type Rango } from '@/lib/periodos';
import { umbrales } from '@/config/empresa';

// ─────────────────────────────────────────────────────────────
// Operación del día
// ─────────────────────────────────────────────────────────────
export interface KpisOperacion {
  rutas: number;
  rutasEnCurso: number;
  rutasPlanificadas: number;
  rutasCompletadas: number;
  rutasCanceladas: number;
  entregas: MetricasEntrega;
  unidadesEnRuta: number;
  unidadesDisponibles: number;
  unidadesMantenimiento: number;
  unidadesFueraServicio: number;
}

export async function kpisOperacion(fecha: string = hoyISO()): Promise<KpisOperacion> {
  const porEstado = await all<{ estado: string; n: number }>(
    'SELECT estado, COUNT(*) AS n FROM rutas WHERE fecha = $1 GROUP BY estado',
    fecha,
  );
  const mapaRutas = new Map(porEstado.map((f) => [f.estado, Number(f.n)]));

  const entregas = calcularMetricasEntrega(
    await all<{ estado: string; n: number }>(
      `SELECT e.estado, COUNT(*) AS n
       FROM envios e JOIN rutas r ON r.id = e.ruta_id
       WHERE r.fecha = $1 GROUP BY e.estado`,
      fecha,
    ),
  );

  const porEstadoUnidad = await all<{ estado: string; n: number }>(
    'SELECT estado, COUNT(*) AS n FROM unidades GROUP BY estado',
  );
  const mapaUnidades = new Map(porEstadoUnidad.map((f) => [f.estado, Number(f.n)]));

  return {
    rutas: porEstado.reduce((s, f) => s + Number(f.n), 0),
    rutasEnCurso: mapaRutas.get('en_curso') ?? 0,
    rutasPlanificadas: mapaRutas.get('planificado') ?? 0,
    rutasCompletadas: mapaRutas.get('completado') ?? 0,
    rutasCanceladas: mapaRutas.get('cancelado') ?? 0,
    entregas,
    unidadesEnRuta: mapaUnidades.get('en_ruta') ?? 0,
    unidadesDisponibles: mapaUnidades.get('disponible') ?? 0,
    unidadesMantenimiento: mapaUnidades.get('mantenimiento') ?? 0,
    unidadesFueraServicio: mapaUnidades.get('fuera_servicio') ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Tendencia diaria
// ─────────────────────────────────────────────────────────────
export interface DiaOperacion {
  fecha: string;
  rutas: number;
  envios: number;
  entregados: number;
  novedades: number;
  ingresos: number;
  cumplimiento: number;
}

export async function serieDiaria(dias = 14, ref: Date = new Date()): Promise<DiaOperacion[]> {
  const rango = rangoUltimosDias(dias, ref);
  const filas = await all<{
    fecha: string;
    rutas: number;
    envios: number;
    entregados: number;
    novedades: number;
    ingresos: number;
  }>(
    `SELECT r.fecha AS fecha,
            COUNT(DISTINCT r.id) AS rutas,
            COUNT(e.id) AS envios,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN 1 ELSE 0 END), 0) AS entregados,
            COALESCE(SUM(CASE WHEN e.estado IN ('novedad','devuelto') THEN 1 ELSE 0 END), 0) AS novedades,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN e.flete ELSE 0 END), 0) AS ingresos
     FROM rutas r
     LEFT JOIN envios e ON e.ruta_id = r.id
     WHERE r.fecha BETWEEN $1 AND $2 AND r.estado <> 'cancelado'
     GROUP BY r.fecha
     ORDER BY r.fecha`,
    rango.desde,
    rango.hasta,
  );

  const porFecha = new Map(filas.map((f) => [f.fecha, f]));
  const serie: DiaOperacion[] = [];

  // Se rellenan los días sin actividad para que la gráfica no tenga huecos.
  const inicio = new Date(`${rango.desde}T00:00:00`);
  for (let i = 0; i < dias; i++) {
    const fecha = aISO(sumarDias(inicio, i));
    const f = porFecha.get(fecha);
    const envios = Number(f?.envios ?? 0);
    const entregados = Number(f?.entregados ?? 0);
    serie.push({
      fecha,
      rutas: Number(f?.rutas ?? 0),
      envios,
      entregados,
      novedades: Number(f?.novedades ?? 0),
      ingresos: Number(f?.ingresos ?? 0),
      cumplimiento: envios > 0 ? (entregados / envios) * 100 : 0,
    });
  }
  return serie;
}

// ─────────────────────────────────────────────────────────────
// Resumen financiero
// ─────────────────────────────────────────────────────────────
export interface ResumenFinanciero {
  ingresos: number;
  combustible: number;
  gastos: number;
  mantenimiento: number;
  comisiones: number;
  margen: number;
  margenPct: number;
  galones: number;
  km: number;
}

/** Comisiones generadas por los conductores contratistas en un período. */
async function comisionesDelPeriodo(rango: Rango): Promise<number> {
  const filas = await all<{
    ingresos: number;
    tipo_vinculacion: string | null;
    comision_pct: number | null;
  }>(
    `SELECT (SELECT COALESCE(SUM(e.flete), 0) FROM envios e
             WHERE e.ruta_id = r.id AND e.estado = 'entregado') AS ingresos,
            c.tipo_vinculacion, c.comision_pct
     FROM rutas r
     LEFT JOIN conductores c ON c.id = r.conductor_id
     WHERE r.fecha BETWEEN $1 AND $2`,
    rango.desde,
    rango.hasta,
  );
  return filas.reduce((s, f) => {
    if (f.tipo_vinculacion !== 'contratista') return s;
    return s + Number(f.ingresos) * ((f.comision_pct ?? 0) / 100);
  }, 0);
}

export async function resumenFinanciero(rango: Rango = rangoMes()): Promise<ResumenFinanciero> {
  const ingresos = Number(
    (await escalar<number>(
      `SELECT COALESCE(SUM(e.flete), 0)
       FROM envios e JOIN rutas r ON r.id = e.ruta_id
       WHERE e.estado = 'entregado' AND r.fecha BETWEEN $1 AND $2`,
      rango.desde,
      rango.hasta,
    )) ?? 0,
  );
  const combustible = Number(
    (await escalar<number>(
      'SELECT COALESCE(SUM(total), 0) FROM combustible WHERE fecha BETWEEN $1 AND $2',
      rango.desde,
      rango.hasta,
    )) ?? 0,
  );
  const galones = Number(
    (await escalar<number>(
      'SELECT COALESCE(SUM(galones), 0) FROM combustible WHERE fecha BETWEEN $1 AND $2',
      rango.desde,
      rango.hasta,
    )) ?? 0,
  );
  const gastos = Number(
    (await escalar<number>(
      'SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE fecha BETWEEN $1 AND $2',
      rango.desde,
      rango.hasta,
    )) ?? 0,
  );
  const mantenimiento = Number(
    (await escalar<number>(
      "SELECT COALESCE(SUM(costo), 0) FROM mantenimientos WHERE estado = 'completado' AND fecha BETWEEN $1 AND $2",
      rango.desde,
      rango.hasta,
    )) ?? 0,
  );
  const km = Number(
    (await escalar<number>(
      `SELECT COALESCE(SUM(GREATEST(0, COALESCE(km_final, 0) - COALESCE(km_inicial, 0))), 0)
       FROM rutas WHERE estado = 'completado' AND fecha BETWEEN $1 AND $2`,
      rango.desde,
      rango.hasta,
    )) ?? 0,
  );

  const comisiones = await comisionesDelPeriodo(rango);
  const r = calcularRentabilidad({
    ingresos,
    combustible,
    gastos,
    mantenimiento,
    comisionConductor: comisiones,
    km,
    envios: 0,
  });

  return {
    ingresos,
    combustible,
    gastos,
    mantenimiento,
    comisiones,
    margen: r.margen,
    margenPct: r.margenPct,
    galones,
    km,
  };
}

// ─────────────────────────────────────────────────────────────
// Alertas de flota
// ─────────────────────────────────────────────────────────────
/** Documentos vencidos o que vencen dentro del umbral indicado. */
export async function documentosPorVencer(
  diasVentana: number = umbrales.preventivo,
  limite = 100,
): Promise<DocumentoConUnidad[]> {
  const corte = aISO(sumarDias(new Date(), diasVentana));
  return all<DocumentoConUnidad>(
    `SELECT d.*, u.placa AS placa, u.tipo AS tipo_unidad, u.estado AS estado_unidad
     FROM documentos_unidad d
     JOIN unidades u ON u.id = d.unidad_id
     WHERE d.vencimiento <= $1
     ORDER BY d.vencimiento
     LIMIT ${limite}`,
    corte,
  );
}

/** Mantenimientos programados cuya fecha ya llegó o está por llegar. */
export async function mantenimientosProximos(
  diasVentana = 30,
  limite = 50,
): Promise<MantenimientoConUnidad[]> {
  const corte = aISO(sumarDias(new Date(), diasVentana));
  return all<MantenimientoConUnidad>(
    `SELECT m.*, u.placa AS placa, u.tipo AS tipo_unidad
     FROM mantenimientos m
     JOIN unidades u ON u.id = m.unidad_id
     WHERE m.estado IN ('programado','en_taller') AND m.fecha <= $1
     ORDER BY m.fecha
     LIMIT ${limite}`,
    corte,
  );
}

/** Unidades cuya documentación está vencida (no deberían operar). */
export async function unidadesConDocumentosVencidos() {
  // El corte se calcula en JS (hora local). Usar la fecha del servidor daría
  // un día de desfase porque trabajaría en UTC.
  return all<{ id: number; placa: string; tipo: string; vencidos: number; peor: string }>(
    `SELECT u.id, u.placa, u.tipo,
            COUNT(*) AS vencidos,
            MIN(d.vencimiento) AS peor
     FROM documentos_unidad d
     JOIN unidades u ON u.id = d.unidad_id
     WHERE d.vencimiento < $1
     GROUP BY u.id, u.placa, u.tipo
     ORDER BY peor`,
    hoyISO(),
  );
}

// ─────────────────────────────────────────────────────────────
// Cartera
// ─────────────────────────────────────────────────────────────
export interface ResumenCartera {
  porEstado: { estado: string; n: number; total: number }[];
  totalFacturado: number;
  totalCobrado: number;
  porCobrar: number;
  vencido: number;
}

export async function resumenCartera(): Promise<ResumenCartera> {
  const porEstado = (
    await all<{ estado: string; n: number; total: number }>(
      'SELECT estado, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM facturas GROUP BY estado',
    )
  ).map((f) => ({ estado: f.estado, n: Number(f.n), total: Number(f.total) }));

  const hoy = hoyISO();
  const totalFacturado = porEstado
    .filter((f) => f.estado !== 'anulada' && f.estado !== 'borrador')
    .reduce((s, f) => s + f.total, 0);
  const totalCobrado = porEstado.find((f) => f.estado === 'pagada')?.total ?? 0;
  const vencido =
    Number(
      (await escalar<number>(
        `SELECT COALESCE(SUM(total), 0) FROM facturas
         WHERE estado IN ('emitida','vencida') AND fecha_vencimiento < $1`,
        hoy,
      )) ?? 0,
    ) || 0;

  return {
    porEstado,
    totalFacturado,
    totalCobrado,
    porCobrar: totalFacturado - totalCobrado,
    vencido,
  };
}

// ─────────────────────────────────────────────────────────────
// Rankings
// ─────────────────────────────────────────────────────────────
export async function topZonas(limite = 6, rango: Rango = rangoMes()) {
  return all<{ zona: string; rutas: number; envios: number; entregados: number; ingresos: number }>(
    `SELECT r.zona AS zona,
            COUNT(DISTINCT r.id) AS rutas,
            COUNT(e.id) AS envios,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN 1 ELSE 0 END), 0) AS entregados,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN e.flete ELSE 0 END), 0) AS ingresos
     FROM rutas r
     LEFT JOIN envios e ON e.ruta_id = r.id
     WHERE r.fecha BETWEEN $1 AND $2
     GROUP BY r.zona
     ORDER BY entregados DESC
     LIMIT ${limite}`,
    rango.desde,
    rango.hasta,
  );
}

export async function desempenoConductores(limite = 8, rango: Rango = rangoMes()) {
  return all<{
    id: number;
    nombre: string;
    codigo: string;
    tipo_vinculacion: string;
    rutas: number;
    entregados: number;
    novedades: number;
    ingresos: number;
    cumplimiento: number;
  }>(
    `SELECT c.id, c.nombre, c.codigo, c.tipo_vinculacion,
            COUNT(DISTINCT r.id) AS rutas,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN 1 ELSE 0 END), 0) AS entregados,
            COALESCE(SUM(CASE WHEN e.estado IN ('novedad','devuelto') THEN 1 ELSE 0 END), 0) AS novedades,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN e.flete ELSE 0 END), 0) AS ingresos,
            CASE WHEN COUNT(e.id) > 0
                 THEN ROUND((100.0 * SUM(CASE WHEN e.estado = 'entregado' THEN 1 ELSE 0 END) / COUNT(e.id))::numeric, 1)
                 ELSE 0 END AS cumplimiento
     FROM conductores c
     JOIN rutas r ON r.conductor_id = c.id AND r.fecha BETWEEN $1 AND $2
     LEFT JOIN envios e ON e.ruta_id = r.id
     GROUP BY c.id, c.nombre, c.codigo, c.tipo_vinculacion
     -- PostgreSQL no admite alias en HAVING, así que se repite la expresión.
     -- Debe ser exactamente la del alias «entregados» (solo envíos entregados),
     -- no COUNT(e.id), que contaría cualquier envío y cambiaría el ranking.
     HAVING COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN 1 ELSE 0 END), 0) > 0
     ORDER BY entregados DESC
     LIMIT ${limite}`,
    rango.desde,
    rango.hasta,
  );
}

/** Actividad reciente de la flota, para el panel lateral del tablero. */
export async function actividadReciente(limite = 6) {
  return all<{
    placa: string;
    tipo: string;
    zona: string | null;
    conductor: string | null;
    velocidad_kmh: number;
    timestamp: string;
    ruta_codigo: string | null;
  }>(
    `SELECT u.placa, u.tipo, r.zona, c.nombre AS conductor,
            p.velocidad_kmh, p.timestamp, r.codigo AS ruta_codigo
     FROM posiciones p
     JOIN unidades u    ON u.id = p.unidad_id
     LEFT JOIN rutas r  ON r.id = p.ruta_id
     LEFT JOIN conductores c ON c.id = r.conductor_id
     WHERE p.id IN (SELECT MAX(id) FROM posiciones GROUP BY unidad_id)
     ORDER BY p.timestamp DESC
     LIMIT ${limite}`,
  );
}

export { rangoDia, rangoMes, rangoUltimosDias };
export type { Rango };
