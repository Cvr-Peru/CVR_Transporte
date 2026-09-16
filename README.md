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
| **Pedidos** | `/pedidos` | Buzón de entrada: lo que ha llegado y todavía no está en ninguna ruta. Se pueden pegar chats de WhatsApp y se separan solos |
| **Despachos** | `/despachos` | Hojas de ruta: creación, asignación de unidad y conductor, avance de paradas, prueba de entrega, foto de quien recibe y novedades |
| **Mi ruta** | `/mi-ruta` | La pantalla del conductor en el móvil: la parada siguiente en grande, botones para entregar o abrir novedad, la foto de quien recibe, navegación al domicilio y GPS, todo en la misma pantalla |
| **Rastreo** | `/rastreo` | Mapa en vivo de la flota, trayectorias, rastreo de una guía concreta y avance simulado de la operación |
| **Flota** | `/flota` | Parque automotor, vencimiento de SOAT, revisión técnico-mecánica y seguros, e historial de mantenimiento |
| **Conductores** | `/conductores` | Plantilla, vigencia de licencias, desempeño del mes y comisiones |
| **Costos y rentabilidad** | `/finanzas` | Combustible y rendimiento real por unidad, gastos por categoría, y margen por ruta y por unidad |
| **Facturación** | `/facturacion` | Facturas, cartera, antigüedad de saldos y gestión de cobro |
| **Liquidaciones** | `/liquidaciones` | Cálculo y pago de comisiones y salarios de los conductores |
| **Usuarios y permisos** | `/usuarios` | Crear cuentas, asignarles rol, cambiar contraseñas, vincular un conductor con su ficha y quitar accesos. Solo la ve Administración |

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
- **La foto de quien recibe, como prueba.** Al marcar una entrega, el conductor fotografía
  a quien le abre la puerta. La imagen se reduce en el propio teléfono antes de subirse y
  queda guardada junto a la entrega, con la hora y —si el navegador la da— la coordenada
  donde se tomó. En la ficha del despacho se ve al instante, y una entrega sin foto se
  distingue de una que sí la tiene.
- **Una pantalla pensada para el dedo, no para el ratón.** El conductor entra y aterriza
  directamente en `/mi-ruta`: la parada siguiente con la dirección en grande, botones de
  56 px para marcar la entrega o el motivo de la novedad, la cámara a un toque para la foto
  de quien recibe, un toque para abrir el navegador del teléfono con el domicilio como
  destino y otro para llamar al cliente. Comparte el GPS desde la misma pantalla y funciona
  instalada como aplicación.
- **Modo claro y modo oscuro.** Se cambia con un botón en la barra lateral —o en la
  cabecera, desde el móvil— y la elección se recuerda. La primera vez sigue lo que diga el
  sistema operativo. La interfaz entera está hecha sobre una sola paleta, así que el tema se
  resuelve remontándola por variables CSS en lugar de duplicar cada clase, y
  `npm run verificar-contraste` comprueba que ningún texto quede ilegible en ninguno de los
  dos.

---

## Cómo está construido

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 | Componentes de servidor: leen la base de datos directamente, sin capa de API que mantener |
| Lenguaje | TypeScript en modo `strict` | Los errores se detectan al compilar, no en producción |
| Estilos | Tailwind CSS v4 | Interfaz consistente sin configuración adicional. Tema claro y oscuro, elegibles y recordados |
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
| Carga de pedidos | **Real el circuito, heurístico el análisis.** Pegar un chat de WhatsApp y convertirlo en pedidos funciona de verdad; el analizador es heurístico y por eso siempre pasa por una pantalla de revisión |
| Fotos de entrega | **Reales en el circuito, dibujadas en los datos de ejemplo.** Cuando un conductor entrega, la foto es la que hace su teléfono; las 40 que trae `npm run seed` para que la ficha del despacho no salga vacía son dibujos generados |
| Posiciones GPS | **Simuladas.** El botón "avanzar simulación" mueve las unidades y resuelve paradas; no hay conexión a ningún proveedor de GPS |
| Direcciones y coordenadas | **Simuladas.** Se generan dentro del área de cada zona; en producción se sustituyen por un geocodificador |
| Facturación electrónica | **No implementada.** Las facturas son registros internos, sin integración con la SUNAT ni con un proveedor de facturación electrónica |
| Usuarios y permisos | **Implementados.** Cuatro roles con permisos por módulo, sesiones en base de datos y contraseñas con scrypt |

---

## GPS real: la ubicación del conductor en el mapa

El mapa de rastreo no tiene por qué ser una simulación. Un conductor puede abrir
la aplicación en su teléfono, dar permiso de ubicación y **aparecer en el mapa
como una unidad más**.

### Cómo se usa

1. El conductor entra a la app desde el móvil. **«Mi ruta»** ya trae el bloque de GPS al
   final de la pantalla, así que no hace falta ir a ningún otro sitio; quien lo prefiera
   puede abrir **«Mi ubicación»**, que es la pantalla dedicada.
2. Pulsa **«Compartir mi ubicación»** y acepta el permiso que pide el navegador.
3. A partir de ahí se envía su posición cada **15 segundos**.
4. En la central, esa unidad aparece en **`/rastreo`** con su posición y su
   velocidad, exactamente igual que las simuladas.

### Cómo funciona por dentro

```
Teléfono                    Servidor                       Pantalla de rastreo
   │                           │                                   │
   │  navigator.geolocation    │                                   │
   │  .watchPosition()         │                                   │
   │                           │                                   │
   └──POST /api/ubicacion─────►│                                   │
      {lat, lng, velocidad,    │  valida la sesión                 │
       rumbo, precision}       │  deduce la unidad                 │
                               │  INSERT INTO posiciones ─────────►│ lee y dibuja
```

Tres decisiones que conviene conocer:

- **El servidor deduce la unidad de la sesión, no del cuerpo de la petición.** Un
  conductor no puede reportar en nombre de otro vehículo: su identificador sale
  de su usuario. Es la diferencia entre un dato fiable y uno manipulable.
- **Se guarda de dónde viene cada posición** (columna `origen`): `dispositivo`
  para un GPS real, `simulacion` para el botón de avance. Así se distingue lo
  real de lo inventado en una demostración.
- **Hay un freno de mano**: se descartan las posiciones que llegan a menos de 5
  segundos de la anterior de la misma unidad, para que un cliente con un fallo no
  llene la tabla.

### Limitaciones que hay que decir claras

| Limitación | Por qué |
| --- | --- |
| **Requiere HTTPS** | Los navegadores solo dan acceso a la ubicación en contextos seguros. En Railway lo tienes; por HTTP en una IP de la red local, no |
| **Con la pantalla apagada no envía** | Un navegador suspende el JavaScript en segundo plano. Sirve para llevar el móvil con la app abierta, no para seguimiento continuo |
| **No hay historial de recorridos por día** | Se guardan las posiciones, pero no hay una pantalla que dibuje el recorrido completo de una jornada |

Para seguimiento continuo con la pantalla bloqueada hace falta una **aplicación
móvil nativa**. La API (`POST /api/ubicacion`) ya está preparada para recibir sus
envíos sin cambios.

### Probarlo sin estar en Lima

Si abres la app desde otro país, tu posición real aparecerá lejísimos de las rutas
y el mapa se verá raro. La pantalla «Mi ubicación» tiene un botón que envía una
posición **de prueba junto a tu siguiente parada**, para que veas cómo queda en el
mapa sin necesidad de estar allí.

---

## Cargar los pedidos que llegan por WhatsApp

Es el trabajo que más tiempo consume en una operación pequeña: el cliente manda los
pedidos por WhatsApp y alguien los vuelve a teclear. Esta parte del sistema existe para
que ese retipeo desaparezca.

### El buzón

Un pedido es un envío **que todavía no está en ninguna ruta**. Ese estado intermedio es lo
que faltaba: hasta ahora los envíos solo podían nacer ya dentro de un despacho, así que
recibirlos no tenía sitio en la aplicación.

En `/pedidos` se ve lo que ha entrado, con tres situaciones: *sin asignar*, *en ruta* y
*resuelto*. Los que esperan se marcan con una casilla y se meten en un despacho de una vez.
Los que van **a la misma dirección comparten una sola parada**: en la calle son un único
timbrazo con dos paquetes, no dos visitas.

### Pegar el chat, en lugar de teclearlo

`/pedidos/pegar` es la pieza que ahorra el trabajo. Se copia la conversación de WhatsApp
tal cual y el analizador la separa en pedidos, sacando de cada uno el destinatario, el
teléfono, la dirección, el distrito, los bultos, el peso y lo que haya que cobrar.

```
Juan Pérez - Av Los Álamos 452, Surquillo - 987654321
cobrar 50

María Torres, Calle Las Begonias 120 Dpto 301, San Isidro, 998877665
2 paquetes de 3 kg

Carlos Quispe
Jr. Amazonas 780, Lima Cercado
912345678
Ref: portón azul, preguntar por la Sra.
```

De ahí salen tres pedidos completos. El cuarto caso del ejemplo —una dirección sin nombre ni
teléfono— sale **marcado en ámbar** con los campos que faltan, que es donde conviene mirar
antes de guardar.

**El analizador propone; la persona decide.** Nada se guarda hasta pulsar el botón, y todo
se puede corregir en la propia pantalla. Está montado así a propósito: las direcciones de
Lima («frente al grifo, portón azul, tercer piso») no las acierta ningún analizador, y un
pedido mal escrito acaba en un paquete devuelto. Lo que sí se consigue es no volver a
teclear el 80 % y que la mirada vaya justo a los campos dudosos.

### Por qué así y no con la API de WhatsApp

La tentación es conectarse a la API de WhatsApp Business. No es por donde empezar:

- Necesita cuenta de empresa verificada, un número dedicado, plantillas aprobadas por Meta
  y normalmente un intermediario. Se cobra por conversación y el trámite tarda semanas.
- Y cuando esté funcionando, **el cliente seguirá escribiendo «mándame a la dirección de
  siempre»**, que necesita a una persona igual.

Lo que de verdad hace falta es convertir texto desordenado en pedidos ordenados, y eso sirve
igual si el texto llega pegado, por la API, por correo o desde una planilla. **El canal es un
detalle que se enchufa después**; el analizador es la pieza que se reutiliza. Por eso se
construyó primero esto.

Además, pegar el chat no le pide a nadie cambiar cómo trabaja: el equipo sigue usando
WhatsApp exactamente igual que hoy.

### Qué reconoce

- **Los 43 distritos de Lima y los 7 del Callao**, con sus abreviaturas: «SJL», «Surco»,
  «SMP», «VES», «Lima Cercado». Reconocer el distrito no solo rellena un campo: es la señal
  más fiable de que una línea es una dirección y es lo que después **sitúa la parada en el
  mapa**, porque cada distrito tiene su centroide en `src/lib/zonas.ts`.
- **Teléfonos** peruanos, móviles y fijos, con o sin `+51`, y los normaliza a `+51 987 654 321`.
- **Direcciones** por la palabra de vía (`Av.`, `Jr.`, `Calle`, `Mz`, `Pasaje`…), y cuando no
  la hay, por la forma «vía + número».
- **Importes a cobrar** («cobrar 50», «contra entrega 120»), **bultos** y **peso**.
- **El nombre pegado a la dirección**: «Carlos Quispe Jr. Amazonas 780» se parte por la
  palabra de vía, que es una frontera mucho más fiable que buscar mayúsculas.
- **Descarta los saludos y las despedidas** del chat.

Lo que **no** hace: entender notas de voz (haría falta transcribirlas, un servicio aparte),
leer la foto de una etiqueta (con etiquetas escritas a mano falla más que acierta) ni
adivinar una dirección que no está escrita.

---

## La foto de quien recibe, como prueba de entrega

Cuando el conductor marca una entrega, puede hacerle una foto a quien le abre la
puerta. Es lo que zanja una discusión con un cliente que dice no haber recibido el
paquete.

### Cómo se usa

1. En «Mi ruta», bajo el nombre de quien recibe, está **«Tomar foto de quien recibe»**.
   Al pulsarlo se abre la **cámara trasera** del teléfono directamente.
2. La foto aparece en pantalla, con su peso y —si el navegador da la posición— sus
   coordenadas. Se puede **repetir** antes de enviarla.
3. Al marcar la entrega, la foto se guarda junto a la parada.
4. En la **ficha del despacho** aparece como miniatura, con la hora, el tamaño, las
   coordenadas y quién la subió. Se abre a tamaño completo en otra pestaña.
5. Una entrega **sin** foto se marca como tal: cuando hay un reclamo, saber que no hay
   prueba es la mitad de la respuesta.

Desde el escritorio, el mismo control abre el **selector de archivos**: es por donde
llega la foto que el conductor manda por WhatsApp y que la oficina adjunta a mano.

### Las tres decisiones que hay detrás

**Se usa la cámara del navegador, no una aplicación nativa.** Un `<input type="file">`
con `capture="environment"` abre la cámara del teléfono y devuelve la foto al
formulario. No hace falta nada instalado ni permisos especiales, y funciona igual en la
app instalada (PWA) que en el navegador. Quitando `capture` el teléfono ofrecería
también la galería, que es justo lo que no conviene en una prueba de entrega: la foto
tiene que ser de ahora.

**La imagen se reduce en el teléfono, antes de subirla.** Una foto de móvil pesa 3-5 MB
y se sube por datos móviles, muchas veces con mala cobertura. El navegador la redibuja
en un lienzo a 1280 px de lado mayor y la exporta como JPEG de calidad 0.72: baja a unos
150 KB sin que se note a simple vista. Respeta la orientación EXIF, así que las fotos
hechas en vertical no salen tumbadas.

**Se guarda en la base de datos, no en el disco del servidor.** El contenedor de Railway
tiene un sistema de archivos efímero: una foto escrita en disco desaparece en el
siguiente despliegue, justo cuando más falta hace que siga ahí. En PostgreSQL viaja en la
misma transacción que la entrega —o quedan las dos, o no queda ninguna— y entra en las
copias de seguridad sin hacer nada más.

> **Cuándo conviene cambiarlo.** 150 KB por entrega son unos 5 GB al año a 100 entregas
> diarias. Para una operación pequeña entra de sobra en cualquier plan de PostgreSQL; a
> partir de ahí, mueve las imágenes a un almacenamiento de objetos (Cloudflare R2, S3) y
> deja en `fotos_entrega` solo la referencia. El resto del código no cambia: la única
> pieza que sabe dónde vive la imagen es `src/app/api/foto/[id]/route.ts`.

### Las fotos no son públicas

Lo que hay en una foto de entrega es **la cara de una persona en su casa**. Por eso
`/api/foto/<id>` no es un archivo estático:

- Sin sesión responde **401**; sin permiso de lectura sobre despachos, **403**.
- Un conductor solo obtiene las fotos de **sus** rutas. El identificador es un número
  correlativo, así que sin esa comprobación bastaría con probar `/api/foto/1`,
  `/api/foto/2`… para ver las entregas de toda la empresa.
- Cada respuesta va con `Cache-Control: private`, para que ningún intermediario guarde la
  imagen y se la devuelva a otro.
- **No aparecen en la página pública de rastreo.** El cliente puede seguir su paquete sin
  ver la cara de quien lo recibió. Si algún día quieres enseñárselas, es una decisión que
  conviene tomar a conciencia y avisar al destinatario.

### ¿Quieres que la foto sea obligatoria?

Por defecto **no** lo es: un teléfono sin cámara o sin batería no puede dejar al conductor
sin cerrar una parada. Si en tu operación la foto es la prueba que zanja las discusiones,
cambia una línea en `src/config/empresa.ts`:

```ts
export const parametros = {
  // …
  exigirFotoEnEntrega: true,
} as const;
```

El servidor rechazará entonces toda entrega sin foto, con un aviso claro en la pantalla
del conductor. La comprobación está en el servidor y no solo en la interfaz: enviar el
formulario a mano tampoco cuela.

---

## Optimizar el recorrido de un reparto

En el detalle de un despacho hay un botón **«Optimizar recorrido»**. Reordena las
paradas que quedan pendientes para acortar el kilometraje, **partiendo de donde
está la unidad ahora mismo**: la pregunta real del reparto es «dado dónde estoy,
¿por dónde sigo?».

Las paradas ya entregadas no se tocan: son historia.

### Dos motores, y siempre funciona uno

| Motor | Cuándo | Qué usa |
| --- | --- | --- |
| **Local** | Por defecto | **2-opt** sobre distancia en línea recta. Inmediato, sin dependencias |
| **VROOM** | Si defines `VROOM_URL` | Distancias **reales por carretera**, más capacidad del vehículo y ventanas horarias |

La pantalla siempre dice cuál se usó y cuánto se ahorró. Si VROOM está
configurado pero no responde, se resuelve en local en milisegundos en lugar de
dejar al despachador esperando.

Medido con el optimizador local sobre un orden deliberadamente malo: **54 % menos
distancia**. En una ruta real el margen es menor, pero el 20-30 % es habitual.

### Activar VROOM (distancias por calles reales)

Necesita dos servicios: **OSRM**, que sabe cuánto se tarda de una parada a otra
por la carretera, y **VROOM**, que decide el orden. No sirve uno sin el otro.

```powershell
# 1. Preparar los datos de calles de Perú (una sola vez)
powershell -ExecutionPolicy Bypass -File scripts/preparar-osrm.ps1

# 2. Levantar los servicios
docker compose -f docker-compose.rutas.yml up -d

# 3. Decirle a la aplicación que los use, y reiniciarla
$env:VROOM_URL = "http://localhost:3001"
npm run dev
```

> **Antes de lanzarlo, mira cuánta memoria tienes.** El preprocesado de las calles
> de Perú necesita **unos 8 GB de RAM libres** y genera 1-2 GB de archivos. Si tu
> equipo no llega, hay alternativas: usar un extracto más pequeño, prepararlo en
> otra máquina y copiar la carpeta `datos-osrm/`, o dejarlo para el servidor.

### Qué cambia VROOM en la práctica

El optimizador local mide **en línea recta**: cree que cruzar el Rímac cuesta lo
mismo que rodearlo. VROOM, con OSRM detrás, mide por calles y además puede
respetar:

- **Capacidad del vehículo** por peso.
- **Ventanas horarias** de atención al cliente.
- **Tiempo de descarga** en cada parada.

Si quieres eso, la infraestructura ya está escrita y probada en su parte de
aplicación; solo falta levantarla.

### Alternativas comerciales

Si no quieres mantener dos servicios, Google tiene **Route Optimization** y Mapbox
tiene su **Optimization API**. Se integran en el mismo sitio del código
(`src/lib/rutas/optimizar.ts`), a cambio de pagar por uso. Para volúmenes
pequeños su plan gratuito suele bastar.

---

## Adaptarlo a otra empresa o a otro país

Toda la configuración regional está en un único archivo: **`src/config/empresa.ts`**.

```ts
export const empresa = {
  nombre: 'Transportes Lima Express S.A.C.',
  idFiscalLabel: 'RUC',      // RUC en Perú, NIT en Colombia, CUIT en Argentina, RFC en México
  ciudad: 'Lima',
  moneda: 'PEN',             // ISO 4217
  locale: 'es-PE',
  unidadCombustible: 'gal',  // 'l' para litros
};
```

Cambiar la moneda, el locale y la etiqueta del identificador fiscal adapta el sistema a
otro país. Los umbrales de alerta de vencimiento (`umbrales.preventivo` y
`umbrales.critico`), el porcentaje de comisión por defecto y el impuesto sobre ventas
(IGV en Perú) se ajustan en el mismo archivo.

Las **zonas de reparto** están en `src/lib/zonas.ts`: veinte distritos de Lima
Metropolitana y Callao con sus coordenadas, más el generador de direcciones con
formato peruano («Av. Arequipa 1234»). Para otra ciudad se cambia esa lista, o se
conecta a un geocodificador.

---

## Usuarios, roles y permisos

### Quién necesita cuenta

Solo el personal. **El cliente final no necesita cuenta**: consulta dónde va su paquete en
`/rastrear`, que es una página pública y no muestra información interna.

### Los cuatro roles

| Rol | Qué puede hacer |
| --- | --- |
| **Administración** | Todo, incluidas finanzas, facturación y liquidaciones |
| **Despacho** | Pedidos, rutas, entregas, flota y conductores. **Sin acceso a nada de dinero** |
| **Conductor** | Solo **sus propias** hojas de ruta: las consulta y **registra sus entregas** en `/mi-ruta`. Nada de importes |
| **Gerencia** | Ve todos los módulos, pero **no modifica nada** |

El buzón de pedidos es un módulo aparte de despachos, y no por gusto: contiene direcciones,
teléfonos e importes a cobrar de **toda** la operación. Un conductor sí ve sus rutas, pero no
la bandeja donde están los pedidos de los clientes de sus compañeros.

La matriz exacta vive en un único archivo, `src/lib/auth/permisos.ts`. Es el único sitio
donde se decide quién puede qué: si aparece una comprobación de rol escrita a mano en una
página, está mal.

### Por qué «entregar» es un permiso aparte de «editar»

`entregar` y `editar` están separadas a propósito. *Editar despachos* es el trabajo de
oficina: crear la hoja de ruta, asignarle unidad y conductor, reordenarla, cerrarla.
*Entregar* es resolver una parada concreta en la calle. Si fueran la misma acción, para que
un conductor pudiera marcar una entrega habría que darle el control completo del despacho.

Separarlas obliga a una segunda pregunta, porque el permiso por módulo ya no basta: todos
los conductores comparten la acción `entregar`, así que uno podría enviar el identificador
de una parada de otro compañero y marcarla como entregada. De eso se encarga
`requerirParadaPropia()` en `src/lib/auth/sesion.ts`, que comprueba que la parada pertenece
a una ruta del conductor que la envía. La oficina sí puede resolver cualquier parada:
muchas veces registra entregas en nombre de un conductor que llamó por teléfono.

### Crear y gestionar usuarios

**Desde la aplicación**, en `/usuarios`, que solo ve el rol Administración. Es la pantalla
para el día a día: crear la cuenta de un despachador o de un conductor, asignarle su rol,
generar una contraseña, cambiarla cuando alguien la olvida, vincular una cuenta de conductor
con su ficha de la plantilla y quitarle el acceso a quien ya no trabaja aquí.

Dos decisiones que conviene conocer:

- **No se borran cuentas, se desactivan.** Desactivar cierra todas sus sesiones en el acto y
  consigue lo mismo, sin perder el rastro de quién registró cada pedido y quién subió cada foto
  de entrega.
- **Hay dos frenos** que impiden quedarse fuera de la propia aplicación: no puedes desactivar
  tu propia cuenta, y no puedes rebajarte de rol si eres el último administrador activo. Sin
  ellos, recuperarse exigiría entrar por consola al servidor, que es justo lo que esta pantalla
  viene a evitar.

En el servidor, para el primer administrador o para automatizar, sigue estando la terminal:

```bash
# Crear (si omites la contraseña se genera una segura y se muestra una sola vez)
npm run usuario -- crear jefe@miempresa.pe "Ana Restrepo" administracion

# Ver todos, con su rol, estado y sesiones abiertas
npm run usuario -- listar

# Cambiar la contraseña (cierra todas sus sesiones abiertas)
npm run usuario -- clave jefe@miempresa.pe

# Desactivar a alguien que sale de la empresa (cierra sus sesiones al instante)
npm run usuario -- desactivar alguien@miempresa.pe
```

En Railway, esos comandos se ejecutan contra la base de datos del servicio con
`railway run npm run usuario -- …`.

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
npm run verificar-permisos  # cada rol entra exactamente donde le toca
npm run verificar-mi-ruta   # el conductor entrega con foto, y no puede tocar lo ajeno
npm run verificar-pedidos   # el analizador de chats y el circuito del buzón
npm run verificar-usuarios  # crear cuentas, entrar con ellas y los frenos de administración
npm run verificar-arranque  # el primer administrador, sobre una base sin ninguna cuenta
npm run verificar-contraste # que ningún texto quede ilegible en claro ni en oscuro
```

`verificar-permisos`, `verificar-mi-ruta`, `verificar-pedidos` y `verificar-usuarios`
necesitan el servidor arrancado y la base sembrada. Las tres últimas **escriben de verdad**
(registran entregas, dan de alta pedidos y crean cuentas), así que si se agotan hay que
regenerar los datos con `npm run seed`.
`verificar-pedidos` empieza probando el analizador de chats, que es lógica pura y se ejecuta
sin servidor: es donde de verdad se decide si esa función ahorra trabajo o lo crea.

`verificar-arranque` es aparte, porque necesita lo contrario que las demás: una base **sin
ninguna cuenta**. El ciclo es:

```bash
npm run build
SIN_CUENTAS_DEMO=1 node scripts/seed.ts
SIN_CUENTAS_DEMO=1 npm start
npm run verificar-arranque
npm run seed        # devuelve la base al estado de demostración
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
2. En el servicio de la aplicación, pestaña **Variables**, añade tres variables:
   ```
   DATABASE_URL      = ${{Postgres.DATABASE_URL}}
   TZ                = America/Lima
   SIN_CUENTAS_DEMO  = 1
   ```
   La primera es una referencia al servicio de base de datos (así la cadena de conexión
   se mantiene sola aunque cambie); el nombre `Postgres` debe coincidir con el que le
   haya puesto Railway a tu servicio de base de datos.

   **`TZ` no es opcional.** La aplicación calcula «hoy» y todos los rangos de fechas con
   la hora local del proceso, y un contenedor en la nube está en UTC. Si la empresa opera
   en Perú (UTC-5), sin esta variable a partir de las 19:00 el sistema consideraría
   que ya es el día siguiente: los despachos del día, los indicadores y los vencimientos
   saldrían corridos. Ajusta el valor a la zona de la empresa.

   **`SIN_CUENTAS_DEMO=1`** hace que la siembra cree los datos de ejemplo —clientes,
   vehículos, rutas, envíos— pero **ninguna cuenta**. Es lo que quieres en un despliegue
   de verdad: sin él se crearían cuatro cuentas con la contraseña `demo1234`, que está
   escrita en este mismo README. Sin cuentas, la primera la creas tú desde el navegador
   (ver el paso 4).
3. En **Settings**, comprueba que quede así:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Healthcheck Path:** `/api/salud`
4. En **Networking**, pulsa *Generate Domain* para obtener la URL pública.
5. Abre esa URL. Como no hay ninguna cuenta, la aplicación te lleva sola a
   **`/configuracion-inicial`**: escribe tu nombre, tu correo y la contraseña que quieras,
   y entrarás directamente como **administración**. A partir de ese momento esa pantalla
   se cierra para siempre.
6. El resto de tu equipo lo das de alta desde **Configuración → Usuarios y permisos**, en
   la propia aplicación. No hace falta tocar la consola para nada.

> **La ventana del primer administrador.** Mientras no exista ninguna cuenta, quien abra
> la URL puede reclamar esa primera cuenta. Es el problema clásico del arranque en frío y
> se resuelve igual que en cualquier instalación: créala nada más desplegar. Si te preocupa,
> despliega con `SIN_CUENTAS_DEMO` sin definir, entra con la cuenta de ejemplo, crea la
> tuya, desactiva las cuatro y solo entonces pon `SIN_CUENTAS_DEMO=1` para los siguientes
> despliegues.

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
| **Cuentas de demostración** | Con `SIN_CUENTAS_DEMO=1` no se crea ninguna y la primera cuenta la haces tú desde `/configuracion-inicial`. Si despliegas sin esa variable, se crean cuatro con la contraseña `demo1234`: desactívalas antes de usar el sistema con datos reales, y no dejes `MOSTRAR_ACCESOS_DEMO` activo en producción |

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
7. **Aplicación móvil para el conductor**, con registro de entregas sin conexión. Hoy la
   PWA ya captura **la foto de quien recibe** como prueba de entrega, pero **consultar** sin
   conexión sí funciona y **registrar** no: si el conductor pierde cobertura, tiene que
   esperar a recuperarla.
8. **Almacenamiento de objetos para las fotos** cuando el volumen lo pida, y una política
   de retención (cuánto tiempo se guardan antes de borrarlas). Ver la sección de la foto de
   entrega para el cálculo y por dónde se cambia.
9. **Notificaciones** al cliente (correo o mensajería) en cada cambio de estado del envío.
10. **Más canales de entrada de pedidos.** Hoy se pega el chat y se importa tecleando. Lo que
    sigue, por orden de valor: importar una planilla de Excel para los clientes que la mandan;
    un **portal del cliente** para que el remitente teclee sus propios pedidos y lleguen ya
    estructurados (es la respuesta de fondo, pero cambia quién hace el trabajo y necesita
    cuentas de cliente); y, solo cuando el volumen lo justifique, la **API de WhatsApp
    Business**, que exige cuenta verificada, número dedicado, plantillas aprobadas y un
    intermediario. El analizador ya construido se reutiliza en cualquiera de los tres.
11. **Cuadre de caja del cobro contra entrega.** El importe a cobrar ya se registra y se ve
    en «Mi ruta» y en el buzón, pero no hay todavía un cierre que compare lo cobrado con lo
    entregado en efectivo.

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
