/**
 * Límites de intentos fallidos (solo servidor).
 *
 * Frenan a quien prueba contraseñas en `/entrar` o recorre guías en la página
 * pública `/rastrear`. Sin ellos, scrypt encarece cada intento pero no impide
 * hacer miles: un diccionario contra el correo del administrador es cuestión de
 * paciencia.
 *
 * Cómo se cuenta:
 *  - Solo cuentan los **fallos**. Entrar bien o encontrar una guía no gasta nada,
 *    así que el uso normal nunca choca con el límite.
 *  - Por **correo**: es el freno que de verdad protege una cuenta, porque no
 *    depende de la red desde la que se ataque. Se aplica a cualquier correo, exista
 *    o no, para no revelar qué cuentas hay.
 *  - Por **IP**: más holgado, porque en una oficina o detrás de la red del operador
 *    muchas personas comparten dirección. Frena a quien prueba muchos correos o
 *    muchas guías desde el mismo sitio.
 *
 * Lo que hay que saber de la IP: sale de `X-Forwarded-For`, que pone el proxy de
 * la plataforma (Railway) pero que un cliente también puede escribir. Alguien
 * decidido puede cambiarla en cada petición, así que el límite por IP es un freno
 * de apoyo; el que no se puede esquivar es el del correo. En `/rastrear` el freno
 * de fondo es que las guías ya no son correlativas (`src/lib/guias.ts`).
 *
 * El precio del límite por correo: quien conozca un correo puede bloquear esa
 * cuenta unos minutos a base de fallar a propósito. Es el compromiso habitual y
 * se mantiene corto (ver `LIMITES`) para que el daño sea una espera, no una
 * caída.
 */
import { headers } from 'next/headers';
import { all, run } from '@/db/client';
import { aISOCompleto, parseFecha } from '@/lib/format';

export interface Limite {
  /** Fallos permitidos dentro de la ventana. */
  maximo: number;
  /** Duración de la ventana, en minutos. */
  minutos: number;
}

export const LIMITES = {
  /** Contraseñas equivocadas para un mismo correo. */
  accesoCorreo: { maximo: 5, minutos: 15 },
  /** Contraseñas equivocadas desde una misma IP, para cualquier correo. */
  accesoIp: { maximo: 30, minutos: 15 },
  /** Guías inexistentes consultadas desde una misma IP en `/rastrear`. */
  rastreoIp: { maximo: 20, minutos: 15 },
} as const satisfies Record<string, Limite>;

/** Los fallos se guardan un día; pasado ese tiempo ya no cuentan para nada. */
const RETENCION_MS = 24 * 60 * 60 * 1000;

export function claveCorreo(email: string): string {
  return `acceso:correo:${email.trim().toLowerCase().slice(0, 320)}`;
}

/**
 * Clave del contador por IP para un ámbito («acceso», «rastreo»), o `null` si la
 * petición no trae IP.
 *
 * Sin proxy delante (Docker en local, un servidor expuesto directamente) no llega
 * ninguna cabecera con la IP. Agrupar a todos bajo una clave común sería peor que
 * no contar: treinta fallos de cualquiera bloquearían el acceso de todo el mundo.
 * En ese caso solo actúa el límite por correo.
 */
export async function claveIp(ambito: string): Promise<string | null> {
  const cabeceras = await headers();
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = reenviada || cabeceras.get('x-real-ip')?.trim();
  return ip ? `${ambito}:ip:${ip.slice(0, 64)}` : null;
}

/**
 * Minutos que faltan para poder volver a intentarlo, o `0` si no hay bloqueo.
 *
 * Con varios contadores manda el más restrictivo. El bloqueo se levanta cuando el
 * fallo que lo completó sale de la ventana, así que no hay que esperar a que
 * caduquen todos.
 */
export async function minutosDeBloqueo(
  contadores: { clave: string; limite: Limite }[],
): Promise<number> {
  const ahora = Date.now();
  let espera = 0;

  for (const { clave, limite } of contadores) {
    const desde = aISOCompleto(new Date(ahora - limite.minutos * 60_000));
    const fallos = await all<{ momento: string }>(
      `SELECT momento FROM intentos_fallidos
       WHERE clave = $1 AND momento > $2
       ORDER BY momento DESC
       LIMIT $3`,
      clave,
      desde,
      limite.maximo,
    );
    if (fallos.length < limite.maximo) continue;

    const decisivo = parseFecha(fallos[limite.maximo - 1].momento);
    if (!decisivo) continue;
    const libre = decisivo.getTime() + limite.minutos * 60_000;
    espera = Math.max(espera, Math.ceil((libre - ahora) / 60_000));
  }

  return Math.max(0, espera);
}

/** Anota un fallo en cada contador indicado. */
export async function registrarFallo(claves: string[]): Promise<void> {
  const momento = aISOCompleto(new Date());
  for (const clave of claves) {
    await run('INSERT INTO intentos_fallidos (clave, momento) VALUES ($1, $2)', clave, momento);
  }
  // La tabla se poda sola: lo que tenga más de un día ya no interviene en ningún límite.
  await run(
    'DELETE FROM intentos_fallidos WHERE momento < $1',
    aISOCompleto(new Date(Date.now() - RETENCION_MS)),
  );
}

/** Borra un contador. Se usa al entrar bien: los fallos anteriores eran despistes. */
export async function olvidarFallos(clave: string): Promise<void> {
  await run('DELETE FROM intentos_fallidos WHERE clave = $1', clave);
}
