# Finanzas — Decisiones técnicas

> Este documento **no** es un sprint ni un plan. Es el registro de las
> decisiones de ingeniería que no se deducen leyendo el código: por qué las
> cosas están armadas así, qué alternativa se descartó y qué invariante hay que
> respetar para no romperlas sin darse cuenta.
>
> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprint 1: `documento_maestro_finanzas.md` · Sprint 2: `sprint_2_compartidos.md`.
>
> Última actualización: 2026-08-18

---

## 0. Cómo se usa este documento

Cada sección numerada es **una decisión**, con la misma forma:

1. **El problema** — qué se rompía o molestaba, en concreto.
2. **La decisión** — qué se hizo.
3. **Por qué no lo otro** — las alternativas que se descartaron y la razón.
4. **La invariante** — la regla que hay que respetar de acá en adelante.

Cuando aparezca una decisión técnica nueva que no pertenezca a un sprint
específico, se agrega acá como sección nueva. No se reescriben las viejas: si
una decisión se revierte, se agrega la decisión que la revierte y se marca la
anterior como superada.

---

## 1. Carga y percepción de velocidad (2026-08-18)

### 1.1 El problema: `$0` no es "cargando"

Al entrar a `/finanzas` la app mostraba **`$0.00`** en el patrimonio, en los
ingresos del mes y en los gastos del mes, hasta que llegaban los datos.

Eso no era un problema de lentitud sino de honestidad. El estado inicial del
provider era `totalUsd = 0`, `accounts = []`, `shared = EMPTY`, y la Home
pintaba esos valores sin mirar `loading`. En una app de plata, un cero **es una
respuesta**: se lee como "no tenés nada", no como "todavía no sé". Lo mismo
pasaba con el estado vacío de Movimientos, que afirmaba *"Todavía no
registraste nada"* mientras la lista viajaba por la red.

Y encima sí era lento, por tres razones acumuladas:

| Causa | Costo |
|---|---|
| Abrir la Home disparaba **6 requests en paralelo** — `accounts`, `categories`, `people`, `shared` desde el provider, más dos `transactions` (el mes y los últimos 5) desde la pantalla | 6 invocaciones de función, 6 verificaciones de JWT, 6 arranques en frío |
| `/accounts`, que es la que trae el patrimonio, refrescaba cotizaciones **sincrónicamente** si estaban vencidas | 3 llamadas a APIs externas (dolarapi, paralelo.bo, coingecko) con 4 s de timeout cada una, **antes** de tocar la base |
| Esa misma ruta se trae **toda la historia de movimientos** para derivar saldos | crece sin techo con el uso |

### 1.2 La decisión: tres capas, no una

Las tres opciones obvias —esqueleto, caché, o pedir más rápido— no son
alternativas: son capas complementarias que resuelven cosas distintas.

| Capa | Qué arregla |
|---|---|
| **1. Esqueletos** | La mentira. Nunca se pinta una cifra que no llegó |
| **2. Snapshot en el dispositivo** | La percepción. Al reabrir, el patrimonio real aparece antes que la red |
| **3. `/api/finanzas/bootstrap`** | La latencia real. Un viaje en vez de seis |

La capa 2 es la que más se siente, pero **no puede existir sola**: la primera
apertura de cada dispositivo no tiene snapshot, y ahí manda la capa 1. Y la
capa 3 es la que achica la ventana en que el snapshot está viejo.

---

### 1.3 Capa 1 — Esqueletos

Primitiva `<Skeleton>` en `app/finanzas/components/ui.tsx`, con la animación
`.fz-skel` en `theme.css` (respeta `prefers-reduced-motion`).

**Regla:** ninguna pantalla pinta un número mientras no lo tenga. Ni `$0`, ni
`—`, ni un estado vacío. Un estado vacío también es una afirmación.

Dónde se aplicó:

| Lugar | Antes | Ahora |
|---|---|---|
| Hero de la Home | `$0.00` | barra + *"Cargando tus cuentas…"* |
| Ingresos / Gastos del mes | `$0.00` | barra |
| Últimos movimientos | *"Todavía no registraste nada"* | 4 filas fantasma con la altura real |
| Rail de Cuentas | vacío | 3 filas fantasma |
| Tiles de Compartidos | `$0.00` | barra |

Las filas fantasma tienen **la altura exacta de las reales** para que la lista
no salte cuando llegan los datos.

Esto es distinto de `app/finanzas/loading.tsx`, que sigue existiendo: aquel
cubre la navegación de Next (mientras se resuelve la ruta), este cubre la
espera de **datos** una vez que la pantalla ya está montada.

#### Estado de error

Si no hay datos **y** la carga falló, la Home lo dice y ofrece reintentar. Un
esqueleto eterno se lee como "ya casi"; es tan poco honesto como el `$0`.

---

### 1.4 Capa 2 — Snapshot en el dispositivo

`lib/finanzas/snapshot.ts`. La última respuesta de `/bootstrap` se guarda en
`localStorage` y se pinta antes de tocar la red. El dato fresco la reemplaza
cuando llega. Es el trato que hace una app de banco.

| Parámetro | Valor | Por qué |
|---|---|---|
| Clave | `fz:snap:<VERSION>:<uid>` | Ver 1.4.1 |
| `VERSION` | `1` | Sube cuando cambia la forma del snapshot: descarta los viejos sin migrarlos |
| Vencimiento | **7 días** | Un patrimonio de hace más de una semana ya no informa nada; mejor el esqueleto |
| Tope de tamaño | **512 KB** | Serializar de más bloquea el hilo principal en cada guardado |

Mientras se revalida, el hero dice **"· actualizando…"** en lugar de "·
convertido a la tasa de hoy". Reemplaza a la coletilla en vez de sumarse, para
no pasar a dos líneas y mover el hero cuando llega el dato. El aviso importa:
el número que se ve es real, pero puede tener horas.

#### 1.4.1 Por qué el snapshot va llaveado por usuario

**RLS protege los datos reales, pero no un caché mal llaveado.** Si el snapshot
viviera en una clave global, dos cuentas en el mismo navegador se verían el
patrimonio de la otra durante el primer frame. Ninguna policy de Postgres puede
impedir eso: el dato ya está en el disco del cliente.

Entonces hace falta el `user_id` **antes del primer render**, lo que descarta
`getSession()` y `getClaims()`: son asíncronos y llegarían tarde. Se resuelve
leyendo la cookie de sesión de `@supabase/ssr` de forma síncrona:

```
cookie sb-<ref>-auth-token  →  "base64-" + JSON de la sesión  →  access_token
     →  payload del JWT  →  sub
```

Tres detalles que costaron encontrar y que no hay que perder:

- La cookie **se parte** en `nombre.0`, `nombre.1`… cuando pasa los 3180
  caracteres. Hay que reensamblarla en orden.
- Puede venir **con o sin** el prefijo `base64-`.
- Se busca **por forma** (`/^sb-.+-auth-token(?:\.(\d+))?$/`) y no por nombre
  exacto, para no depender de tener la URL del proyecto disponible en el bundle
  del navegador. Eso además la deja compilable con `tsc` suelto, que es como la
  compila el runner de tests.

Todo el parseo está envuelto en `try/catch` y devuelve `null` ante cualquier
cosa rara. **El snapshot es una mejora, nunca un requisito**: si falla, la app
funciona igual, solo que sin la ventaja.

Refuerzos:

- `/bootstrap` devuelve `uid`. Si la cookie no se pudo leer al montar, ese id es
  la red de seguridad: el snapshot nunca se escribe sin saber de quién es.
- Un `401` del server borra **todos** los snapshots (`clearSnapshots()`): la
  sesión ya no existe, así que lo cacheado no le pertenece a quien esté por
  entrar. No toca el resto de las claves `fz:` (preferencias como `fz:hidden`).

---

### 1.5 Capa 3 — `GET /api/finanzas/bootstrap`

Una ruta que devuelve todo lo que la Home necesita.

**Parámetros** (todos opcionales):

| Param | Default | Notas |
|---|---|---|
| `from`, `to` | mes del servidor | El mes lo fija **el cliente**: en Vercel el servidor corre en UTC y los días 1 y último del mes no coinciden con Bolivia |
| `limit` | 500 (tope 500) | Tope de la consulta del mes |
| `recent` | 5 (tope 50) | Cuántos movimientos para "últimos" |

**Respuesta:**

```jsonc
{
  "uid": "…",
  "accounts": [...], "total_usd": 0, "rates": {...}, "rate_list": [...],
  "categories": [...],
  "people": [...],
  "shared": {...},
  "tx": { "month": {...}, "recent": {...} }   // TxResult completos
}
```

#### 1.5.1 Las cotizaciones salen del camino crítico

`/bootstrap` **no espera** el refresco de cotizaciones. Sirve con lo que hay y
manda el refresco con `after()` de `next/server`, que corre después de
responder.

Con una cotización de hasta media hora (`QUOTE_TTL_MS`) el patrimonio no cambia
en la práctica; esperar tres APIs externas sí se siente. La única excepción es
**no tener ninguna cotización**: ahí sí espera, porque sin cotización las tasas
caen a los valores por defecto y el número mostrado sería falso.

`/api/finanzas/accounts` **sigue esperando** el refresco a propósito: la usa
Ajustes, donde el punto es justamente ver la cotización al día.

#### 1.5.2 Una sola implementación, no dos

Todos los loaders viven en `lib/finanzas/load.ts` y los usan **tanto**
`/bootstrap` **como** las cinco rutas sueltas:

| Loader | Ruta suelta que también lo usa |
|---|---|
| `loadAccounts` | `GET /accounts` |
| `loadCategories` | `GET /categories` |
| `loadPeople` | `GET /people` |
| `loadShared` | `GET /shared` |
| `loadTransactions` | `GET /transactions` |

Si hubiera dos implementaciones, la app mostraría una cosa al abrir y otra al
navegar, y nadie se enteraría hasta que el número no cuadrara. Hay un test que
compara las dos vías campo por campo (§1.9).

> ⚠️ `lib/finanzas/` entero se compila con `tsc` suelto para los tests
> (`tests/finanzas/run.mjs`). **Nada de ahí puede importar `next/*`** ni usar el
> alias `@/`, y los archivos tienen que llamarse con una sola palabra en
> minúsculas — el runner reescribe los imports relativos con
> `/from '\.\/([a-z]+)'/`.

#### 1.5.3 La caché de movimientos comparte clave entre pantallas

La consulta del mes usa `limit=500` **en la Home también**, aunque la Home solo
muestre totales. No es desperdicio: es la misma clave de caché que usa
Movimientos sin filtros, así que pasar de una pantalla a la otra no cuesta
ningún viaje. Por eso existe `monthQuery(range)` exportado desde
`data-context.tsx` — las dos pantallas lo usan en vez de armar el objeto a mano.

---

### 1.6 La invariante que sostiene todo esto

> **Nunca leer estado mutable de módulo durante el render.**

Esto no es teoría: costó un bug real y difícil de ver.

`useTransactions` leía la caché (`txCache`, un `Map` a nivel de módulo) desde el
inicializador del `useState`, o sea **dentro del render**. El provider vive en
`layout.tsx` y la pantalla en `page.tsx`: son **límites de hidratación
distintos**. El layout hidrataba y commiteaba primero, su efecto sembraba la
caché desde el snapshot, y recién después hidrataba la página — que ahora leía
datos donde el HTML del servidor había pintado un esqueleto.

React lo cantaba como *hydration mismatch* (`#418`) y **tiraba el árbol entero
de la página para regenerarlo en el cliente**, que es exactamente lo contrario
de lo que este trabajo buscaba.

**La corrección:** el estado arranca vacío **siempre**, aunque la caché ya tenga
la respuesta, y la caché se lee en un efecto de layout. El primer render queda
idéntico al HTML del servidor, y como el efecto corre antes del pintado tampoco
se ve ningún parpadeo.

Piezas que sostienen la invariante:

- `useIsoLayoutEffect` — `useLayoutEffect` en el navegador, `useEffect` en el
  server. Hidratar el snapshot tiene que pasar **antes** del primer pintado, o
  se vería un parpadeo esqueleto → datos.
- `seed` en el contexto — un contador que sube cada vez que el provider escribe
  en `txCache`. Es lo que despierta a `useTransactions`, que ya no puede
  enterarse leyendo el `Map` durante el render.
- `pending` en el contexto — mientras `/bootstrap` está en vuelo,
  `useTransactions` **no pide nada**: la respuesta que viene puede traer justo
  esa consulta, y pedirla sería duplicar el viaje.

**Síntoma para reconocerlo si vuelve:** `Minified React error #418` en la
consola de producción, intermitente, y ausente en desarrollo. Es intermitente
porque depende del orden de hidratación, y ausente en dev porque dev renderiza
en cada request mientras que producción sirve HTML pre-renderizado en el build.

---

### 1.7 Efecto secundario: guardar ya no parpadea

`reload()` después de una mutación **vaciaba** `txCache`, así que registrar un
gasto dejaba la lista en blanco un instante — el mismo parpadeo que este trabajo
vino a sacar.

Ahora sube la versión y **no tira nada**: cada entrada vieja se sigue mostrando
mientras se revalida (stale-while-revalidate de verdad). El mapa se vacía solo
si pasa de `MAX_ENTRIES = 40`, que en la práctica no ocurre — son meses ×
combinaciones de filtros.

Las entradas que vienen del snapshot se marcan con versión `-1` (`FROM_SNAPSHOT`)
para que se muestren pero siempre se revaliden.

---

### 1.8 Números medidos

Contra el build de producción, con el `/bootstrap` retenido artificialmente 4
segundos para probar que el snapshot pinta sin él:

| | Antes | Ahora |
|---|---|---|
| Viajes a `/api/finanzas` para pintar la Home | 6 | **1** |
| Mientras carga | `$0.00` | esqueletos |
| Patrimonio visible al reabrir | espera la red | **~100 ms** |
| Errores de hidratación | — | 0 en las 6 rutas |

Para dimensionar el ~100 ms: `DOMContentLoaded` ocurre a los ~65 ms. El
snapshot pinta prácticamente en cuanto React hidrata, que es el piso teórico.

> Medido en desarrollo daba ~3600 ms, pero eso es el bundle sin minificar de
> `next dev`, no la app. **Cualquier medición de percepción de velocidad tiene
> que hacerse contra `next build && next start`.**

### 1.9 Lo que no se hizo, y por qué

| Alternativa | Por qué no |
|---|---|
| Renderizar los datos en el servidor (SSR del payload inicial) | Volvería dinámica la ruta y costaría un viaje al servidor **en cada navegación**. Las rutas `/finanzas/*` siguen siendo estáticas (`○` en el build) y el layout sigue sin tocar la base — ver la nota del gate en `proxy.ts` |
| Materializar los saldos en una tabla | El saldo derivado es la razón por la que es imposible que un saldo mienta. Cambiarlo es una decisión de modelo, no de performance; si algún día pesa, la salida es agregar en SQL, no persistir |
| `sessionStorage` en vez de `localStorage` | No sobrevive a cerrar y reabrir la app, que es justo el caso que se quería arreglar |
| Vaciar el snapshot en cada logout desde el botón | Cubre menos casos que borrar ante un `401`: una sesión que vence sola nunca pasa por el botón |

---

### 1.10 Cómo se prueba

**En la suite del repo** (`node tests/finanzas/run.mjs`) — 518 pruebas en verde:

| Suite | Qué agregó este trabajo |
|---|---|
| `unit.mjs` | 18 pruebas del snapshot: cookie simple, entre otras cookies, **partida en dos**, sin prefijo `base64-`, corrupta, sin `sub`; vencimiento a los 7 días; JSON roto; y que **otro usuario no vea el snapshot** |
| `api.mjs` | 14 pruebas de `/bootstrap`, casi todas comparando **campo por campo** contra las rutas sueltas. Si las dos vías se separan, esto falla |

**Verificación en navegador real** (Playwright, ad-hoc, **no está en el repo**
para no sumarle una dependencia al proyecto). Vale la pena rehacerla si se toca
esta zona; comprueba:

1. Primera visita con `/bootstrap` retenido → hay esqueletos, **no** hay ningún
   `$0.00`, no dice "Todavía no registraste nada".
2. Al soltarlo → llegan patrimonio y movimientos, no quedan esqueletos.
3. Abrir la Home hace **exactamente 1** request a `/api/finanzas/`.
4. Reapertura con la red a 4 s → el patrimonio aparece igual, dice
   "actualizando…", y el aviso desaparece al llegar el dato fresco.
5. Consola **sin errores** — en particular sin `#418`, en las 6 rutas y en 4
   cargas de cada una.

El punto 5 es el que hay que correr sí o sí: es el único que detecta la clase de
bug de §1.6, y falla de forma intermitente.

---

### 1.11 Archivos

**Nuevos**

| Archivo | Qué es |
|---|---|
| `app/api/finanzas/bootstrap/route.ts` | El viaje único |
| `lib/finanzas/load.ts` | Los loaders que comparten `/bootstrap` y las rutas sueltas |
| `lib/finanzas/snapshot.ts` | Snapshot por dispositivo + lectura del `sub` de la cookie |

**Modificados**

| Archivo | Cambio |
|---|---|
| `app/finanzas/components/data-context.tsx` | `/bootstrap`, snapshot, `loading` / `stale` / `pending` / `error` / `seed`, caché con versión |
| `app/finanzas/components/ui.tsx` | Primitiva `<Skeleton>` |
| `app/finanzas/theme.css` | Animación `.fz-skel` + tokens `--fz-skel*` |
| `app/finanzas/page.tsx` | Esqueletos, aviso de "actualizando", estado de error |
| `app/finanzas/movimientos/page.tsx` | Usa `monthQuery()` para compartir clave de caché con la Home |
| `app/finanzas/compartidos/page.tsx` | Esqueletos en los tiles |
| `accounts` · `categories` · `people` · `shared` · `transactions` `/route.ts` | Delegan en `lib/finanzas/load.ts` |
| `tests/finanzas/unit.mjs` · `api.mjs` | Las 32 pruebas nuevas |

---

## 2. Invariantes vigentes

Lo que hay que respetar al tocar la mini-app. Cada una viene de un problema real.

| # | Invariante | Viene de |
|---|---|---|
| 1 | **Nunca pintar una cifra que no llegó.** Ni `$0`, ni estado vacío | §1.1 |
| 2 | **Nunca leer estado mutable de módulo durante el render.** Se lee en efecto de layout | §1.6 |
| 3 | **Un solo viaje para pintar la Home.** Lo que la Home necesite va en `/bootstrap` | §1.5 |
| 4 | **Una sola implementación por lectura.** Ruta suelta y `/bootstrap` comparten loader | §1.5.2 |
| 5 | **`lib/finanzas/` no importa `next/*` ni usa `@/`.** Nombres de archivo de una sola palabra en minúsculas | §1.5.2 |
| 6 | **Los rangos de fecha los fija el cliente.** El servidor corre en UTC | §1.5 |
| 7 | **Nada cacheado en el cliente sin llavearlo por usuario** | §1.4.1 |
| 8 | **Las rutas `/finanzas/*` se sirven estáticas.** Ni el layout ni las páginas consultan la base | §1.9 |
| 9 | **Medir percepción de velocidad solo contra `next build && next start`** | §1.8 |

### 2.1 Nota para el Sprint de "fijos"

`lib/finanzas/load.ts` ya tiene `loadRecurring()` y existe
`/api/finanzas/recurring`, pero **`/bootstrap` todavía no los incluye** y ningún
cliente los consume.

Cuando los fijos lleguen a la Home, hay que sumarlos a `/bootstrap` en el mismo
`Promise.all` y al `Snapshot` — si en vez de eso la pantalla se trae los suyos
por su cuenta, la Home vuelve a hacer dos viajes y se rompe la invariante #3.
Sumarlos cuesta dos líneas; darse cuenta después de que la app se volvió lenta
otra vez, bastante más.

Si el snapshot cambia de forma al sumarlos, hay que subir `VERSION` en
`lib/finanzas/snapshot.ts`.
