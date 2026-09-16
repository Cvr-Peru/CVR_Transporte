import { Badge } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta, IconoCheck, IconoDespacho } from '@/components/ui/Iconos';
import { SubirLogo } from '@/components/configuracion/SubirLogo';
import { empresa } from '@/config/empresa';
import { producto } from '@/config/producto';
import { identidad, urlLogo } from '@/db/queries/configuracion';
import { requerirPermiso } from '@/lib/auth/sesion';
import { guardarConfiguracion } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Configuración',
};

/**
 * Identidad de la empresa.
 *
 * Es la pantalla que convierte el programa en el de cada cliente: aquí se pone su
 * nombre, su logo y sus datos fiscales, y con eso se muestra en toda la
 * aplicación —la cabecera, la pantalla de acceso, el móvil del conductor y la
 * página pública donde el cliente final rastrea su paquete—.
 *
 * Solo la ve administración. No confundir con `src/config/empresa.ts`, que sigue
 * guardando lo **regional** —moneda, idioma, unidades— y no cambia por cliente.
 */

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200 placeholder:text-slate-600';

export default async function PaginaConfiguracion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('configuracion', 'editar');
  const sp = await searchParams;

  const actual = await identidad();
  const logo = urlLogo(actual);

  const guardado = typeof sp.guardado === 'string' ? sp.guardado : null;
  const error = typeof sp.error === 'string' ? sp.error : null;

  return (
    <>
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="La identidad de la empresa: es lo que ven tu equipo y tus clientes en toda la aplicación."
      />

      {guardado ? (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
        >
          <IconoCheck width={16} height={16} className="mt-0.5 shrink-0" />
          Identidad guardada como «{guardado}». Ya se ve en toda la aplicación.
        </p>
      ) : null}

      {error === 'datos' ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />
          El nombre y el nombre corto son obligatorios: son los que aparecen en la cabecera.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardCabecera
            titulo="Tu empresa"
            descripcion="Se guarda en la base de datos, así que no hace falta tocar código ni volver a desplegar."
          />
          <CardCuerpo>
            <form action={guardarConfiguracion} className="space-y-5">
              <div>
                <span className="mb-1 block text-xs text-slate-400">Logo</span>
                <SubirLogo logoActual={logo} />
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Razón social
                  <input
                    name="nombre"
                    required
                    autoComplete="organization"
                    defaultValue={actual.nombre}
                    placeholder="Transportes Lima Express S.A.C."
                    className={CLASE_CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Nombre corto
                  <input
                    name="nombreCorto"
                    required
                    autoComplete="off"
                    defaultValue={actual.nombreCorto}
                    placeholder="Lima Express"
                    className={CLASE_CAMPO}
                  />
                  <span className="text-[11px] text-slate-500">
                    Es el que aparece en la cabecera. Cuanto más corto, mejor.
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  {empresa.idFiscalLabel}
                  <input
                    name="idFiscal"
                    autoComplete="off"
                    defaultValue={actual.idFiscal}
                    placeholder="20601234567"
                    className={CLASE_CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Teléfono
                  <input
                    name="telefono"
                    autoComplete="off"
                    inputMode="tel"
                    defaultValue={actual.telefono}
                    placeholder="+51 1 480 2210"
                    className={CLASE_CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Ciudad
                  <input
                    name="ciudad"
                    autoComplete="off"
                    defaultValue={actual.ciudad}
                    placeholder="Lima"
                    className={CLASE_CAMPO}
                  />
                </label>
              </div>

              <div className="border-t border-slate-800 pt-5">
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Guardar
                </button>
              </div>
            </form>
          </CardCuerpo>
        </Card>

        <div className="space-y-4">
          {/* Vista previa: así se verá la cabecera con lo que hay guardado. */}
          <Card>
            <CardCabecera titulo="Cómo se ve" descripcion="La cabecera de la aplicación." />
            <CardCuerpo>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-3">
                {logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logo}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg border border-slate-800 bg-slate-950 object-contain"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
                    <IconoDespacho width={19} height={19} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-100">
                    {actual.nombreCorto}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    Última milla · {actual.ciudad}
                  </span>
                </span>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Sin logo se muestra la marca del programa. En cuanto subas uno, ocupa su lugar en
                la cabecera, en la pantalla de acceso y en el móvil del conductor.
              </p>
            </CardCuerpo>
          </Card>

          <Card>
            <CardCuerpo className="space-y-3 text-xs leading-relaxed text-slate-400">
              <h2 className="text-sm font-semibold text-slate-200">Dónde aparece esto</h2>
              <ul className="space-y-1.5">
                <li>· La cabecera y el pie de toda la aplicación.</li>
                <li>· La pantalla de acceso, con tu logo y tu nombre.</li>
                <li>· «Mi ruta», la pantalla del conductor en el móvil.</li>
                <li>
                  · La <span className="text-slate-300">página pública de rastreo</span>, donde el
                  cliente final busca su paquete.
                </li>
              </ul>

              <p className="border-t border-slate-800 pt-3 text-[11px] text-slate-500">
                Lo que <strong className="text-slate-400">no</strong> cambia aquí: la moneda, el
                idioma y las unidades de medida. Eso es regional y vive en{' '}
                <code className="text-slate-400">src/config/empresa.ts</code>, porque se decide al
                instalar la aplicación, no al usarla.
              </p>
            </CardCuerpo>
          </Card>

          <Card>
            <CardCuerpo className="flex items-start gap-3 text-xs leading-relaxed text-slate-400">
              <IconoDespacho width={16} height={16} className="mt-0.5 shrink-0 text-sky-400" />
              <p>
                Este programa es <strong className="text-slate-300">{producto.completo}</strong>. La
                marca de la empresa que lo usa es la de arriba; la del programa aparece discreta en
                el pie.
              </p>
            </CardCuerpo>
          </Card>
        </div>
      </div>
    </>
  );
}
