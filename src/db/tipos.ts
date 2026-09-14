/**
 * Tipos de las filas tal como las devuelve SQLite (nombres en snake_case,
 * iguales a las columnas). Se mantienen deliberadamente planos y separados de
 * los tipos de vista para que la capa de consultas sea la única que traduce.
 */

export interface Cliente {
  id: number;
  codigo: string;
  nombre: string;
  id_fiscal: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  tarifa_base: number;
  tarifa_kg: number;
  plazo_pago_dias: number;
  activo: number;
  created_at: string;
}

export interface Conductor {
  id: number;
  codigo: string;
  nombre: string;
  documento: string;
  telefono: string | null;
  email: string | null;
  tipo_vinculacion: 'empleado' | 'contratista';
  numero_licencia: string | null;
  licencia_categoria: string | null;
  licencia_vencimiento: string | null;
  comision_pct: number;
  salario_base: number;
  estado: 'activo' | 'inactivo' | 'vacaciones' | 'incapacidad';
  fecha_ingreso: string | null;
  created_at: string;
}

export type TipoUnidad = 'moto' | 'furgoneta' | 'camion_ligero' | 'camion' | 'camion_pesado';
export type EstadoUnidad = 'disponible' | 'en_ruta' | 'mantenimiento' | 'fuera_servicio';

export interface Unidad {
  id: number;
  placa: string;
  tipo: TipoUnidad;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  capacidad_kg: number;
  capacidad_m3: number;
  estado: EstadoUnidad;
  km_actual: number;
  rendimiento_esperado: number;
  conductor_fijo_id: number | null;
  observaciones: string | null;
  created_at: string;
}

export type TipoDocumento =
  | 'soat'
  | 'revision_tecnica'
  | 'seguro_todo_riesgo'
  | 'tarjeta_propiedad'
  | 'permiso_transito';

export interface DocumentoUnidad {
  id: number;
  unidad_id: number;
  tipo: TipoDocumento;
  numero: string | null;
  entidad: string | null;
  emision: string | null;
  vencimiento: string;
  costo: number;
  notas: string | null;
}

export interface Mantenimiento {
  id: number;
  unidad_id: number;
  tipo: 'preventivo' | 'correctivo';
  descripcion: string;
  fecha: string;
  km: number | null;
  costo: number;
  taller: string | null;
  estado: 'programado' | 'en_taller' | 'completado';
  proximo_km: number | null;
  proxima_fecha: string | null;
  created_at: string;
}

export type EstadoRuta = 'planificado' | 'en_curso' | 'completado' | 'cancelado';

export interface Ruta {
  id: number;
  codigo: string;
  fecha: string;
  zona: string;
  unidad_id: number | null;
  conductor_id: number | null;
  estado: EstadoRuta;
  km_inicial: number | null;
  km_final: number | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  notas: string | null;
  created_at: string;
}

export interface Parada {
  id: number;
  ruta_id: number;
  orden: number;
  direccion: string;
  ciudad: string | null;
  zona: string | null;
  lat: number;
  lng: number;
  estado: 'pendiente' | 'en_camino' | 'entregado' | 'fallido';
  hora_estimada: string | null;
  hora_real: string | null;
  notas: string | null;
}

export type EstadoEnvio = 'pendiente' | 'en_reparto' | 'entregado' | 'novedad' | 'devuelto';

/**
 * Canal por el que entró un pedido.
 *
 *  - `ruta`        — nació dentro de un despacho creado desde cero (lo antiguo).
 *  - `manual`      — alguien lo tecleó en el formulario.
 *  - `whatsapp`    — salió de pegar una conversación y revisarla.
 *  - `importacion` — vino de una planilla.
 */
export type OrigenPedido = 'ruta' | 'manual' | 'whatsapp' | 'importacion';

export interface Envio {
  id: number;
  guia: string;
  cliente_id: number;
  ruta_id: number | null;
  parada_id: number | null;
  remitente: string | null;
  destinatario: string;
  destinatario_tel: string | null;
  direccion: string | null;
  ciudad: string | null;
  zona: string | null;
  peso_kg: number;
  volumen_m3: number;
  valor_declarado: number;
  flete: number;
  estado: EstadoEnvio;
  fecha_compromiso: string | null;
  fecha_entrega: string | null;
  receptor: string | null;
  intentos: number;
  /** Canal de entrada del pedido. */
  origen: OrigenPedido;
  /** Importe a cobrar al entregar. 0 = nada que cobrar. */
  cobro_entrega: number;
  /** Cuántos bultos van con esta guía: una guía puede llevar varios. */
  bultos: number;
  /** Referencias para el conductor: «portón azul, preguntar por la Sra.» */
  notas: string | null;
  /** Quién dio de alta el pedido. */
  registrado_por: number | null;
  created_at: string;
}

export interface Novedad {
  id: number;
  envio_id: number;
  tipo: 'ausente' | 'direccion_errada' | 'rechazado' | 'danado' | 'reprogramado' | 'otro';
  descripcion: string | null;
  fecha: string;
  resuelto: number;
}

/**
 * Foto de prueba de entrega.
 *
 * No incluye `datos`: los bytes de la imagen solo se leen en el endpoint que la
 * sirve (`/api/foto/[id]`). Cargarlos en los listados multiplicaría por mil el
 * peso de cada consulta sin que nadie los mire.
 */
export interface FotoEntrega {
  id: number;
  parada_id: number;
  ruta_id: number;
  tipo_mime: string;
  tamano_bytes: number;
  ancho: number | null;
  alto: number | null;
  lat: number | null;
  lng: number | null;
  tomada_en: string;
  subida_por: number | null;
  created_at: string;
}

/** Foto con el nombre de quien la subió, para mostrarla en la ficha del despacho. */
export interface FotoEntregaDetallada extends FotoEntrega {
  subida_por_nombre: string | null;
}

export interface Posicion {
  id: number;
  unidad_id: number;
  ruta_id: number | null;
  lat: number;
  lng: number;
  velocidad_kmh: number;
  rumbo: number;
  /** Precisión en metros que informa el GPS del teléfono. NULL si es simulada. */
  precision_m: number | null;
  /** `simulacion` (botón de avance) o `dispositivo` (GPS real de un teléfono). */
  origen: 'simulacion' | 'dispositivo';
  timestamp: string;
}

export interface CargaCombustible {
  id: number;
  unidad_id: number;
  ruta_id: number | null;
  conductor_id: number | null;
  fecha: string;
  galones: number;
  precio_galon: number;
  total: number;
  km_actual: number | null;
  estacion: string | null;
  created_at: string;
}

export type CategoriaGasto = 'peaje' | 'parqueadero' | 'viatico' | 'lavado' | 'multa' | 'otro';

export interface Gasto {
  id: number;
  unidad_id: number | null;
  ruta_id: number | null;
  categoria: CategoriaGasto;
  descripcion: string | null;
  fecha: string;
  monto: number;
  comprobante: string | null;
  created_at: string;
}

export interface Factura {
  id: number;
  numero: string;
  cliente_id: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  subtotal: number;
  impuesto: number;
  total: number;
  estado: 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'anulada';
  fecha_pago: string | null;
  notas: string | null;
  created_at: string;
}

export interface FacturaItem {
  id: number;
  factura_id: number;
  envio_id: number | null;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  total: number;
}

export interface Liquidacion {
  id: number;
  codigo: string;
  conductor_id: number;
  periodo_inicio: string;
  periodo_fin: string;
  base: number;
  comisiones: number;
  bonificaciones: number;
  deducciones: number;
  total_pagar: number;
  estado: 'borrador' | 'aprobada' | 'pagada';
  fecha_pago: string | null;
  notas: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Tipos compuestos (resultado de JOINs)
// ─────────────────────────────────────────────────────────────

/** Ruta enriquecida con datos de unidad, conductor y conteos de paradas/envíos. */
export interface RutaResumen extends Ruta {
  placa: string | null;
  tipo_unidad: TipoUnidad | null;
  conductor: string | null;
  conductor_codigo: string | null;
  total_paradas: number;
  paradas_resueltas: number;
  total_envios: number;
  envios_entregados: number;
  envios_novedad: number;
  ingresos: number;
}

/** Fila de la lista de envíos con contexto de cliente y ruta. */
export interface EnvioDetallado extends Envio {
  cliente: string;
  ruta_codigo: string | null;
  conductor: string | null;
  placa: string | null;
}

/** Documento con datos de la unidad a la que pertenece. */
export interface DocumentoConUnidad extends DocumentoUnidad {
  placa: string;
  tipo_unidad: TipoUnidad;
  estado_unidad: EstadoUnidad;
}

/** Mantenimiento con datos de la unidad. */
export interface MantenimientoConUnidad extends Mantenimiento {
  placa: string;
  tipo_unidad: TipoUnidad;
}

/** Última posición conocida de una unidad, con contexto de su ruta activa. */
export interface UnidadEnVivo {
  unidad_id: number;
  placa: string;
  tipo: TipoUnidad;
  estado: EstadoUnidad;
  marca: string | null;
  modelo: string | null;
  lat: number;
  lng: number;
  velocidad_kmh: number;
  rumbo: number;
  timestamp: string;
  /** De dónde salió la última posición: del GPS de un teléfono o de la simulación. */
  origen: 'simulacion' | 'dispositivo';
  precision_m: number | null;
  ruta_id: number | null;
  ruta_codigo: string | null;
  zona: string | null;
  conductor: string | null;
  paradas_totales: number;
  paradas_resueltas: number;
  envios_pendientes: number;
}

/** Parada con el detalle de sus envíos (enriquecidos con cliente y ruta). */
export interface ParadaConEnvios extends Parada {
  envios: EnvioDetallado[];
}
