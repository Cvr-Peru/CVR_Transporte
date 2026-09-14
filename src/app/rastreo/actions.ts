'use server';

/**
 * Acciones del módulo de rastreo.
 *
 * `avanzarSimulacion()` hace avanzar un paso el ciclo de reparto para todas las
 * rutas en curso. Es una simulación de demostración: los datos de `posiciones`
 * son telemetría simulada, no lecturas de un GPS real.
 *
 * Todo ocurre dentro de una sola transacción para que el avance sea atómico: o
 * se aplican todos los cambios (paradas, envíos, posiciones y estados de ruta)
 * o no se aplica ninguno.
 */
import { revalidatePath } from 'next/cache';
import { all, get, run, transaccion } from '@/db/client';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aISOCompleto } from '@/lib/format';

/** Porcentaje del trayecto que avanza la unidad hacia su siguiente parada. */
const AVANCE = 0.25;
/** Variación leve de rumbo y velocidad para que la traza no sea una recta perfecta. */
const JITTER_GRADOS = 3;
/** Distancia mínima (en grados) para considerar que la unidad llegó a la parada. */
const EPSILON = 0.00018;
/** Rango de velocidad simulada, en km/h. */
const VELOCIDAD_MIN = 12;
const VELOCIDAD_MAX = 46;

interface RutaEnCurso {
  id: number;
  unidad_id: number;
  zona: string;
}

interface ParadaPendiente {
  id: number;
  orden: number;
  lat: number;
  lng: number;
  estado: string;
}

interface UltimaPosicion {
  lat: number;
  lng: number;
}

/** Número aleatorio en [0, 1). Se usa la Web Crypto API: no requiere dependencias. */
function aleatorio(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 0x1_0000_0000;
}

/** Número aleatorio en [minimo, maximo). */
function entre(minimo: number, maximo: number): number {
  return minimo + aleatorio() * (maximo - minimo);
}

/** Acota un valor a un rango. */
function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Redondeo numérico para no guardar 15 decimales de máquina. */
function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/** Distancia euclídea en grados, suficiente como criterio de cercanía local. */
function distanciaEnGrados(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return Math.hypot(aLat - bLat, aLng - bLng);
}

/** Rumbo en grados (0 = norte, 90 = este) desde un punto hacia otro. */
function calcularRumbo(desdeLat: number, desdeLng: number, haciaLat: number, haciaLng: number): number {
  const dNorte = haciaLat - desdeLat;
  const dEste = (haciaLng - desdeLng) * Math.cos((desdeLat * Math.PI) / 180);
  if (dNorte === 0 && dEste === 0) return 0;
  const grados = (Math.atan2(dEste, dNorte) * 180) / Math.PI;
  return redondear((grados + 360) % 360, 1);
}

/**
 * Avanza la simulación un paso: entrega la siguiente parada de cada ruta en
 * curso, mueve las unidades hacia su próximo objetivo y cierra las rutas que ya
 * no tienen paradas pendientes.
 */
export async function avanzarSimulacion(): Promise<void> {
  // La guarda va antes de abrir la transacción: sin permiso no se toca nada.
  await requerirPermiso('rastreo', 'editar');

  const ahora = new Date();
  const horaActual = aISOCompleto(ahora);

  await transaccion(async () => {
    const rutas = await all<RutaEnCurso>(
      `SELECT id, unidad_id, zona FROM rutas
       WHERE estado = 'en_curso' AND unidad_id IS NOT NULL
       ORDER BY id`,
    );

    for (const ruta of rutas) {
      // ── 1. Siguiente parada pendiente (en_camino tiene prioridad) ──
      let parada = await get<ParadaPendiente>(
        `SELECT id, orden, lat, lng, estado FROM paradas
         WHERE ruta_id = $1 AND estado IN ('en_camino','pendiente')
         ORDER BY CASE WHEN estado = 'en_camino' THEN 0 ELSE 1 END, orden
         LIMIT 1`,
        ruta.id,
      );

      if (!parada) {
        // La ruta ya no tiene paradas por resolver: se cierra y la unidad queda libre.
        await run(
          `UPDATE paradas SET estado = 'entregado', hora_real = COALESCE(hora_real, $1)
           WHERE ruta_id = $2 AND estado IN ('en_camino','pendiente')`,
          horaActual,
          ruta.id,
        );
        await run(
          `UPDATE envios SET estado = 'entregado', fecha_entrega = $1
           WHERE ruta_id = $2 AND estado IN ('pendiente','en_reparto')`,
          horaActual,
          ruta.id,
        );
        await run(
          `UPDATE envios SET receptor = destinatario, fecha_entrega = $1
           WHERE ruta_id = $2 AND estado = 'entregado' AND receptor IS NULL`,
          horaActual,
          ruta.id,
        );
        await run(
          "UPDATE rutas SET estado = 'completado', hora_llegada = $1 WHERE id = $2",
          horaActual,
          ruta.id,
        );
        await run(
          "UPDATE unidades SET estado = 'disponible' WHERE id = $1 AND estado <> 'mantenimiento'",
          ruta.unidad_id,
        );
        continue;
      }

      // Se marca la parada en curso antes de entregarla, para que la ruta
      // refleje el paso intermedio en esta misma iteración.
      if (parada.estado === 'pendiente') {
        await run("UPDATE paradas SET estado = 'en_camino' WHERE id = $1", parada.id);
        await run(
          `UPDATE envios SET estado = 'en_reparto'
           WHERE parada_id = $1 AND estado = 'pendiente'`,
          parada.id,
        );
      }

      // ── 2. Entrega: la parada pasa a entregado y sus envíos también ──
      await run(
        "UPDATE paradas SET estado = 'entregado', hora_real = $1 WHERE id = $2",
        horaActual,
        parada.id,
      );
      // El receptor se toma del destinatario del envío: es lo que registra el
      // conductor al cerrar la entrega.
      await run(
        `UPDATE envios
         SET estado = 'entregado', fecha_entrega = $1, receptor = destinatario
         WHERE parada_id = $2 AND estado IN ('pendiente','en_reparto')`,
        horaActual,
        parada.id,
      );

      // ── 3. Siguiente objetivo tras resolver esa parada ─────────
      const siguiente = await get<ParadaPendiente>(
        `SELECT id, orden, lat, lng, estado FROM paradas
         WHERE ruta_id = $1 AND estado IN ('en_camino','pendiente')
         ORDER BY orden
         LIMIT 1`,
        ruta.id,
      );

      if (siguiente && siguiente.estado === 'pendiente') {
        await run("UPDATE paradas SET estado = 'en_camino' WHERE id = $1", siguiente.id);
        await run(
          `UPDATE envios SET estado = 'en_reparto'
           WHERE parada_id = $1 AND estado = 'pendiente'`,
          siguiente.id,
        );
      }

      // Si la ruta se quedó sin paradas, se cierra de inmediato: la unidad queda
      // libre y no se le inventa un desplazamiento hacia ningún objetivo.
      if (!siguiente) {
        await run(
          "UPDATE rutas SET estado = 'completado', hora_llegada = $1 WHERE id = $2",
          horaActual,
          ruta.id,
        );
        await run(
          "UPDATE unidades SET estado = 'disponible' WHERE id = $1 AND estado <> 'mantenimiento'",
          ruta.unidad_id,
        );
        continue;
      }

      // ── 4. Nueva posición: se acerca al objetivo un 25 % ───────
      const ultima = await get<UltimaPosicion>(
        'SELECT lat, lng FROM posiciones WHERE unidad_id = $1 ORDER BY id DESC LIMIT 1',
        ruta.unidad_id,
      );

      // Sin historial se usa la parada de origen de la ruta como arranque.
      const base =
        ultima ??
        (await get<UltimaPosicion>(
          'SELECT lat, lng FROM paradas WHERE ruta_id = $1 ORDER BY orden LIMIT 1',
          ruta.id,
        )) ?? { lat: parada.lat, lng: parada.lng };

      const objetivo = siguiente ?? parada;
      const distancia = distanciaEnGrados(base.lat, base.lng, objetivo.lat, objetivo.lng);

      // La variación lateral evita que la traza sea una recta exacta entre dos
      // paradas; se reduce al acercarse al objetivo para no oscilar encima.
      const jitter = (distancia > EPSILON ? 1 : 0.15) * (JITTER_GRADOS / 111_000);
      const lat = redondear(base.lat + (objetivo.lat - base.lat) * AVANCE + entre(-jitter, jitter), 6);
      const lng = redondear(base.lng + (objetivo.lng - base.lng) * AVANCE + entre(-jitter, jitter), 6);
      const rumbo = calcularRumbo(base.lat, base.lng, objetivo.lat, objetivo.lng);
      const velocidad =
        distancia > EPSILON ? redondear(entre(VELOCIDAD_MIN, VELOCIDAD_MAX), 1) : 0;

      await run(
        `INSERT INTO posiciones (unidad_id, ruta_id, lat, lng, velocidad_kmh, rumbo, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ruta.unidad_id,
        ruta.id,
        lat,
        lng,
        acotar(velocidad, 0, 90),
        rumbo,
        horaActual,
      );

      // La unidad que acaba de reportar está operando.
      await run("UPDATE unidades SET estado = 'en_ruta' WHERE id = $1", ruta.unidad_id);
    }
  });

  revalidatePath('/rastreo');
}
