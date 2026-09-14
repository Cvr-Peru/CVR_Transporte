import Link from 'next/link';
import { Card, CardCabecera, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta, IconoDespacho } from '@/components/ui/Iconos';
import { Badge, BadgeEstado } from '@/components/ui/Badge';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import {
  clientesActivos,
  conductoresAsignables,
  unidadesAsignables,
} from '@/db/queries/despachos';
import { documentosPorVencer } from '@/db/queries/dashboard';
import { requerirPermiso } from '@/lib/auth/sesion';
import { entero, etiqueta, hoyISO, numero } from '@/lib/format';
import { ZONAS } from '@/lib/zonas';
import { crearDespacho } from '../actions';

export const dynamic = 'force-dynamic';

const CLASE_CAMPO =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200';

export default async function PaginaNuevoDespacho() {
  await requerirPermiso('despachos', 'editar');

  const unidades = await unidadesAsignables();
  const conductores = await conductoresAsignables();
  const clientes = await clientesActivos();

  // Unidades con documentación vencida: no deberían salir a operar.
  const placasNoOperables = new Set(
    (await documentosPorVencer(0, 500))
      .filter((d) => d.vencimiento < hoyISO())
      .map((d) => d.placa),
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo despacho"
        descripcion="Crea una hoja de ruta con sus paradas y los envíos asociados. Se genera en estado planificado, lista para asignar y arrancar."
        acciones={
          <Link
            href="/despachos"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver a despachos
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Formulario ──────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardCabecera
            titulo="Datos de la hoja de ruta"
            descripcion="Las paradas se distribuyen dentro del área de la zona elegida y se ordenan por cercanía."
          />
          <CardCuerpo>
            <form action={crearDespacho} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Fecha del despacho
                  <input type="date" name="fecha" defaultValue={hoyISO()} className={CLASE_CAMPO} />
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Zona de reparto
                  <select name="zona" defaultValue={ZONAS[0].nombre} className={CLASE_CAMPO}>
                    {ZONAS.map((z) => (
                      <option key={z.nombre} value={z.nombre}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Unidad asignada
                  <select name="unidadId" defaultValue="" className={CLASE_CAMPO}>
                    <option value="">Sin asignar por ahora</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.placa} · {etiqueta(u.tipo)} · {entero(u.capacidad_kg)} kg
                        {placasNoOperables.has(u.placa) ? '  ⚠ documentación vencida' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Conductor asignado
                  <select name="conductorId" defaultValue="" className={CLASE_CAMPO}>
                    <option value="">Sin asignar por ahora</option>
                    {conductores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} · {etiqueta(c.tipo_vinculacion)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Cliente que contrata el servicio
                  <select name="clienteId" defaultValue={clientes[0]?.id ?? ''} className={CLASE_CAMPO}>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Número de paradas
                  <input
                    type="number"
                    name="numParadas"
                    min={1}
                    max={12}
                    defaultValue={8}
                    className={CLASE_CAMPO}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Notas de la ruta (opcional)
                <textarea
                  name="notas"
                  rows={2}
                  placeholder="Instrucciones para el conductor, restricciones de tránsito, horarios del cliente…"
                  className={CLASE_CAMPO}
                />
              </label>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                >
                  Crear despacho
                </button>
                <Link
                  href="/despachos"
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Link>
                <p className="text-[11px] text-slate-500">
                  Se creará un envío por parada, con el flete calculado según la tarifa del
                  cliente.
                </p>
              </div>
            </form>
          </CardCuerpo>
        </Card>

        {/* ── Contexto para decidir bien ──────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardCabecera
              titulo="Disponibilidad de la flota"
              descripcion="Unidades que pueden recibir un despacho"
            />
            <CardCuerpo className="px-0 py-0">
              {unidades.length === 0 ? (
                <Vacio titulo="No hay unidades disponibles" />
              ) : (
                <TablaCaja>
                  <thead>
                    <tr>
                      <Th>Placa</Th>
                      <Th>Tipo</Th>
                      <Th alineacion="derecha">Capacidad</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unidades.slice(0, 12).map((u) => {
                      const noOperable = placasNoOperables.has(u.placa);
                      return (
                        <Tr key={u.id}>
                          <Td>
                            <span className="font-medium text-slate-200">{u.placa}</span>
                            {noOperable ? (
                              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-rose-300">
                                <IconoAlerta width={11} height={11} />
                                Docs. vencidos
                              </span>
                            ) : null}
                          </Td>
                          <Td className="text-slate-400">{etiqueta(u.tipo)}</Td>
                          <Td alineacion="derecha" className="text-slate-400">
                            {numero(u.capacidad_kg, 0)} kg
                          </Td>
                          <Td>
                            <BadgeEstado estado={u.estado} texto={etiqueta(u.estado)} />
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </TablaCaja>
              )}
            </CardCuerpo>
          </Card>

          <Card>
            <CardCabecera titulo="Conductores activos" descripcion="Personal habilitado para reparto" />
            <CardCuerpo className="px-0 py-0">
              {conductores.length === 0 ? (
                <Vacio titulo="No hay conductores activos" />
              ) : (
                <TablaCaja>
                  <thead>
                    <tr>
                      <Th>Conductor</Th>
                      <Th>Vinculación</Th>
                      <Th alineacion="derecha">Comisión</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {conductores.slice(0, 12).map((c) => (
                      <Tr key={c.id}>
                        <Td className="text-slate-200">{c.nombre}</Td>
                        <Td className="text-slate-400">{etiqueta(c.tipo_vinculacion)}</Td>
                        <Td alineacion="derecha">
                          {c.tipo_vinculacion === 'contratista' ? (
                            <Badge tono="violeta">{numero(c.comision_pct, 1)}%</Badge>
                          ) : (
                            <span className="text-slate-500">Salario fijo</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </TablaCaja>
              )}
            </CardCuerpo>
          </Card>

          <Card>
            <CardCuerpo className="flex gap-2.5 text-xs text-slate-400">
              <IconoDespacho width={16} height={16} className="mt-0.5 shrink-0 text-sky-400" />
              <p>
                Tras crearlo podrás iniciar la ruta y registrar cada entrega con su prueba de
                entrega desde el detalle del despacho.
              </p>
            </CardCuerpo>
          </Card>
        </div>
      </div>
    </>
  );
}
