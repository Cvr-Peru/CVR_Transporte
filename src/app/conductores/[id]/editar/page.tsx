import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvisoError } from '@/components/formulario/Campos';
import { PanelBaja } from '@/components/formulario/PanelBaja';
import { BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { obtenerConductor } from '@/db/queries/conductores';
import { rutasAbiertasDe, tieneCuentaActiva } from '@/db/queries/maestros';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { etiqueta, plural } from '@/lib/format';
import { aId } from '@/lib/maestros';
import { cambiarActividadConductor, editarConductor } from '../../actions';
import { AyudaConductor, ERRORES_CONDUCTOR, FormularioConductor } from '../../FormularioConductor';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Editar conductor',
};

/** Además de los del formulario, el de la baja rechazada por el servidor. */
const ERRORES: Record<string, { mensaje: string; campo: string }> = {
  ...ERRORES_CONDUCTOR,
  en_curso: {
    mensaje: 'No se puede dar de baja: el conductor tiene una hoja de ruta en curso. Más abajo se explica qué hacer.',
    campo: '',
  },
};

/**
 * Corrección de la ficha de un conductor y su baja.
 *
 * La baja lo deja «inactivo»: deja de ofrecerse en los despachos, pero sus rutas
 * y liquidaciones lo siguen nombrando.
 */
export default async function PaginaEditarConductor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirPermiso('conductores', 'editar');
  const { id: idTexto } = await params;
  const id = aId(idTexto);
  if (!id) notFound();
  const conductor = await obtenerConductor(id);
  if (!conductor) notFound();

  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;
  const rutas = await rutasAbiertasDe('conductor', id);
  const conCuenta = await tieneCuentaActiva(id);
  const puedeUsuarios = puede(sesion.rol, 'usuarios', 'editar');

  return (
    <>
      <EncabezadoPagina
        titulo={conductor.nombre}
        descripcion={
          <>
            <span className="num">{conductor.codigo}</span> · Corrige los datos de la ficha. La
            cuenta para entrar a «Mi ruta», si la tiene, se gestiona en Usuarios y permisos.
          </>
        }
        acciones={
          <>
            <BadgeEstado estado={conductor.estado} texto={etiqueta(conductor.estado)} />
            <Link
              href="/conductores"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              ← Volver a conductores
            </Link>
          </>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardCabecera titulo="Ficha del conductor" />
            <CardCuerpo>
              <FormularioConductor
                accion={editarConductor}
                conductor={conductor}
                errorCampo={error?.campo}
                textoBoton="Guardar cambios"
                textoEnviando="Guardando…"
              />
            </CardCuerpo>
          </Card>

          <PanelBaja
            id={conductor.id}
            nombre={`a ${conductor.nombre}`}
            activo={conductor.estado !== 'inactivo'}
            confirmando={sp.confirmar === 'baja'}
            hrefBase={`/conductores/${conductor.id}/editar`}
            accion={cambiarActividadConductor}
            bloqueo={
              rutas.enCurso.length > 0 ? (
                <>
                  No se puede dar de baja mientras tenga en curso la hoja de ruta{' '}
                  <span className="num font-medium">{rutas.enCurso.join(', ')}</span>: tiene paradas
                  por resolver en la calle, y esa ruta quedaría a nombre de alguien que ya no está en
                  la plantilla. Ciérrala o pásasela a otro conductor desde{' '}
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
                  Queda inactivo: deja de ofrecerse al crear despachos. Sus rutas y liquidaciones se
                  conservan.
                </p>
                {rutas.planificadas.length > 0 ? (
                  <p className="mt-2 text-amber-300">
                    Tiene {plural(rutas.planificadas.length, 'hoja de ruta planificada', 'hojas de ruta planificadas')}{' '}
                    (<span className="num">{rutas.planificadas.join(', ')}</span>) que seguirán a su
                    nombre hasta que se le asignen a otro conductor.
                  </p>
                ) : null}
                {conCuenta ? (
                  <p className="mt-2 text-amber-300">
                    Tiene una cuenta para «Mi ruta» que sigue activa: la baja de la ficha no la
                    cierra.{' '}
                    {puedeUsuarios ? (
                      <Link href="/usuarios" className="font-medium underline underline-offset-2">
                        Desactívala en Usuarios y permisos
                      </Link>
                    ) : (
                      'Pide a administración que la desactive.'
                    )}
                  </p>
                ) : null}
              </>
            }
            textoInactivo="Este conductor está inactivo y no se ofrece al crear despachos. Al reactivarlo vuelve a estar disponible para las hojas de ruta."
          />
        </div>

        <AyudaConductor />
      </div>
    </>
  );
}
