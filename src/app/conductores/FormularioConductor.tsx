import Link from 'next/link';
import { Entrada, Grupo, Seleccion } from '@/components/formulario/Campos';
import { BotonEnvio } from '@/components/ui/BotonEnvio';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { parametros, umbrales } from '@/config/empresa';
import type { Conductor } from '@/db/tipos';
import { hoyISO } from '@/lib/format';
import { CATEGORIAS_LICENCIA, SIMBOLO_MONEDA } from '@/lib/maestros';

/** Error → mensaje y campo que lo provocó. Lo comparten el alta y la edición. */
export const ERRORES_CONDUCTOR: Record<string, { mensaje: string; campo: string }> = {
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
    mensaje: 'Ya hay otro conductor con ese documento en la plantilla.',
    campo: 'documento',
  },
};

/** Ficha de un conductor: la usan el alta (sin `conductor`) y la edición (con él). */
export function FormularioConductor({
  accion,
  conductor,
  errorCampo,
  textoBoton,
  textoEnviando,
}: {
  accion: (formData: FormData) => Promise<void>;
  conductor?: Conductor;
  errorCampo?: string;
  textoBoton: string;
  textoEnviando: string;
}) {
  const invalido = (campo: string) => errorCampo === campo;

  return (
    <form action={accion} className="space-y-5">
      {conductor ? <input type="hidden" name="id" value={conductor.id} /> : null}
      <Grupo titulo="Datos personales">
        <Entrada
          id="nombre"
          etiqueta="Nombre completo"
          placeholder="Édgar Rolando Quispe Mamani"
          maxLength={120}
          autoComplete="off"
          defaultValue={conductor?.nombre}
          invalido={invalido('nombre')}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Entrada
            id="documento"
            etiqueta="DNI o carné de extranjería"
            placeholder="43326211"
            maxLength={14}
            autoComplete="off"
            defaultValue={conductor?.documento}
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
            defaultValue={conductor?.telefono ?? undefined}
          />
          <Entrada
            id="email"
            etiqueta="Correo"
            opcional
            type="email"
            maxLength={160}
            defaultValue={conductor?.email ?? undefined}
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
            defaultValue={conductor?.numero_licencia ?? undefined}
          />
          <Seleccion
            id="categoria"
            etiqueta="Categoría"
            opcional
            defaultValue={conductor?.licencia_categoria ?? ''}
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
            defaultValue={conductor?.licencia_vencimiento ?? undefined}
            invalido={invalido('licenciaVence')}
          />
        </div>
      </Grupo>

      <Grupo
        titulo="Vinculación y pago"
        descripcion={
          conductor
            ? 'El contratista cobra una comisión sobre el flete de sus rutas; el empleado, su salario base. Un cambio vale para las liquidaciones que se generen desde ahora.'
            : 'El contratista cobra una comisión sobre el flete de sus rutas; el empleado, su salario base.'
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Seleccion
            id="vinculacion"
            etiqueta="Vinculación"
            defaultValue={conductor?.tipo_vinculacion ?? 'contratista'}
            invalido={invalido('vinculacion')}
          >
            <option value="contratista">Contratista</option>
            <option value="empleado">Empleado en planilla</option>
          </Seleccion>
          <Entrada
            id="ingreso"
            etiqueta="Fecha de ingreso"
            type="date"
            defaultValue={conductor ? (conductor.fecha_ingreso ?? '') : hoyISO()}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Entrada
            id="comision"
            etiqueta="Comisión (%)"
            type="number"
            min={0}
            max={50}
            step="0.1"
            defaultValue={conductor?.comision_pct ?? parametros.comisionContratistaPct}
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
            defaultValue={conductor ? conductor.salario_base : undefined}
            ayuda="Solo para empleados en planilla."
            invalido={invalido('salario')}
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
          href="/conductores"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

/** Nota lateral: la ficha no es la cuenta para entrar. */
export function AyudaConductor() {
  return (
    <Card className="h-fit">
      <CardCuerpo className="space-y-3 text-xs leading-relaxed text-slate-400">
        <h2 className="text-sm font-semibold text-slate-200">Ficha y acceso son dos cosas</h2>
        <p>
          Esta ficha es para planificar y liquidar. Si el conductor va a registrar sus entregas
          desde el móvil, su cuenta se crea en{' '}
          <Link href="/usuarios" className="text-sky-400 hover:text-sky-300">
            Usuarios y permisos
          </Link>{' '}
          con el rol Conductor y se vincula con esta ficha.
        </p>
        <p>
          Un conductor sin cuenta también puede trabajar: la oficina registra sus entregas en su
          nombre.
        </p>
      </CardCuerpo>
    </Card>
  );
}
