'use server';

/**
 * Acciones de servidor del módulo de flota.
 *
 * La validación es defensiva: los datos llegan de un formulario HTML, así que
 * nunca se escribe en la base sin comprobar tipo, estado y valores numéricos.
 * Si algo no cuadra, la acción termina sin tocar la base.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run, transaccion } from '@/db/client';
import type { EstadoUnidad } from '@/db/tipos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO, parseFecha } from '@/lib/format';
import { aNumero, aTexto } from '@/lib/formulario';
import { normalizarPlaca, TIPOS_UNIDAD, type TipoUnidad } from '@/lib/maestros';

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

/**
 * Alta de una unidad.
 *
 * Además de la ficha, recoge los vencimientos del SOAT y de la revisión técnica,
 * que son los dos documentos sin los que una unidad no puede circular en Perú. No
 * son obligatorios en el formulario —puede que se den de alta antes de tenerlos a
 * mano— pero si llegan se registran ya, para que el semáforo de documentación de
 * la flota cuente con ellos desde el primer día.
 */
export async function crearUnidad(formData: FormData): Promise<void> {
  await requerirPermiso('flota', 'editar');

  function volver(error: string): never {
    redirect(`/flota/nueva?error=${error}`);
  }

  const placa = normalizarPlaca(aTexto(formData.get('placa')) ?? '');
  const tipo = aTexto(formData.get('tipo')) ?? '';
  const marca = aTexto(formData.get('marca'));
  const modelo = aTexto(formData.get('modelo'));
  const anio = aNumero(formData.get('anio'));
  const capacidadKg = aNumero(formData.get('capacidadKg'));
  const capacidadM3 = aNumero(formData.get('capacidadM3'));
  const km = aNumero(formData.get('km'));
  const rendimiento = aNumero(formData.get('rendimiento'));
  const conductorId = aNumero(formData.get('conductorId'));
  const soat = aTexto(formData.get('soatVence'));
  const revision = aTexto(formData.get('revisionVence'));
  const observaciones = aTexto(formData.get('observaciones'));

  const anioMaximo = new Date().getFullYear() + 1;

  if (!placa) volver('placa');
  if (!(TIPOS_UNIDAD as readonly string[]).includes(tipo)) volver('tipo');
  if (anio !== null && (!Number.isInteger(anio) || anio < 1980 || anio > anioMaximo)) volver('anio');
  if (capacidadKg === null || capacidadKg <= 0 || capacidadKg > 60_000) volver('capacidad');
  if (capacidadM3 !== null && (capacidadM3 < 0 || capacidadM3 > 200)) volver('capacidad');
  if (km !== null && (km < 0 || km > 5_000_000)) volver('km');
  if (rendimiento === null || rendimiento <= 0 || rendimiento > 300) volver('rendimiento');
  if (soat && !parseFecha(soat)) volver('fecha');
  if (revision && !parseFecha(revision)) volver('fecha');

  const repetida = await get<{ id: number }>(
    "SELECT id FROM unidades WHERE REPLACE(UPPER(placa), '-', '') = $1",
    placa,
  );
  if (repetida) volver('duplicada');

  if (conductorId !== null) {
    const conductor = await get<{ id: number }>(
      "SELECT id FROM conductores WHERE id = $1 AND estado <> 'inactivo'",
      conductorId,
    );
    if (!conductor) volver('conductor');
  }

  await transaccion(async () => {
    const { id } = await run(
      `INSERT INTO unidades
         (placa, tipo, marca, modelo, anio, capacidad_kg, capacidad_m3, km_actual,
          rendimiento_esperado, conductor_fijo_id, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      placa,
      tipo as TipoUnidad,
      marca?.slice(0, 60) ?? null,
      modelo?.slice(0, 60) ?? null,
      anio,
      capacidadKg,
      capacidadM3 ?? 0,
      km ?? 0,
      rendimiento,
      conductorId,
      observaciones?.slice(0, 300) ?? null,
    );

    const documentos: [string, string | null][] = [
      ['soat', soat],
      ['revision_tecnica', revision],
    ];
    for (const [tipoDoc, vence] of documentos) {
      if (!vence) continue;
      await run(
        'INSERT INTO documentos_unidad (unidad_id, tipo, vencimiento) VALUES ($1, $2, $3)',
        id,
        tipoDoc,
        vence,
      );
    }
  });

  revalidatePath('/flota');
  revalidatePath('/despachos/nuevo');
  redirect(`/flota?creada=${encodeURIComponent(placa)}`);
}
