import { NextResponse } from 'next/server'

/**
 * El sello del build corriendo ahora mismo, para que un cliente viejo (p. ej.
 * la app en el home screen del iPhone, sin botón de refresh de Safari) note
 * que hay un deploy nuevo. Sin sesión de por medio: no es dato de nadie.
 */
export async function GET() {
  return NextResponse.json({ version: process.env.BUILD_ID ?? null })
}
