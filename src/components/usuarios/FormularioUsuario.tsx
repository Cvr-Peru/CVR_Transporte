'use client';

import { useState } from 'react';
import { crearUsuario } from '@/app/usuarios/actions';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { CampoClave } from '@/components/usuarios/CampoClave';
import { descripcionRol, etiquetaRol, ROLES, type Rol } from '@/lib/auth/permisos';

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-600';

/**
 * Alta de una cuenta.
 *
 * Es un componente de cliente por dos razones: el selector de rol decide si
 * aparece el vínculo con la ficha del conductor, y el campo de contraseña lleva
 * su generador.
 */
export function FormularioUsuario({
  conductores,
}: {
  conductores: { id: number; nombre: string; codigo: string | null }[];
}) {
  const [rol, setRol] = useState<Rol>('despachador');

  return (
    <form action={crearUsuario} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Nombre y apellidos
          <input
            name="nombre"
            required
            autoComplete="off"
            placeholder="Ana Restrepo"
            className={CLASE_CAMPO}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Correo electrónico
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="ana@tuempresa.pe"
            className={CLASE_CAMPO}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Rol
          <select
            name="rol"
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            className={CLASE_CAMPO}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {etiquetaRol(r)}
              </option>
            ))}
          </select>
        </label>

        {/* El vínculo solo aparece para el rol que lo necesita. */}
        {rol === 'conductor' ? (
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Ficha del conductor
            <select name="conductorId" defaultValue="" className={CLASE_CAMPO}>
              <option value="">Sin vincular</option>
              {conductores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.codigo ? ` · ${c.codigo}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        {descripcionRol(rol)}
        {rol === 'conductor'
          ? ' Sin la ficha vinculada, al entrar no encontrará ninguna ruta: no hay forma de saber cuál es la suya.'
          : ''}
      </p>

      <CampoClave />

      <div className="border-t border-slate-800 pt-4">
        <BotonEnvio
          textoEnviando="Creando la cuenta…"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Crear la cuenta
        </BotonEnvio>
      </div>
    </form>
  );
}
