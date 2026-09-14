'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { all, escalar, get, run, transaccion } from '@/db/client';
import { empresa, parametros } from '@/config/empresa';
import { requerirParadaPropia, requerirPermiso } from '@/lib/auth/sesion';
import { aCoordenada, aNumero, aTexto } from '@/lib/formulario';
import { aISOCompleto, hoyISO } from '@/lib/format';
import { optimizarRuta } from '@/lib/rutas/optimizar';
import { coordenadaEnZona, direccionFalsa, zonaPorNombre } from '@/lib/zonas';

/**
 * Acciones de servidor del módulo de despachos.
 *
 * Cubren el ciclo completo de una hoja de ruta: crearla, asignarle recursos,
 * iniciarla, resolver cada parada (entrega o novedad) y cerrarla. Todas las
 * mutaciones que tocan varias tablas van dentro de `transaccion()` para que el
 * avance sea atómico: si algo falla, no queda una ruta a medias.
 */

// ─────────────────────────────────────────────────────────────
// Utilidades de formulario
// ─────────────────────────────────────────────────────────────
function horaCorta(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Tamaño máximo que se acepta de una foto. Debe caber en el límite del cuerpo. */
const TAMANO_MAXIMO_FOTO = 6 * 1024 * 1024;

interface FotoPreparada {
  datos: Uint8Array;
  tipoMime: string;
  tamano: number;
  lat: number | null;
  lng: number | null;
}

/**
 * Valida y prepara la foto que llega con la entrega.
 *
 * El navegador ya la ha reducido a un JPEG pequeño (ver `FotoEntrega`), pero eso
 * es una comodidad, no una garantía: cualquiera puede enviar el formulario a
 * mano. Aquí se comprueba el tipo, el tamaño y que no venga vacía. Lo que no
 * pase el filtro se descarta sin más: la entrega se registra igual, solo que sin
 * foto.
 */
async function prepararFoto(
  valor: FormDataEntryValue | null,
  lat: number | null,
  lng: number | null,
): Promise<FotoPreparada | null> {
  if (!(valor instanceof File) || valor.size === 0) return null;
  if (!valor.type.startsWith('image/')) return null;
  if (valor.size > TAMANO_MAXIMO_FOTO) return null;

  // Leer el archivo no debería fallar, pero si el cuerpo llega cortado es mejor
  // registrar la entrega sin foto que perderla entera.
  try {
    const datos = new Uint8Array(await valor.arrayBuffer());
    if (datos.byteLength === 0) return null;
    return { datos, tipoMime: valor.type, tamano: datos.byteLength, lat, lng };
  } catch {
    return null;
  }
}

function refrescar(rutaId?: number | null): void {
  revalidatePath('/despachos');
  revalidatePath('/');
  revalidatePath('/rastreo');
  // La vista de campo del conductor se alimenta de las mismas paradas.
  revalidatePath('/mi-ruta');
  if (rutaId) revalidatePath(`/despachos/${rutaId}`);
}

/**
 * Pasa la primera parada pendiente a `en_camino` y sus envíos a `en_reparto`.
 * Es el avance natural después de entregar la parada anterior.
 */
async function avanzarSiguienteParada(rutaId: number): Promise<void> {
  await run(
    `UPDATE paradas SET estado = 'en_camino'
     WHERE ruta_id = $1 AND estado = 'pendiente'
       AND orden = (SELECT MIN(orden) FROM paradas WHERE ruta_id = $2 AND estado = 'pendiente')`,
    rutaId,
    rutaId,
  );
  await run(
    `UPDATE envios SET estado = 'en_reparto'
     WHERE estado = 'pendiente'
       AND parada_id IN (SELECT id FROM paradas WHERE ruta_id = $1 AND estado = 'en_camino')`,
    rutaId,
  );
}

// ─────────────────────────────────────────────────────────────
// Creación de un despacho
// ─────────────────────────────────────────────────────────────
/**
 * Crea una hoja de ruta con sus paradas y un envío por parada, en estado
 * planificado. Las coordenadas se generan dentro del área de la zona elegida.
 */
export async function crearDespacho(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const fecha = aTexto(formData.get('fecha')) ?? hoyISO();
  const nombreZona = aTexto(formData.get('zona'));
  const unidadId = aNumero(formData.get('unidadId'));
  const conductorId = aNumero(formData.get('conductorId'));
  const clienteId = aNumero(formData.get('clienteId'));
  const numParadas = Math.min(12, Math.max(1, aNumero(formData.get('numParadas')) ?? 8));
  const notas = aTexto(formData.get('notas'));

  const zona = nombreZona ? zonaPorNombre(nombreZona) : undefined;
  if (!zona || !clienteId) return;

  const tarifa = await get<{ tarifa_base: number; tarifa_kg: number; nombre: string }>(
    'SELECT tarifa_base, tarifa_kg, nombre FROM clientes WHERE id = $1',
    clienteId,
  );
  if (!tarifa) return;

  const totalRutas = (await escalar<number>('SELECT COUNT(*) FROM rutas')) ?? 0;
  const codigo = `RUT-${fecha.replace(/-/g, '')}-${String(Number(totalRutas) + 1).padStart(4, '0')}`;

  const unidad = unidadId
    ? await get<{ km_actual: number }>('SELECT km_actual FROM unidades WHERE id = $1', unidadId)
    : null;

  await transaccion(async () => {
    const { id: rutaId } = await run(
      `INSERT INTO rutas (codigo, fecha, zona, unidad_id, conductor_id, estado, km_inicial, hora_salida, notas)
       VALUES ($1,$2,$3,$4,$5,'planificado',$6,$7,$8) RETURNING id`,
      codigo,
      fecha,
      zona.nombre,
      unidadId,
      conductorId,
      unidad?.km_actual ?? null,
      '07:00',
      notas,
    );

    // Las paradas se generan y luego se ordenan con la heurística del vecino más
    // cercano para que la ruta no quede en zigzag.
    const puntos = Array.from({ length: numParadas }, () => {
      const c = coordenadaEnZona(zona);
      return { ...c, direccion: direccionFalsa() };
    });
    puntos.sort((a, b) => b.lat - a.lat);

    let horaMinutos = 7 * 60 + 30;

    for (let i = 0; i < puntos.length; i++) {
      const punto = puntos[i];
      horaMinutos += 25 + Math.floor(Math.random() * 25);
      const horaEstimada = `${String(Math.floor(horaMinutos / 60) % 24).padStart(2, '0')}:${String(
        horaMinutos % 60,
      ).padStart(2, '0')}`;

      const { id: paradaId } = await run(
        `INSERT INTO paradas (ruta_id, orden, direccion, ciudad, zona, lat, lng, estado, hora_estimada)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente',$8) RETURNING id`,
        rutaId,
        i + 1,
        punto.direccion,
        empresa.ciudad,
        zona.nombre,
        punto.lat,
        punto.lng,
        horaEstimada,
      );

      const peso = Number((0.5 + Math.random() * 12).toFixed(2));
      const flete = Math.round(tarifa.tarifa_base + tarifa.tarifa_kg * peso);

      await run(
        `INSERT INTO envios (guia, cliente_id, ruta_id, parada_id, remitente, destinatario,
           destinatario_tel, direccion, ciudad, zona, peso_kg, volumen_m3, valor_declarado,
           flete, estado, fecha_compromiso, origen, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, 'pendiente', $15, 'ruta', $16)`,
        `TR-${fecha.replace(/-/g, '')}-${String(Date.now()).slice(-6)}${i}`,
        clienteId,
        rutaId,
        paradaId,
        tarifa.nombre,
        'Destinatario por confirmar',
        null,
        punto.direccion,
        empresa.ciudad,
        zona.nombre,
        peso,
        Number((peso / 250).toFixed(3)),
        Math.round(flete * 2),
        flete,
        fecha,
        aISOCompleto(new Date()),
      );
    }
  });

  refrescar();
  redirect('/despachos');
}

// ─────────────────────────────────────────────────────────────
// Asignación de recursos y ciclo de vida de la ruta
// ─────────────────────────────────────────────────────────────
/** Cambia la unidad y el conductor asignados a una ruta planificada. */
export async function reasignarRecursos(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const rutaId = aNumero(formData.get('rutaId'));
  if (!rutaId) return;

  const unidadId = aNumero(formData.get('unidadId'));
  const conductorId = aNumero(formData.get('conductorId'));

  const ruta = await get<{ estado: string; unidad_id: number | null }>(
    'SELECT estado, unidad_id FROM rutas WHERE id = $1',
    rutaId,
  );
  if (!ruta || ruta.estado === 'completado' || ruta.estado === 'cancelado') return;

  await transaccion(async () => {
    // Liberar la unidad anterior si ya no queda ninguna ruta activa con ella.
    if (ruta.unidad_id && ruta.unidad_id !== unidadId) {
      const enUso = await escalar<number>(
        "SELECT COUNT(*) FROM rutas WHERE unidad_id = $1 AND estado = 'en_curso'",
        ruta.unidad_id,
      );
      if (Number(enUso ?? 0) === 0) {
        await run("UPDATE unidades SET estado = 'disponible' WHERE id = $1 AND estado = 'en_ruta'", ruta.unidad_id);
      }
    }

    await run('UPDATE rutas SET unidad_id = $1, conductor_id = $2 WHERE id = $3', unidadId, conductorId, rutaId);

    // Si la ruta ya está en curso, la nueva unidad pasa a estar en ruta.
    if (ruta.estado === 'en_curso' && unidadId) {
      await run("UPDATE unidades SET estado = 'en_ruta' WHERE id = $1", unidadId);
    }
  });

  refrescar(rutaId);
}

/** Arranca un despacho planificado. */
export async function iniciarRuta(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const rutaId = aNumero(formData.get('rutaId'));
  if (!rutaId) return;

  await transaccion(async () => {
    const ruta = await get<{ unidad_id: number | null; hora_salida: string | null }>(
      'SELECT unidad_id, hora_salida FROM rutas WHERE id = $1 AND estado = $2',
      rutaId,
      'planificado',
    );
    if (!ruta) return;

    await run(
      `UPDATE rutas SET estado = 'en_curso', hora_salida = COALESCE(hora_salida, $1) WHERE id = $2`,
      horaCorta(),
      rutaId,
    );
    if (ruta.unidad_id) {
      await run("UPDATE unidades SET estado = 'en_ruta' WHERE id = $1", ruta.unidad_id);
    }
    await avanzarSiguienteParada(rutaId);
  });

  refrescar(rutaId);
}

/** Cierra una ruta en curso y libera su unidad. */
export async function completarRuta(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const rutaId = aNumero(formData.get('rutaId'));
  if (!rutaId) return;

  await transaccion(async () => {
    const ruta = await get<{ unidad_id: number | null; km_inicial: number | null }>(
      'SELECT unidad_id, km_inicial FROM rutas WHERE id = $1',
      rutaId,
    );
    if (!ruta) return;

    const pendientes = await escalar<number>(
      "SELECT COUNT(*) FROM paradas WHERE ruta_id = $1 AND estado IN ('pendiente','en_camino')",
      rutaId,
    );
    // No se cierra una ruta con paradas sin resolver: quedarían envíos huérfanos.
    if (Number(pendientes ?? 0) > 0) return;

    const kmRecorrido = Number((25 + Math.random() * 90).toFixed(1));
    await run(
      `UPDATE rutas SET estado = 'completado', hora_llegada = $1, km_final = $2
       WHERE id = $3 AND estado = 'en_curso'`,
      horaCorta(),
      ruta.km_inicial != null ? Math.round(ruta.km_inicial + kmRecorrido) : null,
      rutaId,
    );

    if (ruta.unidad_id) {
      const enUso = await escalar<number>(
        "SELECT COUNT(*) FROM rutas WHERE unidad_id = $1 AND estado = 'en_curso' AND id <> $2",
        ruta.unidad_id,
        rutaId,
      );
      if (Number(enUso ?? 0) === 0) {
        await run("UPDATE unidades SET estado = 'disponible' WHERE id = $1 AND estado = 'en_ruta'", ruta.unidad_id);
      }
    }
  });

  refrescar(rutaId);
}

/**
 * Reordena las paradas que quedan pendientes para acortar el recorrido.
 *
 * Solo toca las paradas sin resolver: las ya entregadas o fallidas conservan su
 * posición, porque son historia y no se pueden reordenar. Las pendientes se
 * recolocan a partir de la última posición conocida del vehículo, que es lo
 * útil: «dado dónde estás ahora, en qué orden hago el resto».
 *
 * El motor lo elige `optimizarRuta`: VROOM si está configurado (distancias por
 * carretera) o el 2-opt local si no. El resultado se comunica en la URL para que
 * la página pueda decir cuál se usó y cuánto se ahorró.
 */
export async function reordenarParadas(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const rutaId = aNumero(formData.get('rutaId'));
  if (!rutaId) return;

  const ruta = await get<{ unidad_id: number | null; estado: string }>(
    'SELECT unidad_id, estado FROM rutas WHERE id = $1',
    rutaId,
  );
  if (!ruta || ruta.estado === 'completado' || ruta.estado === 'cancelado') return;

  const pendientes = await all<{ id: number; lat: number; lng: number; peso_kg: number }>(
    `SELECT p.id, p.lat, p.lng,
            (SELECT COALESCE(SUM(e.peso_kg), 0) FROM envios e WHERE e.parada_id = p.id) AS peso_kg
     FROM paradas p
     WHERE p.ruta_id = $1 AND p.estado IN ('pendiente','en_camino')
     ORDER BY p.orden`,
    rutaId,
  );

  if (pendientes.length < 3) {
    redirect(`/despachos/${rutaId}?reorden=insuficientes`);
  }

  const resueltas = await all<{ id: number }>(
    `SELECT id FROM paradas
     WHERE ruta_id = $1 AND estado IN ('entregado','fallido')
     ORDER BY orden`,
    rutaId,
  );

  // Punto de partida: donde está el vehículo ahora mismo. Si no hay telemetría,
  // la última parada resuelta.
  let inicio: { lat: number; lng: number } | undefined;

  if (ruta.unidad_id !== null) {
    const ultima = await get<{ lat: number; lng: number }>(
      'SELECT lat, lng FROM posiciones WHERE unidad_id = $1 ORDER BY id DESC LIMIT 1',
      ruta.unidad_id,
    );
    if (ultima) inicio = { lat: Number(ultima.lat), lng: Number(ultima.lng) };
  }

  if (!inicio && resueltas.length > 0) {
    const ultimaResuelta = await get<{ lat: number; lng: number }>(
      'SELECT lat, lng FROM paradas WHERE id = $1',
      resueltas[resueltas.length - 1].id,
    );
    if (ultimaResuelta) {
      inicio = { lat: Number(ultimaResuelta.lat), lng: Number(ultimaResuelta.lng) };
    }
  }

  const capacidad = ruta.unidad_id
    ? await escalar<number>('SELECT capacidad_kg FROM unidades WHERE id = $1', ruta.unidad_id)
    : null;

  const resultado = await optimizarRuta(
    pendientes.map((p) => ({
      id: p.id,
      lat: Number(p.lat),
      lng: Number(p.lng),
      pesoKg: Number(p.peso_kg),
    })),
    {
      inicio,
      capacidadKg: capacidad ? Number(capacidad) : undefined,
    },
  );

  // Las resueltas se quedan delante, en su orden; las pendientes se renumeran
  // detrás. No hay restricción de unicidad sobre (ruta_id, orden), así que la
  // renumeración no choca a mitad de camino.
  await transaccion(async () => {
    for (let i = 0; i < resultado.orden.length; i++) {
      await run(
        'UPDATE paradas SET orden = $1 WHERE id = $2',
        resueltas.length + i + 1,
        resultado.orden[i],
      );
    }
  });

  const parametros = new URLSearchParams({
    reorden: resultado.motor,
    mejora: resultado.mejoraPct.toFixed(0),
    km: (resultado.distanciaMetros / 1000).toFixed(1),
  });

  refrescar(rutaId);
  redirect(`/despachos/${rutaId}?${parametros.toString()}`);
}

/** Cancela un despacho planificado. */
export async function cancelarRuta(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const rutaId = aNumero(formData.get('rutaId'));
  if (!rutaId) return;

  await run(
    "UPDATE rutas SET estado = 'cancelado' WHERE id = $1 AND estado IN ('planificado','en_curso')",
    rutaId,
  );
  refrescar(rutaId);
}

// ─────────────────────────────────────────────────────────────
// Prueba de entrega (POD)
// ─────────────────────────────────────────────────────────────
/**
 * Registra la entrega de una parada: marca la parada y todos sus envíos como
 * entregados, guarda el nombre de quien recibe, adjunta la foto de prueba de
 * entrega y avanza a la siguiente parada.
 */
export async function marcarParadaEntregada(formData: FormData): Promise<void> {
  const paradaId = aNumero(formData.get('paradaId'));
  if (!paradaId) return;

  // Permiso para entregar y, si es un conductor, que la parada sea de su ruta.
  // Devuelve la sesión, que hace falta para dejar constancia de quién sube la foto.
  const sesion = await requerirParadaPropia(paradaId);

  const receptor = aTexto(formData.get('receptor'));
  const parada = await get<{ ruta_id: number }>('SELECT ruta_id FROM paradas WHERE id = $1', paradaId);
  if (!parada) return;

  // La foto se prepara ANTES de abrir la transacción: decodificar la imagen es
  // lento y no hay razón para tener la base bloqueada mientras tanto.
  const foto = await prepararFoto(
    formData.get('foto'),
    aCoordenada(formData.get('fotoLat')),
    aCoordenada(formData.get('fotoLng')),
  );

  // Si la empresa exige la foto como prueba, sin ella no hay entrega. Se
  // comprueba aquí, en el servidor: ocultar el botón en la interfaz no protege
  // nada, porque el formulario se puede enviar a mano.
  if (parametros.exigirFotoEnEntrega && !foto) return;

  await transaccion(async () => {
    const ahora = aISOCompleto(new Date());

    await run(
      `UPDATE paradas SET estado = 'entregado', hora_real = $1 WHERE id = $2 AND estado <> 'entregado'`,
      horaCorta(),
      paradaId,
    );

    // Se marca el intento y, si el envío venía con novedad, esta queda resuelta.
    await run(
      `UPDATE envios
       SET estado = 'entregado', fecha_entrega = $1, receptor = COALESCE($2, destinatario), intentos = intentos + 1
       WHERE parada_id = $3 AND estado IN ('pendiente','en_reparto','novedad')`,
      ahora,
      receptor,
      paradaId,
    );
    await run(
      `UPDATE novedades SET resuelto = 1
       WHERE envio_id IN (SELECT id FROM envios WHERE parada_id = $1)`,
      paradaId,
    );

    // La foto va en la misma transacción que la entrega: o quedan las dos, o no
    // queda ninguna. Una entrega sin su prueba, o una foto de una entrega que no
    // se llegó a registrar, serían peores que un fallo visible.
    if (foto) {
      await run(
        `INSERT INTO fotos_entrega
           (parada_id, ruta_id, datos, tipo_mime, tamano_bytes, lat, lng, subida_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        paradaId,
        parada.ruta_id,
        foto.datos,
        foto.tipoMime,
        foto.tamano,
        foto.lat,
        foto.lng,
        sesion.usuarioId,
      );
    }

    await avanzarSiguienteParada(parada.ruta_id);
  });

  refrescar(parada.ruta_id);
}

/**
 * Registra un intento fallido: deja la parada como fallida y abre una novedad
 * por cada envío afectado.
 */
export async function registrarNovedad(formData: FormData): Promise<void> {
  const paradaId = aNumero(formData.get('paradaId'));
  if (!paradaId) return;

  await requerirParadaPropia(paradaId);

  const tipo = aTexto(formData.get('tipo')) ?? 'ausente';
  const descripcion = aTexto(formData.get('descripcion'));
  const parada = await get<{ ruta_id: number }>('SELECT ruta_id FROM paradas WHERE id = $1', paradaId);
  if (!parada) return;

  const tiposValidos = ['ausente', 'direccion_errada', 'rechazado', 'danado', 'reprogramado', 'otro'];
  if (!tiposValidos.includes(tipo)) return;

  await transaccion(async () => {
    const ahora = aISOCompleto(new Date());

    await run(
      `UPDATE paradas SET estado = 'fallido', hora_real = $1 WHERE id = $2 AND estado <> 'entregado'`,
      horaCorta(),
      paradaId,
    );
    await run(
      `UPDATE envios SET estado = 'novedad', intentos = intentos + 1
       WHERE parada_id = $1 AND estado IN ('pendiente','en_reparto')`,
      paradaId,
    );

    const envios = await all<{ id: number }>('SELECT id FROM envios WHERE parada_id = $1', paradaId);
    for (const envio of envios) {
      await run(
        'INSERT INTO novedades (envio_id, tipo, descripcion, fecha, resuelto) VALUES ($1,$2,$3,$4,0)',
        envio.id,
        tipo,
        descripcion,
        ahora,
      );
    }

    await avanzarSiguienteParada(parada.ruta_id);
  });

  refrescar(parada.ruta_id);
}

/** Reabre una parada fallida para un nuevo intento de entrega. */
export async function reintentarParada(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const paradaId = aNumero(formData.get('paradaId'));
  if (!paradaId) return;

  const parada = await get<{ ruta_id: number }>('SELECT ruta_id FROM paradas WHERE id = $1', paradaId);
  if (!parada) return;

  await transaccion(async () => {
    await run("UPDATE paradas SET estado = 'en_camino', hora_real = NULL WHERE id = $1", paradaId);
    await run(
      `UPDATE envios SET estado = 'en_reparto'
       WHERE parada_id = $1 AND estado IN ('novedad','devuelto')`,
      paradaId,
    );
    await run(
      `UPDATE novedades SET resuelto = 1
       WHERE envio_id IN (SELECT id FROM envios WHERE parada_id = $1)`,
      paradaId,
    );
  });

  refrescar(parada.ruta_id);
}

/** Marca un envío concreto como devuelto al remitente. */
export async function devolverEnvio(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');

  const envioId = aNumero(formData.get('envioId'));
  if (!envioId) return;

  const envio = await get<{ ruta_id: number | null }>('SELECT ruta_id FROM envios WHERE id = $1', envioId);
  if (!envio) return;

  await run("UPDATE envios SET estado = 'devuelto' WHERE id = $1 AND estado <> 'entregado'", envioId);
  refrescar(envio.ruta_id);
}
