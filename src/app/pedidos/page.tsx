import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta, IconoCaja, IconoCheck, IconoReloj } from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { FilaVacia, TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { listarRutas, zonasOperativas } from '@/db/queries/despachos';
import {
  clientesParaPedidos,
  contarPedidosPorSituacion,
  listarPedidos,
  resumenBuzon,
  type SituacionPedido,
} from '@/db/queries/pedidos';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aISO, entero, etiqueta, fechaCorta, hora, moneda, numero, sumarDias } from '@/lib/format';
import { asignarARuta, descartarPedido } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pedidos',
};

/**
 * Buzón de pedidos: lo que ha entrado y todavía no está en ninguna ruta.
 *
 * La distinción que da sentido a esta pantalla es «¿ya tiene ruta?». Un pedido
 * recién recibido por WhatsApp no está «pendiente de entrega»: está pendiente de
 * **planificarse**. Cuando el despachador lo mete en una hoja de ruta deja de ser
 * un pedido y pasa a ser una parada.
 */

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

function primero(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

const SITUACIONES: { valor: SituacionPedido | 'todos'; texto: string }[] = [
  { valor: 'sin_asignar', texto: 'Sin asignar' },
  { valor: 'en_ruta', texto: 'En ruta' },
  { valor: 'resuelto', texto: 'Resueltos' },
  { valor: 'todos', texto: 'Todos' },
];

const TONO_SITUACION: Record<SituacionPedido, 'aviso' | 'info' | 'exito'> = {
  sin_asignar: 'aviso',
  en_ruta: 'info',
  resuelto: 'exito',
};

const TEXTO_SITUACION: Record<SituacionPedido, string> = {
  sin_asignar: 'Sin asignar',
  en_ruta: 'En ruta',
  resuelto: 'Resuelto',
};

/** Traduce los avisos de la URL al mensaje que se enseña arriba. */
function avisoDe(sp: ParametrosBusqueda): { texto: string; clase: string } | null {
  if (sp.creado === '1') {
    return {
      texto: 'Pedido registrado. Está en la lista de «Sin asignar» hasta que lo metas en una ruta.',
      clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    };
  }
  if (typeof sp.creados === 'string') {
    return {
      texto: `Se registraron ${sp.creados} pedidos del chat. Revísalos antes de planificarlos.`,
      clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    };
  }
  if (typeof sp.asignados === 'string') {
    return {
      texto: `${sp.asignados} pedidos repartidos en ${sp.paradas ?? '?'} paradas del despacho.`,
      clase: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    };
  }
  if (sp.descartado === '1') {
    return {
      texto: 'Pedido descartado.',
      clase: 'border-slate-700 bg-slate-800/50 text-slate-300',
    };
  }
  if (typeof sp.error === 'string') {
    const motivos: Record<string, string> = {
      ruta: 'Elige una ruta abierta para meter los pedidos.',
      'ruta-cerrada': 'Esa ruta ya está cerrada. Elige una planificada o en curso.',
      seleccion: 'No marcaste ningún pedido, o ya no están disponibles.',
    };
    return {
      texto: motivos[sp.error] ?? 'No se pudo completar la operación.',
      clase: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    };
  }
  return null;
}

export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const sesion = await requerirPermiso('pedidos');
  const sp = await searchParams;
  const puedeEditar = puede(sesion.rol, 'pedidos', 'editar');

  const situacionParam = primero(sp.situacion);
  const situacion: SituacionPedido | 'todos' = SITUACIONES.some((s) => s.valor === situacionParam)
    ? (situacionParam as SituacionPedido | 'todos')
    : 'sin_asignar';

  const zona = primero(sp.zona) || undefined;
  const clienteId = Number(primero(sp.cliente));
  const q = primero(sp.q) ?? '';

  const filtros = {
    situacion,
    zona,
    clienteId: Number.isFinite(clienteId) && clienteId > 0 ? clienteId : undefined,
    busqueda: q || undefined,
  };

  const [pedidos, conteos, resumen, clientes, zonas] = await Promise.all([
    listarPedidos(filtros),
    contarPedidosPorSituacion(filtros),
    resumenBuzon(),
    clientesParaPedidos(),
    zonasOperativas(),
  ]);

  // Rutas donde se pueden meter pedidos: solo las que siguen abiertas.
  const rutasAbiertas = (
    await listarRutas({
      desde: aISO(sumarDias(new Date(), -1)),
      hasta: aISO(sumarDias(new Date(), 7)),
      limite: 100,
    })
  ).filter((r) => r.estado === 'planificado' || r.estado === 'en_curso');

  const aviso = avisoDe(sp);
  const mostrarCasillas = puedeEditar && situacion === 'sin_asignar' && pedidos.length > 0;

  const tabla = (
    <Card>
      <CardCabecera
        titulo={SITUACIONES.find((s) => s.valor === situacion)?.texto ?? 'Pedidos'}
        descripcion={
          situacion === 'sin_asignar'
            ? 'Marcados los que quieras y elige a qué ruta van. Los que compartan dirección se agrupan en una sola parada.'
            : 'Pedidos que ya están en una hoja de ruta o que ya se resolvieron.'
        }
        acciones={<span className="num text-xs text-slate-400">{entero(pedidos.length)} pedidos</span>}
      />
      <CardCuerpo>
        {pedidos.length === 0 ? (
          <Vacio
            titulo={
              situacion === 'sin_asignar'
                ? 'No hay pedidos esperando'
                : 'No hay pedidos en esta vista'
            }
            mensaje={
              situacion === 'sin_asignar'
                ? 'Cuando llegue uno por WhatsApp, pégalo aquí y aparecerá en esta lista.'
                : 'Prueba con otro filtro.'
            }
            icono={<IconoCaja width={22} height={22} />}
          />
        ) : (
          <TablaCaja>
            <thead>
              <tr>
                {mostrarCasillas ? <Th /> : null}
                <Th>Guía</Th>
                <Th>Destinatario</Th>
                <Th>Dirección</Th>
                <Th alineacion="derecha">Bultos</Th>
                <Th alineacion="derecha">Cobrar</Th>
                <Th>Cliente</Th>
                <Th>Origen</Th>
                <Th>Situación</Th>
                <Th>Compromiso</Th>
                {mostrarCasillas ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <Tr key={p.id}>
                  {mostrarCasillas ? (
                    <Td>
                      <input
                        type="checkbox"
                        name="pedidoId"
                        value={p.id}
                        aria-label={`Seleccionar el pedido ${p.guia}`}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-sky-500"
                      />
                    </Td>
                  ) : null}
                  <Td className="num text-slate-300">{p.guia}</Td>
                  <Td>
                    <span className="block text-slate-200">{p.destinatario}</span>
                    {p.destinatario_tel ? (
                      <span className="num block text-[11px] text-slate-500">
                        {p.destinatario_tel}
                      </span>
                    ) : null}
                    {p.notas ? (
                      <span className="block max-w-56 truncate text-[11px] text-amber-300/80">
                        {p.notas}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="block max-w-64 truncate text-slate-300">
                      {p.direccion ?? '—'}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {p.zona ?? <span className="text-amber-300">Sin distrito</span>}
                      {p.peso_kg > 0 ? ` · ${numero(p.peso_kg, 1)} kg` : ''}
                    </span>
                  </Td>
                  <Td alineacion="derecha" className="num text-slate-300">
                    {entero(p.bultos)}
                  </Td>
                  <Td alineacion="derecha">
                    {p.cobro_entrega > 0 ? (
                      <span className="num font-medium text-amber-300">
                        {moneda(p.cobro_entrega)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-600">—</span>
                    )}
                  </Td>
                  <Td className="max-w-40 truncate text-slate-400">{p.cliente}</Td>
                  <Td>
                    <OriginBadge origen={p.origen} />
                  </Td>
                  <Td>
                    <Badge tono={TONO_SITUACION[p.situacion]}>
                      {TEXTO_SITUACION[p.situacion]}
                    </Badge>
                    {p.ruta_codigo ? (
                      <span className="mt-1 block text-[11px] text-slate-500">
                        {p.ruta_codigo}
                        {p.conductor ? ` · ${p.conductor}` : ''}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="block text-slate-400">
                      {p.fecha_compromiso ? fechaCorta(p.fecha_compromiso) : '—'}
                    </span>
                    <span className="block text-[11px] text-slate-600">
                      alta {hora(p.created_at)}
                    </span>
                  </Td>
                  {mostrarCasillas ? (
                    <Td alineacion="derecha">
                      <button
                        type="submit"
                        name="descartarId"
                        value={p.id}
                        formAction={descartarPedido}
                        title="Descartar este pedido"
                        className="text-[11px] text-slate-500 hover:text-rose-300"
                      >
                        Descartar
                      </button>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </TablaCaja>
        )}
      </CardCuerpo>
    </Card>
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos"
        descripcion="Lo que ha entrado y todavía no está en ninguna ruta. Desde aquí se planifica en un despacho."
        acciones={
          puedeEditar ? (
            <>
              <Link
                href="/pedidos/pegar"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Pegar un chat de WhatsApp
              </Link>
              <Link
                href="/pedidos/nuevo"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Nuevo pedido
              </Link>
            </>
          ) : null
        }
      />

      {aviso ? (
        <p
          role="status"
          className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${aviso.clase}`}
        >
          <IconoCheck width={16} height={16} className="mt-0.5 shrink-0" />
          {aviso.texto}
        </p>
      ) : null}

      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Sin asignar"
          valor={entero(resumen.sinAsignar)}
          detalle="Esperando a que se planifiquen"
          icono={<IconoCaja width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="En ruta"
          valor={entero(resumen.enRuta)}
          detalle="Ya tienen despacho asignado"
          icono={<IconoReloj width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Por cobrar"
          valor={moneda(resumen.porCobrar)}
          detalle="Contra entrega pendiente de cobro"
          icono={<IconoAlerta width={16} height={16} />}
          acento="rosa"
        />
        <Kpi
          etiqueta="Resueltos en esta vista"
          valor={entero(conteos.resuelto ?? 0)}
          detalle="Entregados, con novedad o devueltos"
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
        />
      </RejillaKpi>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <Card className="mt-4">
        <CardCuerpo>
          <form className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Ver
              <select
                name="situacion"
                defaultValue={situacion}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              >
                {SITUACIONES.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.texto}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Cliente
              <select
                name="cliente"
                defaultValue={clienteId > 0 ? String(clienteId) : ''}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              >
                <option value="">Todos</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Distrito
              <select
                name="zona"
                defaultValue={zona ?? ''}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              >
                <option value="">Todos</option>
                {zonas.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Buscar
              <input
                name="q"
                defaultValue={q}
                placeholder="Guía, destinatario, dirección, teléfono…"
                className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
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
      </Card>

      {/* ── Lista, con la barra de planificación ────────────── */}
      <div className="mt-4">
        {mostrarCasillas ? (
          <form action={asignarARuta}>
            {tabla}

            <div className="sticky bottom-20 z-20 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/40 bg-slate-900/95 px-4 py-3 backdrop-blur lg:bottom-4">
              <p className="text-sm text-slate-300">
                Marca los pedidos de arriba y elige a qué ruta van.
              </p>
              <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                Ruta
                <select
                  name="rutaId"
                  defaultValue={
                    rutasAbiertas.find((r) => r.estado === 'en_curso')?.id ??
                    rutasAbiertas[0]?.id ??
                    ''
                  }
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
                >
                  {rutasAbiertas.length === 0 ? <option value="">Sin rutas abiertas</option> : null}
                  {rutasAbiertas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} · {etiqueta(r.estado)} · {r.zona}
                      {r.placa ? ` · ${r.placa}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <BotonEnvio
                textoEnviando="Metiendo en la ruta…"
                disabled={rutasAbiertas.length === 0}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
              >
                Meter en la ruta
              </BotonEnvio>
            </div>
          </form>
        ) : (
          tabla
        )}
      </div>

      {conteos.sin_asignar !== undefined && situacion !== 'sin_asignar' ? (
        <p className="mt-3 text-xs text-slate-500">
          Hay {entero(conteos.sin_asignar)} pedidos sin asignar.{' '}
          <Link href="/pedidos?situacion=sin_asignar" className="text-sky-400 hover:text-sky-300">
            Verlos
          </Link>
        </p>
      ) : null}
    </>
  );
}

/** De dónde salió el pedido. Importa saberlo cuando algo viene mal escrito. */
function OriginBadge({ origen }: { origen: string }) {
  const mapa: Record<string, { texto: string; tono: 'neutro' | 'info' | 'exito' | 'violeta' }> = {
    whatsapp: { texto: 'WhatsApp', tono: 'exito' },
    manual: { texto: 'Manual', tono: 'neutro' },
    importacion: { texto: 'Planilla', tono: 'violeta' },
    ruta: { texto: 'Ruta', tono: 'info' },
  };
  const dato = mapa[origen] ?? { texto: origen, tono: 'neutro' as const };
  return <Badge tono={dato.tono}>{dato.texto}</Badge>;
}
