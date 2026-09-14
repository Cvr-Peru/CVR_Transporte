/**
 * Sesiones de usuario (solo servidor).
 *
 * Modelo: **sesiones con estado en la base de datos**, no tokens firmados.
 *
 * Por qué así:
 *  - Cerrar sesión de verdad es un `DELETE`, no esperar a que caduque un token.
 *  - Se puede desactivar a un usuario y todas sus sesiones mueren al instante.
 *  - En la tabla se guarda el **hash** del token, nunca el token: quien lea la
 *    base de datos no puede suplantar a nadie.
 *
 * La cookie es `httpOnly` (JavaScript del navegador no puede leerla, así que un
 * fallo de XSS no roba la sesión), `sameSite: lax` (frena el CSRF) y `secure`
 * salvo en local, porque los navegadores descartan cookies `secure` por HTTP.
 */
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { get, run } from '@/db/client';
import { aISOCompleto } from '@/lib/format';
import { generarToken, hashToken, verificarClave } from './claves';
import { puede, type Accion, type Modulo, type Rol } from './permisos';

const COOKIE = 'transporte_sesion';
const DIAS_DURACION = 7;

export interface Sesion {
  usuarioId: number;
  email: string;
  nombre: string;
  rol: Rol;
  /** Solo para el rol `conductor`: a qué conductor corresponde. */
  conductorId: number | null;
}

// ─────────────────────────────────────────────────────────────
// Utilidades internas
// ─────────────────────────────────────────────────────────────
function enDias(dias: number): Date {
  return new Date(Date.now() + dias * 86_400_000);
}

/**
 * Una cookie `secure` solo se envía por HTTPS. En local se trabaja por HTTP, así
 * que se marca como segura en cualquier host que no sea local.
 */
async function esLocal(): Promise<boolean> {
  const cabeceras = await headers();
  const host = cabeceras.get('host') ?? '';
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

// ─────────────────────────────────────────────────────────────
// Autenticación
// ─────────────────────────────────────────────────────────────
export type ResultadoAutenticacion =
  | { ok: true; usuarioId: number; rol: Rol; nombre: string }
  | { ok: false; motivo: string };

/**
 * Comprueba unas credenciales.
 *
 * Cuando el correo no existe se hace igualmente el cálculo caro con una sal y un
 * hash ficticios: así el tiempo de respuesta no revela qué correos están dados
 * de alta. Es la diferencia entre un mensaje genérico creíble y un buscador de
 * usuarios para atacantes.
 */
export async function autenticar(email: string, clave: string): Promise<ResultadoAutenticacion> {
  const usuario = await get<{
    id: number;
    nombre: string;
    rol: Rol;
    hash_clave: string;
    sal_clave: string;
    activo: number;
  }>(
    'SELECT id, nombre, rol, hash_clave, sal_clave, activo FROM usuarios WHERE LOWER(email) = LOWER($1)',
    email.trim(),
  );

  const sal = usuario?.sal_clave ?? 'sal-ficticia-para-igualar-el-tiempo-de-respuesta';
  const hash = usuario?.hash_clave ?? 'no-hexadecimal-para-que-la-comparacion-falle';
  const correcta = await verificarClave(clave, sal, hash);

  if (!usuario || !correcta) {
    return { ok: false, motivo: 'El correo o la contraseña no son correctos.' };
  }
  if (!usuario.activo) {
    return { ok: false, motivo: 'Esta cuenta está desactivada. Habla con administración.' };
  }

  return { ok: true, usuarioId: usuario.id, rol: usuario.rol, nombre: usuario.nombre };
}

/** Crea una sesión y deja la cookie puesta. Solo desde una acción de servidor. */
export async function iniciarSesion(
  usuarioId: number,
  userAgent: string | null,
): Promise<void> {
  const token = generarToken();
  const ahora = new Date();
  const expira = enDias(DIAS_DURACION);

  await run(
    `INSERT INTO sesiones (token_hash, usuario_id, creada, expira, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    hashToken(token),
    usuarioId,
    aISOCompleto(ahora),
    aISOCompleto(expira),
    userAgent,
  );

  await run('UPDATE usuarios SET ultimo_acceso = $1 WHERE id = $2', aISOCompleto(ahora), usuarioId);

  // Aprovechando el alta se limpian las sesiones caducadas de cualquier usuario.
  await run('DELETE FROM sesiones WHERE expira < $1', aISOCompleto(ahora));

  const almacen = await cookies();
  almacen.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !(await esLocal()),
    path: '/',
    expires: expira,
  });
}

/** Cierra la sesión actual: borra la fila y la cookie. */
export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE)?.value;

  if (token) {
    await run('DELETE FROM sesiones WHERE token_hash = $1', hashToken(token));
  }
  almacen.delete(COOKIE);
}

/** Invalida todas las sesiones de un usuario. Útil al cambiar su contraseña. */
export async function cerrarTodasLasSesiones(usuarioId: number): Promise<void> {
  await run('DELETE FROM sesiones WHERE usuario_id = $1', usuarioId);
}

// ─────────────────────────────────────────────────────────────
// Lectura de la sesión actual
// ─────────────────────────────────────────────────────────────
/**
 * Sesión del usuario que hace la petición, o `null`.
 *
 * Se envuelve en `cache()` para que las varias comprobaciones que hace una misma
 * página se resuelvan con una sola consulta.
 */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  try {
    const almacen = await cookies();
    const token = almacen.get(COOKIE)?.value;
    if (!token) return null;

    const fila = await get<{
      id: number;
      email: string;
      nombre: string;
      rol: Rol;
      conductor_id: number | null;
      expira: string;
    }>(
      `SELECT u.id, u.email, u.nombre, u.rol, u.conductor_id, s.expira
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = $1 AND u.activo = 1`,
      hashToken(token),
    );

    if (!fila) return null;

    // Las fechas son TEXT con formato fijo, así que se comparan directamente.
    if (fila.expira < aISOCompleto(new Date())) {
      await run('DELETE FROM sesiones WHERE token_hash = $1', hashToken(token));
      return null;
    }

    return {
      usuarioId: fila.id,
      email: fila.email,
      nombre: fila.nombre,
      rol: fila.rol,
      conductorId: fila.conductor_id,
    };
  } catch {
    // Si la base de datos no responde se trata como «sin sesión» en lugar de
    // tumbar toda la aplicación. Las páginas que necesitan datos fallarán con su
    // propio error, pero las públicas (la de sin conexión, por ejemplo) siguen
    // sirviéndose, que es justo cuando más falta hacen.
    return null;
  }
});

// ─────────────────────────────────────────────────────────────
// Guardas para páginas y acciones
// ─────────────────────────────────────────────────────────────
/** Exige sesión. Si no la hay, manda a la pantalla de entrada. */
export async function requerirSesion(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) redirect('/entrar');
  return sesion;
}

/**
 * Exige permiso sobre un módulo. Es la guarda que debe abrir **toda** página que
 * lea datos y **toda** acción de servidor que escriba.
 *
 * Comprobar solo en el menú o en una capa intermedia no basta: las acciones de
 * servidor se pueden invocar directamente, así que la comprobación tiene que
 * estar en el propio punto de escritura.
 */
export async function requerirPermiso(
  modulo: Modulo,
  accion: Accion = 'ver',
): Promise<Sesion> {
  const sesion = await requerirSesion();
  if (!puede(sesion.rol, modulo, accion)) {
    redirect(`/sin-acceso?modulo=${modulo}`);
  }
  return sesion;
}

/**
 * Exige poder resolver paradas y, si quien pide es un conductor, que la parada
 * pertenezca a una de **sus** rutas.
 *
 * El permiso por módulo no basta aquí. Todos los conductores comparten la acción
 * `entregar`, así que sin esta comprobación a uno le bastaría con enviar el
 * identificador de una parada de otro compañero para marcarla como entregada,
 * cobrada o perdida. Es la diferencia entre «puede entregar» y «puede entregar
 * lo suyo», y por eso la comprobación vive junto al permiso y no en la interfaz.
 *
 * La oficina (administración y despacho) sí puede resolver cualquier parada:
 * muchas veces registra entregas en nombre de un conductor que llamó por
 * teléfono.
 */
export async function requerirParadaPropia(paradaId: number): Promise<Sesion> {
  const sesion = await requerirPermiso('despachos', 'entregar');
  if (sesion.rol !== 'conductor') return sesion;

  // Un conductor sin ficha de conductor asociada no tiene rutas propias.
  if (sesion.conductorId === null) redirect('/sin-acceso?modulo=despachos');

  const fila = await get<{ n: number }>(
    `SELECT COUNT(*) AS n
     FROM paradas p
     JOIN rutas r ON r.id = p.ruta_id
     WHERE p.id = $1 AND r.conductor_id = $2`,
    paradaId,
    sesion.conductorId,
  );

  if (Number(fila?.n ?? 0) === 0) redirect('/sin-acceso?modulo=despachos');

  return sesion;
}

/**
 * Devuelve lo que la interfaz necesita saber de la sesión: quién es, a qué
 * módulos puede entrar y si puede compartir su ubicación.
 *
 * Se usa en el marco de navegación para mostrar u ocultar entradas del menú.
 * Es solo presentación: quien decide de verdad es `requerirPermiso()` en cada
 * página y en cada acción.
 */
export async function permisosDeSesion(): Promise<{
  sesion: Sesion | null;
  modulos: Modulo[];
  puedeCompartir: boolean;
  puedeMiRuta: boolean;
}> {
  const sesion = await sesionActual();
  if (!sesion) {
    return { sesion: null, modulos: [], puedeCompartir: false, puedeMiRuta: false };
  }

  const { modulosVisibles, puedeCompartirUbicacion, puedeVerMiRuta } = await import('./permisos');
  return {
    sesion,
    modulos: modulosVisibles(sesion.rol),
    puedeCompartir: puedeCompartirUbicacion(sesion),
    puedeMiRuta: puedeVerMiRuta(sesion),
  };
}
