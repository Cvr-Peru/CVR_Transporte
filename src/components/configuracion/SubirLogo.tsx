'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { IconoAlerta, IconoCamara, IconoEquis } from '@/components/ui/Iconos';

/**
 * Subida del logo de la empresa.
 *
 * Dos diferencias con la foto de entrega, que se comprime a JPEG:
 *
 *  - **Se guarda como PNG.** Un logo casi siempre lleva fondo transparente, y el
 *    JPEG no tiene canal alfa: lo convertiría en un rectángulo blanco que se
 *    comería el fondo de la cabecera.
 *  - **Se reduce a 512 px de lado mayor.** Es más que suficiente para el tamaño
 *    al que se muestra, incluso en pantallas de alta densidad, y mantiene el
 *    archivo pequeño para que viaje en cada carga de página.
 */

const LADO_MAXIMO = 512;

export function SubirLogo({ logoActual }: { logoActual: string | null }) {
  const identificador = useId();
  const entrada = useRef<HTMLInputElement>(null);

  const [vista, setVista] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);
  const [quitar, setQuitar] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista);
  }, [vista]);

  async function alElegir(evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setError(null);

    if (!archivo.type.startsWith('image/')) {
      setError('Ese archivo no es una imagen.');
      evento.target.value = '';
      return;
    }

    setProcesando(true);
    try {
      const reducido = await reducir(archivo);

      const transferencia = new DataTransfer();
      transferencia.items.add(reducido);
      evento.target.files = transferencia.files;

      setVista(URL.createObjectURL(reducido));
      setBytes(reducido.size);
      setQuitar(false);
    } catch {
      setError('No se pudo preparar la imagen. Prueba con otro archivo.');
      evento.target.value = '';
    } finally {
      setProcesando(false);
    }
  }

  function descartar(): void {
    if (entrada.current) entrada.current.value = '';
    setVista(null);
    setBytes(0);
    setError(null);
  }

  const mostrando =
    vista ?? (logoActual && !quitar ? logoActual : null);

  return (
    <div>
      <input
        ref={entrada}
        id={identificador}
        type="file"
        name="logo"
        accept="image/*"
        onChange={(evento) => void alElegir(evento)}
        className="sr-only"
      />
      {/* Viaja con el formulario solo cuando se ha pedido quitarlo. */}
      <input type="hidden" name="quitarLogo" value={quitar ? '1' : ''} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          {mostrando ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mostrando}
              alt="Logo de la empresa"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-2 text-center text-[10px] leading-tight text-slate-600">
              Sin logo
            </span>
          )}
        </div>

        <div className="min-w-52 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={identificador}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 ${
                procesando ? 'opacity-60' : ''
              }`}
            >
              <IconoCamara width={15} height={15} />
              {procesando ? 'Preparando…' : mostrando ? 'Cambiar el logo' : 'Subir el logo'}
            </label>

            {vista ? (
              <button
                type="button"
                onClick={descartar}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800"
              >
                Descartar el cambio
              </button>
            ) : null}

            {logoActual && !quitar ? (
              <button
                type="button"
                onClick={() => {
                  descartar();
                  setQuitar(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-rose-300"
              >
                <IconoEquis width={14} height={14} />
                Quitar
              </button>
            ) : null}

            {quitar ? (
              <button
                type="button"
                onClick={() => setQuitar(false)}
                className="rounded-lg border border-amber-500/40 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
              >
                Se quitará al guardar · Deshacer
              </button>
            ) : null}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            {vista
              ? `Listo · ${Math.max(1, Math.round(bytes / 1024))} KB. Se guardará al pulsar «Guardar».`
              : 'PNG o JPG, con fondo transparente si lo tienes. Se reduce a 512 px y se guarda en la base de datos.'}
          </p>

          {error ? (
            <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              <IconoAlerta width={14} height={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Reduce la imagen a un PNG manejable, conservando la transparencia. */
async function reducir(archivo: File): Promise<File> {
  let origen: ImageBitmap | HTMLImageElement | null = null;
  let urlTemporal: string | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      origen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      origen = null;
    }
  }

  if (!origen) {
    urlTemporal = URL.createObjectURL(archivo);
    const imagen = new Image();
    await new Promise<void>((listo, fallo) => {
      imagen.onload = () => listo();
      imagen.onerror = () => fallo(new Error('imagen ilegible'));
      imagen.src = urlTemporal as string;
    });
    origen = imagen;
  }

  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(origen.width, origen.height));
    const ancho = Math.max(1, Math.round(origen.width * escala));
    const alto = Math.max(1, Math.round(origen.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const contexto = lienzo.getContext('2d');
    if (!contexto) throw new Error('sin contexto 2D');

    contexto.drawImage(origen, 0, 0, ancho, alto);

    const reducido = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, 'image/png'));
    if (!reducido) throw new Error('no se pudo exportar');

    return new File([reducido], 'logo.png', { type: 'image/png' });
  } finally {
    if (origen instanceof ImageBitmap) origen.close();
    if (urlTemporal) URL.revokeObjectURL(urlTemporal);
  }
}
