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
  // Color de la barra del navegador en el móvil. Va por preferencia del sistema y
  // no por el tema elegido en la aplicación: esta etiqueta la genera el servidor,
  // que no sabe qué eligió el visitante.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

/**
 * Aplica el tema antes del primer pintado.
 *
 * Sin esto se vería un parpadeo: el servidor manda siempre el mismo HTML, así que
 * el navegador pintaría en claro y solo después el conmutador pondría el oscuro.
 * Como es un guion en línea al principio del `<body>`, se ejecuta antes de que se
 * dibuje nada.
 *
 * Si el navegador bloquea `localStorage` —modo privado, cookies restringidas— se
 * sigue la preferencia del sistema, que es un final razonable.
 */
const GUION_TEMA = `(function(){try{
var g=localStorage.getItem('transporte-tema');
var oscuro = g ? g==='oscuro' : window.matchMedia('(prefers-color-scheme: dark)').matches;
if(oscuro){document.documentElement.classList.add('dark');}
}catch(e){}})();`;

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
    // `suppressHydrationWarning` porque el guion de abajo añade la clase del tema
    // a este elemento antes de que React hidrate: sin él avisaría de un desajuste.
    <html lang="es" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: GUION_TEMA }} />
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
