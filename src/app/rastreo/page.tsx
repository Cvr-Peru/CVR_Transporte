import Link from 'next/link';
import { MapaFlota, aUnidadMapa } from '@/components/mapa/MapaFlota';
import { ConmutadorMapa } from '@/components/mapa/ConmutadorMapa';
import { Badge, BadgeEstado, tonoDeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import {
  IconoAlerta,
  IconoBuscar,
  IconoCaja,
  IconoCheck,
  IconoFlota,
  IconoMapa,
  IconoRefrescar,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { Progreso } from '@/components/ui/Progreso';
import { FilaVacia, TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { buscarPorGuia, novedadesDeEnvio, paradasDeRuta, posicionesDeRuta } from '@/db/queries/despachos';
import {
  UMBRAL_MOVIMIENTO_KMH,
  kpisRastreo,
  paradaDeGuia,
  posicionesDeUnidad,
  unidadesEnVivo,
  unidadEnVivo,
} from '@/db/queries/rastreo';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { progresoRuta, textoProgreso } from '@/lib/domain';
import {
  entero,
  etiqueta,
  fecha,
  haceCuanto,
  hora,
  numero,
  plural,
} from '@/lib/format';
import { avanzarSimulacion } from './actions';

// La telemetría cambia en cada reporte: nada de pre-renderizado estático.
export const dynamic = 'force-dynamic';

interface PropsPagina {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaRastreo({ searchParams }: PropsPagina) {
  const sesion = await requerirPermiso('rastreo');
  // Quien solo tiene permiso de lectura no debe ver controles que no funcionan.
  const puedeEditar = puede(sesion.rol, 'rastreo', 'editar');

  const sp = await searchParams;
  const unidadParam = typeof sp.unidad === 'string' ? sp.unidad.trim() : '';
  const guiaParam = typeof sp.guia === 'string' ? sp.guia.trim() : '';

  const unidadId = /^\d+$/.test(unidadParam) ? Number(unidadParam) : null;

  const unidades = await unidadesEnVivo();
  const kpis = await kpisRastreo(unidades);

  // ── Unidad seleccionada ────────────────────────────────────
  const unidadDetalle = unidadId != null ? await unidadEnVivo(unidadId) : null;
  // Con ruta asignada se dibuja la traza del recorrido completo de esa ruta;
  // sin ruta, el historial de posiciones de la propia unidad.
  const trayectoria = !unidadDetalle
    ? []
    : unidadDetalle.ruta_id != null
      ? await posicionesDeRuta(unidadDetalle.ruta_id)
      : await posicionesDeUnidad(unidadDetalle.unidad_id);
  const paradasDetalle =
    unidadDetalle?.ruta_id != null ? await paradasDeRuta(unidadDetalle.ruta_id) : [];

  // ── Rastreo por guía ───────────────────────────────────────
  const envio = guiaParam.length >= 3 ? await buscarPorGuia(guiaParam) : null;
  const paradaEnvio = envio?.parada_id != null ? await paradaDeGuia(envio.parada_id) : null;
  const novedades = envio ? await novedadesDeEnvio(envio.id) : [];

  const hayUnidades = unidades.length > 0;
  const enRutaActivas = unidades.filter((u) => u.ruta_codigo != null).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Rastreo GPS y estado en vivo"
        descripcion="Última posición reportada por cada unidad, avance de sus rutas y consulta pública de guías. Toda la telemetría de esta demostración es simulada."
        acciones={
          <>
            <Badge tono="info">
              <span className="latido inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
              {entero(kpis.reportando)} reportando
            </Badge>
            {puedeEditar ? (
              <form action={avanzarSimulacion}>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Avanzar simulación
                </button>
              </form>
            ) : null}
          </>
        }
      />

      {/* ── Indicadores ──────────────────────────────────────── */}
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Unidades reportando"
          valor={entero(kpis.reportando)}
          detalle={
            kpis.rutasActivas > 0
              ? `${plural(kpis.rutasActivas, 'ruta en curso', 'rutas en curso')}`
              : 'Sin rutas en curso reportando'
          }
          icono={<IconoMapa width={16} height={16} />}
          acento="cielo"
          pie={
            <p className="text-xs text-slate-500">
              {entero(enRutaActivas)} con ruta asignada en su último reporte
            </p>
          }
        />
        <Kpi
          etiqueta="Unidades en movimiento"
          valor={entero(kpis.enMovimiento)}
          detalle={`A más de ${entero(UMBRAL_MOVIMIENTO_KMH)} km/h`}
          icono={<IconoFlota width={16} height={16} />}
          acento="esmeralda"
          pie={
            <p className="text-xs text-slate-500">
              {kpis.enMovimiento > 0
                ? `Velocidad media ${numero(kpis.velocidadMedia, 0)} km/h`
                : 'Ninguna unidad se está desplazando'}
            </p>
          }
        />
        <Kpi
          etiqueta="Unidades detenidas"
          valor={entero(kpis.detenidas)}
          detalle="Reportando sin desplazamiento"
          icono={<IconoReloj width={16} height={16} />}
          acento={kpis.detenidas > 0 ? 'ambar' : 'slate'}
          pie={
            <p className="text-xs text-slate-500">
              Puede ser entrega en curso, tráfico o pausa del conductor
            </p>
          }
        />
        <Kpi
          etiqueta="Pendientes en la calle"
          valor={entero(kpis.enCalle)}
          detalle={`${entero(kpis.enReparto)} ya en reparto`}
          icono={<IconoCaja width={16} height={16} />}
          acento="violeta"
          pie={
            <p className="text-xs text-slate-500">
              Envíos en estado pendiente o en reparto
            </p>
          }
        />
      </RejillaKpi>

      {/* ── Mapa general ─────────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Mapa general de la flota"
          descripcion="Última posición conocida de cada unidad que ha reportado telemetría."
          acciones={
            <span className="num text-xs text-slate-400">
              {entero(unidades.length)} unidades
            </span>
          }
        />
        <CardCuerpo>
          {hayUnidades ? (
            <ConmutadorMapa unidades={unidades.map(aUnidadMapa)} altura={440}>
              <MapaFlota
                unidades={unidades.map(aUnidadMapa)}
                titulo="Mapa general de la flota"
                altura={440}
              />
            </ConmutadorMapa>
          ) : (
            <Vacio
              titulo="Sin telemetría disponible"
              mensaje="Ninguna unidad ha reportado posición todavía. Usa «Avanzar simulación» para generar un paso de reparto o ejecuta «npm run seed»."
              icono={<IconoMapa width={22} height={22} />}
            />
          )}
        </CardCuerpo>
      </Card>

      {/* ── Unidad seleccionada ──────────────────────────────── */}
      {unidadId != null ? (
        <Card className="mt-4">
          <CardCabecera
            titulo={
              unidadDetalle
                ? `${unidadDetalle.placa} · ${etiqueta(unidadDetalle.tipo)}`
                : `Unidad ${unidadId}`
            }
            descripcion={
              unidadDetalle
                ? `Trayectoria completa registrada${
                    unidadDetalle.ruta_codigo ? ` en la ruta ${unidadDetalle.ruta_codigo}` : ''
                  }${unidadDetalle.zona ? ` (${unidadDetalle.zona})` : ''}.`
                : 'Esta unidad no aparece en la telemetría.'
            }
            acciones={
              <>
                {unidadDetalle ? (
                  <BadgeEstado
                    estado={unidadDetalle.estado}
                    texto={etiqueta(unidadDetalle.estado)}
                  />
                ) : null}
                <Link href="/rastreo" className="text-xs text-slate-400 hover:text-slate-200">
                  Quitar filtro
                </Link>
              </>
            }
          />
          <CardCuerpo>
            {unidadDetalle ? (
              <>
                <dl className="mb-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-400">Ruta</dt>
                    <dd className="text-slate-200">{unidadDetalle.ruta_codigo ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Conductor</dt>
                    <dd className="truncate text-slate-200">
                      {unidadDetalle.conductor ?? 'Sin asignar'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Velocidad</dt>
                    <dd className="num text-slate-200">
                      {numero(unidadDetalle.velocidad_kmh, 0)} km/h
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Último reporte</dt>
                    <dd className="text-slate-200">
                      {haceCuanto(unidadDetalle.timestamp)}{' '}
                      <span className="text-slate-500">({hora(unidadDetalle.timestamp)})</span>
                    </dd>
                  </div>
                </dl>

                <ConmutadorMapa
                  unidades={[aUnidadMapa(unidadDetalle)]}
                  trayectoria={trayectoria}
                  paradas={paradasDetalle.map((p) => ({
                    id: p.id,
                    orden: p.orden,
                    direccion: p.direccion,
                    lat: p.lat,
                    lng: p.lng,
                    estado: p.estado,
                  }))}
                  altura={470}
                >
                  <MapaFlota
                    unidades={[aUnidadMapa(unidadDetalle)]}
                    trayectoria={trayectoria}
                    paradas={paradasDetalle.map((p) => ({
                      id: p.id,
                      orden: p.orden,
                      direccion: p.direccion,
                      lat: p.lat,
                      lng: p.lng,
                      estado: p.estado,
                    }))}
                    titulo={`Trayectoria de ${unidadDetalle.placa}`}
                    altura={470}
                  />
                </ConmutadorMapa>

                <div className="mt-4 border-t border-slate-800 pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Secuencia de posiciones ({entero(trayectoria.length)})
                  </h3>
                  <TablaCaja className="mt-2">
                    <thead>
                      <tr>
                        <Th>Hora</Th>
                        <Th alineacion="derecha">Latitud</Th>
                        <Th alineacion="derecha">Longitud</Th>
                        <Th alineacion="derecha">Velocidad</Th>
                        <Th alineacion="derecha">Rumbo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {trayectoria.length === 0 ? (
                        <FilaVacia
                          colSpan={5}
                          mensaje="La unidad todavía no ha reportado ningún punto de telemetría."
                        />
                      ) : (
                        trayectoria
                          .slice()
                          .reverse()
                          .map((p) => (
                            <Tr key={p.id}>
                              <Td className="text-slate-400">{hora(p.timestamp)}</Td>
                              <Td alineacion="derecha">{numero(p.lat, 5)}</Td>
                              <Td alineacion="derecha">{numero(p.lng, 5)}</Td>
                              <Td alineacion="derecha">
                                {Number(p.velocidad_kmh) > UMBRAL_MOVIMIENTO_KMH ? (
                                  <span className="text-slate-200">
                                    {numero(p.velocidad_kmh, 0)} km/h
                                  </span>
                                ) : (
                                  <Badge tono="aviso">Detenida</Badge>
                                )}
                              </Td>
                              <Td alineacion="derecha" className="text-slate-400">
                                {numero(p.rumbo, 0)}°
                              </Td>
                            </Tr>
                          ))
                      )}
                    </tbody>
                  </TablaCaja>
                </div>
              </>
            ) : (
              <Vacio
                titulo="Unidad sin telemetría"
                mensaje={`No hay posiciones registradas para la unidad ${unidadId}. Comprueba el identificador o vuelve a la lista general.`}
                icono={<IconoBuscar width={22} height={22} />}
                accion={
                  <Link
                    href="/rastreo"
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Volver a la flota
                  </Link>
                }
              />
            )}
          </CardCuerpo>
        </Card>
      ) : null}

      {/* ── Lista de unidades en vivo ────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Unidades en vivo"
          descripcion="Cada fila abre el detalle con su trayectoria y sus paradas. Ordenadas por velocidad."
          acciones={
            <Badge tono={kpis.enMovimiento > 0 ? 'exito' : 'neutro'}>
              {entero(kpis.enMovimiento)} en movimiento
            </Badge>
          }
        />
        <CardCuerpo className="px-0 py-0">
          {hayUnidades ? (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Unidad</Th>
                  <Th>Estado</Th>
                  <Th>Ruta</Th>
                  <Th>Zona</Th>
                  <Th>Conductor</Th>
                  <Th alineacion="derecha">Velocidad</Th>
                  <Th alineacion="derecha">Reportado</Th>
                  <Th>Progreso</Th>
                  <Th alineacion="derecha">Pendientes</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => (
                  <Tr key={u.unidad_id}>
                    <Td>
                      <Link
                        href={`/rastreo?unidad=${u.unidad_id}`}
                        className="font-medium text-slate-200 hover:text-sky-300"
                      >
                        {u.placa}
                      </Link>
                      <span className="block text-[11px] text-slate-500">
                        {etiqueta(u.tipo)}
                      </span>
                    </Td>
                    <Td>
                      <BadgeEstado estado={u.estado} texto={etiqueta(u.estado)} />
                    </Td>
                    <Td className="text-slate-400">{u.ruta_codigo ?? '—'}</Td>
                    <Td className="text-slate-400">{u.zona ?? '—'}</Td>
                    <Td className="max-w-40 truncate text-slate-400">
                      {u.conductor ?? 'Sin asignar'}
                    </Td>
                    <Td alineacion="derecha">
                      {Number(u.velocidad_kmh) > UMBRAL_MOVIMIENTO_KMH ? (
                        <span className="text-slate-200">
                          {numero(u.velocidad_kmh, 0)} km/h
                        </span>
                      ) : (
                        <Badge tono="aviso">Detenida</Badge>
                      )}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-400">
                      {haceCuanto(u.timestamp)}
                    </Td>
                    <Td>
                      {u.ruta_id != null && Number(u.paradas_totales) > 0 ? (
                        <div className="min-w-32">
                          <Progreso
                            valor={progresoRuta(
                              Number(u.paradas_resueltas),
                              Number(u.paradas_totales),
                            )}
                            mostrarTexto
                          />
                          <span className="mt-1 block text-[11px] text-slate-500">
                            {textoProgreso(
                              Number(u.paradas_resueltas),
                              Number(u.paradas_totales),
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Sin ruta activa</span>
                      )}
                    </Td>
                    <Td alineacion="derecha" className="text-slate-200">
                      {entero(u.envios_pendientes)}
                    </Td>
                    <Td alineacion="derecha">
                      <Link
                        href={`/rastreo?unidad=${u.unidad_id}`}
                        className="text-xs text-sky-400 hover:text-sky-300"
                      >
                        Ver →
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TablaCaja>
          ) : (
            <Vacio
              titulo="Sin unidades reportando"
              mensaje="No hay telemetría GPS registrada. Usa «Avanzar simulación» o ejecuta «npm run seed» para generar datos de demostración."
              icono={<IconoFlota width={22} height={22} />}
            />
          )}
        </CardCuerpo>
      </Card>

      {/* ── Rastreo por guía ─────────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Rastreo de una guía"
          descripcion="Consulta pública: esto es lo que ve el cliente final al buscar su número de guía."
          acciones={<Badge tono="neutro">Simulación</Badge>}
        />
        <CardCuerpo>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="unidad" value={unidadParam} />
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Número de guía
              <input
                name="guia"
                defaultValue={guiaParam}
                placeholder="Ej. TR-20260214-00042"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Rastrear
            </button>
            {guiaParam ? (
              <Link
                href={unidadParam ? `/rastreo?unidad=${unidadParam}` : '/rastreo'}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Limpiar
              </Link>
            ) : null}
          </form>

          {guiaParam.length === 0 ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <IconoBuscar width={13} height={13} />
              Introduce una guía para ver su estado y su recorrido.
            </p>
          ) : envio ? (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-sm font-semibold text-slate-100">{envio.guia}</span>
                <BadgeEstado estado={envio.estado} texto={etiqueta(envio.estado)} />
                {envio.estado === 'en_reparto' ? (
                  <Badge tono="info">
                    <span className="latido inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                    En la calle
                  </Badge>
                ) : null}
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Destinatario</dt>
                  <dd className="text-slate-200">{envio.destinatario}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Dirección</dt>
                  <dd className="text-slate-200">{envio.direccion ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Zona</dt>
                  <dd className="text-slate-200">
                    {envio.zona ?? '—'}
                    {envio.ciudad ? <span className="text-slate-500"> · {envio.ciudad}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Fecha compromiso</dt>
                  <dd className="text-slate-200">{fecha(envio.fecha_compromiso)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Entrega</dt>
                  <dd className="text-slate-200">
                    {envio.fecha_entrega
                      ? `${fecha(envio.fecha_entrega)} · recibido por ${envio.receptor ?? '—'}`
                      : 'Aún no entregado'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Lo reparte</dt>
                  <dd className="text-slate-200">
                    {envio.conductor ?? 'Sin conductor asignado'}
                    {envio.placa ? <span className="text-slate-500"> · {envio.placa}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Ruta</dt>
                  <dd className="text-slate-200">{envio.ruta_codigo ?? 'Sin ruta asignada'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Parada dentro de la ruta</dt>
                  <dd className="text-slate-200">
                    {paradaEnvio
                      ? `${entero(paradaEnvio.orden)} de ${entero(paradaEnvio.total_paradas)}`
                      : 'Sin parada asignada'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Estado de la parada</dt>
                  <dd>
                    {paradaEnvio ? (
                      <BadgeEstado
                        estado={paradaEnvio.estado}
                        texto={etiqueta(paradaEnvio.estado)}
                      />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Cliente</dt>
                  <dd className="text-slate-200">{envio.cliente}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Intentos de entrega</dt>
                  <dd className="num text-slate-200">{entero(envio.intentos)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Dirección de la parada</dt>
                  <dd className="text-slate-200">{paradaEnvio?.direccion ?? '—'}</dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-slate-800 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Novedades registradas
                </h3>
                {novedades.length === 0 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <IconoCheck width={13} height={13} />
                    Sin novedades: la entrega no ha presentado incidencias.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {novedades.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tono={tonoDeEstado(n.tipo)}>{etiqueta(n.tipo)}</Badge>
                          <span className="text-[11px] text-slate-500">
                            {fecha(n.fecha)} · {hora(n.fecha)}
                          </span>
                          <Badge tono={n.resuelto ? 'exito' : 'aviso'}>
                            {n.resuelto ? 'Resuelta' : 'Abierta'}
                          </Badge>
                        </div>
                        {n.descripcion ? (
                          <p className="mt-1 text-xs text-slate-300">{n.descripcion}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                <span className="mt-0.5 text-amber-300">
                  <IconoAlerta width={18} height={18} />
                </span>
                <div>
                  <p className="text-sm font-medium text-amber-200">
                    Guía no encontrada: «{guiaParam}»
                  </p>
                  <p className="mt-0.5 text-xs text-amber-200/80">
                    No hay ningún envío con ese número. Verifica el dato con quien despachó
                    el paquete: las guías de esta demostración tienen el formato
                    TR-AAAAMMDD-NNNNN y se pueden consultar desde el módulo de despachos.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardCuerpo>
      </Card>

      {/* ── Simulación ───────────────────────────────────────── */}
      {puedeEditar ? (
        <Card className="mt-4">
          <CardCabecera
            titulo="Simulación de avance de reparto"
            descripcion="Herramienta de demostración: hace avanzar todas las rutas en curso un paso."
          />
          <CardCuerpo>
            <p className="text-xs text-slate-400">
              La telemetría de esta aplicación es <strong className="text-slate-200">simulada</strong>.
              Al avanzar la simulación se entrega la siguiente parada de cada ruta en curso, sus
              envíos pasan a entregado y se registra una nueva posición GPS para cada unidad
              acercándola hacia su próximo objetivo. La operación es atómica: si algo falla, no se
              aplica ningún cambio.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <form action={avanzarSimulacion}>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Avanzar simulación
                </button>
              </form>
              <Link
                href="/rastreo"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                <IconoRefrescar width={14} height={14} />
                Recargar datos
              </Link>
              <span className="text-[11px] text-slate-500">
                Datos de demostración generados con «npm run seed».
              </span>
            </div>
          </CardCuerpo>
        </Card>
      ) : null}
    </>
  );
}
