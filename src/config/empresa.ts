/**
 * Configuración de la empresa y parámetros regionales.
 *
 * Este es el ÚNICO archivo que hay que tocar para adaptar el sistema a otro
 * país: moneda, locale, identificador fiscal, y los umbrales de alerta.
 * Ahora mismo está configurado para **Perú** (Lima).
 */
export const empresa = {
  nombre: 'Transportes Lima Express S.A.C.',
  nombreCorto: 'Lima Express',
  /** Etiqueta del identificador fiscal: RUC (Perú), NIT (Colombia), RFC (México) */
  idFiscalLabel: 'RUC',
  idFiscal: '20601234567',
  ciudad: 'Lima',
  pais: 'Perú',
  /** Código ISO de moneda para Intl.NumberFormat */
  moneda: 'PEN',
  /** Locale para formateo de números y fechas */
  locale: 'es-PE',
  telefono: '+51 1 480 2210',
  /** Unidad de volumen de combustible usada en la operación */
  unidadCombustible: 'gal',
  /** Unidad de distancia */
  unidadDistancia: 'km',
} as const;

/** Umbrales de alerta para vencimiento de documentación (en días). */
export const umbrales = {
  /** A partir de aquí se marca "por vencer" (ámbar) */
  preventivo: 30,
  /** A partir de aquí se marca "crítico" (rojo) */
  critico: 10,
} as const;

/** Parámetros económicos de la operación. */
export const parametros = {
  /** Porcentaje de comisión por defecto para conductores contratistas */
  comisionContratistaPct: 18,
  /** Impuesto general a las ventas en Perú (IGV) */
  impuestoVentasPct: 18,
  /** Días de gracia tras el vencimiento antes de marcar una factura como vencida */
  diasGraciaFactura: 0,
  /**
   * ¿Se exige la foto de quien recibe para dar una entrega por buena?
   *
   * Por defecto **no**: un teléfono sin cámara o sin batería no puede dejar al
   * conductor sin poder cerrar una parada. Si la foto es la prueba que zanja las
   * discusiones con el cliente, ponlo en `true` y el servidor rechazará toda
   * entrega sin foto, no solo la interfaz.
   */
  exigirFotoEnEntrega: false,
} as const;
