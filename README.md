# Panel de operación para empresas de transporte de última milla

Aplicación web de gestión para una empresa de paquetería y reparto urbano. Cubre el
ciclo operativo completo: planificar los despachos, asignar unidades y conductores,
controlar la flota y su documentación legal, vigilar los costos y la rentabilidad,
facturar y cobrar, liquidar a los conductores y seguir las unidades en el mapa.

Es un **prototipo funcional con datos de ejemplo**: se ejecuta en tu computador, con
una base de datos local, y sirve para validar el flujo de trabajo con el equipo antes
de invertir en un desarrollo a medida.

---

## Arranque rápido

Requiere **Node.js 24 o superior**. Es un requisito real, no una preferencia: el
generador de datos se ejecuta con el soporte nativo de TypeScript de Node y la base de
datos local usa PGlite, que necesita Node 22.18 o superior. La versión está fijada en
`engines` (`package.json`) y en `.nvmrc`.

```bash
npm install      # instala las dependencias
npm run seed     # genera la base de datos con 45 días de operación
npm run dev      # arranca en http://localhost:3100
```

Para una versión de producción:

```bash
npm run build    # verifica tipos y compila
npm start        # siembra los datos si faltan y sirve en el puerto de $PORT
```

`npm run seed` se puede repetir cuantas veces quieras: borra y reconstruye la base de
datos con datos coherentes y siempre relativos a la fecha de hoy, así que el sistema
nunca se ve "viejo". `npm start` en cambio usa `--si-falta`: solo siembra si la base
está vacía, para no borrar los datos que ya haya (importante al desplegar).

---

## Módulos

| Módulo | Ruta | Qué resuelve |
| --- | --- | --- |
| **Tablero** | `/` | Foto del día y del mes: entregas, cumplimiento, unidades en ruta, margen, alertas y cartera |
| **Despachos** | `/despachos` | Hojas de ruta: creación, asignación de unidad y conductor, avance de paradas, prueba de entrega y novedades |
| **Rastreo** | `/rastreo` | Mapa en vivo de la flota, trayectorias, rastreo de una guía concreta y avance simulado de la operación |
| **Flota** | `/flota` | Parque automotor, vencimiento de SOAT, revisión técnico-mecánica y seguros, e historial de mantenimiento |
| **Conductores** | `/conductores` | Plantilla, vigencia de licencias, desempeño del mes y comisiones |
| **Costos y rentabilidad** | `/finanzas` | Combustible y rendimiento real por unidad, gastos por categoría, y margen por ruta y por unidad |
| **Facturación** | `/facturacion` | Facturas, cartera, antigüedad de saldos y gestión de cobro |
| **Liquidaciones** | `/liquidaciones` | Cálculo y pago de comisiones y salarios de los conductores |

### Lo que hace útil al prototipo

- **Rentabilidad real por ruta, no solo ingresos.** Cada hoja de ruta muestra su flete
  entregado menos combustible, gastos, mantenimiento prorrateado por kilómetro y la
  comisión del conductor. El sistema clasifica cada ruta como *rentable*, *ajustada* o
  *en pérdida*, y deja arriba las que pierden dinero.
- **Rendimiento de combustible contra lo esperado.** Compara los km/galón reales de cada
  unidad con su rendimiento teórico. Una desviación sostenida es la señal típica de robo
  de combustible o de una falla mecánica.
- **Semáforo documental.** SOAT, revisión técnico-mecánica, seguros y permisos se
  clasifican en vencido, crítico (≤10 días), por vencer (≤30 días) y vigente. Una unidad
  con documentación vencida queda marcada como no operable.
- **Trazabilidad de la entrega.** Cada parada guarda quién recibió, cuándo y qué pasó
  cuando no se pudo entregar, con reintentos y devolución al remitente.

---

## Cómo está construido

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 | Componentes de servidor: leen la base de datos directamente, sin capa de API que mantener |
| Lenguaje | TypeScript en modo `strict` | Los errores se detectan al compilar, no en producción |
| Estilos | Tailwind CSS v4 | Interfaz consistente sin configuración adicional |
| Base de datos | PostgreSQL. En producción con el controlador `pg`; en local con PGlite (PostgreSQL en WebAssembly) | El mismo dialecto en los dos entornos: se desarrolla sin instalar nada y se despliega en un PostgreSQL real |
| Gráficas y mapas | SVG y CSS propios | Sin librerías externas ni peticiones a internet: funciona sin conexión |

**Solo hay tres dependencias de ejecución** (`next`, `pg`, `react`, `react-dom`). Todo lo
demás —iconos, gráficas, el mapa, el formateo de moneda y fechas— está implementado en
el proyecto.

### Dos motores, un solo dialecto

`src/db/client.ts` elige el motor según una única variable:

| Entorno | Variable | Motor |
| --- | --- | --- |
| Local | *(ninguna)* | PGlite, guarda los datos en `data/pgdata/` |
| Railway / producción | `DATABASE_URL` | PostgreSQL real, vía `pg` |

El SQL es idéntico en ambos casos, así que no hay dos versiones de las consultas que
mantener. La API (`all`, `get`, `escalar`, `run`, `transaccion`) es **asíncrona**: hay
que usar `await`. Los detalles del dialecto están en `docs/postgres.md`.

### Estructura

```
src/
  app/                    páginas (una carpeta por módulo) y acciones de servidor
  components/ui/          kit de interfaz reutilizable
  components/layout/      navegación lateral e inferior
  components/pwa/         instalación, service worker y aviso sin conexión
  config/empresa.ts       datos de la empresa, moneda, país y umbrales de alerta
  db/
    schema.ts             esquema completo de la base de datos
    client.ts             conexión (pg o PGlite) y utilidades de consulta
    tipos.ts              tipos de las filas
    queries/              una capa de consultas por módulo
  lib/
    domain.ts             reglas de negocio: rentabilidad, alertas, cumplimiento
    format.ts             formato de moneda, fechas y etiquetas en español
    periodos.ts           cálculo de rangos de fechas
scripts/seed.ts           generador de datos de ejemplo
scripts/db.ts             consulta rápida de solo lectura
scripts/generar-iconos.ts generador de iconos PNG sin dependencias
docs/convenciones.md      guía para quien añada código al proyecto
docs/postgres.md          reglas del dialecto y de la API asíncrona
```

---

## Qué es real y qué está simulado

Conviene tenerlo claro antes de mostrar el prototipo:

| Aspecto | Estado |
| --- | --- |
| Modelo de datos, reglas de negocio y cálculos | **Reales.** Rentabilidad, vencimientos, cartera y liquidaciones se calculan de verdad |
| Interfaz y flujo de trabajo | **Real.** Se puede crear un despacho, iniciarlo, entregar paradas y ver el efecto en todos los indicadores |
| Datos de la operación | **Simulados.** 45 días de operación generados con un guion reproducible |
| Posiciones GPS | **Simuladas.** El botón "avanzar simulación" mueve las unidades y resuelve paradas; no hay conexión a ningún proveedor de GPS |
| Direcciones y coordenadas | **Simuladas.** Se generan dentro del área de cada zona; en producción se sustituyen por un geocodificador |
| Facturación electrónica | **No implementada.** Las facturas son registros internos, sin integración con la DIAN ni con un proveedor de facturación |
| Usuarios y permisos | **Implementados.** Cuatro roles con permisos por módulo, sesiones en base de datos y contraseñas con scrypt |

---

## Adaptarlo a otra empresa o a otro país

Toda la configuración regional está en un único archivo: **`src/config/empresa.ts`**.

```ts
export const empresa = {
  nombre: 'TransRápido Última Milla S.A.S.',
  idFiscalLabel: 'NIT',      // RUC en Perú o Ecuador, CUIT en Argentina, RFC en México
  ciudad: 'Bogotá',
  moneda: 'COP',             // ISO 4217
  locale: 'es-CO',
  unidadCombustible: 'gal',  // 'l' para litros
};
```

Cambiar la moneda, el locale y la etiqueta del identificador fiscal adapta el sistema a
otro país. Los umbrales de alerta de vencimiento (`umbrales.preventivo` y
`umbrales.critico`), el porcentaje de comisión por defecto y el impuesto sobre ventas
se ajustan en el mismo archivo.

Para cambiar el catálogo de zonas de reparto, edita `src/lib/zonas.ts` (o conéctalo al
geocodificador que uses).

---

## Usuarios, roles y permisos

### Quién necesita cuenta

Solo el personal. **El cliente final no necesita cuenta**: consulta dónde va su paquete en
`/rastrear`, que es una página pública y no muestra información interna.

### Los cuatro roles

| Rol | Qué puede hacer |
| --- | --- |
| **Administración** | Todo, incluidas finanzas, facturación y liquidaciones |
| **Despacho** | Rutas, entregas, flota y conductores. **Sin acceso a nada de dinero** |
| **Conductor** | Solo **sus propias** hojas de ruta y el mapa. Nada de importes |
| **Gerencia** | Ve todos los módulos, pero **no modifica nada** |

La matriz exacta vive en un único archivo, `src/lib/auth/permisos.ts`. Es el único sitio
donde se decide quién puede qué: si aparece una comprobación de rol escrita a mano en una
página, está mal.

### Crear y gestionar usuarios

```bash
# Crear (si omites la contraseña se genera una segura y se muestra una sola vez)
npm run usuario -- crear jefe@miempresa.co "Ana Restrepo" administracion

# Ver todos, con su rol, estado y sesiones abiertas
npm run usuario -- listar

# Cambiar la contraseña (cierra todas sus sesiones abiertas)
npm run usuario -- clave jefe@miempresa.co

# Desactivar a alguien que sale de la empresa (cierra sus sesiones al instante)
npm run usuario -- desactivar alguien@miempresa.co
```

Roles disponibles: `administracion`, `despachador`, `conductor`, `gerencia`.

Se recomienda **dejar que el sistema genere la contraseña**: una escrita en la línea de
comandos queda en el historial del shell y a la vista de cualquiera.

### Cómo está protegido

- **Contraseñas con scrypt** (`node:crypto`), con sal distinta por usuario y comparación
  en tiempo constante. Nunca se guarda la contraseña ni un hash sin sal.
- **Sesiones con estado en la base de datos**, no tokens firmados. Así cerrar sesión es un
  `DELETE` real y desactivar a un usuario mata sus sesiones al instante.
- **En la tabla se guarda el hash del token**, no el token: quien lea la base de datos no
  puede suplantar a nadie.
- **Cookie `httpOnly`** (JavaScript del navegador no puede leerla, así que un XSS no roba
  la sesión), `sameSite: lax` y `secure` salvo en local.
- **La comprobación de permisos está en cada página y en cada acción de servidor**, no solo
  en el menú. Las acciones de servidor se pueden invocar directamente, así que ocultar un
  botón no protege nada por sí solo.
- Al cambiar una contraseña o desactivar a alguien **se cierran todas sus sesiones**.

### Accesos de demostración

Los datos de ejemplo crean cuatro cuentas, una por rol, todas con la contraseña
`demo1234`:

| Correo | Rol |
| --- | --- |
| `admin@transrapido.co` | Administración |
| `despacho@transrapido.co` | Despacho |
| `gerencia@transrapido.co` | Gerencia |
| `conductor@transrapido.co` | Conductor |

La pantalla de entrada puede mostrar botones que entran con un clic, sin contraseña. Eso
se activa con `MOSTRAR_ACCESOS_DEMO=1` y **en producción está desactivado por defecto**,
para que un despliegue no quede abierto por descuido.

> **Antes de usar el sistema con datos reales**: borra estas cuentas de demostración
> (`npm run seed` las recrea; en producción usa `npm run usuario -- desactivar`), quita
> `MOSTRAR_ACCESOS_DEMO` y crea las cuentas de verdad.

---

## Publicarlo en GitHub y desplegarlo en Railway

Ahora es **más sencillo que con SQLite**: los datos viven en un servicio de PostgreSQL
de Railway, no en el disco del contenedor, así que ya no hace falta montar ningún
volumen ni preocuparse por el sistema de archivos efímero.

### 0. Comprobar que está listo antes de subirlo

```bash
npm run verificar-imports   # las rutas de los import son válidas también en Linux
npm run build               # tipos + compilación de producción
npm run verificar           # con el servidor arrancado: recorre todas las rutas
```

El primer comando merece una explicación. Windows y macOS **no distinguen mayúsculas**
en las rutas de archivo, pero Linux sí. Un `import` con la grafía equivocada compila sin
queja en tu equipo y rompe el build en Railway con un «module not found» desconcertante.
Ese comando lo detecta antes de subir nada.

### 1. Subirlo a GitHub

En este equipo **no hay `git` instalado**, así que este paso lo tienes que hacer tú.
Instala [Git](https://git-scm.com/downloads) (o usa GitHub Desktop) y desde la carpeta
del proyecto:

```bash
git init
git add .
git commit -m "Prototipo de gestión para transporte de última milla"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

El `.gitignore` ya deja fuera `node_modules`, `.next`, `data` (la base local de PGlite),
`.npm-cache` y los archivos `.env`. Lo que se sube son unas 55 fuentes y configuración:
menos de 1 MB.

### 2. Crear la base de datos

En el proyecto de Railway: **New** → **Database** → **Add PostgreSQL**.

Railway crea el servicio y le asigna una `DATABASE_URL`. No hay que configurarla a mano.

### 3. Crear la aplicación

1. **New** → **GitHub Repo** y elige el repositorio.
2. En el servicio de la aplicación, pestaña **Variables**, añade dos variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   TZ           = America/Bogota
   ```
   La primera es una referencia al servicio de base de datos (así la cadena de conexión
   se mantiene sola aunque cambie); el nombre `Postgres` debe coincidir con el que le
   haya puesto Railway a tu servicio de base de datos.

   **`TZ` no es opcional.** La aplicación calcula «hoy» y todos los rangos de fechas con
   la hora local del proceso, y un contenedor en la nube está en UTC. Si la empresa opera
   en Colombia (UTC-5), sin esta variable a partir de las 19:00 el sistema consideraría
   que ya es el día siguiente: los despachos del día, los indicadores y los vencimientos
   saldrían corridos. Ajusta el valor a la zona de la empresa.
3. En **Settings**, comprueba que quede así:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Healthcheck Path:** `/api/salud`
4. En **Networking**, pulsa *Generate Domain* para obtener la URL pública.

El archivo `railway.json` del repositorio ya declara el build, el arranque y el
healthcheck, de modo que el paso 3 suele aplicarse solo. Railway está migrando su
configuración por archivo a «Infrastructure as Code»: si en el futuro deja de leerse,
los mismos valores se ponen a mano en el panel.

### Por qué funciona

- **El build no necesita la base de datos.** Todas las páginas son dinámicas
  (`force-dynamic`), así que `next build` no las ejecuta.
- **El sembrado ocurre al arrancar, no al compilar.** `npm start` ejecuta
  `node scripts/seed.ts --si-falta` antes de `next start`. Con PostgreSQL vacío crea el
  esquema y genera los 45 días de operación; las siguientes veces comprueba si la tabla
  `rutas` tiene filas y, si las tiene, no toca nada.
- **`PORT` lo pone Railway.** No lo definas en las variables: la plataforma inyecta el
  suyo y `next start` lo respeta automáticamente.

### Cosas que conviene saber

| Tema | Detalle |
| --- | --- |
| **Ya no hace falta volumen** | Los datos están en el servicio PostgreSQL, no en el contenedor. Un despliegue nuevo no borra nada |
| **Ahora sí puedes escalar** | PostgreSQL admite varias conexiones a la vez, así que la aplicación puede tener más de una réplica (SQLite no lo permitía) |
| **Configura copias de seguridad** | El servicio PostgreSQL de Railway permite backups. Actívalos antes de meter datos reales |
| **Empezar de cero** | `railway run npm run seed` borra y regenera los datos de ejemplo |
| **Cuentas de demostración** | Los datos de ejemplo crean cuatro cuentas con la contraseña `demo1234`. Desactívalas antes de usar el sistema con datos reales, y no dejes `MOSTRAR_ACCESOS_DEMO` activo en producción |

### Comprobar que quedó bien

```bash
curl https://TU-DOMINIO.up.railway.app/api/salud
```

Debe responder `{"estado":"ok","baseDeDatos":"conectada","rutas":194,"sembrada":true}`.
Si `sembrada` es `false` o `rutas` es `0`, el sembrado no llegó a ejecutarse.

---

## Probar el despliegue en tu propio equipo (opcional)

Railway ejecuta la aplicación en **Linux**, y tú trabajas en Windows. Para no
esperar al despliegue para descubrir un problema, hay una imagen de Docker con la
que reproducir ese entorno en tu máquina.

Requiere [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

Y abrir **http://localhost:3100**. Levanta un PostgreSQL de verdad y la aplicación
contra él, así que la prueba se parece a producción y no a la base local.

```bash
docker compose down      # parar
docker compose down -v   # parar y borrar también los datos
```

### Por qué el archivo se llama `Dockerfile.local`

Railway construye **siempre** con un `Dockerfile` si lo encuentra en el
repositorio. Como el despliegue con Railpack ya funciona, este archivo lleva otro
nombre a propósito: así puedes probar en local sin cambiar la forma en que
Railway construye tu app.

Si algún día prefieres que Railway use esta imagen —compilación reproducible, con
las versiones fijadas dentro del propio archivo— basta con renombrarlo a
`Dockerfile`.

### Qué comprueba de verdad

| Aspecto | Por qué importa |
| --- | --- |
| **Compilación en Linux** | Es donde aparecen los problemas de mayúsculas en las rutas |
| **Solo dependencias de ejecución** | La imagen de producción no lleva TypeScript, Tailwind ni PGlite; si el arranque los necesitara, fallaría aquí |
| **Zona horaria** | El contenedor arranca en UTC; sin `TZ` las fechas saldrían corridas |
| **Conexión a PostgreSQL** | Con un servidor real, no con la base local |

---

## Limitaciones y siguiente paso

Un prototipo no es un producto. Antes de usarlo con datos reales de la empresa faltaría:

1. **Registro de auditoría.** Hoy se sabe *quién puede* hacer cada cosa, pero no queda
   constancia de *quién hizo* cada cambio. Falta ir anotando el usuario en las mutaciones
   importantes (entregas, facturas, liquidaciones) y poder consultarlo.
2. **Recuperación de contraseña** por correo, y verificación en dos pasos para los perfiles
   con acceso a dinero.
3. **Migraciones de esquema versionadas.** Hoy el esquema se crea con
   `CREATE TABLE IF NOT EXISTS` al arrancar, lo que basta para un prototipo pero no
   gestiona cambios de columnas. Herramientas como Drizzle o node-pg-migrate lo resuelven.
4. **Copias de seguridad automatizadas** de la base de datos y un plan de restauración
   probado.
5. **Integración real de GPS** con el proveedor de rastreo, en lugar de la simulación.
6. **Facturación electrónica** conforme a la normativa del país.
7. **Aplicación móvil para el conductor**, con funcionamiento sin conexión y captura de
   firma y fotografías como prueba de entrega. Hoy la PWA permite **consultar** sin
   conexión, pero **no registrar** entregas.
8. **Notificaciones** al cliente (correo o mensajería) en cada cambio de estado del envío.

Las reglas de negocio de `src/lib/domain.ts` y el esquema de `src/db/schema.ts` están
pensados para reutilizarse tal cual en esa siguiente etapa.

---

## Problemas frecuentes

**Quiero datos nuevos.** Ejecuta `npm run seed`. Es idempotente: borra las tablas y
regenera todo. En cambio `npm start` solo siembra si la base está vacía, para no borrar
datos reales.

**El puerto no es el que esperaba.** `npm run dev` usa el 3100. `npm start` respeta la
variable `PORT` (por defecto 3000). Para usar el 3100 en local crea un archivo `.env`
copiando `.env.example`, o ejecuta `PORT=3100 npm start`.

**La página muestra un error sobre la base de datos.** Sin `DATABASE_URL`, la aplicación
usa PGlite y guarda los datos en `data/pgdata/`. Si esa carpeta no existe o está
corrupta, bórrala y ejecuta `npm run seed`. Con `DATABASE_URL` definida, comprueba que
el servidor de PostgreSQL sea accesible.

**Quiero inspeccionar los datos.** `npm run db -- "SELECT * FROM unidades LIMIT 5"`.
Es una herramienta de solo lectura: ejecuta la consulta dentro de una transacción que
siempre se revierte.

**`npm run db` o `npm run seed` fallan con «Aborted» o «no se pudo abrir la base de datos
local».** Es una limitación de PGlite, la base local: bloquea su carpeta de datos y no
admite dos procesos a la vez. Si el servidor está arrancado, páralo. Si el proceso murió
de golpe, dejó un `postmaster.pid` huérfano: borra la carpeta `data/pgdata` y ejecuta
`npm run seed` para reconstruirla (son datos de ejemplo, no se pierde nada real). Con
`DATABASE_URL` (PostgreSQL real) esto no ocurre: admite muchas conexiones simultáneas.

**Trabajo en un entorno que no permite crear procesos hijos** (contenedor restrictivo,
CI con sandbox). Ya está resuelto: el proyecto usa `experimental.workerThreads` para que
el build trabaje con hilos, la verificación de tipos se ejecuta encadenada en
`npm run build`, y el generador de datos corre con Node directamente. Ver
`docs/convenciones.md`, sección 12.
