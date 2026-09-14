import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BadgeEstado } from '@/components/ui/Badge';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCuerpo } from '@/components/ui/Card';
import {
  IconoAlerta,
  IconoCaja,
  IconoCheck,
  IconoEquis,
  IconoMapa,
  IconoReloj,
  IconoRuta,
  IconoUbicacion,
} from '@/components/ui/Iconos';
import { Progreso } from '@/components/ui/Progreso';
import { Vacio } from '@/components/ui/Vacio';
import { FotoEntrega } from '@/components/entrega/FotoEntrega';
import { FotosDeParada, SinFoto } from '@/components/entrega/FotosDeParada';
import { CompartirUbicacion } from '@/components/ubicacion/CompartirUbicacion';
import { parametros } from '@/config/empresa';
import { get } from '@/db/client';
import {
  fotosDeRuta,
  obtenerRuta,
  paradasDeRuta,
  primeraRutaEnCurso,
  rutaEnCursoDeConductor,
  ultimaRuta,
  ultimaRutaDeConductor,
} from '@/db/queries/despachos';
import type { FotoEntregaDetallada, ParadaConEnvios, RutaResumen } from '@/db/tipos';
import { puedeCompartirUbicacion, puedeVerMiRuta } from '@/lib/auth/permisos';
import { requerirSesion } from '@/lib/auth/sesion';
import { entero, etiqueta, fecha, numero } from '@/lib/format';
import { distanciaMetros } from '@/lib/rutas/optimizar';
import { entregarParada, reportarNovedad } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mi ruta',
};

/**
 * «Mi ruta»: la pantalla que el conductor usa con el teléfono en la mano.
 *
 * Está diseñada para lo contrario que el resto del panel. Aquí no se consulta
 * nada: se ejecuta. Por eso
 *
 *  - la parada siguiente ocupa la parte alta, con la dirección en grande;
 *  - los botones miden 56 px de alto, que es lo que se acierta con el dedo y no
 *    con el ratón;
 *  - «navegar» y «llamar» delegan en las aplicaciones del teléfono, en vez de
 *    intentar dibujar un mapa propio dentro de la página;
 *  - el GPS se comparte desde la misma pantalla, sin obligar a ir a otra.
 *
 * La misma vista la puede abrir despacho o administración para ponerse en el
 * lugar del conductor; en ese caso se muestra la primera ruta en curso.
 */

/** Alto cómodo para pulsar en movimiento. */
const ALTO_BOTON = 'h-14';

const MOTIVOS_NOVEDAD = [
  'ausente',
  'direccion_errada',
  'rechazado',
  'danado',
  'reprogramado',
] as const;

/**
 * `tel:` no admite espacios ni guiones: el marcador del teléfono se queda con
 * los dígitos y, como mucho, con el `+` inicial.
 */
function enlaceTel(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, '')}`;
}

/** Abre la navegación del teléfono con la parada como destino. */
function enlaceNavegacion(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function formatearDistancia(metros: number): string {
  return metros < 1000
    ? `${Math.round(metros / 10) * 10} m`
    : `${numero(metros / 1000, 1)} km`;
}

export default async function PaginaMiRuta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirSesion();

  if (!puedeVerMiRuta(sesion)) {
    redirect('/sin-acceso?modulo=despachos');
  }

  const sp = await searchParams;
  const esConductor = sesion.rol === 'conductor';

  // Ruta a mostrar: la que se pida por la URL (para que despacho pueda mirar
  // cualquier ruta), si no la del conductor, y si no la primera en curso.
  const pedida = typeof sp.ruta === 'string' ? Number(sp.ruta) : NaN;
  let ruta: RutaResumen | null =
    Number.isFinite(pedida) && pedida > 0 ? await obtenerRuta(pedida) : null;

  if (ruta && esConductor && ruta.conductor_id !== sesion.conductorId) {
    // Un conductor no puede abrir la ruta de otro ni escribiendo la dirección.
    redirect('/sin-acceso?modulo=despachos');
  }

  if (!ruta) {
    ruta =
      esConductor && sesion.conductorId
        ? await rutaEnCursoDeConductor(sesion.conductorId)
        : await primeraRutaEnCurso();
  }

  // Si no hay nada abierto se enseña la última ruta, cerrada y sin botones. Los
  // datos de ejemplo no envejecen con el calendario, así que sin este respaldo la
  // pantalla aparecería vacía unos días después de generar la base.
  if (!ruta) {
    ruta =
      esConductor && sesion.conductorId
        ? await ultimaRutaDeConductor(sesion.conductorId)
        : await ultimaRuta();
  }

  if (!ruta) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Vacio
          titulo={esConductor ? 'No tienes una ruta asignada' : 'No hay ninguna ruta en curso'}
          mensaje={
            esConductor
              ? 'Cuando despacho te asigne una hoja de ruta aparecerá aquí con las paradas del día.'
              : 'Inicia una ruta desde Despachos para ver esta pantalla tal como la ve el conductor.'
          }
          icono={<IconoRuta width={22} height={22} />}
          accion={
            <Link
              href={esConductor ? '/despachos' : '/despachos?estado=en_curso'}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              {esConductor ? 'Ver mis despachos' : 'Ir a Despachos'}
            </Link>
          }
        />
      </div>
    );
  }

  const paradas = await paradasDeRuta(ruta.id);
  const fotos = await fotosDeRuta(ruta.id);

  // Las fotos se agrupan por parada para no recorrer la lista entera por cada una.
  const fotosPorParada = new Map<number, FotoEntregaDetallada[]>();
  for (const foto of fotos) {
    const lista = fotosPorParada.get(foto.parada_id) ?? [];
    lista.push(foto);
    fotosPorParada.set(foto.parada_id, lista);
  }

  const pendientes = paradas.filter(
    (p) => p.estado === 'pendiente' || p.estado === 'en_camino',
  );
  const entregadas = paradas.filter((p) => p.estado === 'entregado');
  const fallidas = paradas.filter((p) => p.estado === 'fallido');
  const resueltas = entregadas.length + fallidas.length;
  const progreso = paradas.length > 0 ? (resueltas / paradas.length) * 100 : 0;

  // Una ruta ya cerrada se consulta, no se trabaja. Sin esto, al abrir la app un
  // día sin ruta asignada el conductor podría seguir marcando entregas de un
  // reparto que despacho ya cerró.
  const rutaAbierta = ruta.estado === 'en_curso' || ruta.estado === 'planificado';
  const motivoSoloLectura = rutaAbierta
    ? null
    : `Esta ruta ya está ${etiqueta(ruta.estado).toLowerCase()}. Se puede consultar, pero no admite más entregas.`;

  // La parada en curso manda; si ninguna está marcada así, la primera pendiente.
  const siguiente =
    paradas.find((p) => p.estado === 'en_camino') ?? pendientes[0] ?? null;

  const bultos = paradas.reduce(
    (suma, p) => suma + p.envios.filter((e) => e.estado !== 'devuelto').length,
    0,
  );

  // Última posición conocida de la unidad, para decir a cuánto está la parada.
  const ultimaPosicion = ruta.unidad_id
    ? await get<{ lat: number; lng: number }>(
        `SELECT lat, lng FROM posiciones WHERE unidad_id = $1
         ORDER BY timestamp DESC LIMIT 1`,
        ruta.unidad_id,
      )
    : null;

  const distancia =
    ultimaPosicion && siguiente
      ? distanciaMetros(
          { lat: Number(ultimaPosicion.lat), lng: Number(ultimaPosicion.lng) },
          { lat: siguiente.lat, lng: siguiente.lng },
        )
      : null;

  // Datos que necesita el componente de GPS para ofrecer una posición de prueba.
  const destinoGps = siguiente
    ? { lat: siguiente.lat, lng: siguiente.lng, direccion: siguiente.direccion }
    : null;

  const motivoBloqueoGps = !ruta.unidad_id
    ? 'Esta hoja de ruta no tiene vehículo asignado, así que no hay dónde registrar la posición.'
    : null;

  // Solo se ofrece el bloque de GPS a quien puede reportar sobre esta ruta.
  const puedeReportarGps = puedeCompartirUbicacion(sesion);

  const acuse = acuseDe(sp);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {/* ── Cabecera: en qué ruta estoy y cuánto llevo ─────────── */}
      <header>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {fecha(ruta.fecha)} · Zona {ruta.zona}
          </p>
          <BadgeEstado estado={ruta.estado} texto={etiqueta(ruta.estado)} />
        </div>

        <h1 className="mt-1 text-xl font-semibold text-slate-100">
          Ruta {ruta.codigo}
          {ruta.placa ? <span className="text-slate-500"> · {ruta.placa}</span> : null}
        </h1>

        <div className="mt-2.5 flex items-center gap-3">
          <Progreso
            valor={progreso}
            className="flex-1"
            colorManual={progreso >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}
          />
          <span className="num shrink-0 text-xs text-slate-400">
            {entero(resueltas)}/{entero(paradas.length)} paradas
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">Entregadas</dt>
            <dd className="num text-lg font-semibold text-emerald-300">{entregadas.length}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">Por entregar</dt>
            <dd className="num text-lg font-semibold text-sky-300">{pendientes.length}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500">Con novedad</dt>
            <dd className="num text-lg font-semibold text-amber-300">{fallidas.length}</dd>
          </div>
        </dl>
      </header>

      {acuse ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm ${acuse.clase}`}
        >
          {acuse.icono}
          {acuse.texto}
        </p>
      ) : null}

      {!rutaAbierta ? (
        <p className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-3 text-xs text-slate-400">
          <IconoAlerta width={15} height={15} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            No hay ninguna ruta en curso, así que se muestra el último reparto:{' '}
            <span className="text-slate-300">
              {ruta.codigo} del {fecha(ruta.fecha)}
            </span>
            . Cuando despacho asigne la del día, aparecerá aquí con sus botones.
          </span>
        </p>
      ) : null}

      {/* ── La parada en curso, en grande ──────────────────────── */}
      {siguiente ? (
        <ParadaActual
          parada={siguiente}
          bultos={bultos}
          distancia={distancia}
          motivoSoloLectura={motivoSoloLectura}
          fotos={fotosPorParada.get(siguiente.id) ?? []}
        />
      ) : (
        <Card className="border-emerald-500/30">
          <CardCuerpo className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="rounded-full bg-emerald-500/15 p-3 text-emerald-300">
              <IconoCheck width={22} height={22} />
            </span>
            <p className="text-sm font-medium text-emerald-200">
              {paradas.length === 0 ? 'Esta ruta no tiene paradas' : 'Ruta completada'}
            </p>
            <p className="max-w-xs text-xs text-slate-400">
              {paradas.length === 0
                ? 'Avisa a despacho: la hoja de ruta se creó sin paradas.'
                : 'No queda ninguna parada por resolver. Avisa a despacho para que cierre la ruta.'}
            </p>
          </CardCuerpo>
        </Card>
      )}

      {/* ── Lo que queda por delante ───────────────────────────── */}
      {pendientes.filter((p) => p.id !== siguiente?.id).length > 0 ? (
        <Card>
          <CardCuerpo className="space-y-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Después ({pendientes.filter((p) => p.id !== siguiente?.id).length})
            </h2>
            <ul className="divide-y divide-slate-800">
              {pendientes
                .filter((p) => p.id !== siguiente?.id)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-400">
                      {p.orden}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-300">{p.direccion}</span>
                      <span className="block text-[11px] text-slate-500">
                        {p.zona ?? '—'}
                        {p.hora_estimada ? ` · antes de ${p.hora_estimada}` : ''}
                        {p.envios.length > 0
                          ? ` · ${entero(p.envios.length)} ${p.envios.length === 1 ? 'bulto' : 'bultos'}`
                          : ''}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </CardCuerpo>
        </Card>
      ) : null}

      {/* ── Historial del día ──────────────────────────────────── */}
      {resueltas > 0 ? (
        <details className="rounded-xl border border-slate-800 bg-slate-900/40">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-400 hover:text-slate-200">
            Resueltas hoy ({entero(resueltas)})
          </summary>
          <ul className="divide-y divide-slate-800 border-t border-slate-800 px-4">
            {[...entregadas, ...fallidas].map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                    p.estado === 'entregado'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {p.estado === 'entregado' ? (
                    <IconoCheck width={13} height={13} />
                  ) : (
                    <IconoEquis width={13} height={13} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-400">{p.direccion}</span>
                  <span className="block text-[11px] text-slate-500">
                    {etiqueta(p.estado)}
                    {p.hora_real ? ` · ${p.hora_real}` : ''}
                    {p.envios[0]?.receptor ? ` · recibió ${p.envios[0].receptor}` : ''}
                  </span>
                  {/* La prueba de la entrega, para poder enseñarla en el momento. */}
                  {(fotosPorParada.get(p.id) ?? []).length > 0 ? (
                    <span className="mt-1.5 block">
                      <FotosDeParada fotos={fotosPorParada.get(p.id) ?? []} />
                    </span>
                  ) : p.estado === 'entregado' ? (
                    <span className="mt-1 block">
                      <SinFoto />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* ── GPS en la misma pantalla ───────────────────────────── */}
      {puedeReportarGps ? (
        <details className="rounded-xl border border-slate-800 bg-slate-900/40">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm text-slate-400 hover:text-slate-200">
            <IconoUbicacion width={16} height={16} />
            Compartir mi ubicación con la central
          </summary>
          <div className="border-t border-slate-800 p-3">
            <CompartirUbicacion
              destino={destinoGps}
              rutaCodigo={ruta.codigo}
              placa={ruta.placa}
              motivoBloqueo={motivoBloqueoGps}
              unidadId={esConductor ? null : ruta.unidad_id}
            />
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs">
        <Link href={`/despachos/${ruta.id}`} className="text-slate-500 hover:text-slate-300">
          Ver el despacho completo →
        </Link>
        {ruta.unidad_id ? (
          <Link
            href={`/rastreo?unidad=${ruta.unidad_id}`}
            className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300"
          >
            <IconoMapa width={14} height={14} />
            Ver mi unidad en el mapa
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Traduce los parámetros de la URL en el aviso que se muestra arriba. */
function acuseDe(sp: Record<string, string | string[] | undefined>) {
  if (sp.hecho === 'entrega') {
    return {
      clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      icono: <IconoCheck width={16} height={16} className="mt-0.5 shrink-0" />,
      texto: 'Entrega registrada. Ya puedes ir a la siguiente parada.',
    };
  }
  if (sp.hecho === 'novedad') {
    return {
      clase: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      icono: <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />,
      texto: 'Novedad registrada. Despacho la verá y decidirá el siguiente intento.',
    };
  }
  if (typeof sp.aviso === 'string') {
    return {
      clase: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
      icono: <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />,
      texto:
        sp.aviso === 'sin-foto'
          ? 'Falta la foto de quien recibe. En esta empresa es obligatoria para dar la entrega por buena.'
          : sp.aviso === 'sin-parada'
            ? 'No se encontró esa parada. Puede que otra persona la haya resuelto ya.'
            : 'No se pudo registrar el cambio. Actualiza la pantalla y vuelve a intentarlo.',
    };
  }
  return null;
}

/**
 * Bloque de la parada en curso: lo único que el conductor necesita mirar
 * mientras conduce, con las acciones al alcance del pulgar.
 */
function ParadaActual({
  parada,
  bultos,
  distancia,
  motivoSoloLectura,
  fotos,
}: {
  parada: ParadaConEnvios;
  bultos: number;
  distancia: number | null;
  /** Si viene con texto, la parada se muestra pero no se puede resolver. */
  motivoSoloLectura: string | null;
  /** Fotos ya registradas en esta parada (por ejemplo, de un intento anterior). */
  fotos: FotoEntregaDetallada[];
}) {
  const telefono = parada.envios.find((e) => e.destinatario_tel)?.destinatario_tel ?? null;
  const receptor = parada.envios[0]?.destinatario ?? null;
  const peso = parada.envios.reduce((s, e) => s + Number(e.peso_kg), 0);

  return (
    <section
      aria-labelledby="parada-actual"
      className="rounded-2xl border border-sky-500/40 bg-sky-500/[0.07] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="parada-actual"
          className="text-[11px] font-semibold uppercase tracking-wider text-sky-300"
        >
          Siguiente parada
        </h2>
        <span className="num flex h-8 min-w-8 items-center justify-center rounded-lg bg-sky-500/20 px-2 text-sm font-semibold text-sky-200">
          {parada.orden}
        </span>
      </div>

      <p className="mt-2 text-lg font-medium leading-snug text-slate-50">{parada.direccion}</p>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
        {parada.zona ? <span>{parada.zona}</span> : null}
        {parada.hora_estimada ? (
          <span className="inline-flex items-center gap-1">
            <IconoReloj width={12} height={12} />
            antes de {parada.hora_estimada}
          </span>
        ) : null}
        {distancia !== null ? (
          <span className="inline-flex items-center gap-1 text-sky-300">
            <IconoUbicacion width={12} height={12} />a {formatearDistancia(distancia)}
          </span>
        ) : null}
      </p>

      <div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <p className="flex items-center gap-2 text-sm text-slate-200">
          <IconoCaja width={15} height={15} className="shrink-0 text-slate-500" />
          <span className="min-w-0 truncate font-medium">{receptor ?? 'Sin destinatario'}</span>
        </p>
        <p className="text-[11px] text-slate-500">
          {entero(bultos)} {bultos === 1 ? 'bulto' : 'bultos'} en la ruta ·{' '}
          {numero(peso, 1)} kg en esta parada · {entero(parada.envios.length)}{' '}
          {parada.envios.length === 1 ? 'guía' : 'guías'}
        </p>
        <ul className="space-y-0.5">
          {parada.envios.map((e) => (
            <li key={e.id} className="num truncate text-[11px] text-slate-500">
              {e.guia} · {e.destinatario}
              {e.intentos > 1 ? (
                <span className="ml-1 text-amber-300">({entero(e.intentos)} intentos)</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Si la parada se reabrió tras un intento, puede traer ya una foto. */}
      {fotos.length > 0 ? (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <p className="mb-2 text-[11px] text-slate-400">
            Ya hay una foto registrada en esta parada
          </p>
          <FotosDeParada fotos={fotos} conDetalle />
        </div>
      ) : null}

      {/* Atajos al teléfono: navegar y llamar son lo que de verdad se usa. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={enlaceNavegacion(parada.lat, parada.lng)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex ${ALTO_BOTON} items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sm font-medium text-sky-200 hover:bg-sky-500/20`}
        >
          <IconoMapa width={17} height={17} />
          Navegar
        </a>
        {telefono ? (
          <a
            href={enlaceTel(telefono)}
            className={`num inline-flex ${ALTO_BOTON} items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 text-sm font-medium text-slate-200 hover:bg-slate-800`}
          >
            {telefono}
          </a>
        ) : (
          <span
            className={`inline-flex ${ALTO_BOTON} items-center justify-center rounded-xl border border-slate-800 text-sm text-slate-600`}
          >
            Sin teléfono
          </span>
        )}
      </div>

      {motivoSoloLectura ? (
        <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-500">
          {motivoSoloLectura}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <form action={entregarParada} className="space-y-2">
            <input type="hidden" name="paradaId" value={parada.id} />
            <input
              name="receptor"
              autoComplete="off"
              placeholder="¿Quién recibe? (opcional)"
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 placeholder:text-slate-600"
            />
            <FotoEntrega obligatoria={parametros.exigirFotoEnEntrega} />
            <BotonEnvio
              textoEnviando="Registrando entrega…"
              className={`inline-flex ${ALTO_BOTON} w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-500`}
            >
              <IconoCheck width={19} height={19} />
              Marcar entregado
            </BotonEnvio>
          </form>

          <details className="rounded-xl border border-slate-800">
            <summary
              className={`flex ${ALTO_BOTON} cursor-pointer list-none items-center justify-center gap-2 rounded-xl text-sm font-medium text-amber-200 hover:bg-amber-500/10`}
            >
              <IconoEquis width={18} height={18} />
              No se pudo entregar
            </summary>

            <form action={reportarNovedad} className="space-y-2 border-t border-slate-800 p-3">
              <input type="hidden" name="paradaId" value={parada.id} />
              <fieldset>
                <legend className="mb-2 text-[11px] text-slate-400">¿Qué pasó?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {MOTIVOS_NOVEDAD.map((motivo) => (
                    <label key={motivo} className="cursor-pointer">
                      <input
                        type="radio"
                        name="tipo"
                        value={motivo}
                        defaultChecked={motivo === 'ausente'}
                        className="peer sr-only"
                      />
                      <span className="flex h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2 text-center text-xs text-slate-300 peer-checked:border-amber-500 peer-checked:bg-amber-500/15 peer-checked:font-medium peer-checked:text-amber-200 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400">
                        {etiqueta(motivo)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <input
                name="descripcion"
                autoComplete="off"
                placeholder="Observación (opcional)"
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 placeholder:text-slate-600"
              />
              <BotonEnvio
                textoEnviando="Registrando novedad…"
                className={`inline-flex ${ALTO_BOTON} w-full items-center justify-center rounded-xl bg-amber-600 text-base font-semibold text-white hover:bg-amber-500`}
              >
                Registrar el motivo
              </BotonEnvio>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}
