'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { IconoAlerta, IconoCamara, IconoEquis } from '@/components/ui/Iconos';

/**
 * Foto de quien recibe, como prueba de entrega.
 *
 * Tres decisiones que conviene entender antes de tocar esto:
 *
 * 1. **Se usa un `<input type="file">`, no la API de cámara.** En un móvil,
 *    `accept="image/*"` con `capture="environment"` abre directamente la cámara
 *    trasera y devuelve la foto al formulario. No hace falta nada nativo ni
 *    permisos especiales, y funciona igual en la app instalada (PWA). Quitando
 *    `capture` el teléfono ofrecería también elegir una foto de la galería, que
 *    es justo lo que no queremos en una prueba de entrega: la foto debe ser de
 *    ahora.
 *
 * 2. **La imagen se reduce aquí, en el teléfono.** Una foto de móvil pesa 3-5 MB
 *    y se sube por datos móviles, muchas veces con mala cobertura. Se redibuja en
 *    un lienzo a 1280 px de lado mayor y se exporta como JPEG: baja a unos
 *    150 KB sin que se note a simple vista. Es lo que permite guardarla en la
 *    base de datos sin que se descontrole de tamaño.
 *
 * 3. **La posición se busca sin bloquear nada.** Si el navegador la da a tiempo,
 *    la foto queda con coordenadas, que es más prueba todavía. Si no, la entrega
 *    se registra igual.
 */

/** Lado mayor de la imagen que se sube. */
const LADO_MAXIMO = 1280;

/**
 * Calidad del JPEG. Por debajo de 0.7 empiezan a verse cuadros en las caras, que
 * es precisamente lo que hay que poder distinguir en esta foto.
 */
const CALIDAD = 0.72;

export function FotoEntrega({
  obligatoria = false,
  etiqueta = 'Tomar foto de quien recibe',
}: {
  obligatoria?: boolean;
  /**
   * Texto del botón. En el móvil abre la cámara; en un escritorio, el selector de
   * archivos, que es por donde llega la foto que el conductor manda por WhatsApp.
   */
  etiqueta?: string;
}) {
  const identificador = useId();
  const entrada = useRef<HTMLInputElement>(null);

  const [vista, setVista] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coordenadas, setCoordenadas] = useState<{ lat: number; lng: number } | null>(null);

  // Libera la URL temporal de la vista previa. Sin esto, cada foto que se
  // descarta se queda en memoria hasta recargar la página.
  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista);
  }, [vista]);

  /** Intenta conseguir la posición sin bloquear la interfaz ni la entrega. */
  function buscarCoordenadas(): void {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setCoordenadas({
          lat: Number(posicion.coords.latitude.toFixed(6)),
          lng: Number(posicion.coords.longitude.toFixed(6)),
        });
      },
      () => {
        // Sin coordenadas la foto sigue siendo válida; no se avisa de nada.
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  }

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
      const reducida = await reducir(archivo);

      // Se cambia el archivo del propio input por la versión reducida: así lo
      // que viaja con el formulario es el JPEG pequeño y no la foto original.
      const transferencia = new DataTransfer();
      transferencia.items.add(reducida);
      evento.target.files = transferencia.files;

      setVista(URL.createObjectURL(reducida));
      setBytes(reducida.size);
      buscarCoordenadas();
    } catch {
      setError('No se pudo preparar la foto. Prueba a hacerla otra vez.');
      evento.target.value = '';
    } finally {
      setProcesando(false);
    }
  }

  function quitar(): void {
    if (entrada.current) entrada.current.value = '';
    setVista(null);
    setBytes(0);
    setCoordenadas(null);
    setError(null);
  }

  return (
    <div>
      <input
        ref={entrada}
        id={identificador}
        type="file"
        name="foto"
        accept="image/*"
        capture="environment"
        onChange={(evento) => void alElegir(evento)}
        className="sr-only"
      />
      {/* Viajan con el formulario solo si hay foto. */}
      <input type="hidden" name="fotoLat" value={coordenadas?.lat ?? ''} />
      <input type="hidden" name="fotoLng" value={coordenadas?.lng ?? ''} />

      {vista ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border border-emerald-500/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vista}
              alt="Foto de quien recibe"
              className="max-h-64 w-full object-cover"
            />
            <button
              type="button"
              onClick={quitar}
              aria-label="Quitar la foto"
              className="absolute right-2 top-2 rounded-full bg-slate-950/80 p-2 text-slate-200 backdrop-blur hover:bg-slate-900"
            >
              <IconoEquis width={16} height={16} />
            </button>
          </div>

          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-emerald-300">
            <span>Foto lista · {Math.max(1, Math.round(bytes / 1024))} KB</span>
            {coordenadas ? (
              <span className="num text-slate-500">
                {coordenadas.lat.toFixed(5)}, {coordenadas.lng.toFixed(5)}
              </span>
            ) : null}
            <label
              htmlFor={identificador}
              className="cursor-pointer text-slate-400 underline hover:text-slate-200"
            >
              Repetir
            </label>
          </p>
        </div>
      ) : (
        <label
          htmlFor={identificador}
          className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-center text-sm transition-colors ${
            obligatoria
              ? 'border-amber-500/50 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10'
              : 'border-slate-700 text-slate-300 hover:bg-slate-800/50'
          } ${procesando ? 'opacity-60' : ''}`}
        >
          <IconoCamara width={18} height={18} className="shrink-0" />
          {procesando ? 'Preparando la foto…' : etiqueta}
          {obligatoria && !procesando ? (
            <span className="text-[11px] text-amber-300/80">(obligatoria)</span>
          ) : null}
        </label>
      )}

      {error ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
          <IconoAlerta width={14} height={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reduce la imagen a un JPEG manejable.
 *
 * `imageOrientation: 'from-image'` es importante: las fotos hechas en vertical
 * llevan la rotación en los metadatos EXIF y, sin respetarla, salen tumbadas.
 */
async function reducir(archivo: File): Promise<File> {
  let origen: ImageBitmap | HTMLImageElement | null = null;
  let urlTemporal: string | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      origen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      // Algunos navegadores no saben decodificar ciertos archivos por esta vía.
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

    const reducida = await new Promise<Blob | null>((listo) =>
      lienzo.toBlob(listo, 'image/jpeg', CALIDAD),
    );
    if (!reducida) throw new Error('no se pudo exportar');

    return new File([reducida], 'entrega.jpg', { type: 'image/jpeg' });
  } finally {
    if (origen instanceof ImageBitmap) origen.close();
    if (urlTemporal) URL.revokeObjectURL(urlTemporal);
  }
}
