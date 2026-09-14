'use server';

/**
 * Acciones de servidor del módulo de liquidaciones.
 *
 * Toda mutación valida el estado actual de la fila antes de escribir: las
 * transiciones son `borrador → aprobada → pagada`, y una deducción solo puede
 * registrarse mientras la liquidación sigue en `borrador`. Si no se cumple la
 * condición, la acción termina sin tocar la base de datos.
 */
import { revalidatePath } from 'next/cache';
import { get, run } from '@/db/client';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO } from '@/lib/format';

/** Convierte un valor de FormData en un entero positivo, o null si no es válido. */
function enteroPositivo(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/** Convierte un valor de FormData en un monto positivo con dos decimales. */
function montoPositivo(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const n = Number(valor.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

interface FilaLiquidacion {
  id: number;
  estado: string;
  base: number;
  comisiones: number;
  bonificaciones: number;
  deducciones: number;
}

/**
 * Pasa una liquidación de `borrador` a `aprobada`.
 * Aprobar cierra el cálculo: a partir de aquí ya no se admiten deducciones.
 */
export async function aprobarLiquidacion(formData: FormData): Promise<void> {
  await requerirPermiso('liquidaciones', 'editar');

  const id = enteroPositivo(formData.get('liquidacionId'));
  if (id === null) return;

  await run(
    `UPDATE liquidaciones
        SET estado = 'aprobada'
      WHERE id = $1 AND estado = 'borrador'`,
    id,
  );
  revalidatePath('/liquidaciones');
}

/**
 * Pasa una liquidación de `aprobada` a `pagada` y registra la fecha de pago.
 * Una liquidación no puede pagarse sin haber sido aprobada antes.
 */
export async function marcarLiquidacionPagada(formData: FormData): Promise<void> {
  await requerirPermiso('liquidaciones', 'editar');

  const id = enteroPositivo(formData.get('liquidacionId'));
  if (id === null) return;

  await run(
    `UPDATE liquidaciones
        SET estado = 'pagada', fecha_pago = $1
      WHERE id = $2 AND estado = 'aprobada'`,
    hoyISO(),
    id,
  );
  revalidatePath('/liquidaciones');
}

/**
 * Registra una deducción sobre una liquidación en `borrador` y recalcula el
 * total a pagar como `base + comisiones + bonificaciones - deducciones`.
 *
 * El monto se suma a las deducciones existentes. Se rechaza si dejara el total
 * en negativo: no se le puede exigir al conductor más de lo que se le debe en
 * el período, eso requiere un acuerdo de pago aparte.
 */
export async function registrarDeduccion(formData: FormData): Promise<void> {
  await requerirPermiso('liquidaciones', 'editar');

  const id = enteroPositivo(formData.get('liquidacionId'));
  const monto = montoPositivo(formData.get('monto'));
  if (id === null || monto === null) return;

  const liquidacion = await get<FilaLiquidacion>(
    `SELECT id, estado, base, comisiones, bonificaciones, deducciones
       FROM liquidaciones WHERE id = $1`,
    id,
  );
  if (!liquidacion || liquidacion.estado !== 'borrador') return;

  const deducciones = Number(liquidacion.deducciones) + monto;
  const total =
    Number(liquidacion.base) +
    Number(liquidacion.comisiones) +
    Number(liquidacion.bonificaciones) -
    deducciones;
  if (total < 0) return;

  // El monto se aplica y el total se recalcula en la misma sentencia para que no
  // pueda quedar una deducción registrada sin su total correspondiente.
  await run(
    `UPDATE liquidaciones
        SET deducciones = $1, total_pagar = $2
      WHERE id = $3 AND estado = 'borrador'`,
    deducciones,
    total,
    id,
  );

  revalidatePath('/liquidaciones');
}
