import { NextResponse } from 'next/server';
import { get } from '@/db/client';
import { aBytes } from '@/lib/binario';

export const dynamic = 'force-dynamic';

/**
 * Sirve el logo de la empresa.
 *
 * Es **público**, al contrario que las fotos de entrega, y a propósito: el logo
 * aparece en la pantalla de acceso, antes de que nadie se identifique, y en la
 * página de rastreo que ve el cliente final. No es información de nadie.
 *
 * Se puede cachear para siempre porque la dirección lleva una versión
 * (`/api/logo?v=…`) que cambia cada vez que alguien guarda la configuración: al
 * subir un logo nuevo, el navegador pide uno distinto y no enseña el anterior.
 */
export async function GET() {
  const fila = await get<{ logo: unknown; logo_mime: string | null }>(
    'SELECT logo, logo_mime FROM configuracion WHERE id = 1',
  );

  const datos = aBytes(fila?.logo);
  if (datos.byteLength === 0) {
    return new NextResponse('Esta instalación no tiene logo.', { status: 404 });
  }

  return new NextResponse(new Blob([datos], { type: fila?.logo_mime || 'image/png' }), {
    headers: {
      'Content-Type': fila?.logo_mime || 'image/png',
      'Content-Length': String(datos.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
