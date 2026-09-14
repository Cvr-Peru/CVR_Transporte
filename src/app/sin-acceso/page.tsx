import Link from 'next/link';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { IconoAlerta } from '@/components/ui/Iconos';
import { sesionActual } from '@/lib/auth/sesion';
import { etiquetaRol, rutaInicio, type Modulo } from '@/lib/auth/permisos';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sin acceso',
};

const NOMBRES: Record<string, string> = {
  tablero: 'Tablero',
  despachos: 'Despachos',
  rastreo: 'Rastreo en vivo',
  flota: 'Flota',
  conductores: 'Conductores',
  finanzas: 'Costos y rentabilidad',
  facturacion: 'Facturación',
  liquidaciones: 'Liquidaciones',
};

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default async function PaginaSinAcceso({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const modulo = primero(sp.modulo) as Modulo | '';
  const sesion = await sesionActual();

  return (
    <div className="mx-auto flex max-w-lg flex-col justify-center py-10">
      <Card>
        <CardCuerpo className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="rounded-full bg-rose-500/15 p-3 text-rose-300">
            <IconoAlerta width={26} height={26} />
          </span>
          <h1 className="text-lg font-semibold text-slate-100">No tienes acceso a esta sección</h1>
          <p className="max-w-sm text-sm text-slate-400">
            {modulo && NOMBRES[modulo]
              ? `Tu perfil no incluye el módulo de ${NOMBRES[modulo]}.`
              : 'Tu perfil no incluye esta sección.'}{' '}
            {sesion
              ? `Has entrado como ${etiquetaRol(sesion.rol).toLowerCase()}.`
              : ''}{' '}
            Si crees que es un error, habla con administración.
          </p>
          <Link
            href={sesion ? rutaInicio(sesion.rol) : '/entrar'}
            className="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            {sesion ? 'Ir a mi sección' : 'Iniciar sesión'}
          </Link>
        </CardCuerpo>
      </Card>
    </div>
  );
}
