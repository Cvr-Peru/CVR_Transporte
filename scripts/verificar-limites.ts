/**
 * Prueba de los frenos contra quien adivina: contraseñas en `/entrar` y guías en
 * la página pública `/rastrear`.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-limites
 *
 * Comprueba:
 *  1. Que las guías ya **no son correlativas**: todas tienen la parte aleatoria.
 *  2. Que tras 5 contraseñas equivocadas para un correo, el sexto intento se
 *     rechaza sin mirar la contraseña.
 *  3. Que entrar bien borra los fallos previos: un despiste no se arrastra.
 *  4. Que una misma IP no puede probar contraseñas indefinidamente cambiando de
 *     correo.
 *  5. Que una IP que prueba guías inexistentes queda frenada —también para las
 *     guías buenas— sin afectar a otra IP.
 *
 * Cada bloque usa su propia IP (en `X-Forwarded-For`) y correos que no existen,
 * para no bloquear las cuentas de demostración que usan las demás pruebas. Los
 * contadores caducan solos en 15 minutos; `npm run seed` los borra al momento.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

import { CLAVE_DEMO } from '../src/lib/auth/demo.ts';

const CLAVE = process.env.CLAVE_DEMO ?? CLAVE_DEMO;
const RONDA = Date.now().toString(36);

let correctas = 0;
const fallos: string[] = [];

function comprobar(condicion: boolean, descripcion: string, detalle = ''): void {
  if (condicion) {
    correctas++;
    console.log(`  OK    ${descripcion}`);
  } else {
    fallos.push(`${descripcion}${detalle ? ` — ${detalle}` : ''}`);
    console.log(`  FALLO ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
  }
}

/**
 * Una IP privada distinta por bloque y por ejecución: así una ejecución no
 * tropieza con los bloqueos que dejó la anterior.
 */
const RED = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
function ipDePrueba(bloque: number): string {
  return `${RED}.${bloque + 1}`;
}

// ─────────────────────────────────────────────────────────────
// Acceso
// ─────────────────────────────────────────────────────────────
let accionEntrar: string | null = null;

async function idAccionEntrar(): Promise<string> {
  if (accionEntrar) return accionEntrar;
  const html = await (await fetch(`${BASE}/entrar`)).text();
  accionEntrar = html.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1] ?? null;
  if (!accionEntrar) throw new Error('No se encontró el formulario de /entrar.');
  return accionEntrar;
}

/** Intenta entrar y devuelve a dónde redirige la aplicación. */
async function intentarEntrar(email: string, clave: string, ip: string): Promise<string> {
  const datos = new FormData();
  datos.set(await idAccionEntrar(), '');
  datos.set('email', email);
  datos.set('clave', clave);
  datos.set('volver', '/');

  const respuesta = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE, 'X-Forwarded-For': ip },
    redirect: 'manual',
  });
  return respuesta.headers.get('location') ?? `(HTTP ${respuesta.status})`;
}

async function sesionDe(email: string, ip: string): Promise<string | null> {
  const datos = new FormData();
  datos.set(await idAccionEntrar(), '');
  datos.set('email', email);
  datos.set('clave', CLAVE);
  datos.set('volver', '/');
  const respuesta = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE, 'X-Forwarded-For': ip },
    redirect: 'manual',
  });
  const cookie = (respuesta.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  return cookie || null;
}

async function rastrear(guia: string, ip: string): Promise<string> {
  const respuesta = await fetch(`${BASE}/rastrear?guia=${encodeURIComponent(guia)}`, {
    headers: { 'X-Forwarded-For': ip },
  });
  return respuesta.text();
}

// ─────────────────────────────────────────────────────────────
// Prueba
// ─────────────────────────────────────────────────────────────
async function principal() {
  console.log(`\n  Verificando los límites de intentos en ${BASE}\n`);

  // ── 1. Las guías no son correlativas ───────────────────────
  const cookieAdmin = await sesionDe('admin@limaexpress.pe', ipDePrueba(0));
  if (!cookieAdmin) {
    console.log('  No se pudo entrar como administración. ¿Está la base sembrada?\n');
    process.exit(1);
  }
  const buzon = await (await fetch(`${BASE}/pedidos`, { headers: { Cookie: cookieAdmin } })).text();
  const guias = [...new Set(buzon.match(/TR-\d{8}-[0-9A-Z]+/g) ?? [])];
  comprobar(guias.length > 0, 'El buzón muestra guías con las que probar', `${guias.length} guías`);
  comprobar(
    guias.every((g) => /^TR-\d{8}-[2-9A-HJKMNP-Z]{6}$/.test(g)),
    'Todas las guías llevan seis caracteres aleatorios, no un correlativo',
    guias.filter((g) => !/^TR-\d{8}-[2-9A-HJKMNP-Z]{6}$/.test(g)).slice(0, 3).join(', '),
  );
  const guiaBuena = guias[0] ?? null;

  // ── 2. Cinco fallos bloquean el correo ─────────────────────
  const ipA = ipDePrueba(1);
  const correo = `nadie-${RONDA}@ejemplo.pe`;
  const respuestas: string[] = [];
  for (let i = 0; i < 5; i++) respuestas.push(await intentarEntrar(correo, `mala-${i}`, ipA));
  comprobar(
    respuestas.every((r) => r.includes('error=credenciales')),
    'Los cinco primeros fallos dicen «credenciales incorrectas»',
    respuestas.join(' | '),
  );
  const sexto = await intentarEntrar(correo, 'mala-5', ipA);
  comprobar(sexto.includes('error=bloqueo'), 'El sexto intento queda bloqueado', sexto);
  const desdeOtraIp = await intentarEntrar(correo, 'mala-6', ipDePrueba(2));
  comprobar(
    desdeOtraIp.includes('error=bloqueo'),
    'El bloqueo del correo se mantiene aunque se cambie de IP',
    desdeOtraIp,
  );

  const pantalla = await (await fetch(`${BASE}${sexto}`)).text();
  comprobar(
    /Demasiados intentos fallidos/.test(pantalla),
    'La pantalla de acceso explica el bloqueo y cuánto esperar',
  );

  // ── 3. Entrar bien borra los despistes ─────────────────────
  // Cuatro fallos, una entrada correcta y otros cuatro fallos: si la entrada no
  // borrara el contador, serían ocho y el correo estaría bloqueado.
  const ipB = ipDePrueba(3);
  const gerencia = 'gerencia@limaexpress.pe';
  for (let i = 0; i < 4; i++) await intentarEntrar(gerencia, `despiste-${i}`, ipB);
  const buena = await intentarEntrar(gerencia, CLAVE, ipB);
  comprobar(!buena.includes('error='), 'Con cuatro fallos todavía se entra con la contraseña buena', buena);
  for (let i = 0; i < 4; i++) await intentarEntrar(gerencia, `despiste-b${i}`, ipB);
  const otraVez = await intentarEntrar(gerencia, CLAVE, ipB);
  comprobar(
    !otraVez.includes('error='),
    'Entrar bien pone el contador a cero',
    otraVez,
  );

  // ── 4. Una IP no prueba sin fin cambiando de correo ────────
  const ipC = ipDePrueba(4);
  for (let i = 0; i < 30; i++) await intentarEntrar(`barrido-${RONDA}-${i}@ejemplo.pe`, 'x', ipC);
  const trasBarrido = await intentarEntrar(`barrido-${RONDA}-nuevo@ejemplo.pe`, 'x', ipC);
  comprobar(
    trasBarrido.includes('error=bloqueo'),
    'Tras 30 fallos desde una IP, un correo nuevo también queda bloqueado',
    trasBarrido,
  );

  // ── 5. Rastrear guías inexistentes ─────────────────────────
  const ipD = ipDePrueba(5);
  if (guiaBuena) {
    const primera = await rastrear(guiaBuena, ipD);
    comprobar(
      primera.includes(`>${guiaBuena}<`) && !/No encontramos esa guía/.test(primera),
      'Una guía buena se encuentra en /rastrear',
    );
  }

  let ultima = '';
  for (let i = 0; i < 20; i++) ultima = await rastrear(`TR-20261024-ZZZZ${String(i).padStart(2, '0')}`, ipD);
  comprobar(/No encontramos esa guía/.test(ultima), 'Las guías inexistentes dicen «no encontrada»');

  const bloqueada = await rastrear('TR-20261024-ZZZZZZ', ipD);
  comprobar(
    /Demasiadas consultas sin resultado/.test(bloqueada),
    'Tras 20 guías inexistentes, la IP queda frenada',
  );

  if (guiaBuena) {
    const buenaBloqueada = await rastrear(guiaBuena, ipD);
    comprobar(
      /Demasiadas consultas sin resultado/.test(buenaBloqueada) && !buenaBloqueada.includes(`>${guiaBuena}<`),
      'Durante el bloqueo tampoco se muestran las guías buenas',
    );

    const otraIp = await rastrear(guiaBuena, ipDePrueba(6));
    comprobar(
      !/Demasiadas consultas/.test(otraIp) && !/No encontramos esa guía/.test(otraIp),
      'Desde otra IP la misma guía se sigue consultando',
    );
  }

  console.log(`\n  ${correctas} comprobaciones correctas, ${fallos.length} con fallo\n`);
  if (fallos.length) process.exit(1);
}

await principal();
