/**
 * Roles y permisos.
 *
 * Es lógica pura, sin acceso a datos ni a React, para poder razonarla y
 * probarla aparte. **Es el único sitio donde se decide quién puede qué**: si
 * aparece una comprobación de rol escrita a mano en una página o una acción,
 * está mal.
 *
 * Criterio de diseño:
 *  - `administracion` — acceso total; es quien gestiona usuarios y configuración.
 *  - `despachador` — el trabajo diario de reparto: rutas, paradas y entregas.
 *    Ve la flota y los conductores para poder asignarlos, pero no los toca ni ve
 *    las finanzas.
 *  - `conductor` — solo lo suyo: sus hojas de ruta y el mapa. Nada de importes
 *    ni de información de otros compañeros.
 *  - `gerencia` — ve todo para poder decidir, pero **no modifica nada**.
 *
 * El cliente final no aparece aquí a propósito: no tiene cuenta ni la necesita,
 * porque consulta su envío en la página pública `/rastrear`.
 */

export const ROLES = ['administracion', 'despachador', 'conductor', 'gerencia'] as const;
export type Rol = (typeof ROLES)[number];

export const MODULOS = [
  'tablero',
  'pedidos',
  'despachos',
  'rastreo',
  'flota',
  'conductores',
  'finanzas',
  'facturacion',
  'liquidaciones',
  'usuarios',
] as const;
export type Modulo = (typeof MODULOS)[number];

/**
 * Acciones posibles sobre un módulo.
 *
 * `entregar` está separada de `editar` a propósito. «Editar despachos» es el
 * trabajo de oficina: crear la hoja de ruta, asignarle unidad y conductor,
 * reordenarla, cerrarla. «Entregar» es resolver una parada concreta en la calle.
 * El conductor necesita lo segundo y **no** lo primero, y meterlas en la misma
 * acción obligaría a darle el control completo del despacho solo para que pueda
 * marcar una entrega.
 */
export type Accion = 'ver' | 'editar' | 'entregar';

const TODO: Accion[] = ['ver', 'editar'];
const SOLO_VER: Accion[] = ['ver'];
/** Lo que hace la oficina de reparto: además de editar, puede entregar por otro. */
const DESPACHO_COMPLETO: Accion[] = ['ver', 'editar', 'entregar'];
/** Lo que hace quien va en la calle: ver su ruta y resolver sus paradas. */
const REPARTO: Accion[] = ['ver', 'entregar'];
const NADA: Accion[] = [];

/** Matriz de permisos: rol → módulo → acciones permitidas. */
export const PERMISOS: Record<Rol, Record<Modulo, Accion[]>> = {
  administracion: {
    tablero: TODO,
    pedidos: TODO,
    despachos: DESPACHO_COMPLETO,
    rastreo: TODO,
    flota: TODO,
    conductores: TODO,
    finanzas: TODO,
    facturacion: TODO,
    liquidaciones: TODO,
    // Gestionar cuentas es lo propio de administración: quien puede crear un
    // administrador puede hacerlo todo, así que no se delega.
    usuarios: TODO,
  },
  despachador: {
    tablero: SOLO_VER,
    pedidos: TODO,
    despachos: DESPACHO_COMPLETO,
    rastreo: TODO,
    flota: SOLO_VER,
    conductores: SOLO_VER,
    finanzas: NADA,
    facturacion: NADA,
    liquidaciones: NADA,
    usuarios: NADA,
  },
  conductor: {
    tablero: NADA,
    // Un conductor no entra aquí: la bandeja de pedidos tiene datos de clientes
    // —direcciones, teléfonos, importes a cobrar— de toda la operación, no solo
    // de su ruta. Ve lo suyo en «Mi ruta».
    pedidos: NADA,
    despachos: REPARTO,
    rastreo: SOLO_VER,
    flota: NADA,
    conductores: NADA,
    finanzas: NADA,
    facturacion: NADA,
    liquidaciones: NADA,
    usuarios: NADA,
  },
  gerencia: {
    tablero: SOLO_VER,
    pedidos: SOLO_VER,
    despachos: SOLO_VER,
    rastreo: SOLO_VER,
    flota: SOLO_VER,
    conductores: SOLO_VER,
    finanzas: SOLO_VER,
    facturacion: SOLO_VER,
    liquidaciones: SOLO_VER,
    usuarios: NADA,
  },
};

const ETIQUETAS_ROL: Record<Rol, string> = {
  administracion: 'Administración',
  despachador: 'Despacho',
  conductor: 'Conductor',
  gerencia: 'Gerencia',
};

const DESCRIPCION_ROL: Record<Rol, string> = {
  administracion: 'Acceso completo, incluida la gestión de usuarios',
  despachador: 'Rutas, entregas, flota y conductores',
  conductor: 'Solo sus hojas de ruta y el mapa',
  gerencia: 'Consulta de todos los módulos, sin editar',
};

export function etiquetaRol(rol: Rol): string {
  return ETIQUETAS_ROL[rol] ?? rol;
}

export function descripcionRol(rol: Rol): string {
  return DESCRIPCION_ROL[rol] ?? '';
}

/** ¿Puede este rol realizar esta acción sobre este módulo? */
export function puede(rol: Rol, modulo: Modulo, accion: Accion = 'ver'): boolean {
  return PERMISOS[rol]?.[modulo]?.includes(accion) ?? false;
}

/** Módulos sobre los que el rol tiene al menos permiso de lectura. */
export function modulosVisibles(rol: Rol): Modulo[] {
  return MODULOS.filter((m) => puede(rol, m, 'ver'));
}

/**
 * ¿Puede este usuario ver la pantalla de reparto en el móvil («Mi ruta»)?
 *
 * Es la vista de campo: el conductor la usa para trabajar y quien despacha para
 * ponerse en su lugar. Gerencia queda fuera porque su perfil es de consulta.
 */
export function puedeVerMiRuta(sesion: { rol: Rol }): boolean {
  return puede(sesion.rol, 'despachos', 'entregar');
}

/**
 * Dónde debe aterrizar cada rol al iniciar sesión.
 *
 * Es importante que no sea siempre `/`: el tablero no lo ve todo el mundo, y
 * mandar a un conductor allí lo dejaría en la pantalla de «sin acceso» con un
 * botón «volver al inicio» que lo devolvería al mismo sitio, en un bucle.
 */
export function rutaInicio(rol: Rol): string {
  // El conductor abre la aplicación para trabajar, no para consultar informes:
  // su sitio es la ruta del día.
  if (rol === 'conductor') return '/mi-ruta';

  const orden: { modulo: Modulo; ruta: string }[] = [
    { modulo: 'tablero', ruta: '/' },
    { modulo: 'pedidos', ruta: '/pedidos' },
    { modulo: 'despachos', ruta: '/despachos' },
    { modulo: 'rastreo', ruta: '/rastreo' },
    { modulo: 'flota', ruta: '/flota' },
    { modulo: 'conductores', ruta: '/conductores' },
    { modulo: 'finanzas', ruta: '/finanzas' },
    { modulo: 'facturacion', ruta: '/facturacion' },
    { modulo: 'liquidaciones', ruta: '/liquidaciones' },
  ];

  return orden.find((o) => puede(rol, o.modulo, 'ver'))?.ruta ?? '/sin-acceso';
}

/** Validación de un rol recibido como texto (por ejemplo desde un formulario). */
export function esRolValido(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/**
 * ¿Puede este usuario reportar su propia ubicación desde su dispositivo?
 *
 * No encaja en la matriz por módulos porque **no es editar el rastreo**: es una
 * acción sobre uno mismo. Un conductor comparte la posición de su propio
 * vehículo; quien ya puede operar el rastreo también puede reportar desde su
 * teléfono, lo que además sirve para probar la integración sin ser conductor.
 *
 * Gerencia queda fuera: su perfil es de consulta.
 */
export function puedeCompartirUbicacion(sesion: {
  rol: Rol;
  conductorId: number | null;
}): boolean {
  if (sesion.rol === 'conductor') return sesion.conductorId !== null;
  return puede(sesion.rol, 'rastreo', 'editar');
}

/** Módulo al que pertenece cada ruta interna, para protegerla de una vez. */
export const MODULO_POR_RUTA: { prefijo: string; modulo: Modulo }[] = [
  { prefijo: '/pedidos', modulo: 'pedidos' },
  { prefijo: '/usuarios', modulo: 'usuarios' },
  { prefijo: '/despachos', modulo: 'despachos' },
  { prefijo: '/rastreo', modulo: 'rastreo' },
  { prefijo: '/flota', modulo: 'flota' },
  { prefijo: '/conductores', modulo: 'conductores' },
  { prefijo: '/finanzas', modulo: 'finanzas' },
  { prefijo: '/facturacion', modulo: 'facturacion' },
  { prefijo: '/liquidaciones', modulo: 'liquidaciones' },
  { prefijo: '/', modulo: 'tablero' },
];

export function moduloDeRuta(pathname: string): Modulo | null {
  // Se busca el prefijo más específico primero.
  const ordenadas = [...MODULO_POR_RUTA].sort((a, b) => b.prefijo.length - a.prefijo.length);
  for (const { prefijo, modulo } of ordenadas) {
    if (prefijo === '/') {
      if (pathname === '/') return modulo;
      continue;
    }
    if (pathname === prefijo || pathname.startsWith(`${prefijo}/`)) return modulo;
  }
  return null;
}
