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
| **Monedas** | USD y BOB. Tasa **congelada** en cada transacción |
| **Tasa de cambio** | Un número, editable a mano en Ajustes |
| **Categorías** | Lista **plana** de 14, sembradas. Renombrar y archivar |
| **Home** | Patrimonio total USD + saldo por cuenta + gasto del mes + últimos 5 |
| **Diseño** | El shell completo: layout, tab bar, tema, quick-add |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Tipo de cambio automático (3 APIs + cron) | Un campo editable resuelve el 100% del problema hoy. Se automatiza cuando escribirlo canse |
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

### 3.1 `fin_settings`

Una fila por usuario. Guarda la tasa manual.

```sql
create table fin_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  usd_bob_rate  numeric(12,4) not null default 6.96,  -- Bs por 1 USD
  updated_at    timestamptz not null default now()
);
```

### 3.2 `fin_accounts`

```sql
create table fin_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  currency              text not null check (currency in ('USD','BOB')),
  initial_balance       numeric(14,2) not null default 0,
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
  amount         numeric(14,2) not null check (amount > 0),
  currency       text not null check (currency in ('USD','BOB')),
  to_amount      numeric(14,2) check (to_amount is null or to_amount > 0),
  exchange_rate  numeric(12,4) not null,
  amount_usd     numeric(14,2) not null,
  description    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint fin_tx_transfer_shape check (
    (type = 'transferencia' and to_account_id is not null and to_account_id <> account_id and category_id is null)
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
- `to_amount` solo se usa en transferencias **entre monedas distintas** (ej.
  sacar $50 de Airtm y recibir 348 Bs en efectivo). Si las dos cuentas comparten
  moneda, va `null` y el destino recibe `amount`. Guardar el monto recibido real
  en vez de derivarlo evita mentir sobre el tipo de cambio efectivo de esa
  operación.
- `exchange_rate` y `amount_usd` se **congelan** al escribir. Nunca se
  recalculan. Un gasto de hace tres meses no puede cambiar de valor porque hoy
  cambió la tasa.

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
si currency = 'USD':  amount_usd = amount
si currency = 'BOB':  amount_usd = round(amount / exchange_rate, 2)
```

`exchange_rate` = `fin_settings.usd_bob_rate` vigente al momento de guardar. Se
guarda siempre, incluso en transacciones USD, para auditoría.

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
├── transactions/route.ts         — GET lista con filtros · POST crear
├── transactions/[id]/route.ts    — PATCH · DELETE
├── categories/route.ts           — GET · POST
├── categories/[id]/route.ts      — PATCH · DELETE
├── settings/route.ts             — GET · PATCH (tasa)
└── seed/route.ts                 — POST idempotente: settings + 14 categorías

lib/finanzas/
├── types.ts                      — tipos compartidos + las 14 categorías semilla
├── money.ts                      — formatUSD, formatBOB, toUsd, fromUsd, round2
├── accounts.ts                   — computeBalances, withBalances, totalUsd
├── transactions.ts               — validación, congelado de tasa, agrupado por día
└── settings.ts                   — lee la tasa del usuario, creando la fila la 1ª vez

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
| `lib/finanzas/settings.ts` | Toda ruta que escribe un movimiento necesita la tasa vigente, y la fila puede no existir todavía |

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
    "balance": 1299.00,       // derivado
    "balance_usd": 1299.00    // convertido a tasa actual
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
    "description": "Almuerzo"
  }],
  "total_gasto_usd": 142.30,   // del rango consultado
  "total_ingreso_usd": 900.00
}
```

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

### `GET` / `PATCH /api/finanzas/settings`
```jsonc
{ "usd_bob_rate": 6.96, "updated_at": "2026-08-17T10:00:00Z" }
```

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
- Lista ordenable con saldo.
- Crear / editar / archivar. Ver archivadas en un plegable.

**`/finanzas/ajustes`**
- Tasa USD/BOB: un input, con la fecha de última edición visible.
- Categorías: lista por tipo, renombrar / cambiar emoji / archivar / crear.
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

---

## 8. Verificación

Antes de dar el sprint por cerrado:

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | `npm run build` | Sin errores ni warnings de tipos |
| 2 | Entrar a `/finanzas` con un usuario no-admin | Redirige a `/` |
| 3 | Sembrar categorías dos veces | La segunda no duplica nada |
| 4 | Crear las 6 cuentas reales | Patrimonio total ≈ $3.209 |
| 5 | Gasto de 35 Bs en Efectivo (tasa 6.96) | `amount_usd = 5.03`, saldo baja 35 Bs |
| 6 | Cambiar la tasa a 7.50 en Ajustes | El gasto del paso 5 **sigue** en $5.03 |
| 7 | Nuevo gasto de 35 Bs con tasa 7.50 | `amount_usd = 4.67` |
| 8 | Transferir $100 de Airtm a Broker | Patrimonio total **no cambia** |
| 9 | Transferir $50 de Airtm a Efectivo (BOB), recibiendo 348 Bs | Airtm −$50, Efectivo +348 Bs |
| 10 | Borrar el gasto del paso 5 | El saldo de Efectivo vuelve al valor previo |
| 11 | Editar el monto de un movimiento | El saldo refleja el nuevo monto, no la suma de ambos |
| 12 | Intentar borrar una cuenta con movimientos | `409` con mensaje que sugiere archivar |
| 13 | Registrar un gasto en móvil, cronometrado | < 10 segundos desde tocar `(+)` |
| 14 | `/finanzas` aparece en la grilla del Hub | Con ícono y banner propios |

---

## 9. Qué desbloquea este sprint

Todos los sprints siguientes se apoyan en `fin_transactions` sin modificar su
forma — solo le agregan columnas nullable o tablas satélite:

| Sprint siguiente | Cómo se apoya |
|---|---|
| Compartidos y reembolsos | Columna `is_shared` + tabla `fin_people` + `fin_reimbursements` |
| Dinero por cobrar | Tabla `fin_receivables` + tipo de transacción `pago_deuda` |
| Pasanaku | Tablas `fin_pasanaku*` + tipos `aporte_pasanaku` / `recepcion_pasanaku` |
| Presupuesto | Tabla `fin_budgets` por categoría/mes. Lee de `fin_transactions` |
| Tipo de cambio automático | Reemplaza `fin_settings.usd_bob_rate` por `fin_exchange_rates` + cron |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby solo permite **1 cron al
día**. Cuando llegue el sprint de tipo de cambio automático, el cron debe ser
diario — más frecuente hace fallar el deploy entero.

Cuando se extienda el enum de `type`, hay que agregar también la columna
`flow_type` (`consumo` | `movimiento`) descrita en el documento de contexto —
ese es el mecanismo que mantiene honesto el cálculo de "gasto real".
