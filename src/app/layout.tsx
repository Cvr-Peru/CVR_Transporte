import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { MarcoAplicacion, type MarcaEmpresa } from '@/components/layout/MarcoAplicacion';
import { AvisoSinConexion, RegistroServiceWorker } from '@/components/pwa/Pwa';
import { identidad, urlLogo } from '@/db/queries/configuracion';
import { permisosDeSesion } from '@/lib/auth/sesion';

/**
 * Los títulos de la aplicación llevan el nombre de la empresa que la usa, así que
 * se generan en cada petición a partir de la identidad configurada. En la
 * pestaña del navegador y al instalarla en el móvil aparece **su** nombre, no el
 * del programa.
 */
export async function generateMetadata(): Promise<Metadata> {
  const empresa = await identidad();

  return {
    title: {
      default: `Panel de operación · ${empresa.nombreCorto}`,
      template: `%s · ${empresa.nombreCorto}`,
    },
    description: `Sistema de gestión de última milla de ${empresa.nombre}: pedidos, despachos, flota, costos, facturación y rastreo.`,
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
}

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

  // Y la identidad, para que la cabecera y el pie lleven el nombre y el logo de la
  // empresa. Se pide ya resuelta, con la dirección del logo, porque el marco es un
  // componente de cliente y no puede consultar la base de datos.
  const datos = await identidad();
  const empresa: MarcaEmpresa = {
    nombre: datos.nombre,
    nombreCorto: datos.nombreCorto,
    idFiscalLabel: datos.idFiscalLabel,
    idFiscal: datos.idFiscal,
    telefono: datos.telefono,
    ciudad: datos.ciudad,
    logo: urlLogo(datos),
  };

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
          empresa={empresa}
        >
          {children}
        </MarcoAplicacion>
      </body>
    </html>
  );
}
