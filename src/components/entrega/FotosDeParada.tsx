import type { FotoEntregaDetallada } from '@/db/tipos';
import { IconoCamara } from '@/components/ui/Iconos';
import { fechaHora } from '@/lib/format';

/**
 * Tira de fotos de prueba de entrega de una parada.
 *
 * Se usa una etiqueta `<img>` normal y no `next/image` a propósito. El
 * optimizador de Next descarga la imagen **desde el servidor**, sin las cookies
 * de quien está mirando, así que recibiría un 401 y la foto no se vería. Además
 * no hay nada que optimizar: la imagen ya viene reducida desde el teléfono.
 */
export function FotosDeParada({
  fotos,
  conDetalle = false,
}: {
  fotos: FotoEntregaDetallada[];
  /** Muestra hora, tamaño y coordenadas: es lo que se mira ante un reclamo. */
  conDetalle?: boolean;
}) {
  if (fotos.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-3">
      {fotos.map((foto) => (
        <li key={foto.id}>
          <a
            href={`/api/foto/${foto.id}`}
            target="_blank"
            rel="noreferrer"
            title="Abrir la foto a tamaño completo"
            className="group block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/foto/${foto.id}`}
              alt={`Foto de quien recibió, tomada el ${fechaHora(foto.tomada_en)}`}
              loading="lazy"
              className="h-24 w-24 rounded-lg border border-slate-700 object-cover transition-colors group-hover:border-sky-500"
            />
          </a>

          {conDetalle ? (
            <dl className="mt-1.5 w-24 space-y-0.5 text-[10px] leading-tight text-slate-500">
              <div className="flex items-center gap-1">
                <IconoCamara width={10} height={10} className="shrink-0" />
                <dd className="num truncate">{fechaHora(foto.tomada_en)}</dd>
              </div>
              <div>
                <dd className="num">{Math.max(1, Math.round(foto.tamano_bytes / 1024))} KB</dd>
              </div>
              {foto.lat !== null && foto.lng !== null ? (
                <div>
                  <dd className="num truncate" title="Dónde se tomó la foto">
                    {foto.lat.toFixed(4)}, {foto.lng.toFixed(4)}
                  </dd>
                </div>
              ) : null}
              {foto.subida_por_nombre ? (
                <div>
                  <dd className="truncate" title={foto.subida_por_nombre}>
                    {foto.subida_por_nombre}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Aviso de que una entrega se registró **sin** foto.
 *
 * Importa verlo: cuando hay un reclamo, saber que no hay prueba es la mitad de
 * la respuesta, y una entrega sin foto no debe parecer igual que una con foto.
 */
export function SinFoto() {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
      <IconoCamara width={12} height={12} />
      Sin foto de quien recibió
    </p>
  );
}
