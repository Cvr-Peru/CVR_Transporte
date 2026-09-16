/**
 * Iconos en SVG en línea. Se evita una librería externa para no añadir
 * dependencias: son trazos simples que heredan el color del texto.
 */
import type { ReactNode, SVGProps } from 'react';

type PropsIcono = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: PropsIcono & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={18}
      height={18}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconoTablero = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Base>
);

export const IconoDespacho = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
    <path d="M3 7.5 12 12l9-4.5M12 12v9" />
  </Base>
);

export const IconoMapa = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Base>
);

export const IconoFlota = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M2 16V6a1 1 0 0 1 1-1h10v11" />
    <path d="M13 9h4.5l3.5 3.5V16" />
    <circle cx="7" cy="17.5" r="2" />
    <circle cx="17" cy="17.5" r="2" />
    <path d="M9 17.5h6" />
  </Base>
);

export const IconoConductor = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Base>
);

export const IconoFinanzas = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Base>
);

export const IconoFactura = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M6 2.5h9l4 4V21.5l-2.5-1.5L14 21.5 11.5 20 9 21.5 6.5 20 4 21.5V4a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M8 8.5h7M8 12.5h7M8 16.5h4" />
  </Base>
);

export const IconoLiquidacion = (p: PropsIcono) => (
  <Base {...p}>
    <rect x="2.5" y="5.5" width="19" height="14" rx="2" />
    <path d="M2.5 10h19" />
    <circle cx="17" cy="15" r="1.4" />
  </Base>
);

export const IconoAlerta = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M10.3 3.8 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17.2h.01" />
  </Base>
);

export const IconoReloj = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.4 2" />
  </Base>
);

export const IconoCheck = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M4.5 12.5 9.5 17.5 20 6.5" />
  </Base>
);

export const IconoEquis = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconoBuscar = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </Base>
);

export const IconoFlecha = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);

export const IconoCaja = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5 3.5 16.5v-9Z" />
    <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
  </Base>
);

export const IconoCombustible = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M12 2.5s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0c0-4 5.5-10 5.5-10Z" />
    <path d="M12 17.5a2.6 2.6 0 0 0 2.6-2.6c0-1.6-2.6-4.4-2.6-4.4s-2.6 2.8-2.6 4.4A2.6 2.6 0 0 0 12 17.5Z" />
  </Base>
);

export const IconoHerramienta = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M14.5 6a4.5 4.5 0 0 0 6 6l-9 9a2.8 2.8 0 0 1-4-4l9-9Z" />
    <path d="M14.5 6 18 2.5" />
  </Base>
);

export const IconoDocumento = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5l-5-5Z" />
    <path d="M14 2.5v5h5" />
  </Base>
);

export const IconoSalir = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Base>
);

/** Diana de ubicación: se usa para compartir el GPS del dispositivo. */
export const IconoUbicacion = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="8" />
  </Base>
);

/** Recorrido con paradas: optimización del orden de reparto. */
export const IconoRuta = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="6" cy="19" r="2.4" />
    <circle cx="18" cy="5" r="2.4" />
    <path d="M8.3 17.7c2.5-.5 3.2-2.5 3.8-4.4.7-2.3 1.5-4.5 3.6-5.2" />
  </Base>
);

export const IconoRefrescar = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M21 12a9 9 0 1 1-3.2-6.9" />
    <path d="M21 4v5h-5" />
  </Base>
);

/** Cámara: prueba de entrega con la foto de quien recibe. */
export const IconoCamara = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M3 8.5A2 2 0 0 1 5 6.5h1.6a1 1 0 0 0 .84-.46l.72-1.08A1 1 0 0 1 9 4.5h6a1 1 0 0 1 .84.46l.72 1.08a1 1 0 0 0 .84.46H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.4" />
  </Base>
);

/** Cuenta de usuario: gestión de accesos y roles. */
export const IconoUsuario = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Base>
);

/** Sol: se muestra en modo oscuro, porque pulsar lleva al claro. */
export const IconoSol = (p: PropsIcono) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

/** Luna: se muestra en modo claro, porque pulsar lleva al oscuro. */
export const IconoLuna = (p: PropsIcono) => (
  <Base {...p}>
    <path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.8 6.8 0 0 0 10 10z" />
  </Base>
);
