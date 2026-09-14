'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapaLeaflet } from 'leaflet';
// El CSS se importa de forma ESTÁTICA, no dentro de la carga dinámica: así el
// empaquetador lo incluye en los estilos de la página. Haciéndolo en tiempo de
// ejecución, Leaflet se queda sin sus estilos y el mapa sale roto.
import 'leaflet/dist/leaflet.css';
import { COLOR_PARADA, PROVEEDOR_TESELAS } from '@/config/mapas';
import type { ParadaMapa, PuntoMapa, UnidadMapa } from './MapaFlota';

/**
 * Mapa de calles real, con teselas de OpenStreetMap (o MapTiler si hay clave).
 *
 * Se carga **solo en el navegador**: Leaflet necesita `window` y el DOM, así que
 * la librería se importa de forma dinámica dentro de `useEffect`. De ese modo la
 * página sigue renderizándose en el servidor sin romperse.
 *
 * Los marcadores se dibujan con `divIcon` en vez de las imágenes por defecto de
 * Leaflet: así no hay que pelear con las rutas de los iconos al empaquetar, y el
 * aspecto es el mismo de la aplicación.
 */

interface Props {
  unidades: UnidadMapa[];
  trayectoria?: PuntoMapa[];
  paradas?: ParadaMapa[];
  altura?: number;
  className?: string;
}

export function MapaCalles({ unidades, trayectoria, paradas, altura = 440, className }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);

  useEffect(() => {
    let cancelado = false;
    let instancia: MapaLeaflet | null = null;

    (async () => {
      // Importación dinámica: Leaflet no puede cargarse en el servidor.
      const L = await import('leaflet');
      if (cancelado || !contenedor.current) return;

      instancia = L.map(contenedor.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      mapa.current = instancia;

      L.tileLayer(PROVEEDOR_TESELAS.url, {
        attribution: PROVEEDOR_TESELAS.atribucion,
        maxZoom: PROVEEDOR_TESELAS.maxZoom,
      }).addTo(instancia);

      const limites: [number, number][] = [];

      // ── Trayectoria recorrida ──────────────────────────────
      const puntosTrayectoria = (trayectoria ?? [])
        .map((p) => [Number(p.lat), Number(p.lng)] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      if (puntosTrayectoria.length > 1) {
        L.polyline(puntosTrayectoria, {
          color: '#38bdf8',
          weight: 3,
          opacity: 0.85,
        }).addTo(instancia);
        limites.push(...puntosTrayectoria);
      }

      // ── Paradas, numeradas ─────────────────────────────────
      for (const parada of paradas ?? []) {
        const lat = Number(parada.lat);
        const lng = Number(parada.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const color = COLOR_PARADA[parada.estado] ?? '#64748b';
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: `<span style="
              display:flex;align-items:center;justify-content:center;
              width:22px;height:22px;border-radius:9999px;
              background:${color};color:#0f172a;
              font:600 11px/1 ui-sans-serif,system-ui;
              border:2px solid rgba(15,23,42,.85);
              box-shadow:0 1px 4px rgba(0,0,0,.5);
            ">${parada.orden}</span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
          title: parada.direccion,
        }).addTo(instancia);
        limites.push([lat, lng]);
      }

      // ── Unidades ───────────────────────────────────────────
      for (const unidad of unidades) {
        const lat = Number(unidad.lat);
        const lng = Number(unidad.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const enMovimiento = Number(unidad.velocidad_kmh) > 5;
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: `
              <div style="position:relative;transform:translate(-50%,-50%)">
                ${
                  enMovimiento
                    ? `<span class="latido" style="position:absolute;inset:-7px;border-radius:9999px;background:rgba(56,189,248,.35)"></span>`
                    : ''
                }
                <span style="
                  position:relative;display:flex;align-items:center;gap:4px;
                  padding:3px 7px;border-radius:9999px;
                  background:#0ea5e9;color:#fff;
                  font:600 11px/1 ui-sans-serif,system-ui;white-space:nowrap;
                  border:1.5px solid rgba(255,255,255,.75);
                  box-shadow:0 2px 6px rgba(0,0,0,.55);
                ">${unidad.placa}</span>
              </div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          title: `${unidad.placa}${unidad.conductor ? ` · ${unidad.conductor}` : ''}`,
        }).addTo(instancia);
        limites.push([lat, lng]);
      }

      // ── Encuadre ───────────────────────────────────────────
      if (limites.length === 1) {
        instancia.setView(limites[0], 15);
      } else if (limites.length > 1) {
        instancia.fitBounds(L.latLngBounds(limites), { padding: [36, 36], maxZoom: 16 });
      } else {
        // Sin datos, se centra en la ciudad de la empresa.
        instancia.setView([-12.0464, -77.0428], 11);
      }

      // Leaflet calcula mal el tamaño si el contenedor aún no tenía sus
      // dimensiones definitivas: aparecen teselas grises. Al observar el
      // contenedor se corrige solo.
      const observador = new ResizeObserver(() => instancia?.invalidateSize());
      if (contenedor.current) observador.observe(contenedor.current);
      (instancia as MapaLeaflet & { __observador?: ResizeObserver }).__observador = observador;
    })();

    return () => {
      cancelado = true;
      const conObservador = instancia as (MapaLeaflet & { __observador?: ResizeObserver }) | null;
      conObservador?.__observador?.disconnect();
      instancia?.remove();
      mapa.current = null;
    };
  }, [unidades, trayectoria, paradas]);

  return (
    <div className={className}>
      <div
        ref={contenedor}
        style={{ height: altura }}
        className="w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
        role="img"
        aria-label="Mapa de calles con la posición de las unidades"
      />
      {PROVEEDOR_TESELAS.aviso ? (
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          {PROVEEDOR_TESELAS.aviso}
        </p>
      ) : null}
    </div>
  );
}
