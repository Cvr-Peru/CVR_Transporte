'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconoMapa } from '@/components/ui/Iconos';
import { MapaCalles } from './MapaCalles';
import type { ParadaMapa, PuntoMapa, UnidadMapa } from './MapaFlota';

/**
 * Deja elegir entre dos formas de ver lo mismo.
 *
 *  - **Calles**: mapa real con teselas. Necesita internet.
 *  - **Esquema**: el mapa que dibuja la propia aplicación, con las coordenadas
 *    reales sobre una retícula. **Funciona sin conexión**, que es justo cuando
 *    más falta hace en la calle.
 *
 * El esquema llega como `children` ya renderizado en el servidor, así que este
 * componente no necesita saber cómo se dibuja.
 */
export function ConmutadorMapa({
  unidades,
  trayectoria,
  paradas,
  altura = 440,
  children,
}: {
  unidades: UnidadMapa[];
  trayectoria?: PuntoMapa[];
  paradas?: ParadaMapa[];
  altura?: number;
  /** El mapa esquemático, renderizado en el servidor. */
  children: ReactNode;
}) {
  const [vista, setVista] = useState<'calles' | 'esquema'>('calles');

  const boton = (cual: 'calles' | 'esquema', etiqueta: string) => (
    <button
      type="button"
      onClick={() => setVista(cual)}
      aria-pressed={vista === cual}
      className={cn(
        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
        vista === cual
          ? 'bg-slate-700 text-slate-100'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
      )}
    >
      {etiqueta}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/50 p-0.5">
          {boton('calles', 'Mapa de calles')}
          {boton('esquema', 'Esquema sin conexión')}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <IconoMapa width={12} height={12} />
          {vista === 'calles'
            ? 'Teselas de OpenStreetMap · necesita internet'
            : 'Dibujado por la app · funciona sin conexión'}
        </span>
      </div>

      {vista === 'calles' ? (
        <MapaCalles
          unidades={unidades}
          trayectoria={trayectoria}
          paradas={paradas}
          altura={altura}
        />
      ) : (
        children
      )}
    </div>
  );
}
