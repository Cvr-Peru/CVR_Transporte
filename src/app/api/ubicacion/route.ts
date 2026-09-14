import { NextResponse } from 'next/server';
import { escalar, get, run } from '@/db/client';
import { sesionActual } from '@/lib/auth/sesion';
import { puedeCompartirUbicacion } from '@/lib/auth/permisos';
import { aISOCompleto } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Recibe la ubicación de un dispositivo y la guarda como telemetría.
 *
 * Es lo que hace que el GPS de un teléfono aparezca en el mapa de rastreo: el
 * navegador del conductor envía aquí sus coordenadas cada pocos segundos y la
 * pantalla `/rastreo` las lee de la tabla `posiciones`, igual que las
 * simuladas. No hay ninguna diferencia entre ambas una vez guardadas.
 *
 *   POST /api/ubicacion
 *   { "lat": -12.1219, "lng": -77.0297, "velocidad": 24.5, "rumbo": 180, "precision": 12 }
 *
 * A quién se le asigna:
 *  - Un **conductor** reporta siempre sobre la unidad de su ruta en curso. No
 *    puede elegir otra: el identificador se deduce de su sesión, nunca del
 *    cuerpo de la petición.
 *  - Quien puede operar el rastreo (administración y despacho) puede indicar
 *    `unidadId` para probar la integración sin ser conductor.
 */
export async function POST(request: Request) {
  // ── Quién llama ────────────────────────────────────────────
  const sesion = await sesionActual();
  if (!sesion) {
    return NextResponse.json(
      { ok: false, motivo: 'sin-sesion', mensaje: 'Hay que identificarse para reportar ubicación.' },
      { status: 401 },
    );
  }
  if (!puedeCompartirUbicacion(sesion)) {
    return NextResponse.json(
      { ok: false, motivo: 'sin-permiso', mensaje: 'Tu perfil no puede reportar ubicación.' },
      { status: 403 },
    );
  }

  // ── Coordenadas ────────────────────────────────────────────
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, motivo: 'cuerpo-invalido', mensaje: 'El cuerpo debe ser JSON.' },
      { status: 400 },
    );
  }

  const lat = Number(cuerpo.lat);
  const lng = Number(cuerpo.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json(
      { ok: false, motivo: 'coordenadas-invalidas', mensaje: 'Latitud o longitud fuera de rango.' },
      { status: 400 },
    );
  }

  const numero = (valor: unknown, min: number, max: number, porDefecto: number): number => {
    const n = Number(valor);
    return Number.isFinite(n) && n >= min && n <= max ? n : porDefecto;
  };

  const velocidad = numero(cuerpo.velocidad, 0, 300, 0);
  const rumbo = numero(cuerpo.rumbo, 0, 360, 0);
  const precision = Number.isFinite(Number(cuerpo.precision))
    ? Math.max(0, Math.min(10_000, Number(cuerpo.precision)))
    : null;

  // ── A qué unidad corresponde ───────────────────────────────
  let unidadId: number | null = null;
  let rutaId: number | null = null;

  if (sesion.rol === 'conductor') {
    // El identificador sale de la sesión, nunca de la petición: así un conductor
    // no puede reportar en nombre de otro.
    if (sesion.conductorId === null) {
      return NextResponse.json(
        {
          ok: false,
          motivo: 'sin-conductor',
          mensaje: 'Tu usuario no está vinculado a ningún conductor. Habla con administración.',
        },
        { status: 409 },
      );
    }

    const ruta = await get<{ id: number; unidad_id: number | null }>(
      `SELECT id, unidad_id FROM rutas
       WHERE conductor_id = $1 AND estado = 'en_curso'
       ORDER BY id DESC LIMIT 1`,
      sesion.conductorId,
    );

    if (!ruta || ruta.unidad_id === null) {
      return NextResponse.json(
        {
          ok: false,
          motivo: 'sin-ruta',
          mensaje:
            'No tienes ninguna hoja de ruta en curso con vehículo asignado. Pide a despacho que la inicie.',
        },
        { status: 409 },
      );
    }

    rutaId = ruta.id;
    unidadId = ruta.unidad_id;
  } else {
    // Administración y despacho pueden indicar la unidad, para probar.
    const solicitada = Number(cuerpo.unidadId);
    if (!Number.isFinite(solicitada)) {
      return NextResponse.json(
        {
          ok: false,
          motivo: 'falta-unidad',
          mensaje: 'Indica `unidadId`: tu perfil no está vinculado a un conductor.',
        },
        { status: 400 },
      );
    }

    const ruta = await get<{ id: number; unidad_id: number | null }>(
      `SELECT id, unidad_id FROM rutas
       WHERE unidad_id = $1 AND estado = 'en_curso'
       ORDER BY id DESC LIMIT 1`,
      solicitada,
    );

    if (!ruta || ruta.unidad_id === null) {
      return NextResponse.json(
        {
          ok: false,
          motivo: 'sin-ruta',
          mensaje: `La unidad ${solicitada} no tiene ninguna ruta en curso.`,
        },
        { status: 409 },
      );
    }

    rutaId = ruta.id;
    unidadId = ruta.unidad_id;
  }

  // ── Freno de mano ──────────────────────────────────────────
  // Un cliente con un fallo o malintencionado podría llenar la tabla. Se
  // descartan las posiciones que llegan a menos de 5 segundos de la anterior de
  // la misma unidad.
  const corte = aISOCompleto(new Date(Date.now() - 5000));
  const recientes = await escalar<number>(
    'SELECT COUNT(*) AS n FROM posiciones WHERE unidad_id = $1 AND timestamp > $2',
    unidadId,
    corte,
  );
  if (Number(recientes ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        motivo: 'demasiado-pronto',
        mensaje: 'Ya se registró una posición hace menos de 5 segundos.',
      },
      { status: 429 },
    );
  }

  // ── Guardar ────────────────────────────────────────────────
  const momento = aISOCompleto(new Date());
  const { id } = await run(
    `INSERT INTO posiciones (unidad_id, ruta_id, lat, lng, velocidad_kmh, rumbo, precision_m, origen, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'dispositivo', $8)
     RETURNING id`,
    unidadId,
    rutaId,
    Number(lat.toFixed(6)),
    Number(lng.toFixed(6)),
    Number(velocidad.toFixed(1)),
    Number(rumbo.toFixed(1)),
    precision,
    momento,
  );

  return NextResponse.json({
    ok: true,
    posicionId: id,
    unidadId,
    rutaId,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    precision,
    momento,
  });
}
