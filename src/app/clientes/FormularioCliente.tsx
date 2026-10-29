import Link from 'next/link';
import { Entrada, Grupo } from '@/components/formulario/Campos';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { empresa } from '@/config/empresa';
import type { Cliente } from '@/db/tipos';
import { SIMBOLO_MONEDA, tarifa } from '@/lib/maestros';

/** Error → mensaje y campo que lo provocó. Lo comparten el alta y la edición. */
export const ERRORES_CLIENTE: Record<string, { mensaje: string; campo: string }> = {
  nombre: { mensaje: 'Escribe la razón social del cliente.', campo: 'nombre' },
  fiscal: {
    mensaje: `El ${empresa.idFiscalLabel} solo puede llevar números, letras y guiones.`,
    campo: 'idFiscal',
  },
  correo: { mensaje: 'El correo no tiene un formato válido.', campo: 'email' },
  tarifa: { mensaje: 'Las tarifas tienen que ser importes de cero o más.', campo: 'tarifaBase' },
  plazo: { mensaje: 'El plazo de pago va de 0 a 180 días.', campo: 'plazo' },
  duplicado: {
    mensaje: `Ya hay otro cliente con ese ${empresa.idFiscalLabel}. Búscalo en la lista antes de crearlo otra vez.`,
    campo: 'idFiscal',
  },
};

/**
 * Ficha de un cliente: la usan el alta (sin `cliente`) y la edición (con él).
 *
 * La tarifa es lo que más importa de esta ficha: de ella sale el flete de cada
 * pedido, sin que nadie lo teclee. Por eso va en su propio bloque.
 */
export function FormularioCliente({
  accion,
  cliente,
  errorCampo,
  textoBoton,
  textoEnviando,
}: {
  accion: (formData: FormData) => Promise<void>;
  cliente?: Cliente;
  /** Campo que provocó el error mostrado arriba, si lo hay. */
  errorCampo?: string;
  textoBoton: string;
  textoEnviando: string;
}) {
  const invalido = (campo: string) => errorCampo === campo;

  return (
    <form action={accion} className="space-y-5">
      {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}
      <Grupo titulo="Identificación">
        <Entrada
          id="nombre"
          etiqueta="Razón social"
          placeholder="Distribuidora Andina S.A.C."
          maxLength={120}
          autoComplete="organization"
          defaultValue={cliente?.nombre}
          invalido={invalido('nombre')}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Entrada
            id="idFiscal"
            etiqueta={empresa.idFiscalLabel}
            opcional
            placeholder="20555416959"
            inputMode="numeric"
            maxLength={20}
            pattern="[0-9A-Za-z][0-9A-Za-z\- ]{4,19}"
            ayuda="Hace falta para facturarle."
            defaultValue={cliente?.id_fiscal ?? undefined}
            invalido={invalido('idFiscal')}
          />
          <Entrada
            id="ciudad"
            etiqueta="Ciudad"
            opcional
            defaultValue={cliente ? (cliente.ciudad ?? '') : empresa.ciudad}
            maxLength={80}
          />
        </div>
        <Entrada
          id="direccion"
          etiqueta="Dirección fiscal o de recojo"
          opcional
          placeholder="Av. Argentina 2450, Cercado de Lima"
          maxLength={200}
          defaultValue={cliente?.direccion ?? undefined}
        />
      </Grupo>

      <Grupo titulo="Contacto" descripcion="A quién llamar cuando hay una novedad con sus envíos.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Entrada
            id="contacto"
            etiqueta="Persona de contacto"
            opcional
            maxLength={120}
            placeholder="Rosa Chávez"
            defaultValue={cliente?.contacto ?? undefined}
          />
          <Entrada
            id="telefono"
            etiqueta="Teléfono"
            opcional
            type="tel"
            inputMode="tel"
            maxLength={40}
            placeholder="+51 987 654 321"
            defaultValue={cliente?.telefono ?? undefined}
          />
          <Entrada
            id="email"
            etiqueta="Correo"
            opcional
            type="email"
            maxLength={160}
            placeholder="pedidos@cliente.pe"
            defaultValue={cliente?.email ?? undefined}
            invalido={invalido('email')}
          />
        </div>
      </Grupo>

      <Grupo
        titulo="Tarifa y cobro"
        descripcion={
          cliente
            ? 'Flete de cada envío = tarifa base + tarifa por kg × peso. Un cambio vale para los pedidos que se registren desde ahora; los ya registrados conservan su flete.'
            : 'Flete de cada envío = tarifa base + tarifa por kg × peso.'
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Entrada
            id="tarifaBase"
            etiqueta={`Tarifa base por envío (${SIMBOLO_MONEDA})`}
            type="number"
            min={0}
            max={100000}
            step="0.01"
            placeholder="Ej. 10.00"
            defaultValue={cliente?.tarifa_base}
            invalido={invalido('tarifaBase')}
          />
          <Entrada
            id="tarifaKg"
            etiqueta={`Tarifa por kg (${SIMBOLO_MONEDA})`}
            type="number"
            min={0}
            max={10000}
            step="0.01"
            placeholder="Ej. 2.50"
            defaultValue={cliente?.tarifa_kg}
            invalido={invalido('tarifaBase')}
          />
          <Entrada
            id="plazo"
            etiqueta="Plazo de pago (días)"
            type="number"
            min={0}
            max={180}
            step={1}
            defaultValue={cliente?.plazo_pago_dias ?? 30}
            ayuda="0 si paga al contado."
            invalido={invalido('plazo')}
          />
        </div>
      </Grupo>

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
        <BotonEnvio
          textoEnviando={textoEnviando}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          {textoBoton}
        </BotonEnvio>
        <Link
          href="/clientes"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

/** Nota lateral con un ejemplo del cálculo del flete. */
export function AyudaTarifa() {
  return (
    <Card className="h-fit">
      <CardCuerpo className="space-y-3 text-xs leading-relaxed text-slate-400">
        <h2 className="text-sm font-semibold text-slate-200">Cómo se usa la tarifa</h2>
        <p>
          Con una tarifa base de <span className="num text-slate-300">{tarifa(10)}</span> y{' '}
          <span className="num text-slate-300">{tarifa(2.5)}</span> por kg, un paquete de 3 kg se
          cobra <span className="num text-slate-300">{tarifa(17.5)}</span>.
        </p>
        <p>
          Si un pedido llega sin peso, se cobra el mínimo facturable (0,5 kg) y se ajusta al
          pesar el paquete.
        </p>
        <p>
          El <span className="text-slate-300">plazo de pago</span> queda en la ficha como la
          condición pactada con el cliente.
        </p>
      </CardCuerpo>
    </Card>
  );
}
