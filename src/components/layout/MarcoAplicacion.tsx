'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { empresa } from '@/config/empresa';
import { BotonInstalar } from '@/components/pwa/Pwa';
import { ConmutadorTema } from '@/components/tema/ConmutadorTema';
import { salir } from '@/app/entrar/actions';
import { etiquetaRol, type Modulo } from '@/lib/auth/permisos';
import type { Sesion } from '@/lib/auth/sesion';
import {
  IconoBuscar,
  IconoCaja,
  IconoConductor,
  IconoDespacho,
  IconoEquis,
  IconoFactura,
  IconoFinanzas,
  IconoFlota,
  IconoLiquidacion,
  IconoMapa,
  IconoRuta,
  IconoSalir,
  IconoTablero,
  IconoUbicacion,
  IconoUsuario,
} from '@/components/ui/Iconos';

/**
 * Marco de la aplicación.
 *
 * Decide entre dos presentaciones según la ruta:
 *   - **Interna**: barra lateral en escritorio y barra inferior en el móvil, con
 *     los módulos que el rol del usuario tiene permitidos.
 *   - **Pública**: sin navegación interna, para la pantalla de entrada, la de
 *     rastreo que usa el cliente final y la de sin conexión.
 *
 * Es un componente de cliente porque necesita `usePathname`. Los hijos siguen
 * siendo de servidor: se pasan ya renderizados como `children`.
 *
 * Importante: ocultar entradas del menú es solo comodidad. Quien decide de
 * verdad es `requerirPermiso()` en cada página y en cada acción de servidor.
 */

interface ItemNav {
  href: string;
  etiqueta: string;
  /** Etiqueta corta para la barra inferior del móvil. */
  corta?: string;
  Icono: (p: { width?: number; height?: number }) => React.ReactElement;
  /** Módulo necesario para verlo. `null` = siempre visible (páginas públicas). */
  modulo: Modulo | null;
  /** Solo se muestra a quien puede compartir la ubicación de su dispositivo. */
  soloSiComparte?: boolean;
  /** Solo se muestra a quien puede abrir su ruta de reparto en el móvil. */
  soloSiMiRuta?: boolean;
}

const GRUPOS: { titulo: string; items: ItemNav[] }[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/', etiqueta: 'Tablero', corta: 'Tablero', Icono: IconoTablero, modulo: 'tablero' },
      {
        href: '/mi-ruta',
        etiqueta: 'Mi ruta de hoy',
        corta: 'Mi ruta',
        Icono: IconoRuta,
        modulo: null,
        soloSiMiRuta: true,
      },
      {
        href: '/pedidos',
        etiqueta: 'Pedidos',
        corta: 'Pedidos',
        Icono: IconoCaja,
        modulo: 'pedidos',
      },
      {
        href: '/despachos',
        etiqueta: 'Despachos',
        corta: 'Despachos',
        Icono: IconoDespacho,
        modulo: 'despachos',
      },
      { href: '/rastreo', etiqueta: 'Rastreo en vivo', corta: 'En vivo', Icono: IconoMapa, modulo: 'rastreo' },
      {
        href: '/mi-ubicacion',
        etiqueta: 'Mi ubicación',
        corta: 'Mi GPS',
        Icono: IconoUbicacion,
        modulo: null,
        soloSiComparte: true,
      },
      {
        href: '/rastrear',
        etiqueta: 'Rastrear una guía',
        corta: 'Rastrear',
        Icono: IconoBuscar,
        modulo: null,
      },
    ],
  },
  {
    titulo: 'Recursos',
    items: [
      { href: '/flota', etiqueta: 'Flota', Icono: IconoFlota, modulo: 'flota' },
      { href: '/conductores', etiqueta: 'Conductores', Icono: IconoConductor, modulo: 'conductores' },
    ],
  },
  {
    titulo: 'Dinero',
    items: [
      { href: '/finanzas', etiqueta: 'Costos y rentabilidad', Icono: IconoFinanzas, modulo: 'finanzas' },
      { href: '/facturacion', etiqueta: 'Facturación', Icono: IconoFactura, modulo: 'facturacion' },
      { href: '/liquidaciones', etiqueta: 'Liquidaciones', Icono: IconoLiquidacion, modulo: 'liquidaciones' },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      {
        href: '/usuarios',
        etiqueta: 'Usuarios y permisos',
        corta: 'Usuarios',
        Icono: IconoUsuario,
        modulo: 'usuarios',
      },
    ],
  },
];

/** Rutas que se muestran sin la navegación interna. */
const RUTAS_PUBLICAS = ['/entrar', '/configuracion-inicial', '/sin-acceso', '/rastrear', '/offline'];

function esActiva(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 px-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
        <IconoDespacho width={19} height={19} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-100">
          {empresa.nombreCorto}
        </span>
        {!compacta ? (
          <span className="block truncate text-[11px] text-slate-500">
            Última milla · {empresa.ciudad}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Bloque de usuario con el botón de salir. */
function Usuario({ sesion }: { sesion: Sesion }) {
  const iniciales = sesion.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex items-center gap-2.5 border-t border-slate-800 px-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/60 text-[11px] font-semibold text-slate-200">
        {iniciales || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-200">{sesion.nombre}</p>
        <p className="truncate text-[10px] text-slate-500">{etiquetaRol(sesion.rol)}</p>
      </div>
      <form action={salir}>
        <button
          type="submit"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
        >
          <IconoSalir width={15} height={15} />
        </button>
      </form>
    </div>
  );
}

export function MarcoAplicacion({
  children,
  sesion,
  modulos,
  puedeCompartir,
  puedeMiRuta,
}: {
  children: ReactNode;
  sesion: Sesion | null;
  modulos: Modulo[];
  puedeCompartir: boolean;
  puedeMiRuta: boolean;
}) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Al cambiar de ruta se cierra el panel «Más».
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  if (esRutaPublica(pathname)) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-slate-800 bg-slate-900/40 pt-[env(safe-area-inset-top)]">
          {/* El conmutador también aquí: quien prefiere claro no debería tener que
              entrar a oscuras para poder cambiarlo. */}
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 pr-3">
            <Marca />
            <ConmutadorTema compacto />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-slate-800 px-4 py-3 text-center text-[11px] text-slate-600">
          {empresa.nombre} · {empresa.telefono}
        </footer>
      </div>
    );
  }

  // Solo se muestran los módulos permitidos; `/rastrear` va con `modulo: null`
  // porque es público y no depende de la sesión.
  const visibles = (items: ItemNav[]) =>
    items.filter(
      (i) =>
        (i.modulo === null || modulos.includes(i.modulo)) &&
        (!i.soloSiComparte || puedeCompartir) &&
        (!i.soloSiMiRuta || puedeMiRuta),
    );

  const grupos = GRUPOS.map((g) => ({ ...g, items: visibles(g.items) })).filter(
    (g) => g.items.length > 0,
  );

  // En la barra inferior del móvil caben cuatro pestañas con su etiqueta. Lo que
  // sobra —incluidos los grupos de recursos y dinero— pasa al panel «Más», que
  // ya existía para eso.
  const itemsMovil = (grupos[0]?.items ?? []).slice(0, 4);
  const itemsMenu = [
    ...(grupos[0]?.items ?? []).slice(4),
    ...grupos.slice(1).flatMap((g) => g.items),
  ];

  if (!sesion) {
    // Sin sesión no debería llegarse aquí: cada página redirige antes. Se deja
    // un marco mínimo para no romper el render durante la redirección.
    return (
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ── Barra lateral (escritorio) ───────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40 lg:flex">
        <Marca />
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="mb-4">
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {grupo.titulo}
              </p>
              {grupo.items.map((item) => {
                const activa = esActiva(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={activa ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                      activa
                        ? 'bg-slate-800 font-medium text-slate-50'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                    )}
                  >
                    <item.Icono width={17} height={17} />
                    {item.etiqueta}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-slate-800 px-3 py-3">
          <ConmutadorTema />
          <BotonInstalar />
          <p className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
            <span className="latido inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            Datos de demostración
          </p>
        </div>
        <Usuario sesion={sesion} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Cabecera (móvil) ───────────────────────────────── */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/95 pr-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <Marca compacta />
          <div className="flex items-center gap-1">
            <ConmutadorTema compacto />
            <BotonInstalar className="w-auto" />
            <form action={salir}>
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <IconoSalir width={17} height={17} />
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-28 pt-5 lg:px-7 lg:pb-6 lg:pt-6">
          {children}
        </main>

        <footer className="hidden border-t border-slate-800 px-7 py-3 text-center text-[11px] text-slate-600 lg:block">
          {empresa.nombre} · {empresa.idFiscalLabel} {empresa.idFiscal} · Prototipo con datos de
          ejemplo
        </footer>
      </div>

      {/* ── Panel «Más» (móvil) ─────────────────────────────── */}
      {menuAbierto && itemsMenu.length > 0 ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <nav className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-800 bg-slate-900 pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold text-slate-200">Todos los módulos</p>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setMenuAbierto(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <IconoEquis width={16} height={16} />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2 px-4 pb-4">
              {itemsMenu.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuAbierto(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm',
                      esActiva(pathname, item.href)
                        ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                        : 'border-slate-800 bg-slate-950/50 text-slate-300',
                    )}
                  >
                    <item.Icono width={18} height={18} />
                    <span className="min-w-0 truncate">{item.etiqueta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}

      {/* ── Navegación inferior (móvil) ─────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="flex items-stretch">
          {itemsMovil.map((item) => {
            const activa = esActiva(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={activa ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors',
                    activa ? 'text-sky-300' : 'text-slate-400',
                  )}
                >
                  <item.Icono width={21} height={21} />
                  <span className="truncate">{item.corta ?? item.etiqueta}</span>
                </Link>
              </li>
            );
          })}
          {itemsMenu.length > 0 ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMenuAbierto((v) => !v)}
                aria-expanded={menuAbierto}
                className={cn(
                  'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors',
                  menuAbierto ? 'text-sky-300' : 'text-slate-400',
                )}
              >
                <IconoFlota width={21} height={21} />
                <span>Más</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}
