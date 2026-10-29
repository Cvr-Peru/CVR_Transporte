import Link from 'next/link';
import { AvisoError } from '@/components/formulario/Campos';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { requerirPermiso } from '@/lib/auth/sesion';
import { crearConductor } from '../actions';
import { AyudaConductor, ERRORES_CONDUCTOR, FormularioConductor } from '../FormularioConductor';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nuevo conductor',
};

/**
 * Alta de un conductor en la plantilla.
 *
 * Crea su ficha de trabajo, no su acceso a la aplicación: la cuenta para «Mi
 * ruta» se crea después en «Usuarios y permisos» y se vincula con esta ficha. La
 * ficha es la misma que la de edición (`FormularioConductor`).
 */
export default async function PaginaNuevoConductor({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('conductores', 'editar');
  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES_CONDUCTOR[sp.error] : undefined;

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo conductor"
        descripcion="Queda activo y disponible para asignarle hojas de ruta en cuanto se guarda."
        acciones={
          <Link
            href="/conductores"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver a conductores
          </Link>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera titulo="Ficha del conductor" />
          <CardCuerpo>
            <FormularioConductor
              accion={crearConductor}
              errorCampo={error?.campo}
              textoBoton="Añadir a la plantilla"
              textoEnviando="Guardando…"
            />
          </CardCuerpo>
        </Card>

        <AyudaConductor />
      </div>
    </>
  );
}
