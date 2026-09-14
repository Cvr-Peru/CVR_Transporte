/**
 * Consultas del módulo de costos y rentabilidad.
 *
 * Toda la lectura económica del período pasa por aquí: ingresos por flete,
 * combustible, gastos de ruta, mantenimiento prorrateado y comisión del
 * conductor. El margen se calcula siempre con `calcularRentabilidad()` para que
 * sea coherente con el tablero y con el resto de la aplicación.
 *
 * Reglas que se respetan en todo el archivo:
 *  - Los cortes de fecha llegan calculados en JavaScript (`Rango`), nunca con
 *    `date('now')`, que trabaja en UTC y desplaza un día en Colombia.
 *  - Los valores van con marcadores posicionales `$1, $2, …`; la única
 *    interpolación es el `LIMIT`, ya validado como número entero por
 *    `limitar()`.
 *  - Todas las funciones son asíncronas: la capa de acceso a datos devuelve
 *    promesas.
 *  - La comisión solo se imputa a los conductores contratistas. El salario de
 *    los empleados es costo fijo y no se reparte por ruta.
 */
import { all, escalar } from '@/db/client';
import { costoMantenimientoPorKm, costosDeRuta } from '@/db/queries/despachos';
import type { CargaCombustible, CategoriaGasto, Gasto, TipoUnidad } from '@/db/tipos';
import {
  calcularRentabilidad,
  desviacionRendimiento,
  rendimientoReal,
  type Rentabilidad,
} from '@/lib/domain';
import { aISO, parseFecha, sumarDias } from '@/lib/format';
import type { Rango } from '@/lib/periodos';

// ─────────────────────────────────────────────────────────────
// Utilidades internas
// ─────────────────────────────────────────────────────────────

/** Normaliza cualquier valor numérico que venga de la base de datos. */
function num(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Acota un LIMIT antes de interpolarlo en el SQL (única interpolación permitida). */
function limitar(valor: number | undefined, porDefecto: number, maximo = 500): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(Math.trunc(n), maximo);
}

/** Días ISO consecutivos del rango, para rellenar los huecos de las series. */
function diasDelRango(rango: Rango): string[] {
  const inicio = parseFecha(rango.desde);
  if (!inicio) return [rango.desde];
  const dias: string[] = [];
  // Tope de seguridad: un rango absurdo no debe generar un bucle sin final.
  for (let i = 0; i < 400; i++) {
    const fecha = aISO(sumarDias(inicio, i));
    if (fecha > rango.hasta) break;
    dias.push(fecha);
  }
  return dias;
}

/** Parámetros del filtro opcional por unidad. */
function paramsUnidad(rango: Rango, unidadId?: number): unknown[] {
  return unidadId ? [rango.desde, rango.hasta, unidadId] : [rango.desde, rango.hasta];
}

/** Kilómetros recorridos por unidad en el período (solo rutas completadas). */
export async function kmPorUnidad(
  rango: Rango,
  unidadId?: number,
): Promise<Map<number, number>> {
  const filtro = unidadId ? 'AND r.unidad_id = $3' : '';
  const filas = await all<{ unidad_id: number; km: number }>(
    `SELECT r.unidad_id AS unidad_id,
            COALESCE(SUM(GREATEST(0, COALESCE(r.km_final, 0) - COALESCE(r.km_inicial, 0))), 0) AS km
     FROM rutas r
     WHERE r.estado = 'completado' AND r.fecha BETWEEN $1 AND $2
       AND r.unidad_id IS NOT NULL ${filtro}
     GROUP BY r.unidad_id`,
    ...paramsUnidad(rango, unidadId),
  );
  return new Map(filas.map((f) => [num(f.unidad_id), num(f.km)]));
}

/** Kilómetros totales del período, opcionalmente de una sola unidad. */
export async function kmDelPeriodo(rango: Rango, unidadId?: number): Promise<number> {
  const filtro = unidadId ? 'AND unidad_id = $3' : '';
  return num(
    await escalar<number>(
      `SELECT COALESCE(SUM(GREATEST(0, COALESCE(km_final, 0) - COALESCE(km_inicial, 0))), 0)
       FROM rutas
       WHERE estado = 'completado' AND fecha BETWEEN $1 AND $2 ${filtro}`,
      ...paramsUnidad(rango, unidadId),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
// Comisión del conductor
// ─────────────────────────────────────────────────────────────

interface FilaComision {
  ruta_id: number;
  fecha: string;
  ingresos: number;
  tipo_vinculacion: string | null;
  comision_pct: number | null;
}

/** Ingresos entregados y comisión potencial de cada ruta del período. */
async function filasComision(rango: Rango): Promise<FilaComision[]> {
  return all<FilaComision>(
    `SELECT r.id AS ruta_id,
            r.fecha AS fecha,
            (SELECT COALESCE(SUM(e.flete), 0) FROM envios e
              WHERE e.ruta_id = r.id AND e.estado = 'entregado') AS ingresos,
            c.tipo_vinculacion AS tipo_vinculacion,
            c.comision_pct AS comision_pct
     FROM rutas r
     LEFT JOIN conductores c ON c.id = r.conductor_id
     WHERE r.fecha BETWEEN $1 AND $2 AND r.estado <> 'cancelado'`,
    rango.desde,
    rango.hasta,
  );
}

/**
 * Comisión de una ruta: porcentaje sobre el flete entregado, solo para
 * contratistas. Los empleados devuelven 0 (su salario es costo fijo).
 */
function comisionDeRuta(
  tipoVinculacion: string | null,
  comisionPct: number | null,
  ingresos: number,
): number {
  if (tipoVinculacion !== 'contratista') return 0;
  return ingresos * (num(comisionPct) / 100);
}

// ─────────────────────────────────────────────────────────────
// Resumen económico del período
// ─────────────────────────────────────────────────────────────

export interface ResumenEconomico {
  ingresos: number;
  combustible: number;
  gastos: number;
  mantenimiento: number;
  comisiones: number;
  galones: number;
  km: number;
  rutas: number;
  /** Envíos entregados en el período (base de la comisión y del margen). */
  envios: number;
  /** Envíos de todo estado despachados en el período. */
  enviosTotal: number;
  rentabilidad: Rentabilidad;
}

export async function resumenEconomico(rango: Rango): Promise<ResumenEconomico> {
  const ingresos = num(
    await escalar<number>(
      `SELECT COALESCE(SUM(e.flete), 0)
       FROM envios e JOIN rutas r ON r.id = e.ruta_id
       WHERE e.estado = 'entregado' AND r.fecha BETWEEN $1 AND $2`,
      rango.desde,
      rango.hasta,
    ),
  );

  const combustible = num(
    await escalar<number>(
      'SELECT COALESCE(SUM(total), 0) FROM combustible WHERE fecha BETWEEN $1 AND $2',
      rango.desde,
      rango.hasta,
    ),
  );

  const galones = num(
    await escalar<number>(
      'SELECT COALESCE(SUM(galones), 0) FROM combustible WHERE fecha BETWEEN $1 AND $2',
      rango.desde,
      rango.hasta,
    ),
  );

  const gastos = num(
    await escalar<number>(
      'SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE fecha BETWEEN $1 AND $2',
      rango.desde,
      rango.hasta,
    ),
  );

  const mantenimiento = num(
    await escalar<number>(
      `SELECT COALESCE(SUM(costo), 0) FROM mantenimientos
       WHERE estado = 'completado' AND fecha BETWEEN $1 AND $2`,
      rango.desde,
      rango.hasta,
    ),
  );

  const envios = num(
    await escalar<number>(
      `SELECT COUNT(*)
       FROM envios e JOIN rutas r ON r.id = e.ruta_id
       WHERE e.estado = 'entregado' AND r.fecha BETWEEN $1 AND $2`,
      rango.desde,
      rango.hasta,
    ),
  );

  const enviosTotal = num(
    await escalar<number>(
      `SELECT COUNT(*)
       FROM envios e JOIN rutas r ON r.id = e.ruta_id
       WHERE r.fecha BETWEEN $1 AND $2`,
      rango.desde,
      rango.hasta,
    ),
  );

  const rutas = num(
    await escalar<number>(
      `SELECT COUNT(*) FROM rutas
       WHERE fecha BETWEEN $1 AND $2 AND estado <> 'cancelado'`,
      rango.desde,
      rango.hasta,
    ),
  );

  const comisiones = (await filasComision(rango)).reduce(
    (s, f) => s + comisionDeRuta(f.tipo_vinculacion, f.comision_pct, num(f.ingresos)),
    0,
  );

  const km = await kmDelPeriodo(rango);

  const rentabilidad = calcularRentabilidad({
    ingresos,
    combustible,
    gastos,
    mantenimiento,
    comisionConductor: comisiones,
    km,
    envios,
  });

  return {
    ingresos,
    combustible,
    gastos,
    mantenimiento,
    comisiones,
    galones,
    km,
    rutas,
    envios,
    enviosTotal,
    rentabilidad,
  };
}

// ─────────────────────────────────────────────────────────────
// Serie diaria de ingresos y costos
// ─────────────────────────────────────────────────────────────

export interface DiaEconomico {
  fecha: string;
  ingresos: number;
  combustible: number;
  gastos: number;
  mantenimiento: number;
  comisiones: number;
  costos: number;
  margen: number;
  envios: number;
  km: number;
}

/**
 * Evolución diaria del período. Los días sin movimiento se rellenan con ceros
 * para que la gráfica no tenga huecos.
 */
export async function serieEconomica(rango: Rango): Promise<DiaEconomico[]> {
  const dias = diasDelRango(rango);

  const ingresosDia = await all<{ fecha: string; ingresos: number; envios: number }>(
    `SELECT r.fecha AS fecha,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN e.flete ELSE 0 END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN e.estado = 'entregado' THEN 1 ELSE 0 END), 0) AS envios
     FROM rutas r
     LEFT JOIN envios e ON e.ruta_id = r.id
     WHERE r.fecha BETWEEN $1 AND $2 AND r.estado <> 'cancelado'
     GROUP BY r.fecha`,
    rango.desde,
    rango.hasta,
  );

  // Los kilómetros se leen aparte: al unir `envios` la fila de la ruta se
  // duplicaría y el kilometraje quedaría multiplicado por número de guías.
  const kmDia = await all<{ fecha: string; km: number }>(
    `SELECT fecha,
            COALESCE(SUM(GREATEST(0, COALESCE(km_final, 0) - COALESCE(km_inicial, 0))), 0) AS km
     FROM rutas
     WHERE estado = 'completado' AND fecha BETWEEN $1 AND $2
     GROUP BY fecha`,
    rango.desde,
    rango.hasta,
  );

  const combustibleDia = await all<{ fecha: string; total: number }>(
    `SELECT fecha, COALESCE(SUM(total), 0) AS total
     FROM combustible WHERE fecha BETWEEN $1 AND $2
     GROUP BY fecha`,
    rango.desde,
    rango.hasta,
  );

  const gastosDia = await all<{ fecha: string; total: number }>(
    `SELECT fecha, COALESCE(SUM(monto), 0) AS total
     FROM gastos WHERE fecha BETWEEN $1 AND $2
     GROUP BY fecha`,
    rango.desde,
    rango.hasta,
  );

  const mantenimientoDia = await all<{ fecha: string; total: number }>(
    `SELECT fecha, COALESCE(SUM(costo), 0) AS total
     FROM mantenimientos WHERE estado = 'completado' AND fecha BETWEEN $1 AND $2
     GROUP BY fecha`,
    rango.desde,
    rango.hasta,
  );

  const comisionesDia = new Map<string, number>();
  for (const f of await filasComision(rango)) {
    const comision = comisionDeRuta(f.tipo_vinculacion, f.comision_pct, num(f.ingresos));
    comisionesDia.set(f.fecha, (comisionesDia.get(f.fecha) ?? 0) + comision);
  }

  const porFecha = <T extends { fecha: string }>(filas: T[]) =>
    new Map(filas.map((f) => [f.fecha, f]));
  const mIngresos = porFecha(ingresosDia);
  const mKm = porFecha(kmDia);
  const mCombustible = porFecha(combustibleDia);
  const mGastos = porFecha(gastosDia);
  const mMantenimiento = porFecha(mantenimientoDia);

  return dias.map((fecha) => {
    const ingresos = num(mIngresos.get(fecha)?.ingresos);
    const combustible = num(mCombustible.get(fecha)?.total);
    const gastos = num(mGastos.get(fecha)?.total);
    const mantenimiento = num(mMantenimiento.get(fecha)?.total);
    const comisiones = num(comisionesDia.get(fecha));
    const costos = combustible + gastos + mantenimiento + comisiones;

    return {
      fecha,
      ingresos,
      combustible,
      gastos,
      mantenimiento,
      comisiones,
      costos,
      margen: ingresos - costos,
      envios: num(mIngresos.get(fecha)?.envios),
      km: num(mKm.get(fecha)?.km),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Punto de equilibrio
// ─────────────────────────────────────────────────────────────

export interface PuntoEquilibrio {
  ingresoPorEnvio: number;
  costoPorEnvio: number;
  /** Envíos necesarios para cubrir los costos del período. */
  enviosEquilibrio: number;
  /** Kilómetros necesarios para cubrir los costos del período. */
  kmEquilibrio: number;
  enviosActuales: number;
  kmActuales: number;
  /** Positivo = todavía faltan; negativo = ya se cubrió con holgura. */
  enviosDiferencia: number;
  kmDiferencia: number;
  /** Porcentaje de los costos cubierto por los ingresos. */
  cobertura: number;
  cubre: boolean;
}

/**
 * Punto de equilibrio del período: cuántos envíos o kilómetros harían falta
 * para cubrir los costos, usando el ingreso y el costo medios por envío (y por
 * kilómetro) que devuelve `calcularRentabilidad`.
 */
export function puntoEquilibrio(rent: Rentabilidad): PuntoEquilibrio {
  const enviosEquilibrio =
    rent.ingresoPorEnvio > 0 ? Math.ceil(rent.costoTotal / rent.ingresoPorEnvio) : 0;
  const kmEquilibrio = rent.ingresoPorKm > 0 ? Math.ceil(rent.costoTotal / rent.ingresoPorKm) : 0;

  return {
    ingresoPorEnvio: rent.ingresoPorEnvio,
    costoPorEnvio: rent.costoPorEnvio,
    enviosEquilibrio,
    kmEquilibrio,
    enviosActuales: rent.envios,
    kmActuales: rent.km,
    enviosDiferencia: enviosEquilibrio - rent.envios,
    kmDiferencia: kmEquilibrio - rent.km,
    cobertura: rent.costoTotal > 0 ? (rent.ingresos / rent.costoTotal) * 100 : 100,
    cubre: rent.margen >= 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Combustible
// ─────────────────────────────────────────────────────────────

export interface CargaDetallada extends CargaCombustible {
  placa: string | null;
  tipo_unidad: TipoUnidad | null;
  ruta_codigo: string | null;
  conductor: string | null;
}

export async function cargasDeCombustible(
  rango: Rango,
  unidadId?: number,
  limite = 200,
): Promise<CargaDetallada[]> {
  const filtro = unidadId ? 'AND c.unidad_id = $3' : '';
  const tope = limitar(limite, 200, 500);
  return all<CargaDetallada>(
    `SELECT c.*,
            u.placa AS placa,
            u.tipo  AS tipo_unidad,
            r.codigo AS ruta_codigo,
            co.nombre AS conductor
     FROM combustible c
     LEFT JOIN unidades u    ON u.id = c.unidad_id
     LEFT JOIN rutas r       ON r.id = c.ruta_id
     LEFT JOIN conductores co ON co.id = COALESCE(c.conductor_id, r.conductor_id)
     WHERE c.fecha BETWEEN $1 AND $2 ${filtro}
     ORDER BY c.fecha DESC, c.id DESC
     LIMIT ${tope}`,
    ...paramsUnidad(rango, unidadId),
  );
}

export interface KpisCombustible {
  cargas: number;
  galones: number;
  total: number;
  precioMedio: number;
  km: number;
  /** Rendimiento real del parque (km/galón). */
  rendimientoMedio: number;
  /** Rendimiento esperado ponderado por kilómetros. */
  rendimientoEsperado: number;
  /** Desviación porcentual del parque frente a lo esperado. */
  desviacion: number;
}

export async function kpisCombustible(
  rango: Rango,
  unidadId?: number,
  unidadesPrecalculadas?: RendimientoUnidad[],
): Promise<KpisCombustible> {
  const filtro = unidadId ? 'AND unidad_id = $3' : '';
  const filas = await all<{ galones: number; total: number; cargas: number }>(
    `SELECT COALESCE(SUM(galones), 0) AS galones,
            COALESCE(SUM(total), 0)   AS total,
            COUNT(*)                  AS cargas
     FROM combustible
     WHERE fecha BETWEEN $1 AND $2 ${filtro}`,
    ...paramsUnidad(rango, unidadId),
  );

  const galones = num(filas[0]?.galones);
  const total = num(filas[0]?.total);
  const cargas = num(filas[0]?.cargas);
  const km = await kmDelPeriodo(rango, unidadId);
  const real = rendimientoReal(km, galones);

  // Rendimiento esperado del parque: se pondera por kilómetros, de modo que el
  // promedio no lo distorsionen las unidades que casi no rodaron.
  const unidades = unidadesPrecalculadas ?? (await rendimientoPorUnidad(rango, unidadId));
  const esperadoPonderado = unidades.reduce(
    (s, u) => s + (u.esperado > 0 ? u.km / u.esperado : 0),
    0,
  );
  const esperado = esperadoPonderado > 0 ? km / esperadoPonderado : 0;

  return {
    cargas,
    galones,
    total,
    precioMedio: galones > 0 ? total / galones : 0,
    km,
    rendimientoMedio: real,
    rendimientoEsperado: esperado,
    desviacion: desviacionRendimiento(real, esperado),
  };
}

export interface RendimientoUnidad {
  unidadId: number;
  placa: string;
  tipo: TipoUnidad;
  km: number;
  galones: number;
  costo: number;
  cargas: number;
  /** Rendimiento real del período (km/galón). */
  real: number;
  /** Rendimiento esperado configurado en la unidad. */
  esperado: number;
  /** Desviación porcentual: negativo = rinde por debajo de lo esperado. */
  desviacion: number;
}

/**
 * Rendimiento de combustible por unidad. Una desviación negativa sostenida es
 * la señal de alerta de robo de combustible o de falla mecánica.
 */
export async function rendimientoPorUnidad(
  rango: Rango,
  unidadId?: number,
): Promise<RendimientoUnidad[]> {
  const filtro = unidadId ? 'AND c.unidad_id = $3' : '';
  const cargas = await all<{ unidad_id: number; galones: number; costo: number; cargas: number }>(
    `SELECT c.unidad_id AS unidad_id,
            COALESCE(SUM(c.galones), 0) AS galones,
            COALESCE(SUM(c.total), 0)   AS costo,
            COUNT(*)                    AS cargas
     FROM combustible c
     WHERE c.fecha BETWEEN $1 AND $2 ${filtro}
     GROUP BY c.unidad_id`,
    ...paramsUnidad(rango, unidadId),
  );

  const km = await kmPorUnidad(rango, unidadId);
  const ids = new Set<number>([...cargas.map((c) => num(c.unidad_id)), ...km.keys()]);
  if (unidadId) ids.add(unidadId);
  if (ids.size === 0) return [];

  const lista = [...ids];
  const unidades = await all<{
    id: number;
    placa: string;
    tipo: TipoUnidad;
    rendimiento_esperado: number;
  }>(
    `SELECT id, placa, tipo, rendimiento_esperado FROM unidades
     WHERE id IN (${lista.map((_, i) => `$${i + 1}`).join(', ')})`,
    ...lista,
  );

  const porCarga = new Map(cargas.map((c) => [num(c.unidad_id), c]));

  const filas: RendimientoUnidad[] = unidades.map((u) => {
    const galones = num(porCarga.get(num(u.id))?.galones);
    const kilometros = km.get(num(u.id)) ?? 0;
    const real = rendimientoReal(kilometros, galones);
    const esperado = num(u.rendimiento_esperado);
    // Sin kilómetros o sin cargas no hay comparación posible: marcar una
    // desviación del -100% en una unidad que no rodó sería un falso positivo.
    const comparable = kilometros > 0 && galones > 0 && esperado > 0;
    return {
      unidadId: num(u.id),
      placa: u.placa,
      tipo: u.tipo,
      km: kilometros,
      galones,
      costo: num(porCarga.get(num(u.id))?.costo),
      cargas: num(porCarga.get(num(u.id))?.cargas),
      real,
      esperado,
      desviacion: comparable ? desviacionRendimiento(real, esperado) : 0,
    };
  });

  // Primero las unidades comparables, de la que rinde peor a la que rinde
  // mejor: las que están por debajo de lo esperado son la señal de alerta.
  filas.sort((a, b) => {
    const aComparable = a.esperado > 0 && a.km > 0 && a.galones > 0 ? 0 : 1;
    const bComparable = b.esperado > 0 && b.km > 0 && b.galones > 0 ? 0 : 1;
    if (aComparable !== bComparable) return aComparable - bComparable;
    if (aComparable === 1) return a.placa.localeCompare(b.placa);
    return a.desviacion - b.desviacion;
  });

  return filas;
}

/** Unidades con movimiento en el período, para el filtro de la pestaña. */
export async function unidadesConCargas(rango: Rango): Promise<{ id: number; placa: string }[]> {
  return all<{ id: number; placa: string }>(
    `SELECT u.id, u.placa
     FROM unidades u
     WHERE EXISTS (SELECT 1 FROM combustible c
                    WHERE c.unidad_id = u.id AND c.fecha BETWEEN $1 AND $2)
        OR EXISTS (SELECT 1 FROM rutas r
                    WHERE r.unidad_id = u.id AND r.fecha BETWEEN $3 AND $4)
     ORDER BY u.placa`,
    rango.desde,
    rango.hasta,
    rango.desde,
    rango.hasta,
  );
}

// ─────────────────────────────────────────────────────────────
// Gastos de ruta
// ─────────────────────────────────────────────────────────────

export interface GastoDetallado extends Gasto {
  placa: string | null;
  ruta_codigo: string | null;
  conductor: string | null;
}

export interface FiltrosGastos {
  rango: Rango;
  categoria?: CategoriaGasto | 'todas';
  busqueda?: string;
  limite?: number;
}

/** WHERE compartido por la tabla y el resumen de gastos. */
function whereGastos(filtros: Omit<FiltrosGastos, 'limite'>): {
  sql: string;
  params: unknown[];
} {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  // Los marcadores de PostgreSQL son posicionales: cada condición usa el
  // número que le corresponde según los parámetros ya acumulados.
  const marcador = () => `$${params.length + 1}`;

  params.push(filtros.rango.desde, filtros.rango.hasta);
  condiciones.push('g.fecha BETWEEN $1 AND $2');

  if (filtros.categoria && filtros.categoria !== 'todas') {
    condiciones.push(`g.categoria = ${marcador()}`);
    params.push(filtros.categoria);
  }
  if (filtros.busqueda) {
    const like = `%${filtros.busqueda}%`;
    const m1 = marcador();
    params.push(like);
    const m2 = marcador();
    params.push(like);
    const m3 = marcador();
    params.push(like);
    const m4 = marcador();
    params.push(like);
    condiciones.push(
      `(g.descripcion LIKE ${m1} OR g.comprobante LIKE ${m2} OR u.placa LIKE ${m3} OR r.codigo LIKE ${m4})`,
    );
  }

  return { sql: condiciones.join(' AND '), params };
}

export async function gastosDelPeriodo(filtros: FiltrosGastos): Promise<GastoDetallado[]> {
  const { sql, params } = whereGastos(filtros);
  const tope = limitar(filtros.limite, 250, 500);
  return all<GastoDetallado>(
    `SELECT g.*,
            u.placa AS placa,
            r.codigo AS ruta_codigo,
            co.nombre AS conductor
     FROM gastos g
     LEFT JOIN unidades u     ON u.id = g.unidad_id
     LEFT JOIN rutas r        ON r.id = g.ruta_id
     LEFT JOIN conductores co ON co.id = r.conductor_id
     WHERE ${sql}
     ORDER BY g.fecha DESC, g.id DESC
     LIMIT ${tope}`,
    ...params,
  );
}

export interface ResumenGastos {
  total: number;
  numero: number;
  media: number;
  mayor: number;
  km: number;
  porKm: number;
  porCategoria: { categoria: string; total: number; n: number }[];
}

/** Resumen de gastos con los mismos filtros que la tabla. */
export async function resumenGastos(
  rango: Rango,
  filtros: { categoria?: CategoriaGasto | 'todas'; busqueda?: string } = {},
): Promise<ResumenGastos> {
  const { sql, params } = whereGastos({
    rango,
    categoria: filtros.categoria,
    busqueda: filtros.busqueda,
  });

  const filasCategoria = await all<{ categoria: string; total: number; n: number }>(
    `SELECT g.categoria AS categoria,
            COALESCE(SUM(g.monto), 0) AS total,
            COUNT(*) AS n
     FROM gastos g
     LEFT JOIN unidades u ON u.id = g.unidad_id
     LEFT JOIN rutas r    ON r.id = g.ruta_id
     WHERE ${sql}
     GROUP BY g.categoria
     ORDER BY total DESC`,
    ...params,
  );
  const porCategoria = filasCategoria.map((f) => ({
    categoria: f.categoria,
    total: num(f.total),
    n: num(f.n),
  }));

  const total = porCategoria.reduce((s, c) => s + c.total, 0);
  const numero = porCategoria.reduce((s, c) => s + c.n, 0);
  const mayor = num(
    await escalar<number>(
      `SELECT COALESCE(MAX(g.monto), 0)
       FROM gastos g
       LEFT JOIN unidades u ON u.id = g.unidad_id
       LEFT JOIN rutas r    ON r.id = g.ruta_id
       WHERE ${sql}`,
      ...params,
    ),
  );
  const km = await kmDelPeriodo(rango);

  return {
    total,
    numero,
    media: numero > 0 ? total / numero : 0,
    mayor,
    km,
    porKm: km > 0 ? total / km : 0,
    porCategoria,
  };
}

// ─────────────────────────────────────────────────────────────
// Rentabilidad por ruta
// ─────────────────────────────────────────────────────────────

export interface FilaRentabilidadRuta {
  rutaId: number;
  codigo: string;
  fecha: string;
  zona: string;
  estado: string;
  unidadId: number | null;
  placa: string | null;
  tipoUnidad: TipoUnidad | null;
  conductor: string | null;
  tipoVinculacion: 'empleado' | 'contratista' | null;
  comisionPct: number;
  envios: number;
  galones: number;
  rentabilidad: Rentabilidad;
}

interface RutaBase {
  id: number;
  codigo: string;
  fecha: string;
  zona: string;
  estado: string;
  unidad_id: number | null;
  placa: string | null;
  tipo_unidad: TipoUnidad | null;
  conductor: string | null;
  tipo_vinculacion: 'empleado' | 'contratista' | null;
  comision_pct: number | null;
  envios: number;
  ingresos: number;
}

/**
 * Rentabilidad de cada ruta del período.
 *
 * El combustible y los gastos salen de las tablas de costo; el mantenimiento se
 * prorratea con el costo por kilómetro histórico de la unidad (`costosDeRuta`),
 * porque no se registra por ruta. El resultado se ordena de peor a mejor margen
 * para que lo primero que se vea sean las rutas que pierden dinero.
 */
export async function rentabilidadPorRuta(
  rango: Rango,
  limite = 400,
): Promise<FilaRentabilidadRuta[]> {
  const tope = limitar(limite, 400, 500);
  const rutas = await all<RutaBase>(
    `SELECT r.id, r.codigo, r.fecha, r.zona, r.estado, r.unidad_id,
            u.placa AS placa,
            u.tipo  AS tipo_unidad,
            c.nombre AS conductor,
            c.tipo_vinculacion AS tipo_vinculacion,
            c.comision_pct AS comision_pct,
            (SELECT COUNT(*) FROM envios e
              WHERE e.ruta_id = r.id AND e.estado = 'entregado') AS envios,
            (SELECT COALESCE(SUM(e.flete), 0) FROM envios e
              WHERE e.ruta_id = r.id AND e.estado = 'entregado') AS ingresos
     FROM rutas r
     LEFT JOIN unidades u    ON u.id = r.unidad_id
     LEFT JOIN conductores c ON c.id = r.conductor_id
     WHERE r.fecha BETWEEN $1 AND $2 AND r.estado <> 'cancelado'
     ORDER BY r.fecha DESC, r.codigo
     LIMIT ${tope}`,
    rango.desde,
    rango.hasta,
  );

  const filas: FilaRentabilidadRuta[] = await Promise.all(
    rutas.map(async (r) => {
      const costos = await costosDeRuta(num(r.id));
      const ingresos = num(r.ingresos);
      const comision = comisionDeRuta(r.tipo_vinculacion, r.comision_pct, ingresos);

      return {
        rutaId: num(r.id),
        codigo: r.codigo,
        fecha: r.fecha,
        zona: r.zona,
        estado: r.estado,
        unidadId: r.unidad_id == null ? null : num(r.unidad_id),
        placa: r.placa,
        tipoUnidad: r.tipo_unidad,
        conductor: r.conductor,
        tipoVinculacion: r.tipo_vinculacion,
        comisionPct: num(r.comision_pct),
        envios: num(r.envios),
        galones: costos.galones,
        rentabilidad: calcularRentabilidad({
          ingresos,
          combustible: costos.combustible,
          gastos: costos.gastos,
          mantenimiento: costos.mantenimientoProrrateado,
          comisionConductor: comision,
          km: costos.km,
          envios: num(r.envios),
        }),
      };
    }),
  );

  // De peor a mejor margen porcentual: las rutas en pérdida van primero.
  filas.sort((a, b) => a.rentabilidad.margenPct - b.rentabilidad.margenPct);
  return filas;
}

// ─────────────────────────────────────────────────────────────
// Rentabilidad por unidad
// ─────────────────────────────────────────────────────────────

export interface FilaRentabilidadUnidad {
  unidadId: number | null;
  placa: string;
  tipo: TipoUnidad | null;
  rutas: number;
  envios: number;
  galones: number;
  /** Costo histórico de mantenimiento por kilómetro de la unidad. */
  costoMantenimientoPorKm: number;
  rentabilidad: Rentabilidad;
}

/**
 * Agregado del período por unidad, con el mismo desglose que las rutas. El
 * costo de mantenimiento se imputa por kilómetro recorrido, igual que en el
 * detalle de ruta, para que la suma sea coherente.
 *
 * Se puede pasar la lista de rutas ya calculada: así el informe no repite el
 * costeo ruta por ruta y los totales por unidad coinciden exactamente con la
 * tabla de rutas que ve el usuario.
 */
export async function rentabilidadPorUnidad(
  rango: Rango,
  rutasPrecalculadas?: FilaRentabilidadRuta[],
): Promise<FilaRentabilidadUnidad[]> {
  const rutas = rutasPrecalculadas ?? (await rentabilidadPorRuta(rango, 500));
  const grupos = new Map<string, FilaRentabilidadRuta[]>();

  for (const r of rutas) {
    const clave = r.unidadId == null ? 'sin-unidad' : String(r.unidadId);
    const lista = grupos.get(clave) ?? [];
    lista.push(r);
    grupos.set(clave, lista);
  }

  const filas: FilaRentabilidadUnidad[] = await Promise.all(
    [...grupos.values()].map(async (grupo) => {
      const primera = grupo[0];
      const ingresos = grupo.reduce((s, r) => s + r.rentabilidad.ingresos, 0);
      const combustible = grupo.reduce((s, r) => s + r.rentabilidad.combustible, 0);
      const gastos = grupo.reduce((s, r) => s + r.rentabilidad.gastos, 0);
      const mantenimiento = grupo.reduce((s, r) => s + r.rentabilidad.mantenimiento, 0);
      const comision = grupo.reduce((s, r) => s + r.rentabilidad.comisionConductor, 0);
      const km = grupo.reduce((s, r) => s + r.rentabilidad.km, 0);
      const envios = grupo.reduce((s, r) => s + r.rentabilidad.envios, 0);
      const galones = grupo.reduce((s, r) => s + r.galones, 0);
      const costoPorKm =
        primera.unidadId == null ? 0 : await costoMantenimientoPorKm(primera.unidadId);

      return {
        unidadId: primera.unidadId,
        placa: primera.placa ?? 'Sin unidad asignada',
        tipo: primera.tipoUnidad,
        rutas: grupo.length,
        envios,
        galones,
        costoMantenimientoPorKm: costoPorKm,
        rentabilidad: calcularRentabilidad({
          ingresos,
          combustible,
          gastos,
          mantenimiento,
          comisionConductor: comision,
          km,
          envios,
        }),
      };
    }),
  );

  filas.sort((a, b) => a.rentabilidad.margenPct - b.rentabilidad.margenPct);
  return filas;
}

/** Filtra las filas cuyo diagnóstico es pérdida: lo más accionable del informe. */
export function soloPerdidas<T extends { rentabilidad: Rentabilidad }>(filas: T[]): T[] {
  return filas.filter((f) => f.rentabilidad.diagnostico === 'perdida');
}
