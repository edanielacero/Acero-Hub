import type { Client } from './types'

// Prototipo: Expandlogy corre 100% con datos hardcodeados en el cliente.
// No hay base de datos ni llamadas de red — todo vive en memoria del navegador
// y se reinicia al recargar la página.

export const TEAM_MEMBERS = ['Daniel', 'Luis'] as const
export type TeamMember = typeof TEAM_MEMBERS[number]

// Se calcula relativo a "hoy" (no una fecha fija) para que el recordatorio
// de vencimiento del cliente semilla siempre se vea en la demo. Devuelve
// solo la fecha (YYYY-MM-DD), compatible con <input type="date">.
export function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const LULOS_INFO = `1️⃣ Datos Personales:
Nombre(s): Pedro
Apellidos: Cabrera
Correo Electrónico: Cabrerapedro78@gmail.com
Número de Teléfono: 404 667 5751

2️⃣ Datos del Negocio:
Nombre del Negocio: Lulos Painting & Home Restoration
Dirección Completa del Negocio: 2433 pond rd Duluth ga 30096
Ciudad: Atlanta
Estado: GA
ZIP Code: 30096
TAX ID: 473899976
Sitio web: Lulospainting.com
Ciudades/Lugares donde desea mostrar sus anuncios y Millas a la redonda:
Pintura y Remodelación para:
Jhons creek
Milton
Alpharetta
Roswell
Duluth
Sugar Hill
Brookhaven

Siding y decks para: Gainsville Ga
Idioma y Publico: Americano INglés

Presupuesto Mensual 700$

3️⃣ Información del Servicio:
Lista de servicios que brinda?:
Cual es el servicio estrella o el que mas se solicita?:
Adjuntar Fotos y Videos de sus servicios (si tiene):

4. Para Expandlogy:
Dominio Cloudflare: https://lulospaintinghl.com
Correo Cloudflare:

Drive: https://drive.google.com/drive/folders/18vge1SOOGC1nd9l7IhmckUON1RARM630
Sheets: https://docs.google.com/spreadsheets/d/15tDOlUkJnjB46MWa7jQh55KP1hOtTun6WqyHi8_cfAI/edit?gid=0#gid=0`

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'lulos',
    name: 'Lulos',
    info: LULOS_INFO,
    status: 'onboarding',
    serviceEndsAt: daysFromNow(6),
  },
]
