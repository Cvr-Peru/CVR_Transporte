import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { BarrasHorizontales, Dona, GraficaBarras } from '@/components/ui/Grafica';
import {
  IconoAlerta,
  IconoCheck,
  IconoCombustible,
  IconoDocumento,
  IconoFinanzas,
  IconoFlota,
  IconoHerramienta,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { BarraProporcion, Progreso } from '@/components/ui/Progreso';
import { FilaVacia, TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { empresa } from '@/config/empresa';
import {
  cargasDeCombustible,
  gastosDelPeriodo,
  kpisCombustible,
  puntoEquilibrio,
  rendimientoPorUnidad,
  rentabilidadPorRuta,
  rentabilidadPorUnidad,
  resumenEconomico,
  resumenGastos,
  serieEconomica,
  soloPerdidas,
  unidadesConCargas,
  type FilaRentabilidadRuta,
  type FilaRentabilidadUnidad,
} from '@/db/queries/finanzas';
import { requerirPermiso } from '@/lib/auth/sesion';
import { cn } from '@/lib/cn';
import { clasesDiagnostico, textoDiagnostico } from '@/lib/domain';
import {
  aISOCompleto,
  entero,
  etiqueta,
  fecha,
  fechaCorta,
  hora,
  moneda,
  monedaCorta,
  numero,
  porcentaje,
  plural,
} from '@/lib/format';
import {
  etiquetaDia,
  nombreMes,
  rangoMes,
  rangoSemana,
  rangoUltimosDias,
  type Rango,
} from '@/lib/periodos';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Parámetros de la ruta
// ─────────────────────────────────────────────────────────────

const RANGOS = [
  { clave: 'mes', etiqueta: 'Mes en curso' },
  { clave: '7d', etiqueta: 'Últimos 7 días' },
  { clave: '30d', etiqueta: 'Últimos 30 días' },
  { clave: '90d', etiqueta: 'Últimos 90 días' },
] as const;
type ClaveRango = (typeof RANGOS)[number]['clave'];

const VISTAS = [
  { clave: 'resumen', etiqueta: 'Resumen' },
  { clave: 'combustible', etiqueta: 'Combustible' },
  { clave: 'gastos', etiqueta: 'Gastos' },
  { clave: 'rentabilidad', etiqueta: 'Rentabilidad' },
] as const;
type ClaveVista = (typeof VISTAS)[number]['clave'];

const CATEGORIAS_GASTO = [
  'peaje',
  'parqueadero',
  'viatico',
  'lavado',
  'multa',
  'otro',
] as const;
type ClaveCategoria = (typeof CATEGORIAS_GASTO)[number];

const COLORES_CATEGORIA: Record<string, string> = {
  peaje: 'bg-sky-500',
  parqueadero: 'bg-violet-500',
  viatico: 'bg-amber-500',
  lavado: 'bg-emerald-500',
  multa: 'bg-rose-500',
  otro: 'bg-slate-500',
};

function claveRango(valor: string | string[] | undefined): ClaveRango {
  const v = typeof valor === 'string' ? valor : undefined;
  if (v === '7d' || v === '30d' || v === '90d' || v === 'mes') return v;
  return 'mes';
}

function claveVista(valor: string | string[] | undefined): ClaveVista {
  const v = typeof valor === 'string' ? valor : undefined;
  if (v === 'combustible' || v === 'gastos' || v === 'rentabilidad' || v === 'resumen') return v;
  return 'resumen';
}

function claveCategoria(valor: string | string[] | undefined): ClaveCategoria | 'todas' {
  const v = typeof valor === 'string' ? valor : undefined;
  if (v === 'peaje' || v === 'parqueadero' || v === 'viatico' || v === 'lavado' || v === 'multa' || v === 'otro') {
    return v;
  }
  return 'todas';
}

function numeroParam(valor: string | string[] | undefined): number | undefined {
  const v = typeof valor === 'string' ? Number(valor) : Number.NaN;
  return Number.isFinite(v) && v > 0 ? Math.trunc(v) : undefined;
}

function textoParam(valor: string | string[] | undefined): string | undefined {
  const v = typeof valor === 'string' ? valor.trim() : '';
  return v.length > 0 ? v.slice(0, 80) : undefined;
}

function rangoDe(clave: ClaveRango): Rango {
  switch (clave) {
    case '7d':
      return rangoUltimosDias(7);
    case '30d':
      return rangoUltimosDias(30);
    case '90d':
      return rangoUltimosDias(90);
    default:
      return rangoMes();
  }
}

/** Enlace conservando rango y vista, con parámetros extra opcionales. */
function enlace(
  vista: ClaveVista,
  rango: ClaveRango,
  extra?: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams({ rango, vista });
  if (extra) {
    for (const [clave, valor] of Object.entries(extra)) {
      if (valor !== undefined && valor !== '') params.set(clave, String(valor));
    }
  }
  return `/finanzas?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────
// Selector de rango y pestañas
// ─────────────────────────────────────────────────────────────

function SelectorRango({ actual, vista }: { actual: ClaveRango; vista: ClaveVista }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1">
      {RANGOS.map((r) => (
        <Link
          key={r.clave}
          href={enlace(vista, r.clave)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            r.clave === actual
              ? 'bg-sky-500/15 font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
          )}
        >
          {r.etiqueta}
        </Link>
      ))}
    </div>
  );
}

function Pestanas({ actual, rango }: { actual: ClaveVista; rango: ClaveRango }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1">
      {VISTAS.map((v) => (
        <Link
          key={v.clave}
          href={enlace(v.clave, rango)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            v.clave === actual
              ? 'bg-slate-800 font-medium text-slate-50'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
          )}
        >
          {v.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

/** Caja de formulario del kit, repetida en los filtros de las pestañas. */
const CLASE_CAMPO = 'rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';

// ─────────────────────────────────────────────────────────────
// Pestaña: resumen
// ─────────────────────────────────────────────────────────────

async function TabResumen({ rango }: { rango: Rango }) {
  const resumen = await resumenEconomico(rango);
  const serie = await serieEconomica(rango);
  const equilibrio = puntoEquilibrio(resumen.rentabilidad);
  const semana = await resumenEconomico(rangoSemana());
  const r = resumen.rentabilidad;

  const hayDatos = resumen.ingresos > 0 || r.costoTotal > 0;
  const dias = serie.length;
  // Con rangos largos no cabe una etiqueta por día: se muestran cada N días.
  const cadaEtiqueta = Math.max(1, Math.ceil(dias / 12));
  const precioMedioGalon = resumen.galones > 0 ? resumen.combustible / resumen.galones : 0;

  const parte = (valor: number) => (r.costoTotal > 0 ? (valor / r.costoTotal) * 100 : 0);

  return (
    <>
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Ingresos por flete"
          valor={monedaCorta(resumen.ingresos)}
          detalle={`${plural(resumen.envios, 'envío entregado', 'envíos entregados')} de ${entero(
            resumen.enviosTotal,
          )} despachados · ${plural(resumen.rutas, 'ruta', 'rutas')}`}
          icono={<IconoFinanzas width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Costo de combustible"
          valor={monedaCorta(resumen.combustible)}
          detalle={`${numero(resumen.galones, 0)} ${empresa.unidadCombustible} a ${moneda(
            precioMedioGalon,
          )} de media`}
          icono={<IconoCombustible width={16} height={16} />}
          acento="ambar"
          pie={<Progreso valor={parte(resumen.combustible)} mostrarTexto colorManual="bg-sky-500" />}
        />
        <Kpi
          etiqueta="Gastos de ruta"
          valor={monedaCorta(resumen.gastos)}
          detalle={`${porcentaje(parte(resumen.gastos))} del costo total`}
          icono={<IconoDocumento width={16} height={16} />}
          acento="violeta"
          pie={<Progreso valor={parte(resumen.gastos)} mostrarTexto colorManual="bg-amber-500" />}
        />
        <Kpi
          etiqueta="Mantenimiento"
          valor={monedaCorta(resumen.mantenimiento)}
          detalle={`${porcentaje(parte(resumen.mantenimiento))} del costo total · taller`}
          icono={<IconoHerramienta width={16} height={16} />}
          acento="rosa"
          pie={
            <Progreso valor={parte(resumen.mantenimiento)} mostrarTexto colorManual="bg-rose-500" />
          }
        />
      </RejillaKpi>

      <div className="mt-4">
        <RejillaKpi columnas={3}>
          <Kpi
            etiqueta="Margen del período"
            valor={monedaCorta(r.margen)}
            detalle={`${moneda(r.ingresos)} − ${moneda(r.costoTotal)} de costo`}
            icono={<IconoFinanzas width={16} height={16} />}
            acento={r.margen >= 0 ? 'esmeralda' : 'rosa'}
            pie={
              <p className="text-xs text-slate-500">
                Margen = ingresos − (combustible + gastos + mantenimiento + comisión)
              </p>
            }
          />
          <Kpi
            etiqueta="Margen porcentual"
            valor={porcentaje(r.margenPct)}
            detalle={`Diagnóstico: ${textoDiagnostico(r.diagnostico)}`}
            icono={<IconoFinanzas width={16} height={16} />}
            acento={
              r.diagnostico === 'rentable' ? 'esmeralda' : r.diagnostico === 'ajustado' ? 'ambar' : 'rosa'
            }
            pie={
              <Progreso
                valor={Math.max(0, Math.min(100, r.margenPct))}
                mostrarTexto
                colorManual={r.margenPct >= 18 ? 'bg-emerald-500' : r.margenPct >= 0 ? 'bg-amber-500' : 'bg-rose-500'}
              />
            }
          />
          <Kpi
            etiqueta="Comisión de contratistas"
            valor={monedaCorta(resumen.comisiones)}
            detalle={`${porcentaje(parte(resumen.comisiones))} del costo total`}
            icono={<IconoFinanzas width={16} height={16} />}
            acento="violeta"
            pie={
              <p className="text-xs text-slate-500">
                Solo contratistas: porcentaje sobre el flete entregado. El salario de los empleados
                es costo fijo y no se reparte por ruta.
              </p>
            }
          />
        </RejillaKpi>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardCabecera
            titulo="Evolución diaria de ingresos y costos"
            descripcion="Cada barra apila los ingresos del día y los costos del día en que se causaron."
            acciones={
              <span className="num text-xs text-slate-400">
                {entero(serie.reduce((s, d) => s + d.envios, 0))} envíos
              </span>
            }
          />
          <CardCuerpo>
            {hayDatos ? (
              <GraficaBarras
                datos={serie.map((d, i) => ({
                  etiqueta:
                    i % cadaEtiqueta === 0 ? etiquetaDia(d.fecha).split(' ').slice(0, 2).join(' ') : '',
                  valor: d.ingresos,
                  secundario: d.costos,
                  titulo: `${fechaCorta(d.fecha)} · Ingresos ${moneda(d.ingresos)} · Costos ${moneda(
                    d.costos,
                  )} · Margen ${moneda(d.margen)}`,
                }))}
                etiquetaPrimaria="Ingresos"
                etiquetaSecundaria="Costos"
                colorPrimario="bg-emerald-500"
                colorSecundario="bg-rose-500/80"
                altura={180}
              />
            ) : (
              <Vacio
                titulo="Sin movimiento en el período"
                mensaje="No hay ingresos ni costos registrados en las fechas seleccionadas."
                icono={<IconoFinanzas width={22} height={22} />}
              />
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Composición de costos"
            descripcion={`Costo total: ${moneda(r.costoTotal)}`}
          />
          <CardCuerpo>
            {r.costoTotal > 0 ? (
              <>
                <Dona
                  segmentos={[
                    { etiqueta: 'Combustible', valor: resumen.combustible, color: '#38bdf8' },
                    { etiqueta: 'Gastos de ruta', valor: resumen.gastos, color: '#fbbf24' },
                    { etiqueta: 'Mantenimiento', valor: resumen.mantenimiento, color: '#fb7185' },
                    { etiqueta: 'Comisión contratistas', valor: resumen.comisiones, color: '#a78bfa' },
                  ]}
                  centro={{ titulo: monedaCorta(r.costoTotal), subtitulo: 'Costo total' }}
                />
                <dl className="mt-4 space-y-1.5 border-t border-slate-800 pt-3 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Ingresos por flete</dt>
                    <dd className="num text-slate-200">{moneda(resumen.ingresos)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Costo directo</dt>
                    <dd className="num text-slate-200">{moneda(r.costoDirecto)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Margen</dt>
                    <dd className={`num font-medium ${r.margen >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {moneda(r.margen)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Kilómetros recorridos</dt>
                    <dd className="num text-slate-200">
                      {entero(r.km)} {empresa.unidadDistancia}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Costo por kilómetro</dt>
                    <dd className="num text-slate-200">{moneda(r.costoPorKm)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Ingreso por kilómetro</dt>
                    <dd className="num text-slate-200">{moneda(r.ingresoPorKm)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <Vacio
                titulo="Sin costos registrados"
                mensaje="No hay cargas de combustible, gastos ni mantenimientos en el período."
              />
            )}
          </CardCuerpo>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardCabecera
            titulo="Punto de equilibrio del período"
            descripcion="Envíos o kilómetros necesarios para cubrir los costos con el ingreso medio actual."
          />
          <CardCuerpo>
            {r.costoTotal === 0 && r.ingresos === 0 ? (
              <Vacio
                titulo="Sin movimiento en el período"
                mensaje="No se puede calcular el equilibrio sin ingresos ni costos."
              />
            ) : (
              <>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-400">Ingreso medio por envío</dt>
                    <dd className="num text-slate-200">{moneda(equilibrio.ingresoPorEnvio)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-400">Costo medio por envío</dt>
                    <dd className="num text-slate-200">{moneda(equilibrio.costoPorEnvio)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2">
                    <dt className="text-slate-300">Envíos de equilibrio</dt>
                    <dd className="num font-medium text-slate-100">
                      {entero(equilibrio.enviosEquilibrio)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-400">Envíos entregados</dt>
                    <dd className="num text-slate-200">{entero(equilibrio.enviosActuales)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-slate-800 pt-2">
                    <dt className="text-slate-300">Kilómetros de equilibrio</dt>
                    <dd className="num font-medium text-slate-100">
                      {entero(equilibrio.kmEquilibrio)} {empresa.unidadDistancia}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-400">Kilómetros recorridos</dt>
                    <dd className="num text-slate-200">
                      {entero(equilibrio.kmActuales)} {empresa.unidadDistancia}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-slate-800 pt-3">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-slate-400">Ingresos sobre costos</span>
                    <span
                      className={`num font-medium ${equilibrio.cubre ? 'text-emerald-300' : 'text-rose-300'}`}
                    >
                      {porcentaje(equilibrio.cobertura)}
                    </span>
                  </div>
                  <Progreso
                    valor={Math.min(100, Math.max(0, equilibrio.cobertura))}
                    className="mt-1.5"
                    colorManual={equilibrio.cubre ? 'bg-emerald-500' : 'bg-rose-500'}
                  />
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">
                    {equilibrio.cubre
                      ? `Los ingresos cubren los costos del período: el equilibrio queda ${entero(
                          Math.abs(equilibrio.enviosDiferencia),
                        )} envíos (${entero(Math.abs(equilibrio.kmDiferencia))} ${
                          empresa.unidadDistancia
                        }) por debajo de lo operado.`
                      : `Faltan ${entero(equilibrio.enviosDiferencia)} envíos o ${entero(
                          equilibrio.kmDiferencia,
                        )} ${empresa.unidadDistancia} para cubrir los costos del período al ingreso medio actual.`}
                  </p>
                </div>
              </>
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Ritmo de la semana en curso"
            descripcion="Semana ISO (lunes a domingo), con la misma fórmula de margen del período."
            acciones={<Badge tono="info">{nombreMes()}</Badge>}
          />
          <CardCuerpo>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Ingresos</dt>
                <dd className="num text-lg font-semibold text-slate-100">
                  {monedaCorta(semana.ingresos)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Costos</dt>
                <dd className="num text-lg font-semibold text-slate-100">
                  {monedaCorta(semana.rentabilidad.costoTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Margen</dt>
                <dd
                  className={`num text-lg font-semibold ${
                    semana.rentabilidad.margen >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {monedaCorta(semana.rentabilidad.margen)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Margen porcentual</dt>
                <dd
                  className={`num text-lg font-semibold ${
                    semana.rentabilidad.margenPct >= 18
                      ? 'text-emerald-300'
                      : semana.rentabilidad.margenPct >= 0
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }`}
                >
                  {porcentaje(semana.rentabilidad.margenPct)}
                </dd>
              </div>
            </dl>
            <dl className="mt-4 space-y-1.5 border-t border-slate-800 pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Rutas de la semana</dt>
                <dd className="num text-slate-200">{entero(semana.rutas)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Envíos entregados</dt>
                <dd className="num text-slate-200">{entero(semana.envios)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Combustible</dt>
                <dd className="num text-slate-200">{moneda(semana.combustible)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Envíos por día del período</dt>
                <dd className="num text-slate-200">
                  {numero(dias > 0 ? resumen.envios / dias : 0, 1)}
                </dd>
              </div>
            </dl>
          </CardCuerpo>
        </Card>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña: combustible
// ─────────────────────────────────────────────────────────────

async function TabCombustible({
  rango,
  rangoClave,
  unidadId,
}: {
  rango: Rango;
  rangoClave: ClaveRango;
  unidadId?: number;
}) {
  const unidades = await rendimientoPorUnidad(rango, unidadId);
  const kpis = await kpisCombustible(rango, unidadId, unidades);
  const cargas = await cargasDeCombustible(rango, unidadId, 150);
  const opciones = await unidadesConCargas(rango);
  const conReferencia = unidades.filter((u) => u.esperado > 0);
  const porDebajo = conReferencia.filter((u) => u.desviacion < 0);
  const hayFiltros = unidadId !== undefined;
  const unidadActual = opciones.find((u) => u.id === unidadId);

  return (
    <>
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Galones consumidos"
          valor={numero(kpis.galones, 0)}
          detalle={`${empresa.unidadCombustible} en ${plural(kpis.cargas, 'carga', 'cargas')}`}
          icono={<IconoCombustible width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Gasto en combustible"
          valor={monedaCorta(kpis.total)}
          detalle={`${moneda(kpis.total)} del período`}
          icono={<IconoFinanzas width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="Precio medio por galón"
          valor={moneda(kpis.precioMedio)}
          detalle={`${numero(kpis.galones, 0)} ${empresa.unidadCombustible} cargados`}
          icono={<IconoDocumento width={16} height={16} />}
          acento="violeta"
        />
        <Kpi
          etiqueta="Rendimiento medio real"
          valor={`${numero(kpis.rendimientoMedio, 1)} km/${empresa.unidadCombustible}`}
          detalle={
            kpis.rendimientoEsperado > 0
              ? `Esperado ${numero(kpis.rendimientoEsperado, 1)} · desviación ${porcentaje(
                  kpis.desviacion,
                )}`
              : 'Sin rendimiento esperado configurado en las unidades'
          }
          icono={<IconoFlota width={16} height={16} />}
          acento={kpis.desviacion >= 0 ? 'esmeralda' : 'rosa'}
          pie={
            <Progreso
              valor={
                kpis.rendimientoEsperado > 0
                  ? Math.min(100, (kpis.rendimientoMedio / kpis.rendimientoEsperado) * 100)
                  : 0
              }
              mostrarTexto
              colorManual={kpis.desviacion >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
            />
          }
        />
      </RejillaKpi>

      <Card className="mt-4">
        <CardCabecera
          titulo="Filtros"
          descripcion="Acota las cargas y el rendimiento a una sola unidad del parque."
          acciones={
            hayFiltros ? (
              <Badge tono="info">{unidadActual?.placa ?? `Unidad ${unidadId}`}</Badge>
            ) : null
          }
        />
        <CardCuerpo>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="rango" value={rangoClave} />
            <input type="hidden" name="vista" value="combustible" />
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Unidad
              <select
                name="unidad"
                defaultValue={unidadId ? String(unidadId) : 'todas'}
                className={CLASE_CAMPO}
              >
                <option value="todas">Todas</option>
                {opciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.placa}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Filtrar
            </button>
            {hayFiltros ? (
              <Link
                href={enlace('combustible', rangoClave)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Limpiar
              </Link>
            ) : null}
          </form>
        </CardCuerpo>
      </Card>

      {porDebajo.length > 0 ? (
        <Card className="mt-4 ring-1 ring-inset ring-rose-500/20">
          <CardCabecera
            titulo="Unidades por debajo del rendimiento esperado"
            descripcion="Señal de alerta de robo de combustible o de falla mecánica: rinden menos kilómetros por galón de lo configurado."
            acciones={<Badge tono="peligro">{plural(porDebajo.length, 'unidad', 'unidades')}</Badge>}
          />
          <CardCuerpo>
            <BarrasHorizontales
              datos={porDebajo.slice(0, 6).map((u) => ({
                etiqueta: `${u.placa} · ${etiqueta(u.tipo)}`,
                valor: Math.abs(u.desviacion),
                detalle: `${porcentaje(u.desviacion)} · real ${numero(u.real, 1)} vs esperado ${numero(
                  u.esperado,
                  1,
                )} km/${empresa.unidadCombustible}`,
              }))}
            />
          </CardCuerpo>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardCabecera
          titulo="Rendimiento por unidad"
          descripcion="Kilómetros recorridos en el período frente a los galones cargados. En rojo, la unidad rinde por debajo de lo esperado; en verde, por encima."
        />
        <CardCuerpo className="px-0 py-0">
          {unidades.length === 0 ? (
            <Vacio
              titulo="Sin cargas ni rutas en el período"
              mensaje="No hay combustible ni kilometraje registrado para las fechas seleccionadas."
              icono={<IconoCombustible width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Unidad</Th>
                  <Th alineacion="derecha">Km</Th>
                  <Th alineacion="derecha">Galones</Th>
                  <Th alineacion="derecha">Rendimiento real</Th>
                  <Th alineacion="derecha">Esperado</Th>
                  <Th alineacion="derecha">Desviación</Th>
                  <Th alineacion="derecha">Costo</Th>
                  <Th alineacion="derecha">Cargas</Th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => {
                  const sinDatos = u.km <= 0 || u.galones <= 0;
                  const comparable = !sinDatos && u.esperado > 0;
                  const color = comparable
                    ? u.desviacion < 0
                      ? 'bg-rose-500/5'
                      : 'bg-emerald-500/5'
                    : '';
                  const claseTexto = comparable
                    ? u.desviacion < 0
                      ? 'text-rose-300'
                      : 'text-emerald-300'
                    : 'text-slate-400';
                  return (
                    <Tr key={u.unidadId} className={color}>
                      <Td>
                        <span className="font-medium text-slate-200">{u.placa}</span>
                        <span className="block text-[11px] text-slate-500">{etiqueta(u.tipo)}</span>
                      </Td>
                      <Td alineacion="derecha">
                        {entero(u.km)} {empresa.unidadDistancia}
                      </Td>
                      <Td alineacion="derecha">{numero(u.galones, 0)}</Td>
                      <Td alineacion="derecha">
                        <span className={claseTexto}>
                          {sinDatos ? '—' : numero(u.real, 1)}
                        </span>
                      </Td>
                      <Td alineacion="derecha" className="text-slate-400">
                        {u.esperado > 0 ? numero(u.esperado, 1) : '—'}
                      </Td>
                      <Td alineacion="derecha">
                        <span className={claseTexto}>
                          {comparable
                            ? porcentaje(u.desviacion)
                            : sinDatos
                              ? 'Sin datos'
                              : 'Sin referencia'}
                        </span>
                      </Td>
                      <Td alineacion="derecha" className="text-slate-200">
                        {moneda(u.costo)}
                      </Td>
                      <Td alineacion="derecha" className="text-slate-400">
                        {entero(u.cargas)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
      </Card>

      <Card className="mt-4">
        <CardCabecera
          titulo="Cargas de combustible"
          descripcion="Detalle de cada carga: unidad, ruta, conductor, estación, galones y kilometraje al momento de cargar."
          acciones={
            <span className="num text-xs text-slate-400">
              {moneda(cargas.reduce((s, c) => s + Number(c.total), 0))}
            </span>
          }
        />
        <CardCuerpo className="px-0 py-0">
          {cargas.length === 0 ? (
            <Vacio
              titulo="Sin cargas de combustible"
              mensaje="No hay registros de combustible en el período seleccionado."
              icono={<IconoCombustible width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Unidad</Th>
                  <Th>Ruta</Th>
                  <Th>Conductor</Th>
                  <Th>Estación</Th>
                  <Th alineacion="derecha">Galones</Th>
                  <Th alineacion="derecha">Precio/gal</Th>
                  <Th alineacion="derecha">Total</Th>
                  <Th alineacion="derecha">Kilometraje</Th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <Tr key={c.id}>
                    <Td className="whitespace-nowrap text-slate-400">{fechaCorta(c.fecha)}</Td>
                    <Td>
                      <span className="font-medium text-slate-200">{c.placa ?? '—'}</span>
                      <span className="block text-[11px] text-slate-500">
                        {c.tipo_unidad ? etiqueta(c.tipo_unidad) : 'Sin tipo'}
                      </span>
                    </Td>
                    <Td className="text-slate-400">{c.ruta_codigo ?? '—'}</Td>
                    <Td className="text-slate-400">{c.conductor ?? 'Sin asignar'}</Td>
                    <Td className="max-w-40 truncate text-slate-400">{c.estacion ?? '—'}</Td>
                    <Td alineacion="derecha">{numero(c.galones, 2)}</Td>
                    <Td alineacion="derecha" className="text-slate-400">
                      {moneda(c.precio_galon)}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-200">
                      {moneda(c.total)}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-400">
                      {c.km_actual == null
                        ? '—'
                        : `${entero(c.km_actual)} ${empresa.unidadDistancia}`}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña: gastos
// ─────────────────────────────────────────────────────────────

async function TabGastos({
  rango,
  rangoClave,
  categoria,
  busqueda,
}: {
  rango: Rango;
  rangoClave: ClaveRango;
  categoria: ClaveCategoria | 'todas';
  busqueda?: string;
}) {
  const filtros = { categoria, busqueda };
  const resumen = await resumenGastos(rango, filtros);
  const lista = await gastosDelPeriodo({ rango, categoria, busqueda, limite: 200 });
  const hayFiltros = categoria !== 'todas' || busqueda !== undefined;
  const principal = resumen.porCategoria[0];

  return (
    <>
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Gasto total"
          valor={monedaCorta(resumen.total)}
          detalle={`${moneda(resumen.total)} en el período`}
          icono={<IconoDocumento width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="Registros"
          valor={entero(resumen.numero)}
          detalle={`Mayor gasto: ${moneda(resumen.mayor)}`}
          icono={<IconoDocumento width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Gasto medio"
          valor={monedaCorta(resumen.media)}
          detalle="Promedio por comprobante"
          icono={<IconoFinanzas width={16} height={16} />}
          acento="violeta"
        />
        <Kpi
          etiqueta="Gasto por kilómetro"
          valor={moneda(resumen.porKm)}
          detalle={`${entero(resumen.km)} ${empresa.unidadDistancia} recorridos`}
          icono={<IconoFlota width={16} height={16} />}
          acento="rosa"
        />
      </RejillaKpi>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardCabecera
            titulo="Desglose por categoría"
            descripcion={
              hayFiltros ? 'Sobre los filtros aplicados' : 'Todo el período seleccionado'
            }
            acciones={
              principal ? <Badge tono="aviso">{etiqueta(principal.categoria)}</Badge> : null
            }
          />
          <CardCuerpo>
            {resumen.porCategoria.length === 0 ? (
              <Vacio
                titulo="Sin gastos registrados"
                mensaje="No hay peajes, parqueaderos, viáticos ni otros gastos en el período."
              />
            ) : (
              <div className="space-y-3.5">
                {resumen.porCategoria.map((c) => (
                  <BarraProporcion
                    key={c.categoria}
                    etiqueta={`${etiqueta(c.categoria)} · ${plural(c.n, 'registro', 'registros')}`}
                    valor={c.total}
                    total={resumen.total}
                    color={COLORES_CATEGORIA[c.categoria] ?? 'bg-slate-500'}
                    detalle={`${moneda(c.total)} · ${porcentaje(
                      resumen.total > 0 ? (c.total / resumen.total) * 100 : 0,
                    )}`}
                  />
                ))}
                <p className="border-t border-slate-800 pt-3 text-xs text-slate-500">
                  Total del desglose: <span className="num text-slate-300">{moneda(resumen.total)}</span>
                </p>
              </div>
            )}
          </CardCuerpo>
        </Card>

        <Card className="xl:col-span-2">
          <CardCabecera
            titulo="Filtros"
            descripcion="Filtra por categoría de gasto o busca por descripción, comprobante, placa o código de ruta."
            acciones={
              hayFiltros ? <Badge tono="info">Filtros aplicados</Badge> : null
            }
          />
          <CardCuerpo>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="rango" value={rangoClave} />
              <input type="hidden" name="vista" value="gastos" />
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Categoría
                <select name="categoria" defaultValue={categoria} className={CLASE_CAMPO}>
                  <option value="todas">Todas</option>
                  {CATEGORIAS_GASTO.map((c) => (
                    <option key={c} value={c}>
                      {etiqueta(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Buscar
                <input
                  name="q"
                  defaultValue={busqueda ?? ''}
                  placeholder="Descripción, comprobante, placa…"
                  className={cn(CLASE_CAMPO, 'w-64')}
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                Filtrar
              </button>
              {hayFiltros ? (
                <Link
                  href={enlace('gastos', rangoClave)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Limpiar
                </Link>
              ) : null}
            </form>
          </CardCuerpo>
        </Card>
      </div>

      <Card className="mt-4">
        <CardCabecera
          titulo="Gastos del período"
          descripcion="Cada gasto con su categoría, la unidad y la ruta a las que se imputa y su comprobante."
          acciones={
            <span className="num text-xs text-slate-400">{entero(lista.length)} registros</span>
          }
        />
        <CardCuerpo className="px-0 py-0">
          {lista.length === 0 ? (
            <Vacio
              titulo="Sin gastos que coincidan"
              mensaje="Ajusta la categoría o el texto de búsqueda para ver resultados."
              icono={<IconoDocumento width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Categoría</Th>
                  <Th>Descripción</Th>
                  <Th>Unidad</Th>
                  <Th>Ruta</Th>
                  <Th alineacion="derecha">Monto</Th>
                  <Th>Comprobante</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((g) => (
                  <Tr key={g.id}>
                    <Td className="whitespace-nowrap text-slate-400">{fechaCorta(g.fecha)}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-sm',
                            COLORES_CATEGORIA[g.categoria] ?? 'bg-slate-500',
                          )}
                        />
                        {etiqueta(g.categoria)}
                      </span>
                    </Td>
                    <Td className="max-w-72 truncate text-slate-300">
                      {g.descripcion ?? 'Sin descripción'}
                    </Td>
                    <Td className="text-slate-400">{g.placa ?? '—'}</Td>
                    <Td className="text-slate-400">
                      {g.ruta_codigo ?? '—'}
                      {g.conductor ? (
                        <span className="block text-[11px] text-slate-500">{g.conductor}</span>
                      ) : null}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-200">
                      {moneda(g.monto)}
                    </Td>
                    <Td className="text-slate-500">{g.comprobante ?? '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña: rentabilidad
// ─────────────────────────────────────────────────────────────

function TablaRutas({ filas }: { filas: FilaRentabilidadRuta[] }) {
  return (
    <TablaCaja>
      <thead>
        <tr>
          <Th>Ruta</Th>
          <Th>Fecha</Th>
          <Th>Zona</Th>
          <Th>Unidad</Th>
          <Th>Conductor</Th>
          <Th alineacion="derecha">Ingresos</Th>
          <Th alineacion="derecha">Combustible</Th>
          <Th alineacion="derecha">Gastos</Th>
          <Th alineacion="derecha">Manten.</Th>
          <Th alineacion="derecha">Comisión</Th>
          <Th alineacion="derecha">Margen</Th>
          <Th alineacion="derecha">Margen %</Th>
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <FilaVacia colSpan={12} mensaje="Sin rutas en el período seleccionado." />
        ) : (
          filas.map((f) => {
            const d = f.rentabilidad;
            return (
              <Tr key={f.rutaId}>
                <Td>
                  <span className="font-medium text-slate-200">{f.codigo}</span>
                  <span className="block text-[11px] text-slate-500">
                    {etiqueta(f.estado)} · {plural(f.envios, 'envío', 'envíos')}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-slate-400">{fechaCorta(f.fecha)}</Td>
                <Td className="text-slate-400">{f.zona}</Td>
                <Td className="text-slate-400">{f.placa ?? '—'}</Td>
                <Td>
                  <span className="block max-w-40 truncate text-slate-300">
                    {f.conductor ?? 'Sin asignar'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {f.tipoVinculacion
                      ? `${etiqueta(f.tipoVinculacion)}${
                          f.tipoVinculacion === 'contratista'
                            ? ` · ${porcentaje(f.comisionPct, 0)}`
                            : ''
                        }`
                      : '—'}
                  </span>
                </Td>
                <Td alineacion="derecha" className="text-slate-200">
                  {moneda(d.ingresos)}
                </Td>
                <Td alineacion="derecha" className="text-slate-400">
                  {moneda(d.combustible)}
                </Td>
                <Td alineacion="derecha" className="text-slate-400">
                  {moneda(d.gastos)}
                </Td>
                <Td alineacion="derecha" className="text-slate-400">
                  {moneda(d.mantenimiento)}
                </Td>
                <Td alineacion="derecha" className="text-slate-400">
                  {moneda(d.comisionConductor)}
                </Td>
                <Td alineacion="derecha">
                  <span className={d.margen >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {moneda(d.margen)}
                  </span>
                </Td>
                <Td alineacion="derecha">
                  <span
                    className={cn(
                      'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      clasesDiagnostico(d.diagnostico),
                    )}
                  >
                    {porcentaje(d.margenPct)}
                  </span>
                </Td>
              </Tr>
            );
          })
        )}
      </tbody>
    </TablaCaja>
  );
}

function TablaUnidades({ filas }: { filas: FilaRentabilidadUnidad[] }) {
  return (
    <TablaCaja>
      <thead>
        <tr>
          <Th>Unidad</Th>
          <Th alineacion="derecha">Rutas</Th>
          <Th alineacion="derecha">Km</Th>
          <Th alineacion="derecha">Envíos</Th>
          <Th alineacion="derecha">Ingresos</Th>
          <Th alineacion="derecha">Combustible</Th>
          <Th alineacion="derecha">Gastos</Th>
          <Th alineacion="derecha">Manten.</Th>
          <Th alineacion="derecha">Comisión</Th>
          <Th alineacion="derecha">Margen</Th>
          <Th alineacion="derecha">Margen %</Th>
          <Th alineacion="derecha">Costo/km</Th>
          <Th alineacion="derecha">Ingreso/km</Th>
          <Th>Diagnóstico</Th>
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <FilaVacia colSpan={14} mensaje="Sin unidades con operación en el período." />
        ) : (
          filas.map((f) => {
            const d = f.rentabilidad;
            return (
              <Tr
                key={f.unidadId ?? 'sin-unidad'}
                className={clasesDiagnostico(d.diagnostico)}
              >
                <Td>
                  <span className="font-medium text-slate-100">{f.placa}</span>
                  <span className="block text-[11px] text-slate-400">
                    {f.tipo ? etiqueta(f.tipo) : 'Sin tipo'}
                  </span>
                </Td>
                <Td alineacion="derecha">{entero(f.rutas)}</Td>
                <Td alineacion="derecha" className="text-slate-200">
                  {entero(d.km)}
                </Td>
                <Td alineacion="derecha" className="text-slate-200">
                  {entero(f.envios)}
                </Td>
                <Td alineacion="derecha" className="text-slate-200">
                  {moneda(d.ingresos)}
                </Td>
                <Td alineacion="derecha" className="text-slate-300">
                  {moneda(d.combustible)}
                </Td>
                <Td alineacion="derecha" className="text-slate-300">
                  {moneda(d.gastos)}
                </Td>
                <Td alineacion="derecha" className="text-slate-300">
                  {moneda(d.mantenimiento)}
                  <span className="block text-[11px] text-slate-500">
                    {moneda(f.costoMantenimientoPorKm)}/km
                  </span>
                </Td>
                <Td alineacion="derecha" className="text-slate-300">
                  {moneda(d.comisionConductor)}
                </Td>
                <Td alineacion="derecha">
                  <span className={d.margen >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {moneda(d.margen)}
                  </span>
                </Td>
                <Td alineacion="derecha">
                  <span className={d.margenPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    {porcentaje(d.margenPct)}
                  </span>
                </Td>
                <Td alineacion="derecha" className="text-slate-300">
                  {moneda(d.costoPorKm)}
                </Td>
                <Td alineacion="derecha" className="text-slate-300">
                  {moneda(d.ingresoPorKm)}
                </Td>
                <Td>
                  <span
                    className={cn(
                      'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      clasesDiagnostico(d.diagnostico),
                    )}
                  >
                    {textoDiagnostico(d.diagnostico)}
                  </span>
                </Td>
              </Tr>
            );
          })
        )}
      </tbody>
    </TablaCaja>
  );
}

async function TabRentabilidad({ rango }: { rango: Rango }) {
  const resumen = await resumenEconomico(rango);
  const rutas = await rentabilidadPorRuta(rango, 500);
  const unidades = await rentabilidadPorUnidad(rango, rutas);
  const rutasPerdida = soloPerdidas(rutas);
  const unidadesPerdida = soloPerdidas(unidades);
  const r = resumen.rentabilidad;

  return (
    <>
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Ingresos del período"
          valor={monedaCorta(resumen.ingresos)}
          detalle={`${plural(resumen.envios, 'envío entregado', 'envíos entregados')} en ${plural(
            rutas.length,
            'ruta',
            'rutas',
          )}`}
          icono={<IconoFinanzas width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Costo total"
          valor={monedaCorta(r.costoTotal)}
          detalle={`Directo ${monedaCorta(r.costoDirecto)} + comisiones ${monedaCorta(
            r.comisionConductor,
          )}`}
          icono={<IconoCombustible width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="Margen"
          valor={monedaCorta(r.margen)}
          detalle={`Margen porcentual ${porcentaje(r.margenPct)} · ${textoDiagnostico(
            r.diagnostico,
          )}`}
          icono={<IconoFinanzas width={16} height={16} />}
          acento={r.margen >= 0 ? 'esmeralda' : 'rosa'}
        />
        <Kpi
          etiqueta="Rutas en pérdida"
          valor={entero(rutasPerdida.length)}
          detalle={`de ${plural(rutas.length, 'ruta', 'rutas')} · ${plural(
            unidadesPerdida.length,
            'unidad en pérdida',
            'unidades en pérdida',
          )}`}
          icono={<IconoAlerta width={16} height={16} />}
          acento={rutasPerdida.length > 0 ? 'rosa' : 'esmeralda'}
        />
      </RejillaKpi>

      <Card className="mt-4">
        <CardCabecera
          titulo="En pérdida: lo primero que hay que corregir"
          descripcion="Rutas y unidades cuyo margen es negativo en el período. Son las que destruyen caja hoy."
          acciones={
            rutasPerdida.length + unidadesPerdida.length > 0 ? (
              <Badge tono="peligro">
                {plural(rutasPerdida.length + unidadesPerdida.length, 'caso', 'casos')}
              </Badge>
            ) : null
          }
        />
        <CardCuerpo>
          {rutasPerdida.length + unidadesPerdida.length === 0 ? (
            <Vacio
              titulo="Ninguna ruta ni unidad en pérdida"
              mensaje="Todas las operaciones del período cubren sus costos directos y la comisión del conductor."
              icono={<IconoCheck width={22} height={22} />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Rutas en pérdida
                </p>
                {rutasPerdida.length === 0 ? (
                  <p className="text-xs text-slate-500">Ninguna ruta pierde dinero en el período.</p>
                ) : (
                  <ul className="space-y-2">
                    {rutasPerdida.slice(0, 8).map((f) => (
                      <li
                        key={f.rutaId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-200">
                            {f.codigo} · {f.zona}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {fechaCorta(f.fecha)} · {f.placa ?? 'Sin unidad'} ·{' '}
                            {f.conductor ?? 'Sin asignar'}
                          </span>
                        </span>
                        <span className="num shrink-0 text-right">
                          <span className="block text-sm font-medium text-rose-300">
                            {moneda(f.rentabilidad.margen)}
                          </span>
                          <span className="block text-[11px] text-rose-300/80">
                            {porcentaje(f.rentabilidad.margenPct)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Unidades en pérdida
                </p>
                {unidadesPerdida.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Ninguna unidad pierde dinero en el período.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {unidadesPerdida.slice(0, 8).map((f) => (
                      <li
                        key={f.unidadId ?? 'sin-unidad'}
                        className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-200">{f.placa}</span>
                          <span className="block text-[11px] text-slate-500">
                            {plural(f.rutas, 'ruta', 'rutas')} · {entero(f.rentabilidad.km)}{' '}
                            {empresa.unidadDistancia} · costo {moneda(f.rentabilidad.costoPorKm)}/km
                          </span>
                        </span>
                        <span className="num shrink-0 text-right">
                          <span className="block text-sm font-medium text-rose-300">
                            {moneda(f.rentabilidad.margen)}
                          </span>
                          <span className="block text-[11px] text-rose-300/80">
                            {porcentaje(f.rentabilidad.margenPct)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardCuerpo>
      </Card>

      <Card className="mt-4">
        <CardCabecera
          titulo="Rentabilidad por ruta"
          descripcion="Ingresos entregados menos combustible, gastos, mantenimiento prorrateado por kilómetro y comisión. Ordenada de peor a mejor margen."
          acciones={<Badge tono="neutro">{plural(rutas.length, 'ruta', 'rutas')}</Badge>}
        />
        <CardCuerpo className="px-0 py-0">
          <TablaRutas filas={rutas} />
        </CardCuerpo>
      </Card>

      <Card className="mt-4">
        <CardCabecera
          titulo="Rentabilidad por unidad"
          descripcion="Agregado del período por unidad, con el costo de mantenimiento por kilómetro histórico de cada vehículo."
          acciones={<Badge tono="neutro">{plural(unidades.length, 'unidad', 'unidades')}</Badge>}
        />
        <CardCuerpo className="px-0 py-0">
          <TablaUnidades filas={unidades} />
        </CardCuerpo>
      </Card>

      <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs leading-relaxed text-slate-500">
        <strong className="font-medium text-slate-400">Cómo se costea cada ruta:</strong> el
        combustible y los gastos salen de las cargas y gastos imputados a la ruta; el mantenimiento
        se prorratea con el costo histórico por kilómetro de la unidad, porque no se registra por
        ruta. La comisión se calcula sobre los envíos entregados y solo aplica a los conductores
        con vinculación de contratista; el salario de los empleados es costo fijo y no se imputa por
        ruta.
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────

export default async function PaginaFinanzas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirPermiso('finanzas');
  const sp = await searchParams;
  const rangoClave = claveRango(sp.rango);
  const vista = claveVista(sp.vista);
  const rango = rangoDe(rangoClave);

  const unidadId = numeroParam(sp.unidad);
  const categoria = claveCategoria(sp.categoria);
  const busqueda = textoParam(sp.q);

  const descripcionPeriodo = `${fecha(rango.desde)} — ${fecha(rango.hasta)}`;

  return (
    <>
      <EncabezadoPagina
        titulo="Costos y rentabilidad"
        descripcion={
          <>
            Panorama económico de la operación: qué cuesta cada ruta y cada unidad, cuánto pesa el
            combustible y qué queda de margen después de todos los costos directos.
          </>
        }
        acciones={
          <>
            <SelectorRango actual={rangoClave} vista={vista} />
            <Badge tono="neutro">{descripcionPeriodo}</Badge>
          </>
        }
      />

      <Pestanas actual={vista} rango={rangoClave} />

      <div className="mt-4">
        {vista === 'resumen' ? <TabResumen rango={rango} /> : null}
        {vista === 'combustible' ? (
          <TabCombustible rango={rango} rangoClave={rangoClave} unidadId={unidadId} />
        ) : null}
        {vista === 'gastos' ? (
          <TabGastos
            rango={rango}
            rangoClave={rangoClave}
            categoria={categoria}
            busqueda={busqueda}
          />
        ) : null}
        {vista === 'rentabilidad' ? <TabRentabilidad rango={rango} /> : null}
      </div>

      <p className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-slate-600">
        <IconoReloj width={13} height={13} />
        Datos calculados a las {hora(aISOCompleto(new Date()))}
      </p>
    </>
  );
}
