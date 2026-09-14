/**
 * Zonas operativas de Lima con su centroide.
 *
 * Se usan para generar las coordenadas de las paradas de un despacho nuevo.
 * En una implantación real esto se reemplaza por un geocodificador que traduzca
 * la dirección a coordenadas exactas.
 */
export interface Zona {
  nombre: string;
  lat: number;
  lng: number;
}

/**
 * Distritos de Lima Metropolitana y Callao, con coordenadas aproximadas de su
 * centro.
 *
 * Están los 43 distritos de Lima y los 7 del Callao. Al principio solo estaban
 * los 20 con más reparto de última milla, pero esta lista hace dos trabajos a la
 * vez —situar las paradas en el mapa y **reconocer el distrito cuando alguien
 * escribe un pedido por WhatsApp**— y un distrito que falta no es un hueco
 * teórico: es un pedido que entra sin zona y que alguien tiene que corregir a
 * mano. Mejor tenerlos todos.
 */
export const ZONAS: Zona[] = [
  // ── Lima centro y oeste ──
  { nombre: 'Lima', lat: -12.0464, lng: -77.0428 },
  { nombre: 'Miraflores', lat: -12.1219, lng: -77.0297 },
  { nombre: 'San Isidro', lat: -12.0972, lng: -77.0364 },
  { nombre: 'Santiago de Surco', lat: -12.145, lng: -76.995 },
  { nombre: 'Surquillo', lat: -12.1133, lng: -77.0208 },
  { nombre: 'Barranco', lat: -12.145, lng: -77.02 },
  { nombre: 'Chorrillos', lat: -12.175, lng: -77.02 },
  { nombre: 'La Molina', lat: -12.0789, lng: -76.945 },
  { nombre: 'San Borja', lat: -12.105, lng: -77.0 },
  { nombre: 'San Luis', lat: -12.0772, lng: -76.9994 },
  { nombre: 'La Victoria', lat: -12.0667, lng: -77.0167 },
  { nombre: 'Lince', lat: -12.085, lng: -77.035 },
  { nombre: 'Jesús María', lat: -12.075, lng: -77.045 },
  { nombre: 'Breña', lat: -12.0583, lng: -77.05 },
  { nombre: 'Pueblo Libre', lat: -12.072, lng: -77.063 },
  { nombre: 'Magdalena del Mar', lat: -12.09, lng: -77.07 },
  { nombre: 'San Miguel', lat: -12.077, lng: -77.083 },
  { nombre: 'Rímac', lat: -12.0333, lng: -77.0333 },
  { nombre: 'El Agustino', lat: -12.05, lng: -76.99 },
  { nombre: 'Santa Anita', lat: -12.045, lng: -76.97 },
  { nombre: 'Ate', lat: -12.03, lng: -76.92 },

  // ── Lima norte ──
  { nombre: 'Independencia', lat: -11.99, lng: -77.053 },
  { nombre: 'Los Olivos', lat: -11.99, lng: -77.07 },
  { nombre: 'San Martín de Porres', lat: -12.02, lng: -77.07 },
  { nombre: 'Comas', lat: -11.94, lng: -77.05 },
  { nombre: 'Puente Piedra', lat: -11.87, lng: -77.08 },
  { nombre: 'Carabayllo', lat: -11.89, lng: -77.03 },
  { nombre: 'Ancón', lat: -11.77, lng: -77.17 },
  { nombre: 'Santa Rosa', lat: -11.79, lng: -77.17 },

  // ── Lima este ──
  { nombre: 'San Juan de Lurigancho', lat: -11.98, lng: -77.0 },
  { nombre: 'Lurigancho', lat: -11.94, lng: -76.7 },
  { nombre: 'Chaclacayo', lat: -11.97, lng: -76.77 },
  { nombre: 'Cieneguilla', lat: -12.12, lng: -76.8 },

  // ── Lima sur ──
  { nombre: 'San Juan de Miraflores', lat: -12.16, lng: -76.97 },
  { nombre: 'Villa María del Triunfo', lat: -12.16, lng: -76.93 },
  { nombre: 'Villa El Salvador', lat: -12.213, lng: -76.935 },
  { nombre: 'Pachacámac', lat: -12.2, lng: -76.87 },
  { nombre: 'Lurín', lat: -12.27, lng: -76.87 },

  // ── Callao ──
  { nombre: 'Callao', lat: -12.0565, lng: -77.1181 },
  { nombre: 'Bellavista', lat: -12.06, lng: -77.13 },
  { nombre: 'La Perla', lat: -12.07, lng: -77.14 },
  { nombre: 'La Punta', lat: -12.07, lng: -77.16 },
  { nombre: 'Carmen de la Legua Reynoso', lat: -12.05, lng: -77.11 },
  { nombre: 'Mi Perú', lat: -11.89, lng: -77.13 },
  { nombre: 'Ventanilla', lat: -11.87, lng: -77.15 },
];

export function zonaPorNombre(nombre: string): Zona | undefined {
  return ZONAS.find((z) => z.nombre === nombre);
}

/** Genera una coordenada aleatoria dentro del área de una zona. */
export function coordenadaEnZona(zona: Zona): { lat: number; lng: number } {
  const dispersion = 0.019;
  return {
    lat: Number((zona.lat + (Math.random() - 0.5) * 2 * dispersion).toFixed(6)),
    lng: Number((zona.lng + (Math.random() - 0.5) * 2 * dispersion).toFixed(6)),
  };
}

/** Avenidas y calles reales de Lima, para que las direcciones suenen a Lima. */
const VIAS = [
  'Av. Arequipa',
  'Av. Larco',
  'Av. Benavides',
  'Av. Universitaria',
  'Av. Aviación',
  'Av. Grau',
  'Av. Brasil',
  'Av. Salaverry',
  'Av. Petit Thouars',
  'Av. Arenales',
  'Av. Javier Prado',
  'Av. La Marina',
  'Av. Faucett',
  'Av. Túpac Amaru',
  'Av. Los Alisos',
  'Av. Próceres',
  'Av. Canadá',
  'Av. Velasco Astete',
  'Av. Angamos',
  'Av. Pachacútec',
];

const TIPOS = ['Av.', 'Av.', 'Av.', 'Jr.', 'Calle'];

/**
 * Genera una dirección con formato peruano: «Av. Arequipa 1234».
 * Sustituible por captura manual o geocodificación inversa.
 */
export function direccionFalsa(): string {
  // En Lima domina la avenida; las calles y jirones son minoría.
  const usarTipo = Math.random() < 0.35;
  const base = VIAS[Math.floor(Math.random() * VIAS.length)];
  const via = usarTipo ? base : `${TIPOS[Math.floor(Math.random() * TIPOS.length)]} ${base.replace(/^Av\. /, '')}`;
  const numero = 100 + Math.floor(Math.random() * 2900);
  const interior = Math.random() < 0.2 ? ` Dpto. ${100 + Math.floor(Math.random() * 800)}` : '';
  return `${via} ${numero}${interior}`;
}
