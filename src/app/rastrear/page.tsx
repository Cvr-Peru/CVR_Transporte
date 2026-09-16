import Link from 'next/link';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { IconoBuscar, IconoCaja, IconoCheck, IconoReloj } from '@/components/ui/Iconos';
import { buscarPorGuia, novedadesDeEnvio } from '@/db/queries/despachos';
import { identidad } from '@/db/queries/configuracion';
import { etiqueta, fecha, fechaHora, hora } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Rastrear un envío',
  description: 'Consulta el estado de tu envío con el número de guía.',
};

type Parametros = Record<string, string | string[] | undefined>;

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/**
 * La dirección y el nombre de quien recibe son datos personales. En una página
 * pública solo se muestran parcialmente: lo justo para que el cliente reconozca
 * su envío, sin exponer la información completa a quien tenga el número de guía.
 */
function enmascararDireccion(direccion: string | null): string {
  if (!direccion) return '—';
  const corte = direccion.indexOf('#');
  if (corte === -1) return direccion;
  return `${direccion.slice(0, corte + 1)} ${direccion.slice(corte + 1).replace(/\d/g, '*')}`;
}

function enmascararNombre(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const primero = partes[0] ?? '';
  const segundo = partes[1] ? ` ${partes[1][0]}.` : '';
  return `${primero}${segundo}`;
}

const PASOS = [
  { clave: 'recibido', titulo: 'Recibido', detalle: 'El envío fue registrado en el sistema' },
  { clave: 'reparto', titulo: 'En reparto', detalle: 'Está en la ruta de entrega' },
  { clave: 'final', titulo: 'Entrega', detalle: 'Resultado final de la entrega' },
];

function pasoActual(estado: string): number {
  if (estado === 'pendiente') return 0;
  if (estado === 'en_reparto') return 1;
  return 2;
}

export default async function PaginaRastrear({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const sp = await searchParams;
  const guia = primero(sp.guia).trim();

  const envio = guia ? await buscarPorGuia(guia) : null;
  const novedades = envio ? await novedadesDeEnvio(envio.id) : [];
  const actual = envio ? pasoActual(envio.estado) : -1;

  // Esta página la ve el cliente final: lleva el nombre y el logo de la empresa
  // que le está entregando el paquete, no los del programa.
  const marca = await identidad();

  return (
    <>
      <div className="mb-5 text-center">
        <span className="mb-3 inline-flex rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-3 text-white">
          <IconoCaja width={26} height={26} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">Rastrear un envío</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          Escribe el número de guía que aparece en tu comprobante para ver dónde va tu paquete.
        </p>
      </div>

      <Card>
        <CardCuerpo>
          <form method="get" className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Número de guía</span>
              <input
                name="guia"
                defaultValue={guia}
                placeholder="TR-20260913-02945"
                autoComplete="off"
                autoCapitalize="characters"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              <IconoBuscar width={16} height={16} />
              Rastrear
            </button>
          </form>
        </CardCuerpo>
      </Card>

      {guia && !envio ? (
        <Card className="mt-4">
          <CardCuerpo className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="rounded-full bg-slate-800/70 p-3 text-slate-500">
              <IconoBuscar width={22} height={22} />
            </span>
            <p className="text-sm font-medium text-slate-300">No encontramos esa guía</p>
            <p className="max-w-sm text-xs text-slate-500">
              Revisa que el número <span className="text-slate-300">{guia}</span> esté completo y
              sin espacios. Si el problema continúa, comunícate con nosotros al{' '}
              {marca.telefono}.
            </p>
          </CardCuerpo>
        </Card>
      ) : null}

      {envio ? (
        <>
          <Card className="mt-4">
            <CardCuerpo>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Guía</p>
                  <p className="num text-lg font-semibold text-slate-100">{envio.guia}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {envio.cliente} · {etiqueta(envio.zona ?? '')}
                  </p>
                </div>
                <BadgeEstado estado={envio.estado} texto={etiqueta(envio.estado)} />
              </div>

              {/* ── Línea de progreso ─────────────────────────── */}
              <ol className="mt-5 space-y-3">
                {PASOS.map((paso, i) => {
                  const hecho = actual >= i;
                  const esFinal = i === 2;
                  const fallido = esFinal && (envio.estado === 'novedad' || envio.estado === 'devuelto');
                  return (
                    <li key={paso.clave} className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          fallido && esFinal
                            ? 'bg-rose-500/15 text-rose-300'
                            : hecho
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {hecho ? <IconoCheck width={13} height={13} /> : i + 1}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm ${hecho ? 'text-slate-200' : 'text-slate-500'}`}
                        >
                          {paso.titulo}
                          {esFinal && envio.estado === 'entregado'
                            ? ` · ${envio.receptor ? `recibió ${enmascararNombre(envio.receptor)}` : 'completada'}`
                            : ''}
                          {fallido && esFinal ? ` · ${etiqueta(envio.estado)}` : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          {esFinal
                            ? envio.fecha_entrega
                              ? fechaHora(envio.fecha_entrega)
                              : `Comprometida para ${fecha(envio.fecha_compromiso)}`
                            : paso.detalle}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {envio.intentos > 1 ? (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                  <IconoReloj width={14} height={14} className="mt-0.5 shrink-0" />
                  Llevamos {envio.intentos} intentos de entrega. Si necesitas coordinar una nueva
                  visita, escríbenos.
                </p>
              ) : null}
            </CardCuerpo>
          </Card>

          <Card className="mt-4">
            <CardCuerpo className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Datos del envío</h2>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-500">Destinatario</dt>
                  <dd className="text-slate-300">{enmascararNombre(envio.destinatario)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Dirección de entrega</dt>
                  <dd className="text-slate-300">{enmascararDireccion(envio.direccion)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Ciudad</dt>
                  <dd className="text-slate-300">{envio.ciudad ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Fecha comprometida</dt>
                  <dd className="text-slate-300">{fecha(envio.fecha_compromiso)}</dd>
                </div>
                {envio.placa ? (
                  <div>
                    <dt className="text-xs text-slate-500">Vehículo asignado</dt>
                    <dd className="text-slate-300">{envio.placa}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
                Por seguridad mostramos solo parte del nombre y de la dirección. Si algo no
                coincide, comunícate con nosotros al {marca.telefono}.
              </p>
            </CardCuerpo>
          </Card>

          {novedades.length > 0 ? (
            <Card className="mt-4">
              <CardCuerpo className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-200">
                  Novedades del reparto
                </h2>
                <ul className="space-y-2">
                  {novedades.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tono={n.resuelto ? 'exito' : 'aviso'}>{etiqueta(n.tipo)}</Badge>
                        <span className="num text-[11px] text-slate-500">
                          {hora(n.fecha)}
                        </span>
                        {n.resuelto ? (
                          <span className="text-[11px] text-emerald-300">Resuelta</span>
                        ) : null}
                      </div>
                      {n.descripcion ? (
                        <p className="mt-1.5 text-xs text-slate-400">{n.descripcion}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardCuerpo>
            </Card>
          ) : null}
        </>
      ) : null}

      <p className="mt-6 text-center text-xs text-slate-600">
        {marca.nombre} · {marca.telefono}
        {' · '}
        <Link href="/" className="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
          Entrar al panel interno
        </Link>
      </p>
    </>
  );
}
