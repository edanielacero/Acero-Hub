/**
 * Tipos mínimos de `web-push` para el chequeo de las Edge Functions.
 *
 * El paquete real solo existe dentro de Deno (`npm:web-push@3.6.7`), así que no
 * está en `node_modules` y `tsc` no tendría de dónde sacar sus tipos. Se
 * declara solo lo que se usa: si mañana se usa algo más, falta acá y el
 * chequeo avisa — que es exactamente lo que se quiere.
 */
declare module 'npm:web-push@3.6.7' {
  interface Suscripcion {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void
    sendNotification(subscription: Suscripcion, payload?: string): Promise<unknown>
  }
  export default webpush
}
