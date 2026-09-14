import { NextResponse } from 'next/server';
import { escalar } from '@/db/client';

/**
 * Punto de salud para la plataforma de despliegue (Railway lo usa para saber si
 * el servicio está listo). Comprueba que la base de datos responde de verdad,
 * no solo que el proceso está vivo.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rutas = Number((await escalar<number>('SELECT COUNT(*) FROM rutas')) ?? 0);

    return NextResponse.json({
      estado: 'ok',
      baseDeDatos: 'conectada',
      rutas,
      sembrada: rutas > 0,
      momento: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        estado: 'error',
        baseDeDatos: 'sin respuesta',
        mensaje: error instanceof Error ? error.message : 'error desconocido',
      },
      { status: 503 },
    );
  }
}
