import Link from 'next/link';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import {
  IconoAlerta,
  IconoCheck,
  IconoConductor,
  IconoReloj,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { Progreso } from '@/components/ui/Progreso';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import {
  kpisConductores,
  listarConductores,
  type ConductorDesempeno,
} from '@/db/queries/conductores';
import type { Conductor } from '@/db/tipos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { estadoVencimiento, esOperable } from '@/lib/domain';
import {
  entero,
  etiqueta,
  fecha,
  fechaCorta,
  hoyISO,
  moneda,
  porcentaje,
} from '@/lib/format';
import { nombreMes, rangoMes } from '@/lib/periodos';

// La plantilla cambia con cada contratación y cada vencimiento: sin caché.
export const dynamic = 'force-dynamic';

/** Clases compartidas por los campos del formulario de filtros. */
const CAMPO =
  'rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';
const BOTON =
  'rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500';

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

function texto(sp: ParametrosBusqueda, clave: string): string | undefined {
  const valor = sp[clave];
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = v?.trim();
  return limpio ? limpio : undefined;
}

export default async function PaginaConductores({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  // Lo primero: sin permiso de lectura sobre conductores no se sigue.
  const sesion = await requerirPermiso('conductores');

  // En Next 16 `searchParams` es una Promesa: hay que esperarla siempre.
  const sp = await searchParams;
  const tipoVinculacion = texto(sp, 'tipo');
  const estado = texto(sp, 'estado');
  const q = texto(sp, 'q');

  const rango = rangoMes();
  const kpis = await kpisConductores();
  const conductores = await listarConductores(
    {
      tipoVinculacion: tipoVinculacion as Conductor['tipo_vinculacion'] | 'todas' | undefined,
      estado: estado as Conductor['estado'] | 'todos' | undefined,
      busqueda: q,
      limite: 300,
    },
    rango,
  );

  const hayFiltros = Boolean(tipoVinculacion || estado || q);

  // Semáforo de licencia. Ordenado por urgencia: primero lo vencido.
  const conSemaforo = conductores.map((c) => ({
    conductor: c,
    licencia: estadoVencimiento(c.licencia_vencimiento),
  }));
  const alertas = conSemaforo
    .filter((x) => x.conductor.licencia_vencimiento && x.licencia.nivel !== 'vigente')
    .sort((a, b) => a.licencia.dias - b.licencia.dias);
  const noOperables = alertas.filter((x) => !esOperable(x.licencia.nivel)).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Conductores"
        descripcion={
          <>
            Plantilla de reparto: vinculación, documentación de licencia y desempeño del mes.
            El desempeño se calcula sobre las rutas asignadas en el período, sin contar las
            canceladas.
          </>
        }
        acciones={
          <>
            <Badge tono="info">{nombreMes()}</Badge>
            <Link
              href="/liquidaciones"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Ver liquidaciones
            </Link>
          </>
        }
      />

      {/* ── Indicadores de la plantilla ───────────────────────── */}
      <RejillaKpi columnas={5}>
        <Kpi
          etiqueta="Conductores"
          valor={entero(kpis.total)}
          detalle={`${entero(kpis.activos)} activos en operación`}
          icono={<IconoConductor width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Activos"
          valor={entero(kpis.activos)}
          detalle={`${entero(kpis.total - kpis.activos)} inactivos, en vacaciones o incapacidad`}
          icono={<IconoCheck width={16} height={16} />}
          acento="esmeralda"
          pie={
            <Progreso
              valor={kpis.total > 0 ? (kpis.activos / kpis.total) * 100 : 0}
              mostrarTexto
            />
          }
        />
        <Kpi
          etiqueta="Contratistas"
          valor={entero(kpis.contratistas)}
          detalle="Cobran comisión sobre los ingresos de sus rutas"
          acento="violeta"
        />
        <Kpi
          etiqueta="Empleados"
          valor={entero(kpis.empleados)}
          detalle="Devengan salario base semanal"
          acento="slate"
        />
        <Kpi
          etiqueta="Licencias vencidas o por vencer"
          valor={entero(kpis.licenciasAlerta)}
          detalle={`${entero(kpis.licenciasVencidas)} ya vencidas · ventana de 30 días`}
          icono={<IconoAlerta width={16} height={16} />}
          acento={kpis.licenciasAlerta > 0 ? 'ambar' : 'esmeralda'}
        />
      </RejillaKpi>

      {/* ── Alerta de licencias ───────────────────────────────── */}
      {alertas.length === 0 ? (
        <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5">
          <CardCuerpo className="flex items-center gap-3">
            <span className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300">
              <IconoCheck width={18} height={18} />
            </span>
            <div>
              <p className="text-sm font-medium text-emerald-200">
                Ninguna licencia vencida o por vencer
              </p>
              <p className="text-xs text-emerald-300/70">
                Toda la plantilla tiene la licencia vigente más allá de los próximos 30 días.
              </p>
            </div>
          </CardCuerpo>
        </Card>
      ) : (
        <Card className="mt-4 border-rose-500/30 bg-rose-500/5">
          <CardCabecera
            titulo={
              <span className="flex items-center gap-2 text-rose-200">
                <IconoAlerta width={16} height={16} />
                Licencias vencidas o por vencer
              </span>
            }
            descripcion={
              <>
                {entero(alertas.length)} conductores requieren gestión de documentación.
                {noOperables > 0 ? (
                  <>
                    {' '}
                    <strong className="font-semibold text-rose-200">
                      {noOperables === 1
                        ? '1 conductor tiene la licencia vencida y no puede operar'
                        : `${entero(noOperables)} conductores tienen la licencia vencida y no pueden operar`}
                    </strong>{' '}
                    hasta que la renueven: asignarles una ruta deja la operación sin respaldo
                    legal y expone a la empresa ante una autoridad de tránsito.
                  </>
                ) : (
                  ' Ninguno está vencido todavía, pero conviene agendar la renovación.'
                )}
              </>
            }
            acciones={<Badge tono={noOperables > 0 ? 'peligro' : 'aviso'}>30 días</Badge>}
          />
          <TablaCaja>
            <thead>
              <tr>
                <Th>Conductor</Th>
                <Th>Categoría</Th>
                <Th>Número de licencia</Th>
                <Th>Vence</Th>
                <Th alineacion="derecha">Días restantes</Th>
                <Th alineacion="derecha">Estado</Th>
              </tr>
            </thead>
            <tbody>
              {alertas.map(({ conductor, licencia }) => (
                <Tr key={conductor.id}>
                  <Td>
                    <Link
                      href={`/liquidaciones?conductor=${conductor.id}`}
                      className="font-medium text-slate-200 hover:text-sky-300"
                    >
                      {conductor.nombre}
                    </Link>
                    <span className="block text-[11px] text-slate-500">
                      {conductor.codigo} · {etiqueta(conductor.tipo_vinculacion)}
                    </span>
                  </Td>
                  <Td>
                    <Badge tono="neutro">{conductor.licencia_categoria ?? '—'}</Badge>
                  </Td>
                  <Td className="num text-slate-400">{conductor.numero_licencia ?? '—'}</Td>
                  <Td className="text-slate-400">{fecha(conductor.licencia_vencimiento)}</Td>
                  <Td alineacion="derecha">
                    <span className={licencia.dias < 0 ? 'text-rose-300' : 'text-amber-300'}>
                      {licencia.dias < 0
                        ? `Venció hace ${entero(Math.abs(licencia.dias))} d`
                        : licencia.dias === 0
                          ? 'Vence hoy'
                          : `${entero(licencia.dias)} d`}
                    </span>
                  </Td>
                  <Td alineacion="derecha">
                    <span
                      className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${licencia.clases}`}
                    >
                      {licencia.texto}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TablaCaja>
        </Card>
      )}

      {/* ── Filtros ───────────────────────────────────────────── */}
      <Card className="mt-4">
        <CardCuerpo>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Vinculación
              <select name="tipo" defaultValue={tipoVinculacion ?? 'todas'} className={CAMPO}>
                <option value="todas">Todas</option>
                <option value="contratista">Contratistas</option>
                <option value="empleado">Empleados</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Estado
              <select name="estado" defaultValue={estado ?? 'todos'} className={CAMPO}>
                <option value="todos">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="vacaciones">Vacaciones</option>
                <option value="incapacidad">Incapacidad</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Buscar
              <input
                name="q"
                defaultValue={q ?? ''}
                placeholder="Nombre o documento…"
                className={`${CAMPO} w-56`}
              />
            </label>
            <button type="submit" className={BOTON}>
              Filtrar
            </button>
            {hayFiltros ? (
              <Link href="/conductores" className="text-xs text-slate-400 hover:text-slate-200">
                Limpiar
              </Link>
            ) : null}
            <span className="num ml-auto text-xs text-slate-500">
              {entero(conductores.length)} de {entero(kpis.total)}
            </span>
          </form>
        </CardCuerpo>
      </Card>

      {/* ── Tabla de la plantilla ─────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Plantilla de reparto"
          descripcion={`Desempeño de ${nombreMes().toLowerCase()} y documentación vigente.`}
        />
        <CardCuerpo className="px-0 py-0">
          {conductores.length === 0 ? (
            <Vacio
              titulo="Sin conductores que coincidan"
              mensaje="Ajusta el tipo de vinculación, el estado o el texto de búsqueda."
              icono={<IconoConductor width={22} height={22} />}
              accion={
                <Link
                  href="/conductores"
                  className="text-xs text-sky-400 hover:text-sky-300"
                >
                  Limpiar filtros
                </Link>
              }
            />
          ) : (
            <TablaCaja>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Conductor</Th>
                  <Th>Documento</Th>
                  <Th>Teléfono</Th>
                  <Th>Vinculación</Th>
                  <Th>Licencia</Th>
                  <Th>Estado</Th>
                  <Th alineacion="derecha">Comisión / salario</Th>
                  <Th>Ingreso</Th>
                  <Th alineacion="derecha">Rutas</Th>
                  <Th alineacion="derecha">Entregados</Th>
                  <Th alineacion="derecha">Novedades</Th>
                  <Th alineacion="derecha">Cumplim.</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {conductores.map((c) => (
                  <FilaConductor key={c.id} conductor={c} />
                ))}
              </tbody>
            </TablaCaja>
          )}
        </CardCuerpo>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-500">
          <IconoReloj width={13} height={13} />
          <span>
            Licencias evaluadas al {fecha(hoyISO())} · desempeño del {fechaCorta(rango.desde)} al{' '}
            {fechaCorta(rango.hasta)}.
          </span>
          <span className="text-slate-600">
            Un conductor con la licencia vencida no puede operar.
          </span>
        </div>
      </Card>
    </>
  );
}

/** Fila de la plantilla. Se aísla para poder calcular el semáforo por fila. */
function FilaConductor({ conductor: c }: { conductor: ConductorDesempeno }) {
  const licencia = estadoVencimiento(c.licencia_vencimiento);
  const sinLicencia = !c.licencia_vencimiento;
  const contratista = c.tipo_vinculacion === 'contratista';

  return (
    <Tr>
      <Td className="num text-slate-400">{c.codigo}</Td>
      <Td>
        <Link
          href={`/liquidaciones?conductor=${c.id}`}
          className="font-medium text-slate-200 hover:text-sky-300"
        >
          {c.nombre}
        </Link>
        {c.email ? (
          <span className="block max-w-48 truncate text-[11px] text-slate-500">{c.email}</span>
        ) : null}
      </Td>
      <Td className="num text-slate-400">{c.documento}</Td>
      <Td className="num text-slate-400">{c.telefono ?? '—'}</Td>
      <Td>
        <Badge tono={contratista ? 'violeta' : 'info'}>
          {etiqueta(c.tipo_vinculacion)}
        </Badge>
      </Td>
      <Td>
        <span className="text-slate-300">{c.licencia_categoria ?? '—'}</span>
        <span className="num block text-[11px] text-slate-500">
          {c.numero_licencia ?? 'Sin número'}
        </span>
        {sinLicencia ? (
          <Badge tono="peligro" className="mt-1">
            Sin licencia registrada
          </Badge>
        ) : (
          <span
            className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${licencia.clases}`}
          >
            {licencia.texto}
          </span>
        )}
      </Td>
      <Td>
        <BadgeEstado estado={c.estado} texto={etiqueta(c.estado)} />
      </Td>
      <Td alineacion="derecha" className="text-slate-200">
        {contratista ? `${porcentaje(c.comision_pct, 1)} de comisión` : moneda(c.salario_base)}
        <span className="block text-[11px] font-normal text-slate-500">
          {contratista ? 'sobre ingresos entregados' : 'salario base mensual'}
        </span>
      </Td>
      <Td className="text-slate-400">{fecha(c.fecha_ingreso)}</Td>
      <Td alineacion="derecha">{entero(c.rutas)}</Td>
      <Td alineacion="derecha">{entero(c.entregados)}</Td>
      <Td alineacion="derecha">
        {c.novedades > 0 ? (
          <span className="text-amber-300">{entero(c.novedades)}</span>
        ) : (
          <span className="text-slate-500">0</span>
        )}
      </Td>
      <Td alineacion="derecha">
        {c.envios > 0 ? (
          <span
            className={
              c.cumplimiento >= 90
                ? 'text-emerald-300'
                : c.cumplimiento >= 75
                  ? 'text-amber-300'
                  : 'text-rose-300'
            }
          >
            {porcentaje(c.cumplimiento, 0)}
          </span>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </Td>
      <Td alineacion="derecha">
        <Link
          href={`/liquidaciones?conductor=${c.id}`}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          Liquidaciones →
        </Link>
      </Td>
    </Tr>
  );
}
