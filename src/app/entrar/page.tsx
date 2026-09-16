import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { IconoAlerta, IconoDespacho } from '@/components/ui/Iconos';
import { LimpiarPaginasGuardadas } from '@/components/pwa/LimpiarPaginas';
import { identidad } from '@/db/queries/configuracion';
import { CLAVE_DEMO as CLAVE_DEMO_COMPARTIDA, CUENTAS_DEMO } from '@/lib/auth/demo';
import { hayUsuarios } from '@/db/queries/usuarios';
import { sesionActual } from '@/lib/auth/sesion';
import { descripcionRol, etiquetaRol } from '@/lib/auth/permisos';
import { entrar } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Entrar',
};

type Parametros = Record<string, string | string[] | undefined>;

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600';

const MENSAJES: Record<string, string> = {
  credenciales: 'El correo o la contraseña no son correctos.',
  inactiva: 'Esta cuenta está desactivada. Habla con administración.',
  faltan: 'Escribe tu correo y tu contraseña.',
  sesion: 'Tu sesión caducó. Vuelve a entrar.',
  permiso: 'No tienes permiso para ver esa sección.',
};

/**
 * Accesos de demostración.
 *
 * Se muestran solo si se piden explícitamente con `MOSTRAR_ACCESOS_DEMO=1`, y
 * nunca por defecto en producción: un botón que entra como administrador sin
 * contraseña, en una URL pública, es exactamente lo que no se quiere dejar
 * abierto. Para una demo con invitados se activa; para uso real, no.
 *
 * La lista y la contraseña se toman de `@/lib/auth/demo`, el mismo sitio que usa
 * el generador de datos. Aquí estaban **duplicadas a mano**, y se quedaron con los
 * correos de la versión anterior del proyecto: los botones existían pero no
 * entraban con nadie. Es justo el fallo que ese archivo compartido existe para
 * evitar, así que no se vuelve a escribir la lista aquí.
 */
const ACCESOS_DEMO = CUENTAS_DEMO;
const CLAVE_DEMO = CLAVE_DEMO_COMPARTIDA;

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  // Si ya hay sesión, no tiene sentido volver a pedir credenciales.
  const sesion = await sesionActual();
  if (sesion) redirect('/');

  // Sin ninguna cuenta creada no hay nada que hacer aquí: se manda a la primera
  // puesta en marcha, que es la única puerta que está abierta en ese momento.
  // Las dos condiciones son complementarias, así que no pueden rebotarse.
  if (!(await hayUsuarios())) redirect('/configuracion-inicial');

  const sp = await searchParams;
  const error = primero(sp.error);
  const volver = primero(sp.volver) || '/';

  const mostrarDemo = process.env.MOSTRAR_ACCESOS_DEMO === '1';
  const marca = await identidad();

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center py-8">
      <LimpiarPaginasGuardadas />

      <div className="mb-6 text-center">
        <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
          <IconoDespacho width={28} height={28} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">
          Panel de operación
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {marca.nombre} · Última milla en {marca.ciudad}
        </p>
      </div>

      <Card>
        <CardCuerpo className="space-y-4">
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              <IconoAlerta width={15} height={15} className="mt-0.5 shrink-0" />
              {MENSAJES[error] ?? MENSAJES.credenciales}
            </p>
          ) : null}

          <form action={entrar} className="space-y-3">
            <input type="hidden" name="volver" value={volver} />

            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Correo electrónico
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                autoFocus
                placeholder="tucorreo@tuempresa.pe"
                className={CLASE_CAMPO}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Contraseña
              <input
                type="password"
                name="clave"
                required
                autoComplete="current-password"
                className={CLASE_CAMPO}
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Entrar
            </button>
          </form>
        </CardCuerpo>
      </Card>

      {mostrarDemo ? (
        <Card className="mt-4 border-amber-500/30">
          <CardCuerpo className="space-y-3">
            <div className="flex items-start gap-2">
              <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-medium text-amber-200">
                  Accesos de demostración activados
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                  Un clic entra directamente, sin contraseña. Es cómodo para enseñar el
                  prototipo, pero <strong className="text-slate-300">debe desactivarse</strong> antes
                  de usar el sistema con datos reales: quita la variable{' '}
                  <code className="text-slate-300">MOSTRAR_ACCESOS_DEMO</code> del servidor.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {ACCESOS_DEMO.map((acceso) => (
                <li key={acceso.rol}>
                  <form action={entrar}>
                    <input type="hidden" name="email" value={acceso.email} />
                    <input type="hidden" name="clave" value={CLAVE_DEMO} />
                    <input type="hidden" name="volver" value="/" />
                    <button
                      type="submit"
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-800/40"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-slate-200">
                          {etiquetaRol(acceso.rol)}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {descripcionRol(acceso.rol)}
                        </span>
                      </span>
                      <Badge tono="info">Entrar</Badge>
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <p className="border-t border-slate-800 pt-3 text-[11px] text-slate-500">
              Contraseña de todas ellas: <code className="text-slate-300">{CLAVE_DEMO}</code>
            </p>
          </CardCuerpo>
        </Card>
      ) : null}

      <p className="mt-6 text-center text-xs text-slate-600">
        ¿Solo quieres saber dónde va tu paquete?{' '}
        <Link
          href="/rastrear"
          className="text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
        >
          Rastrea tu envío
        </Link>{' '}
        — no hace falta cuenta.
      </p>
    </div>
  );
}
