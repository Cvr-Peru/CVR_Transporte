/**
 * Identidad de la empresa: lo que ve quien usa la aplicación.
 *
 * El nombre, el logo y los datos fiscales son **de la empresa que contrata**, no
 * del programa. Viven en la base de datos para poder cambiarlos desde la
 * aplicación, sin tocar código ni volver a desplegar: es lo que permite instalar
 * el mismo programa para transportistas distintos.
 *
 * `src/config/empresa.ts` sigue siendo la fuente de lo **regional** —moneda,
 * idioma, unidades—, que no cambia por cliente. Y también es el valor por
 * defecto de la identidad, para que una instalación recién creada, o una base de
 * datos que no responde, sigan mostrando algo coherente en vez de quedarse en
 * blanco.
 */
import { cache } from 'react';
import { get } from '@/db/client';
import { empresa } from '@/config/empresa';

export interface Identidad {
  nombre: string;
  nombreCorto: string;
  /** Etiqueta del identificador fiscal: RUC, NIT… Es regional, no del cliente. */
  idFiscalLabel: string;
  idFiscal: string;
  telefono: string;
  ciudad: string;
  /** Si hay un logo subido. El anterior se descarta al subir uno nuevo. */
  tieneLogo: boolean;
  /** Tipo de la imagen del logo, para poder declararlo donde haga falta. */
  logoMime: string | null;
  /**
   * Cambia cada vez que se guarda la configuración. Se añade a la dirección del
   * logo para que el navegador no siga enseñando el anterior después de
   * cambiarlo, y así poder cachear la imagen para siempre.
   */
  version: string;
}

/** Identidad por defecto, la que viene en el código. */
export function identidadPorDefecto(): Identidad {
  return {
    nombre: empresa.nombre,
    nombreCorto: empresa.nombreCorto,
    idFiscalLabel: empresa.idFiscalLabel,
    idFiscal: empresa.idFiscal,
    telefono: empresa.telefono,
    ciudad: empresa.ciudad,
    tieneLogo: false,
    logoMime: null,
    version: 'base',
  };
}

/**
 * Identidad configurada, o la del código si no hay ninguna.
 *
 * Se envuelve en `cache()` porque la piden el marco de navegación, los metadatos
 * y la página a la vez: sin esto serían tres consultas por petición.
 *
 * **Nunca lanza.** El marco de la aplicación se renderiza en todas las páginas,
 * incluidas la de acceso y la de sin conexión; si la base de datos no responde,
 * es mejor enseñar el nombre por defecto que tumbar la aplicación entera.
 */
export const identidad = cache(async (): Promise<Identidad> => {
  try {
    const fila = await get<{
      nombre: string;
      nombre_corto: string;
      id_fiscal: string | null;
      telefono: string | null;
      ciudad: string | null;
      tiene_logo: number;
      logo_mime: string | null;
      actualizado: string | null;
    }>(
      `SELECT nombre, nombre_corto, id_fiscal, telefono, ciudad,
              CASE WHEN logo IS NULL THEN 0 ELSE 1 END AS tiene_logo,
              logo_mime,
              actualizado
       FROM configuracion WHERE id = 1`,
    );

    if (!fila) return identidadPorDefecto();

    return {
      nombre: fila.nombre,
      nombreCorto: fila.nombre_corto,
      idFiscalLabel: empresa.idFiscalLabel,
      idFiscal: fila.id_fiscal ?? empresa.idFiscal,
      telefono: fila.telefono ?? empresa.telefono,
      ciudad: fila.ciudad ?? empresa.ciudad,
      tieneLogo: Number(fila.tiene_logo) === 1,
      logoMime: fila.logo_mime,
      version: (fila.actualizado ?? 'base').replace(/[^0-9]/g, '') || 'base',
    };
  } catch {
    return identidadPorDefecto();
  }
});

/** Dirección del logo, con la versión para poder cachearlo sin riesgo. */
export function urlLogo(ident: Identidad): string | null {
  return ident.tieneLogo ? `/api/logo?v=${ident.version}` : null;
}
