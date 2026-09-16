/**
 * Prueba del arranque en frío: la pantalla que crea el primer administrador.
 *
 *   Se ejecuta con el servidor arrancado sobre una base **sin ninguna cuenta**:
 *
 *     npm run build
 *     $env:SIN_CUENTAS_DEMO='1'; node scripts/seed.ts
 *     $env:SIN_CUENTAS_DEMO='1'; npm start
 *     npm run verificar-arranque
 *
 * El circuito completo es el que va a usar quien despliegue en Railway:
 *
 *   1. Sin cuentas, la pantalla de acceso desvía a la configuración inicial.
 *   2. Se crea el administrador desde el navegador y entra directamente.
 *   3. A partir de ahí la configuración inicial se cierra para siempre.
 *   4. Las cuentas de ejemplo no existen: no hay ninguna contraseña conocida.
 *
 * **Deja la base modificada**: crea un administrador. Después hay que regenerar
 * con `npm run seed` para volver al estado de demostración.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

import { CLAVE_DEMO } from '../src/lib/auth/demo.ts';

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

function formularioCon(html: string, incluir: string): { accion: string; campos: Record<string, string> } | null {
  const bloques = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];

  for (const bloque of bloques) {
    const campos: Record<string, string> = {};
    for (const etiqueta of bloque.matchAll(/<input\b[^>]*>/g)) {
      const nombre = etiqueta[0].match(/name="([^"]+)"/)?.[1];
      if (nombre) campos[nombre] = etiqueta[0].match(/value="([^"]*)"/)?.[1] ?? '';
    }

    const accion = bloque.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1];
    if (accion && Object.hasOwn(campos, incluir)) return { accion, campos };
  }

  return null;
}

async function principal(): Promise<void> {
  console.log(`\n  Verificando el arranque en frío en ${BASE}\n`);

  // ── 1. Sin cuentas, la puerta abierta es la configuración inicial ──
  const entrar = await fetch(`${BASE}/entrar`, { redirect: 'manual' });
  const destinoEntrar = entrar.headers.get('location') ?? '';
  comprobar(
    entrar.status === 307 && destinoEntrar.includes('/configuracion-inicial'),
    'Sin cuentas, la pantalla de acceso lleva a la configuración inicial',
    `HTTP ${entrar.status} → ${destinoEntrar}`,
  );

  const pagina = await fetch(`${BASE}/configuracion-inicial`);
  const html = await pagina.text();
  comprobar(pagina.status === 200, 'La configuración inicial se abre');

  const formulario = formularioCon(html, 'nombre');
  comprobar(formulario !== null, 'Ofrece el formulario del primer administrador');

  if (!formulario) {
    console.log(`\n  ${correctas} correctas, ${fallos.length} con fallo\n`);
    process.exit(1);
  }

  // ── 2. Se crea el administrador y entra directamente ──
  const correo = `jefe.${Date.now()}@limaexpress.pe`;
  const clave = 'MiClaveDeJefe123';

  const datos = new FormData();
  datos.set(formulario.accion, '');
  for (const [nombre, valor] of Object.entries(formulario.campos)) {
    if (!nombre.startsWith('$ACTION_ID_')) datos.set(nombre, valor);
  }
  datos.set('nombre', 'Jefe de Prueba');
  datos.set('email', correo);
  datos.set('clave', clave);

  const creado = await fetch(`${BASE}/configuracion-inicial`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE },
    redirect: 'manual',
  });

  const cookie = (creado.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  comprobar(cookie !== '', 'Al crear la cuenta se entra directamente, sin pasar por el acceso');
  comprobar(
    (creado.headers.get('location') ?? '').endsWith('/'),
    'El primer administrador aterriza en el tablero',
    creado.headers.get('location') ?? '(sin destino)',
  );

  // ── 3. Es administrador de verdad ──
  const usuarios = await fetch(`${BASE}/usuarios`, { headers: { Cookie: cookie } });
  comprobar(
    usuarios.status === 200,
    'La cuenta creada tiene acceso de administración',
    `HTTP ${usuarios.status}`,
  );

  // ── 4. La puerta se cierra ──
  const segunda = await fetch(`${BASE}/configuracion-inicial`, { redirect: 'manual' });
  const destinoSegunda = segunda.headers.get('location') ?? '';
  comprobar(
    segunda.status === 307 && destinoSegunda.includes('/entrar'),
    'En cuanto hay una cuenta, la configuración inicial se cierra',
    `HTTP ${segunda.status} → ${destinoSegunda}`,
  );

  // Y no se puede usar para colar un segundo administrador. Se intenta con otro
  // correo y después se prueba a entrar con él: si el acceso funciona, la puerta
  // no estaba cerrada de verdad. Comprobar solo el código de la respuesta no
  // bastaría —una acción de servidor redirige tanto si rechaza como si acepta—,
  // así que la prueba mira el efecto, no el mensaje.
  const correoColado = `colado.${Date.now()}@limaexpress.pe`;

  const datosColado = new FormData();
  datosColado.set(formulario.accion, '');
  for (const [nombre, valor] of Object.entries(formulario.campos)) {
    if (!nombre.startsWith('$ACTION_ID_')) datosColado.set(nombre, valor);
  }
  datosColado.set('nombre', 'Administrador Colado');
  datosColado.set('email', correoColado);
  datosColado.set('clave', 'OtraClaveLarga123');

  await fetch(`${BASE}/configuracion-inicial`, {
    method: 'POST',
    body: datosColado,
    headers: { Origin: BASE },
    redirect: 'manual',
  });

  const accesoColado = await (await fetch(`${BASE}/entrar`)).text();
  const formularioAcceso = formularioCon(accesoColado, 'email');

  if (formularioAcceso) {
    const intento = new FormData();
    intento.set(formularioAcceso.accion, '');
    intento.set('email', correoColado);
    intento.set('clave', 'OtraClaveLarga123');
    intento.set('volver', '/');

    const respuesta = await fetch(`${BASE}/entrar`, {
      method: 'POST',
      body: intento,
      headers: { Origin: BASE },
      redirect: 'manual',
    });

    comprobar(
      (respuesta.headers.get('location') ?? '').includes('error=credenciales'),
      'No se puede volver a usar la configuración inicial para crear otra cuenta',
      respuesta.headers.get('location') ?? `HTTP ${respuesta.status}`,
    );
  }

  // ── 5. Ninguna contraseña conocida ──
  const demo = await fetch(`${BASE}/entrar`, { redirect: 'manual' });
  comprobar(demo.status === 200, 'La pantalla de acceso vuelve a estar disponible');

  const inicio = await (await fetch(`${BASE}/entrar`)).text();
  const botonesDemo = [...inicio.matchAll(/name="email"\s+value="([^"]+)"/g)].map((m) => m[1]);
  comprobar(
    botonesDemo.length === 0,
    'No se ofrecen accesos de demostración',
    botonesDemo.join(', ') || 'ninguno',
  );

  const comoDemo = formularioCon(inicio, 'email');
  if (comoDemo) {
    const intento = new FormData();
    intento.set(comoDemo.accion, '');
    intento.set('email', 'admin@limaexpress.pe');
    intento.set('clave', CLAVE_DEMO);
    intento.set('volver', '/');
    const rechazado = await fetch(`${BASE}/entrar`, {
      method: 'POST',
      body: intento,
      headers: { Origin: BASE },
      redirect: 'manual',
    });
    comprobar(
      (rechazado.headers.get('location') ?? '').includes('error=credenciales'),
      'La cuenta de ejemplo del README no existe en esta instalación',
      rechazado.headers.get('location') ?? `HTTP ${rechazado.status}`,
    );
  }

  console.log(`\n  ${correctas} comprobaciones correctas, ${fallos.length} con fallo`);
  console.log('  Esta prueba crea un administrador: ejecuta `npm run seed` para volver al estado de demostración.\n');

  if (fallos.length > 0) {
    console.log('  Detalle:');
    for (const f of fallos) console.log(`   · ${f}`);
    console.log('');
    process.exit(1);
  }
}

await principal();

export {};
