import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Los controladores de base de datos se cargan en tiempo de ejecución desde
  // node_modules. Sin esto, Turbopack intentaría empaquetarlos y PGlite (que
  // incluye un binario WebAssembly) fallaría.
  serverExternalPackages: ['pg', '@electric-sql/pglite'],

  experimental: {
    // Next.js reparte el trabajo del build entre varios procesos hijos
    // (recolección de datos de páginas, verificación de tipos). Con esta opción
    // usa hilos dentro del mismo proceso, que es más ligero y además funciona
    // en entornos que no permiten crear procesos hijos (contenedores
    // restrictivos, CI con sandbox). El resultado de la compilación es idéntico.
    workerThreads: true,

    // Por defecto una acción de servidor acepta 1 MB de cuerpo, y la foto de una
    // entrega no cabe. El navegador la reduce antes de subirla (unos 150 KB),
    // así que este margen sobra; está alto a propósito para que una foto tomada
    // desde un navegador antiguo, que no sepa reducirla, siga funcionando.
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },

  typescript: {
    // La verificación de tipos se ejecuta de forma explícita con
    // `tsc --noEmit` (ver el script `build` en package.json), en lugar de
    // dentro del build. Así el resultado es el mismo pero sin depender del
    // verificador interno.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
