/**
 * Prueba de la gestión de usuarios.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-usuarios
 *
 * Comprueba el circuito completo —crear una cuenta y entrar con ella— y, sobre
 * todo, los **frenos**: los dos que impiden quedarse fuera de la propia
 * aplicación. Esos son los que no se notan hasta que hacen falta, y cuando hacen
 * falta ya es tarde.
 *
 * La prueba **crea cuentas de verdad**. Para dejarlo limpio: `npm run seed`.
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

// ─────────────────────────────────────────────────────────────
// Utilidades HTTP
// ─────────────────────────────────────────────────────────────
interface FormularioHtml {
  accion: string | null;
  campos: Record<string, string>;
  html: string;
}

function extraerFormularios(html: string): FormularioHtml[] {
  const bloques = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];

  return bloques.map((bloque) => {
    const accion = bloque.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1] ?? null;
    const campos: Record<string, string> = {};

    for (const etiqueta of bloque.matchAll(/<input\b[^>]*>/g)) {
      const nombre = etiqueta[0].match(/name="([^"]+)"/)?.[1];
      if (!nombre) continue;
      campos[nombre] = etiqueta[0].match(/value="([^"]*)"/)?.[1] ?? '';
    }

    for (const sel of bloque.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
      const opciones = [...sel[2].matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>/g)];
      const elegida =
        opciones.find((o) => /selected/.test(o[0]) && o[1] !== '') ??
        opciones.find((o) => o[1] !== '');
      campos[sel[1]] = elegida?.[1] ?? '';
    }

    return { accion, campos, html: bloque };
  });
}

function formularioCon(html: string, incluir: string, excluir?: string): FormularioHtml | null {
  return (
    extraerFormularios(html).find(
      (f) =>
        Object.hasOwn(f.campos, incluir) &&
        (excluir === undefined || !Object.hasOwn(f.campos, excluir)) &&
        f.accion !== null,
    ) ?? null
  );
}

/**
 * Formulario de una fila concreta.
 *
 * Cada cuenta tiene varios formularios con los mismos campos (`usuarioId`), así
 * que hay que desambiguar por el identificador de la fila.
 */
function formularioDe(
  html: string,
  usuarioId: string,
  incluir: string,
): FormularioHtml | null {
  return (
    extraerFormularios(html).find(
      (f) => f.campos.usuarioId === usuarioId && Object.hasOwn(f.campos, incluir) && f.accion,
    ) ?? null
  );
}

/** Identificador de la fila cuya persona tiene ese correo. */
function idDeUsuario(html: string, correo: string): string | null {
  for (const fila of html.split('<tr')) {
    if (!fila.includes(correo)) continue;
    const id = fila.match(/name="usuarioId"\s+value="(\d+)"/)?.[1];
    if (id) return id;
  }
  return null;
}

async function iniciarSesion(email: string, clave = CLAVE_DEMO): Promise<string> {
  const inicio = await fetch(`${BASE}/entrar`);
  const formulario = formularioCon(await inicio.text(), 'email', 'usuarioId');
  if (!formulario?.accion) throw new Error('no se encontró el formulario de acceso');

  const datos = new FormData();
  datos.set(formulario.accion, '');
  datos.set('email', email);
  datos.set('clave', clave);
  datos.set('volver', '/');

  const acceso = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE },
    redirect: 'manual',
  });

  return (acceso.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function ver(ruta: string, cookie: string) {
  const respuesta = await fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie } });
  return { estado: respuesta.status, html: await respuesta.text() };
}

async function enviarAccion(
  ruta: string,
  cookie: string,
  formulario: FormularioHtml,
  campos: Record<string, string>,
): Promise<string> {
  const datos = new FormData();
  datos.set(formulario.accion!, '');
  for (const [nombre, valor] of Object.entries({ ...formulario.campos, ...campos })) {
    if (nombre.startsWith('$ACTION_ID_')) continue;
    datos.set(nombre, valor);
  }

  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    body: datos,
    headers: { Cookie: cookie, Origin: BASE },
    redirect: 'manual',
  });

  return respuesta.headers.get('location') ?? `(sin redirección, HTTP ${respuesta.status})`;
}

// ─────────────────────────────────────────────────────────────
// Prueba
// ─────────────────────────────────────────────────────────────
async function principal(): Promise<void> {
  console.log(`\n  Verificando gestión de usuarios en ${BASE}\n`);

  const cookieAdmin = await iniciarSesion('admin@limaexpress.pe');
  if (!cookieAdmin) {
    console.log('  No se pudo entrar como administración. ¿Está la base sembrada?\n');
    process.exit(1);
  }

  // ── 1. La pantalla ────────────────────────────────────────
  const pagina = await ver('/usuarios', cookieAdmin);
  comprobar(pagina.estado === 200, 'Administración abre la gestión de usuarios');

  const formAlta = formularioCon(pagina.html, 'email', 'usuarioId');
  comprobar(formAlta !== null, 'La pantalla ofrece crear una cuenta');

  // La pantalla de primera puesta en marcha solo puede estar abierta mientras no
  // exista ninguna cuenta. Con la base sembrada tiene que estar cerrada: si
  // siguiera abierta, cualquiera podría reclamar un administrador.
  const arranque = await fetch(`${BASE}/configuracion-inicial`, { redirect: 'manual' });
  const destinoArranque = arranque.headers.get('location') ?? '';
  comprobar(
    arranque.status === 307 && destinoArranque.includes('/entrar'),
    'La configuración inicial está cerrada cuando ya hay cuentas',
    `HTTP ${arranque.status} → ${destinoArranque}`,
  );

  if (!formAlta) return;

  // ── 2. Crear una cuenta y entrar con ella ─────────────────
  const marca = Date.now();
  const correo = `prueba.${marca}@limaexpress.pe`;
  const clave = 'ClaveDePrueba123';

  const alta = await enviarAccion('/usuarios', cookieAdmin, formAlta, {
    nombre: 'Prueba Automática',
    email: correo,
    rol: 'despachador',
    clave,
  });
  comprobar(alta.includes('creado='), 'Se crea la cuenta', `redirigió a ${alta}`);

  const cookieNueva = await iniciarSesion(correo, clave);
  comprobar(cookieNueva !== '', 'La cuenta nueva entra con la contraseña entregada');

  if (cookieNueva) {
    const suBuzon = await ver('/pedidos', cookieNueva);
    comprobar(suBuzon.estado === 200, 'La cuenta nueva ve lo que le corresponde por su rol');
  }

  // ── 3. Correo repetido y contraseña corta ─────────────────
  const repetido = await enviarAccion('/usuarios', cookieAdmin, formAlta, {
    nombre: 'Otra Persona',
    email: correo,
    rol: 'despachador',
    clave,
  });
  comprobar(
    repetido.includes('error=duplicado'),
    'No se admiten dos cuentas con el mismo correo',
    `redirigió a ${repetido}`,
  );

  const corta = await enviarAccion('/usuarios', cookieAdmin, formAlta, {
    nombre: 'Clave Corta',
    email: `corta.${marca}@limaexpress.pe`,
    rol: 'despachador',
    clave: 'corta',
  });
  comprobar(
    corta.includes('error=clave'),
    'Rechaza una contraseña de menos de 8 caracteres',
    `redirigió a ${corta}`,
  );

  // ── 4. Desactivar cierra la sesión en el acto ─────────────
  const conCuenta = await ver('/usuarios', cookieAdmin);
  const idNuevo = idDeUsuario(conCuenta.html, correo);
  comprobar(idNuevo !== null, 'La cuenta nueva aparece en la lista');

  if (idNuevo) {
    const formEstado = formularioDe(conCuenta.html, idNuevo, 'accion');
    comprobar(formEstado !== null, 'Cada cuenta tiene su botón de activar o desactivar');

    if (formEstado) {
      const desactivada = await enviarAccion('/usuarios', cookieAdmin, formEstado, {
        accion: 'desactivar',
      });
      comprobar(
        desactivada.includes('desactivado=1'),
        'Se desactiva una cuenta',
        `redirigió a ${desactivada}`,
      );

      // Lo que de verdad importa: que la cookie que ya tenía deje de valer.
      const conSuCookie = await fetch(`${BASE}/pedidos`, {
        headers: { Cookie: cookieNueva },
        redirect: 'manual',
      });
      comprobar(
        conSuCookie.status !== 200,
        'Al desactivar, la sesión abierta deja de valer al instante',
        `HTTP ${conSuCookie.status}`,
      );

      const vuelveAEntrar = await iniciarSesion(correo, clave);
      comprobar(vuelveAEntrar === '', 'Una cuenta desactivada ya no puede entrar');

      // Y se reactiva para dejar claro que el camino de vuelta existe.
      const otraVez = await ver('/usuarios', cookieAdmin);
      const formReactivar = formularioDe(otraVez.html, idNuevo, 'accion');
      if (formReactivar) {
        const reactivada = await enviarAccion('/usuarios', cookieAdmin, formReactivar, {
          accion: 'activar',
        });
        comprobar(reactivada.includes('activado=1'), 'Se puede volver a activar');
      }
    }
  }

  // ── 5. Los frenos que evitan quedarse fuera ───────────────
  const idAdmin = idDeUsuario(conCuenta.html, 'admin@limaexpress.pe');
  comprobar(idAdmin !== null, 'Se identifica la propia cuenta del administrador');

  if (idAdmin) {
    const formMiEstado = formularioDe(conCuenta.html, idAdmin, 'accion');
    if (formMiEstado) {
      const yoMismo = await enviarAccion('/usuarios', cookieAdmin, formMiEstado, {
        accion: 'desactivar',
      });
      comprobar(
        yoMismo.includes('error=yo-mismo'),
        'No se puede desactivar la propia cuenta',
        `redirigió a ${yoMismo}`,
      );
    }

    // Este es el freno que de verdad se podía alcanzar: rebajarse a uno mismo
    // siendo el único administrador dejaría la aplicación sin quien la gestione.
    const formMiRol = formularioDe(conCuenta.html, idAdmin, 'rol');
    if (formMiRol) {
      const rebajarse = await enviarAccion('/usuarios', cookieAdmin, formMiRol, {
        rol: 'gerencia',
      });
      comprobar(
        rebajarse.includes('error=ultimo-admin'),
        'No se puede dejar la aplicación sin ningún administrador',
        `redirigió a ${rebajarse}`,
      );
    }

    // Y sigue siendo administrador: la comprobación anterior no debía aplicar el
    // cambio, solo rechazarlo.
    const sigueSiendo = await ver('/usuarios', cookieAdmin);
    comprobar(
      sigueSiendo.estado === 200,
      'El administrador conserva su acceso después del intento',
    );
  }

  console.log(`\n  ${correctas} comprobaciones correctas, ${fallos.length} con fallo`);
  console.log('  Nota: esta prueba crea cuentas. `npm run seed` las borra.\n');

  if (fallos.length > 0) {
    console.log('  Detalle:');
    for (const f of fallos) console.log(`   · ${f}`);
    console.log('');
    process.exit(1);
  }
}

await principal();

export {};
