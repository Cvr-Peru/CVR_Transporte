# Convenciones del proyecto

Documento de referencia para cualquiera (persona o agente) que añada código a esta
aplicación. Describe el stack, las reglas que hay que respetar y los componentes
que ya existen para no reinventarlos.

---

## 1. Stack y decisiones tomadas

| Pieza | Elección | Motivo |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack) + React 19 | Componentes de servidor: se lee la base de datos directamente, sin API intermedia |
| Lenguaje | **TypeScript** (`strict`, `verbatimModuleSyntax`) | Seguridad de tipos en todo el proyecto |
| Estilos | **Tailwind CSS v4** | Sin configuración adicional; utilidades directamente en el JSX |
| Base de datos | **PostgreSQL**. En producción con `pg`; en local con PGlite (PostgreSQL en WebAssembly) | Mismo dialecto en desarrollo y producción; no hay que instalar nada para desarrollar |
| Datos | Generados con `npm run seed` (45 días de operación) | El prototipo siempre se ve con datos recientes y coherentes |

**No se añaden dependencias nuevas.** Todo lo necesario está ya en el proyecto:
iconos en SVG propios, gráficas con divs y SVG, formato con `Intl`.

---

## 2. Reglas obligatorias de Next.js 16

Next 16 introdujo cambios de ruptura. Estas tres reglas no son opcionales:

### 2.1 `searchParams` y `params` son Promesas

El acceso síncrono se eliminó por completo. Siempre hay que esperarlos:

```tsx
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;          // ← obligatorio
  const estado = typeof sp.estado === 'string' ? sp.estado : undefined;
  // ...
}
```

En rutas dinámicas, `params` también es una Promesa:

```tsx
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

### 2.2 Toda página que lea la base de datos es dinámica

Añadir siempre esta línea al inicio del archivo de página:

```tsx
export const dynamic = 'force-dynamic';
```

Sin ella, Next intentaría pre-renderizar la página en el build y congelaría los datos.

### 2.3 No usar `useSearchParams` de cliente

Obliga a envolver todo en `<Suspense>` y complica el render. Para filtros se usa el
patrón de la sección 4.

### 2.4 Toda página y toda acción comprueban permisos

Es la regla de seguridad más importante del proyecto. **Toda página que lea datos y toda
acción de servidor que escriba deben empezar con su guarda:**

```ts
import { requerirPermiso } from '@/lib/auth/sesion';

// Página (componente async)
export default async function Pagina(props) {
  const sesion = await requerirPermiso('despachos');          // leer
  // ...
}

// Acción de servidor
export async function hacerAlgo(formData: FormData): Promise<void> {
  await requerirPermiso('despachos', 'editar');                // escribir
  // ...
}
```

Comprobar solo en el menú **no protege nada**: las acciones de servidor se pueden invocar
directamente, sin pasar por la interfaz. La guarda tiene que estar en el propio punto de
lectura o escritura.

La matriz de roles vive en `src/lib/auth/permisos.ts` y es el único sitio donde se decide
quién puede qué. No escribir comprobaciones de rol a mano en una página.

Cuando una página deba ocultar sus controles de edición a quien solo puede leer, se
calcula con `puede(sesion.rol, 'modulo', 'editar')` y se envuelve el control. Ocultar es
comodidad; la seguridad la da la guarda de la acción.

### 2.5 Un permiso por módulo no siempre basta

Cuando una acción la comparten varios roles pero cada uno solo debe poder hacerla **sobre
lo suyo**, la matriz no llega y hace falta una guarda que además compruebe la propiedad.
El caso vivo es `requerirParadaPropia()` (`src/lib/auth/sesion.ts`): todos los conductores
tienen la acción `entregar` sobre `despachos`, así que sin esa segunda comprobación
cualquiera podría enviar el identificador de una parada de otro compañero y marcarla como
entregada.

Dos consecuencias al escribir una guarda así:

- La comprobación va junto al permiso, **nunca en la interfaz**: el formulario puede
  enviarse a mano y el identificador es un número que cualquiera puede cambiar.
- Si algo no cuadra, se responde igual que ante una falta de permiso (`/sin-acceso`) y no
  con un mensaje distinto. Diferenciar «no existe» de «no es tuya» solo sirve para que
  alguien averigüe qué identificadores existen.

Reparto de acciones en `despachos`: `editar` es el trabajo de oficina (crear la hoja de
ruta, asignar recursos, reordenarla, cerrarla) y `entregar` es resolver una parada en la
calle. Están separadas para poder darle al conductor la segunda sin darle la primera.

---

## 3. Componentes de servidor por defecto

Todo componente es de servidor salvo que necesite estado o eventos del navegador.
Solo entonces se añade `'use client'` en la primera línea. En este proyecto los
filtros se resuelven sin JavaScript de cliente, así que casi ninguna página necesita
componentes de cliente.

**Lista de archivos que NO se deben modificar** (son infraestructura compartida):

```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs
src/app/layout.tsx, src/app/globals.css, src/app/page.tsx
src/components/**          (todo el kit de interfaz y la navegación)
src/lib/**                 (formato, dominio, períodos, cn)
src/config/empresa.ts
src/db/client.ts, src/db/schema.ts, src/db/tipos.ts
src/db/queries/despachos.ts
scripts/**
```

Si falta algo en el kit, se compone con Tailwind dentro de la propia página en lugar
de tocar los archivos compartidos.

---

## 4. Patrón de filtros (sin JavaScript de cliente)

Los filtros se hacen con un formulario HTML normal con `method="get"`. El navegador
añade los campos a la URL y la página los lee desde `searchParams`. Cero código de
cliente, funciona siempre y la URL es compartible.

```tsx
<form method="get" className="flex flex-wrap items-end gap-2">
  <label className="flex flex-col gap-1 text-xs text-slate-400">
    Estado
    <select
      name="estado"
      defaultValue={estado ?? 'todas'}
      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
    >
      <option value="todas">Todas</option>
      <option value="en_curso">En curso</option>
    </select>
  </label>
  <label className="flex flex-col gap-1 text-xs text-slate-400">
    Buscar
    <input
      name="q"
      defaultValue={q ?? ''}
      placeholder="Código, placa…"
      className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
    />
  </label>
  <button
    type="submit"
    className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
  >
    Filtrar
  </button>
  {hayFiltros ? (
    <Link href="/ruta-base" className="text-xs text-slate-400 hover:text-slate-200">
      Limpiar
    </Link>
  ) : null}
</form>
```

Clases reutilizables recomendadas:

- Campo de formulario: `rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200`
- Botón principal: `rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500`
- Botón secundario: `rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800`

---

## 5. Acciones de servidor (mutaciones)

Las mutaciones van en un archivo `actions.ts` junto a la página, con `'use server'`.
Al terminar, se invalida la ruta con `revalidatePath`.

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { run } from '@/db/client';

export async function marcarEntregada(formData: FormData): Promise<void> {
  const paradaId = Number(formData.get('paradaId'));
  if (!Number.isFinite(paradaId)) return;

  await run(
    "UPDATE paradas SET estado = 'entregado', hora_real = $1 WHERE id = $2",
    horaActual(),
    paradaId,
  );
  revalidatePath('/despachos');
}
```

Se invocan desde un `<form action={accion}>` de un componente de servidor:

```tsx
<form action={marcarEntregada}>
  <input type="hidden" name="paradaId" value={p.id} />
  <button type="submit" className="...">Marcar entregada</button>
</form>
```

Notas:

- `run()` ya normaliza booleanos y `undefined`. El esquema guarda los booleanos como
  `INTEGER` 0/1: usar `0`/`1`, no `true`/`false`.
- Para varias sentencias relacionadas, envolver en `await transaccion(async () => { ... })`.
  Dentro, todas las llamadas necesitan `await`.
- Las acciones deben devolver `Promise<void>` si se usan directamente en `action={}`.
- Al insertar, añadir `RETURNING id` si necesitas el identificador; `run()` lo devuelve
  en `id`.

---

## 6. Kit de interfaz disponible

Importar siempre desde `@/components/ui/...`.

### `Card` — `@/components/ui/Card`

```tsx
<Card className="...">…</Card>
<CardCabecera titulo="Título" descripcion="Texto de apoyo" acciones={<Link …/>} />
<CardCuerpo className="px-0 py-0">…</CardCuerpo>   {/* px-0 py-0 para tablas */}
<RejillaKpi columnas={4}>…</RejillaKpi>            {/* 2 | 3 | 4 | 5 */}
```

### `Badge` — `@/components/ui/Badge`

```tsx
<Badge tono="exito">Texto</Badge>          {/* neutro|info|exito|aviso|peligro|violeta */}
<BadgeEstado estado="entregado" texto="Entregado" />   {/* deduce el tono del estado */}
tonoDeEstado(estado): Tono                 {/* para casos manuales */}
```

### `Kpi` — `@/components/ui/Kpi`

```tsx
<Kpi
  etiqueta="Entregas de hoy"
  valor="42"
  detalle="de 120 programados"
  icono={<IconoCaja width={16} height={16} />}
  acento="esmeralda"        {/* slate|esmeralda|ambar|rosa|cielo|violeta */}
  pie={<Progreso valor={82} mostrarTexto />}
/>
```

### `Tabla` — `@/components/ui/Tabla`

```tsx
<TablaCaja>
  <thead>
    <tr>
      <Th>Unidad</Th>
      <Th alineacion="derecha">Costo</Th>
    </tr>
  </thead>
  <tbody>
    <Tr>
      <Td>WXY123</Td>
      <Td alineacion="derecha">{moneda(1200)}</Td>
    </Tr>
    <FilaVacia colSpan={2} mensaje="Sin registros" />
  </tbody>
</TablaCaja>
```

`Td` con `alineacion="derecha"` ya aplica cifras tabulares (`.num`).

### `Progreso` — `@/components/ui/Progreso`

```tsx
<Progreso valor={73} mostrarTexto />
<Progreso valor={73} colorManual="bg-sky-500" />
<BarraProporcion etiqueta="Combustible" valor={420000} total={1000000} color="bg-sky-500" />
```

### Otros

```tsx
<EncabezadoPagina titulo="…" descripcion="…" acciones={<>…</>} />
<Vacio titulo="Sin resultados" mensaje="…" icono={<IconoBuscar />} accion={<Link …/>} />
```

### Gráficas — `@/components/ui/Grafica`

```tsx
<GraficaBarras
  datos={[{ etiqueta: 'Lun', valor: 12, secundario: 2, titulo: 'detalle al pasar el cursor' }]}
  etiquetaPrimaria="Entregados"
  etiquetaSecundaria="Novedades"
  altura={170}
/>
<Sparkline datos={[1, 4, 2, 8]} color="#38bdf8" ancho={220} alto={28} />
<BarrasHorizontales datos={[{ etiqueta: 'Norte', valor: 120 }]} formato={entero} />
<Dona
  segmentos={[{ etiqueta: 'Combustible', valor: 100, color: '#38bdf8' }]}
  centro={{ titulo: '$1,2 M', subtitulo: 'Costo total' }}
/>
```

### Iconos — `@/components/ui/Iconos`

`IconoTablero`, `IconoDespacho`, `IconoMapa`, `IconoFlota`, `IconoConductor`,
`IconoFinanzas`, `IconoFactura`, `IconoLiquidacion`, `IconoAlerta`, `IconoReloj`,
`IconoCheck`, `IconoEquis`, `IconoBuscar`, `IconoFlecha`, `IconoCaja`,
`IconoCombustible`, `IconoHerramienta`, `IconoDocumento`, `IconoSalir`,
`IconoRefrescar`.

Todos aceptan `width`, `height` y `className`. Heredan el color del texto
(`currentColor`).

---

## 7. Utilidades

### Formato — `@/lib/format`

`moneda(n)`, `monedaCorta(n)`, `numero(n, dec)`, `entero(n)`, `porcentaje(n, dec)`,
`fecha(v)`, `fechaCorta(v)`, `fechaHora(v)`, `hora(v)`, `haceCuanto(v)`,
`etiqueta(valor)`, `diasHasta(v)`, `hoyISO()`, `aISO(date)`, `aISOCompleto(date)`,
`sumarDias(date, n)`, `parseFecha(v)`, `plural(n, sing, plur)`.

**Nunca usar `new Date('2026-01-15')`**: JS lo interpreta como UTC y en Perú
(UTC-5) muestra el día anterior. Usar `parseFecha()`.

`etiqueta()` traduce valores técnicos a texto legible: `etiqueta('en_curso')` →
`'En curso'`. Usarlo siempre para estados, tipos y categorías.

### Dominio — `@/lib/domain`

- `estadoVencimiento(fecha)` → `{ nivel, dias, texto, clases, color }`.
  `nivel`: `'vencido' | 'critico' | 'proximo' | 'vigente'`. `clases` son clases de
  Tailwind listas para el badge; `color` es un hexadecimal para gráficas.
- `nivelMasGrave(niveles)`, `esOperable(nivel)`
- `calcularRentabilidad({ ingresos, combustible, gastos, mantenimiento, comisionConductor, km, envios })`
  → incluye `costoDirecto`, `costoTotal`, `margen`, `margenPct`, `costoPorKm`,
  `ingresoPorKm`, `ingresoPorEnvio`, `costoPorEnvio`, `diagnostico`.
- `textoDiagnostico(d)`, `clasesDiagnostico(d)`
- `rendimientoReal(km, galones)`, `desviacionRendimiento(real, esperado)`
- `calcularMetricasEntrega(filas)`, `progresoRuta(resueltas, total)`, `textoProgreso(...)`

### Períodos — `@/lib/periodos`

`rangoDia()`, `rangoSemana()`, `rangoMes()`, `rangoMesAnterior()`,
`rangoUltimosDias(n)` → `{ desde, hasta }`.
`nombreMes()`, `nombreMesCorto(date)`, `listaMeses(n)`, `etiquetaDia(iso)`.

### Lógica pura que también corren los scripts

Cuando un módulo de lógica va a probarse desde un script (`npm run verificar-*`), sus
imports **no pueden usar el alias `@/`**: los scripts los ejecuta Node directamente, sin
pasar por el empaquetador, y ese alias no existe ahí. En ese caso se importa con ruta
relativa y extensión explícita, como hace `src/db/client.ts` y como hace
`src/lib/pedidos/analizar.ts` con `../zonas.ts`.

El analizador de pedidos es el ejemplo a seguir: es lógica pura sin acceso a datos, así que
la prueba lo ejecuta directamente y, además, puede correr **en el navegador** para dar
respuesta instantánea mientras se pega el chat. El servidor vuelve a validar todo al
guardar.

### Utilidades — `@/lib/cn`

`cn(...clases)` une clases condicionales.

### Configuración — `@/config/empresa`

`empresa` (nombre, moneda, locale, ciudad, `idFiscalLabel`…), `umbrales`
(`preventivo: 30`, `critico: 10`), `parametros` (`comisionContratistaPct`,
`impuestoVentasPct`, `diasGraciaFactura`).

---

## 8. Acceso a datos — `@/db/client`

La base de datos es **PostgreSQL** y la API es **asíncrona**. Lee `docs/postgres.md`
para las reglas completas del dialecto; aquí está el resumen.

```ts
import { all, get, escalar, run, transaccion } from '@/db/client';

await all<T>(sql, ...params): Promise<T[]>          // varias filas
await get<T>(sql, ...params): Promise<T | null>     // primera fila o null
await escalar<number>(sql, ...params): Promise<T>   // un único valor
await run(sql, ...params): Promise<{ changes, id }> // INSERT/UPDATE/DELETE
await transaccion(async () => { ... })
```

Reglas:

- **Toda llamada necesita `await`.** Olvidarlo devuelve una promesa sin resolver y la
  página muestra `[object Promise]` o falla al renderizar.
- Los parámetros se marcan con `$1, $2, …`, **no** con `?`. El número debe coincidir con
  el orden real de los argumentos, también en las condiciones que se construyen
  dinámicamente.
- Para obtener el identificador de una fila insertada, el `INSERT` termina en
  `RETURNING id`, y `run()` lo devuelve en `id`. Los `UPDATE` y `DELETE` no lo llevan.
- Nunca interpolar valores en el SQL. La única excepción son los `LIMIT`, que se
  interpolan como número ya validado.
- Para comparar fechas, calcular el corte en JavaScript con `hoyISO()` / `sumarDias()`.
  Las funciones de fecha del motor (`now()`, `CURRENT_DATE`) usan la zona del servidor y
  desplazarían un día.
- Las fechas se guardan como `'YYYY-MM-DD'` o `'YYYY-MM-DD HH:MM:SS'` y comparan bien con
  `BETWEEN`.

Errores de dialecto que hay que evitar (detalle en `docs/postgres.md`): `GROUP BY`
estricto, alias en `HAVING`, `MAX(a, b)` en vez de `GREATEST(a, b)`, `ROUND(x, n)` sobre
`DOUBLE PRECISION`, `COLLATE NOCASE`, `julianday` y `strftime`.

Tipos de fila en `@/db/tipos.ts`. Para un JOIN, declarar una interfaz local que
extienda el tipo base (ver `RutaResumen` en ese archivo como ejemplo).

---

## 9. Esquema de datos

Consultar siempre `src/db/schema.ts` como fuente de verdad. Resumen:

| Tabla | Contenido | Columnas clave |
| --- | --- | --- |
| `clientes` | Empresas que contratan el servicio | `nombre`, `tarifa_base`, `tarifa_kg`, `plazo_pago_dias` |
| `conductores` | Personal de reparto | `nombre`, `tipo_vinculacion` (`empleado`/`contratista`), `licencia_vencimiento`, `comision_pct`, `salario_base`, `estado` |
| `unidades` | Vehículos | `placa`, `tipo` (`moto`/`furgoneta`/`camion_ligero`/`camion`/`camion_pesado`), `estado` (`disponible`/`en_ruta`/`mantenimiento`/`fuera_servicio`), `km_actual`, `rendimiento_esperado` |
| `documentos_unidad` | SOAT, revisión técnico-mecánica, seguro, tarjeta de propiedad, permiso | `tipo`, `vencimiento`, `costo` |
| `mantenimientos` | Órdenes de taller | `tipo` (`preventivo`/`correctivo`), `estado` (`programado`/`en_taller`/`completado`), `costo`, `km`, `proxima_fecha` |
| `rutas` | Hojas de ruta / despachos | `codigo`, `fecha`, `zona`, `unidad_id`, `conductor_id`, `estado` (`planificado`/`en_curso`/`completado`/`cancelado`), `km_inicial`, `km_final` |
| `paradas` | Puntos de entrega de una ruta | `ruta_id`, `orden`, `direccion`, `lat`, `lng`, `estado` (`pendiente`/`en_camino`/`entregado`/`fallido`), `hora_estimada`, `hora_real` |
| `envios` | Guías / paquetes. Un envío **sin `ruta_id`** es un pedido del buzón | `guia`, `cliente_id`, `ruta_id`, `parada_id`, `destinatario`, `flete`, `peso_kg`, `bultos`, `cobro_entrega`, `origen`, `estado` (`pendiente`/`en_reparto`/`entregado`/`novedad`/`devuelto`), `fecha_entrega`, `receptor` |
| `novedades` | Incidencias de entrega | `envio_id`, `tipo`, `descripcion`, `resuelto` |
| `fotos_entrega` | Prueba de entrega: la foto de quien recibe | `parada_id`, `ruta_id`, `datos` (BYTEA), `tipo_mime`, `lat`, `lng`, `tomada_en`, `subida_por` |
| `posiciones` | Telemetría GPS | `unidad_id`, `ruta_id`, `lat`, `lng`, `velocidad_kmh`, `rumbo`, `timestamp` || `combustible` | Cargas de combustible | `unidad_id`, `ruta_id`, `fecha`, `galones`, `precio_galon`, `total`, `km_actual` |
| `gastos` | Peajes, parqueaderos, viáticos… | `categoria` (`peaje`/`parqueadero`/`viatico`/`lavado`/`multa`/`otro`), `monto`, `fecha` |
| `facturas` | Facturación por cliente | `numero`, `cliente_id`, `fecha_emision`, `fecha_vencimiento`, `subtotal`, `impuesto`, `total`, `estado` (`borrador`/`emitida`/`pagada`/`vencida`/`anulada`) |
| `factura_items` | Detalle de factura | `factura_id`, `envio_id`, `descripcion`, `total` |
| `liquidaciones` | Pago a conductores | `codigo`, `conductor_id`, `periodo_inicio`, `periodo_fin`, `base`, `comisiones`, `bonificaciones`, `deducciones`, `total_pagar`, `estado` (`borrador`/`aprobada`/`pagada`) |

**No inventar columnas.** Verificar siempre contra `src/db/schema.ts`.

### 9.1 Dónde va cada tabla en el archivo

El esquema se ejecuta como **un solo script**, así que el orden importa: un `REFERENCES`
a una tabla que todavía no existe hace fallar todo con «relation … does not exist».
`fotos_entrega` está al final, después de `usuarios`, precisamente por eso, y lleva un
comentario que lo explica para que nadie la «ordene» de vuelta junto al resto del reparto.

### 9.2 Añadir una columna a una tabla que ya existe

`CREATE TABLE IF NOT EXISTS` **no toca una tabla que ya existe**, así que una columna nueva
no llegaría a una base en marcha. Al final de `SCHEMA_SQL` hay un bloque de sentencias
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` que se ejecuta en cada arranque y pone al día una
base ya desplegada sin obligar a regenerar los datos.

Cubre el caso más frecuente con diferencia —añadir un campo— pero **no es un sistema de
migraciones**: no renombra, no borra y no cambia tipos. Cuando haga falta algo de eso,
tocará poner migraciones versionadas.

### 9.3 Imágenes y otros binarios

Se guardan **en la base de datos** (`BYTEA`), no en el disco del servidor: el contenedor de
Railway tiene un sistema de archivos efímero y perdería los archivos en cada despliegue.

- El navegador **reduce la imagen antes de subirla** (ver `src/components/entrega/`). Es lo
  que hace viable guardarla aquí: 150 KB en lugar de 4 MB por entrega. Una acción de
  servidor acepta 6 MB de cuerpo como máximo (`next.config.ts`).
- Los binarios **nunca** se leen en los listados: se seleccionan solo las columnas de
  metadatos. Un `SELECT *` sobre una tabla con imágenes multiplica el peso de la consulta
  sin que nadie las mire.
- Se sirven desde un **Route Handler autenticado** (`/api/foto/[id]`), nunca desde
  `public/`. Comprueba sesión, permiso por módulo y propiedad; responde `401`, `403` o
  `404` con `Cache-Control: private`.
- En las páginas se usa `<img>` normal, **no `next/image`**: el optimizador descarga la
  imagen desde el servidor sin las cookies de quien mira, así que recibiría un 401.

---

## 10. Estilo de la interfaz

- Tema oscuro sobre la paleta `slate`. Fondo general `bg-slate-950`; tarjetas
  `bg-slate-900/50` con `border-slate-800` (ya resueltas por `Card`).
- Texto principal `text-slate-100`/`text-slate-200`; secundario
  `text-slate-400`; muy tenue `text-slate-500`.
- Acento de acción: `sky`. Positivo: `emerald`. Atención: `amber`. Problema: `rose`.
- Todas las cifras dentro de tablas o KPIs usan `.num` (cifras tabulares) — ya
  aplicado por `Kpi` y por `Td` alineado a la derecha.
- Espaciado entre bloques: `mt-4`. Rejillas: `grid grid-cols-1 gap-4 xl:grid-cols-2`
  (o `xl:grid-cols-3`).
- Todo el texto de la interfaz va en **español**, con acentuación correcta.
- Tono profesional y operativo, sin relleno. Nada de texto de marketing.

---

## 11. Comandos

```bash
npm run seed        # borra las tablas y regenera 45 días de operación
npm run seed:si-falta  # solo siembra si la base está vacía (lo usa `npm start`)
npm run dev         # servidor de desarrollo en http://localhost:3100
npm run build       # verifica tipos y compila para producción
npm run typecheck   # solo la verificación de tipos
npm start           # siembra si hace falta y sirve en el puerto de $PORT
npm run db -- "SELECT * FROM unidades LIMIT 5"   # consulta de solo lectura
npm run verificar   # prueba de humo: recorre todas las rutas y comprueba que responden
npm run iconos      # regenera los iconos PNG de la aplicación
```

Sin `DATABASE_URL`, todo esto funciona contra PGlite con los datos en `data/pgdata/`.
No hace falta instalar ningún servidor de base de datos para desarrollar.

---

## 12. Entorno de ejecución: procesos hijos

Este proyecto está configurado para funcionar en entornos que **no permiten crear
procesos hijos** (contenedores restrictivos, CI con sandbox). Por eso:

- `next.config.ts` usa `experimental.workerThreads: true`, de modo que el build
  reparte el trabajo en hilos dentro del mismo proceso.
- La verificación de tipos se hace con `tsc --noEmit` encadenado en `npm run build`
  (`typescript.ignoreBuildErrors: true` evita el verificador interno de Next, que
  lanzaría un proceso aparte). El rigor es el mismo: si hay errores de tipos, el
  build falla.
- `scripts/seed.ts` se ejecuta con `node` directamente (Node 24 soporta TypeScript
  de forma nativa), sin `tsx` ni esbuild, que sí requieren procesos hijos.

Si trabajas en un entorno sin estas restricciones, todo sigue funcionando igual.
