import Link from 'next/link';
import { Entrada, Grupo, Seleccion } from '@/components/formulario/Campos';
import { CamposTipoUnidad } from '@/components/flota/CamposTipoUnidad';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { umbrales } from '@/config/empresa';
import type { Unidad } from '@/db/tipos';

/** Error → mensaje y campo que lo provocó. Lo comparten el alta y la edición. */
export const ERRORES_UNIDAD: Record<string, { mensaje: string; campo: string }> = {
  placa: {
    mensaje: 'La placa debe tener entre 5 y 8 letras o números (los guiones y espacios se quitan solos).',
    campo: 'placa',
  },
  tipo: { mensaje: 'Elige el tipo de unidad.', campo: 'tipo' },
  anio: { mensaje: 'El año del modelo no es válido.', campo: 'anio' },
  capacidad: { mensaje: 'La carga máxima tiene que ser mayor que cero.', campo: 'capacidadKg' },
  km: { mensaje: 'El kilometraje no es válido.', campo: 'km' },
  rendimiento: {
    mensaje: 'Indica el rendimiento esperado: sin él no se puede vigilar el consumo de combustible.',
    campo: 'rendimiento',
  },
  fecha: { mensaje: 'Una de las fechas de vencimiento no es válida.', campo: 'soatVence' },
  conductor: { mensaje: 'Ese conductor ya no está disponible. Elige otro o déjalo sin asignar.', campo: 'conductorId' },
  duplicada: {
    mensaje: 'Ya hay otra unidad con esa placa en la flota.',
    campo: 'placa',
  },
};

/**
 * Ficha de una unidad: la usan el alta (sin `unidad`) y la edición (con ella).
 *
 * Los vencimientos de SOAT y revisión técnica solo se piden en el alta, para que
 * el semáforo cuente con ellos desde el primer día. Después se renuevan en la
 * pestaña de documentación, que guarda el historial.
 */
export function FormularioUnidad({
  accion,
  unidad,
  conductores,
  errorCampo,
  textoBoton,
  textoEnviando,
}: {
  accion: (formData: FormData) => Promise<void>;
  unidad?: Unidad;
  /** Conductores que se pueden elegir como habituales. */
  conductores: { id: number; nombre: string }[];
  errorCampo?: string;
  textoBoton: string;
  textoEnviando: string;
}) {
  const invalido = (campo: string) => errorCampo === campo;
  const anioMaximo = new Date().getFullYear() + 1;

  return (
    <form action={accion} className="space-y-5">
      {unidad ? <input type="hidden" name="id" value={unidad.id} /> : null}
      <Grupo titulo="Identificación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Entrada
            id="placa"
            etiqueta="Placa"
            placeholder="BTD-713"
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            className="sm:col-span-1"
            defaultValue={unidad?.placa}
            invalido={invalido('placa')}
          />
          <Entrada
            id="marca"
            etiqueta="Marca"
            opcional
            maxLength={60}
            placeholder="Renault"
            defaultValue={unidad?.marca ?? undefined}
          />
          <Entrada
            id="modelo"
            etiqueta="Modelo"
            opcional
            maxLength={60}
            placeholder="Kangoo"
            defaultValue={unidad?.modelo ?? undefined}
          />
          <Entrada
            id="anio"
            etiqueta="Año"
            opcional
            type="number"
            min={1980}
            max={anioMaximo}
            step={1}
            placeholder={String(anioMaximo - 3)}
            defaultValue={unidad?.anio ?? undefined}
            invalido={invalido('anio')}
          />
        </div>
      </Grupo>

      <Grupo titulo="Capacidad y consumo">
        <CamposTipoUnidad
          invalido={errorCampo}
          inicial={
            unidad
              ? {
                  tipo: unidad.tipo,
                  capacidadKg: unidad.capacidad_kg,
                  capacidadM3: unidad.capacidad_m3,
                  rendimiento: unidad.rendimiento_esperado,
                }
              : undefined
          }
        />
        <Entrada
          id="km"
          etiqueta="Kilometraje actual"
          opcional
          type="number"
          min={0}
          step="any"
          placeholder="0"
          ayuda={
            unidad
              ? 'El del tablero. Cada hoja de ruta nueva parte de este valor.'
              : 'Sirve de punto de partida para el mantenimiento por kilómetros.'
          }
          defaultValue={unidad?.km_actual}
          invalido={invalido('km')}
          className="sm:max-w-xs"
        />
      </Grupo>

      {!unidad ? (
        <Grupo
          titulo="Documentación"
          descripcion={`Sin estos dos documentos al día la unidad no puede circular. El sistema avisa ${umbrales.preventivo} días antes de cada vencimiento.`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Entrada
              id="soatVence"
              etiqueta="SOAT vence el"
              opcional
              type="date"
              invalido={invalido('soatVence')}
            />
            <Entrada id="revisionVence" etiqueta="Revisión técnica vence el" opcional type="date" />
          </div>
        </Grupo>
      ) : null}

      <Grupo titulo="Asignación">
        <Seleccion
          id="conductorId"
          etiqueta="Conductor habitual"
          opcional
          defaultValue={unidad?.conductor_fijo_id ?? ''}
          ayuda="Aparece en la ficha de la flota. En cada despacho se sigue eligiendo quién conduce."
          invalido={invalido('conductorId')}
        >
          <option value="">Sin conductor fijo</option>
          {conductores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Seleccion>
        <Entrada
          id="observaciones"
          etiqueta="Observaciones"
          opcional
          maxLength={300}
          placeholder="Puerta lateral con cierre defectuoso; GPS instalado"
          defaultValue={unidad?.observaciones ?? undefined}
        />
      </Grupo>

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
        <BotonEnvio
          textoEnviando={textoEnviando}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          {textoBoton}
        </BotonEnvio>
        <Link
          href="/flota"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

/** Nota lateral: por qué se piden estos datos. */
export function AyudaUnidad() {
  return (
    <Card className="h-fit">
      <CardCuerpo className="space-y-3 text-xs leading-relaxed text-slate-400">
        <h2 className="text-sm font-semibold text-slate-200">Por qué se piden estos datos</h2>
        <p>
          <span className="text-slate-300">La carga máxima</span> se muestra al elegir la
          unidad para una hoja de ruta, y el optimizador de recorridos la tiene en cuenta.
        </p>
        <p>
          <span className="text-slate-300">El rendimiento esperado</span> es la referencia con
          la que «Costos y rentabilidad» compara el consumo real. Una desviación sostenida suele
          indicar una avería o combustible que no llega al tanque.
        </p>
        <p>
          <span className="text-slate-300">Los vencimientos</span> alimentan el semáforo de
          documentación: una unidad con el SOAT vencido queda marcada como no operable.
        </p>
      </CardCuerpo>
    </Card>
  );
}
