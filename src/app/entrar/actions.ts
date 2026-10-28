'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { autenticar, cerrarSesion, iniciarSesion } from '@/lib/auth/sesion';
import {
  claveCorreo,
  claveIp,
  LIMITES,
  minutosDeBloqueo,
  olvidarFallos,
  registrarFallo,
} from '@/lib/auth/limites';
import { moduloDeRuta, puede, rutaInicio, type Rol } from '@/lib/auth/permisos';

/**
 * Solo se aceptan rutas internas como destino tras entrar. Sin esta comprobación,
 * un enlace del tipo `/entrar?volver=https://sitio-malicioso` convertiría la
 * pantalla de acceso en un trampolín para phishing.
 */
function rutaInternaSegura(valor: FormDataEntryValue | null): string {
  const ruta = typeof valor === 'string' ? valor : '';
  if (!ruta.startsWith('/') || ruta.startsWith('//')) return '';
  return ruta;
}

/**
 * Decide dónde aterriza el usuario después de entrar.
 *
 * No basta con mandarlo a `/`: el tablero no lo ve todo el mundo. Un conductor
 * acabaría en la pantalla de «sin acceso», cuyo botón «volver al inicio» lo
 * devolvería al mismo sitio — un bucle del que no se sale.
 *
 * Criterio: se respeta el destino pedido **solo si ese rol puede abrirlo**; si
 * no, se le lleva a la primera sección que sí tenga permitida.
 */
function destinoTrasEntrar(volver: string, rol: Rol): string {
  if (volver) {
    const modulo = moduloDeRuta(volver);
    // `modulo === null` son rutas sin módulo (rastrear, mi ubicación): las puede
    // ver cualquiera con sesión.
    if (modulo === null || puede(rol, modulo, 'ver')) return volver;
  }
  return rutaInicio(rol);
}

export async function entrar(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const clave = String(formData.get('clave') ?? '');
  const volver = rutaInternaSegura(formData.get('volver'));

  if (!email || !clave) {
    redirect(`/entrar?error=faltan&volver=${encodeURIComponent(volver)}`);
  }

  // El freno va antes de comprobar la contraseña: mientras dura el bloqueo no se
  // calcula ningún scrypt, así que tampoco sirve para cargar el servidor. Y se
  // responde igual exista el correo o no (ver `src/lib/auth/limites.ts`).
  const porCorreo = claveCorreo(email);
  const porIp = await claveIp('acceso');
  const espera = await minutosDeBloqueo([
    { clave: porCorreo, limite: LIMITES.accesoCorreo },
    ...(porIp ? [{ clave: porIp, limite: LIMITES.accesoIp }] : []),
  ]);
  if (espera > 0) {
    redirect(`/entrar?error=bloqueo&minutos=${espera}&volver=${encodeURIComponent(volver)}`);
  }

  const resultado = await autenticar(email, clave);

  if (!resultado.ok) {
    // Una cuenta desactivada con la contraseña buena no es un intento de adivinarla.
    const desactivada = resultado.motivo.includes('desactivada');
    if (!desactivada) await registrarFallo(porIp ? [porCorreo, porIp] : [porCorreo]);
    redirect(
      `/entrar?error=${desactivada ? 'inactiva' : 'credenciales'}&volver=${encodeURIComponent(volver)}`,
    );
  }

  await olvidarFallos(porCorreo);

  const cabeceras = await headers();
  await iniciarSesion(resultado.usuarioId, cabeceras.get('user-agent'));
  redirect(destinoTrasEntrar(volver, resultado.rol));
}

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect('/entrar');
}
