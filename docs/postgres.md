# Migración a PostgreSQL

Reglas del dialecto y de la API asíncrona. Léelo antes de tocar cualquier
consulta, página o acción de servidor.

---

## 1. Por qué cambia la API: todo es asíncrono

PostgreSQL es un servicio aparte, no un archivo local. Por eso `all`, `get`,
`escalar` y `run` ahora devuelven **promesas** y `transaccion` recibe un
**callback asíncrono**.

```ts
import { all, get, escalar, run, transaccion } from '@/db/client';

const rutas = await all<Ruta>('SELECT * FROM rutas WHERE fecha = $1', hoy);
const una = await get<Ruta>('SELECT * FROM rutas WHERE id = $1', id);
const n = await escalar<number>('SELECT COUNT(*) AS n FROM rutas');
const { changes, id } = await run('DELETE FROM rutas WHERE id = $1', id);

await transaccion(async () => {
  await run('UPDATE rutas SET estado = $1 WHERE id = $2', 'completado', rutaId);
  await run('UPDATE unidades SET estado = $1 WHERE id = $2', 'disponible', unidadId);
});
```

**Toda llamada necesita `await`.** Olvidarlo no da error de tipos en algunos
casos: devuelve una promesa sin resolver y la página muestra `[object Promise]`
o falla al renderizar. Es el error más fácil de cometer en esta migración.

Dentro de una transacción, las consultas se enrutan solas a la conexión
correcta mediante `AsyncLocalStorage`; no hay que pasar ningún cliente.

---

## 2. Marcadores de parámetros: `$1, $2, …` en vez de `?`

Los parámetros son **posicionales y numerados**. El número debe coincidir con el
orden real de los argumentos.

```ts
// Antes (SQLite)
'SELECT * FROM rutas WHERE fecha = ? AND estado = ?', fecha, estado

// Ahora (PostgreSQL)
'SELECT * FROM rutas WHERE fecha = $1 AND estado = $2', fecha, estado
```

Si un mismo valor se usa dos veces hay que repetir el número:

```ts
'SELECT * FROM paradas WHERE ruta_id = $1 AND estado = $2 AND ruta_id <> $1'
```

---

## 3. Insertar y obtener el identificador: `RETURNING id`

`lastInsertRowid` ya no existe. Se añade `RETURNING id` al INSERT y `run()`
devuelve el valor en `id`.

```ts
const { id: rutaId } = await run(
  `INSERT INTO rutas (codigo, fecha, zona, estado)
   VALUES ($1, $2, $3, 'planificado') RETURNING id`,
  codigo, fecha, zona,
);
```

`run()` devuelve `{ changes, id }`; `id` es `null` si la sentencia no incluye
`RETURNING id` (por ejemplo en un UPDATE).

Los `UPDATE` y `DELETE` **no** llevan `RETURNING`.

---

## 4. Diferencias de dialecto que sí rompen

Estas son las que aparecen de verdad al convertir el código existente:

### 4.1 `GROUP BY` estricto

PostgreSQL exige que **toda columna del SELECT** esté en el `GROUP BY` o dentro
de una función de agregación. SQLite lo permitía.

```sql
-- Falla en PostgreSQL
SELECT u.placa, u.tipo, COUNT(*) FROM unidades u GROUP BY u.placa

-- Correcto
SELECT u.placa, u.tipo, COUNT(*) FROM unidades u GROUP BY u.placa, u.tipo
```

### 4.2 No se puede usar un alias en `HAVING`

```sql
-- Falla: "column entregados does not exist"
... HAVING entregados > 0

-- Correcto: repetir la expresión, o envolver en una subconsulta
... HAVING COUNT(e.id) > 0
```

### 4.3 `MAX(a, b)` no existe

```sql
-- Falla
MAX(0, km_final - km_inicial)
-- Correcto
GREATEST(0, km_final - km_inicial)
```

### 4.4 `ROUND(x, n)` solo acepta NUMERIC

Con columnas `DOUBLE PRECISION` hay que convertir:

```sql
-- Falla: "function round(double precision, integer) does not exist"
ROUND(100.0 * a / b, 1)
-- Correcto
ROUND((100.0 * a / b)::numeric, 1)
```

### 4.5 `COLLATE NOCASE` no existe

```sql
-- Antes
WHERE guia = ? COLLATE NOCASE
-- Ahora
WHERE LOWER(guia) = LOWER($1)
```

### 4.6 Diferencia de días entre fechas

Las fechas son TEXT, así que hay que convertirlas:

```sql
-- Antes (SQLite)
CAST(julianday($1) - julianday(fecha_vencimiento) AS INTEGER)
-- Ahora (PostgreSQL)
($1::date - fecha_vencimiento::date)
```

El resultado ya es un entero de días.

### 4.7 División entera

`SUM(x) / COUNT(*)` con enteros da división entera en ambos motores, pero
conviene ser explícito multiplicando por `100.0` o usando `::numeric`.

---

## 5. Lo que NO hay que cambiar

- `substr(texto, 1, 10)` funciona igual.
- `COALESCE`, `COUNT`, `SUM`, `MIN`, `MAX`, `AVG`, `CASE WHEN`, `LIKE`, `IN`,
  `BETWEEN`, `LIMIT`, `ORDER BY`, `UNION ALL`, subconsultas correlacionadas:
  todo igual.
- `COUNT(*) FILTER (WHERE ...)` funciona en ambos.
- Los `CHECK (col IN (...))`, las claves foráneas y `ON DELETE CASCADE`: igual.
- Los `LIMIT` interpolados como número ya validado siguen valiendo.

---

## 6. Tipos: por qué las fechas siguen siendo TEXT

Es una decisión deliberada de esta migración, no un descuido:

- La aplicación calcula **toda** la aritmética de fechas en JavaScript para no
  depender de la zona horaria del servidor.
- Las consultas comparan con `BETWEEN` sobre cadenas `'YYYY-MM-DD'`, cuyo orden
  lexicográfico coincide con el cronológico.
- Convertir a `DATE`/`TIMESTAMPTZ` obligaría a revisar las más de 150 consultas
  y abriría la puerta a conversiones implícitas silenciosas.

Los importes son `DOUBLE PRECISION`, igual que el `REAL` anterior. Si algún día
se necesita aritmética decimal exacta para contabilidad, el cambio es a
`NUMERIC` más un conversor de tipo en `src/db/client.ts`.

Los booleanos siguen siendo `INTEGER` 0/1.

---

## 7. Motores: `pg` en producción, PGlite en local

`src/db/client.ts` elige el motor solo:

| Variable de entorno | Motor | Cuándo |
| --- | --- | --- |
| `DATABASE_URL` definida | `pg` contra PostgreSQL real | Railway / producción |
| sin `DATABASE_URL` | PGlite (PostgreSQL en WebAssembly) | Desarrollo y pruebas locales |

Ambos hablan **el mismo dialecto**, así que el código SQL es idéntico. PGlite
guarda los datos en `data/pgdata/`.

### Limitación de PGlite: un solo proceso

PGlite es PostgreSQL completo pero compilado a WebAssembly dentro del proceso, y
**bloquea su directorio de datos**: no admite dos procesos a la vez.

En la práctica significa que **mientras el servidor de desarrollo o de producción
está arrancado, no se puede usar `npm run db` ni `npm run seed`** contra la misma
base: la segunda conexión falla con un error del tipo `Aborted()`. Hay que parar
el servidor primero.

Con PostgreSQL real (`DATABASE_URL`) esta limitación **no existe**: admite muchas
conexiones simultáneas, que es justo por lo que se usa en producción.

---

## 8. Comandos

```bash
npm run seed              # regenera los datos de ejemplo (borra y recrea tablas)
npm run seed:si-falta     # solo siembra si la base está vacía
npm run db -- "SELECT …"  # consulta rápida (solo lectura)
npm run dev               # desarrollo en el puerto 3100
npm run build             # verifica tipos y compila
```

En Railway, `DATABASE_URL` la define el plugin de PostgreSQL del propio proyecto.

---

## 9. Lista de verificación al convertir una consulta

1. ¿Todos los `?` son ahora `$1, $2, …` en el orden correcto?
2. ¿Todos los llamadores tienen `await`?
3. ¿Los `INSERT` que necesitan el id llevan `RETURNING id`?
4. ¿Toda columna del `SELECT` está en el `GROUP BY`?
5. ¿Algún `HAVING` usa un alias?
6. ¿Queda algún `MAX(a, b)` que deba ser `GREATEST(a, b)`?
7. ¿Algún `ROUND(x, n)` sobre `DOUBLE PRECISION`?
8. ¿Algún `COLLATE NOCASE` o `julianday`?
9. Si la función es de la capa de consultas, ¿su firma devuelve `Promise`?
