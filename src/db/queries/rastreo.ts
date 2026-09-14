/**
 * Consultas del módulo de rastreo GPS y estado en vivo.
 *
 * Notas de diseño:
 *  - La "última posición" de cada unidad se obtiene agrupando por `unidad_id` y
 *    buscando el mayor `id` de `posiciones`. `id` es AUTOINCREMENT, así que
 *    ordena igual que el `timestamp` y es mucho más económico que un MAX de texto.
 *  - No se usa `date('now')` de SQLite (trabaja en UTC y desfasa un día en
 *    Colombia): los cortes de fecha se calculan en JavaScript con `hoyISO()`.
 */
import { all, escalar, get } from '@/db/client';
import type { Posicion, UnidadEnVivo } from '@/db/tipos';
import { hoyISO } from '@/lib/format';

// ─────────────────────────────────────────────────────────────
// Unidades en vivo
// ─────────────────────────────────────────────────────────────
export interface FiltrosRastreo {
  /** Límite de unidades devueltas. Se interpola ya validado como número. */
  limite?: number;
  /** Si se indica, sólo se devuelve esa unidad. */
  unidadId?: number;
  /** Si se indica, sólo se devuelven unidades con ruta en curso. */
  soloEnRuta?: boolean;
}

const SELECT_UNIDADES_EN_VIVO = `
  SELECT p.unidad_id                AS unidad_id,
         u.placa                    AS placa,
         u.tipo                     AS tipo,
         u.estado                   AS estado,
         u.marca                    AS marca,
         u.modelo                   AS modelo,
         p.lat                      AS lat,
         p.lng                      AS lng,
         p.velocidad_kmh            AS velocidad_kmh,
         p.rumbo                    AS rumbo,
         p.timestamp                AS timestamp,
         p.origen                   AS origen,
         p.precision_m              AS precision_m,
         p.ruta_id                  AS ruta_id,
         r.codigo                   AS ruta_codigo,
         r.estado                   AS ruta_estado,
         r.zona                     AS zona,
         r.hora_salida              AS hora_salida,
         c.nombre                   AS conductor,
         v.placa                    AS contacto_placa,
         (SELECT COUNT(*) FROM paradas pa WHERE pa.ruta_id = p.ruta_id) AS paradas_totales,
         (SELECT COUNT(*) FROM paradas pa
           WHERE pa.ruta_id = p.ruta_id AND pa.estado IN ('entregado','fallido')) AS paradas_resueltas,
         (SELECT COUNT(*) FROM paradas pa
           WHERE pa.ruta_id = p.ruta_id AND pa.estado = 'entregado') AS paradas_entregadas,
         (SELECT COUNT(*) FROM envios e
           WHERE e.ruta_id = p.ruta_id AND e.estado IN ('pendiente','en_reparto')) AS envios_pendientes
  FROM posiciones p
  JOIN unidades u ON u.id = p.unidad_id
  LEFT JOIN rutas r ON r.id = p.ruta_id
  LEFT JOIN conductores c ON c.id = r.conductor_id
  LEFT JOIN unidades v ON v.id = r.unidad_id
`;

/**
 * Última posición conocida de cada unidad, con el contexto de su ruta activa.
 * Ordenadas por velocidad descendente: primero lo que se está moviendo.
 */
export async function unidadesEnVivo(filtros: FiltrosRastreo = {}): Promise<UnidadEnVivo[]> {
  const condiciones = ['p.id IN (SELECT MAX(id) FROM posiciones GROUP BY unidad_id)'];
  const params: unknown[] = [];
  /** Número del siguiente marcador libre. */
  const marca = () => `$${params.length + 1}`;

  if (filtros.unidadId != null) {
    condiciones.push(`p.unidad_id = ${marca()}`);
    params.push(filtros.unidadId);
  }
  if (filtros.soloEnRuta) {
    condiciones.push("r.estado = 'en_curso'");
  }

  const limite = Math.max(1, Math.floor(filtros.limite ?? 500));

  return all<UnidadEnVivo>(
    `${SELECT_UNIDADES_EN_VIVO}
     WHERE ${condiciones.join(' AND ')}
     ORDER BY p.velocidad_kmh DESC, u.placa
     LIMIT ${limite}`,
    ...params,
  );
}

/** Última posición conocida de una sola unidad (o `null` si nunca ha reportado). */
export async function unidadEnVivo(unidadId: number): Promise<UnidadEnVivo | null> {
  return get<UnidadEnVivo>(
    `${SELECT_UNIDADES_EN_VIVO}
     WHERE p.id IN (SELECT MAX(id) FROM posiciones GROUP BY unidad_id)
       AND p.unidad_id = $1`,
    unidadId,
  );
}

/** Trayectoria completa de una unidad, de la posición más antigua a la más reciente. */
export async function posicionesDeUnidad(unidadId: number, limite = 300): Promise<Posicion[]> {
  const n = Math.max(1, Math.floor(limite));
  const filas = await all<Posicion>(
    `SELECT * FROM posiciones
     WHERE unidad_id = $1
     ORDER BY timestamp DESC, id DESC
     LIMIT ${n}`,
    unidadId,
  );
  // `all` devuelve una promesa: hay que esperarla antes de invertir el orden.
  return filas.reverse();
}

/**
 * Posiciones más recientes de toda la flota, para el mapa de un solo trazo.
 * Se acota por cantidad para no dibujar miles de puntos históricos.
 */
export async function posicionesRecientes(limite = 400): Promise<Posicion[]> {
  const n = Math.max(1, Math.floor(limite));
  return all<Posicion>(
    `SELECT * FROM posiciones
     WHERE id IN (SELECT MAX(id) FROM posiciones GROUP BY unidad_id)
     ORDER BY timestamp
     LIMIT ${n}`,
  );
}

// ─────────────────────────────────────────────────────────────
// Indicadores
// ─────────────────────────────────────────────────────────────
export interface KpisRastreo {
  /** Unidades que han reportado alguna posición. */
  reportando: number;
  /** Unidades cuya última posición supera 5 km/h. */
  enMovimiento: number;
  /** Unidades con última posición conocida pero sin movimiento. */
  detenidas: number;
  /** Envíos pendientes o en reparto, es decir, todavía en la calle. */
  enCalle: number;
  /** Envíos en reparto ahora mismo. */
  enReparto: number;
  /** Rutas en curso con al menos una unidad reportando. */
  rutasActivas: number;
  /** Velocidad media de las unidades que están en movimiento, en km/h. */
  velocidadMedia: number;
}

/** Umbral a partir del cual se considera que una unidad está en movimiento. */
export const UMBRAL_MOVIMIENTO_KMH = 5;

/**
 * Indicadores del módulo. Si la página ya tiene la lista de unidades en vivo,
 * se le pasa para no repetir la consulta pesada de "última posición".
 */
export async function kpisRastreo(
  unidades: UnidadEnVivo[],
  fecha: string = hoyISO(),
): Promise<KpisRastreo> {
  const enMovimiento = unidades.filter(
    (u) => Number(u.velocidad_kmh) > UMBRAL_MOVIMIENTO_KMH,
  );

  const enCalle = Number(
    (await escalar<number>(
      `SELECT COUNT(*) FROM envios WHERE estado IN ('pendiente','en_reparto')`,
    )) ?? 0,
  );
  const enReparto = Number(
    (await escalar<number>(`SELECT COUNT(*) FROM envios WHERE estado = 'en_reparto'`)) ?? 0,
  );
  const rutasActivas = Number(
    (await escalar<number>(
      `SELECT COUNT(DISTINCT r.id)
       FROM rutas r
       JOIN posiciones p ON p.ruta_id = r.id
       WHERE r.estado = 'en_curso' AND r.fecha = $1`,
      fecha,
    )) ?? 0,
  );

  const velocidadMedia =
    enMovimiento.length > 0
      ? enMovimiento.reduce((s, u) => s + Number(u.velocidad_kmh), 0) / enMovimiento.length
      : 0;

  return {
    reportando: unidades.length,
    enMovimiento: enMovimiento.length,
    detenidas: unidades.length - enMovimiento.length,
    enCalle,
    enReparto,
    rutasActivas,
    velocidadMedia,
  };
}

// ─────────────────────────────────────────────────────────────
// Guías
// ─────────────────────────────────────────────────────────────
export interface ParadaDeGuia {
  id: number;
  ruta_id: number;
  orden: number;
  direccion: string;
  estado: string;
  hora_estimada: string | null;
  hora_real: string | null;
  total_paradas: number;
}

/** Parada concreta dentro de su ruta, con el total de paradas para situarla. */
export async function paradaDeGuia(paradaId: number): Promise<ParadaDeGuia | null> {
  return get<ParadaDeGuia>(
    `SELECT p.id, p.ruta_id, p.orden, p.direccion, p.estado,
            p.hora_estimada, p.hora_real,
            (SELECT COUNT(*) FROM paradas x WHERE x.ruta_id = p.ruta_id) AS total_paradas
     FROM paradas p
     WHERE p.id = $1`,
    paradaId,
  );
}

/** Rastro GPS de la ruta activa de una unidad, para dibujar su trayectoria. */
export async function trayectoriaDeUnidad(unidadId: number, limite = 200): Promise<Posicion[]> {
  return posicionesDeUnidad(unidadId, limite);
}
