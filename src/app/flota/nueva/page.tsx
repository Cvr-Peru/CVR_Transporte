import Link from 'next/link';
import { AvisoError } from '@/components/formulario/Campos';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { conductoresAsignables } from '@/db/queries/despachos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { crearUnidad } from '../actions';
import { AyudaUnidad, ERRORES_UNIDAD, FormularioUnidad } from '../FormularioUnidad';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nueva unidad',
};

/**
 * Alta de una unidad en la flota.
 *
 * Pide lo mínimo para poder asignarla a una ruta (placa, tipo, capacidad) y lo
 * que después necesitan otros módulos: el rendimiento para costos y los
 * vencimientos legales para el semáforo de documentación. La ficha es la misma
 * que la de edición (`FormularioUnidad`).
 */
export default async function PaginaNuevaUnidad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('flota', 'editar');
  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES_UNIDAD[sp.error] : undefined;
  const conductores = await conductoresAsignables();

  return (
    <>
      <EncabezadoPagina
        titulo="Nueva unidad"
        descripcion="Queda disponible para asignarla a una hoja de ruta en cuanto se guarda."
        acciones={
          <Link
            href="/flota"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver a flota
          </Link>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera titulo="Ficha de la unidad" />
          <CardCuerpo>
            <FormularioUnidad
              accion={crearUnidad}
              conductores={conductores}
              errorCampo={error?.campo}
              textoBoton="Añadir a la flota"
              textoEnviando="Guardando…"
            />
          </CardCuerpo>
        </Card>

        <AyudaUnidad />
      </div>
    </>
  );
}
