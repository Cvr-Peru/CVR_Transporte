import Link from 'next/link';
import { Card, CardCuerpo } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta, IconoMapa } from '@/components/ui/Iconos';
import { CompartirUbicacion } from '@/components/ubicacion/CompartirUbicacion';
import { all, get } from '@/db/client';
import { puedeCompartirUbicacion } from '@/lib/auth/permisos';
import { requerirSesion } from '@/lib/auth/sesion';
import { hoyISO } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mi ubicación',
};

/**
 * Pantalla para que el conductor comparta el GPS de su teléfono.
 *
 * Es la pieza que faltaba para que el mapa deje de ser una simulación: al abrir
 * esto en el móvil y dar permiso, la unidad aparece en `/rastreo` con su
 * posición real.
 */
export default async function PaginaMiUbicacion() {
  const sesion = await requerirSesion();

  if (!puedeCompartirUbicacion(sesion)) {
    return (
      <>
        <EncabezadoPagina
          titulo="Mi ubicación"
          descripcion="Comparte la posición de tu vehículo con la central."
        />
        <Card className="border-amber-500/30">
          <CardCuerpo className="flex items-start gap-3">
            <IconoAlerta width={18} height={18} className="mt-0.5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-200">Esta pantalla no es para tu perfil</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Está pensada para que un conductor comparta el GPS de su teléfono. Tu perfil es de
                consulta: puedes ver todas las unidades en{' '}
                <Link href="/rastreo" className="text-sky-400 hover:text-sky-300">
                  rastreo en vivo
                </Link>
                .
              </p>
            </div>
          </CardCuerpo>
        </Card>
      </>
    );
  }

  const esConductor = sesion.rol === 'conductor';

  // Ruta en curso: la del conductor, o la primera disponible si quien entra es
  // de administración o despacho y solo está probando la integración.
  const ruta = esConductor
    ? await get<{ id: number; codigo: string; unidad_id: number | null; placa: string | null }>(
        `SELECT r.id, r.codigo, r.unidad_id, u.placa
         FROM rutas r
         LEFT JOIN unidades u ON u.id = r.unidad_id
         WHERE r.conductor_id = $1 AND r.estado = 'en_curso'
         ORDER BY r.id DESC LIMIT 1`,
        sesion.conductorId,
      )
    : await get<{ id: number; codigo: string; unidad_id: number | null; placa: string | null }>(
        `SELECT r.id, r.codigo, r.unidad_id, u.placa
         FROM rutas r
         LEFT JOIN unidades u ON u.id = r.unidad_id
         WHERE r.estado = 'en_curso'
         ORDER BY r.fecha DESC, r.id DESC LIMIT 1`,
      );

  // Siguiente parada pendiente: sirve para ofrecer una ubicación de prueba
  // dentro de la zona, útil cuando se enseña el sistema desde otro país.
  const parada = ruta
    ? await get<{ lat: number; lng: number; direccion: string }>(
        `SELECT lat, lng, direccion FROM paradas
         WHERE ruta_id = $1 AND estado IN ('pendiente','en_camino')
         ORDER BY orden LIMIT 1`,
        ruta.id,
      )
    : null;

  const motivoBloqueo = !ruta
    ? esConductor
      ? 'No tienes ninguna hoja de ruta en curso. Pide a despacho que la inicie y vuelve a entrar aquí.'
      : 'No hay ninguna ruta en curso en este momento. Inicia una desde Despachos para probar la integración.'
    : ruta.unidad_id === null
      ? 'Tu hoja de ruta no tiene vehículo asignado, así que no hay dónde registrar la posición.'
      : null;

  // Cuántas posiciones ha reportado ya esta unidad desde un dispositivo real.
  const reportadas = ruta?.unidad_id
    ? Number(
        (
          await all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM posiciones
             WHERE unidad_id = $1 AND origen = 'dispositivo' AND substr(timestamp, 1, 10) = $2`,
            ruta.unidad_id,
            hoyISO(),
          )
        )[0]?.n ?? 0,
      )
    : 0;

  return (
    <>
      <EncabezadoPagina
        titulo="Mi ubicación"
        descripcion="Comparte la posición de tu vehículo con la central. Aparecerá en el mapa de rastreo como cualquier otra unidad."
        acciones={
          <Link
            href="/rastreo"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            <IconoMapa width={15} height={15} />
            Ver el mapa
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CompartirUbicacion
            destino={
              parada ? { lat: Number(parada.lat), lng: Number(parada.lng), direccion: parada.direccion } : null
            }
            rutaCodigo={ruta?.codigo ?? null}
            placa={ruta?.placa ?? null}
            motivoBloqueo={motivoBloqueo}
            unidadId={esConductor ? null : (ruta?.unidad_id ?? null)}
          />
        </div>

        <div className="space-y-4">
          {!esConductor && ruta ? (
            <Card className="border-amber-500/30">
              <CardCuerpo className="flex items-start gap-3">
                <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0 text-amber-300" />
                <div>
                  <p className="text-xs font-medium text-amber-200">Estás probando la integración</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Como tu perfil no es de conductor, la posición se registrará sobre la unidad{' '}
                    <span className="text-slate-300">{ruta.placa}</span> de la ruta{' '}
                    <span className="text-slate-300">{ruta.codigo}</span>. En producción, cada
                    conductor reporta sobre la suya y no puede elegir otra.
                  </p>
                </div>
              </CardCuerpo>
            </Card>
          ) : null}

          <Card>
            <CardCuerpo className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Cómo funciona</h2>
              <ol className="space-y-2 text-xs leading-relaxed text-slate-400">
                <li>
                  <span className="text-slate-300">1.</span> Pulsa «Compartir mi ubicación» y acepta
                  el permiso que pide el navegador.
                </li>
                <li>
                  <span className="text-slate-300">2.</span> Cada 15 segundos se envía tu posición.
                </li>
                <li>
                  <span className="text-slate-300">3.</span> Aparece en el mapa de rastreo, junto al
                  resto de la flota.
                </li>
              </ol>

              <dl className="border-t border-slate-800 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Posiciones de hoy desde dispositivo</dt>
                  <dd className="num text-slate-300">{reportadas}</dd>
                </div>
              </dl>

              <p className="border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
                Con la pantalla del teléfono apagada el navegador suspende el envío. Para seguimiento
                continuo haría falta una aplicación móvil nativa.
              </p>
            </CardCuerpo>
          </Card>
        </div>
      </div>
    </>
  );
}
