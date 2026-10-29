/**
 * Prueba de extremo a extremo de la edición y la baja de clientes, unidades y
 * conductores.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-ediciones
 *
 * Comprueba, enviando los mismos formularios que el navegador:
 *  1. Que administración corrige la ficha de un cliente, una unidad y un
 *     conductor, y que el cambio se guarda.
 *  2. Que al editar no se puede quedar con el RUC, la placa o el documento de
 *     otro registro, pero sí conservar los propios.
 *  3. Que despacho y gerencia no pueden editar ni dar de baja nada, ni enviando el
 *     formulario de administración directamente.
 *  4. Que la baja pide confirmación, que un cliente dado de baja deja de salir al
 *     registrar pedidos y al crear despachos (y se rechaza si se envía a mano), y
 *     que reactivarlo lo devuelve.
 *  5. Que no se puede dar de baja una unidad ni un conductor con una ruta en curso.
 *
 * **Escribe de verdad**: cada ejecución crea y modifica un cliente, una unidad y
 * un conductor propios, y los deja activos al terminar. No da de baja nada de lo
 * sembrado: los intentos sobre rutas en curso se rechazan. `npm run seed` deja la
 * base como estaba.
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

/** Dígitos únicos por ejecución. Distintos prefijos que `verificar-altas`. */
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

/** Identificador de la acción del formulario de `ruta` que contiene el campo `campo`. */
async function accionDe(ruta: string, cookie: string, campo: string): Promise<string> {
  const { html } = await ver(ruta, cookie);
  const formulario = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find((f) =>
    f.includes(`name="${campo}"`),
  );
  const accion = formulario?.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1];
  if (!accion) throw new Error(`No se encontró el formulario de ${campo} en ${ruta}.`);
  return accion;
}

/** Envía un formulario y devuelve a dónde redirige. */
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

/** Valor por defecto de un campo en el HTML de una ficha. */
function valorDe(html: string, campo: string): string | null {
  const input = html.match(new RegExp(`<input[^>]*name="${campo}"[^>]*>`))?.[0];
  return input?.match(/value="([^"]*)"/)?.[1] ?? null;
}

/** Identificadores de las fichas enlazadas desde un listado («Editar»). */
function idsEnlazados(html: string, patron: RegExp): number[] {
  return [...new Set([...html.matchAll(patron)].map((m) => Number(m[1])))];
}

/**
 * Busca, entre las fichas enlazadas, una que la pantalla bloquee por tener una
 * ruta en curso. El seed deja varias rutas de hoy en curso.
 */
async function conRutaEnCurso(ids: number[], ficha: (id: number) => string, cookie: string): Promise<number | null> {
  for (const id of ids) {
    const { html } = await ver(ficha(id), cookie);
    if (html.includes('No se puede dar de baja mientras tenga en curso')) return id;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Prueba
// ─────────────────────────────────────────────────────────────
async function principal() {
  console.log(`\n  Verificando la edición y la baja de maestros en ${BASE}\n`);

  const admin = await iniciarSesion('admin@limaexpress.pe');
  const despacho = await iniciarSesion('despacho@limaexpress.pe');
  const gerencia = await iniciarSesion('gerencia@limaexpress.pe');

  // ── 1. Cliente ─────────────────────────────────────────────
  console.log('  Clientes');
  const accionAltaCliente = await accionDe('/clientes/nuevo', admin, 'nombre');
  const nombreCliente = `Prueba Edición ${SELLO} S.A.C.`;
  const rucPropio = `10${SELLO}11`;
  const rucAjeno = `10${SELLO}22`;
  const cliente = {
    nombre: nombreCliente,
    idFiscal: rucPropio,
    ciudad: 'Lima',
    contacto: 'Prueba Automática',
    telefono: '+51 900 000 001',
    email: 'ediciones@ejemplo.pe',
    direccion: '',
    tarifaBase: '10',
    tarifaKg: '2',
    plazo: '30',
  };
  const altaA = await enviar('/clientes/nuevo', accionAltaCliente, admin, cliente);
  const altaB = await enviar('/clientes/nuevo', accionAltaCliente, admin, {
    ...cliente,
    nombre: `Otro Cliente ${SELLO} S.A.C.`,
    idFiscal: rucAjeno,
  });
  comprobar(altaA.includes('creado=CLI-') && altaB.includes('creado=CLI-'), 'Preparación: dos clientes nuevos', `${altaA} / ${altaB}`);

  const listaAdmin = await ver(altaA, admin);
  const idCliente = listaAdmin.html.match(/\/pedidos\/nuevo\?cliente=(\d+)/)?.[1];
  if (!idCliente) throw new Error('No se encontró el identificador del cliente nuevo.');
  const fichaCliente = `/clientes/${idCliente}`;
  comprobar(
    listaAdmin.html.includes(`href="${fichaCliente}"`),
    'La lista de clientes enlaza «Editar» para administración',
  );

  const listaGerencia = await ver('/clientes', gerencia);
  comprobar(
    listaGerencia.estado === 200 && !/href="\/clientes\/\d+"/.test(listaGerencia.html),
    'Gerencia ve la lista de clientes sin enlaces de edición',
  );

  const accionEditarCliente = await accionDe(fichaCliente, admin, 'nombre');
  comprobar(
    valorDe((await ver(fichaCliente, admin)).html, 'tarifaBase') === '10',
    'La ficha de edición viene con los datos guardados',
  );

  const editado = await enviar(fichaCliente, accionEditarCliente, admin, {
    ...cliente,
    id: idCliente,
    tarifaBase: '15.75',
    contacto: 'Contacto Corregido',
  });
  comprobar(editado.includes('/clientes?editado=CLI-'), 'Administración corrige la tarifa de un cliente', editado);
  const tras = await ver(fichaCliente, admin);
  comprobar(
    valorDe(tras.html, 'tarifaBase') === '15.75' && valorDe(tras.html, 'contacto') === 'Contacto Corregido',
    'La corrección queda guardada',
  );
  comprobar(/quedó con los datos corregidos/.test((await ver(editado, admin)).html), 'La lista confirma la corrección');

  const rucDeOtro = await enviar(fichaCliente, accionEditarCliente, admin, {
    ...cliente,
    id: idCliente,
    idFiscal: `${rucAjeno.slice(0, 4)}-${rucAjeno.slice(4)}`,
  });
  comprobar(
    rucDeOtro.includes(`${fichaCliente}?error=duplicado`),
    'No se puede poner a un cliente el RUC de otro (aunque se escriba con guion)',
    rucDeOtro,
  );

  const tarifaMala = await enviar(fichaCliente, accionEditarCliente, admin, {
    ...cliente,
    id: idCliente,
    tarifaKg: '-1',
  });
  comprobar(tarifaMala.includes('error=tarifa'), 'Al editar, el servidor valida igual que en el alta', tarifaMala);

  for (const [quien, cookie] of [
    ['Despacho', despacho],
    ['Gerencia', gerencia],
  ] as const) {
    const intento = await enviar(fichaCliente, accionEditarCliente, cookie, {
      ...cliente,
      id: idCliente,
      nombre: `Intruso ${SELLO}`,
    });
    comprobar(
      intento.includes('/sin-acceso'),
      `${quien} no puede editar un cliente enviando el formulario a mano`,
      intento,
    );
  }
  comprobar(
    !(await ver(fichaCliente, admin)).html.includes(`Intruso ${SELLO}`),
    'Los intentos sin permiso no cambiaron la ficha',
  );

  // Baja del cliente
  const confirmacion = await ver(`${fichaCliente}?confirmar=baja`, admin);
  comprobar(
    !(await ver(fichaCliente, admin)).html.includes('Sí, dar de baja') &&
      confirmacion.html.includes('Sí, dar de baja'),
    'La baja pide confirmación antes de ejecutarse',
  );
  const accionBajaCliente = await accionDe(`${fichaCliente}?confirmar=baja`, admin, 'activo');

  const bajaDespacho = await enviar(fichaCliente, accionBajaCliente, despacho, { id: idCliente, activo: '0' });
  comprobar(bajaDespacho.includes('/sin-acceso'), 'Despacho no puede dar de baja un cliente', bajaDespacho);

  const baja = await enviar(fichaCliente, accionBajaCliente, admin, { id: idCliente, activo: '0' });
  comprobar(baja.includes('/clientes?baja=CLI-'), 'Administración da de baja un cliente', baja);

  const pedidoNuevo = await ver('/pedidos/nuevo', admin);
  comprobar(
    !pedidoNuevo.html.includes(nombreCliente),
    'El cliente dado de baja deja de aparecer en /pedidos/nuevo',
  );
  comprobar(
    !(await ver('/pedidos/pegar', admin)).html.includes(nombreCliente),
    'Tampoco aparece al pegar un chat de pedidos',
  );
  comprobar(
    !(await ver('/despachos/nuevo', admin)).html.includes(nombreCliente),
    'Tampoco aparece al crear un despacho',
  );
  comprobar(
    (await ver('/pedidos', admin)).html.includes(nombreCliente),
    'Sigue en el filtro del buzón, para encontrar sus pedidos antiguos',
  );

  const accionPedido = await accionDe('/pedidos/nuevo', admin, 'destinatario');
  const pedidoAMano = await enviar('/pedidos/nuevo', accionPedido, admin, {
    clienteId: idCliente,
    destinatario: 'Destinatario de prueba',
    telefono: '',
    direccion: 'Av. Prueba 123',
    zona: '',
    fechaCompromiso: '',
    bultos: '1',
  });
  comprobar(
    pedidoAMano.includes('error=cliente'),
    'Un pedido para el cliente dado de baja se rechaza aunque se envíe a mano',
    pedidoAMano,
  );

  const accionReactivar = await accionDe(fichaCliente, admin, 'activo');
  const reactivado = await enviar(fichaCliente, accionReactivar, admin, { id: idCliente, activo: '1' });
  comprobar(reactivado.includes('/clientes?reactivado=CLI-'), 'Administración reactiva el cliente', reactivado);
  comprobar(
    (await ver('/pedidos/nuevo', admin)).html.includes(nombreCliente),
    'Reactivado, vuelve a aparecer en /pedidos/nuevo',
  );

  // ── 2. Unidad ──────────────────────────────────────────────
  console.log('\n  Unidades');
  const accionAltaUnidad = await accionDe('/flota/nueva', admin, 'placa');
  const placa = `E${SELLO.slice(-5)}`;
  const placaNueva = `F${SELLO.slice(-5)}`;
  const unidad = {
    placa,
    tipo: 'furgoneta',
    marca: 'Renault',
    modelo: 'Kangoo',
    anio: '2022',
    capacidadKg: '750',
    capacidadM3: '3.5',
    rendimiento: '38',
    km: '1000',
    soatVence: '',
    revisionVence: '',
    conductorId: '',
    observaciones: '',
  };
  const altaUnidad = await enviar('/flota/nueva', accionAltaUnidad, admin, unidad);
  comprobar(altaUnidad.includes(`creada=${placa}`), 'Preparación: una unidad nueva', altaUnidad);

  const flota = await ver('/flota', admin);
  const idsUnidades = idsEnlazados(flota.html, /href="\/flota\/(\d+)\/editar"/g);
  comprobar(idsUnidades.length > 0, 'La flota enlaza «Editar» para administración');
  comprobar(
    !/href="\/flota\/\d+\/editar"/.test((await ver('/flota', despacho)).html),
    'Despacho ve la flota sin enlaces de edición',
  );

  // La unidad nueva es la que tiene su placa en la ficha.
  let idUnidad: number | null = null;
  let placaAjena: string | null = null;
  for (const id of idsUnidades) {
    const valor = valorDe((await ver(`/flota/${id}/editar`, admin)).html, 'placa');
    if (valor === placa) idUnidad = id;
    else if (valor && !placaAjena) placaAjena = valor;
    if (idUnidad && placaAjena) break;
  }
  if (!idUnidad || !placaAjena) throw new Error('No se encontró la unidad nueva en la flota.');
  const fichaUnidad = `/flota/${idUnidad}/editar`;
  const accionEditarUnidad = await accionDe(fichaUnidad, admin, 'placa');

  const unidadEditada = await enviar(fichaUnidad, accionEditarUnidad, admin, {
    ...unidad,
    id: String(idUnidad),
    placa: `${placaNueva.slice(0, 3)}-${placaNueva.slice(3)}`,
    capacidadKg: '820',
  });
  comprobar(
    unidadEditada.includes(`/flota?editada=${placaNueva}`),
    'Administración corrige la placa y la carga de una unidad',
    unidadEditada,
  );
  const fichaTras = (await ver(fichaUnidad, admin)).html;
  comprobar(
    valorDe(fichaTras, 'placa') === placaNueva && valorDe(fichaTras, 'capacidadKg') === '820',
    'La corrección queda guardada, con la placa normalizada',
  );

  const mismaPlaca = await enviar(fichaUnidad, accionEditarUnidad, admin, {
    ...unidad,
    id: String(idUnidad),
    placa: placaNueva.toLowerCase(),
  });
  comprobar(mismaPlaca.includes('editada='), 'Guardar la ficha con su propia placa no cuenta como duplicada', mismaPlaca);

  const placaDeOtra = await enviar(fichaUnidad, accionEditarUnidad, admin, {
    ...unidad,
    id: String(idUnidad),
    placa: placaAjena,
  });
  comprobar(
    placaDeOtra.includes(`${fichaUnidad}?error=duplicada`),
    'No se puede poner a una unidad la placa de otra',
    placaDeOtra,
  );

  for (const [quien, cookie] of [
    ['Despacho', despacho],
    ['Gerencia', gerencia],
  ] as const) {
    const intento = await enviar(fichaUnidad, accionEditarUnidad, cookie, {
      ...unidad,
      id: String(idUnidad),
      placa: `G${SELLO.slice(-5)}`,
    });
    comprobar(intento.includes('/sin-acceso'), `${quien} no puede editar una unidad enviando el formulario a mano`, intento);
  }

  const accionBajaUnidad = await accionDe(`${fichaUnidad}?confirmar=baja`, admin, 'activo');
  const bajaUnidadDespacho = await enviar(fichaUnidad, accionBajaUnidad, despacho, { id: String(idUnidad), activo: '0' });
  comprobar(bajaUnidadDespacho.includes('/sin-acceso'), 'Despacho no puede dar de baja una unidad', bajaUnidadDespacho);

  const bajaUnidad = await enviar(fichaUnidad, accionBajaUnidad, admin, { id: String(idUnidad), activo: '0' });
  comprobar(bajaUnidad.includes(`/flota?baja=${placaNueva}`), 'Administración da de baja una unidad sin rutas en curso', bajaUnidad);
  comprobar(
    !(await ver('/despachos/nuevo', admin)).html.includes(placaNueva),
    'La unidad fuera de servicio deja de ofrecerse al crear un despacho',
  );
  const reactivarUnidad = await enviar(fichaUnidad, await accionDe(fichaUnidad, admin, 'activo'), admin, {
    id: String(idUnidad),
    activo: '1',
  });
  comprobar(reactivarUnidad.includes(`/flota?reactivada=${placaNueva}`), 'Administración reactiva la unidad', reactivarUnidad);
  comprobar(
    (await ver('/despachos/nuevo', admin)).html.includes(placaNueva),
    'Reactivada, vuelve a ofrecerse al crear un despacho',
  );

  const unidadEnCurso = await conRutaEnCurso(idsUnidades, (id) => `/flota/${id}/editar`, admin);
  comprobar(unidadEnCurso !== null, 'La ficha de una unidad con ruta en curso explica por qué no se puede dar de baja');
  if (unidadEnCurso) {
    const fichaEnCurso = `/flota/${unidadEnCurso}/editar`;
    const intento = await enviar(fichaEnCurso, accionBajaUnidad, admin, { id: String(unidadEnCurso), activo: '0' });
    comprobar(
      intento.includes(`${fichaEnCurso}?error=en_curso`),
      'La baja de una unidad con ruta en curso se rechaza aunque se envíe a mano',
      intento,
    );
    comprobar(
      (await ver(fichaEnCurso, admin)).html.includes('No se puede dar de baja mientras tenga en curso'),
      'La unidad sigue en servicio tras el intento',
    );
  }

  // ── 3. Conductor ───────────────────────────────────────────
  console.log('\n  Conductores');
  const accionAltaConductor = await accionDe('/conductores/nuevo', admin, 'documento');
  const nombreConductor = `Conductor Edición ${SELLO}`;
  const dni = `6${SELLO}`;
  const dniAjeno = `5${SELLO}`;
  const conductor = {
    nombre: nombreConductor,
    documento: dni,
    telefono: '',
    email: '',
    vinculacion: 'contratista',
    licencia: '',
    categoria: 'A-IIb',
    licenciaVence: '2028-01-31',
    comision: '18',
    salario: '',
    ingreso: '2026-10-01',
  };
  const altaConductor = await enviar('/conductores/nuevo', accionAltaConductor, admin, conductor);
  const altaOtro = await enviar('/conductores/nuevo', accionAltaConductor, admin, {
    ...conductor,
    nombre: `Otro Conductor ${SELLO}`,
    documento: dniAjeno,
  });
  comprobar(
    altaConductor.includes('creado=CON-') && altaOtro.includes('creado=CON-'),
    'Preparación: dos conductores nuevos',
    `${altaConductor} / ${altaOtro}`,
  );

  const plantilla = await ver(`/conductores?q=${encodeURIComponent(nombreConductor)}`, admin);
  const idConductor = plantilla.html.match(/href="\/conductores\/(\d+)\/editar"/)?.[1];
  if (!idConductor) throw new Error('No se encontró el enlace de edición del conductor nuevo.');
  comprobar(true, 'La plantilla enlaza «Editar» para administración');
  comprobar(
    !/href="\/conductores\/\d+\/editar"/.test((await ver('/conductores', gerencia)).html),
    'Gerencia ve la plantilla sin enlaces de edición',
  );
  const fichaConductor = `/conductores/${idConductor}/editar`;
  const accionEditarConductor = await accionDe(fichaConductor, admin, 'documento');

  const conductorEditado = await enviar(fichaConductor, accionEditarConductor, admin, {
    ...conductor,
    id: idConductor,
    comision: '20.5',
    telefono: '+51 922 222 222',
  });
  comprobar(conductorEditado.includes('/conductores?editado=CON-'), 'Administración corrige la comisión de un conductor', conductorEditado);
  const fichaC = (await ver(fichaConductor, admin)).html;
  comprobar(
    valorDe(fichaC, 'comision') === '20.5' && valorDe(fichaC, 'telefono') === '+51 922 222 222',
    'La corrección queda guardada',
  );

  const dniDeOtro = await enviar(fichaConductor, accionEditarConductor, admin, {
    ...conductor,
    id: idConductor,
    documento: `${dniAjeno.slice(0, 4)} ${dniAjeno.slice(4)}`,
  });
  comprobar(
    dniDeOtro.includes(`${fichaConductor}?error=duplicado`),
    'No se puede poner a un conductor el documento de otro',
    dniDeOtro,
  );

  for (const [quien, cookie] of [
    ['Despacho', despacho],
    ['Gerencia', gerencia],
  ] as const) {
    const intento = await enviar(fichaConductor, accionEditarConductor, cookie, {
      ...conductor,
      id: idConductor,
      nombre: `Intruso ${SELLO}`,
    });
    comprobar(intento.includes('/sin-acceso'), `${quien} no puede editar un conductor enviando el formulario a mano`, intento);
  }

  const accionBajaConductor = await accionDe(`${fichaConductor}?confirmar=baja`, admin, 'activo');
  const bajaGerencia = await enviar(fichaConductor, accionBajaConductor, gerencia, { id: idConductor, activo: '0' });
  comprobar(bajaGerencia.includes('/sin-acceso'), 'Gerencia no puede dar de baja un conductor', bajaGerencia);

  const bajaConductor = await enviar(fichaConductor, accionBajaConductor, admin, { id: idConductor, activo: '0' });
  comprobar(bajaConductor.includes('/conductores?baja=CON-'), 'Administración da de baja un conductor sin rutas en curso', bajaConductor);
  comprobar(
    !(await ver('/despachos/nuevo', admin)).html.includes(nombreConductor),
    'El conductor inactivo deja de ofrecerse al crear un despacho',
  );
  const reactivarConductor = await enviar(fichaConductor, await accionDe(fichaConductor, admin, 'activo'), admin, {
    id: idConductor,
    activo: '1',
  });
  comprobar(reactivarConductor.includes('/conductores?reactivado=CON-'), 'Administración reactiva al conductor', reactivarConductor);
  comprobar(
    (await ver('/despachos/nuevo', admin)).html.includes(nombreConductor),
    'Reactivado, vuelve a ofrecerse al crear un despacho',
  );

  const idsConductores = idsEnlazados((await ver('/conductores?estado=activo', admin)).html, /href="\/conductores\/(\d+)\/editar"/g);
  const conductorEnCurso = await conRutaEnCurso(idsConductores, (id) => `/conductores/${id}/editar`, admin);
  comprobar(conductorEnCurso !== null, 'La ficha de un conductor con ruta en curso explica por qué no se puede dar de baja');
  if (conductorEnCurso) {
    const fichaEnCurso = `/conductores/${conductorEnCurso}/editar`;
    const intento = await enviar(fichaEnCurso, accionBajaConductor, admin, { id: String(conductorEnCurso), activo: '0' });
    comprobar(
      intento.includes(`${fichaEnCurso}?error=en_curso`),
      'La baja de un conductor con ruta en curso se rechaza aunque se envíe a mano',
      intento,
    );
  }

  console.log(`\n  ${correctas} comprobaciones correctas, ${fallos.length} con fallo\n`);
  if (fallos.length) process.exit(1);
}

await principal();
