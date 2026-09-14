'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { empresa } from '@/config/empresa';
import { all, get, run, transaccion } from '@/db/client';
import { siguienteNumeroDeGuia } from '@/db/queries/pedidos';
import type { OrigenPedido } from '@/db/tipos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aNumero, aTexto, hoyTexto } from '@/lib/formulario';
import { coordenadaEnZona, zonaPorNombre } from '@/lib/zonas';

/**
 * Acciones del buzón de pedidos.
 *
 * Un pedido es un envío **sin ruta**: entra por aquí, espera, y más tarde se
 * planifica. Ese estado intermedio es justo lo que faltaba: antes los envíos solo
 * podían nacer ya dentro de un despacho, así que el trabajo de recibirlos no
 * tenía sitio en la aplicación.
 *
 * Todas las altas van dentro de una transacción: un lote de veinte pedidos o se
 * guarda entero o no se guarda, porque media conversación importada es peor que
 * ninguna.
 */

/** Máximo de pedidos que se aceptan de una vez. Frena un pegado accidental enorme. */
const MAXIMO_LOTE = 100;

/** Redondeo a dos decimales, que es como se manejan soles y kilos. */
function red(n: number, decimales = 2): number {
  return Number(n.toFixed(decimales));
}

interface PedidoEntrante {
  destinatario: string;
  telefono: string;
  direccion: string;
  zona: string;
  cobro: number;
  bultos: number;
  peso: number;
  notas: string;
}

/**
 * Valida un pedido que llega del navegador.
 *
 * La pantalla de revisión ya comprueba lo mismo, y aun así hay que repetirlo
 * aquí: el formulario se puede enviar a mano y el cuerpo es un JSON que cualquiera
 * puede escribir. Lo que llegue mal se descarta; no se inventa nada.
 */
function normalizarEntrante(bruto: unknown): PedidoEntrante | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const p = bruto as Record<string, unknown>;

  const texto = (v: unknown, max = 200): string =>
    typeof v === 'string' ? v.trim().slice(0, max) : '';

  const numero = (v: unknown, max: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
  };

  const destinatario = texto(p.destinatario, 120);
  const direccion = texto(p.direccion, 200);
  const zona = texto(p.zona, 60);

  // Sin a quién ni dónde, no es un pedido.
  if (destinatario === '' || direccion === '') return null;

  return {
    destinatario,
    telefono: texto(p.telefono, 30),
    direccion,
    zona,
    cobro: red(numero(p.cobro, 100_000)),
    bultos: Math.max(1, Math.round(numero(p.bultos, 99)) || 1),
    peso: red(numero(p.peso, 999)),
    notas: texto(p.notas, 400),
  };
}

/**
 * Da de alta un lote de pedidos para un cliente.
 *
 * Las guías se numeran de forma correlativa dentro del día. El contador se lee una
 * sola vez y se incrementa en memoria: preguntar por cada pedido sería absurdo y,
 * dentro de la transacción, todas las filas ven el mismo estado inicial.
 */
async function insertarPedidos(
  pedidos: PedidoEntrante[],
  clienteId: number,
  fechaCompromiso: string | null,
  origen: OrigenPedido,
  usuarioId: number,
): Promise<number> {
  const cliente = await get<{ nombre: string; tarifa_base: number; tarifa_kg: number }>(
    'SELECT nombre, tarifa_base, tarifa_kg FROM clientes WHERE id = $1',
    clienteId,
  );
  if (!cliente) return 0;

  const prefijo = `TR-${hoyTexto().replace(/-/g, '')}-`;
  let contador = await siguienteNumeroDeGuia(prefijo);
  let creados = 0;

  await transaccion(async () => {
    for (const p of pedidos) {
      const guia = `${prefijo}${String(contador++).padStart(5, '0')}`;

      // El flete sale de la tarifa del cliente. Si el mensaje no decía el peso, se
      // usa el mínimo facturable; el peso real se ajusta al pesar el paquete.
      const peso = p.peso > 0 ? p.peso : 0.5;
      const flete = red(cliente.tarifa_base + cliente.tarifa_kg * peso);

      await run(
        `INSERT INTO envios
           (guia, cliente_id, remitente, destinatario, destinatario_tel, direccion, ciudad,
            zona, peso_kg, volumen_m3, valor_declarado, flete, estado, fecha_compromiso,
            origen, cobro_entrega, bultos, notas, registrado_por, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pendiente',$13,$14,$15,$16,$17,$18,$19)`,
        guia,
        clienteId,
        cliente.nombre,
        p.destinatario,
        p.telefono || null,
        p.direccion,
        empresa.ciudad,
        p.zona || null,
        peso,
        red(peso / 250, 3),
        0,
        flete,
        fechaCompromiso,
        origen,
        p.cobro,
        p.bultos,
        p.notas || null,
        usuarioId,
        `${hoyTexto()} 00:00:00`,
      );

      creados++;
    }
  });

  return creados;
}

function refrescarBuzon(): void {
  revalidatePath('/pedidos');
  revalidatePath('/despachos');
  revalidatePath('/');
}

// ─────────────────────────────────────────────────────────────
// Alta de pedidos
// ─────────────────────────────────────────────────────────────
/** Alta de un pedido tecleado a mano. */
export async function crearPedido(formData: FormData): Promise<void> {
  const sesion = await requerirPermiso('pedidos', 'editar');

  const clienteId = aNumero(formData.get('clienteId'));
  if (!clienteId) redirect('/pedidos/nuevo?error=cliente');

  const entrante = normalizarEntrante({
    destinatario: formData.get('destinatario'),
    telefono: formData.get('telefono'),
    direccion: formData.get('direccion'),
    zona: formData.get('zona'),
    cobro: formData.get('cobro'),
    bultos: formData.get('bultos'),
    peso: formData.get('peso'),
    notas: formData.get('notas'),
  });

  if (!entrante) redirect('/pedidos/nuevo?error=datos');

  const creados = await insertarPedidos(
    [entrante],
    clienteId,
    aTexto(formData.get('fechaCompromiso')),
    'manual',
    sesion.usuarioId,
  );

  if (creados === 0) redirect('/pedidos/nuevo?error=cliente');

  refrescarBuzon();
  redirect('/pedidos?creado=1');
}

/**
 * Alta de un lote revisado que viene de pegar un chat.
 *
 * Los pedidos llegan como un JSON en un campo oculto. La pantalla ya los ha
 * validado y los ha enseñado para corregirlos, pero eso es comodidad: aquí se
 * vuelven a validar uno por uno.
 */
export async function crearPedidosDelChat(formData: FormData): Promise<void> {
  const sesion = await requerirPermiso('pedidos', 'editar');

  const clienteId = aNumero(formData.get('clienteId'));
  if (!clienteId) redirect('/pedidos/pegar?error=cliente');

  let brutos: unknown;
  try {
    brutos = JSON.parse(String(formData.get('pedidos') ?? '[]'));
  } catch {
    redirect('/pedidos/pegar?error=json');
  }

  if (!Array.isArray(brutos) || brutos.length === 0) {
    redirect('/pedidos/pegar?error=vacio');
  }

  const pedidos = brutos
    .slice(0, MAXIMO_LOTE)
    .map(normalizarEntrante)
    .filter((p): p is PedidoEntrante => p !== null);

  if (pedidos.length === 0) redirect('/pedidos/pegar?error=datos');

  const creados = await insertarPedidos(
    pedidos,
    clienteId,
    aTexto(formData.get('fechaCompromiso')),
    'whatsapp',
    sesion.usuarioId,
  );

  if (creados === 0) redirect('/pedidos/pegar?error=cliente');

  refrescarBuzon();
  redirect(`/pedidos?creados=${creados}`);
}

// ─────────────────────────────────────────────────────────────
// Planificación: meter pedidos en una ruta
// ─────────────────────────────────────────────────────────────
/**
 * Mete los pedidos seleccionados en un despacho.
 *
 * Los pedidos que van **a la misma dirección** comparten una sola parada: en la
 * calle son un único timbrazo con dos paquetes, no dos visitas. La clave de
 * agrupación es zona + dirección tal cual, así que dos formas distintas de
 * escribir la misma calle no se unen; el despachador puede arreglarlo después.
 */
export async function asignarARuta(formData: FormData): Promise<void> {
  await requerirPermiso('pedidos', 'editar');
  // Además de tocar pedidos, esto crea paradas en una hoja de ruta, así que se
  // exige también el permiso de despachos.
  await requerirPermiso('despachos', 'editar');

  const rutaId = aNumero(formData.get('rutaId'));
  if (!rutaId) redirect('/pedidos?error=ruta');

  const ids = formData
    .getAll('pedidoId')
    .map((v) => aNumero(v))
    .filter((n): n is number => n !== null);

  if (ids.length === 0) redirect('/pedidos?error=seleccion');

  const ruta = await get<{ id: number; estado: string; zona: string; codigo: string }>(
    'SELECT id, estado, zona, codigo FROM rutas WHERE id = $1',
    rutaId,
  );
  if (!ruta) redirect('/pedidos?error=ruta');
  if (ruta.estado !== 'planificado' && ruta.estado !== 'en_curso') {
    redirect('/pedidos?error=ruta-cerrada');
  }

  const marcadores = ids.map((_, i) => `$${i + 1}`).join(',');
  const pedidos = await all<{
    id: number;
    direccion: string | null;
    zona: string | null;
    destinatario: string;
  }>(
    `SELECT id, direccion, zona, destinatario FROM envios
     WHERE id IN (${marcadores}) AND ruta_id IS NULL`,
    ...ids,
  );

  if (pedidos.length === 0) redirect('/pedidos?error=seleccion');

  // Agrupación por dirección, conservando el orden de llegada.
  const grupos = new Map<string, typeof pedidos>();
  for (const pedido of pedidos) {
    const clave = `${pedido.zona ?? ''}|${pedido.direccion ?? ''}`;
    const lista = grupos.get(clave) ?? [];
    lista.push(pedido);
    grupos.set(clave, lista);
  }

  let paradas = 0;

  await transaccion(async () => {
    const maximo = await get<{ ultimo: number | null }>(
      'SELECT MAX(orden) AS ultimo FROM paradas WHERE ruta_id = $1',
      rutaId,
    );
    let orden = Number(maximo?.ultimo ?? 0);

    for (const [clave, lista] of grupos) {
      const [zonaPedido, direccion] = clave.split('|');

      // La zona del pedido manda; si el mensaje no la traía, se usa la de la ruta.
      const zona = zonaPorNombre(zonaPedido) ?? zonaPorNombre(ruta.zona);
      const punto = zona
        ? coordenadaEnZona(zona)
        : { lat: -12.0464, lng: -77.0428 };

      orden++;

      const { id: paradaId } = await run(
        `INSERT INTO paradas (ruta_id, orden, direccion, ciudad, zona, lat, lng, estado, hora_estimada)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente',NULL) RETURNING id`,
        rutaId,
        orden,
        direccion || 'Sin dirección',
        empresa.ciudad,
        zona?.nombre ?? zonaPedido ?? null,
        punto.lat,
        punto.lng,
      );

      const idsGrupo = lista.map((p) => p.id);
      const marcadoresGrupo = idsGrupo.map((_, i) => `$${i + 3}`).join(',');

      await run(
        `UPDATE envios SET ruta_id = $1, parada_id = $2 WHERE id IN (${marcadoresGrupo})`,
        rutaId,
        paradaId,
        ...idsGrupo,
      );

      paradas++;
    }
  });

  refrescarBuzon();
  revalidatePath(`/despachos/${rutaId}`);
  redirect(`/pedidos?asignados=${pedidos.length}&paradas=${paradas}&ruta=${rutaId}`);
}

// ─────────────────────────────────────────────────────────────
// Correcciones
// ─────────────────────────────────────────────────────────────
/**
 * Borra un pedido que todavía no está en ninguna ruta.
 *
 * Es para los errores de tecleo y para lo que entra dos veces al pegar un chat.
 * Una vez planificado, un pedido ya es parte de una hoja de ruta y se corrige
 * desde despachos, no desde aquí.
 */
export async function descartarPedido(formData: FormData): Promise<void> {
  await requerirPermiso('pedidos', 'editar');

  const pedidoId = aNumero(formData.get('pedidoId'));
  if (!pedidoId) return;

  await run('DELETE FROM envios WHERE id = $1 AND ruta_id IS NULL', pedidoId);

  refrescarBuzon();
  redirect('/pedidos?descartado=1');
}
