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
