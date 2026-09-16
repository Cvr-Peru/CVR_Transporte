'use server';

import { redirect } from 'next/navigation';
import { run, transaccion } from '@/db/client';
import { hayUsuarios } from '@/db/queries/usuarios';
import { generarSal, hashClave } from '@/lib/auth/claves';
import { iniciarSesion } from '@/lib/auth/sesion';
import { aTexto } from '@/lib/formulario';

/**
 * Crea la primera cuenta de administración de una instalación nueva.
 *
 * Es la única acción de la aplicación que **no** pasa por `requerirPermiso`, y
 * no puede pasarlo: no hay sesión todavía porque no hay ninguna cuenta. Lo que la
 * protege es otra cosa: **solo funciona si la tabla de usuarios está vacía**. En
 * cuanto existe una cuenta, esta acción no hace nada y la pantalla se cierra.
 *
 * Es el problema clásico del arranque en frío —alguien tiene que ser el primero—
 * y se resuelve igual que en cualquier instalación: la ventana está abierta
 * únicamente durante los minutos que van desde que se despliega hasta que se crea
 * la primera cuenta. Por eso la comprobación se repite **dentro de la
 * transacción**, pegada al INSERT: si dos personas envían el formulario a la vez,
 * solo una puede ganar.
 */

const CLAVE_MINIMA = 8;

function esCorreoValido(valor: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(valor);
}

export async function crearPrimerAdministrador(formData: FormData): Promise<void> {
  // Primera barrera: si ya hay cuentas, esto no es una instalación nueva.
  if (await hayUsuarios()) redirect('/entrar');

  const nombre = aTexto(formData.get('nombre'));
  const email = (aTexto(formData.get('email')) ?? '').toLowerCase();
  const clave = aTexto(formData.get('clave'));

  if (!nombre || !email || !clave) redirect('/configuracion-inicial?error=datos');
  if (!esCorreoValido(email)) redirect('/configuracion-inicial?error=correo');
  if (clave.length < CLAVE_MINIMA) redirect('/configuracion-inicial?error=clave');

  const sal = generarSal();
  const hash = await hashClave(clave, sal);

  let usuarioId: number | null = null;

  await transaccion(async () => {
    // El INSERT lleva su propia condición: solo entra si la tabla sigue vacía.
    // Así dos envíos simultáneos no pueden crear dos administradores, ni siquiera
    // en el hueco que hay entre la comprobación de arriba y esta línea.
    const { id } = await run(
      `INSERT INTO usuarios (email, nombre, hash_clave, sal_clave, rol)
       SELECT $1, $2, $3, $4, 'administracion'
       WHERE NOT EXISTS (SELECT 1 FROM usuarios)
       RETURNING id`,
      email,
      nombre,
      hash,
      sal,
    );

    usuarioId = id;
  });

  // Sin identificador es que alguien se adelantó: la tabla ya no estaba vacía.
  if (!usuarioId) redirect('/entrar');

  // Se entra directamente. Es lo que evita el peor final posible: crear la única
  // cuenta de administración con una contraseña mal escrita y quedarse fuera.
  await iniciarSesion(usuarioId, null);

  redirect('/');
}
