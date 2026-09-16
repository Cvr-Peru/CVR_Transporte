import { cn } from '@/lib/cn';
import { monedaCorta, numero } from '@/lib/format';

export interface PuntoGrafica {
  etiqueta: string;
  valor: number;
  /** Segunda serie, se apila sobre la primera */
  secundario?: number;
  titulo?: string;
}

/**
 * Gráfica de barras verticales apiladas, hecha con divs.
 * Se evita una librería de gráficas: para el volumen de datos del prototipo
 * esto es más ligero, no depende de la red y es totalmente accesible.
 */
export function GraficaBarras({
  datos,
  altura = 150,
  colorPrimario = 'bg-sky-500',
  colorSecundario = 'bg-rose-500/80',
  etiquetaPrimaria = 'Entregados',
  etiquetaSecundaria,
  className,
}: {
  datos: PuntoGrafica[];
  altura?: number;
  colorPrimario?: string;
  colorSecundario?: string;
  etiquetaPrimaria?: string;
  etiquetaSecundaria?: string;
  className?: string;
}) {
  const maximo = Math.max(
    1,
    ...datos.map((d) => d.valor + (d.secundario ?? 0)),
  );

  return (
    <div className={className}>
      <div className="flex items-end gap-1" style={{ height: altura }}>
        {datos.map((d, i) => {
          const total = d.valor + (d.secundario ?? 0);
          const alturaTotal = (total / maximo) * 100;
          const alturaPrimaria = total > 0 ? (d.valor / total) * 100 : 0;
          const alturaSecundaria = 100 - alturaPrimaria;

          return (
            <div
              key={`${d.etiqueta}-${i}`}
              className="group relative flex flex-1 flex-col justify-end"
              style={{ height: '100%' }}
              title={d.titulo ?? `${d.etiqueta}: ${numero(total, 0)}`}
            >
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t transition-all group-hover:opacity-80"
                style={{ height: `${Math.max(alturaTotal, total > 0 ? 2 : 0)}%` }}
              >
                {d.secundario ? (
                  <div
                    className={cn('w-full', colorSecundario)}
                    style={{ height: `${alturaSecundaria}%` }}
                  />
                ) : null}
                <div
                  className={cn('w-full', colorPrimario)}
                  style={{ height: `${alturaPrimaria}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1">
        {datos.map((d, i) => (
          <div
            key={`eje-${d.etiqueta}-${i}`}
            className="flex-1 truncate text-center text-[10px] text-slate-500"
          >
            {d.etiqueta}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-sm', colorPrimario)} />
          {etiquetaPrimaria}
        </span>
        {etiquetaSecundaria ? (
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-sm', colorSecundario)} />
            {etiquetaSecundaria}
          </span>
        ) : null}
        <span className="num ml-auto text-slate-500">
          Máx. {numero(maximo, 0)} / día
        </span>
      </div>
    </div>
  );
}

/** Línea de tendencia compacta para tarjetas KPI. */
export function Sparkline({
  datos,
  color = '#38bdf8',
  ancho = 120,
  alto = 32,
}: {
  datos: number[];
  color?: string;
  ancho?: number;
  alto?: number;
}) {
  if (datos.length < 2) return null;
  const max = Math.max(...datos, 1);
  const min = Math.min(...datos, 0);
  const rango = max - min || 1;
  const paso = ancho / (datos.length - 1);

  const puntos = datos.map((v, i) => {
    const x = i * paso;
    const y = alto - ((v - min) / rango) * (alto - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const area = `0,${alto} ${puntos.join(' ')} ${ancho},${alto}`;

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="overflow-visible">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline
        points={puntos.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Lista de barras horizontales, para rankings. */
export function BarrasHorizontales({
  datos,
  formato = numero,
}: {
  datos: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (n: number) => string;
}) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <ul className="space-y-2.5">
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{d.etiqueta}</span>
            <span className="num shrink-0 text-slate-400">
              {d.detalle ?? formato(d.valor)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${(d.valor / maximo) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Dona de proporción, para distribuciones (por ejemplo, costos). */
export function Dona({
  segmentos,
  tamano = 132,
  grosor = 16,
  centro,
}: {
  segmentos: { etiqueta: string; valor: number; color: string }[];
  tamano?: number;
  grosor?: number;
  centro?: { titulo: string; subtitulo?: string };
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  let acumulado = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
        <svg width={tamano} height={tamano} className="-rotate-90">
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            stroke="var(--color-slate-800)"
            strokeWidth={grosor}
          />
          {total > 0 &&
            segmentos.map((s) => {
              const fraccion = s.valor / total;
              const dash = fraccion * circunferencia;
              const el = (
                <circle
                  key={s.etiqueta}
                  cx={tamano / 2}
                  cy={tamano / 2}
                  r={radio}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={grosor}
                  strokeDasharray={`${dash} ${circunferencia - dash}`}
                  strokeDashoffset={-acumulado}
                  strokeLinecap="butt"
                />
              );
              acumulado += dash;
              return el;
            })}
        </svg>
        {centro ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-base font-semibold text-slate-100">{centro.titulo}</span>
            {centro.subtitulo ? (
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {centro.subtitulo}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {segmentos.map((s) => (
          <li key={s.etiqueta} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate text-slate-300">{s.etiqueta}</span>
            <span className="num ml-auto shrink-0 text-slate-400">
              {total > 0 ? `${((s.valor / total) * 100).toFixed(0)}%` : '0%'}
            </span>
            <span className="num w-16 shrink-0 text-right text-slate-500">
              {monedaCorta(s.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
