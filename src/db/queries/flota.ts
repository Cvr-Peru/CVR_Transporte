/**
 * Consultas del módulo de flota: unidades, documentación legal y mantenimiento.
 *
 * Nota de diseño: el estado documental de una unidad NO es una columna, se
 * calcula a partir de los vencimientos con las reglas de `@/lib/domain`. Por eso
 * los agregados se resuelven con la fecha local en JavaScript y nunca con
 * `date('now')` de SQLite, que trabaja en UTC y desplaza un día en Colombia.
 */
import { umbrales } from '@/config/empresa';
import { all, escalar, get } from '@/db/client';
import type {
  DocumentoConUnidad,
  EstadoUnidad,
  MantenimientoConUnidad,
  TipoDocumento,
  TipoUnidad,
  Unidad,
} from '@/db/tipos';
import { esOperable, estadoVencimiento, nivelMasGrave, type NivelAlerta } from '@/lib/domain';
import { aISO, hoyISO, sumarDias } from '@/lib/format';
import { rangoUltimosDias } from '@/lib/periodos';

/**
 * Los `LIMIT` son la única excepción a la regla de los marcadores `$1, $2, …`:
 * se interpolan como número entero ya validado, nunca como texto de la URL.
 */
function limiteSeguro(valor: number | undefined, porDefecto: number): number {
  const n = Math.trunc(valor ?? porDefecto);
  if (!Number.isFinite(n) || n <= 0) return porDefecto;
  return Math.min(n, 1000);
}

// ─────────────────────────────────────────────────────────────
// Unidades
// ─────────────────────────────────────────────────────────────
export interface FiltrosUnidades {
  estado?: EstadoUnidad | 'todas';
  tipo?: TipoUnidad | 'todos';
  busqueda?: string;
  limite?: number;
}

/** Estado documental agregado de una unidad. */
export interface EstadoDocumentalUnidad {
  total_documentos: number;
  documentos_vencidos: number;
  /** Nivel más grave entre los documentos de la unidad. */
  nivel_documental: NivelAlerta;
  /** `false` si algún documento está vencido: la unidad no debería operar. */
  operable: boolean;
  /** Vencimiento que exige atención: el más antiguo si ya venció. */
  vencimiento_critico: string | null;
}

export interface UnidadFlota extends Unidad, EstadoDocumentalUnidad {
  /** Conductor fijo asignado, si la unidad tiene uno. */
  conductor: string | null;
}

/** WHERE compartido por las consultas de unidades. */
function whereUnidades(f: FiltrosUnidades): { sql: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  // Los marcadores de PostgreSQL son posicionales: cada condición usa el
  // número que le corresponde según los parámetros ya acumulados.
  const marcador = () => `$${params.length + 1}`;

  if (f.estado && f.estado !== 'todas') {
    condiciones.push(`u.estado = ${marcador()}`);
    params.push(f.estado);
  }
  if (f.tipo && f.tipo !== 'todos') {
    condiciones.push(`u.tipo = ${marcador()}`);
    params.push(f.tipo);
  }
  if (f.busqueda) {
    const like = `%${f.busqueda}%`;
    const m1 = marcador();
    params.push(like);
    const m2 = marcador();
    params.push(like);
    const m3 = marcador();
    params.push(like);
    condiciones.push(`(u.placa LIKE ${m1} OR u.marca LIKE ${m2} OR u.modelo LIKE ${m3})`);
  }

  return {
    sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

/**
 * Vencimientos de los documentos de las unidades que cumplen el filtro, en
 * orden ascendente de fecha: así el primero de cada nivel de alerta es el
 * documento más urgente.
 */
async function vencimientosDeUnidades(
  filtros: FiltrosUnidades,
): Promise<{ unidad_id: number; vencimiento: string }[]> {
  const { sql, params } = whereUnidades(filtros);
  return all<{ unidad_id: number; vencimiento: string }>(
    `SELECT d.unidad_id, d.vencimiento
     FROM documentos_unidad d
     JOIN unidades u ON u.id = d.unidad_id
     ${sql}
     ORDER BY d.vencimiento, d.id`,
    ...params,
  );
}

/** Resume una lista de vencimientos en el estado documental de la unidad. */
function estadoDocumental(vencimientos: string[]): EstadoDocumentalUnidad {
  const estados = vencimientos.map((v) => ({ fecha: v, estado: estadoVencimiento(v) }));
  const nivel = nivelMasGrave(estados.map((e) => e.estado.nivel));
  const critico = estados.find((e) => e.estado.nivel === nivel) ?? null;

  return {
    total_documentos: vencimientos.length,
    documentos_vencidos: estados.filter((e) => e.estado.nivel === 'vencido').length,
    nivel_documental: nivel,
    operable: esOperable(nivel),
    vencimiento_critico: critico?.fecha ?? null,
  };
}

/** Unidades del parque con su conductor fijo y su estado documental agregado. */
export async function listarUnidades(filtros: FiltrosUnidades = {}): Promise<UnidadFlota[]> {
  const { sql, params } = whereUnidades(filtros);

  const filas = await all<Unidad & { conductor: string | null }>(
    `SELECT u.*, c.nombre AS conductor
     FROM unidades u
     LEFT JOIN conductores c ON c.id = u.conductor_fijo_id
     ${sql}
     ORDER BY u.placa
     LIMIT ${limiteSeguro(filtros.limite, 300)}`,
    ...params,
  );

  // Los documentos de todas las unidades filtradas se traen en una sola
  // consulta y se agrupan en memoria: el nivel de alerta depende de hoy.
  const porUnidad = new Map<number, string[]>();
  for (const d of await vencimientosDeUnidades(filtros)) {
    const lista = porUnidad.get(d.unidad_id);
    if (lista) lista.push(d.vencimiento);
    else porUnidad.set(d.unidad_id, [d.vencimiento]);
  }

  return filas.map((f) => ({
    ...f,
    ...estadoDocumental(porUnidad.get(f.id) ?? []),
  }));
}

export interface KpisUnidades {
  total: number;
  disponibles: number;
  enRuta: number;
  enMantenimiento: number;
  fueraServicio: number;
  /** Unidades con al menos un documento vencido. */
  noOperables: number;
}

export async function kpisUnidades(): Promise<KpisUnidades> {
  const porEstado = await all<{ estado: EstadoUnidad; n: number }>(
    'SELECT estado, COUNT(*) AS n FROM unidades GROUP BY estado',
  );
  const mapa = new Map<EstadoUnidad, number>(porEstado.map((f) => [f.estado, Number(f.n)]));

  const documentos = await all<{ unidad_id: number; vencimiento: string }>(
    'SELECT unidad_id, vencimiento FROM documentos_unidad',
  );
  const conVencidos = new Set(
    documentos
      .filter((d) => !esOperable(estadoVencimiento(d.vencimiento).nivel))
      .map((d) => d.unidad_id),
  );

  return {
    total: porEstado.reduce((s, f) => s + Number(f.n), 0),
    disponibles: mapa.get('disponible') ?? 0,
    enRuta: mapa.get('en_ruta') ?? 0,
    enMantenimiento: mapa.get('mantenimiento') ?? 0,
    fueraServicio: mapa.get('fuera_servicio') ?? 0,
    noOperables: conVencidos.size,
  };
}

// ─────────────────────────────────────────────────────────────
// Documentación legal
// ─────────────────────────────────────────────────────────────
export interface FiltrosDocumentos {
  tipo?: TipoDocumento | 'todos';
  nivel?: NivelAlerta | 'todos';
  busqueda?: string;
  limite?: number;
}

/** Documentos de todas las unidades, del más urgente al más lejano. */
export async function listarDocumentos(
  filtros: FiltrosDocumentos = {},
): Promise<DocumentoConUnidad[]> {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  // Los marcadores de PostgreSQL son posicionales: cada condición usa el
  // número que le corresponde según los parámetros ya acumulados.
  const marcador = () => `$${params.length + 1}`;

  if (filtros.tipo && filtros.tipo !== 'todos') {
    condiciones.push(`d.tipo = ${marcador()}`);
    params.push(filtros.tipo);
  }
  if (filtros.busqueda) {
    const like = `%${filtros.busqueda}%`;
    const m1 = marcador();
    params.push(like);
    const m2 = marcador();
    params.push(like);
    const m3 = marcador();
    params.push(like);
    condiciones.push(`(u.placa LIKE ${m1} OR d.numero LIKE ${m2} OR d.entidad LIKE ${m3})`);
  }

  // El nivel de alerta se traduce a cortes de fecha calculados en JS, de modo
  // que el filtro en SQL coincida exactamente con `estadoVencimiento()`.
  if (filtros.nivel && filtros.nivel !== 'todos') {
    const hoy = hoyISO();
    const corteCritico = aISO(sumarDias(new Date(), umbrales.critico));
    const cortePreventivo = aISO(sumarDias(new Date(), umbrales.preventivo));

    if (filtros.nivel === 'vencido') {
      condiciones.push(`d.vencimiento < ${marcador()}`);
      params.push(hoy);
    } else if (filtros.nivel === 'critico') {
      const m1 = marcador();
      params.push(hoy);
      const m2 = marcador();
      params.push(corteCritico);
      condiciones.push(`d.vencimiento >= ${m1} AND d.vencimiento <= ${m2}`);
    } else if (filtros.nivel === 'proximo') {
      const m1 = marcador();
      params.push(corteCritico);
      const m2 = marcador();
      params.push(cortePreventivo);
      condiciones.push(`d.vencimiento > ${m1} AND d.vencimiento <= ${m2}`);
    } else {
      condiciones.push(`d.vencimiento > ${marcador()}`);
      params.push(cortePreventivo);
    }
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return all<DocumentoConUnidad>(
    `SELECT d.*, u.placa AS placa, u.tipo AS tipo_unidad, u.estado AS estado_unidad
     FROM documentos_unidad d
     JOIN unidades u ON u.id = d.unidad_id
     ${where}
     ORDER BY d.vencimiento, u.placa
     LIMIT ${limiteSeguro(filtros.limite, 400)}`,
    ...params,
  );
}

export interface KpisDocumentos {
  total: number;
  vencidos: number;
  /** Vencen dentro del umbral crítico (≤ 10 días por configuración). */
  criticos: number;
  /** Vencen dentro del umbral preventivo (≤ 30 días por configuración). */
  porVencer: number;
  vigentes: number;
  /** Unidades con al menos un documento vencido. */
  unidadesAfectadas: number;
}

/**
 * Conteo por nivel de alerta de toda la documentación. Se calcula con
 * `estadoVencimiento()`, la misma regla que usa la interfaz, para que los KPI y
 * las insignias nunca se contradigan.
 */
export async function kpisDocumentos(): Promise<KpisDocumentos> {
  const filas = await all<{ unidad_id: number; vencimiento: string }>(
    'SELECT unidad_id, vencimiento FROM documentos_unidad',
  );

  const conteo: Record<NivelAlerta, number> = {
    vencido: 0,
    critico: 0,
    proximo: 0,
    vigente: 0,
  };
  const afectadas = new Set<number>();

  for (const f of filas) {
    const nivel = estadoVencimiento(f.vencimiento).nivel;
    conteo[nivel] += 1;
    if (nivel === 'vencido') afectadas.add(f.unidad_id);
  }

  return {
    total: filas.length,
    vencidos: conteo.vencido,
    criticos: conteo.critico,
    porVencer: conteo.proximo,
    vigentes: conteo.vigente,
    unidadesAfectadas: afectadas.size,
  };
}

// ─────────────────────────────────────────────────────────────
// Mantenimiento
// ─────────────────────────────────────────────────────────────
/**
 * Órdenes de taller de todo el parque. Las programadas a futuro quedan arriba
 * porque la fecha más reciente manda en el orden.
 */
export async function listarMantenimientos(limite = 300): Promise<MantenimientoConUnidad[]> {
  return all<MantenimientoConUnidad>(
    `SELECT m.*, u.placa AS placa, u.tipo AS tipo_unidad
     FROM mantenimientos m
     JOIN unidades u ON u.id = m.unidad_id
     ORDER BY m.fecha DESC, m.id DESC
     LIMIT ${limiteSeguro(limite, 300)}`,
  );
}

export interface KpisMantenimiento {
  /** Costo acumulado de las órdenes completadas: gasto realmente ejecutado. */
  costoTotal: number;
  /** Costo de mantenimiento por kilómetro del parque. */
  costoPorKm: number;
  programadas: number;
  enTaller: number;
  /** Órdenes completadas en los últimos 90 días. */
  completadas90: number;
  ordenes: number;
  ordenesCompletadas: number;
  /** Kilometraje acumulado de todas las unidades. */
  kmFlota: number;
}

interface FilaKpisMantenimiento {
  costo_total: number;
  ordenes: number;
  programadas: number;
  en_taller: number;
  completadas: number;
  completadas_90: number;
}

export async function kpisMantenimiento(): Promise<KpisMantenimiento> {
  const rango = rangoUltimosDias(90);

  const fila = await get<FilaKpisMantenimiento>(
    `SELECT
       COALESCE(SUM(CASE WHEN estado = 'completado' THEN costo ELSE 0 END), 0) AS costo_total,
       COUNT(*) AS ordenes,
       COALESCE(SUM(CASE WHEN estado = 'programado' THEN 1 ELSE 0 END), 0) AS programadas,
       COALESCE(SUM(CASE WHEN estado = 'en_taller'  THEN 1 ELSE 0 END), 0) AS en_taller,
       COALESCE(SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END), 0) AS completadas,
       COALESCE(SUM(CASE WHEN estado = 'completado' AND fecha BETWEEN $1 AND $2 THEN 1 ELSE 0 END), 0)
         AS completadas_90
     FROM mantenimientos`,
    rango.desde,
    rango.hasta,
  );

  const kmFlota = Number(
    (await escalar<number>('SELECT COALESCE(SUM(km_actual), 0) FROM unidades')) ?? 0,
  );
  const costoTotal = Number(fila?.costo_total ?? 0);

  return {
    costoTotal,
    costoPorKm: kmFlota > 0 ? costoTotal / kmFlota : 0,
    programadas: Number(fila?.programadas ?? 0),
    enTaller: Number(fila?.en_taller ?? 0),
    completadas90: Number(fila?.completadas_90 ?? 0),
    ordenes: Number(fila?.ordenes ?? 0),
    ordenesCompletadas: Number(fila?.completadas ?? 0),
    kmFlota,
  };
}

export interface CostoMantenimientoUnidad {
  unidad_id: number;
  placa: string;
  tipo_unidad: TipoUnidad;
  ordenes: number;
  costo: number;
}

/** Costo de mantenimiento acumulado por unidad, de mayor a menor. */
export async function costoMantenimientoPorUnidad(
  limite = 10,
): Promise<CostoMantenimientoUnidad[]> {
  return all<CostoMantenimientoUnidad>(
    `SELECT m.unidad_id AS unidad_id, u.placa AS placa, u.tipo AS tipo_unidad,
            COUNT(*) AS ordenes, COALESCE(SUM(m.costo), 0) AS costo
     FROM mantenimientos m
     JOIN unidades u ON u.id = m.unidad_id
     WHERE m.estado = 'completado'
     GROUP BY m.unidad_id, u.placa, u.tipo
     ORDER BY costo DESC, u.placa
     LIMIT ${limiteSeguro(limite, 10)}`,
  );
}

// ─────────────────────────────────────────────────────────────
// Catálogo para el formulario de órdenes de taller
// ─────────────────────────────────────────────────────────────
export interface OpcionUnidad {
  id: number;
  placa: string;
  tipo: TipoUnidad;
  estado: EstadoUnidad;
}

export async function unidadesParaSelect(): Promise<OpcionUnidad[]> {
  return all<OpcionUnidad>('SELECT id, placa, tipo, estado FROM unidades ORDER BY placa');
}
