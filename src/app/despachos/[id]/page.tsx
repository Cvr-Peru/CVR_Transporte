import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { BarraProporcion, Progreso } from '@/components/ui/Progreso';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { FotoEntrega } from '@/components/entrega/FotoEntrega';
import { FotosDeParada, SinFoto } from '@/components/entrega/FotosDeParada';
import {
  IconoAlerta,
  IconoCheck,
  IconoCaja,
  IconoCombustible,
  IconoDespacho,
  IconoEquis,
  IconoMapa,
  IconoReloj,
  IconoRuta,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { parametros } from '@/config/empresa';
import { all, get } from '@/db/client';
import {
  costosDeRuta,
  fotosDeRuta,
  obtenerRuta,
  paradasDeRuta,
} from '@/db/queries/despachos';
import type { Conductor, FotoEntregaDetallada, Novedad, ParadaConEnvios } from '@/db/tipos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { puede } from '@/lib/auth/permisos';
import {
  calcularRentabilidad,
  clasesDiagnostico,
  textoDiagnostico,
} from '@/lib/domain';
import {
  entero,
  etiqueta,
  fecha,
  hora,
  moneda,
  monedaCorta,
  numero,
  porcentaje,
} from '@/lib/format';
import {
  cancelarRuta,
  completarRuta,
  devolverEnvio,
  iniciarRuta,
  marcarParadaEntregada,
  reasignarRecursos,
  registrarNovedad,
  reintentarParada,
  reordenarParadas,
} from '../actions';

export const dynamic = 'force-dynamic';

const TIPOS_NOVEDAD = [
  'ausente',
  'direccion_errada',
  'rechazado',
  'danado',
  'reprogramado',
  'otro',
] as const;

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';

export default async function PaginaDetalleDespacho({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirPermiso('despachos');
  // En Next 16 `params` es una Promesa: hay que esperarla.
  const { id } = await params;
  const sp = await searchParams;
  const rutaId = Number(id);
  if (!Number.isFinite(rutaId)) notFound();

  const ruta = await obtenerRuta(rutaId);
  if (!ruta) notFound();

  // Un conductor no puede abrir una ruta que no es suya.
  if (sesion.rol === 'conductor' && ruta.conductor_id !== sesion.conductorId) {
    redirect('/sin-acceso?modulo=despachos');
  }

  const paradas = await paradasDeRuta(rutaId);
  const costos = await costosDeRuta(rutaId);

  // Pruebas de entrega de la ruta, agrupadas por parada.
  const fotos = await fotosDeRuta(rutaId);
  const fotosPorParada = new Map<number, FotoEntregaDetallada[]>();
  for (const foto of fotos) {
    const lista = fotosPorParada.get(foto.parada_id) ?? [];
    lista.push(foto);
    fotosPorParada.set(foto.parada_id, lista);
  }

  const conductor = ruta.conductor_id
    ? await get<Conductor>('SELECT * FROM conductores WHERE id = $1', ruta.conductor_id)
    : null;

  const novedades = await all<Novedad & { guia: string }>(
    `SELECT n.*, e.guia
     FROM novedades n
     JOIN envios e ON e.id = n.envio_id
     WHERE e.ruta_id = $1
     ORDER BY n.fecha DESC`,
    rutaId,
  );
  const novedadesPorEnvio = new Map<number, (Novedad & { guia: string })[]>();
  for (const n of novedades) {
    const lista = novedadesPorEnvio.get(n.envio_id) ?? [];
    lista.push(n);
    novedadesPorEnvio.set(n.envio_id, lista);
  }

  const unidades = await all<{ id: number; placa: string; tipo: string }>(
    `SELECT id, placa, tipo FROM unidades
     WHERE estado IN ('disponible','en_ruta') OR id = $1
     ORDER BY placa`,
    ruta.unidad_id,
  );
  const conductores = await all<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM conductores WHERE estado = 'activo' OR id = $1
     ORDER BY nombre`,
    ruta.conductor_id,
  );

  // ── Rentabilidad de la hoja de ruta ────────────────────────
  const comision =
    conductor?.tipo_vinculacion === 'contratista'
      ? Number(ruta.ingresos) * (Number(conductor.comision_pct) / 100)
      : 0;

  const rentabilidad = calcularRentabilidad({
    ingresos: Number(ruta.ingresos),
    combustible: costos.combustible,
    gastos: costos.gastos,
    mantenimiento: costos.mantenimientoProrrateado,
    comisionConductor: comision,
    km: costos.km,
    envios: Number(ruta.envios_entregados),
  });

  const resueltas = Number(ruta.paradas_resueltas);
  const totales = Number(ruta.total_paradas);
  const progreso = totales > 0 ? (resueltas / totales) * 100 : 0;
  const costoTotal = rentabilidad.costoTotal;

  // La ruta está abierta a cambios…
  const rutaAbierta = ruta.estado === 'planificado' || ruta.estado === 'en_curso';
  // …y el rol tiene permiso para editarla. Hacen falta las dos cosas.
  const puedeEditar = puede(sesion.rol, 'despachos', 'editar');
  // Resolver paradas es una acción distinta de editar el despacho: un conductor
  // puede entregar sus paradas aunque no pueda reasignar la unidad ni cerrar la
  // ruta. En la oficina las dos cosas van juntas.
  const puedeEntregar = puede(sesion.rol, 'despachos', 'entregar');

  return (
    <>
      <EncabezadoPagina
        titulo={`Despacho ${ruta.codigo}`}
        descripcion={
          <>
            {fecha(ruta.fecha)} · Zona {ruta.zona}
            {ruta.hora_salida ? ` · Salida ${ruta.hora_salida}` : ''}
            {ruta.hora_llegada ? ` · Llegada ${ruta.hora_llegada}` : ''}
          </>
        }
        acciones={
          <>
            <BadgeEstado estado={ruta.estado} texto={etiqueta(ruta.estado)} />
            <Link
              href="/despachos"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              ← Volver
            </Link>
          </>
        }
      />

      {/* ── Barra de acciones del ciclo de vida ─────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        {puedeEditar && ruta.estado === 'planificado' ? (
          <form action={iniciarRuta}>
            <input type="hidden" name="rutaId" value={ruta.id} />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Iniciar ruta
            </button>
          </form>
        ) : null}

        {puedeEditar && ruta.estado === 'en_curso' ? (
          <form action={completarRuta}>
            <input type="hidden" name="rutaId" value={ruta.id} />
            <button
              type="submit"
              disabled={resueltas < totales}
              title={
                resueltas < totales
                  ? 'Quedan paradas sin resolver: no se puede cerrar la ruta'
                  : 'Cerrar la ruta y liberar la unidad'
              }
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              Completar ruta
            </button>
          </form>
        ) : null}

        {puedeEditar && rutaAbierta ? (
          <form action={cancelarRuta}>
            <input type="hidden" name="rutaId" value={ruta.id} />
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancelar despacho
            </button>
          </form>
        ) : null}

        {puedeEditar && rutaAbierta ? (
          <form action={reordenarParadas}>
            <input type="hidden" name="rutaId" value={ruta.id} />
            <button
              type="submit"
              title="Recoloca las paradas pendientes para acortar el recorrido, partiendo de donde está la unidad"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
            >
              <IconoRuta width={15} height={15} />
              Optimizar recorrido
            </button>
          </form>
        ) : null}

        <Link
          href={ruta.unidad_id ? `/rastreo?unidad=${ruta.unidad_id}` : '/rastreo'}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
        >
          <IconoMapa width={14} height={14} />
          Seguir en el mapa
        </Link>
      </div>

      {/* Resultado de la última optimización de recorrido */}
      {typeof sp.reorden === 'string' ? (
        <p
          role="status"
          className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-xs ${
            sp.reorden === 'insuficientes'
              ? 'border-slate-800 bg-slate-900/50 text-slate-400'
              : sp.reorden === 'vroom'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-sky-500/30 bg-sky-500/10 text-sky-200'
          }`}
        >
          {sp.reorden === 'insuficientes' ? (
            <>
              <IconoAlerta width={14} height={14} className="shrink-0" />
              No hay suficientes paradas pendientes para que optimizar el orden aporte algo.
            </>
          ) : (
            <>
              <IconoRuta width={14} height={14} className="shrink-0" />
              <span>
                Recorrido reordenado con{' '}
                <strong>
                  {sp.reorden === 'vroom'
                    ? 'VROOM, por calles reales'
                    : 'el optimizador local, por línea recta'}
                </strong>
                {sp.mejora !== undefined ? ` · ${sp.mejora} % menos distancia` : ''}
                {sp.km !== undefined ? ` · ${sp.km} km` : ''}
              </span>
              {sp.reorden !== 'vroom' ? (
                <span className="text-[11px] text-slate-400">
                  (para distancias reales por carretera, configura VROOM_URL: ver README)
                </span>
              ) : null}
            </>
          )}
        </p>
      ) : null}

      <RejillaKpi columnas={5}>
        <Kpi
          etiqueta="Avance de paradas"
          valor={`${entero(resueltas)}/${entero(totales)}`}
          detalle={`${entero(Number(ruta.total_envios))} envíos en la hoja de ruta`}
          icono={<IconoDespacho width={16} height={16} />}
          acento="cielo"
          pie={<Progreso valor={progreso} mostrarTexto />}
        />
        <Kpi
          etiqueta="Entregas efectivas"
          valor={entero(ruta.envios_entregados)}
          detalle={`${entero(ruta.envios_novedad)} con novedad o devolución`}
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
          pie={
            <Progreso
              valor={
                Number(ruta.total_envios) > 0
                  ? (Number(ruta.envios_entregados) / Number(ruta.total_envios)) * 100
                  : 0
              }
              mostrarTexto
            />
          }
        />
        <Kpi
          etiqueta="Flete entregado"
          valor={monedaCorta(ruta.ingresos)}
          detalle={`${moneda(rentabilidad.ingresoPorEnvio)} por envío entregado`}
          icono={<IconoCaja width={16} height={16} />}
          acento="esmeralda"
        />
        <Kpi
          etiqueta="Costo de la ruta"
          valor={monedaCorta(costoTotal)}
          detalle={`${costos.km > 0 ? `${numero(costos.km, 1)} km recorridos` : 'Kilometraje sin registrar'}`}
          icono={<IconoCombustible width={16} height={16} />}
          acento="ambar"
          pie={
            <span className="text-xs text-slate-500">
              {numero(costos.galones, 1)} gal · {moneda(costos.combustible)}
            </span>
          }
        />
        <Kpi
          etiqueta="Margen de la ruta"
          valor={monedaCorta(rentabilidad.margen)}
          detalle={`${porcentaje(rentabilidad.margenPct, 1)} sobre el flete`}
          icono={<IconoReloj width={16} height={16} />}
          acento={rentabilidad.margen >= 0 ? 'esmeralda' : 'rosa'}
          pie={
            <span
              className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${clasesDiagnostico(
                rentabilidad.diagnostico,
              )}`}
            >
              {textoDiagnostico(rentabilidad.diagnostico)}
            </span>
          }
        />
      </RejillaKpi>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Paradas y prueba de entrega ─────────────────────── */}
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardCabecera
              titulo="Paradas de la ruta"
              descripcion="En orden de reparto. Registra cada entrega con su prueba de entrega o abre una novedad si no se pudo entregar."
              acciones={
                <span className="num text-xs text-slate-400">
                  {entero(resueltas)} de {entero(totales)} resueltas
                </span>
              }
            />
            <CardCuerpo className="space-y-3">
              {!puedeEntregar ? (
                <p className="text-xs text-slate-500">
                  Solo lectura: tu perfil puede consultar el despacho, pero no registrar entregas.
                </p>
              ) : null}
              {paradas.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Esta hoja de ruta no tiene paradas registradas.
                </p>
              ) : (
                paradas.map((parada) => (
                  <BloqueParada
                    key={parada.id}
                    parada={parada}
                    novedadesPorEnvio={novedadesPorEnvio}
                    editable={puedeEditar && rutaAbierta}
                    puedeEntregar={puedeEntregar && rutaAbierta}
                    fotos={fotosPorParada.get(parada.id) ?? []}
                  />
                ))
              )}
            </CardCuerpo>
          </Card>

          {ruta.notas ? (
            <Card>
              <CardCabecera titulo="Notas de la ruta" />
              <CardCuerpo className="text-sm text-slate-300">{ruta.notas}</CardCuerpo>
            </Card>
          ) : null}
        </div>

        {/* ── Panel lateral: recursos y economía ──────────────── */}
        <div className="space-y-4">
          <Card>
            <CardCabecera
              titulo="Recursos asignados"
              descripcion={
                puedeEditar
                  ? rutaAbierta
                    ? 'Puedes reasignarlos mientras la ruta esté abierta.'
                    : 'La ruta ya está cerrada.'
                  : 'Solo lectura: tu perfil no puede reasignar recursos.'
              }
            />
            <CardCuerpo>
              {puedeEditar && rutaAbierta ? (
                <form action={reasignarRecursos} className="space-y-3">
                  <input type="hidden" name="rutaId" value={ruta.id} />
                  <label className="flex flex-col gap-1 text-xs text-slate-400">
                    Unidad
                    <select name="unidadId" defaultValue={ruta.unidad_id ?? ''} className={CLASE_CAMPO}>
                      <option value="">Sin asignar</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.placa} · {etiqueta(u.tipo)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-slate-400">
                    Conductor
                    <select
                      name="conductorId"
                      defaultValue={ruta.conductor_id ?? ''}
                      className={CLASE_CAMPO}
                    >
                      <option value="">Sin asignar</option>
                      {conductores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
                  >
                    Guardar asignación
                  </button>
                </form>
              ) : (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Unidad</dt>
                    <dd className="text-slate-200">{ruta.placa ?? 'Sin asignar'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Conductor</dt>
                    <dd className="text-slate-200">{ruta.conductor ?? 'Sin asignar'}</dd>
                  </div>
                </dl>
              )}

              {conductor ? (
                <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
                  <p>
                    {etiqueta(conductor.tipo_vinculacion)} ·{' '}
                    {conductor.tipo_vinculacion === 'contratista'
                      ? `comisión del ${numero(conductor.comision_pct, 1)}%`
                      : 'salario fijo'}
                  </p>
                  {conductor.licencia_vencimiento ? (
                    <p className="mt-1">
                      Licencia {conductor.licencia_categoria ?? ''} vence{' '}
                      {fecha(conductor.licencia_vencimiento)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardCuerpo>
          </Card>

          <Card>
            <CardCabecera
              titulo="Resultado económico"
              descripcion="Flete entregado menos los costos imputables a la ruta"
            />
            <CardCuerpo className="space-y-3">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Flete entregado</dt>
                  <dd className="num text-slate-100">{moneda(rentabilidad.ingresos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Combustible</dt>
                  <dd className="num text-slate-300">−{moneda(costos.combustible)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Gastos de ruta</dt>
                  <dd className="num text-slate-300">−{moneda(costos.gastos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">
                    Mantenimiento
                    <span className="ml-1 text-[10px] text-slate-500">(prorrateado por km)</span>
                  </dt>
                  <dd className="num text-slate-300">
                    −{moneda(costos.mantenimientoProrrateado)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Comisión del conductor</dt>
                  <dd className="num text-slate-300">−{moneda(comision)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1.5">
                  <dt className="font-medium text-slate-300">Margen</dt>
                  <dd
                    className={`num font-semibold ${
                      rentabilidad.margen >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {moneda(rentabilidad.margen)}
                  </dd>
                </div>
              </dl>

              <div className="border-t border-slate-800 pt-3">
                <BarraProporcion
                  etiqueta="Costo sobre ingreso"
                  valor={rentabilidad.ingresos > 0 ? rentabilidad.costoTotal : 0}
                  total={Math.max(rentabilidad.ingresos, rentabilidad.costoTotal, 1)}
                  color="bg-amber-500"
                  detalle={porcentaje(
                    rentabilidad.ingresos > 0
                      ? (rentabilidad.costoTotal / rentabilidad.ingresos) * 100
                      : 0,
                    1,
                  )}
                />
              </div>

              <dl className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-xs">
                <div>
                  <dt className="text-slate-500">Costo por km</dt>
                  <dd className="num text-slate-300">{moneda(rentabilidad.costoPorKm)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Ingreso por km</dt>
                  <dd className="num text-slate-300">{moneda(rentabilidad.ingresoPorKm)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Costo por envío</dt>
                  <dd className="num text-slate-300">{moneda(rentabilidad.costoPorEnvio)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Envíos entregados</dt>
                  <dd className="num text-slate-300">{entero(rentabilidad.envios)}</dd>
                </div>
              </dl>

              <p className="flex gap-2 text-[11px] leading-relaxed text-slate-500">
                <IconoAlerta width={13} height={13} className="mt-0.5 shrink-0" />
                El mantenimiento se reparte según el costo por kilómetro histórico de la unidad, no
                es una imputación contable exacta.
              </p>
            </CardCuerpo>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Bloque de una parada con sus envíos y las acciones de entrega. */
function BloqueParada({
  parada,
  novedadesPorEnvio,
  editable,
  puedeEntregar,
  fotos,
}: {
  parada: ParadaConEnvios;
  novedadesPorEnvio: Map<number, (Novedad & { guia: string })[]>;
  editable: boolean;
  puedeEntregar: boolean;
  fotos: FotoEntregaDetallada[];
}) {
  const resuelta = parada.estado === 'entregado' || parada.estado === 'fallido';

  return (
    <article
      className={`rounded-xl border p-3 ${
        parada.estado === 'en_camino'
          ? 'border-sky-500/40 bg-sky-500/5'
          : resuelta
            ? 'border-slate-800 bg-slate-950/30'
            : 'border-slate-800 bg-slate-950/20'
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
              parada.estado === 'entregado'
                ? 'bg-emerald-500/15 text-emerald-300'
                : parada.estado === 'fallido'
                  ? 'bg-rose-500/15 text-rose-300'
                  : parada.estado === 'en_camino'
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-slate-700/40 text-slate-400'
            }`}
          >
            {parada.orden}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-200">{parada.direccion}</p>
            <p className="text-[11px] text-slate-500">
              {parada.zona ?? '—'} · Estimada {parada.hora_estimada ?? '—'}
              {parada.hora_real ? ` · Real ${parada.hora_real}` : ''}
              {parada.lat && parada.lng
                ? ` · ${parada.lat.toFixed(4)}, ${parada.lng.toFixed(4)}`
                : ''}
            </p>
          </div>
        </div>
        <BadgeEstado estado={parada.estado} texto={etiqueta(parada.estado)} />
      </header>

      {parada.envios.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
          <TablaCaja>
            <thead>
              <tr>
                <Th>Guía</Th>
                <Th>Destinatario</Th>
                <Th>Cliente</Th>
                <Th alineacion="derecha">Peso</Th>
                <Th alineacion="derecha">Flete</Th>
                <Th>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {parada.envios.map((envio) => {
                const propias = novedadesPorEnvio.get(envio.id) ?? [];
                return (
                  <Tr key={envio.id}>
                    <Td className="font-medium text-slate-200">{envio.guia}</Td>
                    <Td>
                      <span className="block text-slate-300">{envio.destinatario}</span>
                      {envio.receptor && envio.receptor !== envio.destinatario ? (
                        <span className="text-[11px] text-emerald-300">
                          Recibió {envio.receptor}
                        </span>
                      ) : null}
                      {envio.destinatario_tel ? (
                        <span className="block text-[11px] text-slate-500">
                          {envio.destinatario_tel}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="max-w-40 truncate text-slate-400">{envio.cliente}</Td>
                    <Td alineacion="derecha" className="text-slate-400">
                      {numero(envio.peso_kg, 2)} kg
                    </Td>
                    <Td alineacion="derecha" className="text-slate-200">
                      {moneda(envio.flete)}
                    </Td>
                    <Td>
                      <BadgeEstado estado={envio.estado} texto={etiqueta(envio.estado)} />
                      {envio.intentos > 1 ? (
                        <span className="mt-0.5 block text-[11px] text-amber-300">
                          {entero(envio.intentos)} intentos
                        </span>
                      ) : null}
                    </Td>
                    <Td alineacion="derecha">
                      {propias.length > 0 ? (
                        <details className="text-left">
                          <summary className="cursor-pointer text-[11px] text-amber-300 hover:text-amber-200">
                            {entero(propias.length)} novedad
                            {propias.length > 1 ? 'es' : ''}
                          </summary>
                          <ul className="mt-1.5 w-56 space-y-1.5">
                            {propias.map((n) => (
                              <li
                                key={n.id}
                                className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-[11px]"
                              >
                                <span className="font-medium text-amber-300">
                                  {etiqueta(n.tipo)}
                                </span>
                                {n.resuelto ? (
                                  <span className="ml-1 text-emerald-300">· resuelta</span>
                                ) : null}
                                <span className="mt-0.5 block text-slate-400">
                                  {n.descripcion ?? 'Sin descripción'}
                                </span>
                                <span className="mt-0.5 block text-slate-500">
                                  {hora(n.fecha)}
                                </span>
                                {editable && !n.resuelto && envio.estado === 'novedad' ? (
                                  <form action={devolverEnvio} className="mt-1.5">
                                    <input type="hidden" name="envioId" value={envio.id} />
                                    <button
                                      type="submit"
                                      className="text-[10px] text-rose-300 hover:text-rose-200"
                                    >
                                      Devolver al remitente
                                    </button>
                                  </form>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="text-[11px] text-slate-600">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TablaCaja>
        </div>
      ) : null}

      {/* Prueba de entrega: la foto de quien recibió. */}
      {fotos.length > 0 ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <p className="mb-2 text-[11px] font-medium text-slate-400">
            Prueba de entrega · {fotos.length === 1 ? '1 foto' : `${fotos.length} fotos`}
          </p>
          <FotosDeParada fotos={fotos} conDetalle />
        </div>
      ) : parada.estado === 'entregado' ? (
        <div className="mt-3">
          <SinFoto />
        </div>
      ) : null}

      {editable || puedeEntregar ? (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {puedeEntregar && parada.estado !== 'entregado' ? (
            <form action={marcarParadaEntregada} className="w-full space-y-2">
              <input type="hidden" name="paradaId" value={parada.id} />
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Recibió (opcional)
                  <input
                    name="receptor"
                    placeholder="Nombre de quien recibe"
                    className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  <IconoCheck width={13} height={13} />
                  Registrar entrega
                </button>
              </div>
              {/* En el escritorio esto abre el selector de archivos: es por donde
                  llega la foto que el conductor manda por WhatsApp. */}
              <FotoEntrega
                obligatoria={parametros.exigirFotoEnEntrega}
                etiqueta="Adjuntar foto de quien recibe"
              />
            </form>
          ) : null}

          {editable && parada.estado === 'fallido' ? (
            <form action={reintentarParada}>
              <input type="hidden" name="paradaId" value={parada.id} />
              <button
                type="submit"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Reintentar entrega
              </button>
            </form>
          ) : null}

          {puedeEntregar && parada.estado !== 'entregado' ? (
            <details className="rounded-lg border border-slate-800">
              <summary className="cursor-pointer px-3 py-1.5 text-xs text-amber-300 hover:text-amber-200">
                <span className="inline-flex items-center gap-1.5">
                  <IconoEquis width={13} height={13} />
                  Registrar novedad
                </span>
              </summary>
              <form action={registrarNovedad} className="flex flex-wrap items-end gap-2 p-3">
                <input type="hidden" name="paradaId" value={parada.id} />
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Motivo
                  <select
                    name="tipo"
                    defaultValue="ausente"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                  >
                    {TIPOS_NOVEDAD.map((t) => (
                      <option key={t} value={t}>
                        {etiqueta(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  Observación
                  <input
                    name="descripcion"
                    placeholder="Detalle de lo ocurrido"
                    className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
                >
                  Guardar novedad
                </button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
