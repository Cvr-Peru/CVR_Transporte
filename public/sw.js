/**
 * Service worker de la aplicación.
 *
 * Objetivos, en este orden:
 *   1. Hacer la app instalable (requisito de los navegadores).
 *   2. Permitir consultar la última información vista cuando no hay conexión.
 *   3. NO interferir nunca con las escrituras.
 *
 * Reglas de seguridad que conviene no romper:
 *   - Solo se interceptan peticiones GET. Las acciones de servidor de Next.js
 *     viajan por POST: si se cachearan, se perderían entregas o cobros.
 *   - Las rutas /api/ nunca se cachean.
 *   - Las páginas usan estrategia "red primero": con conexión siempre se ve
 *     información fresca; sin conexión se sirve la última copia guardada.
 *
 * Limitación conocida y deliberada: se puede CONSULTAR sin conexión, pero no
 * registrar entregas. Eso requiere sincronización con cola de salida y está
 * fuera del alcance de esta versión.
 */

const VERSION = 'v1';

const CACHE_ESTATICOS = `transporte-estaticos-${VERSION}`;
const CACHE_PAGINAS = `transporte-paginas-${VERSION}`;
const CACHE_IMAGENES = `transporte-imagenes-${VERSION}`;

const CACHES_ACTUALES = [CACHE_ESTATICOS, CACHE_PAGINAS, CACHE_IMAGENES];

/** Recursos mínimos para que la app abra sin conexión desde el primer momento. */
const PRECARGA = [
  '/offline',
  '/manifest.webmanifest',
  '/iconos/icono-192.png',
  '/iconos/icono-512.png',
];

// ─────────────────────────────────────────────────────────────
// Instalación y activación
// ─────────────────────────────────────────────────────────────
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      // addAll falla entero si un solo recurso falla; se piden de uno en uno.
      await Promise.all(
        PRECARGA.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((n) => n.startsWith('transporte-') && !CACHES_ACTUALES.includes(n))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// ─────────────────────────────────────────────────────────────
// Estrategias de caché
// ─────────────────────────────────────────────────────────────
/** Red primero; si falla, la copia guardada; si no hay, la página offline. */
async function redPrimero(peticion, esNavegacion) {
  const cache = await caches.open(CACHE_PAGINAS);

  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch {
    const guardada = await cache.match(peticion, { ignoreSearch: esNavegacion });
    if (guardada) return guardada;

    if (esNavegacion) {
      const offline = await caches.match('/offline');
      if (offline) return offline;
    }
    return new Response('Sin conexión', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Caché primero: estos recursos llevan hash en el nombre, nunca cambian. */
async function cachePrimero(peticion, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;

  const respuesta = await fetch(peticion);
  if (respuesta && respuesta.status === 200) {
    cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

// ─────────────────────────────────────────────────────────────
// Interceptor
// ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  const url = new URL(peticion.url);

  // Las escrituras nunca se tocan: son las acciones de servidor (POST).
  if (peticion.method !== 'GET') return;

  // Solo el mismo origen; lo demás va directo a la red.
  if (url.origin !== self.location.origin) return;

  // Las respuestas de la API siempre en vivo.
  if (url.pathname.startsWith('/api/')) return;

  // Recursos compilados: su nombre contiene un hash, se pueden guardar siempre.
  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(cachePrimero(peticion, CACHE_ESTATICOS));
    return;
  }

  if (
    url.pathname.startsWith('/iconos/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico')
  ) {
    evento.respondWith(cachePrimero(peticion, CACHE_IMAGENES));
    return;
  }

  // Navegaciones completas y peticiones de datos del router de Next.
  const esNavegacion = peticion.mode === 'navigate';
  const esDatosRouter = peticion.headers.get('RSC') === '1' || url.searchParams.has('_rsc');

  if (esNavegacion || esDatosRouter) {
    evento.respondWith(redPrimero(peticion, esNavegacion));
    return;
  }

  // Resto (fuentes, manifest, etc.): red primero sin caché propia.
  evento.respondWith(
    fetch(peticion).catch(() => caches.match(peticion).then((r) => r ?? Response.error())),
  );
});

// Permite que la página pida activar de inmediato una versión nueva.
self.addEventListener('message', (evento) => {
  if (evento.data === 'saltar-espera') self.skipWaiting();

  // Al cerrar sesión se vacían las páginas guardadas. Sin esto, en un
  // dispositivo compartido el siguiente usuario podría ver sin conexión las
  // pantallas del anterior. Los recursos estáticos no se tocan: no contienen
  // datos de nadie.
  if (evento.data === 'limpiar-paginas') {
    evento.waitUntil(caches.delete(CACHE_PAGINAS));
  }
});
