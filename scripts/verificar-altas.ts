/**
 * Prueba de extremo a extremo de las altas de clientes, unidades y conductores.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-altas
 *
 * Comprueba, enviando los mismos formularios que el navegador:
 *  1. Que administración da de alta un cliente, una unidad y un conductor, y que
 *     cada uno aparece donde se usa: el cliente al registrar pedidos, la unidad y
 *     el conductor al crear un despacho.
 *  2. Que no se puede dar de alta dos veces lo mismo (mismo RUC, la misma placa
 *     escrita de otra forma, el mismo DNI).
 *  3. Que el servidor valida aunque el formulario se envíe a mano saltándose las
 *     comprobaciones del navegador.
 *  4. Que despacho y gerencia no pueden dar de alta nada, ni enviando el
 *     formulario de administración directamente.
 *
 * **Escribe de verdad**: cada ejecución crea un cliente, una unidad y un
 * conductor con datos únicos. `npm run seed` deja la base como estaba.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

import { CLAVE_DEMO } from '../src/lib/auth/demo.ts';

const CLAVE = process.env.CLAVE_DEMO ?? CLAVE_DEMO;

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

/** Dígitos únicos por ejecución, para RUC, placa y DNI. */
const SELLO = String(Date.now()).slice(-7);

// ─────────────────────────────────────────────────────────────
// Sesiones y formularios
// ─────────────────────────────────────────────────────────────
function cookiesDe(respuesta: Response): string {
  return (respuesta.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function iniciarSesion(email: string): Promise<string> {
  const html = await (await fetch(`${BASE}/entrar`)).text();
  const accion = html.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1];
  if (!accion) throw new Error('No se encontró el formulario de /entrar.');

  const datos = new FormData();
  datos.set(accion, '');
  datos.set('email', email);
  datos.set('clave', CLAVE);
  datos.set('volver', '/');
  const respuesta = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE },
    redirect: 'manual',
  });
  const cookie = cookiesDe(respuesta);
  if (!cookie) throw new Error(`No se pudo entrar como ${email}. ¿Está la base sembrada?`);
  return cookie;
}

async function ver(ruta: string, cookie: string): Promise<{ estado: number; html: string; destino: string }> {
  const respuesta = await fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  return {
    estado: respuesta.status,
    html: await respuesta.text(),
    destino: respuesta.headers.get('location') ?? '',
  };
}

/**
 * Identificador de la acción de servidor del formulario que contiene `campo`.
 *
 * La página tiene más de un formulario —el de «Salir» del menú, como mínimo— y
 * tomar el primero que aparezca cerraría la sesión en lugar de dar nada de alta.
 */
async function accionDe(ruta: string, cookie: string, campo: string): Promise<string> {
  const { html } = await ver(ruta, cookie);
  const formulario = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find((f) =>
    f.includes(`name="${campo}"`),
  );
  const accion = formulario?.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1];
  if (!accion) throw new Error(`No se encontró el formulario de ${campo} en ${ruta}.`);
  return accion;
}

/** Envía un formulario de alta y devuelve a dónde redirige. */
async function enviar(
  ruta: string,
  accion: string,
  cookie: string,
  campos: Record<string, string>,
): Promise<string> {
  const datos = new FormData();
  datos.set(accion, '');
  for (const [k, v] of Object.entries(campos)) datos.set(k, v);
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
async function principal() {
  console.log(`\n  Verificando las altas de maestros en ${BASE}\n`);

  const admin = await iniciarSesion('admin@limaexpress.pe');
  const despacho = await iniciarSesion('despacho@limaexpress.pe');
  const gerencia = await iniciarSesion('gerencia@limaexpress.pe');

  // ── 1. Cliente ─────────────────────────────────────────────
  const accionCliente = await accionDe('/clientes/nuevo', admin, 'nombre');
  const nombreCliente = `Prueba Altas ${SELLO} S.A.C.`;
  const ruc = `20${SELLO}99`;
  const cliente = {
    nombre: nombreCliente,
    idFiscal: ruc,
    ciudad: 'Lima',
    contacto: 'Prueba Automática',
    telefono: '+51 900 000 000',
    email: 'pruebas@ejemplo.pe',
    tarifaBase: '12.5',
    tarifaKg: '2',
    plazo: '30',
  };

  const altaCliente = await enviar('/clientes/nuevo', accionCliente, admin, cliente);
  comprobar(altaCliente.includes('/clientes?creado=CLI-'), 'Administración da de alta un cliente', altaCliente);

  const listado = await ver(altaCliente, admin);
  comprobar(listado.html.includes(nombreCliente), 'El cliente nuevo aparece en la lista');
  comprobar(/quedó dado de alta/.test(listado.html), 'La lista confirma el alta');

  const idCliente = listado.html.match(/\/pedidos\/nuevo\?cliente=(\d+)/)?.[1] ?? null;
  comprobar(idCliente !== null, 'La confirmación ofrece registrarle un pedido');
  if (idCliente) {
    const pedido = await ver(`/pedidos/nuevo?cliente=${idCliente}`, admin);
    comprobar(
      new RegExp(`<option[^>]*value="${idCliente}"[^>]*selected`).test(pedido.html) ||
        new RegExp(`<option[^>]*selected[^>]*value="${idCliente}"`).test(pedido.html),
      'Al registrar el pedido, el cliente nuevo viene ya elegido',
    );
  }

  const repetido = await enviar('/clientes/nuevo', accionCliente, admin, {
    ...cliente,
    nombre: 'Otro nombre',
    idFiscal: `${ruc.slice(0, 4)}-${ruc.slice(4)}`,
  });
  comprobar(
    repetido.includes('error=duplicado'),
    'No se puede dar de alta otro cliente con el mismo RUC (aunque se escriba con guion)',
    repetido,
  );

  const tarifaNegativa = await enviar('/clientes/nuevo', accionCliente, admin, {
    ...cliente,
    idFiscal: '',
    tarifaBase: '-5',
  });
  comprobar(
    tarifaNegativa.includes('error=tarifa'),
    'El servidor rechaza una tarifa negativa enviada a mano',
    tarifaNegativa,
  );

  const clienteDespacho = await enviar('/clientes/nuevo', accionCliente, despacho, {
    ...cliente,
    nombre: `Intruso ${SELLO}`,
    idFiscal: '',
  });
  comprobar(
    clienteDespacho.includes('/sin-acceso'),
    'Despacho no puede dar de alta un cliente, ni enviando el formulario a mano',
    clienteDespacho,
  );

  const listaGerencia = await ver('/clientes', gerencia);
  comprobar(
    listaGerencia.estado === 200 && !listaGerencia.html.includes('href="/clientes/nuevo"'),
    'Gerencia consulta los clientes pero no ve el botón de alta',
  );
  comprobar(
    !listaGerencia.html.includes(`Intruso ${SELLO}`),
    'El intento de despacho no dejó ningún cliente creado',
  );

  // ── 2. Unidad ──────────────────────────────────────────────
  const accionUnidad = await accionDe('/flota/nueva', admin, 'placa');
  const placa = `Z${SELLO.slice(-5)}`;
  const unidad = {
    placa: `${placa.slice(0, 3).toLowerCase()}-${placa.slice(3)}`,
    tipo: 'furgoneta',
    marca: 'Renault',
    modelo: 'Kangoo',
    anio: '2023',
    capacidadKg: '750',
    capacidadM3: '3.5',
    rendimiento: '38',
    km: '1200',
    soatVence: '2027-03-15',
    revisionVence: '2027-06-30',
    conductorId: '',
    observaciones: '',
  };

  const altaUnidad = await enviar('/flota/nueva', accionUnidad, admin, unidad);
  comprobar(
    altaUnidad.includes(`/flota?creada=${placa}`),
    'Administración da de alta una unidad, con la placa normalizada',
    altaUnidad,
  );
  const flota = await ver(altaUnidad, admin);
  comprobar(/ya está en la flota/.test(flota.html), 'La flota confirma el alta');

  const documentos = await ver('/flota?tab=documentos', admin);
  comprobar(
    documentos.html.includes(placa),
    'Los vencimientos de SOAT y revisión técnica quedan registrados',
  );

  const placaRepetida = await enviar('/flota/nueva', accionUnidad, admin, { ...unidad, placa: placa.toLowerCase() });
  comprobar(
    placaRepetida.includes('error=duplicada'),
    'No se puede dar de alta la misma placa escrita de otra forma',
    placaRepetida,
  );

  const sinRendimiento = await enviar('/flota/nueva', accionUnidad, admin, {
    ...unidad,
    placa: `Y${SELLO.slice(-5)}`,
    rendimiento: '0',
  });
  comprobar(
    sinRendimiento.includes('error=rendimiento'),
    'El servidor exige un rendimiento esperado mayor que cero',
    sinRendimiento,
  );

  const unidadDespacho = await enviar('/flota/nueva', accionUnidad, despacho, {
    ...unidad,
    placa: `X${SELLO.slice(-5)}`,
  });
  comprobar(
    unidadDespacho.includes('/sin-acceso'),
    'Despacho no puede dar de alta una unidad, ni enviando el formulario a mano',
    unidadDespacho,
  );

  // ── 3. Conductor ───────────────────────────────────────────
  const accionConductor = await accionDe('/conductores/nuevo', admin, 'documento');
  const nombreConductor = `Conductor Prueba ${SELLO}`;
  const dni = `7${SELLO}`;
  const conductor = {
    nombre: nombreConductor,
    documento: dni,
    telefono: '+51 911 111 111',
    email: '',
    vinculacion: 'contratista',
    licencia: `Q${dni}`,
    categoria: 'A-IIb',
    licenciaVence: '2028-01-31',
    comision: '18',
    salario: '',
    ingreso: '2026-10-01',
  };

  const altaConductor = await enviar('/conductores/nuevo', accionConductor, admin, conductor);
  comprobar(
    altaConductor.includes('/conductores?creado=CON-'),
    'Administración da de alta un conductor',
    altaConductor,
  );
  const plantilla = await ver(altaConductor, admin);
  comprobar(/quedó en la plantilla/.test(plantilla.html), 'La plantilla confirma el alta');

  const dniRepetido = await enviar('/conductores/nuevo', accionConductor, admin, {
    ...conductor,
    documento: `${dni.slice(0, 4)} ${dni.slice(4)}`,
  });
  comprobar(
    dniRepetido.includes('error=duplicado'),
    'No se puede dar de alta otro conductor con el mismo documento',
    dniRepetido,
  );

  const categoriaFalsa = await enviar('/conductores/nuevo', accionConductor, admin, {
    ...conductor,
    documento: `8${SELLO}`,
    categoria: 'Z-9',
  });
  comprobar(
    categoriaFalsa.includes('error=categoria'),
    'El servidor rechaza una categoría de licencia que no existe',
    categoriaFalsa,
  );

  const conductorGerencia = await enviar('/conductores/nuevo', accionConductor, gerencia, {
    ...conductor,
    documento: `9${SELLO}`,
  });
  comprobar(
    conductorGerencia.includes('/sin-acceso'),
    'Gerencia no puede dar de alta un conductor',
    conductorGerencia,
  );

  // ── 4. Todo junto: lo nuevo se puede planificar ────────────
  const nuevoDespacho = await ver('/despachos/nuevo', admin);
  comprobar(nuevoDespacho.html.includes(placa), 'La unidad nueva se puede asignar a un despacho');
  comprobar(nuevoDespacho.html.includes(nombreConductor), 'El conductor nuevo se puede asignar a un despacho');
  comprobar(nuevoDespacho.html.includes(nombreCliente), 'El cliente nuevo se puede elegir en un despacho');

  console.log(`\n  ${correctas} comprobaciones correctas, ${fallos.length} con fallo\n`);
  if (fallos.length) process.exit(1);
}

await principal();
