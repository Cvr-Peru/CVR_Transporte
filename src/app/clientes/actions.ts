'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { run, transaccion } from '@/db/client';
import { existeIdFiscal } from '@/db/queries/clientes';
import { siguienteCodigo } from '@/db/queries/codigos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aNumero, aTexto } from '@/lib/formulario';

/**
 * Alta de un cliente.
 *
 * El formulario ya trae sus `required`, `min` y `pattern`, pero eso es comodidad:
 * cualquiera puede enviarlo a mano. Aquí se vuelve a comprobar todo, y lo único
 * que el navegador no puede saber —que el identificador fiscal ya esté dado de
 * alta— vuelve a la pantalla con un aviso concreto.
 */
export async function crearCliente(formData: FormData): Promise<void> {
  await requerirPermiso('clientes', 'editar');

  const nombre = aTexto(formData.get('nombre'));
  const idFiscal = aTexto(formData.get('idFiscal'))?.toUpperCase() ?? null;
  const contacto = aTexto(formData.get('contacto'));
  const telefono = aTexto(formData.get('telefono'));
  const email = aTexto(formData.get('email'))?.toLowerCase() ?? null;
  const direccion = aTexto(formData.get('direccion'));
  const ciudad = aTexto(formData.get('ciudad'));
  const tarifaBase = aNumero(formData.get('tarifaBase'));
  const tarifaKg = aNumero(formData.get('tarifaKg'));
  const plazo = aNumero(formData.get('plazo'));

  function volver(error: string): never {
    redirect(`/clientes/nuevo?error=${error}`);
  }

  if (!nombre || nombre.length > 120) volver('nombre');
  if (idFiscal && !/^[0-9A-Z][0-9A-Z\-\s]{4,19}$/.test(idFiscal)) volver('fiscal');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) volver('correo');
  if (tarifaBase === null || tarifaBase < 0 || tarifaBase > 100_000) volver('tarifa');
  if (tarifaKg === null || tarifaKg < 0 || tarifaKg > 10_000) volver('tarifa');
  if (plazo === null || !Number.isInteger(plazo) || plazo < 0 || plazo > 180) volver('plazo');
  if (idFiscal && (await existeIdFiscal(idFiscal))) volver('duplicado');

  let codigo = '';
  await transaccion(async () => {
    codigo = await siguienteCodigo('clientes');
    await run(
      `INSERT INTO clientes
         (codigo, nombre, id_fiscal, contacto, telefono, email, direccion, ciudad,
          tarifa_base, tarifa_kg, plazo_pago_dias)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      codigo,
      nombre,
      idFiscal,
      contacto?.slice(0, 120) ?? null,
      telefono?.slice(0, 40) ?? null,
      email?.slice(0, 160) ?? null,
      direccion?.slice(0, 200) ?? null,
      ciudad?.slice(0, 80) ?? null,
      tarifaBase,
      tarifaKg,
      plazo,
    );
  });

  revalidatePath('/clientes');
  revalidatePath('/pedidos/nuevo');
  revalidatePath('/despachos/nuevo');
  redirect(`/clientes?creado=${encodeURIComponent(codigo)}`);
}
