import { Badge } from '@/components/ui/Badge';
import { Card, CardCabecera, CardCuerpo, RejillaKpi } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import {
  IconoAlerta,
  IconoCheck,
  IconoConductor,
  IconoEquis,
  IconoUsuario,
} from '@/components/ui/Iconos';
import { Kpi } from '@/components/ui/Kpi';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import {
  conductoresParaVincular,
  listarUsuarios,
  resumenUsuarios,
} from '@/db/queries/usuarios';
import { etiquetaRol, ROLES } from '@/lib/auth/permisos';
import { requerirPermiso, type Sesion } from '@/lib/auth/sesion';
import { fechaHora, entero } from '@/lib/format';
import { CampoClave } from '@/components/usuarios/CampoClave';
import { FormularioUsuario } from '@/components/usuarios/FormularioUsuario';
import {
  cambiarEstadoUsuario,
  cambiarRol,
  restablecerClave,
  vincularConductor,
} from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Usuarios',
};

/**
 * Gestión de cuentas y roles.
 *
 * Es la pantalla de quien administra el sistema: crear la cuenta de un
 * despachador, la de un conductor, cambiar una contraseña olvidada o quitarle el
 * acceso a alguien que ya no trabaja aquí.
 *
 * Solo la ve el rol `administracion`. Quien puede crear un administrador puede
 * hacerlo todo, así que este permiso no se delega.
 */

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

function primero(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor ?? undefined;
}

/** Traduce los avisos de la URL al mensaje que se enseña arriba. */
function avisoDe(sp: ParametrosBusqueda): { texto: string; clase: string } | null {
  const correo = primero(sp.creado);
  if (correo) {
    return {
      texto: `Cuenta creada para ${correo}. Entrégale la contraseña que hayas anotado: no se puede volver a ver.`,
      clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    };
  }

  const nombre = primero(sp['clave-de']);
  if (nombre) {
    return {
      texto: `Contraseña cambiada para ${nombre}. Se cerraron todas sus sesiones abiertas.`,
      clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    };
  }

  const nombreRol = primero(sp['rol-de']);
  if (nombreRol) {
    return {
      texto: `Rol actualizado para ${nombreRol}. El cambio se aplica en su siguiente petición.`,
      clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    };
  }

  if (sp.activado === '1') {
    return { texto: 'Cuenta activada.', clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' };
  }
  if (sp.desactivado === '1') {
    return {
      texto: 'Cuenta desactivada. Sus sesiones abiertas quedaron cerradas al instante.',
      clase: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    };
  }
  if (sp.vinculado === '1') {
    return {
      texto: 'Vínculo con la ficha del conductor actualizado.',
      clase: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    };
  }

  if (typeof sp.error === 'string') {
    const motivos: Record<string, string> = {
      datos: 'Faltan datos: hacen falta nombre, correo, rol y contraseña.',
      rol: 'Ese rol no existe.',
      correo: 'Ese correo no tiene forma de correo electrónico.',
      clave: 'La contraseña debe tener al menos 8 caracteres.',
      duplicado: 'Ya hay una cuenta con ese correo electrónico.',
      usuario: 'Esa cuenta no existe.',
      'no-conductor': 'Solo se puede vincular una ficha a una cuenta con rol Conductor.',
      'mismo-rol': 'Esa cuenta ya tiene ese rol.',
      'yo-mismo': 'No puedes desactivar tu propia cuenta: te quedarías fuera.',
      'ultimo-admin':
        'Esa operación dejaría la aplicación sin ningún administrador activo, y ya no habría quien pudiera gestionar cuentas.',
    };
    return {
      texto: motivos[sp.error] ?? 'No se pudo completar la operación.',
      clase: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    };
  }

  return null;
}

const TONO_ROL: Record<string, 'violeta' | 'info' | 'exito' | 'neutro'> = {
  administracion: 'violeta',
  despachador: 'info',
  conductor: 'exito',
  gerencia: 'neutro',
};

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const sesion: Sesion = await requerirPermiso('usuarios');
  const sp = await searchParams;

  const [usuarios, resumen, conductores] = await Promise.all([
    listarUsuarios(),
    resumenUsuarios(),
    conductoresParaVincular(),
  ]);

  const aviso = avisoDe(sp);

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios y permisos"
        descripcion="Crea las cuentas, asígnales su rol y quita el acceso a quien ya no lo necesita. El rol decide qué ve cada persona; la matriz está en src/lib/auth/permisos.ts."
      />

      {aviso ? (
        <p
          role="status"
          className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${aviso.clase}`}
        >
          <IconoCheck width={16} height={16} className="mt-0.5 shrink-0" />
          {aviso.texto}
        </p>
      ) : null}

      <RejillaKpi columnas={4}>
        <Kpi
          etiqueta="Cuentas"
          valor={entero(resumen.total)}
          detalle={`${entero(resumen.activos)} activas`}
          icono={<IconoUsuario width={16} height={16} />}
          acento="cielo"
        />
        <Kpi
          etiqueta="Administradores"
          valor={entero(resumen.administradores)}
          detalle="Pueden gestionar cuentas"
          icono={<IconoCheck width={16} height={16} />}
          acento="violeta"
        />
        <Kpi
          etiqueta="Conductores"
          valor={entero(usuarios.filter((u) => u.rol === 'conductor').length)}
          detalle="Cuentas con rol de reparto"
          icono={<IconoConductor width={16} height={16} />}
          acento="esmeralda"
        />
        <Kpi
          etiqueta="Sin ficha vinculada"
          valor={entero(resumen.conductoresSinVincular)}
          detalle="Al entrar no encontrarán su ruta"
          icono={<IconoAlerta width={16} height={16} />}
          acento={resumen.conductoresSinVincular > 0 ? 'ambar' : 'esmeralda'}
        />
      </RejillaKpi>

      {/* ── Alta de una cuenta ──────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Crear una cuenta"
          descripcion="La persona entra con el correo y la contraseña que le entregues."
        />
        <CardCuerpo>
          <FormularioUsuario conductores={conductores} />
        </CardCuerpo>
      </Card>

      {/* ── Cuentas existentes ──────────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Cuentas"
          descripcion="Desactivar cierra sus sesiones en el acto. No se borran cuentas: se perdería el rastro de quién registró cada pedido y quién subió cada foto de entrega."
          acciones={<span className="num text-xs text-slate-400">{entero(usuarios.length)}</span>}
        />
        <CardCuerpo>
          <TablaCaja>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Último acceso</Th>
                <Th alineacion="derecha">Sesiones</Th>
                <Th>Ficha de conductor</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esUnoMismo = u.id === sesion.usuarioId;

                return (
                  <Tr key={u.id}>
                    <Td>
                      <span className="block text-slate-200">
                        {u.nombre}
                        {esUnoMismo ? (
                          <span className="ml-1.5 text-[11px] text-sky-300">(tú)</span>
                        ) : null}
                      </span>
                      <span className="block text-[11px] text-slate-500">{u.email}</span>
                    </Td>
                    <Td>
                      <Badge tono={TONO_ROL[u.rol] ?? 'neutro'}>{etiquetaRol(u.rol)}</Badge>
                    </Td>
                    <Td>
                      {u.activo ? (
                        <Badge tono="exito">Activa</Badge>
                      ) : (
                        <Badge tono="peligro">Desactivada</Badge>
                      )}
                    </Td>
                    <Td className="text-slate-400">
                      {u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'Nunca ha entrado'}
                    </Td>
                    <Td alineacion="derecha" className="num text-slate-400">
                      {u.sesiones > 0 ? (
                        <span className="text-sky-300">{entero(u.sesiones)}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </Td>
                    <Td className="text-slate-400">
                      {u.rol === 'conductor' ? (
                        u.conductor ? (
                          <span className="text-slate-300">{u.conductor}</span>
                        ) : (
                          <span className="text-amber-300">Sin vincular</span>
                        )
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </Td>
                    <Td alineacion="derecha">
                      <div className="flex flex-col items-end gap-2">
                        <form action={cambiarEstadoUsuario}>
                          <input type="hidden" name="usuarioId" value={u.id} />
                          <input
                            type="hidden"
                            name="accion"
                            value={u.activo ? 'desactivar' : 'activar'}
                          />
                          <button
                            type="submit"
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                              u.activo
                                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                            }`}
                          >
                            {u.activo ? (
                              <>
                                <IconoEquis width={12} height={12} />
                                Desactivar
                              </>
                            ) : (
                              <>
                                <IconoCheck width={12} height={12} />
                                Activar
                              </>
                            )}
                          </button>
                        </form>

                        <details className="w-64 text-left">
                          <summary className="cursor-pointer text-[11px] text-sky-400 hover:text-sky-300">
                            Rol, contraseña y ficha
                          </summary>

                          <div className="mt-2 space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                            <form
                              action={cambiarRol}
                              className="space-y-2 border-b border-slate-800 pb-3"
                            >
                              <input type="hidden" name="usuarioId" value={u.id} />
                              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                                Rol
                                <select
                                  name="rol"
                                  defaultValue={u.rol}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                                >
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {etiquetaRol(r)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="submit"
                                className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                              >
                                Guardar el rol
                              </button>
                            </form>

                            <form action={restablecerClave} className="space-y-2">
                              <input type="hidden" name="usuarioId" value={u.id} />
                              <CampoClave
                                etiqueta="Nueva contraseña"
                                ayuda="Se cerrarán todas sus sesiones abiertas."
                              />
                              <button
                                type="submit"
                                className="w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                              >
                                Cambiar la contraseña
                              </button>
                            </form>

                            {u.rol === 'conductor' ? (
                              <form
                                action={vincularConductor}
                                className="space-y-2 border-t border-slate-800 pt-3"
                              >
                                <input type="hidden" name="usuarioId" value={u.id} />
                                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                                  Ficha del conductor
                                  <select
                                    name="conductorId"
                                    defaultValue={u.conductor_id ?? ''}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                                  >
                                    <option value="">Sin vincular</option>
                                    {conductores.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.nombre}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  type="submit"
                                  className="w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                                >
                                  Guardar el vínculo
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TablaCaja>
        </CardCuerpo>
      </Card>

      {/* ── Qué puede hacer cada rol ────────────────────────── */}
      <Card className="mt-4">
        <CardCabecera
          titulo="Qué ve cada rol"
          descripcion="Resumen de la matriz de permisos. Es orientativo: quien decide de verdad es la guarda de cada página y de cada acción."
        />
        <CardCuerpo>
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <dt className="mb-1 flex items-center gap-2">
                <Badge tono="violeta">Administración</Badge>
              </dt>
              <dd className="leading-relaxed text-slate-400">
                Todo, incluida esta pantalla. Es el único rol que puede crear cuentas y cambiar
                roles.
              </dd>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <dt className="mb-1 flex items-center gap-2">
                <Badge tono="info">Despacho</Badge>
              </dt>
              <dd className="leading-relaxed text-slate-400">
                Pedidos, rutas, entregas, flota y conductores. Sin acceso a nada de dinero.
              </dd>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <dt className="mb-1 flex items-center gap-2">
                <Badge tono="exito">Conductor</Badge>
              </dt>
              <dd className="leading-relaxed text-slate-400">
                Solo su ruta del día y su GPS. Necesita la ficha vinculada para encontrar sus
                despachos.
              </dd>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <dt className="mb-1 flex items-center gap-2">
                <Badge tono="neutro">Gerencia</Badge>
              </dt>
              <dd className="leading-relaxed text-slate-400">
                Consulta todos los módulos, pero no modifica nada. Tampoco gestiona cuentas.
              </dd>
            </div>
          </dl>
        </CardCuerpo>
      </Card>
    </>
  );
}
