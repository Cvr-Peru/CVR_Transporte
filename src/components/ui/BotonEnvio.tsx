'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Botón de envío con estado de «enviando».
 *
 * En el móvil esto no es un adorno: si al pulsar «Entregado» no pasa nada
 * visible durante un par de segundos, el conductor vuelve a pulsar y se
 * registran dos entregas. El botón se deshabilita y cambia el texto mientras la
 * acción de servidor está en curso.
 *
 * `useFormStatus` solo funciona dentro del `<form>`, así que este componente
 * tiene que usarse como hijo directo del formulario.
 */
export function BotonEnvio({
  children,
  textoEnviando = 'Guardando…',
  className,
  disabled,
}: {
  children: ReactNode;
  textoEnviando?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(
        'transition-opacity disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {textoEnviando}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
