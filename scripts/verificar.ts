/**
 * Comprueba que la aplicación responde correctamente.
 *
 *   npm run dev          (o `npm start`) en otra terminal
 *   npm run verificar
 *
 * Tiene dos modos:
 *
 *  1. **Sin sesión** (por defecto). Comprueba que las páginas públicas
 *     responden y que **todas las internas exigen identificarse**. Es una
 *     verificación de seguridad: si alguna interna respondiera sin sesión,
 *     fallaría aquí.
 *
 *  2. **Con sesión**. Si se pasa una cookie en `COOKIE_SESION`, además recorre
 *     las páginas internas y comprueba su contenido.
 *
 *     COOKIE_SESION=<valor> npm run verificar
 *
 *     El valor se copia del navegador: abre la aplicación, entra, y en las
 *     herramientas de desarrollo → Application → Cookies busca
 *     `transporte_sesion`.
 *
 * El puerto se toma de `PORT` (por defecto 3100).
 */

const PUERTO = process.env.PORT ?? '3100';
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${PUERTO}`;
const COOKIE = process.env.COOKIE_SESION ?? '';

interface Caso {
  ruta: string;
  /** Texto que debe aparecer. Si se omite, solo se comprueba el estado. */
  debeContener?: string;
  binario?: boolean;
  descripcion: string;
}

/** Rutas que deben funcionar sin identificarse. */
const PUBLICAS: Caso[] = [
  { ruta: '/rastrear', debeContener: 'Rastrear un envío', descripcion: 'Rastreo público' },
  { ruta: '/offline', debeContener: 'Sin conexión', descripcion: 'Página sin conexión' },
  { ruta: '/api/salud', debeContener: '"estado":"ok"', descripcion: 'Punto de salud' },
  { ruta: '/manifest.webmanifest', debeContener: '"display":"standalone"', descripcion: 'Manifiesto PWA' },
  { ruta: '/sw.js', debeContener: 'addEventListener', descripcion: 'Service worker' },
  { ruta: '/iconos/icono-192.png', binario: true, descripcion: 'Icono 192' },
  { ruta: '/iconos/icono-512.png', binario: true, descripcion: 'Icono 512' },
  { ruta: '/iconos/icono-maskable-512.png', binario: true, descripcion: 'Icono maskable' },
  { ruta: '/iconos/apple-touch-icon.png', binario: true, descripcion: 'Icono iOS' },
];

/** Rutas que exigen tener sesión. */
const INTERNAS: Caso[] = [
  { ruta: '/', debeContener: 'Tablero de operación', descripcion: 'Tablero' },
  { ruta: '/despachos', debeContener: 'Despachos', descripcion: 'Despachos' },
  { ruta: '/despachos/nuevo', debeContener: 'Nuevo despacho', descripcion: 'Crear despacho' },
  { ruta: '/rastreo', debeContener: 'Rastreo', descripcion: 'Rastreo en vivo' },
  { ruta: '/flota', debeContener: 'Flota', descripcion: 'Flota' },
  { ruta: '/conductores', debeContener: 'Conductores', descripcion: 'Conductores' },
  { ruta: '/finanzas', debeContener: 'rentabilidad', descripcion: 'Costos y rentabilidad' },
  { ruta: '/facturacion', debeContener: 'Facturación', descripcion: 'Facturación' },
  { ruta: '/liquidaciones', debeContener: 'Liquidaciones', descripcion: 'Liquidaciones' },
];

const SENALES_ERROR = [
  'Application error',
  'Internal Server Error',
  '__next_error__',
  'Unhandled Runtime Error',
  '[object Promise]',
];

let correctas = 0;
const fallos: string[] = [];

function anotar(ok: boolean, ruta: string, detalle: string) {
  if (ok) {
    correctas++;
    console.log(`  OK    ${ruta.padEnd(30)} ${detalle}`);
  } else {
    fallos.push(`${ruta} → ${detalle}`);
    console.log(`  FALLA ${ruta.padEnd(30)} ${detalle}`);
  }
}

async function textoDe(respuesta: Response): Promise<string> {
  try {
    return await respuesta.text();
  } catch {
    return '';
  }
}

async function revisarContenido(caso: Caso) {
  const respuesta = await fetch(`${BASE}${caso.ruta}`, {
    redirect: 'follow',
    headers: COOKIE ? { Cookie: `transporte_sesion=${COOKIE}` } : {},
  });

  const problemas: string[] = [];
  if (!respuesta.ok) problemas.push(`HTTP ${respuesta.status}`);

  if (!caso.binario) {
    const texto = await textoDe(respuesta);
    for (const senal of SENALES_ERROR) {
      if (texto.includes(senal)) problemas.push(`contiene «${senal}»`);
    }
    if (caso.debeContener && !texto.includes(caso.debeContener)) {
      problemas.push(`no contiene «${caso.debeContener}»`);
    }
  } else if (respuesta.headers.get('content-type')?.includes('text/html')) {
    problemas.push('devolvió HTML en vez de una imagen');
  }

  anotar(
    problemas.length === 0,
    caso.ruta,
    problemas.length === 0 ? caso.descripcion : problemas.join(', '),
  );
}

/**
 * Comprueba que una ruta interna rechaza a quien no se ha identificado.
 * Se pide la redirección sin seguirla para poder inspeccionar el destino.
 */
async function revisarProtegida(caso: Caso) {
  try {
    const respuesta = await fetch(`${BASE}${caso.ruta}`, { redirect: 'manual' });

    // Next responde con una redirección cuando la página llama a `redirect()`.
    const esRedireccion = respuesta.status >= 300 && respuesta.status < 400;
    const destino = respuesta.headers.get('location') ?? '';

    if (!esRedireccion) {
      anotar(false, caso.ruta, `responde HTTP ${respuesta.status} SIN sesión — debería exigir acceso`);
      return;
    }
    if (!destino.includes('/entrar')) {
      anotar(false, caso.ruta, `redirige a ${destino} en vez de a /entrar`);
      return;
    }
    anotar(true, caso.ruta, 'exige identificarse');
  } catch (error) {
    anotar(false, caso.ruta, error instanceof Error ? error.message : String(error));
  }
}

/**
 * La pantalla de acceso se comporta distinto según haya sesión o no: sin ella
 * muestra el formulario y con ella lleva al inicio. Comprobarlo igual en los dos
 * casos daría un falso fallo.
 */
async function revisarEntrar() {
  if (!COOKIE) {
    await revisarContenido({
      ruta: '/entrar',
      debeContener: 'Entrar',
      descripcion: 'Pantalla de acceso',
    });
    return;
  }

  const respuesta = await fetch(`${BASE}/entrar`, { redirect: 'manual' });
  const esRedireccion = respuesta.status >= 300 && respuesta.status < 400;
  const destino = respuesta.headers.get('location') ?? '';

  anotar(
    esRedireccion && /\/$/.test(destino),
    '/entrar',
    esRedireccion
      ? 'con la sesión abierta lleva al inicio'
      : `HTTP ${respuesta.status}: debería llevar al inicio en vez de pedir credenciales`,
  );
}

async function principal() {
  console.log(`\n  Verificando ${BASE}`);
  console.log(
    COOKIE
      ? '  Modo: con sesión (se recorren también las páginas internas)\n'
      : '  Modo: sin sesión (se comprueba que las internas exijan acceso)\n',
  );

  console.log('  ── Rutas públicas ──');
  try {
    await revisarEntrar();
  } catch (error) {
    anotar(false, '/entrar', error instanceof Error ? error.message : String(error));
  }
  for (const caso of PUBLICAS) {
    try {
      await revisarContenido(caso);
    } catch (error) {
      anotar(false, caso.ruta, error instanceof Error ? error.message : String(error));
    }
  }

  console.log('');
  if (COOKIE) {
    console.log('  ── Rutas internas (con la sesión indicada) ──');
    for (const caso of INTERNAS) {
      try {
        await revisarContenido(caso);
      } catch (error) {
        anotar(false, caso.ruta, error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    console.log('  ── Protección de las rutas internas ──');
    for (const caso of INTERNAS) {
      await revisarProtegida(caso);
    }
    console.log(
      '\n  Para comprobar además el contenido de las internas, pasa una cookie:\n' +
        '    COOKIE_SESION=<valor> npm run verificar',
    );
  }

  console.log(`\n  ${correctas} correctas, ${fallos.length} con fallo\n`);

  if (fallos.length > 0) {
    console.log('  Detalle:');
    for (const f of fallos) console.log(`   · ${f}`);
    console.log('');
    process.exit(1);
  }
}

await principal();

// Marca el archivo como módulo, requisito para poder usar `await` en el nivel
// superior de un archivo de Node.
export {};
