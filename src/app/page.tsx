import Link from 'next/link';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { Dona, GraficaBarras, Sparkline } from '@/components/ui/Grafica';
import {
  IconoAlerta,
  IconoBuscar,
  IconoCheck,
  IconoCaja,
  IconoCombustible,
  IconoDespacho,
  IconoFlota,
  IconoHerramienta,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { Progreso } from '@/components/ui/Progreso';
import { FilaVacia, TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { empresa } from '@/config/empresa';
import {
  actividadReciente,
  desempenoConductores,
  documentosPorVencer,
  kpisOperacion,
  mantenimientosProximos,
  resumenCartera,
  resumenFinanciero,
  serieDiaria,
  topZonas,
} from '@/db/queries/dashboard';
import { requerirPermiso } from '@/lib/auth/sesion';
import { estadoVencimiento } from '@/lib/domain';
import {
  aISOCompleto,
  entero,
  etiqueta,
  fechaCorta,
  haceCuanto,
  hora,
  hoyISO,
  moneda,
  monedaCorta,
  numero,
  porcentaje,
} from '@/lib/format';
import { etiquetaDia, nombreMes, rangoMes } from '@/lib/periodos';

// Los datos cambian con cada operación: nada de pre-renderizado estático.
export const dynamic = 'force-dynamic';

export default async function PaginaTablero() {
  const sesion = await requerirPermiso('tablero');
  const hoy = hoyISO();
  const kpis = await kpisOperacion(hoy);
  const serie = await serieDiaria(14);
  const finanzas = await resumenFinanciero(rangoMes());
  const cartera = await resumenCartera();
  const docs = await documentosPorVencer(30, 8);
  const mantenimientos = await mantenimientosProximos(30, 6);
  const zonas = await topZonas(6);
  const conductores = await desempenoConductores(6);
  const actividad = await actividadReciente(6);

  const enviosSerie = serie.map((d) => d.entregados);
  const ingresosSerie = serie.map((d) => d.ingresos);
  const hayDatos = kpis.entregas.total > 0 || serie.some((d) => d.envios > 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Tablero de operación"
        descripcion={
          <>
            Resumen del día y del mes en curso. Los indicadores se recalculan en cada
            visita a partir de la operación registrada.
          </>
        }
        acciones={
          <>
            <Badge tono="info">
              <span className="latido inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
              {empresa.ciudad}
            </Badge>
            <Badge tono="neutro">{nombreMes()}</Badge>
          </>
        }
      />

      {/* ── Indicadores principales ───────────────────────────── */}
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Entregas de hoy"
          valor={entero(kpis.entregas.entregados)}
          detalle={`${entero(kpis.entregas.total)} envíos programados`}
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
          pie={
            <>
              <Progreso valor={kpis.entregas.cumplimiento} mostrarTexto />
              <Sparkline datos={enviosSerie} color="#34d399" ancho={220} alto={28} />
            </>
          }
        />
        <Kpi
          etiqueta="Rutas activas"
          valor={entero(kpis.rutasEnCurso)}
          detalle={`${entero(kpis.rutasPlanificadas)} por despachar · ${entero(
            kpis.rutasCompletadas,
          )} completadas`}
          icono={<IconoDespacho width={16} height={16} />}
          acento="cielo"
          pie={
            <p className="text-xs text-slate-500">
              {entero(kpis.rutas)} rutas programadas para hoy
            </p>
          }
        />
        <Kpi
          etiqueta="Unidades en ruta"
          valor={entero(kpis.unidadesEnRuta)}
          detalle={`${entero(kpis.unidadesDisponibles)} disponibles en patio`}
          icono={<IconoFlota width={16} height={16} />}
          acento="violeta"
          pie={
            <div className="flex flex-wrap gap-1.5">
              <Badge tono="aviso">{entero(kpis.unidadesMantenimiento)} en taller</Badge>
              {kpis.unidadesFueraServicio > 0 ? (
                <Badge tono="peligro">
                  {entero(kpis.unidadesFueraServicio)} fuera de servicio
                </Badge>
              ) : null}
            </div>
          }
        />
        <Kpi
          etiqueta="Margen del mes"
          valor={monedaCorta(finanzas.margen)}
          detalle={`${monedaCorta(finanzas.ingresos)} facturado · ${porcentaje(
            finanzas.margenPct,
          )}`}
          icono={<IconoCombustible width={16} height={16} />}
          acento={finanzas.margen >= 0 ? 'esmeralda' : 'rosa'}
          pie={<Sparkline datos={ingresosSerie} color="#38bdf8" ancho={220} alto={28} />}
        />
      </RejillaKpi>

      {/* ── Tendencia y estructura de costos ──────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardCabecera
            titulo="Entregas de los últimos 14 días"
            descripcion="Barras apiladas: entregas efectivas y novedades o devoluciones."
            acciones={
              <span className="num text-xs text-slate-400">
                {entero(serie.reduce((s, d) => s + d.entregados, 0))} entregas
              </span>
            }
          />
          <CardCuerpo>
            {hayDatos ? (
              <GraficaBarras
                datos={serie.map((d) => ({
                  etiqueta: etiquetaDia(d.fecha).split(' ').slice(0, 2).join(' '),
                  valor: d.entregados,
                  secundario: d.novedades,
                  titulo: `${fechaCorta(d.fecha)} · ${d.entregados} entregados, ${
                    d.novedades
                  } con novedad · ${monedaCorta(d.ingresos)}`,
                }))}
                etiquetaPrimaria="Entregados"
                etiquetaSecundaria="Novedad o devolución"
                altura={170}
              />
            ) : (
              <Vacio
                titulo="Sin actividad en el período"
                mensaje="Ejecuta «npm run seed» para generar datos de ejemplo."
              />
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Composición de costos"
            descripcion={`Acumulado de ${nombreMes().toLowerCase()}`}
          />
          <CardCuerpo>
            <Dona
              segmentos={[
                { etiqueta: 'Combustible', valor: finanzas.combustible, color: '#38bdf8' },
                { etiqueta: 'Comisiones', valor: finanzas.comisiones, color: '#a78bfa' },
                { etiqueta: 'Gastos de ruta', valor: finanzas.gastos, color: '#fbbf24' },
                { etiqueta: 'Mantenimiento', valor: finanzas.mantenimiento, color: '#fb7185' },
              ]}
              centro={{
                titulo: monedaCorta(
                  finanzas.combustible +
                    finanzas.comisiones +
                    finanzas.gastos +
                    finanzas.mantenimiento,
                ),
                subtitulo: 'Costo total',
              }}
            />
            <dl className="mt-4 space-y-1.5 border-t border-slate-800 pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Ingresos por flete</dt>
                <dd className="num text-slate-200">{moneda(finanzas.ingresos)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Margen bruto</dt>
                <dd
                  className={`num font-medium ${
                    finanzas.margen >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {moneda(finanzas.margen)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Kilómetros recorridos</dt>
                <dd className="num text-slate-200">{entero(finanzas.km)} km</dd>
              </div>
            </dl>
          </CardCuerpo>
        </Card>
      </div>

      {/* ── Alertas de cumplimiento ───────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardCabecera
            titulo="Documentación por vencer"
            descripcion="Vencimientos de los próximos 30 días y documentos ya vencidos."
            acciones={
              <Link
                href="/flota?tab=documentos"
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                Ver todo →
              </Link>
            }
          />
          {docs.length === 0 ? (
            <Vacio
              titulo="Toda la documentación está vigente"
              mensaje="No hay vencimientos en los próximos 30 días."
              icono={<IconoCheck width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Unidad</Th>
                  <Th>Documento</Th>
                  <Th>Vence</Th>
                  <Th alineacion="derecha">Estado</Th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const estado = estadoVencimiento(d.vencimiento);
                  return (
                    <Tr key={d.id}>
                      <Td>
                        <span className="font-medium text-slate-200">{d.placa}</span>
                        <span className="block text-[11px] text-slate-500">
                          {etiqueta(d.tipo_unidad)}
                        </span>
                      </Td>
                      <Td>{etiqueta(d.tipo)}</Td>
                      <Td className="text-slate-400">{fechaCorta(d.vencimiento)}</Td>
                      <Td alineacion="derecha">
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${estado.clases}`}
                        >
                          {estado.texto}
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TablaCaja>
          )}
        </Card>

        <Card>
          <CardCabecera
            titulo="Mantenimiento programado"
            descripcion="Órdenes de taller agendadas o en curso."
            acciones={
              <Link
                href="/flota?tab=mantenimiento"
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                Ver todo →
              </Link>
            }
          />
          {mantenimientos.length === 0 ? (
            <Vacio
              titulo="Sin órdenes de taller"
              mensaje="No hay mantenimientos programados en los próximos 30 días."
              icono={<IconoHerramienta width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Unidad</Th>
                  <Th>Intervención</Th>
                  <Th>Fecha</Th>
                  <Th alineacion="derecha">Costo estimado</Th>
                </tr>
              </thead>
              <tbody>
                {mantenimientos.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <span className="font-medium text-slate-200">{m.placa}</span>
                      <span className="block text-[11px] text-slate-500">
                        {etiqueta(m.tipo)}
                      </span>
                    </Td>
                    <Td className="max-w-56 truncate text-slate-400">{m.descripcion}</Td>
                    <Td className="text-slate-400">{fechaCorta(m.fecha)}</Td>
                    <Td alineacion="derecha" className="text-slate-200">
                      {moneda(m.costo)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TablaCaja>
          )}
        </Card>
      </div>

      {/* ── Rankings y cartera ────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardCabecera titulo="Zonas con más entregas" descripcion="Mes en curso" />
          <CardCuerpo>
            {zonas.length === 0 ? (
              <Vacio titulo="Sin entregas registradas" />
            ) : (
              <ul className="space-y-3">
                {zonas.map((z) => (
                  <li key={z.zona}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate text-slate-300">{z.zona}</span>
                      <span className="num shrink-0 text-slate-400">
                        {entero(z.entregados)} entregas
                      </span>
                    </div>
                    <Progreso
                      valor={(Number(z.entregados) / Number(zonas[0].entregados || 1)) * 100}
                      className="mt-1"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera titulo="Desempeño de conductores" descripcion="Mes en curso" />
          <CardCuerpo className="px-0 py-0">
            {conductores.length === 0 ? (
              <Vacio titulo="Sin rutas asignadas" />
            ) : (
              <TablaCaja>
                <thead>
                  <tr>
                    <Th>Conductor</Th>
                    <Th alineacion="derecha">Rutas</Th>
                    <Th alineacion="derecha">Entregas</Th>
                    <Th alineacion="derecha">Cumplim.</Th>
                  </tr>
                </thead>
                <tbody>
                  {conductores.map((c) => (
                    <Tr key={c.id}>
                      <Td>
                        <span className="block max-w-36 truncate text-slate-200">
                          {c.nombre}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {etiqueta(c.tipo_vinculacion)}
                        </span>
                      </Td>
                      <Td alineacion="derecha">{entero(c.rutas)}</Td>
                      <Td alineacion="derecha">{entero(c.entregados)}</Td>
                      <Td alineacion="derecha">
                        <span
                          className={
                            Number(c.cumplimiento) >= 90
                              ? 'text-emerald-300'
                              : Number(c.cumplimiento) >= 75
                                ? 'text-amber-300'
                                : 'text-rose-300'
                          }
                        >
                          {porcentaje(c.cumplimiento, 0)}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TablaCaja>
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Cartera"
            descripcion="Estado de las facturas emitidas"
            acciones={
              <Link href="/facturacion" className="text-xs text-sky-400 hover:text-sky-300">
                Ver todo →
              </Link>
            }
          />
          <CardCuerpo>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-slate-400">Total facturado</dt>
                <dd className="num text-lg font-semibold text-slate-100">
                  {moneda(cartera.totalFacturado)}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3">
                <div>
                  <dt className="text-xs text-slate-400">Por cobrar</dt>
                  <dd className="num text-sm font-medium text-amber-300">
                    {moneda(cartera.porCobrar)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Vencido</dt>
                  <dd className="num text-sm font-medium text-rose-300">
                    {moneda(cartera.vencido)}
                  </dd>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
                {cartera.porEstado.map((e) => (
                  <BadgeEstado
                    key={e.estado}
                    estado={e.estado}
                    texto={`${etiqueta(e.estado)}: ${entero(e.n)}`}
                  />
                ))}
              </div>
            </dl>
          </CardCuerpo>
        </Card>
      </div>

      {/* ── Actividad reciente ────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Última posición reportada por la flota"
          descripcion="Telemetría GPS más reciente de cada unidad."
          acciones={
            <Link href="/rastreo" className="text-xs text-sky-400 hover:text-sky-300">
              Abrir rastreo en vivo →
            </Link>
          }
        />
        <CardCuerpo className="px-0 py-0">
          {actividad.length === 0 ? (
            <Vacio
              titulo="Sin telemetría disponible"
              mensaje="Ninguna unidad ha reportado posición todavía."
              icono={<IconoBuscar width={22} height={22} />}
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Unidad</Th>
                  <Th>Ruta</Th>
                  <Th>Zona</Th>
                  <Th>Conductor</Th>
                  <Th alineacion="derecha">Velocidad</Th>
                  <Th alineacion="derecha">Reportado</Th>
                </tr>
              </thead>
              <tbody>
                {actividad.map((a, i) => (
                  <Tr key={`${a.placa}-${i}`}>
                    <Td>
                      <span className="font-medium text-slate-200">{a.placa}</span>
                      <span className="block text-[11px] text-slate-500">
                        {etiqueta(a.tipo)}
                      </span>
                    </Td>
                    <Td className="text-slate-400">{a.ruta_codigo ?? '—'}</Td>
                    <Td className="text-slate-400">{a.zona ?? '—'}</Td>
                    <Td className="text-slate-400">{a.conductor ?? 'Sin asignar'}</Td>
                    <Td alineacion="derecha">
                      {Number(a.velocidad_kmh) > 0 ? (
                        <span className="text-slate-200">
                          {numero(a.velocidad_kmh, 0)} km/h
                        </span>
                      ) : (
                        <Badge tono="aviso">Detenido</Badge>
                      )}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-400">
                      {haceCuanto(a.timestamp)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
      </Card>

      <p className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-slate-600">
        <IconoReloj width={13} height={13} />
        Datos calculados a las {hora(aISOCompleto(new Date()))}
      </p>
    </>
  );
}
