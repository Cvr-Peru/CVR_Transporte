/**
 * Baja y reactivación de un maestro (cliente, unidad o conductor).
 *
 * Una baja nunca borra: facturas, rutas y envíos siguen apuntando al registro, así
 * que solo se marca como inactivo y deja de ofrecerse donde se elige.
 *
 * La confirmación va en dos pasos y sin JavaScript de cliente: el primer botón es
 * un enlace que vuelve a la misma página con `?confirmar=baja`, y solo entonces
 * aparece el formulario que de verdad la ejecuta, con lo que va a pasar escrito
 * al lado. Reactivar no pide confirmación: deshace la baja sin perder nada.
 *
 * El bloqueo (una ruta en curso, por ejemplo) se muestra aquí para no ofrecer un
 * botón que va a fallar, pero quien lo hace cumplir es la acción de servidor.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { IconoAlerta } from '@/components/ui/Iconos';

const CLASE_SECUNDARIO =
  'rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800';

export function PanelBaja({
  id,
  nombre,
  activo,
  confirmando,
  hrefBase,
  accion,
  consecuencias,
  bloqueo,
  textoInactivo,
}: {
  id: number;
  /** Cómo se nombra el registro en la pregunta: «la unidad BTD713». */
  nombre: string;
  activo: boolean;
  /** La página llegó con `?confirmar=baja`. */
  confirmando: boolean;
  /** La página de edición, sin parámetros. */
  hrefBase: string;
  accion: (formData: FormData) => Promise<void>;
  /** Qué deja de pasar al darlo de baja. */
  consecuencias: ReactNode;
  /** Si viene, la baja no se puede hacer ahora y esto explica por qué. */
  bloqueo?: ReactNode;
  /** Qué significa que esté dado de baja y qué hace reactivarlo. */
  textoInactivo: ReactNode;
}) {
  return (
    <div id="baja" className="mt-4 scroll-mt-4">
      <Card>
        <CardCabecera titulo={activo ? 'Dar de baja' : 'Dado de baja'} />
        <CardCuerpo className="space-y-3 text-sm text-slate-400">
          {!activo ? (
            <>
              <p>{textoInactivo}</p>
              <form action={accion}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="activo" value="1" />
                <BotonEnvio
                  textoEnviando="Reactivando…"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Reactivar
                </BotonEnvio>
              </form>
            </>
          ) : bloqueo ? (
            <p
              role="note"
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200"
            >
              <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />
              <span>{bloqueo}</span>
            </p>
          ) : confirmando ? (
            <div
              role="alertdialog"
              aria-labelledby="baja-pregunta"
              className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-3"
            >
              <p id="baja-pregunta" className="font-medium text-rose-200">
                ¿Dar de baja {nombre}?
              </p>
              <div className="text-slate-300">{consecuencias}</div>
              <p className="text-xs text-slate-400">
                No se borra nada: su historial se conserva y se puede reactivar cuando haga falta.
              </p>
              <form action={accion} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="activo" value="0" />
                <BotonEnvio
                  textoEnviando="Dando de baja…"
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500"
                >
                  Sí, dar de baja
                </BotonEnvio>
                <Link href={hrefBase} className={CLASE_SECUNDARIO}>
                  Cancelar
                </Link>
              </form>
            </div>
          ) : (
            <>
              <div>{consecuencias}</div>
              <Link
                href={`${hrefBase}?confirmar=baja#baja`}
                className="inline-block rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
              >
                Dar de baja…
              </Link>
            </>
          )}
        </CardCuerpo>
      </Card>
    </div>
  );
}
