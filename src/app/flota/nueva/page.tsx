import Link from 'next/link';
import { AvisoError, Entrada, Grupo, Seleccion } from '@/components/formulario/Campos';
import { CamposTipoUnidad } from '@/components/flota/CamposTipoUnidad';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { umbrales } from '@/config/empresa';
import { conductoresAsignables } from '@/db/queries/despachos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { crearUnidad } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nueva unidad',
};

const ERRORES: Record<string, { mensaje: string; campo: string }> = {
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
    mensaje: 'Ya hay una unidad con esa placa en la flota.',
    campo: 'placa',
  },
};

/**
 * Alta de una unidad en la flota.
 *
 * Pide lo mínimo para poder asignarla a una ruta (placa, tipo, capacidad) y lo
 * que después necesitan otros módulos: el rendimiento para costos y los
 * vencimientos legales para el semáforo de documentación.
 */
export default async function PaginaNuevaUnidad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('flota', 'editar');
  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;
  const invalido = (campo: string) => error?.campo === campo;
  const conductores = await conductoresAsignables();
  const anioMaximo = new Date().getFullYear() + 1;

  return (
    <>
      <EncabezadoPagina
        titulo="Nueva unidad"
        descripcion="Queda disponible para asignarla a una hoja de ruta en cuanto se guarda."
        acciones={
          <Link
            href="/flota"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver a flota
          </Link>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera titulo="Ficha de la unidad" />
          <CardCuerpo>
            <form action={crearUnidad} className="space-y-5">
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
                    invalido={invalido('placa')}
                  />
                  <Entrada id="marca" etiqueta="Marca" opcional maxLength={60} placeholder="Renault" />
                  <Entrada id="modelo" etiqueta="Modelo" opcional maxLength={60} placeholder="Kangoo" />
                  <Entrada
                    id="anio"
                    etiqueta="Año"
                    opcional
                    type="number"
                    min={1980}
                    max={anioMaximo}
                    step={1}
                    placeholder={String(anioMaximo - 3)}
                    invalido={invalido('anio')}
                  />
                </div>
              </Grupo>

              <Grupo titulo="Capacidad y consumo">
                <CamposTipoUnidad invalido={error?.campo} />
                <Entrada
                  id="km"
                  etiqueta="Kilometraje actual"
                  opcional
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  ayuda="Sirve de punto de partida para el mantenimiento por kilómetros."
                  invalido={invalido('km')}
                  className="sm:max-w-xs"
                />
              </Grupo>

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

              <Grupo titulo="Asignación">
                <Seleccion
                  id="conductorId"
                  etiqueta="Conductor habitual"
                  opcional
                  defaultValue=""
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
                />
              </Grupo>

              <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                <BotonEnvio
                  textoEnviando="Guardando…"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Añadir a la flota
                </BotonEnvio>
                <Link
                  href="/flota"
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Link>
              </div>
            </form>
          </CardCuerpo>
        </Card>

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
      </div>
    </>
  );
}
