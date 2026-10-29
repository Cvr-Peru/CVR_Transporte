import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvisoError } from '@/components/formulario/Campos';
import { PanelBaja } from '@/components/formulario/PanelBaja';
import { Badge } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { escalar } from '@/db/client';
import { obtenerCliente } from '@/db/queries/clientes';
import { requerirPermiso } from '@/lib/auth/sesion';
import { plural } from '@/lib/format';
import { aId } from '@/lib/maestros';
import { cambiarActividadCliente, editarCliente } from '../actions';
import { AyudaTarifa, ERRORES_CLIENTE, FormularioCliente } from '../FormularioCliente';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Editar cliente',
};

/**
 * Corrección de la ficha de un cliente y su baja.
 *
 * Es la misma ficha que el alta. La baja va aparte, al pie, y pide confirmación:
 * nunca borra, porque sus envíos y facturas lo siguen nombrando.
 */
export default async function PaginaEditarCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('clientes', 'editar');
  const { id: idTexto } = await params;
  const id = aId(idTexto);
  if (!id) notFound();
  const cliente = await obtenerCliente(id);
  if (!cliente) notFound();

  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES_CLIENTE[sp.error] : undefined;
  const activo = Boolean(cliente.activo);

  const sinAsignar = Number(
    (await escalar<number>(
      "SELECT COUNT(*) FROM envios WHERE cliente_id = $1 AND ruta_id IS NULL AND estado = 'pendiente'",
      id,
    )) ?? 0,
  );

  return (
    <>
      <EncabezadoPagina
        titulo={cliente.nombre}
        descripcion={
          <>
            <span className="num">{cliente.codigo}</span> · Corrige los datos de la ficha. El
            código no cambia: es la referencia de sus facturas.
          </>
        }
        acciones={
          <>
            {!activo ? <Badge tono="neutro">Dado de baja</Badge> : null}
            <Link
              href="/clientes"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              ← Volver a clientes
            </Link>
          </>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardCabecera titulo="Ficha del cliente" />
            <CardCuerpo>
              <FormularioCliente
                accion={editarCliente}
                cliente={cliente}
                errorCampo={error?.campo}
                textoBoton="Guardar cambios"
                textoEnviando="Guardando…"
              />
            </CardCuerpo>
          </Card>

          <PanelBaja
            id={cliente.id}
            nombre={`a ${cliente.nombre}`}
            activo={activo}
            confirmando={sp.confirmar === 'baja'}
            hrefBase={`/clientes/${cliente.id}`}
            accion={cambiarActividadCliente}
            consecuencias={
              <>
                <p>
                  Deja de salir al registrar pedidos y al crear despachos. Sus envíos, sus rutas y
                  sus facturas no cambian, y lo que tenga por cobrar sigue en facturación.
                </p>
                {sinAsignar > 0 ? (
                  <p className="mt-2">
                    Tiene {plural(sinAsignar, 'pedido sin asignar', 'pedidos sin asignar')} en el
                    buzón: siguen ahí y se pueden despachar.
                  </p>
                ) : null}
              </>
            }
            textoInactivo="Este cliente no sale al registrar pedidos ni al crear despachos. Su historial se conserva. Al reactivarlo vuelve a estar disponible con la tarifa de su ficha."
          />
        </div>

        <AyudaTarifa />
      </div>
    </>
  );
}
