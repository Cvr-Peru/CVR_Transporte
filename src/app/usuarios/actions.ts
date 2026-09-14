'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { escalar, get, run } from '@/db/client';
import type { Rol } from '@/lib/auth/permisos';
import { esRolValido } from '@/lib/auth/permisos';
import { generarSal, hashClave } from '@/lib/auth/claves';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aNumero, aTexto } from '@/lib/formulario';

/**
 * Gestión de usuarios desde la aplicación.
 *
 * Antes esto solo existía en la terminal (`npm run usuario`). Para quien
 * administra el sistema eso no vale: crear la cuenta de un conductor no puede
 * depender de tener acceso al servidor, y menos en Railway, donde habría que
 * entrar por consola cada vez.
 *
 * Lo que **no** se hace aquí, a propósito: borrar usuarios. Un usuario borrado se
 * lleva por delante el rastro de quién registró cada pedido y quién subió cada
 * foto de entrega. Se desactiva, que consigue lo mismo —deja de poder entrar— sin
 * perder la trazabilidad.
 */

/** Longitud mínima de contraseña. Coincide con la de `npm run usuario`. */
const CLAVE_MINIMA = 8;

function refrescar(): void {
  revalidatePath('/usuarios');
}

function esCorreoValido(valor: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(valor);
}

// ─────────────────────────────────────────────────────────────
// Alta
// ─────────────────────────────────────────────────────────────
/** Crea una cuenta con su rol y, si es de conductor, vinculada a su ficha. */
export async function crearUsuario(formData: FormData): Promise<void> {
  await requerirPermiso('usuarios', 'editar');

  const email = (aTexto(formData.get('email')) ?? '').toLowerCase();
  const nombre = aTexto(formData.get('nombre'));
  const rol = aTexto(formData.get('rol'));
  const clave = aTexto(formData.get('clave'));
  const conductorId = aNumero(formData.get('conductorId'));

  if (!email || !nombre || !rol || !clave) redirect('/usuarios?error=datos');
  if (!esRolValido(rol)) redirect('/usuarios?error=rol');
  if (!esCorreoValido(email)) redirect('/usuarios?error=correo');
  if (clave.length < CLAVE_MINIMA) redirect('/usuarios?error=clave');

  const existente =
    (await escalar<number>(
      'SELECT COUNT(*) AS n FROM usuarios WHERE LOWER(email) = LOWER($1)',
      email,
    )) ?? 0;
  if (Number(existente) > 0) redirect('/usuarios?error=duplicado');

  // El vínculo con un conductor solo tiene sentido para ese rol: es lo que hace
  // que la persona vea **su** ruta y no la de otro.
  const vincular = rol === 'conductor' && conductorId ? conductorId : null;

  const sal = generarSal();
  const hash = await hashClave(clave, sal);

  await run(
    `INSERT INTO usuarios (email, nombre, hash_clave, sal_clave, rol, conductor_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    email,
    nombre,
    hash,
    sal,
    rol as Rol,
    vincular,
  );

  refrescar();
  redirect(`/usuarios?creado=${encodeURIComponent(email)}`);
}

// ─────────────────────────────────────────────────────────────
// Contraseña
// ─────────────────────────────────────────────────────────────
/**
 * Pone una contraseña nueva y cierra las sesiones abiertas.
 *
 * Cerrarlas es parte del cambio, no un extra: si alguien había entrado con la
 * anterior, cambiar la contraseña sin cerrar sesiones no lo echaría hasta que
 * caducara su cookie.
 */
export async function restablecerClave(formData: FormData): Promise<void> {
  await requerirPermiso('usuarios', 'editar');

  const usuarioId = aNumero(formData.get('usuarioId'));
  const clave = aTexto(formData.get('clave'));

  if (!usuarioId) redirect('/usuarios?error=usuario');
  if (!clave || clave.length < CLAVE_MINIMA) redirect('/usuarios?error=clave');

  const usuario = await get<{ nombre: string }>(
    'SELECT nombre FROM usuarios WHERE id = $1',
    usuarioId,
  );
  if (!usuario) redirect('/usuarios?error=usuario');

  const sal = generarSal();
  const hash = await hashClave(clave, sal);

  await run(
    'UPDATE usuarios SET hash_clave = $1, sal_clave = $2 WHERE id = $3',
    hash,
    sal,
    usuarioId,
  );
  await run('DELETE FROM sesiones WHERE usuario_id = $1', usuarioId);

  refrescar();
  redirect(`/usuarios?clave-de=${encodeURIComponent(usuario.nombre)}`);
}

// ─────────────────────────────────────────────────────────────
// Estado
// ─────────────────────────────────────────────────────────────
/**
 * Activa o desactiva una cuenta.
 *
 * Los dos frenos de abajo no son teóricos: sin ellos es posible desactivarse a
 * uno mismo, o desactivar al último administrador, y dejar la aplicación sin
 * nadie que pueda gestionar cuentas. Recuperarse de eso exige entrar por consola
 * al servidor, que es justo lo que esta pantalla viene a evitar.
 */
export async function cambiarEstadoUsuario(formData: FormData): Promise<void> {
  const sesion = await requerirPermiso('usuarios', 'editar');

  const usuarioId = aNumero(formData.get('usuarioId'));
  const activar = formData.get('accion') === 'activar';
  if (!usuarioId) redirect('/usuarios?error=usuario');

  if (!activar) {
    if (usuarioId === sesion.usuarioId) redirect('/usuarios?error=yo-mismo');

    // Con la regla de arriba esta comprobación no se alcanza hoy —siempre queda
    // quien la ejecuta—, pero deja el invariante escrito donde se rompería.
    if ((await quedanAdministradores(usuarioId)) === 0) {
      redirect('/usuarios?error=ultimo-admin');
    }
  }

  await run('UPDATE usuarios SET activo = $1 WHERE id = $2', activar ? 1 : 0, usuarioId);
  // Desactivar sin cerrar sesiones dejaría la cuenta operativa hasta que caducara
  // la cookie que ya tiene el navegador.
  if (!activar) await run('DELETE FROM sesiones WHERE usuario_id = $1', usuarioId);

  refrescar();
  redirect(`/usuarios?${activar ? 'activado' : 'desactivado'}=1`);
}

// ─────────────────────────────────────────────────────────────
// Vínculo con un conductor
// ─────────────────────────────────────────────────────────────
/**
 * Ata una cuenta de conductor con su ficha de la plantilla.
 *
 * Es lo que decide **qué** ve: sin este vínculo, un usuario con rol conductor
 * entra y no encuentra ninguna ruta, porque no hay forma de saber cuál es la
 * suya. El vínculo se puede quitar dejando el selector vacío.
 */
export async function vincularConductor(formData: FormData): Promise<void> {
  await requerirPermiso('usuarios', 'editar');

  const usuarioId = aNumero(formData.get('usuarioId'));
  const conductorId = aNumero(formData.get('conductorId'));
  if (!usuarioId) redirect('/usuarios?error=usuario');

  const usuario = await get<{ rol: Rol }>('SELECT rol FROM usuarios WHERE id = $1', usuarioId);
  if (!usuario) redirect('/usuarios?error=usuario');
  if (usuario.rol !== 'conductor') redirect('/usuarios?error=no-conductor');

  await run('UPDATE usuarios SET conductor_id = $1 WHERE id = $2', conductorId, usuarioId);

  refrescar();
  redirect('/usuarios?vinculado=1');
}

// ─────────────────────────────────────────────────────────────
// Rol
// ─────────────────────────────────────────────────────────────
/**
 * Cuántos administradores activos quedarían si esta cuenta dejara de serlo.
 *
 * Es la comprobación que impide dejar la aplicación sin nadie que pueda gestionar
 * cuentas, que es el único estado del que no se sale sin entrar por consola al
 * servidor.
 */
async function quedanAdministradores(usuarioId: number): Promise<number> {
  const otros =
    (await escalar<number>(
      `SELECT COUNT(*) FROM usuarios
       WHERE rol = 'administracion' AND activo = 1 AND id <> $1`,
      usuarioId,
    )) ?? 0;

  return Number(otros);
}

/**
 * Cambia el rol de una cuenta.
 *
 * Pasa constantemente: alguien entra de despacho y luego pasa a conducir, o al
 * revés. Sin esto habría que crear una cuenta nueva desde la terminal y perder el
 * historial de la anterior.
 */
export async function cambiarRol(formData: FormData): Promise<void> {
  await requerirPermiso('usuarios', 'editar');

  const usuarioId = aNumero(formData.get('usuarioId'));
  const rol = aTexto(formData.get('rol'));

  if (!usuarioId) redirect('/usuarios?error=usuario');
  if (!rol || !esRolValido(rol)) redirect('/usuarios?error=rol');

  const usuario = await get<{ rol: Rol; nombre: string }>(
    'SELECT rol, nombre FROM usuarios WHERE id = $1',
    usuarioId,
  );
  if (!usuario) redirect('/usuarios?error=usuario');
  if (usuario.rol === rol) redirect('/usuarios?error=mismo-rol');

  // Quitarle el rol de administración a alguien no puede dejar el sistema sin
  // ninguno. Aquí sí se puede llegar: uno mismo puede rebajarse siendo el último.
  if (rol !== 'administracion' && (await quedanAdministradores(usuarioId)) === 0) {
    redirect('/usuarios?error=ultimo-admin');
  }

  if (rol === 'conductor') {
    // Se conserva el vínculo que ya tuviera: puede estar volviendo a conducir
    // después de un tiempo en oficina, y su ficha sigue siendo la misma.
    await run('UPDATE usuarios SET rol = $1 WHERE id = $2', rol as Rol, usuarioId);
  } else {
    // Deja de ser conductor, así que apuntar a una ficha de la plantilla sería
    // engañoso: el vínculo se borra.
    await run(
      'UPDATE usuarios SET rol = $1, conductor_id = NULL WHERE id = $2',
      rol as Rol,
      usuarioId,
    );
  }

  refrescar();
  redirect(`/usuarios?rol-de=${encodeURIComponent(usuario.nombre)}`);
}
