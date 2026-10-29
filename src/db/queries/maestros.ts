/**
 * Consultas que comparten la edición y la baja de unidades y conductores.
 */
import { all, get } from '@/db/client';
import type { Unidad } from '@/db/tipos';

export interface RutasAbiertas {
  /** Códigos de las rutas en la calle ahora mismo: impiden la baja. */
  enCurso: string[];
  /** Códigos de las rutas planificadas que lo tienen asignado: hay que reasignarlas. */
  planificadas: string[];
}

/**
 * Hojas de ruta abiertas de una unidad o de un conductor.
 *
 * Una ruta `en_curso` bloquea la baja: la unidad está en la calle con paquetes
 * dentro y el conductor tiene paradas por resolver; darlos de baja dejaría esa
 * ruta con un recurso que oficialmente ya no existe. Las planificadas no la
 * bloquean, pero la pantalla las enumera para que alguien las reasigne.
 */
export async function rutasAbiertasDe(
  recurso: 'unidad' | 'conductor',
  id: number,
): Promise<RutasAbiertas> {
  // La columna sale de una lista cerrada, nunca del formulario.
  const columna = recurso === 'unidad' ? 'unidad_id' : 'conductor_id';
  const filas = await all<{ codigo: string; estado: string }>(
    `SELECT codigo, estado FROM rutas
     WHERE ${columna} = $1 AND estado IN ('en_curso','planificado')
     ORDER BY fecha, codigo`,
    id,
  );
  return {
    enCurso: filas.filter((f) => f.estado === 'en_curso').map((f) => f.codigo),
    planificadas: filas.filter((f) => f.estado === 'planificado').map((f) => f.codigo),
  };
}

/** Ficha de una unidad para editarla. */
export async function obtenerUnidad(id: number): Promise<Unidad | null> {
  return get<Unidad>('SELECT * FROM unidades WHERE id = $1', id);
}

/**
 * Conductores para el desplegable «conductor habitual» de una unidad: los que se
 * pueden asignar y, al editar, también el que ya tiene aunque esté de baja. Sin
 * él, el desplegable mostraría «Sin conductor fijo» y guardar la ficha le
 * quitaría el conductor sin que nadie lo hubiera pedido.
 */
export async function conductoresParaUnidad(
  conductorActualId: number | null = null,
): Promise<{ id: number; nombre: string }[]> {
  return all<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM conductores
     WHERE estado = 'activo' OR id = $1
     ORDER BY nombre`,
    conductorActualId ?? 0,
  );
}

/**
 * ¿Tiene el conductor una cuenta activa para entrar a «Mi ruta»? La baja de la
 * ficha no la cierra —son dos cosas distintas—, así que la pantalla lo avisa.
 */
export async function tieneCuentaActiva(conductorId: number): Promise<boolean> {
  const fila = await get<{ id: number }>(
    'SELECT id FROM usuarios WHERE conductor_id = $1 AND activo = 1 LIMIT 1',
    conductorId,
  );
  return fila !== null;
}
