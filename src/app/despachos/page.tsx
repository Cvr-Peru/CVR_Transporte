import Link from 'next/link';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import {
  IconoAlerta,
  IconoBuscar,
  IconoCaja,
  IconoCheck,
  IconoDespacho,
  IconoFlecha,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { Progreso } from '@/components/ui/Progreso';
import { FilaVacia, TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import {
  contarEnviosPorEstado,
  contarRutasPorEstado,
  listarRutas,
  zonasOperativas,
  type FiltrosRutas,
} from '@/db/queries/despachos';
import { all } from '@/db/client';
import type { EstadoRuta, RutaResumen } from '@/db/tipos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { puede } from '@/lib/auth/permisos';
import { calcularMetricasEntrega } from '@/lib/domain';
import {
  entero,
  etiqueta,
  fechaCorta,
  hoyISO,
  moneda,
  monedaCorta,
  porcentaje,
  sumarDias,
  aISO,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

function primero(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

const ESTADOS: EstadoRuta[] = ['planificado', 'en_curso', 'completado', 'cancelado'];

export default async function PaginaDespachos({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const sesion = await requerirPermiso('despachos');
  const puedeEditar = puede(sesion.rol, 'despachos', 'editar');
  const sp = await searchParams;
  const hoy = hoyISO();

  const desde = primero(sp.desde) ?? aISO(sumarDias(new Date(), -1));
  const hasta = primero(sp.hasta) ?? aISO(sumarDias(new Date(), 2));
  const estadoParam = primero(sp.estado);
  const estado = (ESTADOS as string[]).includes(estadoParam ?? '')
    ? (estadoParam as EstadoRuta)
    : 'todas';
  const zona = primero(sp.zona) || undefined;
  const conductorId = Number(primero(sp.conductor));
  const q = primero(sp.q) ?? '';

  const filtros: FiltrosRutas = {
    desde,
    hasta,
    estado,
    zona,
    conductorId: Number.isFinite(conductorId) && conductorId > 0 ? conductorId : undefined,
    busqueda: q || undefined,
    limite: 250,
  };

  // Un conductor solo ve sus propias hojas de ruta.
  if (sesion.rol === 'conductor') {
    filtros.conductorId = sesion.conductorId ?? -1; // -1 no coincide con nadie
  }

  const rutas = await listarRutas(filtros);
  const conteoRutas = await contarRutasPorEstado(filtros);
  // El alcance del conductor se aplica también a estos totales. Sin esto, un
  // conductor vería las cifras agregadas de toda la operación.
  const entregas = calcularMetricasEntrega(
    await contarEnviosPorEstado({
      desde,
      hasta,
      conductorId: sesion.rol === 'conductor' ? (sesion.conductorId ?? -1) : undefined,
    }),
  );
  const zonas = await zonasOperativas();

  // Un conductor no debe ver la lista de sus compañeros: el selector solo tiene
  // sentido para quien reparte el trabajo.
  const conductores =
    sesion.rol === 'conductor'
      ? []
      : await all<{ id: number; nombre: string }>(
          `SELECT DISTINCT c.id, c.nombre
           FROM rutas r JOIN conductores c ON c.id = r.conductor_id
           ORDER BY c.nombre`,
        );

  // Rutas de hoy que están en la calle: es la vista que el despachador vigila.
  // El alcance del conductor también se aplica a esta tarjeta.
  const enCursoHoy = await listarRutas({
    desde: hoy,
    hasta: hoy,
    estado: 'en_curso',
    conductorId: sesion.rol === 'conductor' ? filtros.conductorId : undefined,
    limite: 50,
  });

  const ingresosPeriodo = rutas.reduce((s, r) => s + Number(r.ingresos), 0);
  const hayFiltros = Boolean(
    primero(sp.desde) || primero(sp.hasta) || estadoParam || zona || conductorId || q,
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Despachos"
        descripcion="Hojas de ruta del período: asignación de unidades y conductores, avance de paradas y entregas efectivas."
        acciones={
          puedeEditar ? (
            <Link
              href="/despachos/nuevo"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Nuevo despacho
            </Link>
          ) : null
        }
      />

      <RejillaKpi columnas={5}>
        <Kpi
          etiqueta="Rutas en el período"
          valor={entero(rutas.length)}
          detalle={`${entero(conteoRutas.planificado ?? 0)} por despachar · ${entero(
            conteoRutas.completado ?? 0,
          )} completadas`}
          icono={<IconoDespacho width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="En curso ahora"
          valor={entero(conteoRutas.en_curso ?? 0)}
          detalle={`${entero(enCursoHoy.length)} en la calle hoy`}
          icono={<IconoFlecha width={16} height={16} />}
          acento="violeta"
        />
        <Kpi
          etiqueta="Envíos del período"
          valor={entero(entregas.total)}
          detalle={`${entero(entregas.entregados)} entregados`}
          icono={<IconoCaja width={16} height={16} />}
          acento="slate"
          pie={<Progreso valor={entregas.cumplimiento} mostrarTexto />}
        />
        <Kpi
          etiqueta="Novedades"
          valor={entero(entregas.novedades + entregas.devueltos)}
          detalle={`${porcentaje(entregas.tasaNovedad, 1)} de lo despachado`}
          icono={<IconoAlerta width={16} height={16} />}
          acento={entregas.tasaNovedad > 10 ? 'rosa' : 'ambar'}
        />
        <Kpi
          etiqueta="Flete entregado"
          valor={monedaCorta(ingresosPeriodo)}
          detalle={`${entero(entregas.entregados)} envíos efectivos`}
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
        />
      </RejillaKpi>

      {/* ── Rutas en la calle ahora mismo ─────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="En la calle ahora"
          descripcion={`Rutas en curso con fecha de hoy (${fechaCorta(hoy)})`}
          acciones={
            <Link href="/rastreo" className="text-xs text-sky-400 hover:text-sky-300">
              Ver rastreo en vivo →
            </Link>
          }
        />
        {enCursoHoy.length === 0 ? (
          <Vacio
            titulo="No hay rutas en curso"
            mensaje="Cuando inicies un despacho planificado aparecerá aquí con su avance en tiempo real."
            icono={<IconoDespacho width={22} height={22} />}
          />
        ) : (
          <CardCuerpo className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {enCursoHoy.map((r) => (
              <TarjetaRutaActiva key={r.id} ruta={r} />
            ))}
          </CardCuerpo>
        )}
      </Card>

      {/* ── Filtros ───────────────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera titulo="Filtros" descripcion="Acota el listado de hojas de ruta." />
        <CardCuerpo>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Desde
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Hasta
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Estado
              <select
                name="estado"
                defaultValue={estado}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              >
                <option value="todas">Todos</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {etiqueta(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Zona
              <select
                name="zona"
                defaultValue={zona ?? ''}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              >
                <option value="">Todas</option>
                {zonas.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            {sesion.rol === 'conductor' ? null : (
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Conductor
                <select
                  name="conductor"
                  defaultValue={conductorId > 0 ? String(conductorId) : ''}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
                >
                  <option value="">Todos</option>
                  {conductores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Buscar
              <input
                name="q"
                defaultValue={q}
                placeholder="Código, zona, placa…"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Filtrar
            </button>
            {hayFiltros ? (
              <Link
                href="/despachos"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Limpiar
              </Link>
            ) : null}
          </form>
        </CardCuerpo>
      </Card>

      {/* ── Listado completo ──────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Hojas de ruta"
          descripcion={`${entero(rutas.length)} rutas entre ${fechaCorta(desde)} y ${fechaCorta(hasta)}`}
        />
        <CardCuerpo className="px-0 py-0">
          {rutas.length === 0 ? (
            <Vacio
              titulo="Sin despachos en el período"
              mensaje="Prueba a ampliar el rango de fechas o a limpiar los filtros."
              icono={<IconoBuscar width={22} height={22} />}
              accion={
                <Link href="/despachos" className="text-xs text-sky-400 hover:text-sky-300">
                  Limpiar filtros
                </Link>
              }
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Fecha</Th>
                  <Th>Zona</Th>
                  <Th>Unidad</Th>
                  <Th>Conductor</Th>
                  <Th>Avance de paradas</Th>
                  <Th alineacion="derecha">Envíos</Th>
                  <Th alineacion="derecha">Flete</Th>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rutas.map((r) => {
                  const resueltas = Number(r.paradas_resueltas);
                  const totales = Number(r.total_paradas);
                  const pct = totales > 0 ? (resueltas / totales) * 100 : 0;
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <Link
                          href={`/despachos/${r.id}`}
                          className="font-medium text-sky-300 hover:text-sky-200"
                        >
                          {r.codigo}
                        </Link>
                        {r.hora_salida ? (
                          <span className="block text-[11px] text-slate-500">
                            Salida {r.hora_salida}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-400">{fechaCorta(r.fecha)}</Td>
                      <Td className="text-slate-300">{r.zona}</Td>
                      <Td>
                        {r.placa ? (
                          <span className="text-slate-200">{r.placa}</span>
                        ) : (
                          <Badge tono="aviso">Sin asignar</Badge>
                        )}
                        {r.tipo_unidad ? (
                          <span className="block text-[11px] text-slate-500">
                            {etiqueta(r.tipo_unidad)}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-slate-400">{r.conductor ?? '—'}</Td>
                      <Td className="min-w-40">
                        <Progreso valor={pct} mostrarTexto />
                        <span className="text-[11px] text-slate-500">
                          {entero(resueltas)} de {entero(totales)}
                        </span>
                      </Td>
                      <Td alineacion="derecha">
                        <span className="text-slate-200">{entero(r.envios_entregados)}</span>
                        <span className="text-slate-500"> / {entero(r.total_envios)}</span>
                        {Number(r.envios_novedad) > 0 ? (
                          <span className="block text-[11px] text-rose-300">
                            {entero(r.envios_novedad)} con novedad
                          </span>
                        ) : null}
                      </Td>
                      <Td alineacion="derecha" className="text-slate-200">
                        {moneda(r.ingresos)}
                      </Td>
                      <Td>
                        <BadgeEstado estado={r.estado} texto={etiqueta(r.estado)} />
                      </Td>
                      <Td alineacion="derecha">
                        <Link
                          href={`/despachos/${r.id}`}
                          className="text-xs text-sky-400 hover:text-sky-300"
                        >
                          Abrir →
                        </Link>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
      </Card>
    </>
  );
}

/** Tarjeta compacta de una ruta en curso, con su avance y ocupación. */
function TarjetaRutaActiva({ ruta }: { ruta: RutaResumen }) {
  const resueltas = Number(ruta.paradas_resueltas);
  const totales = Number(ruta.total_paradas);
  const pct = totales > 0 ? (resueltas / totales) * 100 : 0;
  const pendientes = Number(ruta.total_envios) - Number(ruta.envios_entregados);

  return (
    <Link
      href={`/despachos/${ruta.id}`}
      className="block rounded-xl border border-slate-800 bg-slate-950/40 p-3 transition-colors hover:border-slate-700 hover:bg-slate-800/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{ruta.codigo}</p>
          <p className="truncate text-[11px] text-slate-500">
            {ruta.zona} · {ruta.placa ?? 'sin unidad'}
          </p>
        </div>
        <Badge tono="info">
          <span className="latido inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
          En curso
        </Badge>
      </div>

      <p className="mt-2 truncate text-xs text-slate-400">{ruta.conductor ?? 'Sin conductor'}</p>

      <div className="mt-2.5">
        <Progreso valor={pct} mostrarTexto />
      </div>

      <dl className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <div>
          <dt className="sr-only">Entregados</dt>
          <dd>
            <span className="num text-slate-300">{entero(ruta.envios_entregados)}</span> entregados
          </dd>
        </div>
        <div>
          <dt className="sr-only">Pendientes</dt>
          <dd>
            <span className="num text-slate-300">{entero(Math.max(0, pendientes))}</span> por entregar
          </dd>
        </div>
        <div>
          <dt className="sr-only">Flete</dt>
          <dd className="num text-emerald-300">{monedaCorta(ruta.ingresos)}</dd>
        </div>
      </dl>
    </Link>
  );
}
