# Finanzas — Documento Maestro · Sprint 1: "Movimientos"

> Contexto financiero y de producto: ver `contexto_finanzas.md` en esta misma
> carpeta. Este documento especifica **únicamente el Sprint 1** — lo suficiente
> para empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-18 · Estado: **construido**, pendiente de
> prueba en navegador (§8)

---

## 0. Diseño visual

**Resuelto.** La dirección visual completa vive en `contexto_ui_finanzas.md`,
derivada de las referencias que entregó el usuario el 2026-08-17. Resumen de lo
que condiciona este sprint:

- **Canvas claro** (gris muy claro con paneles blancos), acento **verde bosque**
  `#16613C` con lima `#C8F169` sobre superficies oscuras, y una única tarjeta
  verde muy oscura para el patrimonio. Tokens en `app/finanzas/theme.css` — no
  toca `app/globals.css` ni el tema del Hub.
- **Dos layouts sobre un mismo sistema**: en móvil se ve y se siente como app
  nativa (tab bar flotante + FAB central + bottom sheets); en desktop se ve como
  dashboard (sidebar fija + contenido central + rail derecho). Un solo árbol de
  componentes, CSS responsive — no se renderiza dos veces.
- Tipografía **Plus Jakarta Sans** vía `next/font/google`, con `tabular-nums` en
  todos los montos de listas.
- Sin librería de UI ni de gráficas. Tailwind v4 y SVG escrito a mano.
- Sin modo oscuro en la v1.

- **Tab bar liquid glass**, reutilizando el CSS propio de
  `documentos/design/liquid-glass-menu.md` con el material reformulado a vidrio
  verde oscuro. Sin librerías de terceros para el efecto.

Quedan 3 decisiones menores abiertas (§12 del documento de UI): el formato del
saludo, si el hero lleva barra de proporción, y verificar el rendimiento del
vidrio en Safari iOS real. Ninguna bloquea el arranque.

---

## 1. Objetivo del sprint

> **Registrar plata que entra y sale en menos de 10 segundos, y ver dónde estoy
> parado.**

Al terminar el sprint, la app responde tres preguntas sin ayuda de ningún sprint
posterior:

1. ¿Cuánto tengo, y dónde?
2. ¿Cuánto llevo gastado este mes?
3. ¿En qué se me fue?

### Definición de "terminado"

- [ ] Puedo cargar mis 6 cuentas reales con su saldo inicial
- [ ] Puedo registrar un gasto en Bs desde el celular en < 10 segundos
- [ ] El saldo de la cuenta baja al registrarlo, y sube si lo borro
- [ ] Veo mi patrimonio total en USD en la pantalla principal
- [ ] Veo el total gastado del mes en curso
- [ ] Puedo editar y borrar cualquier movimiento
- [ ] Una transferencia entre dos cuentas propias **no cambia** el patrimonio total
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Cuentas** | Nombre, moneda, saldo inicial, orden, archivar. Nada más |
| **Movimientos** | Solo 3 tipos: `gasto`, `ingreso`, `transferencia` |
| **Monedas y activos** | USD, BOB, USDT, USDC y BTC. Factor **congelado** en cada transacción |
| **Tasas** | **Automáticas** desde 5 fuentes públicas, con override manual por moneda |
| **Categorías** | Lista **plana** de 14, sembradas. Renombrar y archivar |
| **Home** | Patrimonio total USD + saldo por cuenta + gasto del mes + últimos 5 |
| **Diseño** | El shell completo: layout, tab bar, tema, quick-add |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Categorías jerárquicas | Plano resuelve el día 1; agregar `parent_id` después es aditivo |
| Reglas de auto-categorización | Necesita ver qué describís realmente. Sin datos es adivinar |
| Compartidos, reembolsos, por cobrar, pasanaku | Sprints propios. Ninguno cambia el modelo de esta base |
| Presupuesto, reportes, objetivos, bolsillos | Necesitan meses de historial para valer algo |
| Valuaciones de activos (`fin_asset_valuations`) | Bitcoin se ajusta editando el saldo. Snapshots históricos son un sprint de patrimonio |
| Perfiles múltiples (`fin_profiles`) | Es una app de un solo usuario. La tabla del intento anterior nunca tuvo sentido |

**Por qué las cuentas sí entran aunque sean mínimas:** hay ~$3.209 repartidos en
6 lugares y todo el modelo mental del usuario es "cuánto tengo dónde". Sin
cuentas, cada movimiento nace sin origen y el sprint siguiente obliga a migrar
datos reales a mano. Es barato ahora, caro después.

---

## 3. Modelo de datos

4 tablas, todas con prefijo `fin_`. Migración:
`supabase/migrations/2026XXXXXXXXXX_finanzas_movimientos.sql`, aplicada con
Supabase CLI durante el desarrollo.

### 3.1 `fin_rates`

Una fila por moneda y usuario. USD no aparece: es la unidad de referencia y su
tasa es siempre 1.

```sql
create table fin_rates (
  user_id     uuid not null references auth.users(id) on delete cascade,
  currency    text not null check (currency in ('BOB','USDT','USDC','BTC')),
  rate        numeric(24,8) not null check (rate > 0),
  auto        boolean not null default true,
  quote_pair  text,          -- qué cotización sigue cuando auto = true
  updated_at  timestamptz not null default now(),
  primary key (user_id, currency)
);
```

`auto = true` → el valor sale de `fin_quotes[quote_pair]` y la columna `rate`
queda solo como respaldo por si ninguna fuente responde.
`auto = false` → manda el número que el usuario fijó, y el refrescador no lo pisa.

**El Bs es la única moneda con dos cotizaciones posibles** (`BOB_USD` oficial y
`BOB_USDT` paralelo) y por eso `quote_pair` es elegible desde Ajustes. Arranca en
la oficial. Las otras tres tienen un solo par y no hay nada que elegir.

**La dirección de la tasa no es uniforme, y es a propósito.** Se guarda el
número tal como el usuario lo piensa y lo escribe:

| Moneda | Se guarda | Significa | Conversión |
|---|---|---|---|
| BOB | `11.55` | Bs por 1 USD | `usd = monto ÷ tasa` |
| BTC | `68000` | USD por 1 BTC | `usd = monto × tasa` |
| USDT | `1.00` | USD por 1 USDT | `usd = monto × tasa` |
| USDC | `1.00` | USD por 1 USDC | `usd = monto × tasa` |

Guardar todo como "USD por unidad" sería uniforme pero ilegible: nadie dice que
el boliviano vale `0.0865` dólares, dice que el dólar está a `11.55`. El código
que interpreta la dirección vive en `CURRENCY_META` y son cuatro líneas.

### 3.1.1 `fin_quotes` — cotizaciones de mercado

```sql
create table fin_quotes (
  pair        text primary key check (pair in ('BOB_USD','BOB_USDT','USDT_USD','USDC_USD','BTC_USD')),
  rate        numeric(24,8) not null check (rate > 0),
  source      text not null,
  fetched_at  timestamptz not null default now()
);
```

**Es la única tabla sin `user_id`, y es a propósito:** el precio del BTC es el
mismo para todos. Tiene policy de `select` para cualquier usuario logueado y
**ninguna de escritura** — solo el refrescador del servidor escribe, con el
cliente admin. Ni un token robado del navegador puede tocar precios. Es la
excepción documentada a la regla de "toda tabla con `user_id` + RLS".

| Par | Fuente | Qué es |
|---|---|---|
| `BOB_USD` | `bo.dolarapi.com` | Oficial del BCB |
| `BOB_USDT` | `paralelo.bo` | Paralelo P2P (mediana de varias plataformas) |
| `USDT_USD` | `coingecko.com` | Tether en USD |
| `USDC_USD` | `coingecko.com` | USD Coin en USD |
| `BTC_USD` | `coingecko.com` | Bitcoin en USD |

Tres viajes HTTP resuelven los cinco: CoinGecko devuelve USDT, USDC y BTC en una
sola llamada. **Una fuente caída no tumba al resto**: el par afectado conserva su
última cotización buena.

### 3.2 `fin_accounts`

```sql
create table fin_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  currency              text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  initial_balance       numeric(24,8) not null default 0,
  initial_balance_date  date not null default current_date,
  sort_order            integer not null default 0,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on fin_accounts (user_id, archived, sort_order);
```

`currency` es la moneda **nativa** de la cuenta. Todos los movimientos sobre esa
cuenta van en esa moneda — no se mezcla dentro de una misma cuenta.

#### Toda cuenta tiene dos secciones: saldo usable y ahorro (Sprint 7, 26/8)

Actualizado el 2026-08-26. Una cuenta ya no es un solo número: es un saldo con
una parte **apartada como ahorro** y otra **libre para gastar**.

```
saldo(A)            lo que hay en total
savings_balance(A)  lo apartado en ahorros        ← derivado, §4.2.1
libre(A)            saldo − apartado              ← el tope de un gasto común
```

Tres cosas que conviene tener claras, porque son fáciles de asumir mal:

- **No hay ninguna columna nueva en `fin_accounts`.** Lo apartado se deriva de
  los movimientos etiquetados, igual que el saldo se deriva de todos los
  movimientos (§4.2). No hay un dato que se pueda desincronizar.
- **No hay "cuentas de ahorro".** Existió un flag `is_savings` entre el 24 y el
  26 de agosto y se **eliminó**: cualquier cuenta puede alojar ahorros, y lo que
  vuelve la plata un ahorro es la etiqueta del movimiento, no dónde cae. Ver
  §0.8 de `sprint_7_ahorro.md`.
- **Una cuenta de inversión no tiene sección de ahorro.** Su saldo es un valor
  de mercado, no plata apartable.

La regla que sostiene todo esto: **un gasto común llega hasta `libre(A)`, nunca
hasta `saldo(A)`** (§4.4.1).

### 3.2.1 `fin_savings_goals` y las columnas de ahorro

El Sprint 7 agregó una tabla propia para los planes de ahorro y **cuatro
columnas** a `fin_transactions` (§3.4). El detalle completo vive en
`sprint_7_ahorro.md` §3; acá solo lo que hay que saber para leer este
documento:

| Columna en `fin_transactions` | Qué dice |
|---|---|
| `savings_goal_id` | A qué plan pertenece. **Se pone a mano, nunca se infiere** |
| `savings_flow` | En qué dirección cruza: `aporte`, `retiro` o `traslado` |
| `savings_reason` | El justificativo de un retiro (enum) |
| `savings_period` | A qué **mes** pertenece un aporte — no alcanza la fecha, porque el reparto de julio se registra en agosto |

### 3.3 `fin_categories`

```sql
create table fin_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('gasto','ingreso')),
  emoji       text,
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on fin_categories (user_id, kind, archived, sort_order);
```

**Plana a propósito.** Sin `parent_id`. Agregarlo en un sprint futuro es una
columna nullable, no una migración de datos.

### 3.4 `fin_transactions`

```sql
create table fin_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('gasto','ingreso','transferencia')),
  date           date not null,
  account_id     uuid not null references fin_accounts(id) on delete restrict,
  to_account_id  uuid references fin_accounts(id) on delete restrict,
  category_id    uuid references fin_categories(id) on delete set null,
  amount         numeric(24,8) not null check (amount > 0),
  currency       text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  to_amount      numeric(24,8) check (to_amount is null or to_amount > 0),
  exchange_rate  numeric(24,8) not null,
  amount_usd     numeric(14,2) not null,
  description    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Agregadas después del Sprint 1 (ver el sprint de cada una):
  --   flow_type                          Sprint 2 · consumo vs movimiento
  --   to_amount_usd, to_exchange_rate    Sprint 2 · congela el lado que llega
  --   recurring_id                       Sprint 3 · qué fijo la generó
  --   pasanaku_id                        Sprint 5 · qué pasanaku la generó
  --   savings_goal_id, savings_flow,
  --   savings_reason, savings_period     Sprint 7 · § 3.2.1

  constraint fin_tx_transfer_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and category_id is null
      and (
        to_account_id <> account_id
        -- La ÚNICA excepción (Sprint 7): un aporte a la misma cuenta, que es
        -- cómo se guarda plata sin moverla de banco — el saldo no cambia (sale
        -- y entra el mismo monto) y lo apartado sube. `is not distinct from`
        -- y no `=`: con `savings_flow` en NULL, `=` da NULL, y un CHECK que da
        -- NULL **no se viola** — el agujero dejaba pasar cualquier
        -- transferencia de una cuenta a sí misma (ver `decisiones_tecnicas.md`).
        or (savings_flow is not distinct from 'aporte' and to_amount is null)
      ))
    or
    (type in ('gasto','ingreso') and to_account_id is null and to_amount is null)
  )
);
create index on fin_transactions (user_id, date desc);
create index on fin_transactions (account_id);
create index on fin_transactions (to_account_id);
```

**Notas de diseño:**

- `amount` es **siempre positivo**. El signo lo determina el `type`. Nunca
  guardar negativos: hace que todo cálculo posterior dependa de recordar la
  convención.
- `currency` siempre iguala la moneda de `account_id`. Se valida en el server.
- El tope de saldo se mide sobre `amount`, en la moneda de **origen**: lo que
llega no se topea porque no es una decisión del usuario, es lo que la plataforma
depositó.

`to_amount` solo se usa en transferencias **entre monedas distintas** (ej.
  sacar $50 de Airtm y recibir 348 Bs en efectivo). Si las dos cuentas comparten
  moneda, va `null` y el destino recibe `amount`. Guardar el monto recibido real
  en vez de derivarlo evita mentir sobre el tipo de cambio efectivo de esa
  operación.
- **Precisión de 8 decimales** en `amount`, `to_amount` e `initial_balance`:
  `0.00042195 BTC` no entra en dos decimales. `amount_usd` sigue en 2 — el dólar
  no tiene más.
- `exchange_rate` y `amount_usd` se **congelan** al escribir. Nunca se
  recalculan. Un gasto de hace tres meses no puede cambiar de valor porque hoy
  cambió la tasa.
- El `exchange_rate` congelado es **siempre "USD por 1 unidad"**, sin importar
  cómo se guarde la tasa editable en `fin_rates`. Así `amount_usd = amount ×
  exchange_rate` vale para las cinco monedas sin ramificar, y auditar una fila
  vieja es una multiplicación.

### 3.5 RLS

Las 4 tablas: `alter table X enable row level security;` y las **4 policies**
(select, insert, update, delete) por tabla, todas con `user_id = auth.uid()`.

Sin excepciones y sin `createAdminClient()` en las rutas de datos: no hay ningún
acceso cruzado entre usuarios que lo justifique. Es una regla de seguridad del
Hub, no un patrón copiado de otra mini-app — toda tabla nueva nace con RLS
activo y sus 4 policies de escritura reales.

### 3.6 Registro en el Hub

El reset borró la fila de `projects`. Hay que reinsertarla en la misma migración:

```sql
insert into projects (name, slug, description)
values ('Finanzas', 'finanzas', 'Finanzas personales')
on conflict (slug) do nothing;
```

El Hub muestra **todos** los proyectos al admin sin necesidad de
`project_access` (ver `app/page.tsx:28-40`), así que con esto ya aparece en la
grilla.

---

## 4. Reglas de negocio

### 4.1 Conversión a USD (al escribir)

```
factor = usdPerUnit(moneda, tasas)      // resuelve la dirección
amount_usd = round(amount × factor, 2)
exchange_rate = factor                  // se congela
```

`usdPerUnit` invierte la tasa del Bs (`1 / 11.55`) y usa directo la del BTC y
las stablecoins. Se guarda siempre, incluso en transacciones USD (donde vale 1),
para poder auditar.

### 4.1.1 Cuándo se refrescan las tasas

**Vercel Hobby permite un solo cron por día** — más frecuente hace fallar el
deploy entero, y ya rompió producción dos veces. Así que el cron no puede ser lo
que mantiene las tasas frescas.

El refresco real lo dispara **usar la app**: `GET /accounts` y `GET /rates`
miran la antigüedad de las cotizaciones y, si superan el TTL de **30 minutos**,
las traen antes de responder. Refrescar es idempotente, así que dos requests en
paralelo no duplican trabajo.

Las tres capas:

| Disparador | Cuándo | Para qué |
|---|---|---|
| Abrir la app | Si pasaron más de 30 min | Es el que importa: las tasas están frescas justo cuando las mirás |
| Botón "Actualizar" en Ajustes | A pedido | Cuando querés el precio de este segundo |
| Cron diario (`0 11 * * *`) | Una vez por día | Piso, para que no se pudran si no entrás en una semana |

Cada fuente tiene **timeout de 4 s** y falla en silencio: si el mercado no
responde, se sigue con la última cotización buena. Es preferible una tasa de
ayer a no poder registrar un gasto.

### 4.2 Saldo de una cuenta — **derivado, nunca guardado**

No existe columna `balance`. Se calcula:

```
saldo(A) =   initial_balance
           − Σ amount            donde type='gasto'         y account_id    = A
           + Σ amount            donde type='ingreso'       y account_id    = A
           − Σ amount            donde type='transferencia' y account_id    = A
           + Σ (to_amount ?? amount) donde type='transferencia' y to_account_id = A
```

El saldo es siempre una consecuencia de los movimientos, nunca un dato propio.
Editar o borrar un movimiento recalcula el saldo solo, sin lógica de
compensación ni riesgo de que el número guardado se desincronice de su
historial. `lib/finanzas/accounts.ts` implementa esta fórmula desde cero.

### 4.2.1 Lo apartado en ahorros — **derivado también** (Sprint 7, 26/8)

Mismo principio, un nivel más adentro: cuánto del saldo de una cuenta está
apartado sale de los movimientos **etiquetados con un plan de ahorro**, y
tampoco existe como columna.

```
apartado(A) = + Σ amount              donde type='ingreso'  y savings_flow='aporte'   y account_id = A
              − Σ amount              donde type='gasto'    y savings_flow='retiro'   y account_id = A
              + Σ (to_amount ?? amount) donde type='transferencia' y savings_flow='aporte'   y to_account_id = A
              − Σ amount              donde type='transferencia' y savings_flow='retiro'   y account_id = A
              ± ambos lados           donde type='transferencia' y savings_flow='traslado'
```

clampeado en cero: una cuenta no puede tener ahorro negativo.

Un aporte y un retiro mueven **un solo lado** de la transferencia — la otra
cuenta no gana ni pierde plata *apartada* por el paso de la plata. El
**traslado** es la excepción y para eso existe: mueve los dos lados a la vez,
que es cómo se cambia un ahorro de cuenta sin que el plan suba ni baje.

Se calcula **en la moneda de la cuenta, sin pasar por USD** (`amount` ya está
en la moneda de `account_id` y `to_amount` en la de `to_account_id`). Convertir
a USD y volver arrastraba centavos: aportar Bs 700 mostraba *"Bs 699,99
apartados"*, un número que el usuario sabe que está mal, y encima corría el
tope. Ver `computeSavingsByAccount` en `lib/finanzas/savings.ts`.

**Invariante:** el saldo de un plan de ahorro es exactamente la suma de lo
apartado en cada cuenta. Hay una regresión que lo prueba en `api.mjs`.

### 4.3 Patrimonio total

```
patrimonio_usd = Σ  ( saldo(A) convertido a USD con la tasa ACTUAL )
```

⚠️ **Distinción importante:** las transacciones congelan su tasa (es historia),
pero el patrimonio usa la tasa de **hoy** (es una foto del presente). Son dos
usos legítimamente distintos del mismo número.

### 4.4 Gasto del mes

```
gasto_mes_usd = Σ amount_usd  donde type='gasto' y date dentro del mes en curso
```

Solo `gasto`. Transferencias no cuentan — es la primera aplicación concreta de
la regla "gasto real vs movimiento financiero" del documento de contexto.

### 4.4.1 Tope de saldo

```
disponible(A) = saldo(A)                       (alta)
disponible(A) = saldo(A) − efecto_actual(tx)   (edición sobre la misma cuenta)

efecto_actual = +amount  si el tipo es ingreso
                −amount  si es gasto o transferencia
```

Solo aplica a `gasto` y `transferencia`; un `ingreso` nunca se topea. Ver
`availableFrom()` y `consumesBalance()` en `lib/finanzas/transactions.ts`.

⚠️ **Consecuencia práctica:** la regla es tan buena como los saldos iniciales.
Con una cuenta cargada en `0.63 Bs` no se va a poder registrar ningún gasto real
hasta corregir ese saldo.

#### El piso de ahorro (Sprint 7, 26/8)

El tope ya no es el saldo: es el saldo **menos lo apartado**.

```
movimiento común              tope = saldo − apartado
retiro o traslado declarado   tope = apartado         (acotado por el saldo real)
```

Vive en `assertBalance` (`lib/finanzas/load.ts`) y no en cada `route.ts`,
porque **cinco caminos** distintos sacan plata de una cuenta y los cinco tienen
que aplicar el mismo criterio:

1. crear un movimiento (`POST /transactions`)
2. editarlo (`PATCH /transactions/[id]`)
3. registrar un fijo (`POST /recurring/[id]/register`)
4. aportar a un pasanaku (`POST /pasanaku/[id]/aporte`)
5. mover un ahorro de cuenta (`POST /savings-goals/[id]/move`)

Antes lo aplicaba solo el quick-add, así que registrar un fijo o aportar a un
pasanaku se comía los ahorros sin decir una palabra.

El **sexto** camino, `POST /savings-goals/[id]/save` (el botón "Ahorrar"),
aplica el mismo tope por otra vía: mide contra `available_funds`, que es
`saldo − apartado` calculado en `loadSavingsGoals` porque el sheet necesita ese
desglose por cuenta de todas formas. Mismo número, un viaje a la base en vez de
dos.

Consecuencias que valen la pena decir en voz alta:

- **Un fijo que no entra sin romper un ahorro, no entra.** Para pagarlo hay que
  retirar del ahorro primero, a mano y con su motivo. Es incómodo a propósito.
- **No se puede retirar de una cuenta donde ese plan no tiene nada apartado.**
  No se saca lo que no se puso.
- **Una cuota de deuda cobrada no se ve afectada**: es un `ingreso`, plata que
  entra, y `consumesBalance` ya la deja afuera.
- `<RegisterSheet>` y `<PasanakuAporteSheet>` muestran el mismo `disponible`
  que aplica el servidor, con *"· X en ahorros"* al lado.

### 4.5 Borrado de cuentas

- Sin movimientos → se puede borrar (`DELETE`).
- Con movimientos → **no se borra**, se archiva (`archived = true`). El
  `on delete restrict` de la FK lo garantiza a nivel de base de datos aunque
  falle la validación del server.

---

## 5. Estructura de archivos

```
app/finanzas/
├── layout.tsx                    — gate admin-only + #fz-root + monta el shell
├── theme.css                     — tokens propios (NO toca globals.css)
├── page.tsx                      — Home
├── movimientos/page.tsx          — lista + filtros + editar/borrar
├── cuentas/page.tsx              — CRUD de cuentas
├── ajustes/page.tsx              — tasa USD/BOB + categorías
└── components/
    ├── shell.tsx                 — arma sidebar + contenido + tab bar + quick-add
    ├── data-context.tsx          — estado compartido (cuentas, categorías, tasa, ocultar)
    ├── nav-items.tsx             — los 4 destinos, compartidos por tab bar y sidebar
    ├── tab-bar.tsx               — liquid glass (documentos/design/liquid-glass-menu.md)
    ├── sidebar.tsx               — navegación del modo dashboard + tarjeta de tasa
    ├── quick-add.tsx             — sheet/modal de registro rápido
    ├── quick-add-context.tsx     — abre el sheet desde cualquier pantalla
    ├── tx-row.tsx                — fila de movimiento + encabezado de página
    ├── amount.tsx                — formateo de montos + toggle de ocultar
    └── ui.tsx                    — primitivas compartidas de la mini-app

app/api/finanzas/
├── accounts/route.ts             — GET lista con saldos · POST crear
├── accounts/[id]/route.ts        — PATCH · DELETE
├── accounts/reorder/route.ts     — PATCH lista ordenada de ids
├── transactions/route.ts         — GET lista con filtros · POST crear
├── transactions/[id]/route.ts    — PATCH · DELETE
├── categories/route.ts           — GET · POST
├── categories/[id]/route.ts      — PATCH · DELETE
├── rates/route.ts                — GET (refresca si venció) · PATCH (auto/manual, par)
├── rates/refresh/route.ts        — POST · GET, protegido por CRON_SECRET o sesión
└── seed/route.ts                 — POST idempotente: tasas + 14 categorías

lib/finanzas/
├── types.ts                      — tipos compartidos + las 14 categorías semilla
├── money.ts                      — formatUSD, formatBOB, toUsd, fromUsd, round2
├── accounts.ts                   — computeBalances, withBalances, totalUsd
├── transactions.ts               — validación, congelado de tasa, agrupado por día
├── rates.ts                      — resuelve la tasa efectiva de cada moneda
└── quotes.ts                     — las 5 fuentes de mercado, TTL y refresco

supabase/migrations/
└── 20260818000000_finanzas_movimientos.sql
```

**Cinco archivos que no estaban en el plan original y por qué:**

| Archivo | Razón |
|---|---|
| `components/shell.tsx` | El layout es un server component (necesita el gate); el shell tiene que ser cliente para montar los providers. Separarlos evita marcar el layout entero como `'use client'` |
| `components/data-context.tsx` | Cuentas, categorías y tasa las necesitan las 4 pantallas y el quick-add. Sin estado compartido, guardar un gasto obligaría a recargar la página — y entonces no se siente app |
| `components/nav-items.tsx` | Los 4 destinos los consumen la tab bar y la sidebar. Definirlos dos veces garantiza que se desincronicen |
| `components/tx-row.tsx` | La fila de movimiento aparece en Home y en Movimientos con el mismo formato |
| `lib/finanzas/rates.ts` | Toda ruta que escribe un movimiento necesita las tasas vigentes, y las filas pueden no existir todavía |

### 5.1 Regla de independencia — no negociable

**Finanzas no reutiliza nada de otra mini-app.** Ni componentes, ni utilidades,
ni lógica de negocio, ni CSS, ni tipos, ni "el patrón de X". Cada mini-app del
Hub es autónoma; el parecido entre dos de ellas es coincidencia, no herencia.

Si Finanzas necesita formatear un monto, derivar un saldo, dibujar una gráfica o
armar un drawer, **se escribe desde cero dentro de `lib/finanzas/` o
`app/finanzas/components/`** — aunque exista algo parecido en otra carpeta.
Copiar acopla las dos apps: el día que la otra cambie, Finanzas se rompe sin que
nadie lo haya tocado.

**Lo único compartido son las primitivas del Hub**, que no pertenecen a ninguna
mini-app:

| Recurso | Uso permitido |
|---|---|
| `lib/supabase-server.ts` | `requireUser()`, `createClient()` — la sesión es del Hub |
| `lib/supabase.ts` | Cliente de navegador |
| `profiles`, `projects`, `project_access` | Identidad y gate de acceso |
| `lib/project-assets.tsx` | Agregar la entrada `finanzas` a `PROJECT_ASSETS` (ícono + banner SVG propios). El reset la borró |

**Único archivo del Hub que este sprint modifica:** `lib/project-assets.tsx`.
Todo lo demás vive en `app/finanzas/`, `app/api/finanzas/`, `lib/finanzas/`,
`documentos/finanzas/` y la migración.

`app/layout.tsx` y `app/globals.css` no se tocan: el tema de Finanzas vive en
`app/finanzas/theme.css` y se aplica sobre el div wrapper de su propio layout.

---

## 6. Contratos de API

Todas las rutas: `requireUser()` de `lib/supabase-server.ts`, `401` si no hay
usuario, y el cliente devuelto (que respeta RLS) para las queries. **Nunca**
`createAdminClient()` — no hay ningún acceso cruzado que lo justifique.

### `GET /api/finanzas/accounts`
```jsonc
{
  "accounts": [{
    "id": "uuid", "name": "Airtm", "currency": "USD",
    "initial_balance": 1299.00, "initial_balance_date": "2026-08-01",
    "sort_order": 0, "archived": false,
    "balance": 1299.00,        // derivado (§4.2)
    "balance_usd": 1299.00,    // convertido a tasa actual
    // Sprint 7 · lo apartado en ahorros dentro de esta cuenta (§4.2.1).
    // Derivado también, y en la moneda de la cuenta — no pasa por USD.
    "savings_balance": 200.00,
    "savings_balance_usd": 200.00,
    // Sprint 1 §7.2 · si ya tiene un "Actualizar valor" registrado
    "has_value_updates": false,
    "is_investment": false
  }],
  "total_usd": 3209.00,
  "usd_bob_rate": 6.96
}
```

### `POST /api/finanzas/accounts`
Body: `{ name, currency, initial_balance?, initial_balance_date?, sort_order? }`

### `PATCH /api/finanzas/accounts/[id]`
Body: cualquier subconjunto de `{ name, currency, initial_balance, initial_balance_date, sort_order, archived }`.
Rechaza cambiar `currency` si la cuenta ya tiene movimientos (`409`).

### `DELETE /api/finanzas/accounts/[id]`
`409` con mensaje claro si tiene movimientos → sugerir archivar.

### `GET /api/finanzas/transactions`
Query params: `from`, `to` (fechas ISO), `type`, `account_id`, `category_id`, `limit`, `offset`.
```jsonc
{
  "transactions": [{
    "id": "uuid", "type": "gasto", "date": "2026-08-17",
    "account_id": "uuid", "to_account_id": null, "category_id": "uuid",
    "amount": 35.00, "currency": "BOB", "to_amount": null,
    "exchange_rate": 6.96, "amount_usd": 5.03,
    "description": "Almuerzo",
    // Sprint 2 · consumo real vs movimiento financiero
    "flow_type": "consumo",
    // Sprint 7 · la etiqueta de ahorro viaja completa, o los cuatro en null
    "savings_goal_id": null, "savings_flow": null,
    "savings_reason": null, "savings_period": null
  }],
  "total_gasto_usd": 142.30,   // del rango consultado
  "total_ingreso_usd": 900.00
}
```

#### Ahorro en `POST /transactions` (Sprint 7, Ronda 8)

Por esta ruta un ahorro **solo puede salir**. `savings_goal_id` se acepta
únicamente en un `gasto`, y entonces la dirección es siempre `retiro` y el
`savings_reason` es obligatorio.

- Un `ingreso` tageado → `400`: la plata entra a un ahorro con un **fijo de
  ahorro** o en el **reparto de fin de mes**, que son decisiones de plan.
- Una `transferencia` tageada → `400`: una transferencia común solo mueve saldo
  disponible; para mover un ahorro de cuenta está *"Mover de cuenta"* en
  Ahorros.
- El `PATCH` tampoco es la puerta de atrás: convertir un retiro en ingreso
  manteniendo la etiqueta se rechaza. Editar una transferencia tageada que **ya
  era así** (la del fijo, la del reparto, un traslado) sigue permitido — una
  regla nueva no congela la historia que la precede.

### `POST /api/finanzas/transactions`
Body: `{ type, date, account_id, to_account_id?, category_id?, amount, to_amount?, description? }`

El server:
1. Lee `currency` de `account_id` — **no confía en el cliente**.
2. Lee `usd_bob_rate` de `fin_settings`.
3. Calcula `amount_usd` y congela `exchange_rate`.
4. Valida la forma según el `type` (la misma regla del check constraint).

### `PATCH` / `DELETE /api/finanzas/transactions/[id]`
`PATCH` **recongela** `exchange_rate` y `amount_usd` solo si cambian `amount`,
`account_id` o la tasa fue editada explícitamente en el formulario. Si solo
cambia la descripción o la categoría, la tasa original se respeta.

### `GET` / `PATCH /api/finanzas/rates`
```jsonc
{
  "rates": { "BOB": 11.55, "USDT": 0.9994, "USDC": 0.9997, "BTC": 64662 },
  "list": [{
    "currency": "BOB", "rate": 11.55, "auto": true,
    "quote_pair": "BOB_USD", "source": "bo.dolarapi.com",
    "updated_at": "2026-08-18T17:52:25Z"
  }],
  "quotes": { "BOB_USD": { "rate": 11.55, "source": "bo.dolarapi.com", "fetched_at": "…" } }
}
```
`PATCH` toma `{ currency }` más `rate`, `auto` o `quote_pair`. Mandar un `rate`
**pasa la moneda a manual sola** — si no, el próximo refresco lo pisaría sin que
se entienda por qué. `USD` se rechaza con `400`: es la referencia, no tiene tasa.

### `POST` / `GET /api/finanzas/rates/refresh`
Trae las 5 cotizaciones y las guarda. Entra el cron con
`Authorization: Bearer $CRON_SECRET`, o el usuario logueado desde el botón de
Ajustes. `502` si **ninguna** fuente respondió (las anteriores se conservan).

### `POST /api/finanzas/seed`
Idempotente. Crea la fila de `fin_settings` y las 14 categorías si no existen.
Se dispara desde un botón en Ajustes, no desde una migración (una migración no
puede conocer el `auth.uid()` de forma limpia).

**Categorías semilla:**

- **Gasto (10):** 🍽️ Comida · 🚕 Transporte · 🏠 Vivienda · 💡 Servicios ·
  📱 Suscripciones · 🏥 Salud · 🧴 Personal · 🎬 Ocio · 📚 Educación · 📦 Otros
- **Ingreso (4):** 💼 Sueldo · 💻 Freelance · 🎁 Extraordinario · 📥 Otros

---

## 7. UI

### Gate de acceso — `app/finanzas/layout.tsx`

Mini-app **personal**: no hay chequeo de `project_access` porque no hay nada que
compartir. El gate completo es:

```
usuario no logueado        → redirect('/login')
profile.role !== 'admin'   → redirect('/')
```

### Navegación

Tab bar flotante liquid glass (vidrio verde oscuro, ver §6 del documento de
UI), 4 pestañas + botón de acción central:

```
  Inicio    Movimientos    (+)    Cuentas    Ajustes
```

El `(+)` abre el quick-add desde cualquier pantalla.

### Pantallas

**`/finanzas` — Home**
1. Patrimonio total en USD, grande. Toggle para ocultar montos (👁️).
2. Gasto del mes en curso, con el nombre del mes.
3. Lista de cuentas con su saldo en moneda nativa + equivalente USD.
4. Últimos 5 movimientos.
5. Si no hay cuentas: estado vacío que lleva a crear la primera.

**`/finanzas/movimientos`**
- Lista agrupada por día, con total diario.
- Filtros: mes (default: el actual), tipo, cuenta, categoría.
- Totales del rango filtrado arriba: gastado / ingresado.
- Tap en un movimiento → editar o borrar.

**`/finanzas/cuentas`**
- Lista con saldo, reordenable con flechas ↑↓. Se manda la lista completa a
  `/accounts/reorder`, que reasigna `sort_order` 0..n: las cuentas nacen todas
  en 0, así que intercambiar de a pares no alcanzaría para desempatarlas.
  Flechas y no arrastrar — el drag táctil sin librería es frágil y estos botones
  funcionan con teclado y lector de pantalla.
- Crear / editar / archivar. Ver archivadas en un plegable.

**`/finanzas/ajustes`**
- Tasa USD/BOB: un input, con la fecha de última edición visible.
- Categorías: lista por tipo, renombrar / cambiar emoji / archivar / crear.
  El emoji se edita en el lugar: el chip de color **es** el input.
- Botón "Sembrar categorías iniciales" (solo visible si no hay ninguna).

### Quick-add

El componente más importante del sprint. **Meta: < 10 segundos.**

- Se abre por defecto en **Gasto** (el 90% de los usos).
- Selector de tipo: Gasto / Ingreso / Transferencia.
- Teclado numérico enfocado al abrir, con la moneda de la cuenta seleccionada.
- Cuenta: recuerda la última usada.
- Fecha: hoy por defecto, un tap para cambiarla.
- Categoría: chips horizontales, no un `<select>`.
- Descripción: opcional, al final.
- En transferencia: aparece la cuenta destino, y el campo "monto recibido" solo
  si las monedas difieren.

  **Entre monedas distintas** el monto recibido se **sugiere solo** con las
  tasas de hoy (`origen → USD → destino`) y se recalcula mientras escribís el
  monto que sale. En cuanto lo editás a mano, la sugerencia deja de pisarlo — y
  aparece un enlace para volver a ella. En modo edición arranca intocable: el
  valor guardado es el real, no una estimación.

  Debajo se muestra la **diferencia contra la tasa de referencia**, que en la
  práctica es la comisión que te cobró la plataforma:
  `Comisión ≈ $1.25`. Si la conversión te salió mejor que la referencia, dice
  `A favor`.

  Lo que se guarda es siempre **lo que realmente llegó**, nunca la sugerencia.
  Por eso el patrimonio baja exactamente la comisión en vez de fingir que la
  transferencia fue neutra.
- **Gasto y transferencia no pueden superar el saldo de la cuenta de origen.**
  Debajo del monto se muestra `Disponible <saldo>` con un botón **MAX** que lo
  completa. Si el monto se pasa, el número se pinta en rojo y el botón de
  guardar queda bloqueado con el motivo.

  En modo edición el disponible **revierte el efecto del propio movimiento**:
  si estás editando un gasto de 35 y el saldo quedó en 0, el máximo al que
  podés subirlo es 35, no 0. Sin esa corrección, editar un movimiento hacia
  arriba sería imposible.

  **El tope vive en el cliente, no en el servidor**, a propósito. Es una app de
  un solo usuario, así que la UI es la puerta real; y dejar la API permisiva
  garantiza que siempre haya forma de corregir un dato mal cargado. Un tope
  duro en el servidor podría dejar al usuario sin manera de arreglar su propia
  historia.

---

## 8. Verificación

**303 pruebas automatizadas, todas en verde** (2026-08-18). Viven en
`tests/finanzas/` y se corren con:

```bash
node tests/finanzas/run.mjs          # las tres suites
node tests/finanzas/run.mjs unit     # solo una
```

`unit` y `db` no necesitan nada levantado. `api` necesita el dev server
(`localhost:3001` por defecto, o `FZ_BASE_URL`).

**Las suites `db` y `api` crean un usuario temporal propio, trabajan ahí y lo
borran al terminar.** Nunca tocan datos reales — eso además hace que el
aislamiento de RLS entre usuarios quede probado de verdad.

Antes de empezar, ambas **barren usuarios `@acerotest.local` huérfanos**: la
limpieza del final no corre si el proceso muere por timeout o Ctrl-C, y sin el
barrido cada corrida interrumpida deja cuentas y movimientos de prueba colgados
en la base real. Ya pasó una vez.

| Suite | Qué cubre | Pruebas |
|---|---|---|
| `unit.mjs` | Parseo, conversión de las 5 monedas, saldos, congelado, validación, tope de saldo, cross-currency y comisiones, fechas, formato, fuentes | 168 |
| `db.mjs` | RLS, check constraints, índice único, `on delete restrict`, `on delete set null`, precisión de 8 decimales, saldos reales | 35 |
| `api.mjs` | Las 10 rutas HTTP con sesión real: auth, validación, 400/401/409, idempotencia, recongelado, activos, tasas automáticas, reorden, emoji | 100 |

### Checklist original del sprint

| # | Prueba | Estado |
|---|---|---|
| 1 | `npm run build` sin errores | ✅ |
| 2 | `/finanzas` con usuario no-admin redirige | ⏳ manual |
| 3 | Sembrar categorías dos veces no duplica | ✅ `api` |
| 4 | 6 cuentas → patrimonio ≈ $3.209 | ✅ `unit` |
| 5 | 35 Bs a 6.96 → `amount_usd = 5.03` | ✅ `unit` `db` `api` |
| 6 | Cambiar la tasa no altera lo ya guardado | ✅ `db` `api` |
| 7 | Nuevo gasto de 35 Bs a 7.50 → $4.67 | ✅ `unit` `api` |
| 8 | Transferencia USD→USD no mueve el patrimonio | ✅ `unit` `api` |
| 9 | Transferencia USD→BOB con monto recibido real | ✅ `unit` `db` `api` |
| 10 | Borrar un movimiento devuelve el saldo | ✅ `db` `api` |
| 11 | Editar el monto no acumula | ✅ `unit` `api` |
| 12 | Borrar cuenta con movimientos → 409 | ✅ `db` `api` |
| 13 | Registrar un gasto en móvil en < 10 s | ⏳ manual |
| 14 | `/finanzas` aparece en la grilla del Hub | ⏳ manual |

Los tres pendientes necesitan un navegador con sesión real; no hay forma
honesta de automatizarlos en este sprint.

### Bug corregido durante el testing

**El separador decimal.** Los campos de monto descartaban la coma, así que
tipear `5,03` — lo natural en teclado boliviano, y lo que ofrece el teclado
decimal de iOS en locale es-BO — producía `503`. Un error de **100×** que no
avisaba: la app guardaba el monto equivocado sin ningún síntoma.

Se resolvió con `parseDecimalInput()` en `lib/finanzas/money.ts`, que acepta
coma y punto y normaliza a punto. La usan los cuatro campos de monto de la app
(monto, monto recibido, saldo inicial y tasa). Cubierto por 19 pruebas en
`unit.mjs`.

---

## 9. Qué desbloquea este sprint

Todos los sprints siguientes se apoyan en `fin_transactions` sin modificar su
forma — solo le agregan columnas nullable o tablas satélite:

| Sprint siguiente | Cómo se apoya |
|---|---|
| Compartidos y reembolsos | Columna `is_shared` + tabla `fin_people` + `fin_reimbursements` |
| Dinero por cobrar | Tabla `fin_receivables` + tipo de transacción `pago_deuda` |
| Pasanaku | Construido en Sprint 5 (2026-08-21) como tracker personal — sin tipos de transacción nuevos: `gasto`/`ingreso` con `flow_type: 'movimiento'` y una tabla `fin_pasanaku` chica. Ver `sprint_5_pasanaku.md` |
| Presupuesto | Tabla `fin_budgets` por categoría/mes. Lee de `fin_transactions` |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby solo permite **1 cron al
día**. `vercel.json` ya tiene el único permitido (`0 11 * * *`, refresco de
cotizaciones). Agregar un segundo cron hace fallar el deploy entero.

Cuando se extienda el enum de `type`, hay que agregar también la columna
`flow_type` (`consumo` | `movimiento`) descrita en el documento de contexto —
ese es el mecanismo que mantiene honesto el cálculo de "gasto real".
