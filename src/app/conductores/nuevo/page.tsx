import Link from 'next/link';
import { AvisoError, Entrada, Grupo, Seleccion } from '@/components/formulario/Campos';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { parametros, umbrales } from '@/config/empresa';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO } from '@/lib/format';
import { CATEGORIAS_LICENCIA, SIMBOLO_MONEDA } from '@/lib/maestros';
import { crearConductor } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nuevo conductor',
};

const ERRORES: Record<string, { mensaje: string; campo: string }> = {
  nombre: { mensaje: 'Escribe el nombre completo del conductor.', campo: 'nombre' },
  documento: {
    mensaje: 'El documento debe tener entre 8 y 12 letras o números (DNI o carné de extranjería).',
    campo: 'documento',
  },
  correo: { mensaje: 'El correo no tiene un formato válido.', campo: 'email' },
  vinculacion: { mensaje: 'Indica si es empleado o contratista.', campo: 'vinculacion' },
  categoria: { mensaje: 'Esa categoría de licencia no existe.', campo: 'categoria' },
  fecha: { mensaje: 'Una de las fechas no es válida.', campo: 'licenciaVence' },
  comision: { mensaje: 'La comisión va de 0 % a 50 %.', campo: 'comision' },
  salario: { mensaje: 'El salario base no es válido.', campo: 'salario' },
  duplicado: {
    mensaje: 'Ya hay un conductor con ese documento en la plantilla.',
    campo: 'documento',
  },
};

/**
 * Alta de un conductor en la plantilla.
 *
 * Crea su ficha de trabajo, no su acceso a la aplicación: la cuenta para «Mi
 * ruta» se crea después en «Usuarios y permisos» y se vincula con esta ficha.
 */
export default async function PaginaNuevoConductor({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('conductores', 'editar');
  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;
  const invalido = (campo: string) => error?.campo === campo;

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo conductor"
        descripcion="Queda activo y disponible para asignarle hojas de ruta en cuanto se guarda."
        acciones={
          <Link
            href="/conductores"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver a conductores
          </Link>
        }
      />

      <AvisoError mensaje={error?.mensaje} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera titulo="Ficha del conductor" />
          <CardCuerpo>
            <form action={crearConductor} className="space-y-5">
              <Grupo titulo="Datos personales">
                <Entrada
                  id="nombre"
                  etiqueta="Nombre completo"
                  placeholder="Édgar Rolando Quispe Mamani"
                  maxLength={120}
                  autoComplete="off"
                  invalido={invalido('nombre')}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Entrada
                    id="documento"
                    etiqueta="DNI o carné de extranjería"
                    placeholder="43326211"
                    maxLength={14}
                    autoComplete="off"
                    invalido={invalido('documento')}
                  />
                  <Entrada
                    id="telefono"
                    etiqueta="Teléfono"
                    opcional
                    type="tel"
                    inputMode="tel"
                    maxLength={40}
                    placeholder="+51 987 654 321"
                  />
                  <Entrada
                    id="email"
                    etiqueta="Correo"
                    opcional
                    type="email"
                    maxLength={160}
                    invalido={invalido('email')}
                  />
                </div>
              </Grupo>

              <Grupo
                titulo="Licencia de conducir"
                descripcion={`Con la fecha de vencimiento, la plantilla avisa ${umbrales.preventivo} días antes y marca como no operable a quien la tenga vencida.`}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Entrada
                    id="licencia"
                    etiqueta="Número de licencia"
                    opcional
                    maxLength={20}
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                  <Seleccion
                    id="categoria"
                    etiqueta="Categoría"
                    opcional
                    defaultValue=""
                    ayuda="A para vehículos; B para motos."
                    invalido={invalido('categoria')}
                  >
                    <option value="">Sin indicar</option>
                    {CATEGORIAS_LICENCIA.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Seleccion>
                  <Entrada
                    id="licenciaVence"
                    etiqueta="Vence el"
                    opcional
                    type="date"
                    invalido={invalido('licenciaVence')}
                  />
                </div>
              </Grupo>

              <Grupo
                titulo="Vinculación y pago"
                descripcion="El contratista cobra una comisión sobre el flete de sus rutas; el empleado, su salario base."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Seleccion
                    id="vinculacion"
                    etiqueta="Vinculación"
                    defaultValue="contratista"
                    invalido={invalido('vinculacion')}
                  >
                    <option value="contratista">Contratista</option>
                    <option value="empleado">Empleado en planilla</option>
                  </Seleccion>
                  <Entrada id="ingreso" etiqueta="Fecha de ingreso" type="date" defaultValue={hoyISO()} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Entrada
                    id="comision"
                    etiqueta="Comisión (%)"
                    type="number"
                    min={0}
                    max={50}
                    step="0.1"
                    defaultValue={parametros.comisionContratistaPct}
                    ayuda={`Solo cuenta para contratistas. Por defecto, ${parametros.comisionContratistaPct} %.`}
                    invalido={invalido('comision')}
                  />
                  <Entrada
                    id="salario"
                    etiqueta={`Salario base mensual (${SIMBOLO_MONEDA})`}
                    opcional
                    type="number"
                    min={0}
                    max={50000}
                    step="0.01"
                    placeholder="0"
                    ayuda="Solo para empleados en planilla."
                    invalido={invalido('salario')}
                  />
                </div>
              </Grupo>

              <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                <BotonEnvio
                  textoEnviando="Guardando…"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Añadir a la plantilla
                </BotonEnvio>
                <Link
                  href="/conductores"
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
            <h2 className="text-sm font-semibold text-slate-200">Ficha y acceso son dos cosas</h2>
            <p>
              Esta ficha es para planificar y liquidar. Si el conductor va a registrar sus entregas
              desde el móvil, después crea su cuenta en{' '}
              <Link href="/usuarios" className="text-sky-400 hover:text-sky-300">
                Usuarios y permisos
              </Link>{' '}
              con el rol Conductor y vincúlala con esta ficha.
            </p>
            <p>
              Un conductor sin cuenta también puede trabajar: la oficina registra sus entregas en su
              nombre.
            </p>
          </CardCuerpo>
        </Card>
      </div>
    </>
  );
}
