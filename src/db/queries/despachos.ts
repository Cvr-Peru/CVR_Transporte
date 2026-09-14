/**
 * Consultas del módulo de despachos: rutas, paradas y envíos.
 */
import { all, escalar, get } from '@/db/client';
import type {
  Conductor,
  EnvioDetallado,
  EstadoEnvio,
  EstadoRuta,
  FotoEntregaDetallada,
  Parada,
  ParadaConEnvios,
  Posicion,
  Ruta,
  RutaResumen,
  Unidad,
} from '@/db/tipos';

export interface FiltrosRutas {
  desde?: string;
  hasta?: string;
  estado?: EstadoRuta | 'todas';
  zona?: string;
  conductorId?: number;
  unidadId?: number;
  busqueda?: string;
  limite?: number;
}

/** Construye el WHERE compartido por las consultas de rutas. */
function whereRutas(f: FiltrosRutas): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (f.desde) {
    params.push(f.desde);
    condiciones.push(`r.fecha >= $${params.length}`);
  }
  if (f.hasta) {
    params.push(f.hasta);
    condiciones.push(`r.fecha <= $${params.length}`);
  }
  if (f.estado && f.estado !== 'todas') {
    params.push(f.estado);
    condiciones.push(`r.estado = $${params.length}`);
  }
  if (f.zona) {
    params.push(f.zona);
    condiciones.push(`r.zona = $${params.length}`);
  }
  if (f.conductorId) {
    params.push(f.conductorId);
    condiciones.push(`r.conductor_id = $${params.length}`);
  }
  if (f.unidadId) {
    params.push(f.unidadId);
    condiciones.push(`r.unidad_id = $${params.length}`);
  }
  if (f.busqueda) {
    const like = `%${f.busqueda}%`;
    params.push(like, like, like, like);
    const n = params.length - 3;
    condiciones.push(
      `(r.codigo LIKE $${n} OR r.zona LIKE $${n + 1} OR u.placa LIKE $${n + 2} OR c.nombre LIKE $${n + 3})`,
    );
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

const SELECT_RUTA_RESUMEN = `
  SELECT r.*,
    u.placa              AS placa,
    u.tipo               AS tipo_unidad,
    c.nombre             AS conductor,
    c.codigo             AS conductor_codigo,
    (SELECT COUNT(*) FROM paradas p WHERE p.ruta_id = r.id) AS total_paradas,
    (SELECT COUNT(*) FROM paradas p WHERE p.ruta_id = r.id AND p.estado IN ('entregado','fallido')) AS paradas_resueltas,
    (SELECT COUNT(*) FROM envios e WHERE e.ruta_id = r.id) AS total_envios,
    (SELECT COUNT(*) FROM envios e WHERE e.ruta_id = r.id AND e.estado = 'entregado') AS envios_entregados,
    (SELECT COUNT(*) FROM envios e WHERE e.ruta_id = r.id AND e.estado IN ('novedad','devuelto')) AS envios_novedad,
    (SELECT COALESCE(SUM(e.flete), 0) FROM envios e WHERE e.ruta_id = r.id AND e.estado = 'entregado') AS ingresos
  FROM rutas r
  LEFT JOIN unidades u    ON u.id = r.unidad_id
  LEFT JOIN conductores c ON c.id = r.conductor_id
`;

export async function listarRutas(filtros: FiltrosRutas = {}): Promise<RutaResumen[]> {
  const { sql, params } = whereRutas(filtros);
  const limite = filtros.limite ?? 200;
  return all<RutaResumen>(
    `${SELECT_RUTA_RESUMEN} ${sql} ORDER BY r.fecha DESC, r.hora_salida DESC LIMIT ${limite}`,
    ...params,
  );
}

export async function obtenerRuta(id: number): Promise<RutaResumen | null> {
  return get<RutaResumen>(`${SELECT_RUTA_RESUMEN} WHERE r.id = $1`, id);
}

/**
 * La hoja de ruta que un conductor tiene entre manos ahora mismo.
 *
 * Se prefiere la que está en curso y, si no hay ninguna, la última asignada que
 * siga abierta: es lo que el conductor espera encontrar al abrir «Mi ruta» de
 * madrugada, antes de que despacho la haya iniciado.
 */
export async function rutaEnCursoDeConductor(conductorId: number): Promise<RutaResumen | null> {
  return get<RutaResumen>(
    `${SELECT_RUTA_RESUMEN}
     WHERE r.conductor_id = $1 AND r.estado IN ('en_curso','planificado')
     ORDER BY CASE r.estado WHEN 'en_curso' THEN 0 ELSE 1 END, r.fecha DESC, r.id DESC
     LIMIT 1`,
    conductorId,
  );
}

/**
 * Primera ruta en curso, para quien entra a «Mi ruta» sin ser conductor.
 *
 * Sirve para que despacho y administración puedan ver la pantalla tal como la ve
 * el conductor, sin tener que suplantar a nadie.
 */
export async function primeraRutaEnCurso(): Promise<RutaResumen | null> {
  return get<RutaResumen>(
    `${SELECT_RUTA_RESUMEN} WHERE r.estado = 'en_curso' ORDER BY r.fecha DESC, r.id DESC LIMIT 1`,
  );
}

/**
 * Última ruta de un conductor, aunque ya esté cerrada.
 *
 * Los datos de ejemplo son fijos y el calendario no: al cabo de unos días, las
 * rutas que estaban «en curso» pasan a ser pasado y el conductor se encontraría
 * una pantalla vacía. Con esto sigue viendo su último reparto, marcado como
 * cerrado y sin botones para entregar, que es lo que vería en la realidad al
 * abrir la aplicación un día sin ruta asignada.
 */
export async function ultimaRutaDeConductor(conductorId: number): Promise<RutaResumen | null> {
  return get<RutaResumen>(
    `${SELECT_RUTA_RESUMEN} WHERE r.conductor_id = $1 ORDER BY r.fecha DESC, r.id DESC LIMIT 1`,
    conductorId,
  );
}

/** Última ruta registrada, para que la oficina siempre pueda abrir «Mi ruta». */
export async function ultimaRuta(): Promise<RutaResumen | null> {
  return get<RutaResumen>(`${SELECT_RUTA_RESUMEN} ORDER BY r.fecha DESC, r.id DESC LIMIT 1`);
}

export async function contarRutasPorEstado(
  filtros: FiltrosRutas = {},
): Promise<Record<string, number>> {
  const { sql, params } = whereRutas(filtros);
  const filas = await all<{ estado: string; n: number }>(
    `SELECT r.estado, COUNT(*) AS n
     FROM rutas r
     LEFT JOIN unidades u    ON u.id = r.unidad_id
     LEFT JOIN conductores c ON c.id = r.conductor_id
     ${sql} GROUP BY r.estado`,
    ...params,
  );
  return Object.fromEntries(filas.map((f) => [f.estado, Number(f.n)]));
}

/** Paradas de una ruta, ordenadas, cada una con sus envíos. */
export async function paradasDeRuta(rutaId: number): Promise<ParadaConEnvios[]> {
  const paradas = await all<Parada>(
    'SELECT * FROM paradas WHERE ruta_id = $1 ORDER BY orden',
    rutaId,
  );
  if (paradas.length === 0) return [];

  const envios = await all<EnvioDetallado>(
    `SELECT e.*, cl.nombre AS cliente, r.codigo AS ruta_codigo, co.nombre AS conductor, u.placa AS placa
     FROM envios e
     JOIN clientes cl       ON cl.id = e.cliente_id
     LEFT JOIN rutas r      ON r.id = e.ruta_id
     LEFT JOIN conductores co ON co.id = r.conductor_id
     LEFT JOIN unidades u   ON u.id = r.unidad_id
     WHERE e.ruta_id = $1
     ORDER BY e.id`,
    rutaId,
  );

  const porParada = new Map<number, EnvioDetallado[]>();
  for (const e of envios) {
    if (e.parada_id == null) continue;
    const lista = porParada.get(e.parada_id) ?? [];
    lista.push(e);
    porParada.set(e.parada_id, lista);
  }

  return paradas.map((p) => ({ ...p, envios: porParada.get(p.id) ?? [] }));
}

/** Rastro de telemetría de una ruta, en orden cronológico. */
export async function posicionesDeRuta(rutaId: number): Promise<Posicion[]> {
  return all<Posicion>(
    'SELECT * FROM posiciones WHERE ruta_id = $1 ORDER BY timestamp',
    rutaId,
  );
}

/**
 * Fotos de prueba de entrega de una ruta, **sin los bytes de la imagen**.
 *
 * Se listan solo los metadatos; la imagen la sirve `/api/foto/<id>` cuando
 * alguien la mira. Un `SELECT *` traería aquí todos los JPEG de la ruta y
 * multiplicaría el peso de la consulta sin que nadie los vea.
 */
export async function fotosDeRuta(rutaId: number): Promise<FotoEntregaDetallada[]> {
  return all<FotoEntregaDetallada>(
    `SELECT f.id, f.parada_id, f.ruta_id, f.tipo_mime, f.tamano_bytes, f.ancho, f.alto,
            f.lat, f.lng, f.tomada_en, f.subida_por, f.created_at,
            u.nombre AS subida_por_nombre
     FROM fotos_entrega f
     LEFT JOIN usuarios u ON u.id = f.subida_por
     WHERE f.ruta_id = $1
     ORDER BY f.id`,
    rutaId,
  );
}

export interface CostosRuta {
  combustible: number;
  gastos: number;
  mantenimientoProrrateado: number;
  costoMantenimientoPorKm: number;
  galones: number;
  km: number;
}

/**
 * Costos directos de una ruta.
 *
 * El mantenimiento no se registra por ruta sino por unidad, así que se prorratea
 * con el costo de mantenimiento por kilómetro histórico de esa unidad. Es una
 * aproximación de costeo, no una imputación contable exacta.
 */
export async function costosDeRuta(rutaId: number): Promise<CostosRuta> {
  const combustible = (await escalar<number>(
    'SELECT COALESCE(SUM(total), 0) FROM combustible WHERE ruta_id = $1',
    rutaId,
  )) ?? 0;
  const galones = (await escalar<number>(
    'SELECT COALESCE(SUM(galones), 0) FROM combustible WHERE ruta_id = $1',
    rutaId,
  )) ?? 0;
  const gastos = (await escalar<number>(
    'SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE ruta_id = $1',
    rutaId,
  )) ?? 0;

  const ruta = await get<Ruta>('SELECT * FROM rutas WHERE id = $1', rutaId);
  const km =
    ruta?.km_inicial != null && ruta?.km_final != null
      ? Math.max(0, ruta.km_final - ruta.km_inicial)
      : 0;

  const porKm = ruta?.unidad_id ? await costoMantenimientoPorKm(ruta.unidad_id) : 0;

  return {
    combustible: Number(combustible),
    gastos: Number(gastos),
    galones: Number(galones),
    km,
    costoMantenimientoPorKm: porKm,
    mantenimientoProrrateado: km * porKm,
  };
}

/**
 * Costo de mantenimiento por kilómetro de una unidad: costo histórico acumulado
 * dividido entre el kilometraje total de la unidad.
 */
export async function costoMantenimientoPorKm(unidadId: number): Promise<number> {
  const total = (await escalar<number>(
    'SELECT COALESCE(SUM(costo), 0) FROM mantenimientos WHERE unidad_id = $1',
    unidadId,
  )) ?? 0;
  const km =
    (await escalar<number>('SELECT km_actual FROM unidades WHERE id = $1', unidadId)) ?? 0;
  return km > 0 ? Number(total) / Number(km) : 0;
}

// ─────────────────────────────────────────────────────────────
// Envíos
// ─────────────────────────────────────────────────────────────
export interface FiltrosEnvios {
  desde?: string;
  hasta?: string;
  estado?: EstadoEnvio | 'todos';
  clienteId?: number;
  zona?: string;
  busqueda?: string;
  conNovedad?: boolean;
  /**
   * Acota los envíos a los de las rutas de un conductor.
   *
   * Necesario para el alcance de datos: un conductor solo debe ver sus propios
   * envíos. Sin esto, los totales agregados de la página de despachos
   * mostrarían cifras de toda la operación.
   */
  conductorId?: number;
  limite?: number;
}

export async function listarEnvios(filtros: FiltrosEnvios = {}): Promise<EnvioDetallado[]> {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (filtros.desde) {
    params.push(filtros.desde);
    condiciones.push(`r.fecha >= $${params.length}`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    condiciones.push(`r.fecha <= $${params.length}`);
  }
  if (filtros.estado && filtros.estado !== 'todos') {
    params.push(filtros.estado);
    condiciones.push(`e.estado = $${params.length}`);
  }
  if (filtros.clienteId) {
    params.push(filtros.clienteId);
    condiciones.push(`e.cliente_id = $${params.length}`);
  }
  if (filtros.zona) {
    params.push(filtros.zona);
    condiciones.push(`e.zona = $${params.length}`);
  }
  if (filtros.conNovedad) {
    condiciones.push("e.estado IN ('novedad','devuelto')");
  }
  if (filtros.conductorId !== undefined) {
    params.push(filtros.conductorId);
    condiciones.push(`r.conductor_id = $${params.length}`);
  }
  if (filtros.busqueda) {
    const like = `%${filtros.busqueda}%`;
    params.push(like, like, like);
    const n = params.length - 2;
    condiciones.push(
      `(e.guia LIKE $${n} OR e.destinatario LIKE $${n + 1} OR e.direccion LIKE $${n + 2})`,
    );
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limite = filtros.limite ?? 300;

  return all<EnvioDetallado>(
    `SELECT e.*,
            cl.nombre AS cliente,
            r.codigo  AS ruta_codigo,
            co.nombre AS conductor,
            u.placa   AS placa
     FROM envios e
     JOIN clientes cl         ON cl.id = e.cliente_id
     LEFT JOIN rutas r        ON r.id = e.ruta_id
     LEFT JOIN conductores co ON co.id = r.conductor_id
     LEFT JOIN unidades u     ON u.id = r.unidad_id
     ${where}
     ORDER BY COALESCE(r.fecha, substr(e.created_at, 1, 10)) DESC, e.id DESC
     LIMIT ${limite}`,
    ...params,
  );
}

export async function contarEnviosPorEstado(
  filtros: FiltrosEnvios = {},
): Promise<{ estado: string; n: number }[]> {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (filtros.desde) {
    params.push(filtros.desde);
    condiciones.push(`r.fecha >= $${params.length}`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    condiciones.push(`r.fecha <= $${params.length}`);
  }
  if (filtros.clienteId) {
    params.push(filtros.clienteId);
    condiciones.push(`e.cliente_id = $${params.length}`);
  }
  if (filtros.conductorId !== undefined) {
    params.push(filtros.conductorId);
    condiciones.push(`r.conductor_id = $${params.length}`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return all<{ estado: string; n: number }>(
    `SELECT e.estado, COUNT(*) AS n
     FROM envios e
     LEFT JOIN rutas r ON r.id = e.ruta_id
     ${where} GROUP BY e.estado`,
    ...params,
  );
}

export async function obtenerEnvio(id: number): Promise<EnvioDetallado | null> {
  return get<EnvioDetallado>(
    `SELECT e.*, cl.nombre AS cliente, r.codigo AS ruta_codigo, co.nombre AS conductor, u.placa AS placa
     FROM envios e
     JOIN clientes cl         ON cl.id = e.cliente_id
     LEFT JOIN rutas r        ON r.id = e.ruta_id
     LEFT JOIN conductores co ON co.id = r.conductor_id
     LEFT JOIN unidades u     ON u.id = r.unidad_id
     WHERE e.id = $1`,
    id,
  );
}

/** Busca un envío por número de guía (para el rastreo público). */
export async function buscarPorGuia(guia: string): Promise<EnvioDetallado | null> {
  return get<EnvioDetallado>(
    `SELECT e.*, cl.nombre AS cliente, r.codigo AS ruta_codigo, co.nombre AS conductor, u.placa AS placa
     FROM envios e
     JOIN clientes cl         ON cl.id = e.cliente_id
     LEFT JOIN rutas r        ON r.id = e.ruta_id
     LEFT JOIN conductores co ON co.id = r.conductor_id
     LEFT JOIN unidades u     ON u.id = r.unidad_id
     WHERE LOWER(e.guia) = LOWER($1)`,
    guia.trim(),
  );
}

/** Novedades de un envío, de la más reciente a la más antigua. */
export async function novedadesDeEnvio(envioId: number) {
  return all<{ id: number; tipo: string; descripcion: string | null; fecha: string; resuelto: number }>(
    'SELECT * FROM novedades WHERE envio_id = $1 ORDER BY fecha DESC',
    envioId,
  );
}

/** Novedades abiertas (no resueltas) con datos del envío. */
export async function novedadesAbiertas(limite = 50) {
  return all<{
    id: number;
    tipo: string;
    descripcion: string | null;
    fecha: string;
    guia: string;
    destinatario: string;
    cliente: string;
    telefono: string | null;
    zona: string | null;
  }>(
    `SELECT n.id, n.tipo, n.descripcion, n.fecha,
            e.guia, e.destinatario, e.destinatario_tel AS telefono, e.zona,
            cl.nombre AS cliente
     FROM novedades n
     JOIN envios e    ON e.id = n.envio_id
     JOIN clientes cl ON cl.id = e.cliente_id
     WHERE n.resuelto = 0
     ORDER BY n.fecha DESC
     LIMIT ${limite}`,
  );
}

// ─────────────────────────────────────────────────────────────
// Catálogos para formularios de despacho
// ─────────────────────────────────────────────────────────────
export async function unidadesAsignables(): Promise<Unidad[]> {
  return all<Unidad>(
    `SELECT * FROM unidades
     WHERE estado IN ('disponible','en_ruta') AND tipo IS NOT NULL
     ORDER BY placa`,
  );
}

export async function conductoresAsignables(): Promise<Conductor[]> {
  return all<Conductor>(
    `SELECT * FROM conductores WHERE estado = 'activo' ORDER BY nombre`,
  );
}

export async function zonasOperativas(): Promise<string[]> {
  const filas = await all<{ zona: string }>(
    'SELECT DISTINCT zona FROM rutas ORDER BY zona',
  );
  return filas.map((r) => r.zona);
}

/** Clientes activos, para formularios de creación de envíos. */
export async function clientesActivos() {
  return all<{ id: number; nombre: string; codigo: string; tarifa_base: number; tarifa_kg: number }>(
    'SELECT id, nombre, codigo, tarifa_base, tarifa_kg FROM clientes WHERE activo = 1 ORDER BY nombre',
  );
}

/**
 * Sugerencia de secuencia de paradas: ordena un conjunto de puntos con la
 * heurística del vecino más cercano partiendo del punto más al norte.
 * No pretende reemplazar un optimizador real, pero evita rutas en zigzag.
 */
export function ordenarParadasPorCercania<T extends { lat: number; lng: number }>(
  puntos: T[],
): T[] {
  if (puntos.length <= 2) return [...puntos];
  const restantes = [...puntos];
  restantes.sort((a, b) => b.lat - a.lat);
  const ruta: T[] = [restantes.shift()!];

  while (restantes.length > 0) {
    const actual = ruta[ruta.length - 1];
    let mejorIdx = 0;
    let mejorDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < restantes.length; i++) {
      const d =
        (restantes[i].lat - actual.lat) ** 2 + (restantes[i].lng - actual.lng) ** 2;
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }
    ruta.push(restantes.splice(mejorIdx, 1)[0]);
  }
  return ruta;
}
