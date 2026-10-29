'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run, transaccion } from '@/db/client';
import { siguienteCodigo } from '@/db/queries/codigos';
import { rutasAbiertasDe } from '@/db/queries/maestros';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO, parseFecha } from '@/lib/format';
import { aNumero, aTexto } from '@/lib/formulario';
import { aId, CATEGORIAS_LICENCIA, normalizarDocumento, VINCULACIONES } from '@/lib/maestros';

interface DatosConductor {
  nombre: string;
  documento: string;
  telefono: string | null;
  email: string | null;
  vinculacion: string;
  licencia: string | null;
  categoria: string | null;
  licenciaVence: string | null;
  comision: number;
  salario: number;
  ingreso: string;
}

/**
 * Lee y valida la ficha de un conductor. La comparten el alta y la edición; al
 * editar, `excluirId` es el propio conductor, cuyo documento no cuenta como
 * duplicado.
 */
async function leerConductor(
  formData: FormData,
  excluirId: number | null,
  volver: (error: string) => never,
): Promise<DatosConductor> {
  const nombre = aTexto(formData.get('nombre'));
  const documento = normalizarDocumento(aTexto(formData.get('documento')) ?? '');
  const telefono = aTexto(formData.get('telefono'));
  const email = aTexto(formData.get('email'))?.toLowerCase() ?? null;
  const vinculacion = aTexto(formData.get('vinculacion')) ?? '';
  const licencia = aTexto(formData.get('licencia'))?.toUpperCase() ?? null;
  const categoria = aTexto(formData.get('categoria'));
  const licenciaVence = aTexto(formData.get('licenciaVence'));
  const comision = aNumero(formData.get('comision'));
  const salario = aNumero(formData.get('salario'));
  const ingreso = aTexto(formData.get('ingreso')) ?? hoyISO();

  if (!nombre || nombre.length > 120) volver('nombre');
  if (!documento) volver('documento');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) volver('correo');
  if (!(VINCULACIONES as readonly string[]).includes(vinculacion)) volver('vinculacion');
  if (categoria && !(CATEGORIAS_LICENCIA as readonly string[]).includes(categoria)) volver('categoria');
  if (licenciaVence && !parseFecha(licenciaVence)) volver('fecha');
  if (!parseFecha(ingreso)) volver('fecha');
  if (comision === null || comision < 0 || comision > 50) volver('comision');
  if (salario !== null && (salario < 0 || salario > 50_000)) volver('salario');

  const repetido = await get<{ id: number }>(
    "SELECT id FROM conductores WHERE UPPER(REPLACE(REPLACE(documento, ' ', ''), '-', '')) = $1 AND id <> $2",
    documento,
    excluirId ?? 0,
  );
  if (repetido) volver('duplicado');

  return {
    nombre,
    documento,
    telefono: telefono?.slice(0, 40) ?? null,
    email: email?.slice(0, 160) ?? null,
    vinculacion,
    licencia: licencia?.slice(0, 20) ?? null,
    categoria,
    licenciaVence,
    comision,
    salario: salario ?? 0,
    ingreso,
  };
}

/** Las pantallas que muestran conductores o eligen uno. */
function revalidarConductores(id?: number): void {
  revalidatePath('/conductores');
  if (id) revalidatePath(`/conductores/${id}/editar`);
  revalidatePath('/despachos/nuevo');
  revalidatePath('/usuarios');
}

/**
 * Alta de un conductor en la plantilla.
 *
 * Es la ficha de trabajo —licencia, vinculación, comisión— y no la cuenta para
 * entrar en la aplicación: esa se crea en «Usuarios y permisos» y se vincula con
 * esta ficha. Son dos cosas distintas a propósito: puede haber conductores que
 * nunca usen el móvil y cuya ruta registre la oficina.
 */
export async function crearConductor(formData: FormData): Promise<void> {
  await requerirPermiso('conductores', 'editar');

  const d = await leerConductor(formData, null, (error) =>
    redirect(`/conductores/nuevo?error=${error}`),
  );

  let codigo = '';
  await transaccion(async () => {
    codigo = await siguienteCodigo('conductores');
    await run(
      `INSERT INTO conductores
         (codigo, nombre, documento, telefono, email, tipo_vinculacion, numero_licencia,
          licencia_categoria, licencia_vencimiento, comision_pct, salario_base, fecha_ingreso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      codigo,
      d.nombre,
      d.documento,
      d.telefono,
      d.email,
      d.vinculacion,
      d.licencia,
      d.categoria,
      d.licenciaVence,
      d.comision,
      d.salario,
      d.ingreso,
    );
  });

  revalidarConductores();
  redirect(`/conductores?creado=${encodeURIComponent(codigo)}`);
}

/**
 * Corrige la ficha de un conductor.
 *
 * Una comisión o un salario nuevos valen para las liquidaciones que se generen
 * desde ahora; las ya aprobadas o pagadas guardan sus importes.
 */
export async function editarConductor(formData: FormData): Promise<void> {
  await requerirPermiso('conductores', 'editar');

  const id = aId(formData.get('id'));
  if (!id) redirect('/conductores');
  const actual = await get<{ codigo: string }>('SELECT codigo FROM conductores WHERE id = $1', id);
  if (!actual) redirect('/conductores');

  const d = await leerConductor(formData, id, (error) =>
    redirect(`/conductores/${id}/editar?error=${error}`),
  );

  await run(
    `UPDATE conductores
        SET nombre = $1, documento = $2, telefono = $3, email = $4, tipo_vinculacion = $5,
            numero_licencia = $6, licencia_categoria = $7, licencia_vencimiento = $8,
            comision_pct = $9, salario_base = $10, fecha_ingreso = $11
      WHERE id = $12`,
    d.nombre,
    d.documento,
    d.telefono,
    d.email,
    d.vinculacion,
    d.licencia,
    d.categoria,
    d.licenciaVence,
    d.comision,
    d.salario,
    d.ingreso,
    id,
  );

  revalidarConductores(id);
  redirect(`/conductores?editado=${encodeURIComponent(actual.codigo)}`);
}

/**
 * Da de baja (`inactivo`) o reactiva (`activo`) a un conductor.
 *
 * Nunca se borra: sus rutas y liquidaciones lo siguen nombrando. Con una ruta en
 * curso no se puede dar de baja: tiene paradas por resolver en la calle, y
 * primero hay que cerrar esa ruta o pasársela a otro conductor.
 */
export async function cambiarActividadConductor(formData: FormData): Promise<void> {
  await requerirPermiso('conductores', 'editar');

  const id = aId(formData.get('id'));
  const activar = formData.get('activo') === '1';
  if (!id) redirect('/conductores');
  const conductor = await get<{ codigo: string }>('SELECT codigo FROM conductores WHERE id = $1', id);
  if (!conductor) redirect('/conductores');

  if (activar) {
    // Solo se reactiva al que estaba de baja: no se saca a nadie de vacaciones
    // ni de una incapacidad por esta vía.
    await run("UPDATE conductores SET estado = 'activo' WHERE id = $1 AND estado = 'inactivo'", id);
  } else {
    const { enCurso } = await rutasAbiertasDe('conductor', id);
    if (enCurso.length > 0) redirect(`/conductores/${id}/editar?error=en_curso`);
    await run("UPDATE conductores SET estado = 'inactivo' WHERE id = $1", id);
  }

  revalidarConductores(id);
  redirect(`/conductores?${activar ? 'reactivado' : 'baja'}=${encodeURIComponent(conductor.codigo)}`);
}
