'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { IconoAlerta, IconoCheck, IconoMapa, IconoReloj } from '@/components/ui/Iconos';

/**
 * Comparte la ubicación del dispositivo con la aplicación.
 *
 * Usa `navigator.geolocation.watchPosition`, que pide permiso al usuario y luego
 * avisa cada vez que el GPS tiene una posición nueva. Las coordenadas se envían
 * a `/api/ubicacion` y desde ahí aparecen en el mapa de rastreo igual que
 * cualquier otra telemetría.
 *
 * Dos cosas que conviene saber y que se avisan en la interfaz:
 *
 *  - **Requiere HTTPS.** Los navegadores solo dan acceso a la ubicación en
 *    contextos seguros (HTTPS o `localhost`). En Railway lo tienes; por HTTP en
 *    una IP de la red local, no.
 *  - **Con la pantalla apagada no funciona.** Un navegador suspende el
 *    JavaScript en segundo plano, así que esto sirve para llevar el móvil con la
 *    app abierta. Para seguimiento continuo con la pantalla bloqueada hace falta
 *    una aplicación nativa.
 */

/** Cada cuánto se envía una posición. Más seguido gasta batería sin aportar. */
const INTERVALO_MS = 15_000;

interface Destino {
  lat: number;
  lng: number;
  direccion: string;
}

interface Props {
  /** Parada siguiente de la ruta en curso, para la ubicación de prueba. */
  destino: Destino | null;
  rutaCodigo: string | null;
  placa: string | null;
  /** Si no se puede reportar, aquí viene el motivo ya redactado. */
  motivoBloqueo: string | null;
  /**
   * Solo para quien no es conductor: la unidad sobre la que se reporta. El
   * conductor no lo necesita porque el servidor lo deduce de su sesión, y de
   * hecho se ignora si lo enviara.
   */
  unidadId: number | null;
}

interface UltimoEnvio {
  hora: string;
  lat: number;
  lng: number;
  precision: number | null;
  origen: 'dispositivo' | 'prueba';
}

export function CompartirUbicacion({
  destino,
  rutaCodigo,
  placa,
  motivoBloqueo,
  unidadId,
}: Props) {
  const [activo, setActivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<UltimoEnvio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seguro, setSeguro] = useState(true);

  const vigilancia = useRef<number | null>(null);
  const ultimoEnvioMs = useRef(0);

  useEffect(() => {
    // `isSecureContext` es false en HTTP salvo en localhost.
    setSeguro(window.isSecureContext);
  }, []);

  const enviar = useCallback(
    async (
      lat: number,
      lng: number,
      velocidad: number,
      rumbo: number,
      precision: number | null,
      origen: UltimoEnvio['origen'],
    ) => {
      setEnviando(true);
      try {
        const respuesta = await fetch('/api/ubicacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat,
            lng,
            velocidad,
            rumbo,
            precision,
            // El servidor lo ignora para los conductores: su unidad sale de la sesión.
            ...(unidadId !== null ? { unidadId } : {}),
          }),
        });
        const datos = (await respuesta.json()) as {
          ok: boolean;
          mensaje?: string;
          lat?: number;
          lng?: number;
          precision?: number | null;
        };

        if (!datos.ok) {
          setError(datos.mensaje ?? 'No se pudo registrar la ubicación.');
          return;
        }

        setError(null);
        setUltimo({
          hora: new Date().toLocaleTimeString('es-PE'),
          lat: datos.lat ?? lat,
          lng: datos.lng ?? lng,
          precision: datos.precision ?? precision,
          origen,
        });
      } catch {
        setError('No hay conexión con el servidor.');
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  const detener = useCallback(() => {
    if (vigilancia.current !== null) {
      navigator.geolocation.clearWatch(vigilancia.current);
      vigilancia.current = null;
    }
    setActivo(false);
  }, []);

  const iniciar = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Este navegador no tiene acceso a la ubicación.');
      return;
    }

    setError(null);
    setActivo(true);
    ultimoEnvioMs.current = 0;

    vigilancia.current = navigator.geolocation.watchPosition(
      (posicion) => {
        // El GPS avisa muy seguido; se filtra para no inundar el servidor.
        const ahora = Date.now();
        if (ahora - ultimoEnvioMs.current < INTERVALO_MS) return;
        ultimoEnvioMs.current = ahora;

        const { latitude, longitude, speed, heading, accuracy } = posicion.coords;
        void enviar(
          latitude,
          longitude,
          speed !== null && speed >= 0 ? speed * 3.6 : 0,
          heading !== null && heading >= 0 ? heading : 0,
          accuracy ?? null,
          'dispositivo',
        );
      },
      (fallo) => {
        const mensajes: Record<number, string> = {
          1: 'Diste permiso denegado a la ubicación. Actívalo en los ajustes del navegador.',
          2: 'El dispositivo no pudo determinar la ubicación. Prueba en un sitio más abierto.',
          3: 'Se agotó el tiempo esperando al GPS. Reintentando…',
        };
        setError(mensajes[fallo.code] ?? fallo.message);
        if (fallo.code === 1) detener();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 25_000 },
    );
  }, [enviar, detener]);

  // Al salir de la pantalla se deja de vigilar el GPS.
  useEffect(() => detener, [detener]);

  if (motivoBloqueo) {
    return (
      <Card className="border-amber-500/30">
        <CardCuerpo className="flex items-start gap-3">
          <IconoAlerta width={18} height={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-medium text-amber-200">No puedes compartir tu ubicación</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{motivoBloqueo}</p>
          </div>
        </CardCuerpo>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardCuerpo className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200">
                {rutaCodigo ? `Ruta ${rutaCodigo}` : 'Sin ruta en curso'}
                {placa ? ` · ${placa}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Mientras esté activo, tu posición se envía cada 15 segundos.
              </p>
            </div>
            {activo ? (
              <Badge tono="exito">
                <span className="latido inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Compartiendo
              </Badge>
            ) : (
              <Badge tono="neutro">Detenido</Badge>
            )}
          </div>

          {!seguro ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
              <IconoAlerta width={14} height={14} className="mt-0.5 shrink-0" />
              El navegador solo da acceso a la ubicación por HTTPS. Esta dirección no es segura, así
              que no funcionará.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {activo ? (
              <button
                type="button"
                onClick={detener}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Detener
              </button>
            ) : (
              <button
                type="button"
                onClick={iniciar}
                disabled={!seguro}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <IconoMapa width={16} height={16} />
                Compartir mi ubicación
              </button>
            )}
          </div>

          {error ? (
            <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              <IconoAlerta width={14} height={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}

          {ultimo ? (
            <dl className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Último envío</dt>
                <dd className="num flex items-center gap-1 text-slate-300">
                  <IconoCheck width={12} height={12} className="text-emerald-400" />
                  {ultimo.hora}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Latitud</dt>
                <dd className="num text-slate-300">{ultimo.lat.toFixed(5)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Longitud</dt>
                <dd className="num text-slate-300">{ultimo.lng.toFixed(5)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Precisión</dt>
                <dd className="num text-slate-300">
                  {ultimo.precision !== null ? `±${Math.round(ultimo.precision)} m` : '—'}
                </dd>
              </div>
            </dl>
          ) : null}

          {ultimo?.origen === 'prueba' ? (
            <p className="text-[11px] text-slate-500">
              La última posición enviada fue de <strong className="text-slate-400">prueba</strong>,
              no de tu GPS.
            </p>
          ) : null}
        </CardCuerpo>
      </Card>

      {destino ? (
        <Card className="mt-4">
          <CardCuerpo className="space-y-3">
            <div className="flex items-start gap-2">
              <IconoReloj width={16} height={16} className="mt-0.5 shrink-0 text-sky-400" />
              <div>
                <p className="text-sm font-medium text-slate-200">¿Estás probando fuera de la zona?</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  Si tu dispositivo no está en Lima, tu posición real aparecerá lejísimos de las
                  rutas y el mapa se verá raro. Este botón envía una posición de mentira junto a tu
                  siguiente parada, para que veas cómo queda en el mapa.
                </p>
              </div>
            </div>

            <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-xs text-slate-400">
              Próxima parada: <span className="text-slate-300">{destino.direccion}</span>
              <span className="num ml-2 text-slate-500">
                {destino.lat.toFixed(5)}, {destino.lng.toFixed(5)}
              </span>
            </p>

            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                // Se acerca un poco hacia la parada, para que no caiga justo
                // encima y se aprecie el movimiento en el mapa.
                const lat = destino.lat + (Math.random() - 0.5) * 0.004;
                const lng = destino.lng + (Math.random() - 0.5) * 0.004;
                void enviar(lat, lng, 24 + Math.random() * 12, Math.random() * 360, 8, 'prueba');
              }}
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar una posición de prueba aquí'}
            </button>
          </CardCuerpo>
        </Card>
      ) : null}
    </>
  );
}
