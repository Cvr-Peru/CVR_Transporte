/**
 * Proveedor de mapas (teselas) y colores de los marcadores.
 *
 * ── Cómo funciona un mapa en una aplicación web ──────────────────────────────
 *
 * Nadie dibuja el mapa: se piden **teselas** (cuadros PNG de 256×256) a un
 * servidor y se pegan como un mosaico según el nivel de zoom y la posición. Con
 * zoom 15, Lima son unas pocas decenas de teselas; al mover el mapa se piden las
 * que faltan.
 *
 * Eso significa que **el mapa necesita internet**. Es la diferencia con el mapa
 * esquemático que dibuja `MapaFlota`, que funciona sin conexión porque no pide
 * nada a nadie.
 *
 * ── Por qué OpenStreetMap por defecto ────────────────────────────────────────
 *
 * No necesita clave ni registro, así que funciona nada más arrancar. Su política
 * de uso, sin embargo, **no permite producción con tráfico alto**: es un servicio
 * sostenido por voluntarios. Para uso real hay que pasar a un proveedor con
 * plan gratuito y clave:
 *
 *   NEXT_PUBLIC_TESELAS_KEY=tu_clave   → MapTiler (recomendado)
 *
 * Si necesitas además tráfico en tiempo real, búsqueda de direcciones o
 * optimización de rutas, lo habitual es Google Maps Platform o Mapbox.
 */

/** Estilos de las paradas según su estado. Compartido con el mapa esquemático. */
export const COLOR_PARADA: Record<string, string> = {
  entregado: '#34d399',
  en_camino: '#38bdf8',
  pendiente: '#64748b',
  fallido: '#f43f5e',
};

export interface ProveedorTeselas {
  nombre: string;
  url: string;
  atribucion: string;
  maxZoom: number;
  /** Aviso que se muestra en la interfaz sobre las condiciones de uso. */
  aviso?: string;
}

const CLAVE = process.env.NEXT_PUBLIC_TESELAS_KEY ?? '';

/**
 * Proveedor en uso. La clave se lee en tiempo de compilación (por eso el prefijo
 * `NEXT_PUBLIC_`), así que cambiarla exige volver a compilar.
 */
export const PROVEEDOR_TESELAS: ProveedorTeselas = CLAVE
  ? {
      nombre: 'MapTiler',
      url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${CLAVE}`,
      atribucion: '© MapTiler © OpenStreetMap',
      maxZoom: 20,
    }
  : {
      nombre: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      atribucion: '© OpenStreetMap',
      maxZoom: 19,
      aviso:
        'Teselas gratuitas de OpenStreetMap, servidas por voluntarios. Sirven para una demostración, no para producción con tráfico.',
    };

/** ¿Hay un mapa de calles disponible, o solo el esquemático? */
export const HAY_MAPA_DE_CALLES = true;
