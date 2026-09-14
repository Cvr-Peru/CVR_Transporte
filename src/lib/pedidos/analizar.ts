/**
 * Analizador de pedidos escritos a mano.
 *
 * Convierte el texto de una conversación de WhatsApp en pedidos estructurados.
 * La idea es sencilla: si el pedido ya está escrito en algún sitio, nadie debería
 * volver a teclearlo. Lo único que hace falta es separarlo y ordenarlo.
 *
 * **Propone, no decide.** Todo lo que sale de aquí pasa por una pantalla de
 * revisión antes de guardarse, y está pensado así a propósito: las direcciones de
 * Lima son un desastre («frente al grifo, portón azul, tercer piso») y ningún
 * analizador acierta eso solo. Lo que sí puede hacer es quitar de en medio el 80 %
 * del tecleo y señalar exactamente qué campo no ha reconocido, para que la persona
 * mire justo ahí.
 *
 * Se apoya en `ZONAS` para reconocer el distrito. Eso no solo rellena un campo:
 * es la señal más fiable de que una línea es una dirección, y además es lo que
 * después permite situar la parada en el mapa.
 *
 * Es lógica pura, sin acceso a datos ni a React, para poder probarla aparte.
 */
import { ZONAS } from '../zonas.ts';

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
export const CAMPOS_PEDIDO = ['destinatario', 'telefono', 'direccion', 'zona'] as const;
export type CampoPedido = (typeof CAMPOS_PEDIDO)[number];

export interface PedidoPropuesto {
  /** El texto del que salió, para poder contrastarlo en la revisión. */
  original: string;
  destinatario: string;
  telefono: string;
  direccion: string;
  zona: string;
  /** Importe a cobrar al entregar. 0 = nada que cobrar. */
  cobro: number;
  bultos: number;
  /** Peso en kilos, si el mensaje lo dice. 0 = no se sabe. */
  peso: number;
  notas: string;
  /** Campos que no se reconocieron: es donde hay que mirar al revisar. */
  faltantes: CampoPedido[];
}

// ─────────────────────────────────────────────────────────────
// Normalización de texto
// ─────────────────────────────────────────────────────────────
/** Minúsculas y sin tildes: «Jesús María» y «jesus maria» son lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────
// Distritos
// ─────────────────────────────────────────────────────────────
/**
 * Diccionario de distritos. Se construye a partir de `ZONAS` para que el nombre
 * devuelto coincida siempre con el del catálogo —con sus tildes—, y se le añaden
 * las formas cortas que la gente escribe de verdad en un chat.
 */
const ALIAS_ZONA: Record<string, string> = (() => {
  const mapa: Record<string, string> = {};
  for (const zona of ZONAS) mapa[normalizar(zona.nombre)] = zona.nombre;

  Object.assign(mapa, {
    surco: 'Santiago de Surco',
    sjl: 'San Juan de Lurigancho',
    smp: 'San Martín de Porres',
    ves: 'Villa El Salvador',
    magdalena: 'Magdalena del Mar',
    'lima cercado': 'Lima',
    cercado: 'Lima',
  });

  return mapa;
})();

/** Las claves más largas primero: «san juan de lurigancho» antes que «sjl». */
const CLAVES_ZONA = Object.keys(ALIAS_ZONA).sort((a, b) => b.length - a.length);

/** Distrito mencionado en un texto, o `null`. */
export function zonaDeTexto(texto: string): string | null {
  const plano = normalizar(texto);

  for (const clave of CLAVES_ZONA) {
    const patron = new RegExp(`(^|[^a-z0-9])${escaparRegex(clave)}([^a-z0-9]|$)`);
    if (patron.test(plano)) return ALIAS_ZONA[clave];
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Patrones de campo
// ─────────────────────────────────────────────────────────────
/** Móvil peruano: 9XX XXX XXX, con o sin +51 y con cualquier separador. */
const MOVIL = /(?:\+?51[\s.-]?)?(9\d{2})[\s.-]?(\d{3})[\s.-]?(\d{3})(?!\d)/;

/** Fijo de Lima: (01) 4XX XXXX. */
const FIJO = /(?:\+?51[\s.-]?)?\(?0?1\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/;

/** Palabras que delatan una dirección. */
const VIA =
  /\b(av|avda|avenida|jr|jiron|calle|pasaje|psje|mz|manzana|lote|urb|urbanizacion|ovalo|plaza|parque|carretera|prolongacion|alameda|block|bloque|asoc|asociacion|coop|cooperativa|residencial|sector|etapa|grupo)\b/;

/** Importe a cobrar al entregar. */
const COBRO =
  /(?:cobrar|cobro|cobrarse|contra\s*entrega|pago\s*contra\s*entrega|reembolso|pagadero)\D{0,14}?(?:s\/\.?\s*)?(\d{1,4}(?:[.,]\d{1,2})?)/i;

/** Número de bultos. */
const BULTOS = /(\d{1,3})\s*(?:paquete|paq|bulto|caja|sobre|encomienda|pedido)s?\b/i;

/**
 * Peso en kilos.
 *
 * Importa más de lo que parece: de aquí sale el flete, y el flete acaba en la
 * factura. Por eso se busca aunque sea un dato que casi nunca viene.
 */
const PESO = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|kgs|kilos?|kilogramos?)\b/i;

/**
 * Palabras que impiden que una línea se tome por un nombre de persona. Sin esta
 * lista, «Ref: portón azul» o «cobrar 50» podrían colarse como destinatario, y
 * los saludos del chat como «Hola».
 */
const NO_ES_NOMBRE =
  /\b(ref|referencia|nota|notas|cobrar|cobro|contra|entrega|llamar|timbre|porton|puerta|dpto|depto|departamento|piso|interior|int|mz|manzana|lote|lt|urb|av|avda|avenida|jr|jiron|calle|pasaje|plaza|parque|ovalo|carretera|prolongacion|alameda|block|bloque|horario|antes|despues|manana|hoy|urgente|fragil|adjunto|foto|guia|total|saldo|adelanto|yape|plin|transferencia|cuenta|banco|gracias|por\s*favor|favor|ok|listo|confirmado|hola|buenos|buenas|dias|tardes|noches|estimados|estimado|saludos|sr|sra|srta|senor|senora|don|dona)\b/;

/**
 * Palabras que descartan un fragmento como dirección cuando no trae ninguna
 * palabra de vía.
 *
 * Existe por un fallo real: sin esta lista, «Para hoy tengo 3 envíos» se colaba
 * como dirección —tiene letras y un número— y el saludo del chat acababa siendo
 * un pedido en la pantalla de revisión.
 */
const NO_ES_DIRECCION =
  /\b(tengo|tenemos|son|hay|seran|envio|envios|pedido|pedidos|paquete|paquetes|para|hoy|manana|ayer|gracias|total|precio|costo|cuanto|saldo|adelanto|factura|boleta|unidades|aprox|stock|stock:|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/;

// ─────────────────────────────────────────────────────────────
// Extracción de campos
// ─────────────────────────────────────────────────────────────
/** Devuelve el teléfono en formato peruano legible, o cadena vacía. */
function extraerTelefono(texto: string): string {
  const movil = texto.match(MOVIL);
  if (movil) return `+51 ${movil[1]} ${movil[2]} ${movil[3]}`;

  const fijo = texto.match(FIJO);
  if (fijo) return `+51 1 ${fijo[1]} ${fijo[2]}`;

  return '';
}

function extraerCobro(texto: string): number {
  const encontrado = texto.match(COBRO);
  if (!encontrado) return 0;

  const importe = Number(encontrado[1].replace(',', '.'));
  return Number.isFinite(importe) && importe > 0 ? importe : 0;
}

function extraerBultos(texto: string): number {
  const encontrado = texto.match(BULTOS);
  if (!encontrado) return 1;

  const cantidad = Number(encontrado[1]);
  return Number.isFinite(cantidad) && cantidad > 0 ? Math.min(cantidad, 99) : 1;
}

function extraerPeso(texto: string): number {
  const encontrado = texto.match(PESO);
  if (!encontrado) return 0;

  const kilos = Number(encontrado[1].replace(',', '.'));
  return Number.isFinite(kilos) && kilos > 0 ? Math.min(kilos, 999) : 0;
}

/** ¿Este fragmento parece una dirección? */
function pareceDireccion(fragmento: string): boolean {
  return VIA.test(normalizar(fragmento));
}

/** ¿Este fragmento parece el nombre de una persona? */
function pareceNombre(fragmento: string): boolean {
  const limpio = fragmento.replace(/[.,;:]+$/, '').trim();
  if (limpio.length < 3 || limpio.length > 60) return false;
  if (/\d/.test(limpio)) return false;
  if (NO_ES_NOMBRE.test(normalizar(limpio))) return false;
  // Un distrito no es un destinatario. Sin esto, una dirección escrita en varias
  // líneas dejaba «Surquillo» como nombre de quien recibe.
  if (zonaDeTexto(limpio) !== null) return false;

  const palabras = limpio.split(/\s+/);
  if (palabras.length > 5) return false;

  // Todas las palabras empiezan por mayúscula, como un nombre escrito a mano.
  return palabras.every((p) => /^[A-ZÁÉÍÓÚÑ][\wáéíóúñ'.-]*$/.test(p));
}

/**
 * Parte el bloque en fragmentos por comas, puntos y comas y guiones sueltos.
 *
 * El guion es un separador tan habitual en estos mensajes
 * («Juan Pérez - Av. Los Álamos 452 - 987654321») como la coma, pero también
 * aparece dentro de direcciones («Av. Arica 123 - Dpto 4»), así que se divide por
 * él y luego se vuelve a unir lo que claramente forma parte de la dirección.
 */
function fragmentos(bloque: string): string[] {
  return bloque
    .split(/\s*[,;|]\s*|\s+[-–—]\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/** Quita del fragmento el teléfono, el importe y el propio distrito. */
function limpiarDireccion(fragmento: string, zona: string | null): string {
  let limpio = fragmento.replace(MOVIL, ' ').replace(FIJO, ' ');

  if (zona) {
    // El distrito ya vive en su propio campo: repetirlo en la dirección solo
    // ensucia lo que leerá el conductor.
    limpio = quitarZona(limpio, zona);
  }

  return limpio.replace(/^[-–—,;:\s]+|[-–—,;:\s]+$/g, '').trim();
}

/**
 * Borra del texto cualquier forma de nombrar un distrito.
 *
 * Se quitan tanto el nombre del catálogo como las abreviaturas que la gente
 * escribe, y las más largas primero: sin eso, «Lima Cercado» se quedaría en
 * «Cercado», porque solo se reconocería la parte «Lima».
 */
function quitarZona(texto: string, zona: string): string {
  const formas = [
    normalizar(zona),
    ...Object.keys(ALIAS_ZONA).filter((clave) => ALIAS_ZONA[clave] === zona),
  ].sort((a, b) => b.length - a.length);

  let limpio = texto;
  for (const forma of formas) {
    const patron = new RegExp(`(^|[^a-z0-9])${escaparRegex(forma)}([^a-z0-9]|$)`, 'gi');
    limpio = limpio.replace(patron, ' ');
  }

  return limpio.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Lo que queda de un fragmento una vez quitado lo que ya tiene su propio campo.
 *
 * Existe por un fallo real: «Lima Cercado 912345678 Ref: portón azul» es un solo
 * fragmento, y al descartarlo entero por contener el distrito se perdía la
 * referencia del portero, que es justo el dato que el conductor necesita.
 */
function sobrante(fragmento: string, zona: string | null): string {
  let limpio = fragmento.replace(MOVIL, ' ').replace(FIJO, ' ');
  if (zona) limpio = quitarZona(limpio, zona);

  return limpio
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—,;:.]+|[\s\-–—,;:.]+$/g, '')
    .trim();
}

/**
 * Analiza un bloque de texto y propone un pedido.
 *
 * Un bloque es lo que se supone que describe **un** envío: puede venir en una sola
 * línea o repartido en varias («Juan Pérez» / «Av. Los Álamos 452, Surquillo» /
 * «987654321»).
 */
export function analizarBloque(bloque: string): PedidoPropuesto {
  const texto = bloque.replace(/\s{2,}/g, ' ').trim();
  const zona = zonaDeTexto(texto);
  const telefono = extraerTelefono(texto);

  const partes = fragmentos(texto);

  // La dirección es el fragmento que contiene una palabra de vía. Cuando el
  // nombre viene pegado delante —«Carlos Quispe Jr. Amazonas 780», sin comas ni
  // guiones que los separen— se corta justo antes de esa palabra, que es una
  // frontera mucho más fiable que buscar mayúsculas.
  let direccion = '';
  let destinatario = '';
  let indiceDireccion = -1;

  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    const coincidencia = VIA.exec(normalizar(parte));
    if (!coincidencia || coincidencia.index === undefined) continue;

    const antes = parte.slice(0, coincidencia.index).replace(/[\s\-–—:,]+$/, '').trim();
    const desde = parte.slice(coincidencia.index).trim();

    if (antes.length > 0 && pareceNombre(antes)) {
      destinatario = antes;
      direccion = limpiarDireccion(desde, zona);
    } else {
      direccion = limpiarDireccion(parte, zona);
    }

    indiceDireccion = i;
    break;
  }

  // Si no hay ninguna palabra de vía, se admite el fragmento que tenga pinta de
  // «vía + número», descartando frases sueltas del chat.
  if (!direccion) {
    const candidato = partes.find(
      (p) =>
        /\d{2,5}/.test(p) &&
        /[a-záéíóúñ]/i.test(p) &&
        !MOVIL.test(p) &&
        !FIJO.test(p) &&
        !pareceNombre(p) &&
        !NO_ES_DIRECCION.test(normalizar(p)) &&
        p.trim().split(/\s+/).length <= 6,
    );
    if (candidato) {
      direccion = limpiarDireccion(candidato, zona);
      indiceDireccion = partes.indexOf(candidato);
    }
  }

  // El destinatario se busca **antes** de la dirección, que es donde va siempre
  // en estos mensajes («Juan Pérez - Av. Los Álamos 452»). Solo si no hay nada
  // antes se mira el resto, y ahí el filtro de distritos hace el resto.
  if (!destinatario && indiceDireccion > 0) {
    destinatario = partes.slice(0, indiceDireccion).find((p) => pareceNombre(p)) ?? '';
  }
  if (!destinatario) {
    destinatario = partes.find((p) => pareceNombre(p) && p !== direccion) ?? '';
  }
  if (!destinatario) {
    const inicio = texto.match(/^([A-ZÁÉÍÓÚÑ][\wáéíóúñ'.-]*(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ'.-]*){0,3})\b/);
    if (inicio && pareceNombre(inicio[1])) destinatario = inicio[1];
  }

  // Las notas son lo que sobra: referencias, horarios, «portón azul». A cada
  // fragmento se le quita el teléfono y el distrito antes de guardarlo, porque
  // esos ya tienen su campo.
  const notas = partes
    .filter((p) => p !== direccion && p !== destinatario)
    .filter((p) => !pareceDireccion(p) && !pareceNombre(p))
    .map((p) => sobrante(p, zona))
    .filter((p) => p.length >= 3)
    .join(' · ')
    .slice(0, 400);

  const faltantes = CAMPOS_PEDIDO.filter((campo) => {
    if (campo === 'destinatario') return destinatario === '';
    if (campo === 'telefono') return telefono === '';
    if (campo === 'direccion') return direccion === '';
    return zona === null;
  });

  return {
    original: texto,
    destinatario: destinatario.trim(),
    telefono,
    direccion,
    zona: zona ?? '',
    cobro: extraerCobro(texto),
    bultos: extraerBultos(texto),
    peso: extraerPeso(texto),
    notas,
    faltantes: [...faltantes],
  };
}

// ─────────────────────────────────────────────────────────────
// Separación en pedidos
// ─────────────────────────────────────────────────────────────
/**
 * Quita la marca de tiempo y el remitente que WhatsApp pone al copiar.
 *
 * Solo se quita el «Nombre: » cuando venía precedido de una marca de tiempo: sin
 * esa condición, un mensaje como «Ref: portón azul» perdería su prefijo.
 */
function limpiarLinea(linea: string): string {
  const conMarca = linea.match(
    /^\s*\[?\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?\]?\s*[-–—]?\s*(.*)$/i,
  );

  if (!conMarca) return linea.trim();

  return conMarca[1].replace(/^[^:]{1,45}:\s+/, '').trim();
}

/** Una línea que solo trae un teléfono nunca empieza un pedido: lo completa. */
function esSoloTelefono(linea: string): boolean {
  return /^[\s()+\d.\-]+$/.test(linea) && (MOVIL.test(linea) || FIJO.test(linea));
}

/**
 * Decide si una línea arranca un pedido nuevo.
 *
 * Es la parte delicada. Las reglas, por orden:
 *
 *  1. Un teléfono suelto continúa el pedido anterior (es el típico número escrito
 *     en su propia línea).
 *  2. Una línea con teléfono y algo más arranca un pedido: casi siempre es
 *     «Nombre - dirección - teléfono» de un tirón.
 *  3. Una línea con dirección arranca un pedido **si el bloque anterior ya tenía
 *     dirección**; si no, la estaba completando.
 *  4. Un nombre suelto arranca un pedido si el bloque anterior ya tiene nombre y
 *     dirección. Es el caso de varios pedidos seguidos, uno por línea.
 *  5. Todo lo demás («cobrar 50», «Ref: portón azul») continúa el bloque.
 */
function arrancaPedido(linea: string, bloqueActual: string): boolean {
  if (bloqueActual.trim() === '') return true;
  if (esSoloTelefono(linea)) return false;

  const tieneTelefono = MOVIL.test(linea) || FIJO.test(linea);
  if (tieneTelefono) return true;

  const tieneDireccion = pareceDireccion(linea);
  const anteriorTieneDireccion = pareceDireccion(bloqueActual);

  if (tieneDireccion) return anteriorTieneDireccion;

  if (pareceNombre(linea)) {
    const anterior = analizarBloque(bloqueActual);
    return anterior.destinatario !== '' && anterior.direccion !== '';
  }

  return false;
}

/**
 * Analiza una conversación entera y devuelve los pedidos que cree reconocer.
 *
 * Descarta los bloques que no tienen ni dirección ni teléfono: suelen ser los
 * saludos y las despedidas del chat, y colarlos solo hace ruido en la revisión.
 */
export function analizarChat(texto: string): PedidoPropuesto[] {
  const lineas = texto
    .split(/\r?\n/)
    .map(limpiarLinea)
    .filter((l) => l.length > 0);

  const bloques: string[] = [];
  for (const linea of lineas) {
    if (arrancaPedido(linea, bloques[bloques.length - 1] ?? '')) bloques.push(linea);
    else bloques[bloques.length - 1] += ` ${linea}`;
  }

  return bloques
    .map(analizarBloque)
    .filter((p) => p.direccion !== '' || p.telefono !== '');
}
