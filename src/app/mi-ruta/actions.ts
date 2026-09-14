'use server';

import { redirect } from 'next/navigation';
import { marcarParadaEntregada, registrarNovedad } from '@/app/despachos/actions';
import { parametros } from '@/config/empresa';
import { get } from '@/db/client';

/**
 * Acciones de la vista de campo («Mi ruta»).
 *
 * No reimplementan la lógica de entrega: llaman exactamente a las mismas
 * acciones que usa la oficina de despacho, para que conductor y despachador no
 * puedan acabar con criterios distintos. Lo único propio del móvil es el
 * regreso: en vez de dejar al conductor en el listado de despachos, vuelve a su
 * ruta con un acuse que puede leer de un vistazo.
 */

/**
 * Ejecuta una acción sobre una parada y vuelve a «Mi ruta» diciendo si la
 * parada cambió de estado de verdad.
 *
 * Comprobar el antes y el después importa: si la acción se rechaza por permisos
 * o por un dato inválido, no queremos mostrar un «listo» que sería mentira.
 */
async function acusar(
  paradaId: number | null,
  accion: () => Promise<void>,
  exito: string,
): Promise<void> {
  const antes = paradaId
    ? await get<{ estado: string }>('SELECT estado FROM paradas WHERE id = $1', paradaId)
    : null;

  await accion();

  if (!antes) redirect('/mi-ruta?aviso=sin-parada');

  const despues = await get<{ estado: string }>('SELECT estado FROM paradas WHERE id = $1', paradaId);

  redirect(
    despues && despues.estado !== antes.estado
      ? `/mi-ruta?hecho=${exito}`
      : '/mi-ruta?aviso=sin-cambio',
  );
}

function aNumero(valor: FormDataEntryValue | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Marca la parada como entregada y pasa a la siguiente. */
export async function entregarParada(formData: FormData): Promise<void> {
  // Cuando la empresa exige la foto, se avisa aquí con un mensaje concreto en
  // lugar de dejar que la entrega no se registre sin explicar por qué. La
  // comprobación de verdad está en el servidor, en `marcarParadaEntregada`.
  if (parametros.exigirFotoEnEntrega) {
    const foto = formData.get('foto');
    if (!(foto instanceof File) || foto.size === 0) {
      redirect('/mi-ruta?aviso=sin-foto');
    }
  }

  await acusar(aNumero(formData.get('paradaId')), () => marcarParadaEntregada(formData), 'entrega');
}

/** Registra que la parada no se pudo entregar, con el motivo indicado. */
export async function reportarNovedad(formData: FormData): Promise<void> {
  await acusar(aNumero(formData.get('paradaId')), () => registrarNovedad(formData), 'novedad');
}
