/**
 * Prueba de extremo a extremo de «Mi ruta», la pantalla de campo del conductor.
 *
 *   npm start            (en otra terminal, con la base sembrada)
 *   npm run verificar-mi-ruta
 *
 * Comprueba tres cosas que no se ven en una captura de pantalla:
 *
 *  1. Que un conductor **puede registrar una entrega** desde su ruta. Antes no
 *     podía: el rol solo tenía permiso de lectura sobre despachos, así que el
 *     botón existía pero el servidor rechazaba la escritura. Este es el fallo que
 *     la prueba existe para no volver a introducir.
 *  2. Que un conductor **no puede** entregar una parada de la ruta de otro
 *     compañero. El permiso `entregar` lo tienen todos los conductores, así que
 *     la única barrera es la comprobación de propiedad en el servidor.
 *  3. Que gerencia, que ve todo pero no toca nada, tampoco puede entregar.
 *
 * Se hace por HTTP real, enviando los mismos formularios que enviaría el
 * navegador, para que valga como prueba de la aplicación entera y no de una
 * función suelta.
 */
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3100'}`;

import { CLAVE_DEMO } from '../src/lib/auth/demo.ts';
import { fotoDePrueba } from './foto-sintetica.ts';

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

// ─────────────────────────────────────────────────────────────
// Utilidades de formularios HTML
// ─────────────────────────────────────────────────────────────
interface FormularioHtml {
  /** Nombre del campo oculto que identifica la acción de servidor. */
  accion: string | null;
  /** Campos ocultos y sus valores, tal como los enviaría el navegador. */
  campos: Record<string, string>;
  /** Todo el HTML del formulario, para buscar botones o etiquetas. */
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

    return { accion, campos, html: bloque };
  });
}

/**
 * Busca el formulario que contiene un campo y, si se pide, no contiene otro.
 * `excluir` es lo que distingue el formulario de entrega del de novedad: los dos
 * llevan `paradaId`, pero solo el segundo lleva `tipo`.
 */
function formularioCon(
  html: string,
  incluir: string,
  excluir?: string,
): FormularioHtml | null {
  const encontrado = extraerFormularios(html).find(
    (f) =>
      Object.hasOwn(f.campos, incluir) &&
      (excluir === undefined || !Object.hasOwn(f.campos, excluir)) &&
      f.accion !== null,
  );
  return encontrado ?? null;
}

function cookiesDe(respuesta: Response): string {
  return (respuesta.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

// ─────────────────────────────────────────────────────────────
// Sesiones
// ─────────────────────────────────────────────────────────────
async function iniciarSesion(email: string): Promise<string | null> {
  const inicio = await fetch(`${BASE}/entrar`);
  const formulario = formularioCon(await inicio.text(), 'email');
  if (!formulario?.accion) return null;

  const datos = new FormData();
  datos.set(formulario.accion, '');
  datos.set('email', email);
  datos.set('clave', CLAVE);
  datos.set('volver', '/');

  const acceso = await fetch(`${BASE}/entrar`, {
    method: 'POST',
    body: datos,
    headers: { Origin: BASE },
    redirect: 'manual',
  });

  return cookiesDe(acceso) || null;
}

async function ver(ruta: string, cookie: string) {
  const respuesta = await fetch(`${BASE}${ruta}`, { headers: { Cookie: cookie } });
  return { estado: respuesta.status, html: await respuesta.text() };
}

/**
 * Envía una acción de servidor como lo haría el navegador sin JavaScript y
 * devuelve a dónde redirige. Los valores pueden ser texto o un archivo, que es
 * como viaja la foto de prueba de entrega.
 */
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

/** Identificadores de foto que aparecen en una página, en orden. */
function fotosEn(html: string): string[] {
  return [...new Set(html.matchAll(/\/api\/foto\/(\d+)/g).map((m) => m[1]))];
}

function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rango de fechas amplio alrededor de hoy.
 *
 * El listado de despachos viene filtrado por defecto de ayer a pasado mañana, y
 * con ese margen las rutas de los datos de ejemplo quedan fuera.
 */
function rangoAmplio(): { desde: string; hasta: string } {
  return {
    desde: aISO(new Date(Date.now() - 60 * 86_400_000)),
    hasta: aISO(new Date(Date.now() + 2 * 86_400_000)),
  };
}

/**
 * Encuentra una ruta ya cerrada.
 *
 * Hacen falta dos cosas. La primera, ampliar el rango de fechas: el listado de
 * despachos viene filtrado por defecto de ayer a pasado mañana, así que las
 * rutas canceladas de los datos de ejemplo quedan fuera. La segunda, descartar
 * los enlaces de la tarjeta «rutas de hoy» que la página enseña arriba, porque
 * aparecen antes que la tabla filtrada. El estado se confirma en
 * `/despachos/<id>`, que es una página distinta de la que se está probando.
 */
async function buscarRutaCerrada(cookie: string): Promise<string | null> {
  const { desde, hasta } = rangoAmplio();

  const idsDe = (html: string): string[] => [
    ...new Set(html.matchAll(/\/despachos\/(\d+)/g).map((m) => m[1])),
  ];

  const canceladas = await ver(`/despachos?estado=cancelado&desde=${desde}&hasta=${hasta}`, cookie);
  const abiertas = new Set(idsDe((await ver('/despachos?estado=en_curso', cookie)).html));

  for (const id of idsDe(canceladas.html).filter((i) => !abiertas.has(i)).slice(0, 6)) {
    const ficha = await ver(`/despachos/${id}`, cookie);
    if (/>\s*Cancelado\s*</.test(ficha.html)) return id;
  }
  return null;
}

/**
 * Busca una ruta **de otro conductor** que tenga fotos de prueba de entrega.
 *
 * Es lo que hace falta para comprobar que un conductor no puede ver las fotos de
 * sus compañeros: sin una foto real de otra ruta, la comprobación no probaría
 * nada.
 */
async function buscarFotoAjena(
  cookie: string,
  rutaPropia: string,
): Promise<{ ruta: string; foto: string } | null> {
  const { desde, hasta } = rangoAmplio();
  const listado = await ver(`/despachos?estado=completado&desde=${desde}&hasta=${hasta}`, cookie);

  const ids = [...new Set(listado.html.matchAll(/\/despachos\/(\d+)/g).map((m) => m[1]))]
    .filter((id) => id !== rutaPropia)
    .slice(0, 10);

  for (const id of ids) {
    const ficha = await ver(`/despachos/${id}`, cookie);
    const foto = fotosEn(ficha.html)[0];
    if (foto) return { ruta: id, foto };
  }
  return null;
}

/**
 * Cuenta de paradas resueltas que muestra la cabecera: «5/12 paradas».
 *
 * React separa las expresiones de una misma frase con comentarios HTML
 * (`5<!-- -->/<!-- -->8`), así que hay que quitarlos antes de buscar el patrón.
 */
function paradasResueltas(html: string): number | null {
  const limpio = html.replace(/<!--[\s\S]*?-->/g, '');
  const m = limpio.match(/(\d+)\/(\d+)\s*paradas/);
  return m ? Number(m[1]) : null;
}

// ─────────────────────────────────────────────────────────────
// Prueba
// ─────────────────────────────────────────────────────────────
async function principal() {
  console.log(`\n  Verificando «Mi ruta» en ${BASE}\n`);

  const cookieConductor = await iniciarSesion('conductor@limaexpress.pe');
  const cookieAdmin = await iniciarSesion('admin@limaexpress.pe');
  const cookieGerencia = await iniciarSesion('gerencia@limaexpress.pe');

  if (!cookieConductor || !cookieAdmin || !cookieGerencia) {
    console.log('  No se pudo iniciar sesión con las cuentas de demostración.');
    console.log('  ¿Está la base sembrada? Prueba `npm run seed`.\n');
    process.exit(1);
  }

  // ── 1. La pantalla se abre y muestra la parada en curso ────
  const miRuta = await ver('/mi-ruta', cookieConductor);
  comprobar(miRuta.estado === 200, 'El conductor abre /mi-ruta', `HTTP ${miRuta.estado}`);
  comprobar(
    /Siguiente parada/i.test(miRuta.html),
    'La pantalla muestra la parada siguiente en grande',
  );
  comprobar(
    /Marcar entregado/i.test(miRuta.html),
    'Aparece el botón de registrar la entrega',
  );
  comprobar(/No se pudo entregar/i.test(miRuta.html), 'Aparece el botón de novedad');

  const rutaPropia = miRuta.html.match(/\/despachos\/(\d+)/)?.[1] ?? null;
  comprobar(rutaPropia !== null, 'Se identifica la hoja de ruta del conductor');

  const antes = paradasResueltas(miRuta.html);
  comprobar(antes !== null, 'La cabecera indica el avance de paradas');

  // Las fotos que ya había antes de entregar. La pantalla muestra también las de
  // ejemplo en las paradas resueltas, así que «la primera foto de la página» no
  // sirve para identificar la que se acaba de subir: hay que mirar cuál aparece
  // de nueva.
  const fotosPrevias = new Set(fotosEn(miRuta.html));

  // ── 2. Registrar una entrega funciona ─────────────────────
  const formEntrega = formularioCon(miRuta.html, 'paradaId', 'tipo');
  comprobar(formEntrega !== null, 'Se localiza el formulario de entrega');
  comprobar(
    formEntrega !== null && Object.hasOwn(formEntrega.campos, 'foto'),
    'El formulario de entrega permite adjuntar la foto de quien recibe',
  );

  if (!formEntrega || !rutaPropia || antes === null) {
    console.log(
      '\n  El conductor no tiene ninguna parada pendiente con la que probar.' +
        '\n  Esta prueba consume paradas de verdad: ejecuta `npm run seed` para' +
        '\n  regenerar los datos de ejemplo y vuelve a intentarlo.\n',
    );
    console.log(`  ${correctas} correctas, ${fallos.length} con fallo\n`);
    process.exit(1);
  }

  // La entrega se envía CON foto: así la misma comprobación sirve para el ciclo
  // completo de la prueba de entrega, sin gastar una parada de más.
  const imagen = new File([fotoDePrueba(7).datos as BlobPart], 'entrega.png', {
    type: 'image/png',
  });

  const destino = await enviarAccion('/mi-ruta', cookieConductor, formEntrega, {
    receptor: 'Prueba automática',
    foto: imagen,
  });
  comprobar(
    destino.includes('hecho=entrega'),
    'El conductor registra una entrega en su propia ruta',
    `redirigió a ${destino}`,
  );

  const despues = await ver('/mi-ruta', cookieConductor);
  const ahora = paradasResueltas(despues.html);
  comprobar(
    ahora !== null && antes !== null && ahora === antes + 1,
    'La parada queda resuelta y el avance sube en uno',
    `antes ${antes}, después ${ahora}`,
  );

  // ── 2b. La foto queda guardada y se puede ver ─────────────
  const fotosPropias = fotosEn(despues.html);
  comprobar(fotosPropias.length > 0, 'La entrega aparece con su foto en la ruta');

  const fotosNuevas = fotosPropias.filter((id) => !fotosPrevias.has(id));
  comprobar(
    fotosNuevas.length === 1,
    'La entrega añade exactamente una foto, la que se acaba de subir',
    `nuevas: ${fotosNuevas.join(', ') || 'ninguna'}`,
  );

  const idFotoPropia = fotosNuevas[0] ?? null;
  if (idFotoPropia) {
    const imagenServida = await fetch(`${BASE}/api/foto/${idFotoPropia}`, {
      headers: { Cookie: cookieConductor },
    });
    const bytes = new Uint8Array(await imagenServida.arrayBuffer());
    comprobar(
      imagenServida.status === 200 && imagenServida.headers.get('content-type') === 'image/png',
      'La foto se sirve como imagen',
      `HTTP ${imagenServida.status} · ${imagenServida.headers.get('content-type')}`,
    );
    comprobar(
      bytes.byteLength === imagen.size,
      'Los bytes servidos son exactamente los que se subieron',
      `subidos ${imagen.size}, servidos ${bytes.byteLength}`,
    );

    // La longitud podría cuadrar por casualidad; la firma del archivo no. Es la
    // comprobación que demuestra que el binario sobrevive intacto al viaje de ida
    // y vuelta por la base de datos.
    const firmaPng = [137, 80, 78, 71, 13, 10, 26, 10];
    comprobar(
      firmaPng.every((byte, i) => bytes[i] === byte),
      'La imagen servida sigue siendo un PNG válido',
      `empieza por ${[...bytes.slice(0, 8)].join(',')}`,
    );
    comprobar(
      /private/.test(imagenServida.headers.get('cache-control') ?? ''),
      'La foto se marca como caché privada',
      imagenServida.headers.get('cache-control') ?? '(sin cabecera)',
    );

    // Sin sesión no puede salir de aquí: es la cara de una persona.
    const sinSesion = await fetch(`${BASE}/api/foto/${idFotoPropia}`, { redirect: 'manual' });
    comprobar(
      sinSesion.status === 401,
      'Sin sesión no se puede ver una foto de entrega',
      `HTTP ${sinSesion.status}`,
    );
  }

  // ── 3. Un conductor no puede entregar paradas ajenas ──────
  // Se busca una parada real de otra ruta: primero las rutas que ve la oficina y
  // luego la primera parada pendiente de una que no sea la del conductor.
  const listado = await ver('/despachos', cookieAdmin);
  const idsRutas = [...new Set(listado.html.matchAll(/\/despachos\/(\d+)/g).map((m) => m[1]))]
    .filter((id) => id !== rutaPropia)
    .slice(0, 12);

  let paradaAjena: { ruta: string; paradaId: string } | null = null;
  for (const idRuta of idsRutas) {
    const vista = await ver(`/mi-ruta?ruta=${idRuta}`, cookieAdmin);
    const formulario = formularioCon(vista.html, 'paradaId', 'tipo');
    if (formulario?.campos.paradaId) {
      paradaAjena = { ruta: idRuta, paradaId: formulario.campos.paradaId };
      break;
    }
  }

  comprobar(paradaAjena !== null, 'Se encuentra una parada pendiente de otra ruta');

  if (paradaAjena) {
    const rechazo = await enviarAccion('/mi-ruta', cookieConductor, formEntrega, {
      paradaId: paradaAjena.paradaId,
    });
    comprobar(
      rechazo.includes('/sin-acceso'),
      'El conductor NO puede entregar una parada de otra ruta',
      `redirigió a ${rechazo}`,
    );

    // Y la parada sigue pendiente: no bastaba con redirigir, no debía tocarla.
    const revisada = await ver(`/mi-ruta?ruta=${paradaAjena.ruta}`, cookieAdmin);
    const sigueAhi = formularioCon(revisada.html, 'paradaId', 'tipo');
    comprobar(
      sigueAhi?.campos.paradaId === paradaAjena.paradaId,
      'La parada ajena sigue pendiente después del intento',
      `esperaba ${paradaAjena.paradaId}, encontré ${sigueAhi?.campos.paradaId ?? 'ninguna'}`,
    );
  }

  // ── 4. Un conductor no puede abrir la ruta de otro ────────
  if (paradaAjena) {
    const respuesta = await fetch(`${BASE}/mi-ruta?ruta=${paradaAjena.ruta}`, {
      headers: { Cookie: cookieConductor },
      redirect: 'manual',
    });
    const destinoRuta = respuesta.headers.get('location') ?? '';
    comprobar(
      destinoRuta.includes('/sin-acceso'),
      'El conductor no puede abrir /mi-ruta de una ruta ajena',
      `redirigió a ${destinoRuta || `HTTP ${respuesta.status}`}`,
    );
  }

  // ── 5. Gerencia ve las rutas pero no entrega ──────────────
  const detalle = await ver(`/despachos/${rutaPropia}`, cookieGerencia);
  const formGerencia = formularioCon(detalle.html, 'receptor');
  comprobar(
    formGerencia === null,
    'Gerencia no ve el formulario de entrega en el despacho',
  );

  // Se envía igualmente el formulario que usa el conductor: si el servidor
  // confiara en que la interfaz lo oculta, aquí se colaría. Tiene que ir al
  // mismo destino del que salió el formulario, porque Next ata cada acción de
  // servidor a la ruta que la renderizó.
  const intentoGerencia = await enviarAccion('/mi-ruta', cookieGerencia, formEntrega, {
    receptor: 'No debería',
  });
  comprobar(
    intentoGerencia.includes('/sin-acceso') || intentoGerencia.includes('/entrar'),
    'Gerencia no puede entregar aunque envíe el formulario a mano',
    `redirigió a ${intentoGerencia}`,
  );

  // ── 6. La oficina sí puede entregar por el conductor ──────
  // Se usa una parada de otra ruta para no vaciar la del conductor: esta prueba
  // gasta paradas de verdad, y conviene que aguante varias ejecuciones.
  if (paradaAjena) {
    const vistaAdmin = await ver(`/mi-ruta?ruta=${paradaAjena.ruta}`, cookieAdmin);
    const formAdmin = formularioCon(vistaAdmin.html, 'paradaId', 'tipo');
    if (formAdmin) {
      const entregaAdmin = await enviarAccion('/mi-ruta', cookieAdmin, formAdmin, {
        receptor: 'Entregado por despacho',
      });
      comprobar(
        entregaAdmin.includes('hecho=entrega'),
        'Administración puede registrar una entrega en nombre del conductor',
        `redirigió a ${entregaAdmin}`,
      );
    } else {
      comprobar(false, 'Administración ve la parada pendiente de otra ruta');
    }
  }

  // ── 7. Una ruta cancelada se ve, pero no se toca ──────────
  // Es el caso que de verdad ejercita el modo de solo lectura: las rutas
  // canceladas conservan todas sus paradas pendientes, así que la pantalla
  // dibuja la parada siguiente y aun así no debe ofrecer botones.
  const idCancelada = await buscarRutaCerrada(cookieAdmin);
  comprobar(idCancelada !== null, 'Se encuentra una ruta cancelada');

  if (idCancelada) {
    const cerrada = await ver(`/mi-ruta?ruta=${idCancelada}`, cookieAdmin);
    comprobar(cerrada.estado === 200, 'La ruta cerrada se abre en solo lectura');
    comprobar(
      /ya está cancelado/i.test(cerrada.html),
      'La pantalla avisa de que la ruta está cerrada',
    );
    comprobar(
      formularioCon(cerrada.html, 'paradaId', 'tipo') === null,
      'Una ruta cerrada no ofrece el formulario de entrega',
    );
    comprobar(
      /Siguiente parada/i.test(cerrada.html),
      'Aun así se ve cuál era la parada siguiente',
    );
  }

  // ── 8. Las fotos de entrega están protegidas ──────────────
  const ajena = await buscarFotoAjena(cookieAdmin, rutaPropia);
  comprobar(ajena !== null, 'Hay una foto de prueba de entrega en una ruta ajena');

  if (ajena) {
    const comoAdmin = await fetch(`${BASE}/api/foto/${ajena.foto}`, {
      headers: { Cookie: cookieAdmin },
      redirect: 'manual',
    });
    comprobar(
      comoAdmin.status === 200,
      'La oficina ve la prueba de entrega de cualquier ruta',
      `HTTP ${comoAdmin.status}`,
    );

    const comoConductor = await fetch(`${BASE}/api/foto/${ajena.foto}`, {
      headers: { Cookie: cookieConductor },
      redirect: 'manual',
    });
    comprobar(
      comoConductor.status === 404,
      'Un conductor NO puede ver la foto de la ruta de otro compañero',
      `HTTP ${comoConductor.status}`,
    );

    // Gerencia no modifica nada, pero sí consulta: debe poder verlas.
    const comoGerencia = await fetch(`${BASE}/api/foto/${ajena.foto}`, {
      headers: { Cookie: cookieGerencia },
      redirect: 'manual',
    });
    comprobar(
      comoGerencia.status === 200,
      'Gerencia puede consultar las pruebas de entrega',
      `HTTP ${comoGerencia.status}`,
    );

    // Y la ficha del despacho las enseña: es donde se mira ante un reclamo.
    const ficha = await ver(`/despachos/${ajena.ruta}`, cookieAdmin);
    comprobar(
      /Prueba de entrega/i.test(ficha.html),
      'La ficha del despacho muestra la prueba de entrega',
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
