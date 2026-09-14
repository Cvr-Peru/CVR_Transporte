'use client';

import { useEffect, useState } from 'react';
import { IconoCheck, IconoEquis, IconoSalir } from '@/components/ui/Iconos';

/**
 * Piezas de la aplicación instalable.
 *
 * `beforeinstallprompt` solo existe en navegadores basados en Chromium. En iOS
 * el navegador no ofrece ese evento: la única vía es que el usuario use
 * «Compartir → Añadir a pantalla de inicio», así que ahí se muestran las
 * instrucciones en lugar de un botón que no haría nada.
 */

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Registra el service worker. No dibuja nada. */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // En local el service worker estorba más que ayuda: guarda las páginas y
    // sirve versiones antiguas, así que ves la aplicación de hace días sin
    // entender por qué. Aquí se desregistra cualquier resto que hubiera quedado
    // y no se instala ninguno. En un dominio real (Railway) sí se registra, que
    // es donde aporta el modo sin conexión.
    const esLocal =
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ||
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);

    const forzado = process.env.NEXT_PUBLIC_PWA_EN_LOCAL === '1';

    if (esLocal && !forzado) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registros) => registros.forEach((r) => r.unregister()))
        .catch(() => {
          /* nada que limpiar */
        });
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Si falla el registro la app sigue funcionando, solo pierde el modo sin
      // conexión y la instalación.
    });
  }, []);

  return null;
}

/** Aviso fijo cuando el dispositivo pierde la conexión. */
export function AvisoSinConexion() {
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    const actualizar = () => setSinConexion(!navigator.onLine);
    actualizar();
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);

  if (!sinConexion) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 border-b border-amber-500/30 bg-amber-500/15 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-center text-xs text-amber-200 backdrop-blur"
    >
      <span className="latido mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      Sin conexión. Estás viendo la última información guardada y no se pueden registrar
      cambios.
    </div>
  );
}

/**
 * Botón para instalar la app. Se oculta si ya está instalada o si el navegador
 * no ofrece la instalación.
 */
export function BotonInstalar({ className = '' }: { className?: string }) {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [esIos, setEsIos] = useState(false);
  const [instalada, setInstalada] = useState(true); // pesimista hasta comprobarlo
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setEsIos(ios);

    const enModoApp =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalada(enModoApp);

    const alPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    };
    const alInstalar = () => {
      setEvento(null);
      setInstalada(true);
    };

    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoderInstalar);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  if (instalada) return null;

  // iOS: no hay evento de instalación, solo instrucciones.
  if (esIos) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setMostrarAyuda((v) => !v)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
        >
          <IconoSalir width={14} height={14} />
          Instalar en el iPhone
        </button>
        {mostrarAyuda ? (
          <p className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-[11px] leading-relaxed text-slate-400">
            Toca el botón <span className="text-slate-200">Compartir</span> de Safari y elige{' '}
            <span className="text-slate-200">Añadir a pantalla de inicio</span>. Safari no permite
            instalarla de otra forma.
          </p>
        ) : null}
      </div>
    );
  }

  if (!evento) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await evento.prompt();
        const eleccion = await evento.userChoice;
        if (eleccion.outcome === 'accepted') setInstalada(true);
        setEvento(null);
      }}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-500/20 ${className}`}
    >
      <IconoCheck width={14} height={14} />
      Instalar la app
    </button>
  );
}

/**
 * Invita a instalar la app una sola vez por sesión, en una franja discreta.
 * Se descarta si el usuario la cierra y no vuelve a insistir.
 */
export function InvitacionInstalar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const enModoApp = window.matchMedia('(display-mode: standalone)').matches;
    if (enModoApp) return;
    if (sessionStorage.getItem('invitacion-instalar-cerrada') === '1') return;

    // Se espera a que el navegador confirme que la app es instalable.
    const alPoderInstalar = (e: Event) => {
      e.preventDefault();
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    return () => window.removeEventListener('beforeinstallprompt', alPoderInstalar);
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-sky-200">Instala la app en este dispositivo</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Acceso directo desde el inicio, pantalla completa y consulta sin conexión.
        </p>
      </div>
      <BotonInstalar className="w-auto shrink-0" />
      <button
        type="button"
        aria-label="Descartar"
        onClick={() => {
          sessionStorage.setItem('invitacion-instalar-cerrada', '1');
          setVisible(false);
        }}
        className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
      >
        <IconoEquis width={14} height={14} />
      </button>
    </div>
  );
}
