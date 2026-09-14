'use client';

import { useState } from 'react';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { IconoAlerta, IconoCamara, IconoCheck, IconoEquis } from '@/components/ui/Iconos';
import { crearPedidosDelChat } from '@/app/pedidos/actions';
import { analizarChat, type CampoPedido, type PedidoPropuesto } from '@/lib/pedidos/analizar';
import { ZONAS } from '@/lib/zonas';

/**
 * Revisión de un chat pegado.
 *
 * El analizador propone y aquí se corrige. Está montado así a propósito: las
 * direcciones de Lima («frente al grifo, portón azul, tercer piso») no las acierta
 * ningún analizador, y un pedido mal escrito acaba en un paquete devuelto. Lo que
 * sí se consigue es no volver a teclear el 80 % y que la persona mire justo en los
 * campos que el analizador ha marcado como dudosos.
 *
 * El análisis se hace **en el navegador**, según se pega. Es lógica pura sin
 * acceso a datos, así que puede correr aquí y la respuesta es instantánea. El
 * servidor lo vuelve a validar todo al guardar: esto es comodidad, no confianza.
 */

const ETIQUETA_CAMPO: Record<CampoPedido, string> = {
  destinatario: 'quién recibe',
  telefono: 'teléfono',
  direccion: 'dirección',
  zona: 'distrito',
};

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 placeholder:text-slate-600';

const EJEMPLO = `Juan Pérez - Av Los Álamos 452, Surquillo - 987654321
cobrar 50

María Torres, Calle Las Begonias 120 Dpto 301, San Isidro, 998877665
2 paquetes, 3 kg

Carlos Quispe
Jr. Amazonas 780, Lima Cercado
912345678
Ref: portón azul`;

export function RevisionChat({
  clientes,
  hoy,
}: {
  clientes: { id: number; nombre: string }[];
  hoy: string;
}) {
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<PedidoPropuesto[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [fechaCompromiso, setFechaCompromiso] = useState(hoy);

  function alCambiarTexto(valor: string): void {
    setTexto(valor);
    // Se vuelve a analizar en cada cambio: es barato y así lo que se ve siempre
    // corresponde con lo que hay pegado.
    setFilas(analizarChat(valor));
  }

  function actualizar<K extends keyof PedidoPropuesto>(
    indice: number,
    campo: K,
    valor: PedidoPropuesto[K],
  ): void {
    setFilas((previas) =>
      previas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    );
  }

  function quitar(indice: number): void {
    setFilas((previas) => previas.filter((_, i) => i !== indice));
  }

  const porRevisar = filas.filter((f) => f.faltantes.length > 0).length;
  const listo = filas.length > 0 && clienteId !== '';

  return (
    <div className="space-y-4">
      {/* ── El chat ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Pega aquí la conversación
          <textarea
            value={texto}
            onChange={(e) => alCambiarTexto(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={EJEMPLO}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-200 placeholder:text-slate-600"
          />
        </label>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Cliente que los manda
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className={CLASE_CAMPO}
              >
                <option value="">Elige un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Entregar antes de
              <input
                type="date"
                value={fechaCompromiso}
                onChange={(e) => setFechaCompromiso(e.target.value)}
                className={CLASE_CAMPO}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs leading-relaxed text-slate-400">
            <p className="mb-2 font-medium text-slate-300">Qué hace esto</p>
            <ul className="space-y-1.5">
              <li>
                · Separa la conversación en pedidos y saca de cada uno el destinatario, el
                teléfono, la dirección, el distrito, los bultos, el peso y lo que haya que cobrar.
              </li>
              <li>
                · Reconoce los 43 distritos de Lima y Callao, incluso abreviados («SJL», «Surco»).
                El distrito es lo que después sitúa la parada en el mapa.
              </li>
              <li>
                · <span className="text-amber-300">Marca en ámbar lo que no ha entendido</span>, que
                es donde conviene mirar antes de guardar.
              </li>
              <li>· Ignora los saludos y las despedidas del chat.</li>
            </ul>
            <p className="mt-2 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
              Nada se guarda hasta que pulses el botón, y lo que guardes es lo que ves aquí: el
              análisis es solo una propuesta.
            </p>
          </div>
        </div>
      </div>

      {/* ── Resultado del análisis ──────────────────────────── */}
      {filas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
          <p className="text-sm text-slate-200">
            {filas.length === 1 ? '1 pedido reconocido' : `${filas.length} pedidos reconocidos`}
          </p>
          {porRevisar > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              <IconoAlerta width={13} height={13} />
              {porRevisar} con datos por completar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
              <IconoCheck width={13} height={13} />
              Todos con los datos completos
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setTexto('');
              setFilas([]);
            }}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
          >
            Empezar de nuevo
          </button>
        </div>
      ) : null}

      {/* ── Formulario de guardado ──────────────────────────── */}
      <form action={crearPedidosDelChat} className="space-y-4">
        <input type="hidden" name="clienteId" value={clienteId} />
        <input type="hidden" name="fechaCompromiso" value={fechaCompromiso} />
        {/* Los pedidos viajan como JSON; el servidor los vuelve a validar uno a uno. */}
        <input type="hidden" name="pedidos" value={JSON.stringify(filas)} />

        {filas.map((fila, indice) => (
          <article
            key={indice}
            className={`rounded-xl border p-4 ${
              fila.faltantes.length > 0
                ? 'border-amber-500/40 bg-amber-500/[0.04]'
                : 'border-slate-800 bg-slate-900/40'
            }`}
          >
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">
                {indice + 1}
              </span>
              {fila.faltantes.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300">
                  <IconoAlerta width={12} height={12} />
                  Falta {fila.faltantes.map((c) => ETIQUETA_CAMPO[c]).join(', ')}
                </span>
              ) : (
                <span className="text-[11px] text-emerald-300">Completo</span>
              )}
              <button
                type="button"
                onClick={() => quitar(indice)}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-300"
              >
                <IconoEquis width={12} height={12} />
                Quitar
              </button>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Quién recibe
                <input
                  value={fila.destinatario}
                  onChange={(e) => actualizar(indice, 'destinatario', e.target.value)}
                  placeholder="Nombre de quien recibe"
                  className={CLASE_CAMPO}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Teléfono
                <input
                  value={fila.telefono}
                  onChange={(e) => actualizar(indice, 'telefono', e.target.value)}
                  inputMode="tel"
                  placeholder="+51 987 654 321"
                  className={CLASE_CAMPO}
                />
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1 text-[11px] text-slate-400">
              Dirección
              <input
                value={fila.direccion}
                onChange={(e) => actualizar(indice, 'direccion', e.target.value)}
                placeholder="Av. Los Álamos 452, Dpto 301"
                className={CLASE_CAMPO}
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Distrito
                <select
                  value={fila.zona}
                  onChange={(e) => actualizar(indice, 'zona', e.target.value)}
                  className={CLASE_CAMPO}
                >
                  <option value="">Sin especificar</option>
                  {ZONAS.map((z) => (
                    <option key={z.nombre} value={z.nombre}>
                      {z.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Bultos
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={fila.bultos}
                  onChange={(e) => actualizar(indice, 'bultos', Number(e.target.value) || 1)}
                  className={CLASE_CAMPO}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Peso (kg)
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={fila.peso || ''}
                  onChange={(e) => actualizar(indice, 'peso', Number(e.target.value) || 0)}
                  placeholder="0.5"
                  className={CLASE_CAMPO}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                Cobrar S/
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={fila.cobro || ''}
                  onChange={(e) => actualizar(indice, 'cobro', Number(e.target.value) || 0)}
                  placeholder="0"
                  className={CLASE_CAMPO}
                />
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1 text-[11px] text-slate-400">
              Referencias
              <input
                value={fila.notas}
                onChange={(e) => actualizar(indice, 'notas', e.target.value)}
                placeholder="Portón azul, preguntar por la Sra."
                className={CLASE_CAMPO}
              />
            </label>

            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
                Ver de qué línea salió
              </summary>
              <p className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2 font-mono text-[11px] leading-relaxed text-slate-400">
                {fila.original}
              </p>
            </details>
          </article>
        ))}

        {filas.length > 0 ? (
          <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 backdrop-blur lg:bottom-4">
            <p className="text-sm text-slate-300">
              {clienteId === ''
                ? 'Elige arriba el cliente que manda estos pedidos.'
                : `Se guardarán ${filas.length} pedidos en el buzón, sin ruta.`}
            </p>
            <BotonEnvio
              textoEnviando="Guardando los pedidos…"
              disabled={!listo}
              className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              <span className="inline-flex items-center gap-2">
                <IconoCamara width={16} height={16} />
                Guardar {filas.length === 1 ? 'el pedido' : `los ${filas.length} pedidos`}
              </span>
            </BotonEnvio>
          </div>
        ) : null}
      </form>
    </div>
  );
}
