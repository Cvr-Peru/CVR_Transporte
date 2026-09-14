/**
 * Cuentas de demostración.
 *
 * Viven en un único sitio porque las usan dos partes que deben coincidir: el
 * generador de datos (que las crea) y la pantalla de entrada (que las muestra).
 * Si estuvieran duplicadas, cambiar una y olvidar la otra dejaría botones que no
 * funcionan.
 *
 * En un despliegue real hay que borrarlas y crear las cuentas de verdad con
 * `npm run usuario -- crear`.
 */
import type { Rol } from './permisos';

export const CLAVE_DEMO = 'demo1234';

export interface CuentaDemo {
  email: string;
  nombre: string;
  rol: Rol;
  /**
   * El usuario conductor se vincula a un conductor real de la base de datos,
   * así que su nombre y su identificador se resuelven al generar los datos.
   */
  esConductor?: boolean;
}

export const CUENTAS_DEMO: CuentaDemo[] = [
  { email: 'admin@limaexpress.pe', nombre: 'Claudia Rojas Paredes', rol: 'administracion' },
  { email: 'despacho@limaexpress.pe', nombre: 'Miguel Ángel Quispe', rol: 'despachador' },
  { email: 'gerencia@limaexpress.pe', nombre: 'Fernando Salcedo Ruiz', rol: 'gerencia' },
  { email: 'conductor@limaexpress.pe', nombre: '', rol: 'conductor', esConductor: true },
];
