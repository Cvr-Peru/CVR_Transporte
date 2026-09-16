/**
 * Consultas de gestión de usuarios.
 *
 * Solo las usa la pantalla de administración. El resto de la aplicación resuelve
 * la sesión con `sesionActual()`.
 */
import { all, get } from '@/db/client';
import { aISOCompleto } from '@/lib/format';
import type { Rol } from '@/lib/auth/permisos';

export interface UsuarioResumen {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  activo: number;
  ultimo_acceso: string | null;
  conductor_id: number | null;
  /** Nombre de la ficha de conductor vinculada, si la hay. */
  conductor: string | null;
  /** Sesiones abiertas y sin caducar. */
  sesiones: number;
}

/**
 * Todas las cuentas con lo necesario para administrarlas.
 *
 * Las sesiones se cuentan solo si **no han caducado**: una fila antigua que ya
 * expiró no significa que nadie esté dentro, y mostrarla daría una falsa
 * sensación de que la cuenta está en uso.
 */
export async function listarUsuarios(): Promise<UsuarioResumen[]> {
  return all<UsuarioResumen>(
    `SELECT u.id, u.email, u.nombre, u.rol, u.activo, u.ultimo_acceso, u.conductor_id,
            c.nombre AS conductor,
            (SELECT COUNT(*) FROM sesiones s
              WHERE s.usuario_id = u.id AND s.expira >= $1) AS sesiones
     FROM usuarios u
     LEFT JOIN conductores c ON c.id = u.conductor_id
     ORDER BY u.rol, u.nombre`,
    aISOCompleto(new Date()),
  );
}

/**
 * ¿Hay alguna cuenta creada?
 *
 * Es la pregunta que decide si la aplicación está recién instalada. Mientras no
 * haya ninguna, la pantalla de configuración inicial está abierta; en cuanto
 * existe una, se cierra para siempre.
 */
export async function hayUsuarios(): Promise<boolean> {
  const fila = await get<{ n: number }>('SELECT COUNT(*) AS n FROM usuarios');
  return Number(fila?.n ?? 0) > 0;
}

export interface ResumenUsuarios {
  total: number;
  activos: number;
  administradores: number;
  conductoresSinVincular: number;
}

export async function resumenUsuarios(): Promise<ResumenUsuarios> {
  const fila = await get<{
    total: number;
    activos: number;
    administradores: number;
    sin_vincular: number;
  }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos,
            SUM(CASE WHEN rol = 'administracion' AND activo = 1 THEN 1 ELSE 0 END) AS administradores,
            SUM(CASE WHEN rol = 'conductor' AND conductor_id IS NULL THEN 1 ELSE 0 END) AS sin_vincular
     FROM usuarios`,
  );

  return {
    total: Number(fila?.total ?? 0),
    activos: Number(fila?.activos ?? 0),
    administradores: Number(fila?.administradores ?? 0),
    conductoresSinVincular: Number(fila?.sin_vincular ?? 0),
  };
}

/** Plantilla de conductores, para vincular una cuenta con su ficha. */
export async function conductoresParaVincular(): Promise<
  { id: number; nombre: string; codigo: string | null }[]
> {
  return all<{ id: number; nombre: string; codigo: string | null }>(
    'SELECT id, nombre, codigo FROM conductores ORDER BY nombre',
  );
}
