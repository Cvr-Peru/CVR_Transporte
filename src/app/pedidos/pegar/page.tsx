import Link from 'next/link';
import { EncabezadoPagina } from '@/components/ui/EncabezadoPagina';
import { IconoAlerta } from '@/components/ui/Iconos';
import { RevisionChat } from '@/components/pedidos/RevisionChat';
import { clientesParaPedidos } from '@/db/queries/pedidos';
import { requerirPermiso } from '@/lib/auth/sesion';
import { hoyISO } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pegar un chat',
};

const ERRORES: Record<string, string> = {
  cliente: 'Elige el cliente que manda los pedidos.',
  json: 'No se pudieron leer los pedidos. Vuelve a pegar el chat.',
  vacio: 'No hay ningún pedido que guardar.',
  datos: 'Ningún pedido tenía destinatario y dirección a la vez. Corrige los que faltan.',
};

/**
 * Carga de pedidos pegando la conversación de WhatsApp.
 *
 * Es la pantalla que evita el retipeo: el pedido ya está escrito en el chat, lo
 * único que hacía falta era separarlo y ordenarlo. Quien atiende el WhatsApp sigue
 * trabajando igual que antes; lo que desaparece es volver a copiar lo mismo.
 */
export default async function PaginaPegarChat({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirPermiso('pedidos', 'editar');
  const sp = await searchParams;
  const clientes = await clientesParaPedidos();

  const error = typeof sp.error === 'string' ? ERRORES[sp.error] : undefined;

  return (
    <>
      <EncabezadoPagina
        titulo="Pegar un chat"
        descripcion="Copia la conversación de WhatsApp tal cual y revísala antes de guardarla."
        acciones={
          <Link
            href="/pedidos"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Volver al buzón
          </Link>
        }
      />

      {error ? (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <IconoAlerta width={16} height={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <RevisionChat
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        hoy={hoyISO()}
      />
    </>
  );
}
