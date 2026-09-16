/**
 * Esquema de la base de datos para PostgreSQL.
 *
 * ── Decisiones de esta migración ──────────────────────────────────────────
 *
 * 1. **Las fechas siguen guardándose como TEXT** ('YYYY-MM-DD' o
 *    'YYYY-MM-DD HH:MM:SS'). Es deliberado: la aplicación calcula toda la
 *    aritmética de fechas en JavaScript (para no depender de la zona horaria
 *    del servidor) y compara con `BETWEEN`. Mantenerlas como texto conserva ese
 *    comportamiento exactamente igual y elimina el riesgo de conversiones
 *    implícitas silenciosas en las más de 150 consultas existentes. El orden
 *    lexicográfico de ese formato coincide con el cronológico.
 *    Pasar a columnas DATE/TIMESTAMPTZ es una mejora posterior y bien acotada,
 *    no urgente.
 *
 * 2. **Los importes usan DOUBLE PRECISION**, igual que antes (SQLite usaba
 *    REAL). Sobra precisión para importes en pesos con dos decimales. Si algún
 *    día se necesita aritmética decimal exacta para contabilidad, el cambio es
 *    a NUMERIC más un conversor de tipo en el cliente.
 *
 * 3. **Los booleanos siguen siendo INTEGER 0/1**, no BOOLEAN, para no tener que
 *    reescribir todas las condiciones del código.
 *
 * 4. Se conservan íntegras las restricciones CHECK, las claves foráneas y los
 *    índices del esquema anterior.
 */

export const SCHEMA_SQL = `
-- ─────────────────────────────────────────────────────────────
-- Terceros: clientes que contratan el servicio
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT    NOT NULL UNIQUE,
  nombre            TEXT    NOT NULL,
  id_fiscal         TEXT,
  contacto          TEXT,
  telefono          TEXT,
  email             TEXT,
  direccion         TEXT,
  ciudad            TEXT,
  tarifa_base       DOUBLE PRECISION NOT NULL DEFAULT 0,
  tarifa_kg         DOUBLE PRECISION NOT NULL DEFAULT 0,
  plazo_pago_dias   INTEGER NOT NULL DEFAULT 30,
  activo            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Conductores
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conductores (
  id                   SERIAL PRIMARY KEY,
  codigo               TEXT    NOT NULL UNIQUE,
  nombre               TEXT    NOT NULL,
  documento            TEXT    NOT NULL,
  telefono             TEXT,
  email                TEXT,
  tipo_vinculacion     TEXT    NOT NULL CHECK (tipo_vinculacion IN ('empleado','contratista')),
  numero_licencia      TEXT,
  licencia_categoria   TEXT,
  licencia_vencimiento TEXT,
  comision_pct         DOUBLE PRECISION NOT NULL DEFAULT 0,
  salario_base         DOUBLE PRECISION NOT NULL DEFAULT 0,
  estado               TEXT    NOT NULL DEFAULT 'activo'
                       CHECK (estado IN ('activo','inactivo','vacaciones','incapacidad')),
  fecha_ingreso        TEXT,
  created_at           TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Flota
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidades (
  id                   SERIAL PRIMARY KEY,
  placa                TEXT    NOT NULL UNIQUE,
  tipo                 TEXT    NOT NULL
                       CHECK (tipo IN ('moto','furgoneta','camion_ligero','camion','camion_pesado')),
  marca                TEXT,
  modelo               TEXT,
  anio                 INTEGER,
  capacidad_kg         DOUBLE PRECISION NOT NULL DEFAULT 0,
  capacidad_m3         DOUBLE PRECISION NOT NULL DEFAULT 0,
  estado               TEXT    NOT NULL DEFAULT 'disponible'
                       CHECK (estado IN ('disponible','en_ruta','mantenimiento','fuera_servicio')),
  km_actual            DOUBLE PRECISION NOT NULL DEFAULT 0,
  rendimiento_esperado DOUBLE PRECISION NOT NULL DEFAULT 0,
  conductor_fijo_id    INTEGER REFERENCES conductores(id) ON DELETE SET NULL,
  observaciones        TEXT,
  created_at           TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Documentación legal de cada unidad, con vencimientos
CREATE TABLE IF NOT EXISTS documentos_unidad (
  id          SERIAL PRIMARY KEY,
  unidad_id   INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo        TEXT    NOT NULL
              CHECK (tipo IN ('soat','revision_tecnica','seguro_todo_riesgo','tarjeta_propiedad','permiso_transito')),
  numero      TEXT,
  entidad     TEXT,
  emision     TEXT,
  vencimiento TEXT    NOT NULL,
  costo       DOUBLE PRECISION NOT NULL DEFAULT 0,
  notas       TEXT
);

CREATE TABLE IF NOT EXISTS mantenimientos (
  id            SERIAL PRIMARY KEY,
  unidad_id     INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('preventivo','correctivo')),
  descripcion   TEXT    NOT NULL,
  fecha         TEXT    NOT NULL,
  km            DOUBLE PRECISION,
  costo         DOUBLE PRECISION NOT NULL DEFAULT 0,
  taller        TEXT,
  estado        TEXT    NOT NULL DEFAULT 'completado'
                CHECK (estado IN ('programado','en_taller','completado')),
  proximo_km    DOUBLE PRECISION,
  proxima_fecha TEXT,
  created_at    TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Operación: hojas de ruta (despachos)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rutas (
  id           SERIAL PRIMARY KEY,
  codigo       TEXT    NOT NULL UNIQUE,
  fecha        TEXT    NOT NULL,
  zona         TEXT    NOT NULL,
  unidad_id    INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  conductor_id INTEGER REFERENCES conductores(id) ON DELETE SET NULL,
  estado       TEXT    NOT NULL DEFAULT 'planificado'
               CHECK (estado IN ('planificado','en_curso','completado','cancelado')),
  km_inicial   DOUBLE PRECISION,
  km_final     DOUBLE PRECISION,
  hora_salida  TEXT,
  hora_llegada TEXT,
  notas        TEXT,
  created_at   TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Paradas de una ruta (una parada puede agrupar varios envíos a la misma dirección)
CREATE TABLE IF NOT EXISTS paradas (
  id            SERIAL PRIMARY KEY,
  ruta_id       INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  orden         INTEGER NOT NULL,
  direccion     TEXT    NOT NULL,
  ciudad        TEXT,
  zona          TEXT,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  estado        TEXT    NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_camino','entregado','fallido')),
  hora_estimada TEXT,
  hora_real     TEXT,
  notas         TEXT
);

-- Envíos (guías / paquetes)
CREATE TABLE IF NOT EXISTS envios (
  id               SERIAL PRIMARY KEY,
  guia             TEXT    NOT NULL UNIQUE,
  cliente_id       INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  ruta_id          INTEGER REFERENCES rutas(id) ON DELETE SET NULL,
  parada_id        INTEGER REFERENCES paradas(id) ON DELETE SET NULL,
  remitente        TEXT,
  destinatario     TEXT    NOT NULL,
  destinatario_tel TEXT,
  direccion        TEXT,
  ciudad           TEXT,
  zona             TEXT,
  peso_kg          DOUBLE PRECISION NOT NULL DEFAULT 0,
  volumen_m3       DOUBLE PRECISION NOT NULL DEFAULT 0,
  valor_declarado  DOUBLE PRECISION NOT NULL DEFAULT 0,
  flete            DOUBLE PRECISION NOT NULL DEFAULT 0,
  estado           TEXT    NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','en_reparto','entregado','novedad','devuelto')),
  fecha_compromiso TEXT,
  fecha_entrega    TEXT,
  receptor         TEXT,
  intentos         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Novedades / incidencias de entrega
CREATE TABLE IF NOT EXISTS novedades (
  id          SERIAL PRIMARY KEY,
  envio_id    INTEGER NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  tipo        TEXT    NOT NULL
              CHECK (tipo IN ('ausente','direccion_errada','rechazado','danado','reprogramado','otro')),
  descripcion TEXT,
  fecha       TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  resuelto    INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- Prueba de entrega: la foto de quien recibe
-- ─────────────────────────────────────────────────────────────
-- La tabla «fotos_entrega» se define más abajo, al final del esquema, y no aquí
-- junto al resto del reparto: necesita referenciar «usuarios», que se crea
-- después de estas tablas. Un REFERENCES a una tabla que todavía no existe hace
-- fallar el esquema entero con «relation "usuarios" does not exist».

-- ─────────────────────────────────────────────────────────────
-- Telemetría GPS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posiciones (
  id            SERIAL PRIMARY KEY,
  unidad_id     INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  ruta_id       INTEGER REFERENCES rutas(id) ON DELETE SET NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  velocidad_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
  rumbo         DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- Precisión en metros que informa el GPS del teléfono. Es NULL en las
  -- posiciones simuladas, que no tienen esa información.
  precision_m   DOUBLE PRECISION,
  -- Origen: 'simulacion' (el botón de avance) o 'dispositivo' (GPS real).
  origen        TEXT    NOT NULL DEFAULT 'simulacion',
  timestamp     TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Costos operativos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combustible (
  id           SERIAL PRIMARY KEY,
  unidad_id    INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  ruta_id      INTEGER REFERENCES rutas(id) ON DELETE SET NULL,
  conductor_id INTEGER REFERENCES conductores(id) ON DELETE SET NULL,
  fecha        TEXT    NOT NULL,
  galones      DOUBLE PRECISION NOT NULL,
  precio_galon DOUBLE PRECISION NOT NULL,
  total        DOUBLE PRECISION NOT NULL,
  km_actual    DOUBLE PRECISION,
  estacion     TEXT,
  created_at   TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS gastos (
  id          SERIAL PRIMARY KEY,
  unidad_id   INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  ruta_id     INTEGER REFERENCES rutas(id) ON DELETE SET NULL,
  categoria   TEXT    NOT NULL
              CHECK (categoria IN ('peaje','parqueadero','viatico','lavado','multa','otro')),
  descripcion TEXT,
  fecha       TEXT    NOT NULL,
  monto       DOUBLE PRECISION NOT NULL DEFAULT 0,
  comprobante TEXT,
  created_at  TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Facturación y cartera
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id                SERIAL PRIMARY KEY,
  numero            TEXT    NOT NULL UNIQUE,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  fecha_emision     TEXT    NOT NULL,
  fecha_vencimiento TEXT    NOT NULL,
  subtotal          DOUBLE PRECISION NOT NULL DEFAULT 0,
  impuesto          DOUBLE PRECISION NOT NULL DEFAULT 0,
  total             DOUBLE PRECISION NOT NULL DEFAULT 0,
  estado            TEXT    NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador','emitida','pagada','vencida','anulada')),
  fecha_pago        TEXT,
  notas             TEXT,
  created_at        TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS factura_items (
  id             SERIAL PRIMARY KEY,
  factura_id     INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  envio_id       INTEGER REFERENCES envios(id) ON DELETE SET NULL,
  descripcion    TEXT    NOT NULL,
  cantidad       INTEGER NOT NULL DEFAULT 1,
  valor_unitario DOUBLE PRECISION NOT NULL DEFAULT 0,
  total          DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- Liquidación a conductores
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liquidaciones (
  id             SERIAL PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  conductor_id   INTEGER NOT NULL REFERENCES conductores(id) ON DELETE CASCADE,
  periodo_inicio TEXT    NOT NULL,
  periodo_fin    TEXT    NOT NULL,
  base           DOUBLE PRECISION NOT NULL DEFAULT 0,
  comisiones     DOUBLE PRECISION NOT NULL DEFAULT 0,
  bonificaciones DOUBLE PRECISION NOT NULL DEFAULT 0,
  deducciones    DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_pagar    DOUBLE PRECISION NOT NULL DEFAULT 0,
  estado         TEXT    NOT NULL DEFAULT 'borrador'
                 CHECK (estado IN ('borrador','aprobada','pagada')),
  fecha_pago     TEXT,
  notas          TEXT,
  created_at     TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Usuarios y sesiones
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  nombre        TEXT    NOT NULL,
  -- La contraseña NUNCA se guarda en claro: se guarda el resultado de scrypt
  -- junto con su sal. Ver src/lib/auth/claves.ts.
  hash_clave    TEXT    NOT NULL,
  sal_clave     TEXT    NOT NULL,
  rol           TEXT    NOT NULL
                CHECK (rol IN ('administracion','despachador','conductor','gerencia')),
  -- Solo para el rol «conductor»: a qué conductor corresponde este usuario.
  conductor_id  INTEGER REFERENCES conductores(id) ON DELETE SET NULL,
  activo        INTEGER NOT NULL DEFAULT 1,
  ultimo_acceso TEXT,
  created_at    TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sesiones (
  id         SERIAL PRIMARY KEY,
  -- Se guarda el HASH del token, no el token: si alguien lee la tabla no puede
  -- suplantar la sesión de nadie.
  token_hash TEXT    NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada     TEXT    NOT NULL,
  expira     TEXT    NOT NULL,
  user_agent TEXT
);

-- ─────────────────────────────────────────────────────────────
-- Prueba de entrega: la foto de quien recibe
-- ─────────────────────────────────────────────────────────────
-- La imagen se guarda EN LA BASE DE DATOS, no en el disco del servidor. El
-- contenedor de Railway tiene un sistema de archivos efímero: cualquier foto
-- escrita en disco desaparece en el siguiente despliegue, justo cuando más falta
-- hace que siga ahí. Guardarla aquí la mantiene junto a la entrega, dentro de la
-- misma transacción, y entra en las copias de seguridad sin hacer nada.
--
-- Lo que lo hace viable es que el navegador REDUCE la foto antes de subirla (ver
-- «src/components/entrega/FotoEntrega.tsx»): de los 4 MB que saca la cámara se
-- queda en unos 150 KB. Para volúmenes altos conviene moverla a un
-- almacenamiento de objetos (S3, Cloudflare R2) y dejar aquí solo la referencia.
CREATE TABLE IF NOT EXISTS fotos_entrega (
  id           SERIAL PRIMARY KEY,
  parada_id    INTEGER NOT NULL REFERENCES paradas(id) ON DELETE CASCADE,
  ruta_id      INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  datos        BYTEA   NOT NULL,
  tipo_mime    TEXT    NOT NULL DEFAULT 'image/jpeg',
  tamano_bytes INTEGER NOT NULL DEFAULT 0,
  ancho        INTEGER,
  alto         INTEGER,
  -- Dónde y cuándo se tomó, según el propio teléfono: forma parte de la prueba.
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  tomada_en    TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
  -- Quién la subió. Deja rastro aunque el conductor cambie de ruta después.
  subida_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ─────────────────────────────────────────────────────────────
-- Identidad de la empresa que usa la instalación
-- ─────────────────────────────────────────────────────────────
-- Una sola fila (siempre «id = 1») con el nombre, los datos fiscales y el logo
-- de la empresa. Es lo que permite instalar el mismo programa para empresas
-- distintas sin tocar código: cada una pone su marca desde la aplicación.
--
-- El logo se guarda aquí, como las fotos de entrega, porque el contenedor de
-- Railway tiene el sistema de archivos efímero: un archivo en disco
-- desaparecería en el siguiente despliegue.
--
-- Va al final del esquema, después de «usuarios», por el mismo motivo que
-- «fotos_entrega»: la referencia a esa tabla exige que ya exista.
CREATE TABLE IF NOT EXISTS configuracion (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT NOT NULL,
  nombre_corto    TEXT NOT NULL,
  id_fiscal       TEXT,
  telefono        TEXT,
  ciudad          TEXT,
  logo            BYTEA,
  logo_mime       TEXT,
  actualizado     TEXT,
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────
-- Índices para las consultas más frecuentes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_envios_ruta       ON envios(ruta_id);
CREATE INDEX IF NOT EXISTS idx_envios_estado     ON envios(estado);
CREATE INDEX IF NOT EXISTS idx_envios_cliente    ON envios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_paradas_ruta      ON paradas(ruta_id, orden);
CREATE INDEX IF NOT EXISTS idx_rutas_fecha       ON rutas(fecha);
CREATE INDEX IF NOT EXISTS idx_rutas_conductor   ON rutas(conductor_id);
CREATE INDEX IF NOT EXISTS idx_posiciones_unidad ON posiciones(unidad_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_docs_unidad       ON documentos_unidad(unidad_id);
CREATE INDEX IF NOT EXISTS idx_docs_vencimiento  ON documentos_unidad(vencimiento);
CREATE INDEX IF NOT EXISTS idx_combustible_fecha ON combustible(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha      ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_facturas_estado   ON facturas(estado);
CREATE INDEX IF NOT EXISTS idx_mant_unidad       ON mantenimientos(unidad_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_hash     ON sesiones(token_hash);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario  ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email    ON usuarios(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_fotos_parada      ON fotos_entrega(parada_id);
CREATE INDEX IF NOT EXISTS idx_fotos_ruta        ON fotos_entrega(ruta_id);

-- ─────────────────────────────────────────────────────────────
-- Cambios posteriores al esquema inicial
-- ─────────────────────────────────────────────────────────────
-- El esquema se crea con CREATE TABLE IF NOT EXISTS, y eso significa que una
-- tabla que **ya existe no recibe columnas nuevas**. Estas sentencias son
-- idempotentes y hacen que una base ya en marcha se ponga al día sola al
-- arrancar, sin obligar a nadie a regenerar los datos.
--
-- No sustituye a unas migraciones versionadas —no renombra ni borra columnas—,
-- pero cubre el caso más frecuente con diferencia: añadir un campo.
ALTER TABLE envios ADD COLUMN IF NOT EXISTS origen         TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE envios ADD COLUMN IF NOT EXISTS cobro_entrega  DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS bultos         INTEGER NOT NULL DEFAULT 1;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS notas          TEXT;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

-- Los pedidos sin asignar son la bandeja de entrada: se consultan continuamente.
CREATE INDEX IF NOT EXISTS idx_envios_sin_asignar ON envios(estado) WHERE ruta_id IS NULL;
`;

/** Nombres de todas las tablas, en orden de borrado seguro (hijas primero). */
export const TABLAS_EN_ORDEN_DE_BORRADO = [
  'sesiones',
  'usuarios',
  'novedades',
  'fotos_entrega',
  'configuracion',
  'factura_items',
  'posiciones',
  'combustible',
  'gastos',
  'mantenimientos',
  'documentos_unidad',
  'envios',
  'paradas',
  'rutas',
  'facturas',
  'liquidaciones',
  'unidades',
  'conductores',
  'clientes',
] as const;

/**
 * Borra todas las tablas. Se usa al regenerar los datos de ejemplo.
 * `CASCADE` elimina también las dependencias, así que el orden da igual.
 */
export const SQL_BORRAR_TODO = TABLAS_EN_ORDEN_DE_BORRADO.map(
  (t) => `DROP TABLE IF EXISTS ${t} CASCADE;`,
).join('\n');
