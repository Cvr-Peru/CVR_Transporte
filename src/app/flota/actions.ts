'use server';

/**
 * Acciones de servidor del módulo de flota.
 *
 * La validación es defensiva: los datos llegan de un formulario HTML, así que
 * nunca se escribe en la base sin comprobar tipo, estado y valores numéricos.
 * Si algo no cuadra, la acción termina sin tocar la base.
 */
import { revalidatePath } from 'next/cache';
import { get, run, transaccion } from '@/db/client';
import type { EstadoUnidad } from '@/db/tipos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO, parseFecha } from '@/lib/format';

type TipoMantenimiento = 'preventivo' | 'correctivo';
type EstadoMantenimiento = 'programado' | 'en_taller' | 'completado';

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

function esTipoMantenimiento(valor: string): valor is TipoMantenimiento {
  return valor === 'preventivo' || valor === 'correctivo';
}

function esEstadoMantenimiento(valor: string): valor is EstadoMantenimiento {
  return valor === 'programado' || valor === 'en_taller' || valor === 'completado';
}

/**
 * Registra una orden de taller y sincroniza el estado de la unidad:
 *  - `en_taller`  → la unidad pasa a `mantenimiento`.
 *  - `completado` → si la unidad estaba en mantenimiento, vuelve a `disponible`.
 */
export async function registrarMantenimiento(formData: FormData): Promise<void> {
  // Lo primero: escribir en flota exige `editar`. La comprobación va aquí, en el
  // propio punto de escritura, porque una acción de servidor se puede invocar
  // directamente sin pasar por la página.
  await requerirPermiso('flota', 'editar');

  const unidadId = Number(texto(formData, 'unidadId'));
  const tipo = texto(formData, 'tipo');
  const estado = texto(formData, 'estado');
  const descripcion = texto(formData, 'descripcion');
  const fechaCruda = texto(formData, 'fecha');
  const taller = texto(formData, 'taller');
  const kmCrudo = texto(formData, 'km');
  const costoCrudo = texto(formData, 'costo');

  if (!Number.isInteger(unidadId) || unidadId <= 0) return;
  if (!esTipoMantenimiento(tipo) || !esEstadoMantenimiento(estado)) return;
  if (descripcion.length === 0 || descripcion.length > 300) return;
  if (taller.length > 120) return;

  // La fecha vacía se asume hoy; una fecha con formato inválido se rechaza.
  const fecha = fechaCruda === '' ? hoyISO() : fechaCruda;
  if (!parseFecha(fecha)) return;

  // Kilometraje: opcional, pero si viene tiene que ser un número válido.
  const km = kmCrudo === '' ? null : Number(kmCrudo.replace(',', '.'));
  if (km !== null && (!Number.isFinite(km) || km < 0)) return;

  const costo = costoCrudo === '' ? 0 : Number(costoCrudo.replace(',', '.'));
  if (!Number.isFinite(costo) || costo < 0) return;

  // La unidad debe existir: es la clave foránea de la orden.
  const unidad = await get<{ id: number; estado: EstadoUnidad }>(
    'SELECT id, estado FROM unidades WHERE id = $1',
    unidadId,
  );
  if (!unidad) return;

  await transaccion(async () => {
    await run(
      `INSERT INTO mantenimientos
         (unidad_id, tipo, descripcion, fecha, km, costo, taller, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      unidadId,
      tipo,
      descripcion,
      fecha,
      km,
      costo,
      taller === '' ? null : taller,
      estado,
    );

    if (estado === 'en_taller') {
      await run("UPDATE unidades SET estado = 'mantenimiento' WHERE id = $1", unidadId);
    } else if (estado === 'completado') {
      // Solo se devuelve a disponible si estaba en el taller: una unidad fuera
      // de servicio por siniestro no debe volver a operar por esta vía.
      await run(
        "UPDATE unidades SET estado = 'disponible' WHERE id = $1 AND estado = 'mantenimiento'",
        unidadId,
      );
    }
  });

  revalidatePath('/flota');
}
