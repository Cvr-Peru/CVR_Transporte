'use server';

/**
 * Acciones de servidor del módulo de facturación.
 *
 * Cada acción valida la entrada y el estado actual de la factura antes de
 * escribir: el formulario es la única puerta de entrada, así que no se confía en
 * los datos que llegan. Después de mutar se invalidan las rutas afectadas.
 */
import { revalidatePath } from 'next/cache';
import { get, run } from '@/db/client';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO } from '@/lib/format';

/** Estados posibles de una factura, según el CHECK de la tabla. */
type EstadoFactura = 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'anulada';

/** Extrae y valida el id de factura que llega en el formulario. */
function leerId(formData: FormData): number | null {
  const valor = formData.get('facturaId');
  const id = typeof valor === 'string' ? Number(valor) : Number.NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Estado actual de la factura, o `null` si no existe. */
async function estadoActual(id: number): Promise<EstadoFactura | null> {
  const fila = await get<{ estado: EstadoFactura }>(
    'SELECT estado FROM facturas WHERE id = $1',
    id,
  );
  return fila?.estado ?? null;
}

/** Invalida las vistas que muestran una factura: listado, detalle y tablero. */
function revalidarFacturacion(id: number): void {
  revalidatePath('/facturacion');
  revalidatePath(`/facturacion/${id}`);
  revalidatePath('/');
}

/** Pasa una factura de `borrador` a `emitida`. */
export async function emitirFactura(formData: FormData): Promise<void> {
  await requerirPermiso('facturacion', 'editar');
  const id = leerId(formData);
  if (id === null) return;
  if ((await estadoActual(id)) !== 'borrador') return;

  await run("UPDATE facturas SET estado = 'emitida' WHERE id = $1 AND estado = 'borrador'", id);
  revalidarFacturacion(id);
}

/** Marca una factura pendiente como `pagada` y fija la fecha de pago en hoy. */
export async function marcarFacturaPagada(formData: FormData): Promise<void> {
  await requerirPermiso('facturacion', 'editar');
  const id = leerId(formData);
  if (id === null) return;

  const estado = await estadoActual(id);
  if (estado !== 'emitida' && estado !== 'vencida') return;

  await run(
    "UPDATE facturas SET estado = 'pagada', fecha_pago = $1 WHERE id = $2 AND estado IN ('emitida','vencida')",
    hoyISO(),
    id,
  );
  revalidarFacturacion(id);
}

/** Anula una factura no pagada. Una vez anulada deja de contar en la cartera. */
export async function anularFactura(formData: FormData): Promise<void> {
  await requerirPermiso('facturacion', 'editar');
  const id = leerId(formData);
  if (id === null) return;

  const estado = await estadoActual(id);
  if (!estado || estado === 'anulada' || estado === 'pagada') return;

  await run(
    "UPDATE facturas SET estado = 'anulada' WHERE id = $1 AND estado IN ('borrador','emitida','vencida')",
    id,
  );
  revalidarFacturacion(id);
}
