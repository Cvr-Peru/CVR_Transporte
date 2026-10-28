'use client';

import { useState } from 'react';
import { Entrada, Seleccion } from '@/components/formulario/Campos';
import { empresa } from '@/config/empresa';
import { REFERENCIA_UNIDAD, TIPOS_UNIDAD, type TipoUnidad } from '@/lib/maestros';

type Campo = 'capacidadKg' | 'capacidadM3' | 'rendimiento';

function valoresDe(tipo: TipoUnidad): Record<Campo, string> {
  const r = REFERENCIA_UNIDAD[tipo];
  return {
    capacidadKg: String(r.capacidadKg),
    capacidadM3: String(r.capacidadM3),
    rendimiento: String(r.rendimiento),
  };
}

/**
 * Tipo de unidad, capacidad y rendimiento.
 *
 * Al elegir el tipo se proponen los valores típicos de ese tipo, pero solo en los
 * campos que la persona no haya tocado: si ya escribió la capacidad real de su
 * furgoneta, cambiar de tipo no se la pisa. Sin JavaScript el formulario sigue
 * funcionando con los valores de la furgoneta, que es el tipo por defecto (el más
 * común en reparto urbano).
 */
export function CamposTipoUnidad({ invalido }: { invalido?: string }) {
  const [tipo, setTipo] = useState<TipoUnidad>('furgoneta');
  const [valores, setValores] = useState(() => valoresDe('furgoneta'));
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());

  function cambiarTipo(nuevo: TipoUnidad) {
    setTipo(nuevo);
    const sugeridos = valoresDe(nuevo);
    setValores((actuales) => {
      const siguiente = { ...actuales };
      for (const campo of Object.keys(sugeridos) as Campo[]) {
        if (!tocados.has(campo)) siguiente[campo] = sugeridos[campo];
      }
      return siguiente;
    });
  }

  function escribir(campo: Campo, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    setTocados((t) => new Set(t).add(campo));
  }

  return (
    <>
      <Seleccion
        id="tipo"
        etiqueta="Tipo de unidad"
        value={tipo}
        onChange={(e) => cambiarTipo(e.target.value as TipoUnidad)}
        ayuda="Al cambiarlo se proponen la capacidad y el rendimiento habituales de ese tipo."
        invalido={invalido === 'tipo'}
      >
        {TIPOS_UNIDAD.map((t) => (
          <option key={t} value={t}>
            {REFERENCIA_UNIDAD[t].etiqueta}
          </option>
        ))}
      </Seleccion>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Entrada
          id="capacidadKg"
          etiqueta="Carga máxima (kg)"
          type="number"
          min={1}
          max={60000}
          step="any"
          value={valores.capacidadKg}
          onChange={(e) => escribir('capacidadKg', e.target.value)}
          invalido={invalido === 'capacidadKg'}
        />
        <Entrada
          id="capacidadM3"
          etiqueta="Volumen (m³)"
          opcional
          type="number"
          min={0}
          max={200}
          step="any"
          value={valores.capacidadM3}
          onChange={(e) => escribir('capacidadM3', e.target.value)}
        />
        <Entrada
          id="rendimiento"
          etiqueta={`Rendimiento esperado (${empresa.unidadDistancia}/${empresa.unidadCombustible})`}
          type="number"
          min={1}
          max={300}
          step="any"
          value={valores.rendimiento}
          onChange={(e) => escribir('rendimiento', e.target.value)}
          ayuda="El de fábrica o el que da en buen estado. Costos lo compara con el consumo real."
          invalido={invalido === 'rendimiento'}
        />
      </div>
    </>
  );
}
