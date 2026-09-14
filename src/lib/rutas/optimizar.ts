/**
 * Optimización del orden de las paradas de una reparto.
 *
 * ── Los dos problemas, que no son el mismo ──────────────────────────────────
 *
 *  - **Enrutado**: cómo se va de A a B por las calles. Lo resuelve OSRM (o
 *    Google/Mapbox Directions) y devuelve distancia y tiempo reales.
 *  - **Optimización**: en qué ORDEN se visitan N paradas. Es un problema de
 *    optimización combinatoria (VRP) y lo resuelve VROOM.
 *
 * Son dos servicios distintos y hacen falta los dos: VROOM necesita un motor de
 * enrutado para calcular la matriz de costes entre pares de puntos. Sin OSRM, no
 * sabe cuánto se tarda de una parada a otra.
 *
 * ── Qué hace este módulo ────────────────────────────────────────────────────
 *
 * Funciona en dos niveles, para que el sistema **nunca se quede sin respuesta**:
 *
 *  1. Si existe `VROOM_URL`, se le pide el orden óptimo con distancias por
 *     carretera, respetando capacidades y ventanas horarias.
 *  2. Si no está configurado o no responde a tiempo, se resuelve en local con
 *     **2-opt sobre distancia en línea recta**.
 *
 * El segundo nivel es peor —no conoce las calles— pero es inmediato, no depende
 * de nada y mejora bastante el orden en que se generan las paradas.
 *
 * La interfaz siempre informa de qué motor se usó, para no dar gato por liebre.
 */

export interface ParadaOptimizable {
  id: number;
  lat: number;
  lng: number;
  /** Peso a recoger o entregar, en kilos. */
  pesoKg?: number;
  /** Ventana horaria de atención, en minutos desde medianoche. */
  desdeMin?: number;
  hastaMin?: number;
  /** Tiempo de descarga estimado, en segundos. */
  servicioSeg?: number;
}

export interface OpcionesOptimizacion {
  /** Punto de partida: normalmente donde está el vehículo ahora. */
  inicio?: { lat: number; lng: number };
  /** Capacidad del vehículo en kilos. */
  capacidadKg?: number;
  /** Milisegundos que se espera a VROOM antes de resolver en local. */
  esperaMs?: number;
}

export type MotorOptimizacion = 'vroom' | 'local';

export interface ResultadoOptimizacion {
  /** Identificadores de las paradas en el orden óptimo. */
  orden: number[];
  distanciaMetros: number;
  duracionSegundos: number;
  motor: MotorOptimizacion;
  /** Porcentaje de distancia ahorrada frente al orden de entrada. */
  mejoraPct: number;
  /** Motivo por el que no se usó VROOM, si fue el caso. */
  motivoLocal?: string;
}

// ─────────────────────────────────────────────────────────────
// Geometría
// ─────────────────────────────────────────────────────────────
const RADIO_TIERRA_M = 6_371_000;

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
export function distanciaMetros(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const aRad = (a.lat * Math.PI) / 180;
  const bRad = (b.lat * Math.PI) / 180;
  const dLat = bRad - aRad;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aRad) * Math.cos(bRad) * Math.sin(dLng / 2) ** 2;

  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longitud total de una secuencia de puntos. */
function longitudTotal(puntos: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += distanciaMetros(puntos[i - 1], puntos[i]);
  return total;
}

// ─────────────────────────────────────────────────────────────
// Nivel 2: optimización local con 2-opt
// ─────────────────────────────────────────────────────────────
/**
 * Ordena por el vecino más próximo: desde el punto actual, salta siempre al más
 * cercano que quede. Es rápido y da un punto de partida razonable, pero se queda
 * atrapado en malas soluciones con facilidad.
 */
function vecinoMasProximo(
  indices: number[],
  matriz: number[][],
  desde: number,
): number[] {
  const pendientes = new Set(indices);
  const orden: number[] = [];
  let actual = desde;

  while (pendientes.size > 0) {
    let mejor = -1;
    let mejorDistancia = Number.POSITIVE_INFINITY;
    for (const candidato of pendientes) {
      const d = matriz[actual][candidato];
      if (d < mejorDistancia) {
        mejorDistancia = d;
        mejor = candidato;
      }
    }
    orden.push(mejor);
    pendientes.delete(mejor);
    actual = mejor;
  }

  return orden;
}

/**
 * Mejora el orden invirtiendo tramos mientras la ruta se acorte (2-opt).
 *
 * La idea: si cruzar dos tramos ahorra distancia, se cruzan. Repitiendo esto
 * hasta que no haya mejora se sale de los atascos del vecino más próximo. No
 * garantiza el óptimo absoluto —eso es NP-duro— pero se acerca mucho y cuesta
 * milisegundos.
 */
function dosOpt(orden: number[], matriz: number[][]): number[] {
  const ruta = [...orden];
  let mejora = true;
  let vueltas = 0;
  // Tope de seguridad: con muchas paradas esto no debe bloquear la petición.
  const MAX_VUELTAS = 60;

  while (mejora && vueltas < MAX_VUELTAS) {
    mejora = false;
    vueltas++;

    for (let i = 1; i < ruta.length - 1; i++) {
      for (let j = i + 1; j < ruta.length; j++) {
        const antes = ruta[i - 1];
        const desde = ruta[i];
        const hasta = ruta[j];
        const despues = ruta[j + 1] ?? null;

        const actual = matriz[antes][desde] + (despues !== null ? matriz[hasta][despues] : 0);
        const propuesto = matriz[antes][hasta] + (despues !== null ? matriz[desde][despues] : 0);

        if (propuesto < actual - 0.5) {
          // Se invierte el tramo [i, j]
          let a = i;
          let b = j;
          while (a < b) {
            const tmp = ruta[a];
            ruta[a] = ruta[b];
            ruta[b] = tmp;
            a++;
            b--;
          }
          mejora = true;
        }
      }
    }
  }

  return ruta;
}

/** Resuelve la optimización sin salir del proceso. */
export function optimizarLocal(
  paradas: ParadaOptimizable[],
  inicio?: { lat: number; lng: number },
): { orden: number[]; distanciaMetros: number } {
  if (paradas.length <= 2) {
    const enOrden = paradas.map((p) => p.id);
    const puntos = inicio ? [inicio, ...paradas] : paradas;
    return { orden: enOrden, distanciaMetros: longitudTotal(puntos) };
  }

  // Nodo 0 = punto de partida (si no se indica, la primera parada).
  const puntos = inicio ? [inicio, ...paradas] : paradas;
  const desplazamiento = inicio ? 1 : 0;

  const matriz: number[][] = puntos.map((a) => puntos.map((b) => distanciaMetros(a, b)));

  const indices = paradas.map((_, i) => i + desplazamiento);
  const inicial = vecinoMasProximo(indices, matriz, 0);
  const mejorado = dosOpt(inicial, matriz);

  const orden = mejorado.map((i) => paradas[i - desplazamiento].id);

  // La distancia se recalcula siguiendo el orden final.
  const secuencia = [puntos[0], ...mejorado.map((i) => puntos[i])];
  return { orden, distanciaMetros: longitudTotal(secuencia) };
}

// ─────────────────────────────────────────────────────────────
// Nivel 1: VROOM (con OSRM por debajo)
// ─────────────────────────────────────────────────────────────
interface RespuestaVroom {
  code: number;
  routes?: {
    distance: number;
    duration: number;
    steps: { type: string; job?: number }[];
  }[];
}

/**
 * Pide el orden óptimo a VROOM, que a su vez consulta OSRM para las distancias
 * reales por carretera.
 *
 * Devuelve `null` —en vez de lanzar un error— cuando no está configurado o falla,
 * para que quien llama pueda seguir con la solución local.
 */
async function optimizarConVroom(
  paradas: ParadaOptimizable[],
  opciones: OpcionesOptimizacion,
): Promise<ResultadoOptimizacion | null> {
  const url = process.env.VROOM_URL?.trim();
  if (!url) return null;

  // Sin punto de partida se usa la primera parada, que es lo más razonable.
  const arranque = opciones.inicio ?? { lat: paradas[0].lat, lng: paradas[0].lng };
  const capacidad = opciones.capacidadKg && opciones.capacidadKg > 0 ? opciones.capacidadKg : null;
  const hayVentanas = paradas.some((p) => p.desdeMin !== undefined && p.hastaMin !== undefined);

  try {
    const respuesta = await fetch(`${url.replace(/\/$/, '')}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicles: [
          {
            id: 1,
            // VROOM usa [longitud, latitud], al revés que casi todo lo demás.
            start: [arranque.lng, arranque.lat],
            ...(capacidad !== null ? { capacity: [capacidad] } : {}),
            // Si hay ventanas horarias, el vehículo sale a las 06:00.
            ...(hayVentanas ? { time_window: [6 * 3600, 20 * 3600] } : {}),
          },
        ],
        jobs: paradas.map((p) => ({
          id: p.id,
          location: [p.lng, p.lat],
          service: p.servicioSeg ?? 300,
          ...(capacidad !== null && p.pesoKg ? { delivery: [Math.min(p.pesoKg, capacidad)] } : {}),
          ...(hayVentanas && p.desdeMin !== undefined && p.hastaMin !== undefined
            ? { time_windows: [[p.desdeMin * 60, p.hastaMin * 60]] }
            : {}),
        })),
        options: { g: true },
      }),
      signal: AbortSignal.timeout(opciones.esperaMs ?? 8000),
    });

    if (!respuesta.ok) return null;

    const datos = (await respuesta.json()) as RespuestaVroom;
    const ruta = datos.routes?.[0];
    if (!ruta) return null;

    const orden = ruta.steps
      .filter((s) => s.type === 'job' && typeof s.job === 'number')
      .map((s) => s.job as number);

    // Si VROOM no devolvió todas las paradas, la respuesta no es utilizable.
    if (orden.length !== paradas.length) return null;

    return {
      orden,
      distanciaMetros: ruta.distance,
      duracionSegundos: ruta.duration,
      motor: 'vroom',
      mejoraPct: 0,
    };
  } catch {
    // Servicio caído, lento o mal configurado: se resuelve en local.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────────────────────
/** ¿Hay un optimizador externo configurado? */
export function hayOptimizadorExterno(): boolean {
  return Boolean(process.env.VROOM_URL?.trim());
}

/**
 * Ordena las paradas de la mejor forma disponible.
 *
 * Nunca falla: si VROOM no está o no responde, resuelve en local y lo indica en
 * `motor` y `motivoLocal`.
 */
export async function optimizarRuta(
  paradas: ParadaOptimizable[],
  opciones: OpcionesOptimizacion = {},
): Promise<ResultadoOptimizacion> {
  const puntoInicio = opciones.inicio;
  const secuencia = puntoInicio ? [puntoInicio, ...paradas] : paradas;
  const distanciaOriginal = longitudTotal(secuencia);

  if (paradas.length < 3) {
    return {
      orden: paradas.map((p) => p.id),
      distanciaMetros: distanciaOriginal,
      duracionSegundos: 0,
      motor: 'local',
      mejoraPct: 0,
      motivoLocal: 'Con menos de tres paradas no hay nada que ordenar.',
    };
  }

  const externo = await optimizarConVroom(paradas, opciones);
  if (externo) {
    return {
      ...externo,
      mejoraPct:
        distanciaOriginal > 0
          ? Math.max(0, ((distanciaOriginal - externo.distanciaMetros) / distanciaOriginal) * 100)
          : 0,
    };
  }

  const local = optimizarLocal(paradas, puntoInicio);
  return {
    orden: local.orden,
    distanciaMetros: local.distanciaMetros,
    // Sin motor de enrutado no se puede estimar un tiempo fiable: se aproxima a
    // 25 km/h de media urbana, y se dice que es una estimación.
    duracionSegundos: (local.distanciaMetros / 1000 / 25) * 3600,
    motor: 'local',
    mejoraPct:
      distanciaOriginal > 0
        ? Math.max(0, ((distanciaOriginal - local.distanciaMetros) / distanciaOriginal) * 100)
        : 0,
    motivoLocal: hayOptimizadorExterno()
      ? 'El optimizador externo no respondió; se ordenó en local.'
      : 'Sin optimizador externo configurado (VROOM_URL): se ordenó en local, por línea recta.',
  };
}
