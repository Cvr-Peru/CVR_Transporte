import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvisoError } from '@/components/formulario/Campos';
import { PanelBaja } from '@/components/formulario/PanelBaja';
import { BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { conductoresParaUnidad, obtenerUnidad, rutasAbiertasDe } from '@/db/queries/maestros';
import { requerirPermiso } from '@/lib/auth/sesion';
import { etiqueta, plural } from '@/lib/format';
import { aId } from '@/lib/maestros';
import { cambiarActividadUnidad, editarUnidad } from '../../actions';
import { AyudaUnidad, ERRORES_UNIDAD, FormularioUnidad } from '../../FormularioUnidad';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Editar unidad',
};

/** Además de los del formulario, el de la baja rechazada por el servidor. */
const ERRORES: Record<string, { mensaje: string; campo: string }> = {
  ...ERRORES_UNIDAD,
  en_curso: {
    mensaje: 'No se puede dar de baja: la unidad tiene una hoja de ruta en curso. Más abajo se explica qué hacer.',
    campo: '',
  },
};

/**
 * Corrección de la ficha de una unidad y su baja.
 *
 * La baja la pone «fuera de servicio»: deja de ofrecerse en los despachos, pero
 * sus rutas, cargas de combustible y órdenes de taller la siguen nombrando.
 */
export default async function PaginaEditarUnidad({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('flota', 'editar');
  const { id: idTexto } = await params;
  const id = aId(idTexto);
  if (!id) notFound();
  const unidad = await obtenerUnidad(id);
  if (!unidad) notFound();

  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;
  const conductores = await conductoresParaUnidad(unidad.conductor_fijo_id);
  const rutas = await rutasAbiertasDe('unidad', id);

  return (
    <>
      <EncabezadoPagina
        titulo={`Unidad ${unidad.placa}`}
        descripcion="Corrige los datos de la ficha. El estado lo llevan los despachos y el taller; los documentos, su pestaña en la flota."
        acciones={
          <>
            <BadgeEstado estado={unidad.estado} texto={etiqueta(unidad.estado)} />
            <Link
              href="/flota"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              ← Volver a flota
            </Link>
          </>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardCabecera titulo="Ficha de la unidad" />
            <CardCuerpo>
              <FormularioUnidad
                accion={editarUnidad}
                unidad={unidad}
                conductores={conductores}
                errorCampo={error?.campo}
                textoBoton="Guardar cambios"
                textoEnviando="Guardando…"
              />
            </CardCuerpo>
          </Card>

          <PanelBaja
            id={unidad.id}
            nombre={`la unidad ${unidad.placa}`}
            activo={unidad.estado !== 'fuera_servicio'}
            confirmando={sp.confirmar === 'baja'}
            hrefBase={`/flota/${unidad.id}/editar`}
            accion={cambiarActividadUnidad}
            bloqueo={
              rutas.enCurso.length > 0 ? (
                <>
                  No se puede dar de baja mientras tenga en curso la hoja de ruta{' '}
                  <span className="num font-medium">{rutas.enCurso.join(', ')}</span>: está en la
                  calle con paquetes a bordo, y esa ruta quedaría a nombre de una unidad que ya no
                  opera. Ciérrala o pásala a otra unidad desde{' '}
                  <Link href="/despachos" className="font-medium underline underline-offset-2">
                    Despachos
                  </Link>{' '}
                  y vuelve aquí.
                </>
              ) : undefined
            }
            consecuencias={
              <>
                <p>
                  Queda «fuera de servicio»: deja de ofrecerse al crear despachos. Su historial de
                  rutas, combustible y taller se conserva.
                </p>
                {rutas.planificadas.length > 0 ? (
                  <p className="mt-2 text-amber-300">
                    Tiene {plural(rutas.planificadas.length, 'hoja de ruta planificada', 'hojas de ruta planificadas')}{' '}
                    (<span className="num">{rutas.planificadas.join(', ')}</span>) que seguirán a su
                    nombre hasta que se les asigne otra unidad.
                  </p>
                ) : null}
              </>
            }
            textoInactivo="Esta unidad está fuera de servicio y no se ofrece al crear despachos. Al reactivarla vuelve a quedar disponible."
          />
        </div>

        <AyudaUnidad />
      </div>
    </>
  );
}
