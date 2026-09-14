import Link from 'next/link';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { BarrasHorizontales } from '@/components/ui/Grafica';
import {
  IconoAlerta,
  IconoCheck,
  IconoFactura,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { BarraProporcion } from '@/components/ui/Progreso';
import { FilaVacia, TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import {
  agingCartera,
  clientesConFacturas,
  concentracionPorCliente,
  facturasEnMora,
  listarFacturas,
  resumenFacturacion,
  type EstadoFactura,
  type FiltrosFacturas,
} from '@/db/queries/facturacion';
import { requerirPermiso } from '@/lib/auth/sesion';
import {
  aISO,
  entero,
  etiqueta,
  fecha,
  fechaCorta,
  hoyISO,
  moneda,
  monedaCorta,
  plural,
  sumarDias,
} from '@/lib/format';
import { listaMeses, nombreMes } from '@/lib/periodos';

export const dynamic = 'force-dynamic';

const ESTADOS: EstadoFactura[] = ['borrador', 'emitida', 'vencida', 'pagada', 'anulada'];

/** Clases Tailwind del semáforo de mora, alineadas con el semáforo del kit. */
function clasesMora(dias: number): string {
  if (dias > 90) return 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30';
  if (dias > 60) return 'bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30';
  if (dias > 30) return 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30';
  return 'bg-yellow-500/10 text-yellow-200 ring-1 ring-inset ring-yellow-500/25';
}

const CLASE_CAMPO =
  'rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';

export default async function PaginaFacturacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirPermiso('facturacion');
  const sp = await searchParams;
  const texto = (clave: string) => {
    const valor = sp[clave];
    return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
  };

  const estadoCrudo = texto('estado');
  const estado: EstadoFactura | 'todas' =
    estadoCrudo && (ESTADOS as string[]).includes(estadoCrudo)
      ? (estadoCrudo as EstadoFactura)
      : 'todas';
  const clienteCrudo = texto('cliente');
  const clienteId = clienteCrudo && /^\d+$/.test(clienteCrudo) ? Number(clienteCrudo) : undefined;
  const mesCrudo = texto('mes');
  const mes = mesCrudo && /^\d{4}-\d{2}$/.test(mesCrudo) ? mesCrudo : undefined;
  const q = texto('q');

  const filtros: FiltrosFacturas = { estado, clienteId, mes, busqueda: q };
  const hayFiltros = Boolean(estadoCrudo || clienteCrudo || mesCrudo || q);

  // Los cortes de fecha se calculan en hora local; `date('now')` de SQLite
  // trabajaría en UTC y desplazaría un día los vencimientos.
  const hoy = hoyISO();
  const corteProximo = aISO(sumarDias(new Date(), 8));

  const facturas = await listarFacturas(filtros);
  const resumen = await resumenFacturacion(filtros, hoy);
  const aging = await agingCartera(hoy);
  const mora = await facturasEnMora(hoy, 60);
  const concentracion = await concentracionPorCliente({ clienteId, mes, busqueda: q }, 8);
  const clientes = await clientesConFacturas();
  const meses = listaMeses(12);

  const pendienteAging = aging.reduce((s, t) => s + t.monto, 0);
  const maxMora = Math.max(1, ...mora.map((f) => f.dias_mora));
  // Base de participación del cuadro por estado: incluye borradores y anuladas,
  // que quedan fuera del indicador de «facturado».
  const totalConBorradores = resumen.porEstado.reduce((s, e) => s + e.total, 0);
  const nombresMes = new Map(meses.map((m) => [m.valor, m.etiqueta]));
  const alcanceMes = mes ? (nombresMes.get(mes) ?? mes) : `Últimos 12 meses hasta ${nombreMes()}`;

  const opcionesEstado = [
    { valor: 'todas', etiqueta: 'Todas' },
    ...ESTADOS.map((e) => ({ valor: e as string, etiqueta: etiqueta(e) })),
  ];

  return (
    <>
      <EncabezadoPagina
        titulo="Facturación y cartera"
        descripcion="Facturas por cliente, recaudo pendiente y gestión diaria de cobro. Los indicadores se recalculan en cada visita a partir de las facturas registradas."
        acciones={
          <>
            <Badge tono="info">{alcanceMes}</Badge>
            <Badge tono="neutro">{plural(resumen.facturasPendientes, 'pendiente', 'pendientes')}</Badge>
          </>
        }
      />

      {/* ── Indicadores de cartera ────────────────────────────── */}
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Total facturado"
          valor={monedaCorta(resumen.totalFacturado)}
          detalle={`${moneda(resumen.totalFacturado)} · ${moneda(resumen.impuestoFacturado)} de IVA`}
          icono={<IconoFactura width={16} height={16} />}
          acento="cielo"
          pie={
            <p className="text-xs text-slate-500">
              Conceptos por {moneda(resumen.subtotalFacturado)} antes de impuestos
            </p>
          }
        />
        <Kpi
          etiqueta="Total cobrado"
          valor={monedaCorta(resumen.totalCobrado)}
          detalle={moneda(resumen.totalCobrado)}
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
          pie={
            resumen.totalFacturado > 0 ? (
              <BarraProporcion
                etiqueta="Recaudo sobre lo facturado"
                valor={resumen.totalCobrado}
                total={resumen.totalFacturado}
                color="bg-emerald-500"
              />
            ) : (
              <p className="text-xs text-slate-500">Sin facturación en el período</p>
            )
          }
        />
        <Kpi
          etiqueta="Por cobrar"
          valor={monedaCorta(resumen.porCobrar)}
          detalle={`${plural(resumen.facturasPendientes, 'factura pendiente', 'facturas pendientes')}`}
          icono={<IconoReloj width={16} height={16} />}
          acento="ambar"
          pie={
            <p className="text-xs text-slate-500">
              {moneda(resumen.porCobrar - resumen.vencido)} aún dentro del plazo de pago
            </p>
          }
        />
        <Kpi
          etiqueta="Vencido"
          valor={monedaCorta(resumen.vencido)}
          detalle={`${plural(resumen.facturasVencidas, 'factura vencida', 'facturas vencidas')}`}
          icono={<IconoAlerta width={16} height={16} />}
          acento={resumen.vencido > 0 ? 'rosa' : 'esmeralda'}
          pie={
            <p className="text-xs text-slate-500">
              {resumen.porCobrar > 0
                ? `${Math.round((resumen.vencido / resumen.porCobrar) * 100)}% de la cartera pendiente`
                : 'Sin cartera pendiente'}
            </p>
          }
        />
      </RejillaKpi>

      {/* ── Aging y concentración por cliente ─────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardCabecera
            titulo="Antigüedad de cartera"
            descripcion="Facturas pendientes de cobro agrupadas por días transcurridos desde el vencimiento."
            acciones={<span className="num text-xs text-slate-400">{moneda(pendienteAging)} pendiente</span>}
          />
          <CardCuerpo>
            {pendienteAging <= 0 ? (
              <Vacio
                titulo="No hay cartera pendiente"
                mensaje="Todas las facturas emitidas están cobradas."
                icono={<IconoCheck width={22} height={22} />}
              />
            ) : (
              <>
                <BarrasHorizontales
                  datos={aging.map((t) => ({
                    etiqueta: t.etiqueta,
                    valor: t.monto,
                    detalle: `${moneda(t.monto)} · ${Math.round((t.monto / pendienteAging) * 100)}%`,
                  }))}
                  formato={moneda}
                />
                <dl className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                  {aging.map((t) => (
                    <div className="flex items-baseline justify-between gap-3" key={t.clave}>
                      <dt className="text-slate-400">{t.etiqueta}</dt>
                      <dd className="num text-slate-300">
                        {plural(t.n, 'factura', 'facturas')}
                        <span className="ml-2 text-slate-500">{moneda(t.monto)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Concentración por cliente"
            descripcion={`Clientes que más facturan · ${alcanceMes}`}
            acciones={
              <Link href="/facturacion" className="text-xs text-sky-400 hover:text-sky-300">
                Ver todas →
              </Link>
            }
          />
          <CardCuerpo>
            {concentracion.length === 0 ? (
              <Vacio
                titulo="Sin facturación en el período"
                mensaje="Ningún cliente tiene facturas con los filtros aplicados."
              />
            ) : (
              <TablaCaja>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th alineacion="derecha">Facturas</Th>
                    <Th alineacion="derecha">Facturado</Th>
                    <Th alineacion="derecha">Pendiente</Th>
                  </tr>
                </thead>
                <tbody>
                  {concentracion.map((c) => (
                    <Tr key={c.cliente_id}>
                      <Td>
                        <Link
                          href={`/facturacion?cliente=${c.cliente_id}`}
                          className="block max-w-48 truncate font-medium text-slate-200 hover:text-sky-300"
                        >
                          {c.cliente}
                        </Link>
                        <span className="block text-[11px] text-slate-500">
                          {Math.round((c.facturado / Math.max(1, resumen.totalFacturado)) * 100)}% de lo
                          facturado
                        </span>
                      </Td>
                      <Td alineacion="derecha">{entero(c.n)}</Td>
                      <Td alineacion="derecha" className="text-slate-200">
                        {moneda(c.facturado)}
                      </Td>
                      <Td alineacion="derecha">
                        <span className={c.pendiente > 0 ? 'text-amber-300' : 'text-slate-500'}>
                          {moneda(c.pendiente)}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TablaCaja>
            )}
          </CardCuerpo>
        </Card>
      </div>

      {/* ── Bandeja de cobro ──────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Facturas vencidas que requieren gestión de cobro"
          descripcion="Ordenadas por días de mora. Es la bandeja diaria del área administrativa."
          acciones={
            <Badge tono={mora.length > 0 ? 'peligro' : 'exito'}>
              {mora.length > 0 ? `${entero(mora.length)} por gestionar` : 'Cartera al día'}
            </Badge>
          }
        />
        <CardCuerpo className="px-0 py-0">
          {mora.length === 0 ? (
            <Vacio
              titulo="No hay facturas vencidas"
              mensaje="Ninguna factura pendiente superó su fecha de vencimiento."
              icono={<IconoCheck width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Factura</Th>
                  <Th>Cliente</Th>
                  <Th>Contacto</Th>
                  <Th alineacion="derecha">Mora</Th>
                  <Th>Antigüedad</Th>
                  <Th alineacion="derecha">Monto</Th>
                  <Th alineacion="derecha">Vencimiento</Th>
                </tr>
              </thead>
              <tbody>
                {mora.map((f) => (
                  <Tr key={f.id}>
                    <Td>
                      <Link
                        href={`/facturacion/${f.id}`}
                        className="font-medium text-sky-300 hover:text-sky-200"
                      >
                        {f.numero}
                      </Link>
                      <span className="block text-[11px] text-slate-500">
                        Emitida {fechaCorta(f.fecha_emision)}
                      </span>
                    </Td>
                    <Td>
                      <span className="block max-w-48 truncate text-slate-200">{f.cliente}</span>
                      <span className="block text-[11px] text-slate-500">{f.cliente_codigo}</span>
                    </Td>
                    <Td className="text-slate-400">
                      {f.cliente_contacto ?? '—'}
                      <span className="block text-[11px] text-slate-500">
                        {f.cliente_telefono ?? 'Sin teléfono'}
                      </span>
                    </Td>
                    <Td alineacion="derecha">
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${clasesMora(f.dias_mora)}`}
                      >
                        {plural(f.dias_mora, 'día', 'días')}
                      </span>
                    </Td>
                    <Td>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={
                            f.dias_mora > 90
                              ? 'h-full rounded-full bg-rose-500'
                              : f.dias_mora > 30
                                ? 'h-full rounded-full bg-amber-500'
                                : 'h-full rounded-full bg-yellow-500'
                          }
                          style={{ width: `${(f.dias_mora / maxMora) * 100}%` }}
                        />
                      </div>
                    </Td>
                    <Td alineacion="derecha" className="font-medium text-slate-100">
                      {moneda(f.total)}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-400">
                      {fechaCorta(f.fecha_vencimiento)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
      </Card>

      {/* ── Filtros y listado de facturas ─────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Facturas"
          descripcion="Selecciona una factura para ver su detalle, emitirla, cobrarla o anularla."
          acciones={
            hayFiltros ? (
              <Link href="/facturacion" className="text-xs text-slate-400 hover:text-slate-200">
                Limpiar filtros
              </Link>
            ) : null
          }
        />
        <CardCuerpo>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Estado
              <select name="estado" defaultValue={estado} className={CLASE_CAMPO}>
                {opcionesEstado.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Cliente
              <select
                name="cliente"
                defaultValue={clienteId ? String(clienteId) : ''}
                className={CLASE_CAMPO}
              >
                <option value="">Todos los clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Mes de emisión
              <select name="mes" defaultValue={mes ?? ''} className={CLASE_CAMPO}>
                <option value="">Todos los meses</option>
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Buscar
              <input
                name="q"
                defaultValue={q ?? ''}
                placeholder="Número de factura o cliente"
                className={CLASE_CAMPO}
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Filtrar
            </button>
          </form>
        </CardCuerpo>
        <CardCuerpo className="px-0 py-0">
          <TablaCaja>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Cliente</Th>
                <Th>Emisión</Th>
                <Th>Vencimiento</Th>
                <Th alineacion="derecha">Subtotal</Th>
                <Th alineacion="derecha">Impuesto</Th>
                <Th alineacion="derecha">Total</Th>
                <Th>Estado</Th>
                <Th alineacion="derecha">Mora</Th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 ? (
                <FilaVacia
                  colSpan={9}
                  mensaje={
                    hayFiltros
                      ? 'Ninguna factura coincide con los filtros aplicados.'
                      : 'Todavía no hay facturas registradas.'
                  }
                />
              ) : (
                facturas.map((f) => {
                  const porVencer =
                    f.estado === 'emitida' &&
                    f.fecha_vencimiento >= hoy &&
                    f.fecha_vencimiento <= corteProximo;
                  return (
                    <Tr key={f.id}>
                      <Td>
                        <Link
                          href={`/facturacion/${f.id}`}
                          className="font-medium text-sky-300 hover:text-sky-200"
                        >
                          {f.numero}
                        </Link>
                      </Td>
                      <Td>
                        <span className="block max-w-48 truncate text-slate-200">{f.cliente}</span>
                        <span className="block text-[11px] text-slate-500">{f.cliente_codigo}</span>
                      </Td>
                      <Td className="text-slate-400">{fecha(f.fecha_emision)}</Td>
                      <Td className="text-slate-400">
                        {fecha(f.fecha_vencimiento)}
                        {porVencer ? (
                          <Badge tono="aviso" className="ml-1.5">
                            Por vencer
                          </Badge>
                        ) : null}
                      </Td>
                      <Td alineacion="derecha" className="text-slate-300">
                        {moneda(f.subtotal)}
                      </Td>
                      <Td alineacion="derecha" className="text-slate-400">
                        {moneda(f.impuesto)}
                      </Td>
                      <Td alineacion="derecha" className="font-medium text-slate-100">
                        {moneda(f.total)}
                      </Td>
                      <Td>
                        <BadgeEstado estado={f.estado} texto={etiqueta(f.estado)} />
                      </Td>
                      <Td alineacion="derecha">
                        {f.estado === 'vencida' || (f.estado === 'emitida' && f.fecha_vencimiento < hoy) ? (
                          <span
                            className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${clasesMora(f.dias_mora)}`}
                          >
                            {plural(f.dias_mora, 'día', 'días')}
                          </span>
                        ) : f.estado === 'pagada' ? (
                          <span className="text-[11px] text-emerald-300">Pagada</span>
                        ) : (
                          <span className="text-[11px] text-slate-600">—</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </TablaCaja>
        </CardCuerpo>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardCabecera titulo="Composición por estado" descripcion="Número de facturas y valor en cada estado" />
          <CardCuerpo className="px-0 py-0">
            {resumen.porEstado.length === 0 ? (
              <Vacio titulo="Sin facturas registradas" />
            ) : (
              <TablaCaja>
                <thead>
                  <tr>
                    <Th>Estado</Th>
                    <Th alineacion="derecha">Facturas</Th>
                    <Th alineacion="derecha">Valor</Th>
                    <Th alineacion="derecha">Participación</Th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.porEstado.map((e) => (
                    <Tr key={e.estado}>
                      <Td>
                        <BadgeEstado estado={e.estado} texto={etiqueta(e.estado)} />
                      </Td>
                      <Td alineacion="derecha">{entero(e.n)}</Td>
                      <Td alineacion="derecha" className="text-slate-200">
                        {moneda(e.total)}
                      </Td>
                      <Td alineacion="derecha" className="text-slate-400">
                        {totalConBorradores > 0
                          ? `${Math.round((e.total / totalConBorradores) * 100)}%`
                          : '—'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TablaCaja>
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Resumen del período"
            descripcion="Lectura rápida de los indicadores de cartera"
          />
          <CardCuerpo>
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-slate-400">Facturado (con impuestos)</dt>
                <dd className="num text-sm text-slate-100">{moneda(resumen.totalFacturado)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-3">
                <dt className="text-xs text-slate-400">Cobrado</dt>
                <dd className="num text-sm text-emerald-300">{moneda(resumen.totalCobrado)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-3">
                <dt className="text-xs text-slate-400">Pendiente de cobro</dt>
                <dd className="num text-sm text-amber-300">{moneda(resumen.porCobrar)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-3">
                <dt className="text-xs text-slate-400">Vencido</dt>
                <dd className="num text-sm text-rose-300">{moneda(resumen.vencido)}</dd>
              </div>
              <div className="border-t border-slate-800 pt-3">
                <BarraProporcion
                  etiqueta="Efectividad de recaudo"
                  valor={resumen.totalCobrado}
                  total={resumen.totalFacturado}
                  color="bg-emerald-500"
                  detalle={moneda(resumen.totalCobrado)}
                />
              </div>
              <div className="border-t border-slate-800 pt-3">
                <BarraProporcion
                  etiqueta="Cartera en mora"
                  valor={resumen.vencido}
                  total={resumen.porCobrar}
                  color="bg-rose-500"
                  detalle={moneda(resumen.vencido)}
                />
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
              {aging.map((t) => (
                <Badge key={t.clave} tono={t.monto > 0 && t.clave !== 'por_vencer' ? 'aviso' : 'neutro'}>
                  {t.etiqueta}: {entero(t.n)}
                </Badge>
              ))}
            </div>
          </CardCuerpo>
        </Card>
      </div>
    </>
  );
}
