'use client';

import { useState } from 'react';
import { IconoCheck, IconoRefrescar } from '@/components/ui/Iconos';

/**
 * Campo de contraseña con generador.
 *
 * La contraseña se genera **en el navegador** y se ve en pantalla, para que quien
 * administra la copie y se la entregue a la persona. No pasa por la barra de
 * direcciones ni se guarda en claro en ningún sitio: va en el formulario y en el
 * servidor acaba directamente en su hash.
 *
 * El alfabeto excluye los caracteres que se confunden entre sí (`0`/`O`, `1`/`l`/`I`).
 * Estas contraseñas se dictan por teléfono y se copian a mano en un papel más
 * veces de las que parece.
 */

const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 14 caracteres de este alfabeto son unos 81 bits de entropía. */
function claveLegible(largo = 14): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-600';

export function CampoClave({
  name = 'clave',
  etiqueta = 'Contraseña',
  ayuda,
}: {
  name?: string;
  etiqueta?: string;
  /** Texto de apoyo bajo el campo. */
  ayuda?: string;
}) {
  const [clave, setClave] = useState('');
  const [copiada, setCopiada] = useState(false);

  async function copiar(): Promise<void> {
    if (clave === '') return;
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS) no pasa nada: la contraseña
      // está a la vista y se puede seleccionar a mano.
      setCopiada(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-xs text-slate-400">{etiqueta}</span>
      <div className="flex flex-wrap gap-2">
        <input
          name={name}
          required
          minLength={8}
          autoComplete="off"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          className={`num flex-1 ${CLASE_CAMPO}`}
        />
        <button
          type="button"
          onClick={() => setClave(claveLegible())}
          title="Genera una contraseña difícil de adivinar y fácil de dictar"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <IconoRefrescar width={14} height={14} />
          Generar
        </button>
        <button
          type="button"
          onClick={() => void copiar()}
          disabled={clave === ''}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        >
          {copiada ? <IconoCheck width={14} height={14} /> : null}
          {copiada ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        {ayuda ?? (
          <>
            Anótala y entrégasela a la persona:{' '}
            <strong className="text-slate-400">no se puede volver a ver</strong>. En la base de
            datos solo queda su huella, no la contraseña.
          </>
        )}
      </p>
    </div>
  );
}
