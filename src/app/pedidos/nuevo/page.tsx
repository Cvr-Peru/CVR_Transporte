import Link from 'next/link';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta } from '@/components/ui/Iconos';
import { clientesParaPedidos } from '@/db/queries/pedidos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO } from '@/lib/format';
import { ZONAS } from '@/lib/zonas';
import { crearPedido } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nuevo pedido',
};

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-600';

const ERRORES: Record<string, string> = {
  cliente: 'Elige el cliente que manda el pedido.',
  datos: 'Faltan el destinatario o la dirección: sin esos dos datos no hay pedido.',
};

/**
 * Alta manual de un pedido.
 *
 * Es el camino lento, para cuando llega uno suelto por teléfono. Para los que
 * vienen por WhatsApp en bloque está «Pegar un chat», que evita teclearlos.
 */
export default async function PaginaNuevoPedido({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('pedidos', 'editar');
  const sp = await searchParams;
  const clientes = await clientesParaPedidos();

  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo pedido"
        descripcion="Queda en la lista de «Sin asignar» hasta que se planifique en una ruta."
        acciones={
          <Link
            href="/pedidos"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver al buzón
          </Link>
        }
      />

      {error ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera
            titulo="Datos del envío"
            descripcion="Lo que el conductor necesita para llegar y cobrar."
          />
          <CardCuerpo>
            <form action={crearPedido} className="space-y-4">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Cliente que lo manda
                <select name="clienteId" required defaultValue="" className={CLASE_CAMPO}>
                  <option value="" disabled>
                    Elige un cliente
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Quién recibe
                  <input
                    name="destinatario"
                    required
                    autoComplete="off"
                    placeholder="Juan Pérez"
                    className={CLASE_CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Teléfono
                  <input
                    name="telefono"
                    autoComplete="off"
                    inputMode="tel"
                    placeholder="+51 987 654 321"
                    className={CLASE_CAMPO}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Dirección
                <input
                  name="direccion"
                  required
                  autoComplete="off"
                  placeholder="Av. Los Álamos 452, Dpto 301"
                  className={CLASE_CAMPO}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Distrito
                  <select name="zona" defaultValue="" className={CLASE_CAMPO}>
                    <option value="">Sin especificar</option>
                    {ZONAS.map((z) => (
                      <option key={z.nombre} value={z.nombre}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Entregar antes de
                  <input
                    type="date"
                    name="fechaCompromiso"
                    defaultValue={hoyISO()}
                    className={CLASE_CAMPO}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Bultos
                  <input
                    type="number"
                    name="bultos"
                    min={1}
                    max={99}
                    defaultValue={1}
                    className={CLASE_CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Peso (kg)
                  <input
                    type="number"
                    name="peso"
                    min={0}
                    step="0.1"
                    placeholder="0.5"
                    className={CLASE_CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Cobrar al entregar
                  <input
                    type="number"
                    name="cobro"
                    min={0}
                    step="0.1"
                    placeholder="0"
                    className={CLASE_CAMPO}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Referencias para el conductor
                <textarea
                  name="notas"
                  rows={2}
                  placeholder="Portón azul, preguntar por la Sra. Rosa. No dejar con el vecino."
                  className={CLASE_CAMPO}
                />
              </label>

              <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Registrar el pedido
                </button>
                <Link
                  href="/pedidos"
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Link>
              </div>
            </form>
          </CardCuerpo>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardCuerpo className="space-y-3 text-xs leading-relaxed text-slate-400">
              <h2 className="text-sm font-semibold text-slate-200">Lo que conviene rellenar</h2>
              <p>
                <span className="text-slate-300">El teléfono.</span> Es lo que usa el conductor
                cuando no encuentra la dirección, y sin él una parada fallida se convierte en un
                paquete devuelto.
              </p>
              <p>
                <span className="text-slate-300">El distrito.</span> Además de ordenar el reparto,
                es lo que sitúa la parada en el mapa: sin distrito, la parada cae en el centro de
                Lima.
              </p>
              <p>
                <span className="text-slate-300">El importe a cobrar.</span> Si no es cero, el
                conductor lo verá destacado en «Mi ruta». El cobro contra entrega aparece sumado en
                el buzón para saber cuánto dinero hay en la calle.
              </p>
            </CardCuerpo>
          </Card>

          <Card className="border-sky-500/30">
            <CardCuerpo className="space-y-2 text-xs leading-relaxed text-slate-400">
              <h2 className="text-sm font-semibold text-sky-200">¿Vienen varios de golpe?</h2>
              <p>
                Si el cliente te los manda por WhatsApp, no los teclees: copia el chat y pégalo en{' '}
                <Link href="/pedidos/pegar" className="text-sky-400 hover:text-sky-300">
                  Pegar un chat
                </Link>
                . Se separan solos y solo hay que revisar.
              </p>
            </CardCuerpo>
          </Card>
        </div>
      </div>
    </>
  );
}
