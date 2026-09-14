/**
 * Gestión de usuarios desde la terminal.
 *
 *   npm run usuario -- listar
 *   npm run usuario -- crear <correo> "<Nombre>" <rol> [contraseña]
 *   npm run usuario -- clave <correo> [contraseña]
 *   npm run usuario -- desactivar <correo>
 *   npm run usuario -- activar <correo>
 *
 * Roles: administracion | despachador | conductor | gerencia
 *
 * Si se omite la contraseña se genera una aleatoria y se muestra una sola vez.
 * Es lo recomendable: una contraseña escrita en la línea de comandos queda
 * registrada en el historial del shell y a la vista de cualquiera.
 */
import { randomBytes } from 'node:crypto';
import { all, cerrarMotor, escalar, get, run } from '../src/db/client.ts';
import { descripcionMotor } from '../src/db/client.ts';
import { generarSal, hashClave } from '../src/lib/auth/claves.ts';
import { ROLES, etiquetaRol, esRolValido, type Rol } from '../src/lib/auth/permisos.ts';

const [, , comando, ...args] = process.argv;

const AYUDA = `
  Gestión de usuarios

    npm run usuario -- listar
    npm run usuario -- crear <correo> "<Nombre>" <rol> [contraseña]
    npm run usuario -- clave <correo> [contraseña]
    npm run usuario -- desactivar <correo>
    npm run usuario -- activar <correo>

  Roles disponibles: ${ROLES.join(' | ')}

  Si omites la contraseña se genera una segura y se muestra una sola vez.
`;

function claveAleatoria(): string {
  // 18 bytes en base64url dan 24 caracteres legibles y ~144 bits de entropía.
  return randomBytes(18).toString('base64url');
}

async function crear(correo: string, nombre: string, rol: string, clave?: string) {
  if (!correo || !nombre || !rol) {
    console.error('Faltan argumentos. Uso: crear <correo> "<Nombre>" <rol> [contraseña]');
    process.exitCode = 1;
    return;
  }
  if (!esRolValido(rol)) {
    console.error(`Rol no válido: «${rol}». Debe ser uno de: ${ROLES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const existente = await escalar<number>(
    'SELECT COUNT(*) AS n FROM usuarios WHERE LOWER(email) = LOWER($1)',
    correo,
  );
  if (Number(existente) > 0) {
    console.error(`Ya existe un usuario con el correo ${correo}.`);
    process.exitCode = 1;
    return;
  }

  const claveFinal = clave && clave.length >= 8 ? clave : claveAleatoria();
  if (clave && clave.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres. Se genera una aleatoria.');
  }

  const sal = generarSal();
  const hash = await hashClave(claveFinal, sal);

  await run(
    `INSERT INTO usuarios (email, nombre, hash_clave, sal_clave, rol)
     VALUES ($1, $2, $3, $4, $5)`,
    correo.trim(),
    nombre.trim(),
    hash,
    sal,
    rol as Rol,
  );

  console.log(`\n  Usuario creado:`);
  console.log(`    Correo:  ${correo.trim()}`);
  console.log(`    Nombre:  ${nombre.trim()}`);
  console.log(`    Rol:     ${etiquetaRol(rol as Rol)}`);
  console.log(`\n    Contraseña: ${claveFinal}`);
  console.log(`\n  Guárdala ahora: no se vuelve a mostrar.\n`);
}

async function cambiarClave(correo: string, clave?: string) {
  const usuario = await get<{ id: number; nombre: string }>(
    'SELECT id, nombre FROM usuarios WHERE LOWER(email) = LOWER($1)',
    correo ?? '',
  );
  if (!usuario) {
    console.error(`No existe ningún usuario con el correo ${correo}.`);
    process.exitCode = 1;
    return;
  }

  const claveFinal = clave && clave.length >= 8 ? clave : claveAleatoria();
  const sal = generarSal();
  const hash = await hashClave(claveFinal, sal);

  await run('UPDATE usuarios SET hash_clave = $1, sal_clave = $2 WHERE id = $3', hash, sal, usuario.id);
  // Al cambiar la contraseña se cierran todas las sesiones abiertas: si alguien
  // había entrado con la anterior, deja de poder hacerlo.
  const cerradas = await run('DELETE FROM sesiones WHERE usuario_id = $1', usuario.id);

  console.log(`\n  Contraseña actualizada para ${usuario.nombre} (${correo}).`);
  console.log(`    Nueva contraseña: ${claveFinal}`);
  console.log(`    Sesiones cerradas: ${cerradas.changes}\n`);
}

async function cambiarEstado(correo: string, activo: boolean) {
  const usuario = await get<{ id: number; nombre: string }>(
    'SELECT id, nombre FROM usuarios WHERE LOWER(email) = LOWER($1)',
    correo ?? '',
  );
  if (!usuario) {
    console.error(`No existe ningún usuario con el correo ${correo}.`);
    process.exitCode = 1;
    return;
  }

  await run('UPDATE usuarios SET activo = $1 WHERE id = $2', activo ? 1 : 0, usuario.id);

  if (!activo) {
    // Desactivar sin cerrar las sesiones dejaría la cuenta operativa hasta que
    // caducara la cookie.
    const cerradas = await run('DELETE FROM sesiones WHERE usuario_id = $1', usuario.id);
    console.log(`\n  ${usuario.nombre} desactivado. Sesiones cerradas: ${cerradas.changes}\n`);
  } else {
    console.log(`\n  ${usuario.nombre} activado.\n`);
  }
}

async function listar() {
  const usuarios = await all<{
    email: string;
    nombre: string;
    rol: Rol;
    activo: number;
    ultimo_acceso: string | null;
    sesiones: number;
  }>(
    `SELECT u.email, u.nombre, u.rol, u.activo, u.ultimo_acceso,
            (SELECT COUNT(*) FROM sesiones s WHERE s.usuario_id = u.id) AS sesiones
     FROM usuarios u
     ORDER BY u.rol, u.nombre`,
  );

  if (usuarios.length === 0) {
    console.log('\n  No hay usuarios todavía. Créalos con «npm run usuario -- crear».\n');
    return;
  }

  const columnas = ['correo', 'nombre', 'rol', 'activo', 'sesiones', 'último acceso'];
  const filas = usuarios.map((u) => [
    u.email,
    u.nombre,
    etiquetaRol(u.rol),
    u.activo ? 'sí' : 'no',
    String(u.sesiones),
    u.ultimo_acceso ?? '—',
  ]);

  const anchos = columnas.map((c, i) =>
    Math.max(c.length, ...filas.map((f) => String(f[i]).length)),
  );
  const linea = (vals: string[]) => vals.map((v, i) => v.padEnd(anchos[i])).join('  ');

  console.log('');
  console.log(linea(columnas));
  console.log(anchos.map((a) => '─'.repeat(a)).join('──'));
  for (const fila of filas) console.log(linea(fila));
  console.log(`\n  ${usuarios.length} usuario(s). Motor: ${descripcionMotor()}\n`);
}

async function principal() {
  if (!comando || comando === 'ayuda' || comando === '--help') {
    console.log(AYUDA);
    return;
  }

  switch (comando) {
    case 'listar':
      await listar();
      break;
    case 'crear':
      await crear(args[0], args[1], args[2], args[3]);
      break;
    case 'clave':
      await cambiarClave(args[0], args[1]);
      break;
    case 'desactivar':
      await cambiarEstado(args[0], false);
      break;
    case 'activar':
      await cambiarEstado(args[0], true);
      break;
    default:
      console.error(`Comando desconocido: ${comando}`);
      console.log(AYUDA);
      process.exitCode = 1;
  }
}

try {
  await principal();
} catch (error) {
  console.error(`\n  Error: ${(error as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await cerrarMotor();
}
