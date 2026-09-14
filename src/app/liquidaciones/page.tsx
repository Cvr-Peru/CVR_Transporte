import Link from 'next/link';
import { Badge, tonoDeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import {
  IconoAlerta,
  IconoCheck,
  IconoConductor,
  IconoLiquidacion,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import {
  actividadLiquidada,
  catalogoConductores,
  kpisLiquidaciones,
  listarLiquidaciones,
  type ActividadLiquidada,
  type EstadoLiquidacion,
  type LiquidacionDetallada,
} from '@/db/queries/conductores';
import { parametros } from '@/config/empresa';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aISO, entero, etiqueta, fecha, moneda, monedaCorta, porcentaje } from '@/lib/format';
import { listaMeses, nombreMes, rangoMes, type Rango } from '@/lib/periodos';

import {
  aprobarLiquidacion,
  marcarLiquidacionPagada,
  registrarDeduccion,
} from './actions';

// Las liquidaciones se mueven con cada pago y cada deducción: sin caché.
export const dynamic = 'force-dynamic';

/** Clases compartidas por los campos del formulario de filtros. */
const CAMPO =
  'rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';
const BOTON =
  'rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500';

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

const ESTADOS: { valor: EstadoLiquidacion; etiqueta: string }[] = [
  { valor: 'borrador', etiqueta: 'Borrador' },
  { valor: 'aprobada', etiqueta: 'Aprobada' },
  { valor: 'pagada', etiqueta: 'Pagada' },
];

function texto(sp: ParametrosBusqueda, clave: string): string | undefined {
  const valor = sp[clave];
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = v?.trim();
  return limpio ? limpio : undefined;
}

/** Id de conductor tomado de la URL. Devuelve undefined si no es un entero válido. */
function idDeConductor(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Convierte `?periodo=YYYY-MM` en la ventana de días que cubre ese mes.
 * Se usa el mes completo —y no la semana— porque las liquidaciones son semanales
 * y pueden caer a caballo entre dos meses.
 */
function rangoDelPeriodo(periodo: string | undefined): Rango {
  if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const [anio, mes] = periodo.split('-').map(Number);
    if (mes >= 1 && mes <= 12) {
      return {
        desde: `${periodo}-01`,
        // Día 0 del mes siguiente = último día del mes elegido.
        hasta: aISO(new Date(anio, mes, 0)),
      };
    }
  }
  return rangoMes();
}

export default async function PaginaLiquidaciones({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const sesion = await requerirPermiso('liquidaciones');
  // Quien solo tiene permiso de lectura no debe ver botones que no funcionan.
  const puedeEditar = puede(sesion.rol, 'liquidaciones', 'editar');

  // En Next 16 `searchParams` es una Promesa: hay que esperarla siempre.
  const sp = await searchParams;
  const conductorFiltro = idDeConductor(texto(sp, 'conductor'));
  const estado = texto(sp, 'estado');
  const periodo = texto(sp, 'periodo');

  const rango = rangoDelPeriodo(periodo);
  const filtros = {
    conductorId: conductorFiltro,
    estado: estado as EstadoLiquidacion | 'todas' | undefined,
    desde: rango.desde,
    hasta: rango.hasta,
    limite: 300,
  };

  // Los totales se calculan sobre el período completo; el filtro de estado solo
  // recorta la tabla, para que el usuario pueda comparar contra el total.
  const kpis = await kpisLiquidaciones({
    conductorId: filtros.conductorId,
    desde: filtros.desde,
    hasta: filtros.hasta,
  });
  const liquidaciones = await listarLiquidaciones(filtros);
  const conductores = await catalogoConductores();
  const actividad = conductorFiltro ? await actividadLiquidada(conductorFiltro, rango) : null;

  const meses = listaMeses(12);
  const hayFiltros = Boolean(conductorFiltro || estado || periodo);

  return (
    <>
      <EncabezadoPagina
        titulo="Liquidaciones"
        descripcion={
          <>
            Pago a conductores por período. Total liquidado, pendiente y pagado se calculan
            sobre el período visible ({fecha(rango.desde)} – {fecha(rango.hasta)}).
          </>
        }
        acciones={
          <>
            <Badge tono="info">{nombreMes()}</Badge>
            <Link
              href="/conductores"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Ver conductores
            </Link>
          </>
        }
      />

      {/* ── Indicadores del período ───────────────────────────── */}
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Total liquidado"
          valor={moneda(kpis.totalLiquidado)}
          detalle={`${entero(kpis.numero)} liquidaciones en el período`}
          icono={<IconoLiquidacion width={16} height={16} />}
          acento="cielo"
          pie={<p className="text-xs text-slate-500">{monedaCorta(kpis.totalLiquidado)}</p>}
        />
        <Kpi
          etiqueta="Pendiente de pago"
          valor={moneda(kpis.totalPendiente)}
          detalle="Liquidaciones en borrador o aprobadas"
          icono={<IconoReloj width={16} height={16} />}
          acento={kpis.totalPendiente > 0 ? 'ambar' : 'esmeralda'}
        />
        <Kpi
          etiqueta="Ya pagado"
          valor={moneda(kpis.totalPagado)}
          detalle={
            kpis.totalLiquidado > 0
              ? `${porcentaje((kpis.totalPagado / kpis.totalLiquidado) * 100, 0)} del total liquidado`
              : 'Sin liquidaciones en el período'
          }
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
        />
        <Kpi
          etiqueta="Liquidaciones"
          valor={entero(kpis.numero)}
          detalle={conductorFiltro ? 'Del conductor seleccionado' : 'De toda la plantilla'}
          icono={<IconoConductor width={16} height={16} />}
          acento="violeta"
        />
      </RejillaKpi>

      {/* ── Filtros ───────────────────────────────────────────── */}
      <Card className="mt-4">
        <CardCuerpo>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Conductor
              <select
                name="conductor"
                defaultValue={conductorFiltro ? String(conductorFiltro) : ''}
                className={`${CAMPO} max-w-64`}
              >
                <option value="">Todos los conductores</option>
                {conductores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.codigo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Estado
              <select name="estado" defaultValue={estado ?? 'todas'} className={CAMPO}>
                <option value="todas">Todos</option>
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Período
              <select name="periodo" defaultValue={periodo ?? ''} className={CAMPO}>
                <option value="">Mes en curso</option>
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={BOTON}>
              Filtrar
            </button>
            {hayFiltros ? (
              <Link href="/liquidaciones" className="text-xs text-slate-400 hover:text-slate-200">
                Limpiar
              </Link>
            ) : null}
            <span className="num ml-auto text-xs text-slate-500">
              {entero(liquidaciones.length)} de {entero(kpis.numero)} liquidaciones
            </span>
          </form>
        </CardCuerpo>
      </Card>

      {/* ── Cómo se calcula ───────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Cómo se calcula una liquidación"
          descripcion="El tipo de vinculación determina de dónde sale el pago."
          acciones={
            <Badge tono="neutro">
              total = base + comisiones + bonificaciones − deducciones
            </Badge>
          }
        />
        <CardCuerpo>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-violet-200">
                <Badge tono="violeta">Contratista</Badge>
                Comisión sobre lo entregado
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                No tiene base salarial. Se suman los ingresos por flete de los envíos{' '}
                <strong className="font-medium text-slate-300">entregados</strong> en sus rutas del
                período y se aplica su porcentaje de comisión:{' '}
                <span className="num text-slate-300">
                  comisiones = ingresos de sus rutas entregadas × comision_pct / 100
                </span>
                . Cada conductor tiene su propio <code className="text-slate-300">comision_pct</code>
                ; el valor de referencia de la empresa es {porcentaje(parametros.comisionContratistaPct, 0)}.
                Los envíos con novedad, devueltos o en reparto no generan comisión.
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-sky-200">
                <Badge tono="info">Empleado</Badge>
                Salario base semanal
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Su comisión es <span className="num text-slate-300">0</span>. La liquidación cubre una
                semana y equivale a la cuarta parte del salario mensual:{' '}
                <span className="num text-slate-300">base = salario_base / 4</span>. El salario se
                configura en la ficha del conductor y no depende de los envíos entregados.
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            En ambos casos se añaden las bonificaciones, se restan las deducciones (anticipos, daños,
            multas) y el resultado es el total a pagar. Una deducción solo puede registrarse mientras
            la liquidación está en <span className="text-slate-300">borrador</span>: al aprobarla se
            cierra el cálculo.
          </p>
        </CardCuerpo>
      </Card>

      {/* ── Auditoría del conductor seleccionado ──────────────── */}
      {actividad ? (
        <BloqueActividad actividad={actividad} rango={rango} periodo={periodo} />
      ) : null}

      {/* ── Tabla de liquidaciones ────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Liquidaciones del período"
          descripcion={`Ordenadas por período descendente · ${fecha(rango.desde)} – ${fecha(rango.hasta)}`}
          acciones={
            estado ? (
              <Badge tono={tonoDeEstado(estado)}>{`Filtro: ${etiqueta(estado)}`}</Badge>
            ) : null
          }
        />
        <CardCuerpo className="px-0 py-0">
          {liquidaciones.length === 0 ? (
            <Vacio
              titulo="Sin liquidaciones en el período"
              mensaje="Cambia el conductor, el estado o el período. Las liquidaciones se generan al cierre de cada semana de operación."
              icono={<IconoLiquidacion width={22} height={22} />}
              accion={
                hayFiltros ? (
                  <Link href="/liquidaciones" className="text-xs text-sky-400 hover:text-sky-300">
                    Limpiar filtros
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Conductor</Th>
                  <Th>Período</Th>
                  <Th alineacion="derecha">Base</Th>
                  <Th alineacion="derecha">Comisiones</Th>
                  <Th alineacion="derecha">Bonificaciones</Th>
                  <Th alineacion="derecha">Deducciones</Th>
                  <Th alineacion="derecha">Total a pagar</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {liquidaciones.map((l) => (
                  <FilaLiquidacion
                    key={l.id}
                    liquidacion={l}
                    resaltada={l.conductor_id === conductorFiltro}
                    puedeEditar={puedeEditar}
                  />
                ))}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-500">
          <IconoReloj width={13} height={13} />
          <span>
            {entero(kpis.numero)} liquidaciones · {moneda(kpis.totalLiquidado)} liquidado ·{' '}
            {moneda(kpis.totalPendiente)} pendiente · {moneda(kpis.totalPagado)} pagado.
          </span>
          {estado ? (
            <span className="text-slate-600">
              El filtro de estado solo recorta la tabla; los totales cubren todos los estados del
              período.
            </span>
          ) : null}
          {!puedeEditar ? (
            <span className="text-slate-500">
              Solo lectura: tu perfil puede consultar las liquidaciones, pero no modificarlas.
            </span>
          ) : null}
        </div>
      </Card>
    </>
  );
}

/** Una fila de la tabla, con las acciones válidas según el estado. */
function FilaLiquidacion({
  liquidacion: l,
  resaltada,
  puedeEditar,
}: {
  liquidacion: LiquidacionDetallada;
  resaltada: boolean;
  /** Si es falso (solo lectura) no se pinta ningún control de escritura. */
  puedeEditar: boolean;
}) {
  const contratista = l.tipo_vinculacion === 'contratista';

  return (
    <Tr className={resaltada ? 'bg-sky-500/5 hover:bg-sky-500/10' : undefined}>
      <Td className="num text-slate-400">{l.codigo}</Td>
      <Td>
        <Link
          href={`/liquidaciones?conductor=${l.conductor_id}${
            l.estado !== 'borrador' ? `&estado=${l.estado}` : ''
          }`}
          className="font-medium text-slate-200 hover:text-sky-300"
        >
          {l.conductor}
        </Link>
        <span className="block text-[11px] text-slate-500">
          {l.conductor_codigo} · {etiqueta(l.tipo_vinculacion)}
        </span>
      </Td>
      <Td className="whitespace-nowrap text-slate-400">
        {fecha(l.periodo_inicio)} – {fecha(l.periodo_fin)}
      </Td>
      <Td alineacion="derecha">
        {l.base > 0 ? (
          <span className="text-slate-200">{moneda(l.base)}</span>
        ) : (
          <span className="text-slate-500" title="Los contratistas no tienen base salarial">
            — sin base
          </span>
        )}
      </Td>
      <Td alineacion="derecha">
        {l.comisiones > 0 ? (
          <span className="text-slate-200">{moneda(l.comisiones)}</span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
        {contratista ? (
          <span className="block text-[11px] text-slate-500">
            {porcentaje(l.comision_pct, 1)} de comisión
          </span>
        ) : null}
      </Td>
      <Td alineacion="derecha">
        {l.bonificaciones > 0 ? (
          <span className="text-emerald-300">{moneda(l.bonificaciones)}</span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </Td>
      <Td alineacion="derecha">
        {l.deducciones > 0 ? (
          <span className="text-rose-300">−{moneda(l.deducciones)}</span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </Td>
      <Td alineacion="derecha">
        <span
          className={`font-semibold ${
            l.estado === 'pagada' ? 'text-emerald-300' : 'text-slate-100'
          }`}
        >
          {moneda(l.total_pagar)}
        </span>
      </Td>
      <Td>
        <Badge tono={tonoDeEstado(l.estado)}>{etiqueta(l.estado)}</Badge>
        {l.fecha_pago ? (
          <span className="num block text-[11px] text-slate-500">
            Pagada el {fecha(l.fecha_pago)}
          </span>
        ) : null}
      </Td>
      <Td>
        <div className="flex flex-wrap items-center gap-2">
          {!puedeEditar ? <span className="text-[11px] text-slate-500">Solo lectura</span> : null}

          {puedeEditar && l.estado === 'borrador' ? (
            <form action={aprobarLiquidacion}>
              <input type="hidden" name="liquidacionId" value={l.id} />
              <button
                type="submit"
                className="rounded-lg border border-emerald-500/40 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/10"
              >
                Aprobar
              </button>
            </form>
          ) : null}

          {puedeEditar && l.estado === 'aprobada' ? (
            <form action={marcarLiquidacionPagada}>
              <input type="hidden" name="liquidacionId" value={l.id} />
              <button
                type="submit"
                className="rounded-lg border border-sky-500/40 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/10"
              >
                Marcar pagada
              </button>
            </form>
          ) : null}

          {puedeEditar && l.estado === 'borrador' ? (
            <form action={registrarDeduccion} className="flex items-center gap-1">
              <input type="hidden" name="liquidacionId" value={l.id} />
              <input
                type="number"
                name="monto"
                min="1000"
                step="1000"
                required
                placeholder="Monto"
                aria-label={`Monto de la deducción para la liquidación ${l.codigo}`}
                className="num w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
              />
              <button
                type="submit"
                className="rounded-lg border border-rose-500/40 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10"
              >
                Deducción
              </button>
            </form>
          ) : null}

          {l.estado === 'pagada' ? (
            <span className="text-[11px] text-slate-500">Cerrada</span>
          ) : null}
        </div>
      </Td>
    </Tr>
  );
}

/**
 * Bloque de auditoría que aparece al filtrar por un conductor: muestra la
 * operación del período liquidado y la contrasta con lo que se está pagando.
 */
function BloqueActividad({
  actividad: a,
  rango,
  periodo,
}: {
  actividad: ActividadLiquidada;
  rango: Rango;
  periodo: string | undefined;
}) {
  const contratista = a.tipo_vinculacion === 'contratista';
  const totalRegistrado = a.baseLiquidada + a.comisionesLiquidadas + a.bonificaciones;
  const diferencia =
    contratista && a.comisionesLiquidadas > 0
      ? a.comisionesLiquidadas - a.comisionCalculada
      : 0;

  return (
    <Card className="mt-4 border-sky-500/30">
      <CardCabecera
        titulo={`Auditoría de ${a.conductor}`}
        descripcion={
          <>
            Actividad entre el {fecha(rango.desde)} y el {fecha(rango.hasta)}
            {periodo ? '' : ' (mes en curso)'} contrastada con las liquidaciones del período.
          </>
        }
        acciones={
          <>
            <Badge tono={contratista ? 'violeta' : 'info'}>
              {etiqueta(a.tipo_vinculacion)}
            </Badge>
            <Link
              href={`/conductores?q=${encodeURIComponent(a.conductor)}`}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              Ficha en conductores →
            </Link>
          </>
        }
      />
      <CardCuerpo>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* Operación del período liquidado */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Operación del período liquidado
            </p>
            <dl className="mt-2.5 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Rutas completadas</dt>
                <dd className="num text-slate-200">{entero(a.rutas_completadas)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Envíos entregados</dt>
                <dd className="num text-slate-200">{entero(a.entregados)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Novedades y devoluciones</dt>
                <dd className="num text-amber-300">{entero(a.novedades)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-slate-800 pt-2">
                <dt className="text-slate-400">Ingresos generados por esas rutas</dt>
                <dd className="num text-slate-200">{moneda(a.ingresos)}</dd>
              </div>
              {a.entregados > 0 ? (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">Ingreso medio por envío</dt>
                  <dd className="num text-slate-400">{moneda(a.ingresos / a.entregados)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Liquidaciones en el período</dt>
                <dd className="num text-slate-400">{entero(a.liquidaciones)}</dd>
              </div>
            </dl>
          </div>

          {/* Verificación del cálculo */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Verificación del cálculo
            </p>
            <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="bg-sky-500"
                style={{ width: `${totalRegistrado > 0 ? (a.baseLiquidada / totalRegistrado) * 100 : 0}%` }}
                title={`Base: ${moneda(a.baseLiquidada)}`}
              />
              <div
                className="bg-violet-500"
                style={{
                  width: `${totalRegistrado > 0 ? (a.comisionesLiquidadas / totalRegistrado) * 100 : 0}%`,
                }}
                title={`Comisiones: ${moneda(a.comisionesLiquidadas)}`}
              />
              <div
                className="bg-emerald-500"
                style={{
                  width: `${totalRegistrado > 0 ? (a.bonificaciones / totalRegistrado) * 100 : 0}%`,
                }}
                title={`Bonificaciones: ${moneda(a.bonificaciones)}`}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-sky-500" />
                Base
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-violet-500" />
                Comisiones
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                Bonificaciones
              </span>
            </div>

            <dl className="mt-3 space-y-2 border-t border-slate-800 pt-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">
                  Base liquidada
                  {contratista ? ' (los contratistas no tienen base)' : ' (salario_base / 4)'}
                </dt>
                <dd className="num text-slate-200">{moneda(a.baseLiquidada)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Comisiones liquidadas</dt>
                <dd className="num text-slate-200">{moneda(a.comisionesLiquidadas)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Bonificaciones</dt>
                <dd className="num text-emerald-300">{moneda(a.bonificaciones)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Deducciones</dt>
                <dd className="num text-rose-300">−{moneda(a.deducciones)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-slate-800 pt-2">
                <dt className="font-medium text-slate-300">
                  {contratista
                    ? `Comisión esperada (${porcentaje(a.comision_pct, 1)} de ${moneda(a.ingresos)})`
                    : 'Salario base de referencia'}
                </dt>
                <dd className="num font-medium text-slate-100">
                  {contratista ? moneda(a.comisionCalculada) : moneda(a.salario_base)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Pagado</dt>
                <dd className="num text-emerald-300">{moneda(a.totalPagado)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Pendiente de pago</dt>
                <dd className="num text-amber-300">{moneda(a.totalPendiente)}</dd>
              </div>
            </dl>

            {contratista ? (
              <p
                className={`mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                  a.comisionesLiquidadas === 0
                    ? 'bg-slate-800/60 text-slate-400'
                    : Math.abs(diferencia) <= Math.max(1000, a.comisionCalculada * 0.02)
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-amber-500/10 text-amber-300'
                }`}
              >
                <IconoAlerta width={13} height={13} className="mt-0.5 shrink-0" />
                {a.comisionesLiquidadas === 0 ? (
                  <span>
                    No hay comisiones liquidadas en el período. Revisa que existan rutas completadas
                    con envíos entregados a nombre de este conductor.
                  </span>
                ) : Math.abs(diferencia) <= Math.max(1000, a.comisionCalculada * 0.02) ? (
                  <span>
                    La comisión liquidada coincide con la esperada: {moneda(a.comisionesLiquidadas)}.
                  </span>
                ) : (
                  <span>
                    Diferencia de {moneda(Math.abs(diferencia))} entre la comisión liquidada y la
                    esperada. Puede deberse al redondeo, a un cambio del porcentaje o a envíos
                    entregados fuera del período liquidado; conviene revisarlo antes de aprobar.
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-sky-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-sky-300">
                <IconoAlerta width={13} height={13} className="mt-0.5 shrink-0" />
                <span>
                  Empleado: la base de cada liquidación es la cuarta parte de su salario mensual y no
                  depende de los envíos entregados. Su actividad se muestra solo como referencia
                  operativa.
                </span>
              </p>
            )}
          </div>
        </div>
      </CardCuerpo>
    </Card>
  );
}
