'use client';

import { IconoLuna, IconoSol } from '@/components/ui/Iconos';
import { cn } from '@/lib/cn';

/**
 * Conmutador entre modo claro y oscuro.
 *
 * Tres decisiones que conviene entender:
 *
 *  - **El tema se aplica con una clase en `<html>`**, no con la preferencia del
 *    sistema. Así el conmutador puede imponerse sobre lo que diga el sistema
 *    operativo: quien elige claro lo tiene claro aunque su Windows esté oscuro.
 *  - **La elección se guarda** en el navegador, así que se mantiene entre visitas.
 *    Un guion en el `<head>` la aplica antes del primer pintado, para que no se
 *    vea un parpadeo blanco al abrir en modo oscuro.
 *  - **Los dos iconos van siempre en el HTML** y es el CSS quien enseña uno u
 *    otro. Si el servidor decidiera cuál mostrar no podría: no sabe qué tema
 *    quiere el visitante, y elegirlo en el navegador daría un desajuste de
 *    hidratación. Dejándolo al CSS, el HTML es idéntico en los dos casos.
 */

export const CLAVE_TEMA = 'transporte-tema';

export function ConmutadorTema({ compacto = false }: { compacto?: boolean }) {
  function alternar(): void {
    const raiz = document.documentElement;
    const nuevo = raiz.classList.contains('dark') ? 'claro' : 'oscuro';

    raiz.classList.toggle('dark', nuevo === 'oscuro');

    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Si el navegador bloquea el almacenamiento, el tema cambia igual; solo se
      // pierde el recuerdo para la próxima visita.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title="Cambiar entre modo claro y oscuro"
      aria-label="Cambiar entre modo claro y oscuro"
      className={cn(
        'flex items-center gap-2 rounded-lg border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200',
        compacto ? 'p-2' : 'w-full px-3 py-2 text-xs',
      )}
    >
      {/* En claro se ofrece el modo oscuro, y al revés. */}
      <span className="dark:hidden">
        <IconoLuna width={compacto ? 17 : 15} height={compacto ? 17 : 15} />
      </span>
      <span className="hidden dark:inline">
        <IconoSol width={compacto ? 17 : 15} height={compacto ? 17 : 15} />
      </span>

      {compacto ? null : (
        <>
          <span className="dark:hidden">Modo oscuro</span>
          <span className="hidden dark:inline">Modo claro</span>
        </>
      )}
    </button>
  );
}
