import type { MetadataRoute } from 'next';
import { identidad, urlLogo } from '@/db/queries/configuracion';

/**
 * Manifiesto de la aplicación web instalable.
 *
 * Next.js lo publica en `/manifest.webmanifest` y lo enlaza automáticamente
 * desde el `<head>`. Es lo que permite instalarla en el teléfono o el
 * computador como si fuera una app nativa.
 *
 * Se genera en cada petición porque lleva el nombre y el logo de **la empresa
 * que usa la instalación**: al instalarla en el móvil, el conductor ve el icono
 * y el nombre de su transportista, no los del programa.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const empresa = await identidad();
  const logo = urlLogo(empresa);

  return {
    name: `${empresa.nombreCorto} · Panel de operación`,
    short_name: empresa.nombreCorto,
    description: `Gestión de última milla de ${empresa.nombre}: pedidos, despachos, flota, costos, facturación y rastreo.`,

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

    // Con logo propio se usa el suyo; sin él, el cubo que genera el programa.
    icons: logo
      ? [
          {
            src: logo,
            sizes: '512x512',
            type: empresa.logoMime ?? 'image/png',
            purpose: 'any',
          },
        ]
      : [
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
      },
      {
        name: 'Despachos de hoy',
        short_name: 'Despachos',
        description: 'Hojas de ruta y asignación de unidades',
        url: '/despachos',
      },
      {
        name: 'Rastreo en vivo',
        short_name: 'En vivo',
        description: 'Posición de la flota en el mapa',
        url: '/rastreo',
      },
    ],
  };
}
