'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { run } from '@/db/client';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aTexto } from '@/lib/formulario';
import { ahoraTexto } from '@/lib/formulario';

/**
 * Guarda la identidad de la empresa.
 *
 * Cambiar el nombre o el logo afecta a **toda** la aplicación —la cabecera, la
 * pantalla de acceso, el marco del conductor, la página pública de rastreo— así
 * que no basta con revalidar esta página: hay que tirar el resto. El marco de
 * navegación vive en el layout raíz y se renderiza en cada petición, así que con
 * revalidar la raíz basta para que el cambio se vea en todas partes.
 */

/** Tamaño máximo del logo ya reducido en el navegador. */
const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;

interface LogoPreparado {
  datos: Uint8Array;
  mime: string;
}

/**
 * Valida la imagen que llega.
 *
 * El navegador ya la ha reducido a un PNG pequeño, pero eso es comodidad, no
 * garantía: el formulario se puede enviar a mano. Lo que no pase el filtro se
 * descarta y se conserva el logo anterior.
 */
async function prepararLogo(valor: FormDataEntryValue | null): Promise<LogoPreparado | null> {
  if (!(valor instanceof File) || valor.size === 0) return null;
  if (!valor.type.startsWith('image/')) return null;
  if (valor.size > TAMANO_MAXIMO_LOGO) return null;

  try {
    const datos = new Uint8Array(await valor.arrayBuffer());
    if (datos.byteLength === 0) return null;
    return { datos, mime: valor.type };
  } catch {
    return null;
  }
}

export async function guardarConfiguracion(formData: FormData): Promise<void> {
  const sesion = await requerirPermiso('configuracion', 'editar');

  const nombre = aTexto(formData.get('nombre'));
  const nombreCorto = aTexto(formData.get('nombreCorto'));

  if (!nombre || !nombreCorto) redirect('/configuracion?error=datos');

  const idFiscal = aTexto(formData.get('idFiscal'));
  const telefono = aTexto(formData.get('telefono'));
  const ciudad = aTexto(formData.get('ciudad'));

  const nuevoLogo = await prepararLogo(formData.get('logo'));
  const quitar = formData.get('quitarLogo') === '1';

  // Qué hacer con el logo, en una sola palabra: se conserva salvo que venga uno
  // nuevo o se haya pedido quitarlo. Así el `UPDATE` no tiene que leer antes lo
  // que ya había, que sería traer la imagen entera solo para volver a escribirla.
  const modo = nuevoLogo ? 'reemplazar' : quitar ? 'quitar' : 'conservar';

  await run(
    `INSERT INTO configuracion
       (id, nombre, nombre_corto, id_fiscal, telefono, ciudad, logo, logo_mime, actualizado, actualizado_por)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       nombre          = EXCLUDED.nombre,
       nombre_corto    = EXCLUDED.nombre_corto,
       id_fiscal       = EXCLUDED.id_fiscal,
       telefono        = EXCLUDED.telefono,
       ciudad          = EXCLUDED.ciudad,
       logo            = CASE WHEN $10 = 'conservar' THEN configuracion.logo      ELSE EXCLUDED.logo      END,
       logo_mime       = CASE WHEN $10 = 'conservar' THEN configuracion.logo_mime ELSE EXCLUDED.logo_mime END,
       actualizado     = EXCLUDED.actualizado,
       actualizado_por = EXCLUDED.actualizado_por`,
    nombre,
    nombreCorto,
    idFiscal,
    telefono,
    ciudad,
    modo === 'reemplazar' ? (nuevoLogo?.datos ?? null) : null,
    modo === 'reemplazar' ? (nuevoLogo?.mime ?? null) : null,
    ahoraTexto(),
    sesion.usuarioId,
    modo,
  );

  // La marca aparece en el marco de navegación, que es parte del layout raíz.
  revalidatePath('/', 'layout');

  redirect(`/configuracion?guardado=${encodeURIComponent(nombreCorto)}`);
}
