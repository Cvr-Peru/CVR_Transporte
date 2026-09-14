'use client';

import { useEffect } from 'react';

/**
 * Vacía las páginas guardadas por el service worker.
 *
 * Se monta en la pantalla de entrada. Motivo: la aplicación guarda las páginas
 * visitadas para poder consultarlas sin conexión, y en un dispositivo compartido
 * —el móvil de un conductor que cambia de turno, por ejemplo— el siguiente
 * usuario podría ver sin conexión las pantallas del anterior. Al pasar por la
 * pantalla de entrada se limpian.
 *
 * Solo se borran las páginas; los recursos estáticos (iconos, estilos) no
 * contienen información de nadie y se conservan para que la app siga abriendo
 * sin conexión.
 */
export function LimpiarPaginasGuardadas() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready
      .then((registro) => {
        registro.active?.postMessage('limpiar-paginas');
      })
      .catch(() => {
        // Si no hay service worker registrado no hay nada que limpiar.
      });
  }, []);

  return null;
}
