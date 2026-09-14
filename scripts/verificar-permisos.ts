/**
 * Comprueba que cada rol accede exactamente a lo que le corresponde.
 *
 *   npm run dev            (o `npm start`) en otra terminal
 *   npm run verificar-permisos
 *
 * Inicia sesión con las cuentas de demostración y recorre cada módulo
 * comprobando que responde 200 o que redirige a «sin acceso». Es la prueba de
 * que la matriz de `src/lib/auth/permisos.ts` se aplica de verdad y no se quedó
 * solo escrita.
 *
 * Da por hecho que existen las cuentas de demostración (`npm run seed`). La
 * contraseña se puede cambiar con `CLAVE_DEMO`.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

// Las cuentas se toman de `src/lib/auth/demo.ts`, el mismo sitio que usa el
// generador de datos. Así no pueden desincronizarse: si cambian los correos de
// demostración, cambian en los dos sitios a la vez.
import { CLAVE_DEMO, CUENTAS_DEMO } from '../src/lib/auth/demo.ts';
import type { Rol } from '../src/lib/auth/permisos.ts';

const CLAVE = process.env.CLAVE_DEMO ?? CLAVE_DEMO;

const CUENTAS: { rol: Rol; email: string }[] = CUENTAS_DEMO.map((c) => ({
  rol: c.rol,
  email: c.email,
}));

/** true = debe poder entrar; false = debe acabar en «sin acceso». */
const ESPERADO: Record<string, Record<Rol, boolean>> = {
  '/': { administracion: true, despachador: true, conductor: false, gerencia: true },
  // El buzón de pedidos tiene direcciones, teléfonos e importes de toda la
  // operación: el conductor no entra.
  '/pedidos': { administracion: true, despachador: true, conductor: false, gerencia: true },
  '/despachos': { administracion: true, despachador: true, conductor: true, gerencia: true },
  // La vista de campo: el conductor trabaja aquí y la oficina puede abrirla para
  // ponerse en su lugar. Gerencia es solo consulta, así que no la ve.
  '/mi-ruta': { administracion: true, despachador: true, conductor: true, gerencia: false },
  '/rastreo': { administracion: true, despachador: true, conductor: true, gerencia: true },
  '/flota': { administracion: true, despachador: true, conductor: false, gerencia: true },
  '/conductores': { administracion: true, despachador: true, conductor: false, gerencia: true },
  '/finanzas': { administracion: true, despachador: false, conductor: false, gerencia: true },
  '/facturacion': { administracion: true, despachador: false, conductor: false, gerencia: true },
  '/liquidaciones': { administracion: true, despachador: false, conductor: false, gerencia: true },
};

function cookiesDe(respuesta: Response): string[] {
  return (respuesta.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
}

interface SesionIniciada {
  cookie: string;
  /** A dónde lleva la aplicación después de entrar. */
  destino: string;
}

async function iniciarSesion(email: string): Promise<SesionIniciada | null> {
  const inicio = await fetch(`${BASE}/entrar`);
  const html = await inicio.text();

  const formularios = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
  const formulario = formularios.find((f) => /name="email"/.test(f));
  const accion = formulario?.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1];
  if (!accion) return null;

  const datos = new FormData();
  datos.set(accion, '');
  datos.set('email', email);
  datos.set('clave', CLAVE);
  datos.set('volver', '/');

  const acceso = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE },
    redirect: 'manual',
  });

  const cookies = cookiesDe(acceso);
  if (cookies.length === 0) return null;

  return {
    cookie: cookies.join('; '),
    // El formulario pide volver a `/`, pero la aplicación debe corregirlo si ese
    // rol no puede ver el tablero.
    destino: acceso.headers.get('location') ?? '',
  };
}

/**
 * Devuelve si la ruta se abrió, se rechazó por permisos, o algo inesperado.
 * Una ruta protegida responde con redirección a `/sin-acceso`.
 */
async function visitar(
  ruta: string,
  cookie: string,
): Promise<'abierta' | 'sin-acceso' | 'sin-sesion' | string> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });

  if (respuesta.status === 200) return 'abierta';

  if (respuesta.status >= 300 && respuesta.status < 400) {
    const destino = respuesta.headers.get('location') ?? '';
    if (destino.includes('/sin-acceso')) return 'sin-acceso';
    if (destino.includes('/entrar')) return 'sin-sesion';
    return `redirige a ${destino}`;
  }

  return `HTTP ${respuesta.status}`;
}

async function principal() {
  console.log(`\n  Verificando permisos en ${BASE}\n`);

  let correctas = 0;
  const fallos: string[] = [];

  // Los botones de acceso rápido de la pantalla de entrada tienen que apuntar a
  // cuentas que existan de verdad. Aquí estaban escritos a mano y se quedaron con
  // los correos de una versión anterior del proyecto: los botones aparecían, pero
  // no entraban con nadie. Solo se comprueba si el servidor los ofrece, porque en
  // producción están apagados a propósito.
  const entrada = await (await fetch(`${BASE}/entrar`)).text();
  const ofrecidos = [...entrada.matchAll(/name="email"\s+value="([^"]+)"/g)].map((m) => m[1]);

  if (ofrecidos.length > 0) {
    const esperados = CUENTAS_DEMO.map((c) => c.email);
    const coinciden =
      ofrecidos.length === esperados.length && esperados.every((e) => ofrecidos.includes(e));

    if (coinciden) {
      correctas++;
      console.log(`  OK    Los ${ofrecidos.length} accesos de demostración son las cuentas reales`);
    } else {
      fallos.push(
        `los accesos de demostración ofrecen [${ofrecidos.join(', ')}] y las cuentas son [${esperados.join(', ')}]`,
      );
      console.log('  FALLO Los accesos de demostración no coinciden con las cuentas');
    }
  }

  for (const cuenta of CUENTAS) {
    const sesion = await iniciarSesion(cuenta.email);

    if (!sesion) {
      console.log(`  ${cuenta.rol.padEnd(15)} NO se pudo iniciar sesión`);
      fallos.push(`${cuenta.rol}: no se pudo iniciar sesión con ${cuenta.email}`);
      continue;
    }

    const { cookie, destino } = sesion;
    const resultados: string[] = [];

    // Al entrar, la aplicación debe dejar al usuario en una sección que pueda
    // abrir. Si aterriza en «sin acceso», el botón para volver lo devolvería al
    // mismo sitio: un bucle sin salida. Este fallo se coló una vez, así que se
    // comprueba siempre.
    const aterrizaje = await visitar(destino || '/', cookie);
    if (aterrizaje === 'abierta') {
      correctas++;
      resultados.push(`entra→${destino}✓`);
    } else {
      fallos.push(
        `${cuenta.rol}: al entrar aterriza en «${destino}» y recibe «${aterrizaje}» en vez de una sección suya`,
      );
      resultados.push(`entra→${destino}✗(${aterrizaje})`);
    }

    for (const [ruta, porRol] of Object.entries(ESPERADO)) {
      const esperaAcceso = porRol[cuenta.rol];
      const obtenido = await visitar(ruta, cookie);
      const correcto =
        (esperaAcceso && obtenido === 'abierta') || (!esperaAcceso && obtenido === 'sin-acceso');

      if (correcto) {
        correctas++;
        resultados.push(`${ruta}${esperaAcceso ? '✓' : '⊘'}`);
      } else {
        fallos.push(
          `${cuenta.rol} en ${ruta}: se esperaba ${esperaAcceso ? 'acceso' : 'rechazo'} y se obtuvo «${obtenido}»`,
        );
        resultados.push(`${ruta}✗(${obtenido})`);
      }
    }

    console.log(`  ${cuenta.rol.padEnd(15)} ${resultados.join('  ')}`);
  }

  console.log(
    '\n  Leyenda: ✓ = entra   ⊘ = se le rechaza correctamente   ✗ = comportamiento inesperado\n',
  );
  console.log(`  ${correctas} comprobaciones correctas, ${fallos.length} con fallo\n`);

  if (fallos.length > 0) {
    console.log('  Detalle:');
    for (const f of fallos) console.log(`   · ${f}`);
    console.log('');
    process.exit(1);
  }
}

await principal();

export {};
