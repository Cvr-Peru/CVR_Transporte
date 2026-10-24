import { NextResponse } from 'next/server';
import { get } from '@/db/client';
import { aBytes } from '@/lib/binario';
import { cabecerasImagen, detectarTipoImagen } from '@/lib/imagenes';

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
  const fila = await get<{ logo: unknown }>('SELECT logo FROM configuracion WHERE id = 1');

  // Que el logo sea público hace más importante, no menos, que solo salga un
  // mapa de bits: el tipo se deduce de los bytes y un SVG guardado no se sirve.
  const datos = aBytes(fila?.logo);
  const tipo = detectarTipoImagen(datos);
  if (!tipo) {
    return new NextResponse('Esta instalación no tiene logo.', { status: 404 });
  }

  return new NextResponse(new Blob([datos], { type: tipo }), {
    headers: {
      ...cabecerasImagen(tipo, datos.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
