/**
 * Mapa de la flota dibujado a mano en SVG.
 *
 * Decisiones de diseño:
 *  - **Sin librerías ni teselas externas.** No se usa Leaflet, Mapbox ni Google
 *    Maps: el mapa es un SVG generado en el servidor, así que no hay peticiones
 *    a internet, ni JavaScript de cliente, ni dependencias nuevas. La retícula
 *    de fondo evoca el callejero sin necesidad de cartografía real.
 *  - **Proyección equirectangular.** Bogotá está a 4,6° de latitud, donde un
 *    grado de longitud mide menos que uno de latitud; se corrige con
 *    `cos(lat)`. Con la escala de una ciudad el error es despreciable.
 *  - **El encuadre se calcula con los datos recibidos** (bounding box de
 *    unidades, trayectoria y paradas) y se protege el caso degenerado de un
 *    único punto o de un rango de 0 para no dividir entre cero.
 *  - Es un componente **de servidor** y puramente presentacional.
 */
import { useId } from 'react';
import type { UnidadEnVivo } from '@/db/tipos';
import { etiqueta, hora } from '@/lib/format';

/** Vista mínima que el mapa necesita de una unidad. */
export interface UnidadMapa {
  id: number;
  placa: string;
  lat: number;
  lng: number;
  velocidad_kmh: number;
  rumbo?: number;
  tipo?: string | null;
  estado?: string | null;
  timestamp?: string | null;
  ruta_codigo?: string | null;
  conductor?: string | null;
}

/** Vista mínima que el mapa necesita de una parada. */
export interface ParadaMapa {
  id: number;
  orden: number;
  direccion: string;
  lat: number;
  lng: number;
  estado: string;
}

/** Punto suelto de la trayectoria (compatible con `Posicion`). */
export interface PuntoMapa {
  lat: number;
  lng: number;
}

export interface PropsMapaFlota {
  unidades: UnidadMapa[];
  /** Secuencia ordenada de posiciones: se dibuja como `polyline`. */
  trayectoria?: PuntoMapa[];
  /** Paradas de la ruta seleccionada, numeradas por `orden`. */
  paradas?: ParadaMapa[];
  titulo?: string;
  /** Alto del lienzo en píxeles. El encuadre siempre se calcula con los datos. */
  altura?: number;
  className?: string;
}

/** Colores por estado de parada (mismos hexadecimales que usa el resto del kit). */
export const COLOR_PARADA: Record<string, string> = {
  entregado: '#34d399',
  en_camino: '#38bdf8',
  pendiente: '#64748b',
  fallido: '#f43f5e',
};

/** Colores por estado de la unidad. */
const COLOR_UNIDAD: Record<string, string> = {
  en_ruta: '#38bdf8',
  disponible: '#34d399',
  mantenimiento: '#fbbf24',
  fuera_servicio: '#f43f5e',
};

const ANCHO = 1000;
const ALTO = 620;
const MARGEN = 54;
/** Separación mínima (en grados) para no ampliar una nube de puntos degenerada. */
const SPAN_MINIMO = 0.0025;
/** A partir de esta velocidad se considera que la unidad está en movimiento. */
const UMBRAL_MOVIMIENTO = 5;

const ESTILOS = `
.rt-grid { fill: none; stroke: #1e293b; stroke-width: 1; }
.rt-marco { fill: none; stroke: #1e293b; stroke-width: 1.5; }
.rt-trayectoria { fill: none; stroke: #38bdf8; stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; opacity: 0.85; }
.rt-trayectoria-area { fill: #0ea5e9; opacity: 0.12; stroke: none; }
.rt-halo { fill: none; opacity: 0.5; transform-box: fill-box; transform-origin: center; }
.rt-parada { stroke: #020617; stroke-width: 1.6; }
.rt-parada-num { fill: #020617; font-size: 11px; font-weight: 700; text-anchor: middle; }
.rt-unidad { stroke: #020617; stroke-width: 2; }
.rt-placa { fill: #e2e8f0; font-size: 12px; font-weight: 600; paint-order: stroke; stroke: #020617; stroke-width: 3px; stroke-linejoin: round; text-anchor: middle; }
.rt-placa-sub { fill: #94a3b8; font-size: 10px; paint-order: stroke; stroke: #020617; stroke-width: 3px; stroke-linejoin: round; text-anchor: middle; }
.rt-leyenda { fill: #cbd5e1; font-size: 12px; }
.rt-leyenda-tenue { fill: #64748b; font-size: 11px; }
`;

/** Número finito o `null`. */
function numero(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Limita un valor a un rango. */
function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Redondeo a `d` decimales, para no inflar el HTML con decimales de máquina. */
function red(n: number, d = 5): number {
  return Number(n.toFixed(d));
}

/** Achata un tramo de trayectoria cuando trae demasiados puntos. */
function reducirPuntos<T>(puntos: T[], maximo: number): T[] {
  if (puntos.length <= maximo) return puntos;
  const paso = (puntos.length - 1) / (maximo - 1);
  const salida: T[] = [];
  for (let i = 0; i < maximo - 1; i++) salida.push(puntos[Math.round(i * paso)]);
  salida.push(puntos[puntos.length - 1]);
  return salida;
}

/** Ángulo en grados (0 = norte) hacia un desplazamiento este/norte. */
function rumboEntre(dEste: number, dNorte: number): number {
  if (dEste === 0 && dNorte === 0) return 0;
  return (Math.atan2(dEste, dNorte) * 180) / Math.PI;
}

/** Mensaje textual del estado de una parada, para lectores de pantalla. */
function textoEstadoParada(estado: string): string {
  return estado === 'pendiente' ? 'pendiente de entrega' : etiqueta(estado).toLowerCase();
}

export function MapaFlota({
  unidades,
  trayectoria,
  paradas,
  titulo = 'Mapa de la flota',
  altura = 460,
  className,
}: PropsMapaFlota) {
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idDesc = `${idBase}-desc`;

  // ── Datos válidos ──────────────────────────────────────────
  const puntosUnidad = (unidades ?? []).filter(
    (u) => numero(u?.lat) !== null && numero(u?.lng) !== null,
  );
  const puntosTrayectoria = reducirPuntos(
    (trayectoria ?? []).filter((p) => numero(p?.lat) !== null && numero(p?.lng) !== null),
    140,
  );
  const puntosParada = (paradas ?? []).filter(
    (p) => numero(p?.lat) !== null && numero(p?.lng) !== null,
  );

  const puntos = [...puntosUnidad, ...puntosTrayectoria, ...puntosParada];
  const paradasOrdenadas = [...puntosParada].sort((a, b) => a.orden - b.orden);

  if (puntos.length === 0) {
    return (
      <div
        className={className}
        style={{ minHeight: 220 }}
        role="img"
        aria-label="Mapa sin datos de telemetría"
      >
        <div className="flex h-full min-h-55 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-300">Sin posiciones que dibujar</p>
          <p className="max-w-md text-xs text-slate-500">
            Ninguna unidad ha reportado telemetría GPS todavía. Ejecuta «Avanzar
            simulación» o «npm run seed» para generar datos de demostración.
          </p>
        </div>
      </div>
    );
  }

  // ── Encuadre (bounding box defensivo) ──────────────────────
  const lats = puntos.map((p) => Number(p.lat));
  const lngs = puntos.map((p) => Number(p.lng));
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);

  let spanLat = maxLat - minLat;
  let spanLng = maxLng - minLng;

  // Un solo punto (o todos apilados) deja el rectángulo en cero: se abre a mano
  // para que la proyección no divida entre cero.
  if (spanLng < SPAN_MINIMO) {
    const centroLng = (minLng + maxLng) / 2;
    minLng = centroLng - SPAN_MINIMO / 2;
    maxLng = centroLng + SPAN_MINIMO / 2;
    spanLng = SPAN_MINIMO;
  }
  if (spanLat < SPAN_MINIMO) {
    const centroLat = (minLat + maxLat) / 2;
    minLat = centroLat - SPAN_MINIMO / 2;
    maxLat = centroLat + SPAN_MINIMO / 2;
    spanLat = SPAN_MINIMO;
  }

  // Corrección de longitud por latitud: a 4,6° N un grado de longitud mide
  // cos(4,6°) ≈ 0,997 de lo que mide uno de latitud. Se mantiene la proporción
  // para que el mapa no salga estirado.
  const factorLng = Math.max(0.2, Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)));

  const anchoDatos = spanLng * factorLng;
  const altoDatos = spanLat;
  const anchoUtil = ANCHO - MARGEN * 2;
  const altoUtil = ALTO - MARGEN * 2;

  // `escala` es píxeles por grado de latitud; el ancho se ajusta con factorLng.
  const escala = Math.min(anchoUtil / anchoDatos, altoUtil / altoDatos);
  const centroLngDatos = (minLng + maxLng) / 2;
  const centroLatDatos = (minLat + maxLat) / 2;

  /** Proyecta una coordenada a píxeles del `viewBox`. */
  const proyectar = (lat: number, lng: number) => ({
    x: acotar(
      ANCHO / 2 + (lng - centroLngDatos) * factorLng * escala,
      MARGEN / 2,
      ANCHO - MARGEN / 2,
    ),
    y: acotar(ALTO / 2 - (lat - centroLatDatos) * escala, MARGEN / 2, ALTO - MARGEN / 2),
  });

  // ── Elementos derivados ────────────────────────────────────
  const puntoTrayectoria = puntosTrayectoria.map((p) => {
    const { x, y } = proyectar(Number(p.lat), Number(p.lng));
    return `${red(x, 1)},${red(y, 1)}`;
  });
  const hayTrayectoria = puntoTrayectoria.length >= 2;
  const areaTrayectoria = hayTrayectoria
    ? `${MARGEN},${ALTO - MARGEN} ${puntoTrayectoria.join(' ')} ${ANCHO - MARGEN},${ALTO - MARGEN}`
    : '';

  const marcadores = puntosUnidad.map((u, i) => {
    const lat = Number(u.lat);
    const lng = Number(u.lng);
    const { x, y } = proyectar(lat, lng);
    return {
      u,
      x,
      y,
      // El rumbo propio manda; si falta, se deduce del tramo de trayectoria.
      angulo:
        numero(u.rumbo) ??
        (() => {
          if (!hayTrayectoria) return 0;
          const p1 = puntosTrayectoria[puntosTrayectoria.length - 1];
          const p0 = puntosTrayectoria[Math.max(0, puntosTrayectoria.length - 2)];
          return rumboEntre(
            (Number(p1.lng) - Number(p0.lng)) * factorLng,
            Number(p1.lat) - Number(p0.lat),
          );
        })(),
      enMovimiento: (numero(u.velocidad_kmh) ?? 0) > UMBRAL_MOVIMIENTO,
      color: COLOR_UNIDAD[u.estado ?? ''] ?? '#38bdf8',
      // Etiquetas alternadas para que no se pisen entre sí.
      dy: i % 2 === 0 ? -19 : 24,
    };
  });

  const paradasDibujo = paradasOrdenadas.map((p) => {
    const { x, y } = proyectar(Number(p.lat), Number(p.lng));
    return { p, x, y, color: COLOR_PARADA[p.estado] ?? COLOR_PARADA.pendiente };
  });

  const enMovimiento = marcadores.filter((m) => m.enMovimiento).length;
  const detenidas = marcadores.length - enMovimiento;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-labelledby={`${idTitulo} ${idDesc}`}
        style={{ width: '100%', height: altura, display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={idTitulo}>{titulo}</title>
        <desc id={idDesc}>
          Mapa esquemático con {marcadores.length}{' '}
          {marcadores.length === 1 ? 'unidad' : 'unidades'} ({enMovimiento} en movimiento,{' '}
          {detenidas} detenidas)
          {paradasDibujo.length > 0
            ? `, ${paradasDibujo.length} ${
                paradasDibujo.length === 1 ? 'parada' : 'paradas'
              } de ruta`
            : ''}
          {hayTrayectoria
            ? ` y una trayectoria de ${puntosTrayectoria.length} puntos`
            : ''}
          . No se usa cartografía real: las posiciones son relativas y los datos son
          simulados.
        </desc>
        <style>{ESTILOS}</style>

        <defs>
          <pattern id="rejilla-calles" width="52" height="52" patternUnits="userSpaceOnUse">
            <path d="M52 0H0V52" className="rt-grid" />
          </pattern>
          <filter id="brillo-unidad" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Fondo y retícula de "calles" */}
        <rect x="0" y="0" width={ANCHO} height={ALTO} fill="#020617" rx="12" />
        <rect x="0" y="0" width={ANCHO} height={ALTO} fill="url(#rejilla-calles)" rx="12" />
        <rect
          x={MARGEN / 2}
          y={MARGEN / 2}
          width={ANCHO - MARGEN}
          height={ALTO - MARGEN}
          className="rt-marco"
          rx="8"
        />

        {/* Trayectoria recorrida */}
        {hayTrayectoria ? (
          <>
            <polygon className="rt-trayectoria-area" points={areaTrayectoria} />
            <polyline className="rt-trayectoria" points={puntoTrayectoria.join(' ')} />
          </>
        ) : null}

        {/* Paradas numeradas por orden */}
        {paradasDibujo.map(({ p, x, y, color }) => (
          <g key={`parada-${p.id}`} className="aparecer">
            <circle cx={x} cy={y} r={9} fill={color} className="rt-parada" />
            <text x={x} y={y} dy="4" className="rt-parada-num">
              {p.orden}
            </text>
            <title>{`Parada ${p.orden}: ${p.direccion} — ${textoEstadoParada(p.estado)}`}</title>
          </g>
        ))}

        {/* Unidades */}
        {marcadores.map((m) => (
          <g key={`unidad-${m.u.id}`} className="aparecer">
            {m.enMovimiento ? (
              <circle
                cx={m.x}
                cy={m.y}
                r={12}
                fill="none"
                stroke={m.color}
                strokeWidth={5}
                className="rt-halo latido"
              />
            ) : null}
            <g transform={`translate(${red(m.x, 1)} ${red(m.y, 1)}) rotate(${red(m.angulo, 1)})`}>
              <circle r={9} fill={m.color} filter="url(#brillo-unidad)" className="rt-unidad" />
              <path
                d="M0,-19 L5.5,-9 L-5.5,-9 Z"
                fill={m.color}
                className="rt-unidad"
              />
              <circle r={2.9} fill="#020617" />
            </g>
            <text x={m.x} y={m.y} dy={m.dy} className="rt-placa">
              {m.u.placa}
            </text>
            <text x={m.x} y={m.y} dy={m.dy + 12} className="rt-placa-sub">
              {m.enMovimiento
                ? `${Math.round(Number(m.u.velocidad_kmh))} km/h${
                    m.u.timestamp ? ` · ${hora(m.u.timestamp)}` : ''
                  }`
                : 'Detenida'}
            </text>
            <title>
              {`${m.u.placa}${m.u.tipo ? ` · ${etiqueta(m.u.tipo)}` : ''}${
                m.u.ruta_codigo ? ` · ruta ${m.u.ruta_codigo}` : ''
              }${m.u.conductor ? ` · ${m.u.conductor}` : ''} · ${Math.round(
                Number(m.u.velocidad_kmh),
              )} km/h${m.u.timestamp ? ` · reportado ${hora(m.u.timestamp)}` : ''}`}
            </title>
          </g>
        ))}

        {/* Leyenda */}
        <g transform={`translate(${MARGEN / 2 + 14} ${ALTO - 30})`}>
          <text className="rt-leyenda-tenue">
            {paradasDibujo.length > 0
              ? 'Paradas:'
              : 'Esquema relativo · sin cartografía real · datos simulados'}
          </text>
          {paradasDibujo.length > 0
            ? [
                ['entregado', 'Entregada'],
                ['en_camino', 'En camino'],
                ['pendiente', 'Pendiente'],
                ['fallido', 'Fallida'],
              ].map(([clave, texto], i) => (
                <g key={clave} transform={`translate(${i * 116 + 66} 0)`}>
                  <circle cy={-4} r={5} fill={COLOR_PARADA[clave]} className="rt-parada" />
                  <text x={11} dy="0" className="rt-leyenda">
                    {texto}
                  </text>
                </g>
              ))
            : null}
        </g>

        {/* Contador de unidades */}
        <g transform={`translate(${ANCHO - MARGEN - 14} ${ALTO - 30})`}>
          <text textAnchor="end" className="rt-leyenda">
            {marcadores.length} {marcadores.length === 1 ? 'unidad' : 'unidades'} ·{' '}
            {enMovimiento} en movimiento
          </text>
        </g>
      </svg>

      <p className="mt-1.5 text-[11px] text-slate-500">
        Mapa esquemático propio en SVG, sin librerías de mapas ni servicios de teselas.
        El encuadre se calcula con las posiciones recibidas, así que cada unidad o ruta se
        ve a la escala que le corresponde. Coordenadas y telemetría de demostración.
      </p>
    </div>
  );
}

/** Adapta una fila de `unidadesEnVivo` a la vista que consume el mapa. */
export function aUnidadMapa(u: UnidadEnVivo): UnidadMapa {
  return {
    id: u.unidad_id,
    placa: u.placa,
    lat: u.lat,
    lng: u.lng,
    velocidad_kmh: u.velocidad_kmh,
    rumbo: u.rumbo,
    tipo: u.tipo,
    estado: u.estado,
    timestamp: u.timestamp,
    ruta_codigo: u.ruta_codigo,
    conductor: u.conductor,
  };
}
