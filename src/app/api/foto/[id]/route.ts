import { NextResponse } from 'next/server';
import { get } from '@/db/client';
import { aBytes } from '@/lib/binario';
import { puede } from '@/lib/auth/permisos';
import { sesionActual } from '@/lib/auth/sesion';

export const dynamic = 'force-dynamic';

/**
 * Sirve la foto de prueba de entrega.
 *
 *   GET /api/foto/<id>
 *
 * **No es un archivo público y no puede serlo.** Lo que hay aquí es la cara de
 * una persona que recibió un paquete en su casa; su sitio no es una URL que
 * cualquiera pueda adivinar ni compartir. Por eso:
 *
 *  - Sin sesión se responde 401 y sin permiso de lectura sobre despachos, 403.
 *  - Un conductor solo obtiene las fotos de **sus** rutas. El identificador es un
 *    número correlativo, así que sin esta comprobación bastaría con ir probando
 *    `/api/foto/1`, `/api/foto/2`… para ver las entregas de toda la empresa.
 *  - La cabecera es `Cache-Control: private`, para que ningún proxy intermedio
 *    guarde la imagen y se la devuelva a otro.
 *
 * Deliberadamente **no** se expone en la página pública de rastreo `/rastrear`:
 * el cliente final puede seguir su paquete sin ver la cara de quien lo recibió.
 * Si algún día se quiere enseñar ahí, hay que decidirlo a conciencia y avisar al
 * destinatario.
 */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await sesionActual();
  if (!sesion) {
    return new NextResponse('Hay que identificarse para ver esta foto.', { status: 401 });
  }
  if (!puede(sesion.rol, 'despachos', 'ver')) {
    return new NextResponse('Tu perfil no puede ver pruebas de entrega.', { status: 403 });
  }

  const { id } = await params;
  const fotoId = Number(id);
  if (!Number.isInteger(fotoId) || fotoId <= 0) {
    return new NextResponse('Identificador de foto inválido.', { status: 400 });
  }

  const foto = await get<{
    datos: unknown;
    tipo_mime: string;
    conductor_id: number | null;
  }>(
    `SELECT f.datos, f.tipo_mime, r.conductor_id
     FROM fotos_entrega f
     JOIN rutas r ON r.id = f.ruta_id
     WHERE f.id = $1`,
    fotoId,
  );

  if (!foto) {
    return new NextResponse('Esa foto no existe.', { status: 404 });
  }

  if (sesion.rol === 'conductor' && foto.conductor_id !== sesion.conductorId) {
    // Mismo mensaje que si no existiera: distinguirlos permitiría averiguar
    // cuántas fotos hay y de qué rutas.
    return new NextResponse('Esa foto no existe.', { status: 404 });
  }

  const datos = aBytes(foto.datos);
  if (datos.byteLength === 0) {
    return new NextResponse('La foto está vacía.', { status: 500 });
  }

  return new NextResponse(new Blob([datos], { type: foto.tipo_mime || 'image/jpeg' }), {
    headers: {
      'Content-Type': foto.tipo_mime || 'image/jpeg',
      'Content-Length': String(datos.byteLength),
      // `private`: es la cara de una persona, no la cachee ningún intermediario.
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename="entrega-${fotoId}.jpg"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}


