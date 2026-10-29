'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run, transaccion } from '@/db/client';
import { existeIdFiscal } from '@/db/queries/clientes';
import { siguienteCodigo } from '@/db/queries/codigos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aNumero, aTexto } from '@/lib/formulario';
import { aId } from '@/lib/maestros';

interface DatosCliente {
  nombre: string;
  idFiscal: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  tarifaBase: number;
  tarifaKg: number;
  plazo: number;
}

/**
 * Lee y valida la ficha de un cliente. La comparten el alta y la edición, para
 * que las dos acepten y rechacen exactamente lo mismo.
 *
 * El formulario ya trae sus `required`, `min` y `pattern`, pero eso es comodidad:
 * cualquiera puede enviarlo a mano. Aquí se vuelve a comprobar todo, y lo único
 * que el navegador no puede saber —que el identificador fiscal ya esté dado de
 * alta en otro cliente— vuelve a la pantalla con un aviso concreto.
 *
 * `volver` redirige a la pantalla de origen con el código de error.
 */
async function leerCliente(
  formData: FormData,
  excluirId: number | null,
  volver: (error: string) => never,
): Promise<DatosCliente> {
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

  if (!nombre || nombre.length > 120) volver('nombre');
  if (idFiscal && !/^[0-9A-Z][0-9A-Z\-\s]{4,19}$/.test(idFiscal)) volver('fiscal');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) volver('correo');
  if (tarifaBase === null || tarifaBase < 0 || tarifaBase > 100_000) volver('tarifa');
  if (tarifaKg === null || tarifaKg < 0 || tarifaKg > 10_000) volver('tarifa');
  if (plazo === null || !Number.isInteger(plazo) || plazo < 0 || plazo > 180) volver('plazo');
  if (idFiscal && (await existeIdFiscal(idFiscal, excluirId))) volver('duplicado');

  return {
    nombre,
    idFiscal,
    contacto: contacto?.slice(0, 120) ?? null,
    telefono: telefono?.slice(0, 40) ?? null,
    email: email?.slice(0, 160) ?? null,
    direccion: direccion?.slice(0, 200) ?? null,
    ciudad: ciudad?.slice(0, 80) ?? null,
    tarifaBase,
    tarifaKg,
    plazo,
  };
}

/** Las pantallas que muestran clientes o eligen uno. */
function revalidarClientes(id?: number): void {
  revalidatePath('/clientes');
  if (id) revalidatePath(`/clientes/${id}`);
  revalidatePath('/pedidos');
  revalidatePath('/pedidos/nuevo');
  revalidatePath('/pedidos/pegar');
  revalidatePath('/despachos/nuevo');
}

/** Alta de un cliente. */
export async function crearCliente(formData: FormData): Promise<void> {
  await requerirPermiso('clientes', 'editar');

  const d = await leerCliente(formData, null, (error) => redirect(`/clientes/nuevo?error=${error}`));

  let codigo = '';
  await transaccion(async () => {
    codigo = await siguienteCodigo('clientes');
    await run(
      `INSERT INTO clientes
         (codigo, nombre, id_fiscal, contacto, telefono, email, direccion, ciudad,
          tarifa_base, tarifa_kg, plazo_pago_dias)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      codigo,
      d.nombre,
      d.idFiscal,
      d.contacto,
      d.telefono,
      d.email,
      d.direccion,
      d.ciudad,
      d.tarifaBase,
      d.tarifaKg,
      d.plazo,
    );
  });

  revalidarClientes();
  redirect(`/clientes?creado=${encodeURIComponent(codigo)}`);
}

/**
 * Corrige la ficha de un cliente.
 *
 * Cambiar la tarifa solo afecta a los pedidos que se registren a partir de ahora:
 * el flete de cada envío se calculó y guardó al crearlo, y lo ya facturado no se
 * toca. El código del cliente no se edita: es la referencia que aparece en las
 * facturas emitidas.
 */
export async function editarCliente(formData: FormData): Promise<void> {
  await requerirPermiso('clientes', 'editar');

  const id = aId(formData.get('id'));
  if (!id) redirect('/clientes');
  const actual = await get<{ codigo: string }>('SELECT codigo FROM clientes WHERE id = $1', id);
  if (!actual) redirect('/clientes');

  const d = await leerCliente(formData, id, (error) => redirect(`/clientes/${id}?error=${error}`));

  await run(
    `UPDATE clientes
        SET nombre = $1, id_fiscal = $2, contacto = $3, telefono = $4, email = $5,
            direccion = $6, ciudad = $7, tarifa_base = $8, tarifa_kg = $9, plazo_pago_dias = $10
      WHERE id = $11`,
    d.nombre,
    d.idFiscal,
    d.contacto,
    d.telefono,
    d.email,
    d.direccion,
    d.ciudad,
    d.tarifaBase,
    d.tarifaKg,
    d.plazo,
    id,
  );

  revalidarClientes(id);
  redirect(`/clientes?editado=${encodeURIComponent(actual.codigo)}`);
}

/**
 * Da de baja o reactiva un cliente.
 *
 * Nunca se borra: sus envíos y sus facturas lo siguen nombrando. Dado de baja deja
 * de ofrecerse al registrar pedidos y al crear despachos, y las acciones que los
 * crean lo rechazan aunque alguien envíe su identificador a mano.
 */
export async function cambiarActividadCliente(formData: FormData): Promise<void> {
  await requerirPermiso('clientes', 'editar');

  const id = aId(formData.get('id'));
  const activo = formData.get('activo') === '1' ? 1 : 0;
  if (!id) redirect('/clientes');
  const actual = await get<{ codigo: string }>('SELECT codigo FROM clientes WHERE id = $1', id);
  if (!actual) redirect('/clientes');

  await run('UPDATE clientes SET activo = $1 WHERE id = $2', activo, id);

  revalidarClientes(id);
  redirect(`/clientes?${activo ? 'reactivado' : 'baja'}=${encodeURIComponent(actual.codigo)}`);
}
