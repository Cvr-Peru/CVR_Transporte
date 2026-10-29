import Link from 'next/link';
import { AvisoError } from '@/components/formulario/Campos';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { requerirPermiso } from '@/lib/auth/sesion';
import { crearCliente } from '../actions';
import { AyudaTarifa, ERRORES_CLIENTE, FormularioCliente } from '../FormularioCliente';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nuevo cliente',
};

/**
 * Alta de un cliente: la empresa que manda los envíos y a la que se le factura.
 * La ficha es la misma que la de edición (`FormularioCliente`).
 */
export default async function PaginaNuevoCliente({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('clientes', 'editar');
  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES_CLIENTE[sp.error] : undefined;

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo cliente"
        descripcion="Con la ficha creada ya se le pueden registrar pedidos, y el flete se calcula solo con su tarifa."
        acciones={
          <Link
            href="/clientes"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver a clientes
          </Link>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera titulo="Ficha del cliente" />
          <CardCuerpo>
            <FormularioCliente
              accion={crearCliente}
              errorCampo={error?.campo}
              textoBoton="Crear cliente"
              textoEnviando="Creando…"
            />
          </CardCuerpo>
        </Card>

        <AyudaTarifa />
      </div>
    </>
  );
}
