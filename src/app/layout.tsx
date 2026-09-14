import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { MarcoAplicacion } from '@/components/layout/MarcoAplicacion';
import { AvisoSinConexion, RegistroServiceWorker } from '@/components/pwa/Pwa';
import { empresa } from '@/config/empresa';
import { permisosDeSesion } from '@/lib/auth/sesion';

export const metadata: Metadata = {
  title: {
    default: `Panel de operación · ${empresa.nombreCorto}`,
    template: `%s · ${empresa.nombreCorto}`,
  },
  description:
    'Sistema de gestión para empresas de transporte de última milla: despachos, flota, costos, facturación y rastreo.',
  applicationName: empresa.nombreCorto,

  // Permite que la app se abra a pantalla completa al instalarla en iOS.
  appleWebApp: {
    capable: true,
    title: empresa.nombreCorto,
    statusBarStyle: 'black',
  },

  // Los números de guía y de teléfono no deben convertirse en enlaces en iOS.
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Se permite ampliar hasta 5x por accesibilidad, pero no se bloquea el zoom.
  maximumScale: 5,
  userScalable: true,
  // Necesario para que la interfaz respete el área segura (muesca y barra
  // inferior del iPhone) en lugar de quedar recortada.
  viewportFit: 'cover',
  themeColor: '#020617',
};

/**
 * El marco raíz lee la sesión para saber qué módulos mostrar, así que tiene que
 * renderizarse en cada petición. Sin esto Next lo prerenderiza en el build —sin
 * cookies— y el resultado queda congelado: el menú aparecería siempre como si
 * nadie hubiera entrado, aunque las páginas sí vieran la sesión.
 */
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  // La sesión se lee aquí para que el marco de navegación muestre solo los
  // módulos permitidos. La comprobación de permisos de verdad vive en cada
  // página y en cada acción: esto es solo presentación.
  const { sesion, modulos, puedeCompartir, puedeMiRuta } = await permisosDeSesion();

  return (
    <html lang="es">
      <body>
        <RegistroServiceWorker />
        <AvisoSinConexion />
        <MarcoAplicacion
          sesion={sesion}
          modulos={modulos}
          puedeCompartir={puedeCompartir}
          puedeMiRuta={puedeMiRuta}
        >
          {children}
        </MarcoAplicacion>
      </body>
    </html>
  );
}
