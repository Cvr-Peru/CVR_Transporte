/**
 * Generador de datos de ejemplo.
 *
 *   npm run seed
 *   npm run seed:si-falta
 *
 * Borra la base de datos y la reconstruye con 45 días de operación coherente:
 * rutas, paradas, envíos, telemetría GPS, combustible, gastos, facturas y
 * liquidaciones. Todo se deriva de la fecha de hoy, así que el prototipo
 * siempre se ve "vivo" sin importar cuándo se ejecute.
 *
 * El azar usa una semilla fija (mulberry32) para que dos ejecuciones seguidas
 * produzcan exactamente los mismos datos. Por eso el orden de las llamadas al
 * azar es parte del contrato: no se deben reordenar bucles ni argumentos.
 *
 * Los datos simulan una operación de última milla en **Lima (Perú)**: distritos
 * de Lima, RUC, DNI, soles, IGV del 18 %, placas peruanas y grifos locales.
 *
 * La base es PostgreSQL (PGlite en local; `pg` si hay `DATABASE_URL`), así que
 * todo es asíncrono: cada consulta lleva `await`, los marcadores son
 * `$1, $2, …` y los INSERT que necesitan el identificador acaban en
 * `RETURNING id`.
 */
// Extensión explícita obligatoria: este archivo lo ejecuta Node directamente
// (sin bundler) aprovechando el soporte nativo de TypeScript de Node 24.
import {
  all,
  cerrarMotor,
  descripcionMotor,
  escalar,
  ejecutarScript,
  get,
  run,
  transaccion,
} from '../src/db/client.ts';
import {
  SCHEMA_SQL,
  SQL_BORRAR_TODO,
  TABLAS_EN_ORDEN_DE_BORRADO,
} from '../src/db/schema.ts';
import { generarSal, hashClave } from '../src/lib/auth/claves.ts';
import { CLAVE_DEMO, CUENTAS_DEMO } from '../src/lib/auth/demo.ts';
import { empresa } from '../src/config/empresa.ts';
// Los distritos de Lima viven en un único sitio (`src/lib/zonas.ts`) para que el
// generador de datos y la aplicación no se desincronicen.
import { ZONAS } from '../src/lib/zonas.ts';
// Las fotos de prueba de entrega de los datos de ejemplo se dibujan aquí.
import { fotoDePrueba } from './foto-sintetica.ts';

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────
function mulberry32(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260214);
const entre = (min: number, max: number) => min + rnd() * (max - min);
const entero = (min: number, max: number) => Math.floor(entre(min, max + 1));
const elegir = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const azar = (probabilidad: number) => rnd() < probabilidad;
const red = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Tres letras de placa (base 26) a partir de un entero de 0 a 17 575. */
function tresLetras(n: number): string {
  return ALFABETO[Math.floor(n / 676) % 26] + ALFABETO[Math.floor(n / 26) % 26] + ALFABETO[n % 26];
}

function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
function aISOCompleto(d: Date): string {
  return `${aISO(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}:${String(d.getSeconds()).padStart(2, '0')}`;
}
function sumarDias(d: Date, dias: number): Date {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + dias);
  return c;
}
function conHora(base: Date, hora: number, minuto: number): Date {
  const c = new Date(base.getTime());
  c.setHours(hora, minuto, 0, 0);
  return c;
}

const HOY = new Date();
HOY.setHours(0, 0, 0, 0);

// ─────────────────────────────────────────────────────────────
// Catálogos base
// ─────────────────────────────────────────────────────────────
// Las zonas operativas ya no se duplican aquí: son los distritos de Lima de
// `src/lib/zonas.ts`, los mismos que usa el formulario de despacho.

/** Avenidas reales de Lima: en la ciudad el reparto va casi siempre por avenida. */
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

const TIPOS_VIA = ['Av.', 'Av.', 'Av.', 'Jr.', 'Calle'];

/**
 * Dirección con formato peruano: «Av. Arequipa 1234».
 *
 * Consume exactamente cinco valores del generador con semilla fija —los mismos
 * que la versión anterior—: la semilla es parte del contrato de estos datos, así
 * que no se pueden añadir ni quitar llamadas al azar.
 */
function direccionFalsa(): string {
  const base = elegir(VIAS);
  const tipo = elegir(TIPOS_VIA);
  const via = tipo === 'Av.' ? base : `${tipo} ${base.replace(/^Av\. /, '')}`;
  const numero = entero(100, 2_999);
  const interior = entero(100, 899);
  const conInterior = azar(0.2);
  return `${via} ${numero}${conInterior ? ` Dpto. ${interior}` : ''}`;
}

const NOMBRES = [
  'Juan Carlos Quispe Flores', 'Luis Alberto Mamani Choque', 'Jorge Luis Huamán Rojas',
  'Carlos Enrique Vílchez Díaz', 'Miguel Ángel Quispe Ayala', 'José Antonio Ríos Salazar',
  'Percy Alejandro Chávez Núñez', 'Walter Iván Ccahuana Ramos', 'Édgar Rolando Ticona Nina',
  'Ronald Alberto Cárdenas Vega', 'César Augusto Yupanqui Torres', 'Víctor Hugo Aliaga Mendoza',
  'Marco Antonio Rojas Paredes', 'Julio César Espinoza Bravo', 'Elmer Gustavo Palomino Ledesma',
  'Álvaro Raúl Bustamante Sotelo',
];

const CLIENTES_BASE = [
  { nombre: 'Distribuidora Andina S.A.C.', contacto: 'Rosa Elvira Chávez', plazo: 30 },
  { nombre: 'Comercial Miraflores E.I.R.L.', contacto: 'Jorge Luis Paredes', plazo: 45 },
  { nombre: 'Droguería San Pablo S.A.C.', contacto: 'Maritza Zegarra', plazo: 30 },
  { nombre: 'Supermercados El Sol S.A.C.', contacto: 'Raúl Delgado', plazo: 60 },
  { nombre: 'Distribuidora El Trigal S.A.C.', contacto: 'Sandra Loayza', plazo: 30 },
  { nombre: 'Repuestos Andinos S.A.C.', contacto: 'Gustavo Paredes', plazo: 45 },
  { nombre: 'Librería Papel & Tinta E.I.R.L.', contacto: 'Ana María Loayza', plazo: 30 },
  { nombre: 'Cosméticos Bella Piel S.A.C.', contacto: 'Lorena Fernández', plazo: 30 },
  { nombre: 'Ferretería Central S.A.C.', contacto: 'Iván Rojas', plazo: 60 },
  { nombre: 'Mascotas Felices E.I.R.L.', contacto: 'Daniela Quispe', plazo: 15 },
] as const;

type TipoUnidad = 'moto' | 'furgoneta' | 'camion_ligero' | 'camion' | 'camion_pesado';

const MODELOS: Record<TipoUnidad, { marca: string; modelos: string[]; capKg: [number, number]; capM3: [number, number]; rend: number }> = {
  moto: { marca: 'Bajaj', modelos: ['Boxer CT 100', 'Boxer 150', 'Pulsar NS 200'], capKg: [40, 80], capM3: [0.15, 0.3], rend: 105 },
  furgoneta: { marca: 'Renault', modelos: ['Kangoo', 'Logan Van', 'Express'], capKg: [600, 900], capM3: [3, 4.5], rend: 38 },
  camion_ligero: { marca: 'Chevrolet', modelos: ['NHR', 'NKR', 'FVR'], capKg: [1500, 3200], capM3: [10, 18], rend: 27 },
  camion: { marca: 'Hino', modelos: ['300 Serie', '500 Serie'], capKg: [4500, 8000], capM3: [22, 34], rend: 18 },
  camion_pesado: { marca: 'Kenworth', modelos: ['T370', 'T680'], capKg: [12000, 20000], capM3: [40, 55], rend: 12 },
};

const TIPOS_FLOTA: TipoUnidad[] = [
  'moto', 'moto', 'moto', 'moto',
  'furgoneta', 'furgoneta', 'furgoneta', 'furgoneta', 'furgoneta',
  'camion_ligero', 'camion_ligero', 'camion_ligero',
  'camion', 'camion',
  'camion_pesado', 'camion_pesado',
];

const ESTACIONES = ['Primax Av. Arequipa', 'Repsol Javier Prado', 'Pecsa La Marina', 'Petroperú Av. Canadá', 'Grifo San Martín'];

// ─────────────────────────────────────────────────────────────
// Preparación de la base de datos
// ─────────────────────────────────────────────────────────────
// Con --si-falta el script no regenera nada si la base ya tiene datos. Se usa
// como paso previo al arranque en el servidor, donde solo interesa sembrar la
// primera vez: así los datos creados por el usuario no se pierden en cada
// despliegue. Ya no hay archivo que comprobar: la base se considera con datos
// si la tabla `rutas` tiene filas.
if (process.argv.includes('--si-falta')) {
  let rutas = 0;
  try {
    // Si la tabla todavía no existe, el SELECT falla y se trata como base vacía.
    rutas = Number((await escalar<number>('SELECT COUNT(*) AS n FROM rutas')) ?? 0);
  } catch {
    rutas = 0;
  }

  if (rutas > 0) {
    console.log(`\n  La base de datos ya contiene datos (${rutas} rutas).`);
    console.log(`  Motor: ${descripcionMotor()}`);
    console.log('  No se regenera nada (opción --si-falta).\n');
    await cerrarMotor();
    process.exit(0);
  }
}

// Se borran todas las tablas y se vuelven a crear: la base queda limpia y las
// secuencias de los identificadores vuelven a empezar en 1.
await ejecutarScript(SQL_BORRAR_TODO);
await ejecutarScript(SCHEMA_SQL);

async function ins(sql: string, ...params: unknown[]): Promise<number> {
  const { id } = await run(sql, ...params);
  return id ?? 0;
}

await transaccion(async () => {
  // ─────────────────────────────────────────────────────────────
  // 1. Clientes
  // ─────────────────────────────────────────────────────────────
  const idsClientes: number[] = [];
  const tarifasPorCliente = new Map<number, { base: number; kg: number }>();

  for (const [i, c] of CLIENTES_BASE.entries()) {
    const tarifaBase = red(entre(6, 14), 2);
    const tarifaKg = red(entre(1, 3), 2);
    const id = await ins(
      `INSERT INTO clientes (codigo, nombre, id_fiscal, contacto, telefono, email, direccion, ciudad, tarifa_base, tarifa_kg, plazo_pago_dias, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      `CLI-${String(i + 1).padStart(3, '0')}`,
      c.nombre,
      // RUC de empresa peruana: 11 dígitos que empiezan por 20.
      // Se conservan las cuatro llamadas al azar de la versión anterior.
      `20${entero(1, 9)}${entero(10, 99)}${entero(100, 999)}${entero(100, 999)}`,
      c.contacto,
      // Teléfono fijo de Lima: +51 1 XXX XXXX
      `+51 1 ${entero(2, 7)}${entero(10, 99)} ${entero(1000, 9999)}`,
      `contacto@${c.nombre.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}.pe`,
      direccionFalsa(),
      'Lima',
      tarifaBase,
      tarifaKg,
      c.plazo,
      1,
    );
    idsClientes.push(id);
    tarifasPorCliente.set(id, { base: tarifaBase, kg: tarifaKg });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Conductores
  // ─────────────────────────────────────────────────────────────
  const idsConductores: number[] = [];
  const conductoresInfo: { id: number; tipo: string; comision: number; salario: number; nombre: string }[] = [];

  for (const [i, nombre] of NOMBRES.entries()) {
    const tipo = azar(0.62) ? 'contratista' : 'empleado';
    const comision = tipo === 'contratista' ? red(entre(15, 22), 1) : red(entre(6, 10), 1);
    const salario = tipo === 'empleado' ? red(entre(1_500, 2_600), -1) : 0;
    const categoria = elegir(['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'B-IIa']);
    // Mezcla deliberada de licencias vigentes, por vencer y vencidas.
    const diasLicencia = i % 6 === 0 ? entero(-70, -5) : i % 5 === 0 ? entero(1, 28) : entero(60, 900);
    const estado = i === 13 ? 'vacaciones' : i === 15 ? 'incapacidad' : 'activo';

    const id = await ins(
      `INSERT INTO conductores (codigo, nombre, documento, telefono, email, tipo_vinculacion, numero_licencia,
        licencia_categoria, licencia_vencimiento, comision_pct, salario_base, estado, fecha_ingreso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      `CON-${String(i + 1).padStart(3, '0')}`,
      nombre,
      // DNI peruano: 8 dígitos sin puntos (tres llamadas, como antes).
      `${entero(10, 99)}${entero(100, 999)}${entero(100, 999)}`,
      // Móvil peruano: +51 9XX XXX XXX
      `+51 9${entero(10, 99)} ${entero(100, 999)} ${entero(100, 999)}`,
      `${nombre.split(' ')[0].toLowerCase()}.${nombre.split(' ').pop()!.toLowerCase()}@limaexpress.pe`
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      tipo,
      String(entero(10_000_000, 99_999_999)),
      categoria,
      aISO(sumarDias(HOY, diasLicencia)),
      comision,
      salario,
      estado,
      aISO(sumarDias(HOY, -entero(200, 1800))),
    );
    idsConductores.push(id);
    conductoresInfo.push({ id, tipo, comision, salario, nombre });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Unidades + documentación + mantenimiento
  // ─────────────────────────────────────────────────────────────
  const idsUnidades: number[] = [];
  const unidadesInfo: { id: number; placa: string; tipo: TipoUnidad; rend: number; capKg: number }[] = [];

  for (const [i, tipo] of TIPOS_FLOTA.entries()) {
    const spec = MODELOS[tipo];
    const num = String(i + 1).padStart(3, '0');
    // Placa peruana: tres letras y tres números (ABC123), también para las motos.
    // Cada rama consume los mismos valores al azar que antes (la moto dos, el
    // resto tres) para no desplazar la semilla fija.
    const placa =
      tipo === 'moto'
        ? `${tresLetras(entero(0, 17_575))}${entero(100, 999)}`
        : `${tresLetras(entero(0, 17_575))}${entero(1, 9)}${entero(10, 99)}`;
    const capKg = Math.round(entre(spec.capKg[0], spec.capKg[1]));
    const kmActual = Math.round(entre(4_000, 240_000));
    const estado =
      i === 14 ? 'fuera_servicio' : i === 16 ? 'mantenimiento' : 'disponible';

    const id = await ins(
      `INSERT INTO unidades (placa, tipo, marca, modelo, anio, capacidad_kg, capacidad_m3, estado, km_actual,
        rendimiento_esperado, conductor_fijo_id, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      placa,
      tipo,
      spec.marca,
      elegir(spec.modelos),
      entero(2015, 2025),
      capKg,
      red(entre(spec.capM3[0], spec.capM3[1]), 1),
      estado,
      kmActual,
      spec.rend,
      i % 3 === 0 ? idsConductores[i % idsConductores.length] : null,
      i === 14 ? 'Siniestro en trámite con la aseguradora desde hace 3 semanas.' : null,
    );
    idsUnidades.push(id);
    unidadesInfo.push({ id, placa, tipo, rend: spec.rend, capKg });

    // ── Documentación legal, con vencimientos repartidos a propósito ──
    const patronVencimiento = (offset: number): number => {
      if (i % 7 === offset) return entero(-90, -3); // vencido
      if (i % 5 === offset) return entero(1, 9); // crítico
      if (i % 3 === offset) return entero(12, 29); // por vencer
      return entero(45, 420); // vigente
    };

    const docs: { tipo: string; entidad: string; costo: number; dias: number }[] = [
      { tipo: 'soat', entidad: elegir(['Rímac Seguros', 'Pacífico Seguros', 'Mapfre Perú', 'La Positiva']), costo: red(entre(200, 900), -1), dias: patronVencimiento(0) },
      { tipo: 'revision_tecnica', entidad: elegir(['LIDERCON', 'Certificadora Vehicular Sur', 'Planta de Revisión Técnica Norte']), costo: red(entre(150, 250), -1), dias: patronVencimiento(1) },
      { tipo: 'seguro_todo_riesgo', entidad: elegir(['Rímac Seguros', 'Pacífico Seguros', 'Mapfre Perú']), costo: red(entre(1_200, 4_000), -1), dias: patronVencimiento(2) },
      { tipo: 'tarjeta_propiedad', entidad: 'SUNARP', costo: 0, dias: entero(300, 2000) },
    ];
    if (tipo !== 'moto') {
      docs.push({ tipo: 'permiso_transito', entidad: 'MTC', costo: red(entre(90, 210), -1), dias: patronVencimiento(3) });
    }

    for (const d of docs) {
      const vencimiento = sumarDias(HOY, d.dias);
      await ins(
        `INSERT INTO documentos_unidad (unidad_id, tipo, numero, entidad, emision, vencimiento, costo, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        id,
        d.tipo,
        String(entero(100_000_000, 999_999_999)),
        d.entidad,
        aISO(sumarDias(vencimiento, -365)),
        aISO(vencimiento),
        d.costo,
        d.dias < 0 ? 'Pendiente de renovación. Unidad no puede operar sin este documento.' : null,
      );
    }

    // ── Historial de mantenimiento ──
    const numMant = entero(1, 4);
    for (let m = 0; m < numMant; m++) {
      const diasAtras = entero(20, 400);
      const fecha = sumarDias(HOY, -diasAtras);
      const correctivo = azar(0.32);
      const costo = correctivo ? red(entre(350, 4_800), -1) : red(entre(120, 900), -1);
      await ins(
        `INSERT INTO mantenimientos (unidad_id, tipo, descripcion, fecha, km, costo, taller, estado, proximo_km, proxima_fecha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        id,
        correctivo ? 'correctivo' : 'preventivo',
        correctivo
          ? elegir(['Cambio de pastillas y discos', 'Reparación de caja', 'Cambio de embrague', 'Reparación de suspensión', 'Cambio de alternador'])
          : elegir(['Cambio de aceite y filtros', 'Alineación y balanceo', 'Mantenimiento de 10 000 km', 'Revisión de frenos', 'Cambio de bujías']),
        aISO(fecha),
        Math.max(1000, kmActual - diasAtras * 90),
        costo,
        elegir(['Taller Quispe Motors', 'Serviteca Los Andes', 'Taller Mecánico Huascarán', 'Concesionario Divemotor']),
        'completado',
        null,
        null,
      );
    }
    // Mantenimientos programados a futuro
    if (i % 4 === 0) {
      await ins(
        `INSERT INTO mantenimientos (unidad_id, tipo, descripcion, fecha, km, costo, taller, estado, proximo_km, proxima_fecha)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        id, 'preventivo',
        elegir(['Mantenimiento de 20 000 km', 'Cambio de aceite programado', 'Revisión general programada']),
        aISO(sumarDias(HOY, entero(2, 40))),
        kmActual + entero(500, 3000),
        red(entre(200, 800), -1),
        'Taller Quispe Motors',
        'programado',
        kmActual + entero(1000, 5000),
        aISO(sumarDias(HOY, entero(20, 90))),
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Rutas, paradas y envíos
  // ─────────────────────────────────────────────────────────────
  let contadorGuia = 0;
  const rutasCreadas: { id: number; fecha: string; unidadId: number | null; conductorId: number | null; estado: string; ingresos: number; km: number }[] = [];

  const ESTADOS_RUTA_PASADO = ['completado', 'completado', 'completado', 'completado', 'completado', 'cancelado'];

  async function crearRuta(
    fecha: Date,
    estado: string,
    zona: { nombre: string; lat: number; lng: number },
    unidadIdx: number,
    conductorIdx: number,
    numParadas: number,
  ): Promise<void> {
    const unidad = unidadesInfo[unidadIdx % unidadesInfo.length];
    const conductor = conductoresInfo[conductorIdx % conductoresInfo.length];
    const horaSalida = entero(6, 9);
    const horaSalidaMin = elegir([0, 15, 30, 45]);
    const kmInicial = Math.round(unidad.rend * 0 + entre(4000, 240000));
    const kmRecorrido = red(entre(28, 145), 1);
    const kmFinal = Math.round(kmInicial + kmRecorrido);
    const codigo = `RUT-${aISO(fecha).replace(/-/g, '')}-${String(rutasCreadas.length + 1).padStart(4, '0')}`;

    // Cuántos días hace de esta ruta. Sirve para no llenar la base con fotos de
    // los 45 días de histórico: solo se generan en los repartos recientes.
    const antiguedadDias = Math.round((HOY.getTime() - fecha.getTime()) / 86_400_000);

    const id = await ins(
      `INSERT INTO rutas (codigo, fecha, zona, unidad_id, conductor_id, estado, km_inicial, km_final, hora_salida, hora_llegada, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      codigo,
      aISO(fecha),
      zona.nombre,
      unidad.id,
      conductor.id,
      estado,
      kmInicial,
      estado === 'planificado' ? null : kmFinal,
      `${String(horaSalida).padStart(2, '0')}:${String(horaSalidaMin).padStart(2, '0')}`,
      estado === 'completado' ? `${String(horaSalida + entero(5, 9)).padStart(2, '0')}:${String(elegir([5, 20, 35, 50])).padStart(2, '0')}` : null,
      azar(0.15) ? elegir(['Zona con restricción de tránsito para vehículos de carga.', 'Cliente solicitó entrega antes de las 12:00.', 'Ruta compartida con el operador logístico aliado.']) : null,
    );

    // Paradas ordenadas por cercanía aproximada dentro de la zona
    const puntos: { lat: number; lng: number; direccion: string }[] = [];
    for (let p = 0; p < numParadas; p++) {
      const direccion = direccionFalsa();
      puntos.push({
        lat: red(zona.lat + entre(-0.022, 0.022), 6),
        lng: red(zona.lng + entre(-0.024, 0.024), 6),
        direccion,
      });
    }

    let ingresosRuta = 0;
    let horaParada = horaSalida * 60 + horaSalidaMin + entero(20, 40);

    // ¿Cuántas paradas lleva resueltas esta ruta?
    //
    // Solo pueden estar resueltas en una ruta que ya salió: una planificada
    // todavía no ha empezado y una cancelada no llegó a salir. Antes se repartían
    // al azar entre todas, lo que dejaba rutas «planificadas» con entregas ya
    // hechas —una contradicción— y rutas en curso casi terminadas, que es justo
    // lo contrario de lo que conviene enseñar en la pantalla del conductor.
    const entregadas =
      estado === 'completado' ? numParadas : estado === 'en_curso' ? entero(1, 2) : 0;

    for (let p = 0; p < puntos.length; p++) {
      const punto = puntos[p];
      horaParada += entero(22, 48);
      const horaEst = `${String(Math.floor(horaParada / 60) % 24).padStart(2, '0')}:${String(horaParada % 60).padStart(2, '0')}`;

      let estadoParada = 'pendiente';
      let horaReal: string | null = null;
      if (p < entregadas) {
        estadoParada = azar(0.93) ? 'entregado' : 'fallido';
        horaReal = horaEst;
      } else if (estado === 'en_curso' && p === entregadas) {
        estadoParada = 'en_camino';
      }

      const paradaId = await ins(
        `INSERT INTO paradas (ruta_id, orden, direccion, ciudad, zona, lat, lng, estado, hora_estimada, hora_real)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        id, p + 1, punto.direccion, 'Lima', zona.nombre, punto.lat, punto.lng,
        estadoParada, horaEst, horaReal,
      );

      // 1 a 3 envíos por parada
      const numEnvios = entero(1, 3);
      for (let e = 0; e < numEnvios; e++) {
        contadorGuia++;
        const clienteId = elegir(idsClientes);
        const tarifa = tarifasPorCliente.get(clienteId)!;
        const peso = red(entre(0.4, unidad.capKg / 12), 2);
        // Flete de última milla en soles: la banda comercial de Lima es S/ 8 a
        // S/ 35. La componente por kilo se acota a S/ 12 porque, sin tope, los
        // envíos de las unidades pesadas (que llegan a cientos de kilos)
        // dispararían el flete muy por encima de esa banda.
        const cargoPeso = Math.min(tarifa.kg * peso, 12);
        const flete = red(Math.max(8, tarifa.base + cargoPeso + entre(0, 4)), 2);
        const destinatario = NOMBRES[entero(0, NOMBRES.length - 1)].split(' ').slice(0, 2).join(' ');

        let estadoEnvio = 'pendiente';
        let fechaEntrega: string | null = null;
        let receptor: string | null = null;
        let intentos = 0;

        if (estadoParada === 'entregado') {
          estadoEnvio = 'entregado';
          fechaEntrega = `${aISO(fecha)} ${horaReal}`;
          receptor = destinatario;
          intentos = 1;
          ingresosRuta += flete;
        } else if (estadoParada === 'fallido') {
          estadoEnvio = azar(0.55) ? 'novedad' : 'devuelto';
          intentos = entero(1, 3);
          if (estadoEnvio === 'devuelto') ingresosRuta += 0;
        } else if (estado === 'en_curso' && p <= entregadas) {
          estadoEnvio = 'en_reparto';
        }

        const envioId = await ins(
          `INSERT INTO envios (guia, cliente_id, ruta_id, parada_id, remitente, destinatario, destinatario_tel, direccion,
            ciudad, zona, peso_kg, volumen_m3, valor_declarado, flete, estado, fecha_compromiso, fecha_entrega, receptor, intentos, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
          `TR-${aISO(fecha).replace(/-/g, '')}-${String(contadorGuia).padStart(5, '0')}`,
          clienteId, id, paradaId,
          CLIENTES_BASE[idsClientes.indexOf(clienteId)]?.nombre ?? 'Remitente',
          destinatario,
          `+51 9${entero(10, 99)} ${entero(100, 999)} ${entero(100, 999)}`,
          punto.direccion, 'Lima', zona.nombre,
          peso,
          red(peso / 250, 3),
          red(flete * entre(1.5, 4), -1),
          flete,
          estadoEnvio,
          aISO(fecha),
          fechaEntrega,
          receptor,
          intentos,
          `${aISO(fecha)} ${String(horaSalida).padStart(2, '0')}:${String(horaSalidaMin).padStart(2, '0')}:00`,
        );

        if (estadoEnvio === 'novedad' || estadoEnvio === 'devuelto') {
          await ins(
            `INSERT INTO novedades (envio_id, tipo, descripcion, fecha, resuelto)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            envioId,
            elegir(['ausente', 'direccion_errada', 'rechazado', 'danado', 'reprogramado']),
            elegir([
              'No había nadie en la dirección al momento de la entrega.',
              'La dirección registrada no corresponde a ninguna nómina del sector.',
              'El destinatario rechazó el pedido por estado del empaque.',
              'El paquete presentaba daños visibles en el empaque.',
              'El cliente pidió reprogramar la entrega para el día siguiente.',
            ]),
            `${aISO(fecha)} ${horaReal ?? '17:00'}:00`,
            azar(0.3) ? 1 : 0,
          );
        }
      }

      // ── Prueba de entrega: la foto de quien recibe ──────────
      // No la lleva toda entrega a propósito: en la operación real unas veces
      // falla la cámara y otras el conductor se olvida. Así la interfaz se ve
      // también en el caso de «entregado sin foto», que es el que hay que saber
      // reconocer cuando llega un reclamo.
      if (estadoParada === 'entregado' && antiguedadDias <= 2 && azar(0.75)) {
        const foto = fotoDePrueba(paradaId);
        await run(
          `INSERT INTO fotos_entrega
             (parada_id, ruta_id, datos, tipo_mime, tamano_bytes, ancho, alto, lat, lng, tomada_en)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          paradaId,
          id,
          foto.datos,
          'image/png',
          foto.datos.byteLength,
          foto.ancho,
          foto.alto,
          punto.lat,
          punto.lng,
          `${aISO(fecha)} ${horaEst}:00`,
        );
      }
    }

    rutasCreadas.push({
      id,
      fecha: aISO(fecha),
      unidadId: unidad.id,
      conductorId: conductor.id,
      estado,
      ingresos: ingresosRuta,
      km: estado === 'planificado' ? 0 : kmRecorrido,
    });
  }

  // Pasado: 45 días de operación
  for (let d = 45; d >= 1; d--) {
    const fecha = sumarDias(HOY, -d);
    const esDomingo = fecha.getDay() === 0;
    const numRutas = esDomingo ? entero(1, 2) : entero(3, 5);
    // Reparto round-robin para que todas las unidades y conductores tengan actividad
    for (let r = 0; r < numRutas; r++) {
      const idx = d * 7 + r;
      await crearRuta(
        fecha,
        elegir(ESTADOS_RUTA_PASADO),
        elegir(ZONAS),
        idx % unidadesInfo.length,
        idx % conductoresInfo.length,
        entero(6, 11),
      );
    }
  }

  // Hoy: rutas ya en curso + pendientes de despacho
  const rutasHoyEnCurso: typeof rutasCreadas = [];
  for (let r = 0; r < 7; r++) {
    const idx = 5000 + r;
    const estado = r < 5 ? 'en_curso' : 'planificado';
    const antes = rutasCreadas.length;
    await crearRuta(HOY, estado, elegir(ZONAS), idx % unidadesInfo.length, idx % conductoresInfo.length, entero(7, 11));
    if (estado === 'en_curso') rutasHoyEnCurso.push(rutasCreadas[antes]);
  }

  // Futuro: próximos 3 días planificados
  for (let d = 1; d <= 3; d++) {
    const fecha = sumarDias(HOY, d);
    for (let r = 0; r < entero(3, 5); r++) {
      const idx = 6000 + d * 10 + r;
      await crearRuta(fecha, 'planificado', elegir(ZONAS), idx % unidadesInfo.length, idx % conductoresInfo.length, entero(6, 10));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Telemetría GPS de las rutas en curso
  // ─────────────────────────────────────────────────────────────
  for (const ruta of rutasHoyEnCurso) {
    const paradas = await all<{ lat: number; lng: number; orden: number; estado: string }>(
      'SELECT lat, lng, orden, estado FROM paradas WHERE ruta_id = $1 ORDER BY orden',
      ruta.id,
    );
    if (paradas.length < 2) continue;

    const resueltas = paradas.filter((p) => p.estado === 'entregado' || p.estado === 'fallido');
    const desde = resueltas.length > 0 ? resueltas[resueltas.length - 1] : paradas[0];
    const hacia = paradas[Math.min(resueltas.length, paradas.length - 1)];

    // Trayectoria desde la última parada resuelta hasta la siguiente
    const PUNTOS = 22;
    const t0 = conHora(HOY, 7, entero(0, 40));
    for (let i = 0; i < PUNTOS; i++) {
      const t = i / (PUNTOS - 1);
      const curva = Math.sin(t * Math.PI) * 0.006; // desvío para que no sea una línea recta
      const lat = red(desde.lat + (hacia.lat - desde.lat) * t + curva + entre(-0.0009, 0.0009), 6);
      const lng = red(desde.lng + (hacia.lng - desde.lng) * t - curva + entre(-0.0009, 0.0009), 6);
      const ts = new Date(t0.getTime() + i * entre(2.5, 5) * 60_000);
      await ins(
        `INSERT INTO posiciones (unidad_id, ruta_id, lat, lng, velocidad_kmh, rumbo, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        ruta.unidadId, ruta.id, lat, lng,
        // Detenido al inicio y al final, en movimiento en medio
        red(i === 0 || i === PUNTOS - 1 ? entre(0, 4) : entre(12, 52), 1),
        red(entre(0, 359), 1),
        aISOCompleto(ts),
      );
    }
    if (ruta.unidadId) {
      await run(`UPDATE unidades SET estado = 'en_ruta', km_actual = km_actual WHERE id = $1`, ruta.unidadId);
    }
  }

  // Un rastro histórico para ayer (para que el visor de telemetría tenga contexto)
  await run(`UPDATE unidades SET estado = 'en_ruta' WHERE id IN (SELECT DISTINCT unidad_id FROM posiciones WHERE ruta_id IS NOT NULL)`);

  // ─────────────────────────────────────────────────────────────
  // 5b. Canal de entrada y buzón de pedidos
  // ─────────────────────────────────────────────────────────────
  // Los envíos creados dentro de un despacho ya están planificados; se marcan
  // como tales y se reparte un poco de variedad, porque en la operación real los
  // pedidos llegan por sitios distintos y la pantalla de Pedidos lo enseña.
  await run(`UPDATE envios SET origen = 'ruta' WHERE ruta_id IS NOT NULL`);
  await run(`UPDATE envios SET origen = 'whatsapp'    WHERE ruta_id IS NOT NULL AND (id % 5) = 0`);
  await run(`UPDATE envios SET origen = 'importacion' WHERE ruta_id IS NOT NULL AND (id % 17) = 0`);

  // Y ahora los que **todavía no están en ninguna ruta**: son los que acaban de
  // llegar y esperan a que alguien los planifique. Sin ellos el buzón aparecería
  // vacío en la demostración, porque todo lo anterior nace ya dentro de un
  // despacho.
  for (let i = 0; i < 16; i++) {
    contadorGuia++;
    const clienteId = elegir(idsClientes);
    const tarifa = tarifasPorCliente.get(clienteId)!;
    const zona = elegir(ZONAS);
    const destinatario = NOMBRES[entero(0, NOMBRES.length - 1)].split(' ').slice(0, 2).join(' ');
    const peso = red(entre(0.4, 8), 2);
    const flete = red(Math.max(8, tarifa.base + Math.min(tarifa.kg * peso, 12) + entre(0, 4)), 2);

    await ins(
      `INSERT INTO envios (guia, cliente_id, remitente, destinatario, destinatario_tel, direccion,
         ciudad, zona, peso_kg, volumen_m3, valor_declarado, flete, estado, fecha_compromiso,
         origen, cobro_entrega, bultos, notas, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pendiente',$13,$14,$15,$16,$17,$18) RETURNING id`,
      `TR-${aISO(HOY).replace(/-/g, '')}-${String(contadorGuia).padStart(5, '0')}`,
      clienteId,
      CLIENTES_BASE[idsClientes.indexOf(clienteId)]?.nombre ?? 'Remitente',
      destinatario,
      // Casi todos traen teléfono, pero no todos: es justo el hueco que hay que
      // saber reconocer en el buzón antes de mandar a alguien a la calle.
      azar(0.9) ? `+51 9${entero(10, 99)} ${entero(100, 999)} ${entero(100, 999)}` : null,
      direccionFalsa(),
      'Lima',
      zona.nombre,
      peso,
      red(peso / 250, 3),
      0,
      flete,
      aISO(sumarDias(HOY, azar(0.6) ? 0 : 1)),
      azar(0.75) ? 'whatsapp' : 'manual',
      azar(0.45) ? red(entre(20, 380), 2) : 0,
      entero(1, 3),
      azar(0.4)
        ? elegir([
            'Portón azul, preguntar por la Sra. Rosa.',
            'Dejar en recepción del edificio.',
            'Llamar al llegar, no toca timbre.',
            'Segundo piso, departamento 3B.',
          ])
        : null,
      aISOCompleto(conHora(HOY, entero(7, 11), entero(0, 59))),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Combustible y gastos (derivados de las rutas reales)
  // ─────────────────────────────────────────────────────────────
  for (const ruta of rutasCreadas) {
    if (ruta.estado === 'planificado' || ruta.estado === 'cancelado' || ruta.km <= 0) continue;
    const unidad = unidadesInfo.find((u) => u.id === ruta.unidadId);
    if (!unidad) continue;

    // Precio del galón en un grifo de Lima: gasolina para las motos y diésel
    // para el resto de la flota.
    const precioGalon = unidad.tipo === 'moto' ? red(entre(16, 18), 2) : red(entre(14, 16), 2);
    const galones = red(ruta.km / unidad.rend * entre(0.9, 1.18), 2);
    if (galones <= 0) continue;

    await ins(
      `INSERT INTO combustible (unidad_id, ruta_id, conductor_id, fecha, galones, precio_galon, total, km_actual, estacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      ruta.unidadId, ruta.id, ruta.conductorId, ruta.fecha, galones, precioGalon,
      // En soles el total de una carga es pequeño: se redondea a céntimos, no a
      // centenas como cuando la moneda era el peso colombiano.
      red(galones * precioGalon, 2),
      Math.round(entre(4000, 240000)),
      elegir(ESTACIONES),
    );

    // Peajes y otros gastos de la ruta
    const numPeajes = entero(0, 4);
    for (let p = 0; p < numPeajes; p++) {
      await ins(
        `INSERT INTO gastos (unidad_id, ruta_id, categoria, descripcion, fecha, monto, comprobante)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        ruta.unidadId, ruta.id, 'peaje',
        elegir(['Peaje Conchán', 'Peaje Chilca', 'Peaje Pucusana', 'Peaje Huacho', 'Peaje Óvalo 200 Millas']),
        ruta.fecha, red(elegir([6.5, 7.8, 9.2, 10.6, 12.4, 14.8]), 2),
        `PEA-${entero(100000, 999999)}`,
      );
    }
    if (azar(0.28)) {
      await ins(
        `INSERT INTO gastos (unidad_id, ruta_id, categoria, descripcion, fecha, monto, comprobante)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        ruta.unidadId, ruta.id, 'parqueadero', 'Parqueadero zona de descargue', ruta.fecha,
        red(entre(4, 18), 2), null,
      );
    }
    if (azar(0.18)) {
      await ins(
        `INSERT INTO gastos (unidad_id, ruta_id, categoria, descripcion, fecha, monto, comprobante)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        ruta.unidadId, ruta.id, 'viatico', 'Almuerzo y refrigerio del auxiliar', ruta.fecha,
        red(entre(18, 45), 2), null,
      );
    }
    if (azar(0.05)) {
      await ins(
        `INSERT INTO gastos (unidad_id, ruta_id, categoria, descripcion, fecha, monto, comprobante)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        ruta.unidadId, ruta.id, 'multa', elegir(['Papeleta por mal estacionamiento', 'Papeleta por exceso de velocidad', 'Papeleta por no respetar la señalización']), ruta.fecha,
        red(entre(260, 620), -1), `PAP-${entero(100000, 999999)}`,
      );
    }
    if (azar(0.12)) {
      await ins(
        `INSERT INTO gastos (unidad_id, ruta_id, categoria, descripcion, fecha, monto, comprobante)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        ruta.unidadId, ruta.id, 'lavado', 'Lavado de unidad', ruta.fecha, red(entre(15, 40), 2), null,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Facturación: se agrupan los envíos entregados por cliente y mes
  // ─────────────────────────────────────────────────────────────
  contadorGuia = 0;
  let numeroFactura = 1;
  for (let mesAtras = 3; mesAtras >= 0; mesAtras--) {
    const ref = new Date(HOY.getFullYear(), HOY.getMonth() - mesAtras, 1);
    const inicio = aISO(ref);
    const fin = aISO(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));

    for (const clienteId of idsClientes) {
      const envios = await all<{ id: number; guia: string; flete: number; fecha_entrega: string }>(
        `SELECT id, guia, flete, fecha_entrega FROM envios
         WHERE cliente_id = $1 AND estado = 'entregado' AND substr(fecha_entrega, 1, 10) BETWEEN $2 AND $3`,
        clienteId, inicio, fin,
      );
      if (envios.length === 0) continue;

      // Importes en soles: se redondea a céntimos (antes, en pesos, redondear a
      // centenas era despreciable; aquí dejaría el IGV en cero).
      const subtotal = red(envios.reduce((s, e) => s + e.flete, 0), 2);
      // IGV peruano: 18 %.
      const impuesto = red(subtotal * 0.18, 2);
      const total = red(subtotal + impuesto, 2);

      const cliente = CLIENTES_BASE[idsClientes.indexOf(clienteId)];
      const fechaEmision = fin;
      const fechaVencimiento = aISO(sumarDias(new Date(`${fin}T00:00:00`), cliente.plazo));

      // Facturas recientes: pendientes o vencidas; antiguas: pagadas
      let estado = 'emitida';
      let fechaPago: string | null = null;
      if (mesAtras >= 2) {
        estado = 'pagada';
        fechaPago = aISO(sumarDias(new Date(`${fechaVencimiento}T00:00:00`), -entero(0, 6)));
      } else if (new Date(`${fechaVencimiento}T00:00:00`).getTime() < HOY.getTime()) {
        estado = azar(0.55) ? 'vencida' : 'pagada';
        if (estado === 'pagada') fechaPago = aISO(sumarDias(HOY, -entero(1, 20)));
      } else if (azar(0.4)) {
        estado = 'pagada';
        fechaPago = aISO(sumarDias(HOY, -entero(1, 10)));
      }

      const facturaId = await ins(
        `INSERT INTO facturas (numero, cliente_id, fecha_emision, fecha_vencimiento, subtotal, impuesto, total, estado, fecha_pago, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        `FV-${ref.getFullYear()}-${String(numeroFactura++).padStart(4, '0')}`,
        clienteId, fechaEmision, fechaVencimiento, subtotal, impuesto, total, estado, fechaPago, null,
      );

      for (const e of envios) {
        await ins(
          `INSERT INTO factura_items (factura_id, envio_id, descripcion, cantidad, valor_unitario, total)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          facturaId, e.id, `Servicio de mensajería guía ${e.guia}`, 1, e.flete, e.flete,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Liquidaciones a conductores (últimas 4 semanas)
  // ─────────────────────────────────────────────────────────────
  let numeroLiquidacion = 1;
  for (let semana = 4; semana >= 1; semana--) {
    const fin = sumarDias(HOY, -((semana - 1) * 7 + 1));
    const inicio = sumarDias(fin, -6);

    for (const c of conductoresInfo) {
      const rutas = rutasCreadas.filter(
        (r) => r.conductorId === c.id && r.estado === 'completado' && r.fecha >= aISO(inicio) && r.fecha <= aISO(fin),
      );
      if (rutas.length === 0) continue;

      const ingresos = red(rutas.reduce((s, r) => s + r.ingresos, 0), 2);
      const comisiones = c.tipo === 'contratista' ? red(ingresos * (c.comision / 100), 2) : 0;
      const base = c.tipo === 'empleado' ? red(c.salario / 4, 2) : 0;
      const bonificaciones = azar(0.25) ? red(entre(50, 250), -1) : 0;

      // La deducción nunca puede superar lo que el conductor tiene a favor. Sin
      // este tope salían liquidaciones con total negativo (pagarle al conductor
      // menos que cero), que no tienen ningún sentido y parecen un fallo del
      // sistema. Se limita al 30 % del bruto.
      const bruto = base + comisiones + bonificaciones;
      const deducciones = azar(0.2) ? red(Math.min(bruto * 0.3, entre(30, 180)), -1) : 0;

      const total = red(bruto - deducciones, 2);

      const estado = semana >= 3 ? 'pagada' : semana === 2 ? 'aprobada' : 'borrador';
      await ins(
        `INSERT INTO liquidaciones (codigo, conductor_id, periodo_inicio, periodo_fin, base, comisiones, bonificaciones, deducciones, total_pagar, estado, fecha_pago, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        `LIQ-${aISO(inicio).replace(/-/g, '')}-${String(numeroLiquidacion++).padStart(4, '0')}`,
        c.id, aISO(inicio), aISO(fin), base, comisiones, bonificaciones, deducciones, total, estado,
        estado === 'pagada' ? aISO(sumarDias(fin, 3)) : null,
        c.tipo === 'contratista' ? `Comisión del ${c.comision}% sobre ${rutas.length} rutas completadas.` : `${rutas.length} rutas completadas en el periodo.`,
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 9. Usuarios de demostración
// ─────────────────────────────────────────────────────────────
// Cada rol tiene su cuenta para poder probar los permisos de verdad. La
// contraseña se deriva con scrypt igual que las de producción: el generador no
// se salta la seguridad.
//
// En un despliegue real estas cuentas hay que borrarlas y crear las de verdad
// con `npm run usuario -- crear`.
//
// La contraseña y las cuentas vienen de `src/lib/auth/demo.ts`, el mismo sitio
// que usa la pantalla de entrada: si estuvieran duplicadas aquí, un cambio en
// una dejaría botones de acceso que no funcionan.
const salDemo = generarSal();
const hashDemo = await hashClave(CLAVE_DEMO, salDemo);

/**
 * El usuario conductor se vincula a alguien que tenga una ruta **en curso hoy**.
 *
 * Si se vinculara al primer conductor de la lista, lo más probable es que su
 * ruta no cayera en la ventana de fechas que muestra la pantalla y el rol
 * conductor aparecería vacío, que es justo lo contrario de lo que se quiere
 * enseñar. El nombre también se toma de ahí para que coincida con la realidad.
 */
const conductorDemo = await get<{ id: number; nombre: string }>(
  `SELECT c.id, c.nombre
   FROM rutas r
   JOIN conductores c ON c.id = r.conductor_id
   WHERE r.fecha = $1 AND r.estado = 'en_curso'
   ORDER BY r.id
   LIMIT 1`,
  aISO(HOY),
);

for (const usuario of CUENTAS_DEMO) {
  const conductorId = usuario.esConductor ? (conductorDemo?.id ?? null) : null;
  const nombre = usuario.esConductor ? (conductorDemo?.nombre ?? 'Conductor de prueba') : usuario.nombre;

  await run(
    `INSERT INTO usuarios (email, nombre, hash_clave, sal_clave, rol, conductor_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    usuario.email,
    nombre,
    hashDemo,
    salDemo,
    usuario.rol,
    conductorId,
  );
}

// Las fotos de ejemplo de la ruta del conductor de demostración se atribuyen a su
// usuario. Sin esto, en la ficha del despacho saldrían sin autor: los usuarios se
// crean después que las rutas, así que en el momento de insertar la foto todavía
// no había a quién adjudicársela.
if (conductorDemo) {
  await run(
    `UPDATE fotos_entrega
     SET subida_por = (
       SELECT id FROM usuarios WHERE conductor_id = $1 AND rol = 'conductor' LIMIT 1
     )
     WHERE parada_id IN (
       SELECT p.id FROM paradas p
       JOIN rutas r ON r.id = p.ruta_id
       WHERE r.conductor_id = $1
     )`,
    conductorDemo.id,
  );
}

// ─────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────
const conteos: string[] = [];
for (const t of [...TABLAS_EN_ORDEN_DE_BORRADO].reverse()) {
  const r = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`);
  conteos.push(`${t.padEnd(18)} ${String(r?.n ?? 0).padStart(6)}`);
}

console.log(`\n  Base de datos de ${empresa.nombre} generada en: ${descripcionMotor()}\n`);
console.log(conteos.map((c) => '   ' + c).join('\n'));
console.log(`\n  Rango de fechas: ${aISO(sumarDias(HOY, -45))} → ${aISO(sumarDias(HOY, 3))}`);

console.log('\n  Accesos de demostración (contraseña: ' + CLAVE_DEMO + ')');
for (const u of CUENTAS_DEMO) {
  console.log(`    ${u.email.padEnd(28)} ${u.rol}`);
}
console.log('');

await cerrarMotor();
