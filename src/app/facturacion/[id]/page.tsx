import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import {
  IconoAlerta,
  IconoCheck,
  IconoEquis,
  IconoFactura,
} from '@/components/ui/Iconos';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { parametros } from '@/config/empresa';
import { itemsDeFactura, obtenerFactura } from '@/db/queries/facturacion';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import {
  fecha,
  hoyISO,
  moneda,
  numero,
  plural,
  porcentaje,
} from '@/lib/format';
import { anularFactura, emitirFactura, marcarFacturaPagada } from '../actions';

export const dynamic = 'force-dynamic';

/** Etiqueta legible del estado de una factura. */
function etiquetaEstado(estado: string): string {
  switch (estado) {
    case 'borrador':
      return 'Borrador';
    case 'emitida':
      return 'Emitida';
    case 'pagada':
      return 'Pagada';
    case 'vencida':
      return 'Vencida';
    case 'anulada':
      return 'Anulada';
    default:
      return estado.replace(/_/g, ' ');
  }
}

const CLASE_BOTON_SECUNDARIO =
  'rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800';
const CLASE_BOTON_PELIGRO =
  'rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10';

export default async function PaginaDetalleFactura({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await requerirPermiso('facturacion');
  const { id } = await params;
  const facturaId = Number(id);
  if (!Number.isInteger(facturaId) || facturaId <= 0) notFound();

  const hoy = hoyISO();
  const factura = await obtenerFactura(facturaId, hoy);
  if (!factura) notFound();

  const items = await itemsDeFactura(factura.id);

  // `dias_mora` llega en 0 cuando la factura todavía no vence; solo cuenta como
  // mora si además sigue pendiente de pago.
  const cerrada = factura.estado === 'pagada' || factura.estado === 'anulada';
  const diasMora = cerrada ? 0 : factura.dias_mora;
  const vencida = !cerrada && diasMora > 0;
  const esBorrador = factura.estado === 'borrador';
  const esPendiente = factura.estado === 'emitida' || factura.estado === 'vencida';
  const esAnulable = esBorrador || esPendiente;
  // Los controles de edición solo se muestran a quien puede editar de verdad: la
  // acción ya los rechaza, pero ofrecer botones que no hacen nada es mala experiencia.
  const puedeEditar = puede(sesion.rol, 'facturacion', 'editar');

  return (
    <>
      <div className="mb-4">
        <Link href="/facturacion" className="text-xs text-slate-400 hover:text-slate-200">
          ← Volver a facturación
        </Link>
      </div>

      {/* ── Cabecera de la factura ────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="num text-xl font-semibold tracking-tight text-slate-50">
              {factura.numero}
            </h1>
            <BadgeEstado estado={factura.estado} texto={etiquetaEstado(factura.estado)} />
            {esBorrador ? <Badge tono="aviso">Sin emitir</Badge> : null}
            {factura.fecha_pago ? (
              <Badge tono="exito">Pagada el {fecha(factura.fecha_pago)}</Badge>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-slate-300">
            {factura.cliente}{' '}
            <span className="text-xs text-slate-500">· {factura.cliente_codigo}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>
              Emitida el <span className="text-slate-300">{fecha(factura.fecha_emision)}</span>
            </span>
            <span>
              Vence el <span className="text-slate-300">{fecha(factura.fecha_vencimiento)}</span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar ? (
            <>
              {esBorrador ? (
                <form action={emitirFactura}>
                  <input type="hidden" name="facturaId" value={factura.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
                  >
                    Emitir factura
                  </button>
                </form>
              ) : null}

              {esPendiente ? (
                <form action={marcarFacturaPagada}>
                  <input type="hidden" name="facturaId" value={factura.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    Registrar pago
                  </button>
                </form>
              ) : null}

              {esAnulable ? (
                <form action={anularFactura}>
                  <input type="hidden" name="facturaId" value={factura.id} />
                  <button
                    type="submit"
                    className={CLASE_BOTON_PELIGRO}
                    title="La factura anulada deja de contar en la cartera"
                  >
                    Anular
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Solo lectura: tu perfil puede consultar la factura, pero no modificarla.
            </p>
          )}

          {factura.estado === 'pagada' ? (
            <Badge tono="exito">
              <IconoCheck width={13} height={13} /> Cobrada
            </Badge>
          ) : null}
          {factura.estado === 'anulada' ? (
            <Badge tono="neutro">
              <IconoEquis width={13} height={13} /> Anulada
            </Badge>
          ) : null}
        </div>
      </div>

      {/* ── Aviso de mora ─────────────────────────────────────── */}
      {vencida ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
          <p className="flex items-center gap-2.5">
            <span className="rounded-lg bg-rose-500/20 p-1.5 text-rose-300">
              <IconoAlerta width={18} height={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-rose-200">
                Factura vencida hace {plural(diasMora, 'día', 'días')}
              </span>
              <span className="block text-xs text-rose-300/80">
                El pago se comprometió para el {fecha(factura.fecha_vencimiento)} y sigue pendiente.
              </span>
            </span>
          </p>
          <p className="num text-lg font-semibold text-rose-200">{moneda(factura.total)}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Detalle facturado ─────────────────────────────── */}
        <div className="xl:col-span-2">
          <Card>
            <CardCabecera
              titulo="Detalle facturado"
              descripcion="Servicios incluidos en la factura. Cada guía enlaza a su despacho."
              acciones={
                <span className="num text-xs text-slate-400">
                  {plural(items.length, 'concepto', 'conceptos')}
                </span>
              }
            />
            <CardCuerpo className="px-0 py-0">
              {items.length === 0 ? (
                <Vacio
                  titulo="Sin conceptos facturados"
                  mensaje="Esta factura no tiene ítems registrados."
                  icono={<IconoFactura width={22} height={22} />}
                />
              ) : (
                <TablaCaja>
                  <thead>
                    <tr>
                      <Th>Descripción</Th>
                      <Th>Guía</Th>
                      <Th alineacion="derecha">Cantidad</Th>
                      <Th alineacion="derecha">Valor unitario</Th>
                      <Th alineacion="derecha">Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <Tr key={it.id}>
                        <Td className="max-w-80 text-slate-200">{it.descripcion}</Td>
                        <Td>
                          {it.guia ? (
                            <Link
                              href={`/rastreo?guia=${encodeURIComponent(it.guia)}`}
                              className="font-medium text-sky-300 hover:text-sky-200"
                              title="Ver la trazabilidad de la guía"
                            >
                              {it.guia}
                            </Link>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </Td>
                        <Td alineacion="derecha">{numero(it.cantidad, 0)}</Td>
                        <Td alineacion="derecha" className="text-slate-300">
                          {moneda(it.valor_unitario)}
                        </Td>
                        <Td alineacion="derecha" className="font-medium text-slate-100">
                          {moneda(it.total)}
                        </Td>
                      </Tr>
                    ))}
                    <Tr className="hover:bg-transparent">
                      <Td colSpan={4} className="text-slate-400">
                        Suma de conceptos
                      </Td>
                      <Td alineacion="derecha" className="text-slate-200">
                        {moneda(items.reduce((s, it) => s + it.total, 0))}
                      </Td>
                    </Tr>
                  </tbody>
                </TablaCaja>
              )}
            </CardCuerpo>
          </Card>
        </div>

        {/* ── Cliente y totales ─────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardCabecera titulo="Cliente" descripcion="Datos de facturación y contacto de cobro" />
            <CardCuerpo>
              <dl className="space-y-2.5 text-xs">
                <div>
                  <dt className="text-slate-500">Razón social</dt>
                  <dd className="text-sm text-slate-200">{factura.cliente}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-800 pt-2.5">
                  <dt className="text-slate-400">Código</dt>
                  <dd className="num text-slate-300">{factura.cliente_codigo}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Identificación fiscal</dt>
                  <dd className="num text-slate-300">{factura.cliente_id_fiscal ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Contacto</dt>
                  <dd className="text-slate-300">{factura.cliente_contacto ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Teléfono</dt>
                  <dd className="num text-slate-300">{factura.cliente_telefono ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Email</dt>
                  <dd className="max-w-40 truncate text-slate-300">{factura.cliente_email ?? '—'}</dd>
                </div>
              </dl>
            </CardCuerpo>
          </Card>

          <Card>
            <CardCabecera titulo="Totales" descripcion="Desglose de la factura" />
            <CardCuerpo>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-400">Subtotal</dt>
                  <dd className="num text-slate-200">{moneda(factura.subtotal)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2.5">
                  <dt className="text-slate-400">
                    Impuesto ({porcentaje(parametros.impuestoVentasPct, 0)})
                  </dt>
                  <dd className="num text-slate-200">{moneda(factura.impuesto)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2.5">
                  <dt className="text-sm font-medium text-slate-300">Total</dt>
                  <dd className="num text-lg font-semibold text-slate-50">
                    {moneda(factura.total)}
                  </dd>
                </div>
              </dl>
            </CardCuerpo>
          </Card>

          <Card>
            <CardCabecera titulo="Seguimiento" descripcion="Fechas y estado del documento" />
            <CardCuerpo>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-400">Estado</dt>
                  <dd>
                    <BadgeEstado estado={factura.estado} texto={etiquetaEstado(factura.estado)} />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2.5">
                  <dt className="text-slate-400">Fecha de emisión</dt>
                  <dd className="text-slate-200">{fecha(factura.fecha_emision)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-400">Fecha de vencimiento</dt>
                  <dd className="text-slate-200">{fecha(factura.fecha_vencimiento)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-400">Fecha de pago</dt>
                  <dd className="text-slate-200">
                    {factura.fecha_pago ? fecha(factura.fecha_pago) : 'Pendiente'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2.5">
                  <dt className="text-slate-400">Días de mora</dt>
                  <dd
                    className={
                      diasMora > 0
                        ? 'num font-semibold text-rose-300'
                        : 'num text-emerald-300'
                    }
                  >
                    {diasMora > 0 ? plural(diasMora, 'día', 'días') : 'Al día'}
                  </dd>
                </div>
                {factura.notas ? (
                  <div className="border-t border-slate-800 pt-2.5">
                    <dt className="text-slate-400">Notas</dt>
                    <dd className="mt-0.5 text-slate-300">{factura.notas}</dd>
                  </div>
                ) : null}
              </dl>
            </CardCuerpo>
          </Card>

          {esAnulable ? (
            <Card>
              <CardCabecera titulo="Acciones" descripcion="Cambios de estado permitidos" />
              <CardCuerpo>
                {puedeEditar ? (
                  <div className="flex flex-col gap-2">
                    {esBorrador ? (
                      <form action={emitirFactura}>
                        <input type="hidden" name="facturaId" value={factura.id} />
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
                        >
                          Emitir factura
                        </button>
                      </form>
                    ) : null}
                    {esPendiente ? (
                      <form action={marcarFacturaPagada}>
                        <input type="hidden" name="facturaId" value={factura.id} />
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                        >
                          Registrar pago
                        </button>
                      </form>
                    ) : null}
                    <form action={anularFactura}>
                      <input type="hidden" name="facturaId" value={factura.id} />
                      <button type="submit" className={`w-full ${CLASE_BOTON_PELIGRO}`}>
                        Anular factura
                      </button>
                    </form>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Una factura anulada deja de contar en la cartera y no puede volver a
                      emitirse desde este módulo.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Solo lectura: tu perfil puede consultar la factura, pero no modificarla.
                  </p>
                )}
              </CardCuerpo>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-slate-500">
          Consulta generada el {fecha(hoy)} con los datos vigentes de la cartera.
        </p>
        <Link href="/facturacion" className={CLASE_BOTON_SECUNDARIO}>
          Volver al listado
        </Link>
      </div>
    </>
  );
}
