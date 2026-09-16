/**
 * Prueba de la marca configurable.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-marca
 *
 * Comprueba lo que hace que el programa sirva para varias empresas: que el
 * nombre y el logo se cambien **desde la aplicación** y que el cambio llegue a
 * todas partes —la cabecera, la pantalla de acceso, el manifiesto de la app y la
 * página pública de rastreo—.
 *
 * Deja la configuración como estaba: al terminar devuelve el nombre original y
 * quita el logo de prueba. Aun así, `npm run seed` es el restablecimiento
 * completo.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

import { CLAVE_DEMO } from '../src/lib/auth/demo.ts';
import { fotoDePrueba } from './foto-sintetica.ts';

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

    return { accion, campos };
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

async function iniciarSesion(email: string): Promise<string> {
  const inicio = await fetch(`${BASE}/entrar`);
  const formulario = formularioCon(await inicio.text(), 'email', 'logo');
  if (!formulario?.accion) throw new Error('no se encontró el formulario de acceso');

  const datos = new FormData();
  datos.set(formulario.accion, '');
  datos.set('email', email);
  datos.set('clave', CLAVE_DEMO);
  datos.set('volver', '/');

  const acceso = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE },
    redirect: 'manual',
  });

  return (acceso.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function ver(ruta: string, cookie?: string) {
  const respuesta = await fetch(`${BASE}${ruta}`, cookie ? { headers: { Cookie: cookie } } : {});
  return { estado: respuesta.status, html: await respuesta.text() };
}

async function enviarAccion(
  ruta: string,
  cookie: string,
  formulario: FormularioHtml,
  campos: Record<string, string | Blob>,
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
  console.log(`\n  Verificando la marca configurable en ${BASE}\n`);

  const cookie = await iniciarSesion('admin@limaexpress.pe');

  // ── 1. Sin configurar, se usa la identidad del código ─────
  const accesoInicial = await ver('/entrar');
  comprobar(
    /Lima Express/.test(accesoInicial.html),
    'Sin configurar, el acceso muestra la identidad por defecto del código',
  );

  const sinLogo = await fetch(`${BASE}/api/logo`);
  comprobar(
    sinLogo.status === 404,
    'Sin logo subido, el endpoint responde 404',
    `HTTP ${sinLogo.status}`,
  );

  // ── 2. Solo administración entra a configurar ─────────────
  const cookieDespacho = await iniciarSesion('despacho@limaexpress.pe');
  const comoDespacho = await fetch(`${BASE}/configuracion`, {
    headers: { Cookie: cookieDespacho },
    redirect: 'manual',
  });
  comprobar(
    comoDespacho.status === 307 &&
      (comoDespacho.headers.get('location') ?? '').includes('/sin-acceso'),
    'Despacho no puede entrar a la configuración de la empresa',
    `HTTP ${comoDespacho.status}`,
  );

  // ── 3. Se cambia la identidad y se sube un logo ───────────
  const pagina = await ver('/configuracion', cookie);
  comprobar(pagina.estado === 200, 'Administración abre la configuración');

  const formulario = formularioCon(pagina.html, 'nombreCorto');
  comprobar(formulario !== null, 'La pantalla ofrece el formulario de identidad');

  if (!formulario) {
    console.log(`\n  ${correctas} correctas, ${fallos.length} con fallo\n`);
    process.exit(1);
  }

  // El nombre original, para devolverlo al terminar.
  const original = formulario.campos;

  const nombrePrueba = 'Transportes Marca de Prueba S.A.C.';
  const cortoPrueba = 'Marca Prueba';
  const logo = new File([fotoDePrueba(3).datos as BlobPart], 'logo.png', { type: 'image/png' });

  const guardado = await enviarAccion('/configuracion', cookie, formulario, {
    nombre: nombrePrueba,
    nombreCorto: cortoPrueba,
    idFiscal: '20998877665',
    telefono: '+51 1 555 0000',
    ciudad: 'Arequipa',
    logo,
  });
  comprobar(
    guardado.includes('guardado='),
    'Se guarda la identidad con su logo',
    `redirigió a ${guardado}`,
  );

  // ── 4. El cambio llega a todas partes ─────────────────────
  const acceso = await ver('/entrar');
  comprobar(/Marca Prueba/.test(acceso.html), 'La pantalla de acceso muestra el nombre nuevo');
  comprobar(/Arequipa/.test(acceso.html), 'Y la ciudad nueva');

  const panel = await ver('/', cookie);
  comprobar(/Marca Prueba/.test(panel.html), 'La cabecera de la aplicación muestra el nombre nuevo');
  comprobar(
    /20998877665/.test(panel.html),
    'El pie muestra el identificador fiscal nuevo',
  );
  comprobar(
    /api\/logo\?v=/.test(panel.html),
    'La cabecera usa el logo subido',
  );

  const rastreo = await ver('/rastrear');
  // React separa las expresiones de una misma frase con comentarios HTML
  // («Nombre<!-- --> · <!-- -->+51…»), así que hay que quitarlos antes de buscar
  // el texto seguido.
  //
  // Aquí va la **razón social**, no el nombre corto: esta página la lee un
  // cliente que tiene que poder llamar, y para eso el nombre completo.
  const rastreoTexto = rastreo.html.replace(/<!--[\s\S]*?-->/g, '');
  comprobar(
    rastreoTexto.includes(`${nombrePrueba} · +51 1 555 0000`),
    'La página pública de rastreo lleva la razón social y el teléfono de la empresa',
  );

  // ── 5. El manifiesto de la app instalable ─────────────────
  const manifiesto = await ver('/manifest.webmanifest');
  comprobar(
    manifiesto.html.includes(cortoPrueba),
    'El manifiesto de la app usa el nombre corto nuevo',
  );
  comprobar(
    /"src":"\/api\/logo\?v=/.test(manifiesto.html),
    'Y su logo como icono al instalarla',
  );

  // ── 6. El logo es público, pero es una imagen ─────────────
  const imagen = await fetch(`${BASE}/api/logo`);
  const bytes = new Uint8Array(await imagen.arrayBuffer());
  comprobar(
    imagen.status === 200 && imagen.headers.get('content-type') === 'image/png',
    'El logo se sirve como imagen',
    `HTTP ${imagen.status} · ${imagen.headers.get('content-type')}`,
  );
  comprobar(
    bytes.byteLength === logo.size,
    'Los bytes servidos son los que se subieron',
    `subidos ${logo.size}, servidos ${bytes.byteLength}`,
  );

  const firmaPng = [137, 80, 78, 71, 13, 10, 26, 10];
  comprobar(
    firmaPng.every((b, i) => bytes[i] === b),
    'La imagen servida es un PNG válido',
  );

  // Sin sesión tiene que seguir funcionando: el logo se ve en la pantalla de
  // acceso, antes de que nadie se identifique.
  const sinSesion = await fetch(`${BASE}/api/logo`, { redirect: 'manual' });
  comprobar(
    sinSesion.status === 200,
    'El logo se ve sin haber entrado, como en la pantalla de acceso',
    `HTTP ${sinSesion.status}`,
  );

  // ── 7. Se devuelve la configuración a su sitio ────────────
  const otraVez = await ver('/configuracion', cookie);
  const formVuelta = formularioCon(otraVez.html, 'nombreCorto');

  if (formVuelta) {
    const restaurado = await enviarAccion('/configuracion', cookie, formVuelta, {
      nombre: original.nombre ?? 'Transportes Lima Express S.A.C.',
      nombreCorto: original.nombreCorto ?? 'Lima Express',
      idFiscal: original.idFiscal ?? '',
      telefono: original.telefono ?? '',
      ciudad: original.ciudad ?? '',
      quitarLogo: '1',
    });
    comprobar(
      restaurado.includes('guardado='),
      'Se restaura la identidad original y se quita el logo de prueba',
      `redirigió a ${restaurado}`,
    );

    const final = await ver('/entrar');
    comprobar(/Lima Express/.test(final.html), 'El acceso vuelve a mostrar el nombre original');

    const logoFuera = await fetch(`${BASE}/api/logo`);
    comprobar(
      logoFuera.status === 404,
      'El logo de prueba se ha quitado',
      `HTTP ${logoFuera.status}`,
    );
  }

  console.log(`\n  ${correctas} comprobaciones correctas, ${fallos.length} con fallo\n`);

  if (fallos.length > 0) {
    console.log('  Detalle:');
    for (const f of fallos) console.log(`   · ${f}`);
    console.log('');
    process.exit(1);
  }
}

await principal();

export {};
