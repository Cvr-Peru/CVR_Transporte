/**
 * Piezas de los formularios de alta (clientes, unidades, conductores).
 *
 * Resuelven lo que se repetía mal a mano: que cada campo tenga su etiqueta, que
 * la ayuda quede asociada al campo (`aria-describedby`) para que un lector de
 * pantalla la lea, y que el campo que provocó un error quede marcado
 * (`aria-invalid`) y apunte al aviso de arriba.
 */
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { IconoAlerta, IconoCheck } from '@/components/ui/Iconos';
import { cn } from '@/lib/cn';

export const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-600 aria-[invalid=true]:border-rose-500';

const ID_ERROR = 'error-formulario';

interface PropsComunes {
  id: string;
  etiqueta: string;
  ayuda?: ReactNode;
  /** Muestra «(opcional)» junto a la etiqueta. Lo normal es que un campo sea obligatorio. */
  opcional?: boolean;
  /** Este campo es el que provocó el error mostrado arriba. */
  invalido?: boolean;
  className?: string;
}

function Envoltorio({
  id,
  etiqueta,
  ayuda,
  opcional,
  className,
  children,
}: PropsComunes & { children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs text-slate-400">
        {etiqueta}
        {opcional ? <span className="text-slate-600"> (opcional)</span> : null}
      </label>
      {children}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-[11px] leading-snug text-slate-500">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, ayuda: unknown, invalido?: boolean): string | undefined {
  const ids = [ayuda ? `${id}-ayuda` : null, invalido ? ID_ERROR : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export function Entrada({
  id,
  etiqueta,
  ayuda,
  opcional,
  invalido,
  className,
  ...input
}: PropsComunes & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>) {
  return (
    <Envoltorio {...{ id, etiqueta, ayuda, opcional, className }}>
      <input
        id={id}
        name={input.name ?? id}
        required={!opcional}
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy(id, ayuda, invalido)}
        className={CLASE_CAMPO}
        {...input}
      />
    </Envoltorio>
  );
}

export function Seleccion({
  id,
  etiqueta,
  ayuda,
  opcional,
  invalido,
  className,
  children,
  ...select
}: PropsComunes & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>) {
  return (
    <Envoltorio {...{ id, etiqueta, ayuda, opcional, className }}>
      <select
        id={id}
        name={select.name ?? id}
        required={!opcional}
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy(id, ayuda, invalido)}
        className={CLASE_CAMPO}
        {...select}
      >
        {children}
      </select>
    </Envoltorio>
  );
}

/** Grupo de campos con título: «Identificación», «Tarifa»… */
export function Grupo({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    // `first-of-type` y no `first`: Next añade al formulario un campo oculto con el
    // identificador de la acción, que es el primer hijo, no el primer grupo.
    <fieldset className="space-y-3 border-t border-slate-800 pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="sr-only">{titulo}</legend>
      <div aria-hidden="true">
        <p className="text-sm font-semibold text-slate-200">{titulo}</p>
        {descripcion ? <p className="text-xs text-slate-500">{descripcion}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

/** Aviso de error del formulario. Los campos marcados como inválidos apuntan aquí. */
export function AvisoError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p
      id={ID_ERROR}
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
    >
      <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />
      {mensaje}
    </p>
  );
}

/** Confirmación de un alta, con el paso siguiente que tiene sentido. */
export function AvisoExito({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
    >
      <p className="flex items-start gap-2">
        <IconoCheck width={16} height={16} className="mt-0.5 shrink-0" />
        <span>{children}</span>
      </p>
      {accion}
    </div>
  );
}
