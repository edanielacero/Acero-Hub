/**
 * Los especificadores de Deno, mapeados a los tipos que ya están instalados.
 *
 * Las Edge Functions importan el cliente por URL (`https://esm.sh/...`) porque
 * en Deno no hay `node_modules`. `tsc` no sabe resolver una URL, así que se
 * declara el módulo y se reexportan los tipos del paquete real — que sí está
 * instalado para el lado Next.
 *
 * Se hace acá y no con `paths` en el tsconfig porque `paths` necesita
 * `baseUrl`, que TypeScript 6 deprecó.
 */
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}

/**
 * El global `Deno`, con lo que las funciones de Finanzas realmente usan.
 *
 * Se declara a mano en vez de traer `@types/deno` entero: son cuatro miembros,
 * y así el chequeo avisa el día que alguien use algo nuevo del runtime en vez
 * de dejarlo pasar contra un tipo enorme.
 */
declare namespace Deno {
  const env: { get(key: string): string | undefined }
  const version: { deno: string }
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
