/**
 * Derivación y verificación de contraseñas.
 *
 * Se usa **scrypt**, que viene incluido en Node (`node:crypto`). Es una función
 * de derivación deliberadamente lenta y con uso intensivo de memoria: encarece
 * muchísimo un ataque por fuerza bruta si alguien obtiene la tabla de usuarios.
 *
 * No se usa `bcrypt` ni `argon2` para no añadir dependencias nativas, que además
 * complicarían el despliegue.
 *
 * Reglas que no hay que romper:
 *  - **Nunca** guardar la contraseña en claro ni su hash sin sal.
 *  - Cada usuario tiene su propia sal aleatoria.
 *  - La comparación es en tiempo constante (`timingSafeEqual`), para no filtrar
 *    información por el tiempo que tarda en fallar.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  clave: string,
  sal: string,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Longitud del hash resultante, en bytes. */
const LARGO_HASH = 64;

/**
 * Parámetros de coste. N=2^15 con r=8 usa unos 32 MB y tarda del orden de
 * 100 ms, que es imperceptible al entrar pero devastador para un atacante.
 */
const COSTE = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Sal aleatoria nueva, en hexadecimal. */
export function generarSal(): string {
  return randomBytes(16).toString('hex');
}

/** Deriva el hash de una contraseña con su sal. */
export async function hashClave(clave: string, sal: string): Promise<string> {
  // Se normaliza para que la misma contraseña escrita con otro teclado o con
  // acentos compuestos produzca siempre el mismo hash.
  const derivada = await scryptAsync(clave.normalize('NFKC'), sal, LARGO_HASH, COSTE);
  return derivada.toString('hex');
}

/** Comprueba una contraseña contra el hash y la sal guardados. */
export async function verificarClave(
  clave: string,
  sal: string,
  hashEsperado: string,
): Promise<boolean> {
  let calculado: Buffer;
  let esperado: Buffer;

  try {
    calculado = Buffer.from(await hashClave(clave, sal), 'hex');
    esperado = Buffer.from(hashEsperado, 'hex');
  } catch {
    return false;
  }

  // timingSafeEqual exige la misma longitud; si no coincide, no es la clave.
  if (calculado.length !== esperado.length) return false;
  return timingSafeEqual(calculado, esperado);
}

/** Token de sesión: 32 bytes aleatorios, imposibles de adivinar. */
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash rápido del token para guardarlo en la base de datos.
 *
 * Aquí basta con SHA-256, no scrypt: el token ya tiene 256 bits de entropía, así
 * que no es adivinable y no hace falta encarecer el cálculo. Se guarda el hash
 * para que quien lea la tabla `sesiones` no pueda suplantar a nadie.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
