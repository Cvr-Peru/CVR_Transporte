import Link from 'next/link';
import { registrarMantenimiento } from './actions';
import { Badge, tonoDeEstado, type Tono } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { BarrasHorizontales } from '@/components/ui/Grafica';
import {
  IconoAlerta,
  IconoCheck,
  IconoDespacho,
  IconoDocumento,
  IconoFinanzas,
  IconoFlota,
  IconoHerramienta,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { empresa, umbrales } from '@/config/empresa';
import {
  costoMantenimientoPorUnidad,
  kpisDocumentos,
  kpisMantenimiento,
  kpisUnidades,
  listarDocumentos,
  listarMantenimientos,
  listarUnidades,
  unidadesParaSelect,
} from '@/db/queries/flota';
import type {
  EstadoUnidad,
  Mantenimiento,
  TipoDocumento,
  TipoUnidad,
} from '@/db/tipos';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { cn } from '@/lib/cn';
import { estadoVencimiento, type NivelAlerta } from '@/lib/domain';
import {
  entero,
  etiqueta,
  fecha,
  fechaCorta,
  hoyISO,
  moneda,
  monedaCorta,
  numero,
  plural,
} from '@/lib/format';

// La flota cambia con cada operación: nada de pre-renderizado estático.
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// Constantes de interfaz
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'unidades', etiqueta: 'Unidades' },
  { id: 'documentos', etiqueta: 'Documentos' },
  { id: 'mantenimiento', etiqueta: 'Mantenimiento' },
] as const;

type TabFlota = (typeof TABS)[number]['id'];

const ESTADOS_UNIDAD: readonly EstadoUnidad[] = [
  'disponible',
  'en_ruta',
  'mantenimiento',
  'fuera_servicio',
];

const TIPOS_UNIDAD: readonly TipoUnidad[] = [
  'moto',
  'furgoneta',
  'camion_ligero',
  'camion',
  'camion_pesado',
];

const TIPOS_DOCUMENTO: readonly TipoDocumento[] = [
  'soat',
  'revision_tecnica',
  'seguro_todo_riesgo',
  'tarjeta_propiedad',
  'permiso_transito',
];

const NIVELES: readonly NivelAlerta[] = ['vencido', 'critico', 'proximo', 'vigente'];

const ETIQUETA_NIVEL: Record<NivelAlerta, string> = {
  vencido: 'Vencido',
  critico: `Crítico (≤ ${umbrales.critico} días)`,
  proximo: `Por vencer (≤ ${umbrales.preventivo} días)`,
  vigente: 'Vigente',
};

const CAMPO =
  'rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';
const BOTON_PRIMARIO =
  'rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500';

/**
 * Estado documental agregado de una unidad: insignia con el semáforo del
 * documento más grave y, en el título, el nivel resultante.
 */
function InsigniaVencimiento({
  vencimiento,
  nivel,
}: {
  vencimiento: string | null;
  nivel: NivelAlerta;
}) {
  if (!vencimiento) return <Badge tono="neutro">Sin documentos</Badge>;
  const estado = estadoVencimiento(vencimiento);
  return (
    <span
      title={`Estado documental: ${ETIQUETA_NIVEL[nivel]}`}
      className={cn(
        'inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        estado.clases,
      )}
    >
      {estado.texto}
    </span>
  );
}

function tonoUnidad(estado: EstadoUnidad): Tono {
  // El kit no contempla «mantenimiento»; se pinta como advertencia.
  return estado === 'mantenimiento' ? 'aviso' : tonoDeEstado(estado);
}

function tonoMantenimiento(estado: Mantenimiento['estado']): Tono {
  if (estado === 'en_taller') return 'aviso';
  if (estado === 'programado') return 'info';
  return 'exito';
}

// ─────────────────────────────────────────────────────────────
// Lectura de la URL
// ─────────────────────────────────────────────────────────────
function valorUnico(valor: string | string[] | undefined): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const v = valor.trim();
  return v === '' ? undefined : v;
}

function unoDe<T extends string>(valor: string | undefined, permitidos: readonly T[]): T | undefined {
  if (!valor) return undefined;
  return permitidos.find((p) => p === valor);
}

function normalizarTab(valor: string | undefined): TabFlota {
  return valor === 'documentos' || valor === 'mantenimiento' ? valor : 'unidades';
}

// ─────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────
export default async function PaginaFlota({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Lo primero: sin permiso de lectura sobre flota no se sigue. Las pestañas
  // (`VistaUnidades`, `VistaDocumentos`, `VistaMantenimiento`) cuelgan de aquí,
  // así que esta única guarda las cubre a todas.
  const sesion = await requerirPermiso('flota');

  // Ver la flota no es poder tocarla: `despachador` y `gerencia` entran aquí en
  // modo consulta. El formulario de taller solo se pinta a quien puede editar.
  const puedeEditar = puede(sesion.rol, 'flota', 'editar');

  // En Next 16 `searchParams` es una Promesa: hay que esperarla siempre.
  const sp = await searchParams;
  const tab = normalizarTab(valorUnico(sp.tab));

  const flota = await kpisUnidades();
  const documentos = await kpisDocumentos();

  return (
    <>
      <EncabezadoPagina
        titulo="Flota"
        descripcion={
          <>
            Parque automotor, control legal de la documentación y órdenes de taller. Una
            unidad con documentación vencida queda marcada como no operable.
          </>
        }
        acciones={
          <>
            <Badge tono="info">
              <IconoFlota width={13} height={13} />
              {entero(flota.total)} unidades
            </Badge>
            {flota.noOperables > 0 ? (
              <Badge tono="peligro">
                <IconoAlerta width={13} height={13} />
                {entero(flota.noOperables)} no operables
              </Badge>
            ) : null}
            {documentos.vencidos > 0 ? (
              <Badge tono="aviso">
                {plural(documentos.vencidos, 'documento vencido', 'documentos vencidos')}
              </Badge>
            ) : null}
          </>
        }
      />

      {/* Pestañas: enlaces que cambian el query param, sin JavaScript de cliente. */}
      <nav
        aria-label="Secciones de flota"
        className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/50 p-1"
      >
        {TABS.map((t) => {
          const activa = t.id === tab;
          return (
            <Link
              key={t.id}
              href={`/flota?tab=${t.id}`}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                activa
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
              )}
            >
              {t.etiqueta}
            </Link>
          );
        })}
      </nav>

      {tab === 'unidades' ? (
        <VistaUnidades
          estado={valorUnico(sp.estado)}
          tipo={valorUnico(sp.tipo)}
          q={valorUnico(sp.q)}
        />
      ) : null}

      {tab === 'documentos' ? (
        <VistaDocumentos
          tipo={valorUnico(sp.tipoDoc)}
          nivel={valorUnico(sp.nivel)}
          q={valorUnico(sp.q)}
        />
      ) : null}

      {tab === 'mantenimiento' ? <VistaMantenimiento puedeEditar={puedeEditar} /> : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña: unidades
// ─────────────────────────────────────────────────────────────
async function VistaUnidades({ estado, tipo, q }: { estado?: string; tipo?: string; q?: string }) {
  const estadoFiltro = unoDe(estado, ESTADOS_UNIDAD);
  const tipoFiltro = unoDe(tipo, TIPOS_UNIDAD);
  const hayFiltros = Boolean(estadoFiltro ?? tipoFiltro ?? q);

  const kpis = await kpisUnidades();
  const unidades = await listarUnidades({
    estado: estadoFiltro ?? 'todas',
    tipo: tipoFiltro ?? 'todos',
    busqueda: q,
  });
  const noOperables = unidades.filter((u) => !u.operable).length;

  return (
    <>
      <RejillaKpi columnas={5}>
        <Kpi
          etiqueta="Unidades"
          valor={entero(kpis.total)}
          detalle={`${entero(kpis.noOperables)} con documentación vencida`}
          icono={<IconoFlota width={16} height={16} />}
          acento="slate"
        />
        <Kpi
          etiqueta="Disponibles"
          valor={entero(kpis.disponibles)}
          detalle="Listas para despachar"
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
        />
        <Kpi
          etiqueta="En ruta"
          valor={entero(kpis.enRuta)}
          detalle="Operando ahora mismo"
          icono={<IconoDespacho width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="En mantenimiento"
          valor={entero(kpis.enMantenimiento)}
          detalle="En taller o intervención"
          icono={<IconoHerramienta width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="Fuera de servicio"
          valor={entero(kpis.fueraServicio)}
          detalle="No disponibles para operar"
          icono={<IconoAlerta width={16} height={16} />}
          acento="rosa"
        />
      </RejillaKpi>

      <Card className="mt-4">
        <CardCabecera
          titulo="Parque automotor"
          descripcion="Capacidad, kilometraje, rendimiento esperado y estado documental de cada unidad."
          acciones={
            <>
              <span className="num text-xs text-slate-400">
                {plural(unidades.length, 'unidad', 'unidades')}
              </span>
              {noOperables > 0 ? (
                <Badge tono="peligro">
                  {plural(noOperables, 'no operable', 'no operables')}
                </Badge>
              ) : null}
            </>
          }
        />
        <CardCuerpo className="border-b border-slate-800">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="unidades" />
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Estado
              <select name="estado" defaultValue={estadoFiltro ?? 'todas'} className={CAMPO}>
                <option value="todas">Todos</option>
                {ESTADOS_UNIDAD.map((e) => (
                  <option key={e} value={e}>
                    {etiqueta(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tipo
              <select name="tipo" defaultValue={tipoFiltro ?? 'todos'} className={CAMPO}>
                <option value="todos">Todos</option>
                {TIPOS_UNIDAD.map((t) => (
                  <option key={t} value={t}>
                    {etiqueta(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Buscar
              <input
                name="q"
                defaultValue={q ?? ''}
                placeholder="Placa, marca o modelo…"
                className={CAMPO}
              />
            </label>
            <button type="submit" className={BOTON_PRIMARIO}>
              Filtrar
            </button>
            {hayFiltros ? (
              <Link
                href="/flota?tab=unidades"
                className="pb-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Limpiar
              </Link>
            ) : null}
          </form>
        </CardCuerpo>

        {unidades.length === 0 ? (
          <Vacio
            titulo="Sin unidades que coincidan"
            mensaje={
              hayFiltros
                ? 'Ajusta los filtros o limpia la búsqueda para ver todo el parque.'
                : 'Todavía no hay unidades registradas.'
            }
            icono={<IconoFlota width={22} height={22} />}
            accion={
              hayFiltros ? (
                <Link
                  href="/flota?tab=unidades"
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Limpiar filtros
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TablaCaja>
            <thead>
              <tr>
                <Th>Placa</Th>
                <Th>Tipo</Th>
                <Th>Marca / modelo</Th>
                <Th>Estado</Th>
                <Th alineacion="derecha">Capacidad</Th>
                <Th alineacion="derecha">Kilometraje</Th>
                <Th alineacion="derecha">Rendimiento</Th>
                <Th>Conductor fijo</Th>
                <Th>Documentación</Th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium text-slate-100">{u.placa}</Td>
                  <Td className="text-slate-400">{etiqueta(u.tipo)}</Td>
                  <Td>
                    <span className="text-slate-300">
                      {[u.marca, u.modelo].filter(Boolean).join(' ') || '—'}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {u.anio ? `Año ${u.anio}` : 'Año sin registro'}
                    </span>
                  </Td>
                  <Td>
                    <Badge tono={tonoUnidad(u.estado)}>{etiqueta(u.estado)}</Badge>
                  </Td>
                  <Td alineacion="derecha">
                    <span>{entero(u.capacidad_kg)} kg</span>
                    <span className="block text-[11px] text-slate-500">
                      {numero(u.capacidad_m3, 1)} m³
                    </span>
                  </Td>
                  <Td alineacion="derecha">{entero(u.km_actual)} km</Td>
                  <Td alineacion="derecha">
                    <span>{numero(u.rendimiento_esperado, 1)}</span>
                    <span className="block text-[11px] text-slate-500">
                      km/{empresa.unidadCombustible}
                    </span>
                  </Td>
                  <Td className="text-slate-400">{u.conductor ?? 'Sin asignar'}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InsigniaVencimiento
                        vencimiento={u.vencimiento_critico}
                        nivel={u.nivel_documental}
                      />
                      {!u.operable ? <Badge tono="peligro">No operable</Badge> : null}
                    </div>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {u.total_documentos > 0
                        ? `${plural(u.total_documentos, 'documento', 'documentos')}${
                            u.documentos_vencidos > 0
                              ? ` · ${entero(u.documentos_vencidos)} vencidos`
                              : ''
                          }`
                        : 'Sin documentación registrada'}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TablaCaja>
        )}
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña: documentos
// ─────────────────────────────────────────────────────────────
async function VistaDocumentos({ tipo, nivel, q }: { tipo?: string; nivel?: string; q?: string }) {
  const tipoFiltro = unoDe(tipo, TIPOS_DOCUMENTO);
  const nivelFiltro = unoDe(nivel, NIVELES);
  const hayFiltros = Boolean(tipoFiltro ?? nivelFiltro ?? q);

  const kpis = await kpisDocumentos();
  const documentos = await listarDocumentos({
    tipo: tipoFiltro ?? 'todos',
    nivel: nivelFiltro ?? 'todos',
    busqueda: q,
  });

  return (
    <>
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Vencidos"
          valor={entero(kpis.vencidos)}
          detalle={plural(kpis.unidadesAfectadas, 'unidad no operable', 'unidades no operables')}
          icono={<IconoAlerta width={16} height={16} />}
          acento="rosa"
        />
        <Kpi
          etiqueta="Críticos"
          valor={entero(kpis.criticos)}
          detalle={`Vencen en ${umbrales.critico} días o menos`}
          icono={<IconoReloj width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="Por vencer"
          valor={entero(kpis.porVencer)}
          detalle={`Hasta ${umbrales.preventivo} días de anticipación`}
          icono={<IconoDocumento width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Vigentes"
          valor={entero(kpis.vigentes)}
          detalle={`de ${plural(kpis.total, 'documento controlado', 'documentos controlados')}`}
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
        />
      </RejillaKpi>

      <Card className="mt-4">
        <CardCabecera
          titulo="Control legal y vencimientos"
          descripcion="SOAT, revisión técnico-mecánica, seguro, tarjeta de propiedad y permisos. Lo más urgente primero."
          acciones={
            <span className="num text-xs text-slate-400">
              {plural(documentos.length, 'documento', 'documentos')}
            </span>
          }
        />
        <CardCuerpo className="border-b border-slate-800">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="documentos" />
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Documento
              <select name="tipoDoc" defaultValue={tipoFiltro ?? 'todos'} className={CAMPO}>
                <option value="todos">Todos</option>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {etiqueta(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Alerta
              <select name="nivel" defaultValue={nivelFiltro ?? 'todos'} className={CAMPO}>
                <option value="todos">Todas</option>
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {ETIQUETA_NIVEL[n]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Buscar
              <input
                name="q"
                defaultValue={q ?? ''}
                placeholder="Placa, número o entidad…"
                className={CAMPO}
              />
            </label>
            <button type="submit" className={BOTON_PRIMARIO}>
              Filtrar
            </button>
            {hayFiltros ? (
              <Link
                href="/flota?tab=documentos"
                className="pb-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Limpiar
              </Link>
            ) : null}
          </form>
        </CardCuerpo>

        {documentos.length === 0 ? (
          <Vacio
            titulo="Sin documentos que coincidan"
            mensaje={
              hayFiltros
                ? 'Ningún documento cumple los filtros seleccionados.'
                : 'No hay documentación registrada para la flota.'
            }
            icono={<IconoDocumento width={22} height={22} />}
            accion={
              hayFiltros ? (
                <Link
                  href="/flota?tab=documentos"
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Limpiar filtros
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TablaCaja>
            <thead>
              <tr>
                <Th>Unidad</Th>
                <Th>Documento</Th>
                <Th>Entidad</Th>
                <Th>Número</Th>
                <Th>Emisión</Th>
                <Th>Vencimiento</Th>
                <Th alineacion="derecha">Días restantes</Th>
                <Th alineacion="derecha">Semáforo</Th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => {
                const estado = estadoVencimiento(d.vencimiento);
                return (
                  <Tr key={d.id}>
                    <Td>
                      <span className="font-medium text-slate-200">{d.placa}</span>
                      <span className="block text-[11px] text-slate-500">
                        {etiqueta(d.tipo_unidad)}
                      </span>
                    </Td>
                    <Td className="text-slate-300">{etiqueta(d.tipo)}</Td>
                    <Td className="text-slate-400">{d.entidad ?? '—'}</Td>
                    <Td className="text-slate-400">{d.numero ?? '—'}</Td>
                    <Td className="text-slate-400">{fechaCorta(d.emision)}</Td>
                    <Td className="text-slate-300">{fechaCorta(d.vencimiento)}</Td>
                    <Td alineacion="derecha">
                      <span style={{ color: estado.color }}>
                        {estado.dias > 0 ? `+${entero(estado.dias)}` : entero(estado.dias)}
                      </span>
                    </Td>
                    <Td alineacion="derecha">
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                          estado.clases,
                        )}
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Pestaña: mantenimiento
// ─────────────────────────────────────────────────────────────
async function VistaMantenimiento({ puedeEditar }: { puedeEditar: boolean }) {
  const kpis = await kpisMantenimiento();
  const ordenes = await listarMantenimientos();
  const ranking = await costoMantenimientoPorUnidad(10);
  const unidades = await unidadesParaSelect();

  return (
    <>
      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Costo total"
          valor={monedaCorta(kpis.costoTotal)}
          detalle={plural(kpis.ordenesCompletadas, 'orden completada', 'órdenes completadas')}
          icono={<IconoHerramienta width={16} height={16} />}
          acento="rosa"
        />
        <Kpi
          etiqueta="Costo por km del parque"
          valor={`${moneda(kpis.costoPorKm)} / km`}
          detalle={`Sobre ${entero(kpis.kmFlota)} km acumulados`}
          icono={<IconoFinanzas width={16} height={16} />}
          acento="ambar"
        />
        <Kpi
          etiqueta="Órdenes programadas"
          valor={entero(kpis.programadas)}
          detalle={plural(kpis.enTaller, 'orden abierta en taller', 'órdenes abiertas en taller')}
          icono={<IconoReloj width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Completadas"
          valor={entero(kpis.completadas90)}
          detalle="En los últimos 90 días"
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
        />
      </RejillaKpi>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardCabecera
            titulo="Registrar orden de taller"
            descripcion="Las órdenes en taller dejan la unidad en mantenimiento; al completarlas vuelve a disponible."
          />
          <CardCuerpo>
            {unidades.length === 0 ? (
              <Vacio
                titulo="Sin unidades registradas"
                mensaje="No se puede registrar una orden de taller sin unidades en el parque."
                icono={<IconoHerramienta width={22} height={22} />}
              />
            ) : puedeEditar ? (
              <form
                action={registrarMantenimiento}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
                  Unidad
                  <select name="unidadId" required defaultValue="" className={CAMPO}>
                    <option value="" disabled>
                      Selecciona una unidad…
                    </option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.placa} · {etiqueta(u.tipo)} · {etiqueta(u.estado)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Tipo
                  <select name="tipo" defaultValue="preventivo" className={CAMPO}>
                    <option value="preventivo">Preventivo</option>
                    <option value="correctivo">Correctivo</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Estado
                  <select name="estado" defaultValue="programado" className={CAMPO}>
                    <option value="programado">Programado</option>
                    <option value="en_taller">En taller</option>
                    <option value="completado">Completado</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
                  Descripción
                  <input
                    name="descripcion"
                    required
                    maxLength={300}
                    placeholder="Cambio de aceite y filtros"
                    className={CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Fecha
                  <input type="date" name="fecha" required defaultValue={hoyISO()} className={CAMPO} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Kilometraje
                  <input
                    type="number"
                    name="km"
                    min={0}
                    step={1}
                    placeholder="Opcional"
                    className={CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Costo
                  <input
                    type="number"
                    name="costo"
                    min={0}
                    step={1000}
                    defaultValue={0}
                    className={CAMPO}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Taller
                  <input
                    name="taller"
                    maxLength={120}
                    placeholder="Taller o proveedor"
                    className={CAMPO}
                  />
                </label>
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
                  <button type="submit" className={BOTON_PRIMARIO}>
                    Registrar orden
                  </button>
                  <span className="pb-1.5 text-[11px] text-slate-500">
                    El kilometraje y el taller son opcionales.
                  </span>
                </div>
              </form>
            ) : (
              <p className="text-sm text-slate-400">
                Solo lectura: tu perfil puede consultar el taller, pero no registrar órdenes.
              </p>
            )}
          </CardCuerpo>
        </Card>

        <Card>
          <CardCabecera
            titulo="Costo por unidad"
            descripcion="Órdenes completadas, de mayor a menor."
          />
          <CardCuerpo>
            {ranking.length === 0 ? (
              <Vacio
                titulo="Sin costos registrados"
                mensaje="Aún no hay órdenes completadas con costo."
                icono={<IconoFinanzas width={22} height={22} />}
              />
            ) : (
              <BarrasHorizontales
                datos={ranking.map((r) => ({
                  etiqueta: r.placa,
                  valor: Number(r.costo),
                  detalle: `${plural(Number(r.ordenes), 'orden', 'órdenes')} · ${monedaCorta(
                    r.costo,
                  )}`,
                }))}
              />
            )}
          </CardCuerpo>
        </Card>
      </div>

      <Card className="mt-4">
        <CardCabecera
          titulo="Órdenes de taller"
          descripcion="Historial completo del parque. Las órdenes programadas a futuro aparecen primero."
          acciones={
            <span className="num text-xs text-slate-400">
              {plural(ordenes.length, 'orden', 'órdenes')}
            </span>
          }
        />
        {ordenes.length === 0 ? (
          <Vacio
            titulo="Sin órdenes de taller"
            mensaje="Registra la primera orden con el formulario de arriba."
            icono={<IconoHerramienta width={22} height={22} />}
          />
        ) : (
          <TablaCaja>
            <thead>
              <tr>
                <Th>Unidad</Th>
                <Th>Tipo</Th>
                <Th>Descripción</Th>
                <Th>Fecha</Th>
                <Th alineacion="derecha">Kilometraje</Th>
                <Th>Taller</Th>
                <Th alineacion="derecha">Costo</Th>
                <Th>Estado</Th>
                <Th>Próxima</Th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <span className="font-medium text-slate-200">{m.placa}</span>
                    <span className="block text-[11px] text-slate-500">
                      {etiqueta(m.tipo_unidad)}
                    </span>
                  </Td>
                  <Td>
                    <Badge tono={m.tipo === 'correctivo' ? 'peligro' : 'info'}>
                      {etiqueta(m.tipo)}
                    </Badge>
                  </Td>
                  <Td className="max-w-64 truncate text-slate-400">{m.descripcion}</Td>
                  <Td className="text-slate-400">{fecha(m.fecha)}</Td>
                  <Td alineacion="derecha">
                    {m.km != null ? `${entero(m.km)} km` : '—'}
                  </Td>
                  <Td className="text-slate-400">{m.taller ?? '—'}</Td>
                  <Td alineacion="derecha" className="text-slate-200">
                    {moneda(m.costo)}
                  </Td>
                  <Td>
                    <Badge tono={tonoMantenimiento(m.estado)}>{etiqueta(m.estado)}</Badge>
                  </Td>
                  <Td className="text-slate-400">
                    {m.proxima_fecha || m.proximo_km != null ? (
                      <>
                        {m.proxima_fecha ? <span>{fechaCorta(m.proxima_fecha)}</span> : null}
                        {m.proximo_km != null ? (
                          <span className="block text-[11px] text-slate-500">
                            {entero(m.proximo_km)} km
                          </span>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TablaCaja>
        )}
      </Card>
    </>
  );
}
