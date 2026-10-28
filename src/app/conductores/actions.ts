'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run, transaccion } from '@/db/client';
import { siguienteCodigo } from '@/db/queries/codigos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO, parseFecha } from '@/lib/format';
import { aNumero, aTexto } from '@/lib/formulario';
import { CATEGORIAS_LICENCIA, normalizarDocumento, VINCULACIONES } from '@/lib/maestros';

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

  function volver(error: string): never {
    redirect(`/conductores/nuevo?error=${error}`);
  }

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
    "SELECT id FROM conductores WHERE UPPER(REPLACE(REPLACE(documento, ' ', ''), '-', '')) = $1",
    documento,
  );
  if (repetido) volver('duplicado');

  let codigo = '';
  await transaccion(async () => {
    codigo = await siguienteCodigo('conductores');
    await run(
      `INSERT INTO conductores
         (codigo, nombre, documento, telefono, email, tipo_vinculacion, numero_licencia,
          licencia_categoria, licencia_vencimiento, comision_pct, salario_base, fecha_ingreso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      codigo,
      nombre,
      documento,
      telefono?.slice(0, 40) ?? null,
      email?.slice(0, 160) ?? null,
      vinculacion,
      licencia?.slice(0, 20) ?? null,
      categoria,
      licenciaVence,
      comision,
      salario ?? 0,
      ingreso,
    );
  });

  revalidatePath('/conductores');
  revalidatePath('/despachos/nuevo');
  revalidatePath('/usuarios');
  redirect(`/conductores?creado=${encodeURIComponent(codigo)}`);
}
