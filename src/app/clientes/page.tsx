import Link from 'next/link';
import { AvisoExito } from '@/components/formulario/Campos';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoCliente, IconoMas } from '@/components/ui/Iconos';
import { TablaCaja, Td, Th, Tr } from '@/components/ui/Tabla';
import { Vacio } from '@/components/ui/Vacio';
import { empresa } from '@/config/empresa';
import { listarClientes } from '@/db/queries/clientes';
import { puede } from '@/lib/auth/permisos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { aISOCompleto, entero, moneda } from '@/lib/format';
import { tarifa } from '@/lib/maestros';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Clientes',
};

const CLASE_BOTON_PRINCIPAL =
  'inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500';

/**
 * Cartera de clientes: quién manda los envíos, con qué tarifa y cuánto debe.
 *
 * Administración la gestiona y gerencia la consulta. Despacho no entra: las
 * tarifas y los saldos son dinero (ver `src/lib/auth/permisos.ts`).
 */
export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await requerirPermiso('clientes');
  const puedeEditar = puede(sesion.rol, 'clientes', 'editar');
  const puedePedidos = puede(sesion.rol, 'pedidos', 'editar');

  const sp = await searchParams;
  const creado = typeof sp.creado === 'string' ? sp.creado : null;

  const hace30 = aISOCompleto(new Date(Date.now() - 30 * 86_400_000));
  const clientes = await listarClientes(hace30);
  const nuevo = creado ? clientes.find((c) => c.codigo === creado) : undefined;
  const activos = clientes.filter((c) => c.activo).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Las empresas que mandan los envíos. Su tarifa decide el flete de cada pedido, sin que nadie lo teclee."
        acciones={
          <>
            <Badge tono="info">
              <IconoCliente width={13} height={13} />
              {entero(activos)} activos
            </Badge>
            {puedeEditar ? (
              <Link href="/clientes/nuevo" className={CLASE_BOTON_PRINCIPAL}>
                <IconoMas width={15} height={15} />
                Nuevo cliente
              </Link>
            ) : null}
          </>
        }
      />

      {nuevo ? (
        <AvisoExito
          accion={
            puedePedidos ? (
              <Link
                href={`/pedidos/nuevo?cliente=${nuevo.id}`}
                className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/10"
              >
                Registrar un pedido suyo
              </Link>
            ) : null
          }
        >
          <span className="font-medium">{nuevo.nombre}</span> quedó dado de alta como{' '}
          <span className="num">{nuevo.codigo}</span>. Ya aparece al registrar pedidos.
        </AvisoExito>
      ) : null}

      <Card>
        {clientes.length === 0 ? (
          <Vacio
            icono={<IconoCliente width={22} height={22} />}
            titulo="Todavía no hay clientes"
            mensaje="Sin al menos un cliente no se pueden registrar pedidos: cada envío necesita a quién cobrárselo."
            accion={
              puedeEditar ? (
                <Link href="/clientes/nuevo" className={CLASE_BOTON_PRINCIPAL}>
                  <IconoMas width={15} height={15} />
                  Crear el primer cliente
                </Link>
              ) : null
            }
          />
        ) : (
          <TablaCaja>
            <caption className="sr-only">Clientes, con su tarifa, envíos y saldo</caption>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Contacto</Th>
                <Th alineacion="derecha">Tarifa</Th>
                <Th alineacion="derecha">Plazo</Th>
                <Th alineacion="derecha">Envíos 30 d</Th>
                <Th alineacion="derecha">Por cobrar</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <Tr key={c.id} className={c.codigo === creado ? 'bg-emerald-500/5' : undefined}>
                  <Td>
                    <p className="font-medium text-slate-100">{c.nombre}</p>
                    <p className="num text-xs text-slate-500">
                      {c.codigo}
                      {c.id_fiscal ? ` · ${empresa.idFiscalLabel} ${c.id_fiscal}` : ''}
                    </p>
                  </Td>
                  <Td>
                    <p>{c.contacto ?? <span className="text-slate-600">—</span>}</p>
                    {c.telefono ? <p className="num whitespace-nowrap text-xs text-slate-500">{c.telefono}</p> : null}
                  </Td>
                  <Td alineacion="derecha">
                    <p className="whitespace-nowrap">{tarifa(c.tarifa_base)}</p>
                    <p className="whitespace-nowrap text-xs text-slate-500">+ {tarifa(c.tarifa_kg)} / kg</p>
                  </Td>
                  <Td alineacion="derecha">
                    {c.plazo_pago_dias === 0 ? 'Contado' : `${c.plazo_pago_dias} d`}
                  </Td>
                  <Td alineacion="derecha">{entero(c.envios_30d)}</Td>
                  <Td alineacion="derecha">
                    {c.saldo_pendiente > 0 ? (
                      moneda(c.saldo_pendiente)
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tono={c.activo ? 'exito' : 'neutro'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge>
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
