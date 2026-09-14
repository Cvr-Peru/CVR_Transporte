import type { MetadataRoute } from 'next';
import { empresa } from '@/config/empresa';

/**
 * Manifiesto de la aplicación web instalable.
 *
 * Next.js lo publica en `/manifest.webmanifest` y lo enlaza automáticamente
 * desde el `<head>`. Es lo que permite instalarla en el teléfono o el
 * computador como si fuera una app nativa.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${empresa.nombreCorto} · Panel de operación`,
    short_name: empresa.nombreCorto,
    description:
      'Gestión de despachos, flota, costos, facturación y rastreo para empresas de transporte de última milla.',

    // Al abrirse desde el icono arranca en el tablero y no muestra la barra del
    // navegador: se comporta como una app.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',

    // Colores alineados con el tema oscuro de la interfaz (slate-950).
    background_color: '#020617',
    theme_color: '#020617',

    lang: 'es',
    dir: 'ltr',
    categories: ['business', 'productivity'],

    icons: [
      {
        src: '/iconos/icono-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/iconos/icono-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Variante con el símbolo dentro de la zona segura: el sistema puede
        // recortar el borde con cualquier forma sin cortar el cubo.
        src: '/iconos/icono-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],

    // Atajos al mantener pulsado el icono de la app.
    shortcuts: [
      {
        name: 'Rastrear una guía',
        short_name: 'Rastrear',
        description: 'Consultar el estado de un envío por su número de guía',
        url: '/rastrear',
        icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }],
      },
      {
        name: 'Despachos de hoy',
        short_name: 'Despachos',
        description: 'Hojas de ruta y asignación de unidades',
        url: '/despachos',
        icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }],
      },
      {
        name: 'Rastreo en vivo',
        short_name: 'En vivo',
        description: 'Posición de la flota en el mapa',
        url: '/rastreo',
        icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }],
      },
    ],
  };
}
