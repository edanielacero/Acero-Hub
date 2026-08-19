# Arquitectura de mini-apps del Hub

Esta es la convención para **todas** las mini-apps del Hub, existentes y futuras.
Se estableció el 19 de agosto de 2026 después de medir por qué abrir Finanzas
tras un rato de inactividad congelaba la interfaz.

## El problema que la originó

Había un middleware (`proxy.ts`) que corría en el servidor antes de cada
navegación y de cada prefetch. Verificaba el JWT y, cuando el access token
estaba vencido, salía a la red de Supabase a renovarlo. Medido:

| | |
|---|---|
| Request con sesión válida | 2–4 ms |
| Request con token vencido | **276 ms** |
| Apertura de Finanzas (documento + 4 prefetch de la tab bar) | **583 ms** |

Los 583 ms se pagaban **antes de pintar un pixel**. Eliminado el middleware, la
misma apertura pasó a **49 ms**.

## Las cuatro reglas

### 1. Sin middleware en el camino de la navegación

No existe `proxy.ts` ni `middleware.ts`. El gate de navegación se resuelve en el
cliente leyendo los claims de la cookie, sin red.

**Esto no debilita la seguridad**, porque el middleware nunca protegió datos:
ya hacía early-return en `/api/`. Lo que protege los datos son `requireUser()`
—que sí verifica la firma del JWT— y las policies de RLS en cada ruta de API.
Verificado endpoint por endpoint: todos responden 401 sin sesión válida,
incluido el de borrar usuarios de admin.

### 2. El gate va en el layout, con `<AccessGate>`

```tsx
// app/mi-app/layout.tsx
<AccessGate project="mi-app">
  <MiAppRouterProvider>{children}</MiAppRouterProvider>
</AccessGate>
```

`components/AccessGate.tsx` lee `app_metadata.projects` del JWT y redirige si
falta el permiso. Es un gate de **qué pintar**, no de a qué datos se llega —
está escrito en el encabezado del archivo para que nadie lo confunda.

El slug tiene que coincidir con el de la tabla `projects` de Supabase.

### 3. La sesión la refresca el cliente, no el servidor

`<SessionKeeper/>` vive en el layout raíz y cubre Hub y las tres mini-apps.
Mantiene el token fresco de fondo con `autoRefreshToken`, y en `SIGNED_OUT`
manda a `/login`.

**Consecuencia obligatoria:** toda ruta de API que el cliente consuma al
arrancar tiene que tratar un 401 como *token vencido*, no como *sesión muerta*:
refrescar y reintentar una vez antes de rendirse. Abrir la app después de horas
sale con el token viejo, y borrar el caché local ahí deja al usuario sin datos
por un token de una hora. Ver `reload()` en
`app/finanzas/components/data-context.tsx`.

### 4. Una sola ruta de Next por mini-app

```
app/mi-app/
  layout.tsx              AccessGate + Provider + shell
  [[...slug]]/page.tsx    la única ruta; generateStaticParams
  router.tsx              createMiniAppRouter('/mi-app')
  screens/
    paths.ts              URLs sin parámetro (módulo PLANO, sin 'use client')
    index.tsx             resuelve pantalla desde los segmentos
    home.tsx, ...         las pantallas, componentes comunes
  components/             lo compartido entre pantallas
```

Cambiar de pantalla es un `pushState` más un cambio de estado: cero red, cero
payload RSC, cero router de Next. La URL sigue siendo real y compartible porque
`generateStaticParams` prerenderiza un HTML por cada pantalla conocida.

**Costo medido en Finanzas:** +10,8 KB gzip al abrir (266,2 → 276,9). El code
splitting por ruta movía apenas 5,5 KB entre la pantalla más liviana y la más
pesada — no estaba comprando casi nada.

#### Detalles que muerden

- **`paths.ts` no lleva `'use client'`.** Lo consume `generateStaticParams`, que
  corre en el build del servidor. Exportado desde un módulo de cliente, el
  servidor recibe una referencia en vez del array y el build falla con
  `SCREEN_PATHS.map is not a function`.
- **`dynamicParams`** va en `false` si todas las URLs son enumerables
  (Finanzas), y en `true` si alguna lleva un id que sale de la base
  (`/trading-journal/<sessionId>`, `/expandlogy/clients/<id>`). Con `true`, esa
  URL se renderiza en el servidor la primera vez; toda la navegación posterior
  sigue siendo local.
- **Segmentos reservados.** Si una mini-app tiene URLs con id en la raíz, hay
  que declarar cuáles primeros segmentos *no* son un id — si no, `/mi-app/ajustes`
  se interpreta como el id `ajustes`. Ver `RESERVED_SEGMENTS` en trading-journal.
- **El estado inicial del router sale de `usePathname()`, no de `location`.** En
  el prerender del servidor `location` no existe, y arrancar con otra cosa que
  lo que trae el HTML estático es un hydration mismatch.

## Cómo agregar una mini-app nueva

1. Insertar la fila en la tabla `projects` de Supabase (si no, el admin no puede
   dar acceso).
2. Crear la estructura de arriba.
3. `createMiniAppRouter('/mi-app')` en `router.tsx`.
4. `<AccessGate project="mi-app">` en el layout.
5. Usar el `Link` y el `usePath` del router propio, **nunca** `next/link` ni
   `usePathname` puertas adentro.
6. Verificar en el build que la ruta salga `●` (SSG) y que no aparezca ninguna
   `ƒ` de página.

## Estado actual

| Mini-app | Rutas antes | Ahora |
|---|---|---|
| Finanzas | 7 (`○` estáticas) | `● /finanzas/[[...slug]]` |
| Trading Journal | 7, **5 de ellas `ƒ`** | `● /trading-journal/[[...slug]]` |
| Expandlogy | 6, **1 de ellas `ƒ`** | `● /expandlogy/[[...slug]]` |

Las 6 rutas `ƒ` se renderizaban en el servidor bajo demanda: cada click entre
Dashboard, Stats, Sweet Spot, Montecarlo y Variables era un viaje al servidor.
Ya no queda ninguna `ƒ` de página en todo el Hub.
