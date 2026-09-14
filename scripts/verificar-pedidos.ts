/**
 * Prueba del buzón de pedidos y del analizador de chats de WhatsApp.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-pedidos
 *
 * Tiene dos partes, y la primera es la importante:
 *
 *  1. **El analizador, con textos reales.** Es lógica pura, así que se prueba
 *     directamente y sin servidor. Es donde de verdad se decide si esto ahorra
 *     trabajo o lo crea: un pedido mal separado es peor que tecleado a mano.
 *  2. **El circuito completo por HTTP**: dar de alta un pedido, comprobar que
 *     entra sin ruta en el buzón, meterlo en un despacho y ver que se convierte
 *     en una parada con su guía.
 *
 * La prueba **crea pedidos de verdad** y los mete en una ruta. Para dejarlo limpio:
 * `npm run seed`.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

import { CLAVE_DEMO } from '../src/lib/auth/demo.ts';
import { analizarChat } from '../src/lib/pedidos/analizar.ts';

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

function igual(obtenido: unknown, esperado: unknown, descripcion: string): void {
  comprobar(
    obtenido === esperado,
    descripcion,
    `esperaba ${JSON.stringify(esperado)}, obtuve ${JSON.stringify(obtenido)}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 1. El analizador
// ─────────────────────────────────────────────────────────────
const CHAT = `[12/09/2026, 09:14:33] Rosa Distribuidora: Hola buenos días
[12/09/2026, 09:15:02] Rosa Distribuidora: Para hoy tengo 3 envíos
[12/09/2026, 09:15:40] Rosa Distribuidora: Juan Pérez - Av Los Álamos 452, Surquillo - 987654321
[12/09/2026, 09:15:55] Rosa Distribuidora: cobrar 50
[12/09/2026, 09:16:10] Rosa Distribuidora: María Torres, Calle Las Begonias 120 Dpto 301, San Isidro, 998877665
[12/09/2026, 09:16:30] Rosa Distribuidora: 2 paquetes de 3 kg
[12/09/2026, 09:17:00] Rosa Distribuidora: Carlos Quispe
[12/09/2026, 09:17:05] Rosa Distribuidora: Jr. Amazonas 780, Lima Cercado
[12/09/2026, 09:17:10] Rosa Distribuidora: 912345678
[12/09/2026, 09:17:20] Rosa Distribuidora: Ref: portón azul, preguntar por la Sra.
12/9/26 09:18 - Rosa Distribuidora: Av. Arequipa 1234, Lince, sin cobro
[12/09/2026, 09:19:00] Rosa Distribuidora: gracias!`;

function parteAnalizador(): void {
  console.log('\n  ── El analizador ──\n');

  const pedidos = analizarChat(CHAT);
  igual(pedidos.length, 4, 'Separa la conversación en cuatro pedidos (ignora el saludo)');

  const [juan, maria, carlos, lince] = pedidos;

  igual(juan?.destinatario, 'Juan Pérez', 'Juan: reconoce el destinatario');
  igual(juan?.telefono, '+51 987 654 321', 'Juan: normaliza el teléfono');
  igual(juan?.direccion, 'Av Los Álamos 452', 'Juan: reconoce la dirección');
  igual(juan?.zona, 'Surquillo', 'Juan: reconoce el distrito sin tilde ni lista previa');
  igual(juan?.cobro, 50, 'Juan: reconoce el importe a cobrar');

  igual(maria?.destinatario, 'María Torres', 'María: reconoce el destinatario');
  igual(maria?.zona, 'San Isidro', 'María: reconoce el distrito');
  igual(maria?.bultos, 2, 'María: reconoce los bultos');
  igual(maria?.peso, 3, 'María: reconoce el peso');

  igual(carlos?.destinatario, 'Carlos Quispe', 'Carlos: separa el nombre pegado a la dirección');
  igual(carlos?.direccion, 'Jr. Amazonas 780', 'Carlos: la dirección no se lleva el nombre');
  igual(carlos?.zona, 'Lima', 'Carlos: reconoce «Lima Cercado» como Lima');
  comprobar(
    (carlos?.notas ?? '').includes('portón'),
    'Carlos: guarda la referencia en las notas',
    carlos?.notas,
  );

  igual(lince?.zona, 'Lince', 'Cuarto: reconoce el distrito');
  comprobar(
    lince?.faltantes.includes('telefono') === true &&
      lince?.faltantes.includes('destinatario') === true,
    'Cuarto: avisa de que faltan teléfono y destinatario',
    lince?.faltantes.join(', '),
  );

  // El saludo no puede colarse como pedido, que fue un fallo real.
  comprobar(
    !pedidos.some((p) => /para hoy tengo/i.test(p.direccion)),
    'El saludo del chat no se cuela como pedido',
  );

  // Abreviaturas que la gente usa de verdad.
  const abreviado = analizarChat('Ana Ruiz - Av. Los Frutales 220, SJL - 955112233');
  igual(abreviado[0]?.zona, 'San Juan de Lurigancho', 'Entiende «SJL» como San Juan de Lurigancho');

  const surco = analizarChat('Luis Ramos, Calle Monte Real 145, Surco, 944556677');
  igual(surco[0]?.zona, 'Santiago de Surco', 'Entiende «Surco» como Santiago de Surco');

  // Sin marca de tiempo, el formato más pegado a mano.
  const simple = analizarChat(`Pedro Salas | Av. Brasil 2310 Dpto 502 | Bellavista | 933221100
cobrar 120`);
  igual(simple[0]?.destinatario, 'Pedro Salas', 'Sin marca de tiempo: reconoce el destinatario');
  igual(simple[0]?.zona, 'Bellavista', 'Sin marca de tiempo: reconoce el distrito del Callao');
  igual(simple[0]?.cobro, 120, 'Sin marca de tiempo: reconoce el importe');

  // Un texto sin ningún pedido no debe inventarse nada.
  const vacio = analizarChat('Hola, ¿me confirmas el precio?\nGracias');
  igual(vacio.length, 0, 'Un chat sin pedidos no inventa ninguno');
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
        opciones.find((o) => /selected/.test(o[0]) && o[1] !== '') ?? opciones.find((o) => o[1] !== '');
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
  const formulario = formularioCon(await inicio.text(), 'email');
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
// 2. El circuito completo
// ─────────────────────────────────────────────────────────────
async function parteHttp(): Promise<void> {
  console.log('\n  ── El circuito completo ──\n');

  const cookie = await iniciarSesion('admin@limaexpress.pe');

  // Permisos: el buzón tiene datos de clientes de toda la operación.
  const cookieConductor = await iniciarSesion('conductor@limaexpress.pe');
  const cookieGerencia = await iniciarSesion('gerencia@limaexpress.pe');

  const comoConductor = await fetch(`${BASE}/pedidos`, {
    headers: { Cookie: cookieConductor },
    redirect: 'manual',
  });
  const destinoConductor = comoConductor.headers.get('location') ?? '';
  comprobar(
    comoConductor.status === 307 || destinoConductor.includes('/sin-acceso'),
    'Un conductor no entra al buzón de pedidos',
    `HTTP ${comoConductor.status} → ${destinoConductor}`,
  );

  const buzonGerencia = await ver('/pedidos', cookieGerencia);
  comprobar(buzonGerencia.estado === 200, 'Gerencia sí puede consultar el buzón');

  // El buzón tiene pedidos de ejemplo esperando.
  const buzon = await ver('/pedidos?situacion=sin_asignar', cookie);
  comprobar(buzon.estado === 200, 'El buzón se abre');
  comprobar(
    /pedidos sin asignar/i.test(buzon.html) || /Sin asignar/i.test(buzon.html),
    'El buzón enseña los pedidos que esperan',
  );

  // Dar de alta uno a mano.
  const nuevo = await ver('/pedidos/nuevo', cookie);
  const formNuevo = formularioCon(nuevo.html, 'destinatario');
  comprobar(formNuevo !== null, 'Se localiza el formulario de pedido nuevo');

  if (!formNuevo) return;

  const alta = await enviarAccion('/pedidos/nuevo', cookie, formNuevo, {
    destinatario: 'Prueba Automática',
    telefono: '+51 900 111 222',
    direccion: 'Av. Prueba 123',
    zona: 'Miraflores',
    bultos: '2',
    peso: '3',
    cobro: '75',
    notas: 'Pedido creado por la prueba automática',
  });
  comprobar(alta.includes('creado=1'), 'Se registra un pedido nuevo', `redirigió a ${alta}`);

  const conNuevo = await ver('/pedidos?q=Prueba+Autom%C3%A1tica', cookie);
  comprobar(
    /Prueba Automática/.test(conNuevo.html),
    'El pedido aparece en el buzón',
  );
  comprobar(
    /S\/\s*75/.test(conNuevo.html),
    'El importe a cobrar se ve en el listado',
  );
  const pedidoNuevo = conNuevo.html.match(/name="pedidoId"\s+value="(\d+)"/)?.[1] ?? null;
  comprobar(pedidoNuevo !== null, 'El pedido se puede seleccionar para planificarlo');

  // La guía sirve de marcador inequívoco: en la tabla va como texto propio de una
  // celda (`>TR-…<`), mientras que el término buscado aparece también en el cuadro
  // de búsqueda como valor de un atributo. Sin esta distinción, la comprobación
  // daba por bueno cualquier filtro.
  const guia = conNuevo.html.match(/>(TR-\d{8}-\d{5})<[\s\S]{0,900}?Prueba Automática/)?.[1] ?? null;
  comprobar(guia !== null, 'Se identifica la guía del pedido nuevo', String(guia));

  if (!pedidoNuevo || !guia) return;

  const enFila = (html: string) => new RegExp(`>${guia}<`).test(html);

  // Meterlo en una ruta abierta.
  const formAsignar = formularioCon(buzon.html, 'rutaId');
  comprobar(formAsignar !== null, 'El buzón ofrece el formulario de planificación');

  // El propio formulario trae ya elegida una ruta abierta: es justo lo que
  // enviaría el navegador al pulsar el botón, así que es la mejor fuente.
  const rutaId = formAsignar?.campos.rutaId ?? null;
  comprobar(rutaId !== null && rutaId !== '', 'El formulario propone una ruta abierta');

  if (formAsignar && rutaId) {
    const asignado = await enviarAccion('/pedidos?situacion=sin_asignar', cookie, formAsignar, {
      rutaId,
      pedidoId: pedidoNuevo,
    });
    comprobar(
      asignado.includes('asignados=1'),
      'El pedido se mete en la ruta',
      `redirigió a ${asignado}`,
    );

    // Se busca por la guía y se comprueba que aparece como texto de una celda: si
    // está en la vista «En ruta» y no en «Sin asignar», es que cambió de estado.
    const enRuta = await ver(`/pedidos?situacion=en_ruta&q=${guia}`, cookie);
    comprobar(enFila(enRuta.html), 'El pedido pasa a «En ruta»');

    const sinAsignar = await ver(`/pedidos?situacion=sin_asignar&q=${guia}`, cookie);
    comprobar(!enFila(sinAsignar.html), 'Ya no aparece entre los que esperan');
  }
}

async function principal(): Promise<void> {
  console.log(`\n  Verificando pedidos en ${BASE}\n`);

  parteAnalizador();
  await parteHttp();

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
