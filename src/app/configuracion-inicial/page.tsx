import { redirect } from 'next/navigation';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta, IconoDespacho } from '@/components/ui/Iconos';
import { CampoClave } from '@/components/usuarios/CampoClave';
import { empresa } from '@/config/empresa';
import { hayUsuarios } from '@/db/queries/usuarios';
import { crearPrimerAdministrador } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Configuración inicial',
};

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600';

const ERRORES: Record<string, string> = {
  datos: 'Hacen falta el nombre, el correo y la contraseña.',
  correo: 'Ese correo no tiene forma de correo electrónico.',
  clave: 'La contraseña debe tener al menos 8 caracteres.',
};

/**
 * Primera puesta en marcha.
 *
 * Se abre **solo mientras no exista ninguna cuenta**, y en cuanto se crea una
 * redirige a la pantalla de entrada para siempre. Es lo que permite desplegar en
 * Railway sin cuentas de ejemplo y sin tocar la consola: el administrador se crea
 * desde el navegador, con su propio correo y su propia contraseña.
 */
export default async function PaginaConfiguracionInicial({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Con cuentas ya creadas, esta pantalla no existe.
  if (await hayUsuarios()) redirect('/entrar');

  const sp = await searchParams;
  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center py-8">
      <div className="mb-6 text-center">
        <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
          <IconoDespacho width={28} height={28} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">
          Primera puesta en marcha
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {empresa.nombre} · Última milla en {empresa.ciudad}
        </p>
      </div>

      <Card className="border-sky-500/30">
        <CardCuerpo className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
            <IconoDespacho width={16} height={16} className="mt-0.5 shrink-0 text-sky-300" />
            <p className="text-xs leading-relaxed text-sky-100">
              Esta instalación todavía no tiene ninguna cuenta. La que crees aquí será la de{' '}
              <strong>administración</strong>, con acceso a todo, y desde ella podrás dar de alta
              al resto de tu equipo.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              <IconoAlerta width={15} height={15} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <form action={crearPrimerAdministrador} className="space-y-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tu nombre
              <input
                name="nombre"
                required
                autoFocus
                autoComplete="name"
                placeholder="Ana Restrepo"
                className={CLASE_CAMPO}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tu correo electrónico
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                placeholder="tucorreo@tuempresa.pe"
                className={CLASE_CAMPO}
              />
            </label>

            <CampoClave
              etiqueta="Tu contraseña"
              ayuda="Elígela tú. Como es la única cuenta que existe, no hay forma de recuperarla si la pierdes."
            />

            <button
              type="submit"
              className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Crear la cuenta y entrar
            </button>
          </form>

          <p className="border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
            Al crearla entrarás directamente, sin pasar por la pantalla de acceso. Después, esta
            dirección dejará de estar disponible: solo se abre mientras no exista ninguna cuenta.
          </p>
        </CardCuerpo>
      </Card>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
        Si has llegado aquí por error y esta instalación ya está en uso, avisa a quien la
        administre: en cuanto exista una cuenta, esta pantalla redirige al acceso normal.
      </p>
    </div>
  );
}
