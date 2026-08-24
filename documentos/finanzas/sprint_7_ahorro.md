# Finanzas — Sprint 7: "Ahorro"

> Contexto financiero y de producto: `contexto_finanzas.md` (§7.3 tiene el
> resumen de por qué este sprint se adelantó y reemplaza a "Objetivos y
> bolsillos").
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1), `sprint_2_compartidos.md` (2),
> `sprint_3_fijos.md` (3), `sprint_4_planes_de_pago.md` (4), `sprint_5_pasanaku.md` (5),
> `sprint_6_presupuesto.md` (6).
>
> Este documento especifica **únicamente el Sprint 7** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-24 · Estado: **especificado, no construido**.

---

## 0. Preguntas que este sprint cierra

El roadmap (`contexto_finanzas.md` §7.3) solo tenía la idea suelta que trajo
el usuario en conversación. Todo lo demás se decidió en tres rondas
(2026-08-24):

### Ronda 1 — el modelo general

| Pregunta | Decisión |
|---|---|
| ¿Cómo se relacionan las cuentas dedicadas con los motivos de ahorro? | **Independientes.** Un motivo es una entidad propia con su reparto; el usuario elige en qué cuenta(s) dedicada(s) vive la plata. Una cuenta puede alojar varios motivos, y un motivo puede tener plata repartida en más de una cuenta |
| ¿Cómo se calcula y se aporta el sobrante del mes? | **Automático, con confirmación.** Al cerrar el mes la app calcula el sobrante y arma la transferencia repartida entre motivos; el usuario confirma o ajusta antes de que se registre |
| ¿El reparto entre motivos es fijo o se decide cada vez? (pregunta abierta #4 del roadmap) | **Mixto**, y se confirma cada mes: cada motivo puede tener un monto fijo o un %, pero la propuesta final siempre pasa por la pantalla de confirmación mensual antes de convertirse en movimientos reales |
| ¿Qué tan estricta es la regla de "ahí no entra/sale nada que no sea ahorro"? | **Blanda.** Mismo criterio que toda la app (Sprint 1 §4.4.1): la UI no ofrece la cuenta de ahorro para operaciones que no correspondan, pero el servidor no lo bloquea duro — así siempre se puede corregir un error propio |

### Ronda 2 — comportamiento fino

| Pregunta | Decisión |
|---|---|
| ¿Un retiro de un motivo cuenta como gasto real? | **Depende de a dónde va.** Si es una transferencia a otra cuenta propia, es movimiento financiero (no ensucia Presupuesto/Reportes). Si en el mismo momento se marca como gastado, cuenta como gasto real |
| ¿Los motivos tienen meta? | **Meta opcional** (monto, y fecha opcional) |
| ¿Qué pasa si los motivos con monto fijo no alcanzan con el sobrante del mes? | **La app pregunta qué hacer** — no decide sola ni prioriza ni prorratea automáticamente |
| ¿Dónde vive Ahorro en la navegación? | **Pantalla propia en "Más"** — no ocupa una ranura de la tab bar, no vive dentro de Presupuesto |

### Ronda 3 — detalles finos

| Pregunta | Decisión |
|---|---|
| ¿Cómo se captura el justificativo de un retiro? | **Categorías + texto opcional**: `emergencia`, `meta_cumplida`, `cambio_planes`, `otro`, con un campo de descripción libre además |
| ¿En qué moneda vive el monto de un motivo? | **Cada motivo elige su moneda** — mismo patrón que quedó en Presupuesto tras su rediseño (`input_currency` propia, ver `sprint_6_presupuesto.md` §0.3) |
| ¿Qué pasa si el mes cierra con sobrante negativo? | **Igual pregunta**: "cerraste en rojo, ¿retirás de algún motivo para cubrirlo o lo dejás así?" — mismo trato que un mes en rojo en el cierre de Presupuesto |
| ¿El reparto de un motivo se puede editar después de creado? | **Editable siempre**, efectivo desde el próximo cierre — no hay `retroactive` como en Presupuesto porque no hay nada que recalcular hacia atrás |

### 0.1 Decisiones de implementación que tomé yo

No se le preguntaron al usuario porque son mecánica interna, no producto —
mismo espíritu que el §0.2 de `sprint_6_presupuesto.md`:

1. **El saldo de un motivo es derivado, nunca guardado.** Se calcula sumando
   sus propios movimientos (aportes − retiros, en USD con la tasa que cada
   uno congeló), sin importar en qué cuenta dedicada haya caído la plata
   físicamente. Mismo principio que el saldo de una cuenta (Sprint 1 §4.2) y
   que "disponible" en Presupuesto — nunca una columna que se pueda
   desincronizar de su historial.
2. **Una transferencia entre dos cuentas de ahorro no afecta a ningún
   motivo.** Es solo reacomodar en qué billetera física vive la plata del
   ahorro en general; no lleva `savings_goal_id`. Si en el futuro hace falta
   "mover la plata de un motivo específico de una cuenta a otra", se hace
   con un retiro + un aporte, cada uno tageado — dos movimientos, no uno.
3. **Un motivo con meta cumplida se excluye de la propuesta automática de
   reparto**, tanto si es de monto fijo como de %, y muestra un badge "🎉
   Meta cumplida". No se bloquea: el usuario puede seguir aportando a mano
   desde el quick-add si quiere pasarse de la meta.
4. **`fin_accounts.is_savings` y `is_investment` son mutuamente
   excluyentes.** Una cuenta no puede ser las dos cosas — conceptualmente no
   tiene sentido (una es "no cuenta como gasto/ingreso porque el mercado se
   mueve solo", la otra es "no cuenta porque es plata que ya aparté").
5. **El reparto por % no exige sumar 100 entre todos los motivos.** Si suman
   menos, el resto queda sin asignar y se muestra en la pantalla de
   confirmación mensual — el usuario puede subir algún número antes de
   confirmar, o dejarlo así (irá al patrimonio general sin pasar por
   ningún motivo). Si sumaran más de 100 tampoco se rechaza: la propuesta
   automática simplemente no va a alcanzar y el usuario ajusta a mano en la
   confirmación, mismo camino que "fijos sin fondos" (Ronda 2).

---

## 1. Objetivo del sprint

> **Apartar automáticamente el sobrante de cada mes (lo que gané − lo que
> gasté) en cuentas 100% dedicadas a ahorro, repartido entre distintos
> motivos con su propio ritmo y meta — y verlos crecer sin que se mezclen
> nunca con el gasto corriente.**

### Definición de "terminado"

- [ ] Puedo marcar cualquier cuenta existente como "dedicada a ahorro"
- [ ] Puedo crear varios motivos de ahorro, cada uno con su moneda, su reparto (fijo o %) y una meta opcional
- [ ] Al cerrar un mes, veo cuánto fue mi sobrante y una propuesta de reparto entre mis motivos, editable antes de confirmar
- [ ] Confirmar arma las transferencias reales hacia las cuentas de ahorro, tageadas por motivo
- [ ] Si el sobrante no alcanza para los montos fijos, la app me lo dice y me deja decidir, no decide sola
- [ ] Un mes en rojo también me pregunta qué hacer, no lo ignora en silencio
- [ ] Puedo retirar de un motivo con un justificativo, y elijo si ese retiro fue un gasto real o una transferencia a otra cuenta mía
- [ ] Veo el saldo de cada motivo, su meta si tiene, y cuándo llegó a ella
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Cuentas dedicadas** | Flag `is_savings` en `fin_accounts`, excluyente con `is_investment` |
| **Motivos de ahorro** | Entidad propia: nombre, moneda, reparto (fijo o %), meta opcional (monto + fecha), archivar |
| **Cálculo del sobrante** | `ingreso_real_usd(mes) − gasto_real_usd(mes)`, mismo filtro `isConsumo` que ya usan Presupuesto y Reportes |
| **Cierre mensual** | Propuesta de reparto editable, cubre el caso "no alcanza" y el caso "mes en rojo", ambos preguntando en vez de decidir solo |
| **Aportes y retiros** | Movimientos normales (`ingreso`/`gasto`/`transferencia`) tageados con `savings_goal_id`, en cualquier cuenta `is_savings` |
| **Justificativo de retiro** | Categoría (`emergencia`/`meta_cumplida`/`cambio_planes`/`otro`) + texto libre opcional, obligatorio al retirar |
| **Pantalla** | `/finanzas/ahorro`, entra por "Más" |
| **Integración con quick-add** | Elegir una cuenta de ahorro habilita el picker de motivo; un retiro pide el justificativo antes de guardar |

### No entra en este sprint

| Fuera | Razón |
|---|---|
| Bloqueo duro en el servidor | Decisión cerrada (Ronda 1): blando, como el resto de la app |
| Panel en la Home | Se puede sumar después, mismo criterio que Presupuesto — no es parte de "terminado" acá |
| Reportes históricos de motivos a través de meses | Vive en el sprint de Reportes (#8), que puede reusar directamente el cálculo del sobrante de este sprint |
| Notificación cuando un motivo llega a su meta | Sprint de Alertas (#10) |
| Mover la plata de un motivo específico entre cuentas de ahorro en un solo paso | Se resuelve con retiro + aporte (§0.1.2); una operación dedicada de "mover" queda para si hace falta después |
| Sugerencia de reparto por historial | Mismo criterio que Presupuesto v1.1: necesita meses de datos que hoy no existen |

---

## 3. Modelo de datos

Dos tablas nuevas y dos columnas agregadas. Migración:
`supabase/migrations/2026XXXXXXXXXX_finanzas_ahorro.sql`. Nada de lo que
existe cambia de forma más allá de esto.

### 3.1 `fin_accounts` — modificada

```sql
alter table fin_accounts
  add column is_savings boolean not null default false;

alter table fin_accounts
  add constraint fin_accounts_savings_investment_excl
  check (not (is_investment and is_savings));
```

Mismo patrón que `is_investment` (Feature 11, `contexto_finanzas.md` §7.1):
un flag en la cuenta, escala sola a N cuentas, nada que marcar en cada
movimiento.

### 3.2 `fin_savings_goals` — los motivos

```sql
create table fin_savings_goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  input_currency    text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  allocation_type   text not null check (allocation_type in ('fixed','percent')),
  allocation_value  numeric(24,8) not null check (allocation_value > 0),
  target_amount     numeric(24,8) check (target_amount is null or target_amount > 0),
  target_date       date,
  sort_order        integer not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint fin_savings_goal_percent_range
    check (allocation_type = 'fixed' or allocation_value <= 100)
);
create index on fin_savings_goals (user_id, archived, sort_order);
```

`allocation_value` es un monto en `input_currency` cuando `allocation_type =
'fixed'`, o un porcentaje 0–100 cuando es `'percent'` (§4.3 tiene el
algoritmo completo). `target_amount` está en la misma `input_currency` que
el resto del motivo — no tiene sentido una meta en una moneda distinta del
monto que se está juntando.

### 3.3 `fin_transactions` — modificada

```sql
alter table fin_transactions
  add column savings_goal_id uuid references fin_savings_goals(id) on delete set null,
  add column savings_reason  text check (
    savings_reason is null or savings_reason in ('emergencia','meta_cumplida','cambio_planes','otro')
  );
```

Mismo patrón que `pasanaku_id`/`recurring_id`: una FK nullable sobre la
tabla que ya existe, cero cambios de forma. `savings_reason` solo tiene
sentido en una salida desde una cuenta de ahorro — se valida en el server
(§4.6), no con un `check` cruzado a otra tabla, que Postgres no permite sin
un trigger.

### 3.4 `fin_savings_closures` — la decisión de cada mes

```sql
create table fin_savings_closures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period       date not null,           -- primer día del mes que se cierra
  surplus_usd  numeric(14,2) not null,  -- congelado al decidir, puede ser negativo
  decided_at   timestamptz not null default now(),

  unique (user_id, period)
);
```

Mismo mecanismo que `fin_budget_closures` (Sprint 6 §3.4): **la ausencia de
fila es la pregunta pendiente.** Un período vencido sin fila acá es lo que
la UI detecta para mostrar el banner "tenés un mes por repartir". No guarda
el detalle de cuánto fue a cada motivo — eso ya quedó registrado como
`fin_transactions` reales tageadas con `savings_goal_id`; esta tabla solo
marca que la pregunta del período ya se respondió, para no volver a
mostrarla.

### 3.5 RLS

Las 2 tablas nuevas: `enable row level security` y las 4 policies
(`select`/`insert`/`update`/`delete`) con `user_id = auth.uid()`. Sin
excepciones, sin `createAdminClient()` — mismo criterio de siempre.

---

## 4. Reglas de negocio

### 4.1 Ingreso real y gasto real del mes

Reutiliza exactamente lo que ya existe — cero funciones nuevas acá:

```
sobrante_usd(mes) = ingresoUsd(txs del mes) − gastoUsd(txs del mes)
```

`ingresoUsd`/`gastoUsd` (`lib/finanzas/transactions.ts`) ya filtran por
`isConsumo` — reembolsos, cobros de deuda, aportes de pasanaku recibidos y
ajustes de cuentas de inversión ya quedan afuera, porque no son ingreso o
gasto real. Un aporte o retiro de ahorro **tampoco** debe contar ahí — ver
§4.5, que es justamente lo que lo garantiza.

### 4.2 Saldo de un motivo — derivado, nunca guardado

```
saldo(motivo) = Σ amount_usd  donde tx.savings_goal_id = motivo, tx.type = 'ingreso' o 'transferencia' entrante
              − Σ amount_usd  donde tx.savings_goal_id = motivo, tx.type = 'gasto' o 'transferencia' saliente
```

Mismo principio que el saldo de una cuenta (Sprint 1 §4.2): nunca una
columna que se pueda desincronizar de su historial. Se muestra también en
`input_currency` del motivo, convertido con la tasa de HOY (igual que
Presupuesto) — cada movimiento individual sigue guardando su propia tasa
congelada para auditar.

### 4.3 Propuesta de reparto al cerrar un mes

Con `sobrante_usd > 0`:

```
motivos_activos = motivos sin archivar Y (sin meta O saldo(motivo) < target_amount_usd)

fijos    = motivos_activos con allocation_type = 'fixed'
pctuales = motivos_activos con allocation_type = 'percent'

suma_fijos_usd = Σ allocation_value convertido a USD, de los `fijos`

si suma_fijos_usd <= sobrante_usd:
    cada fijo recibe exactamente su allocation_value
    resto_usd = sobrante_usd − suma_fijos_usd
    cada pctual recibe resto_usd × (allocation_value / 100)
    → si los % no suman 100, el remanente queda "sin asignar" (§0.1.5)

si suma_fijos_usd > sobrante_usd:
    NO se prorratea ni se prioriza solo.
    Se muestra cada fijo con su monto pedido vs. lo disponible,
    y el usuario ajusta a mano antes de confirmar (Ronda 2).
    Los `pctuales` proponen $0 hasta que el usuario libere margen.
```

Con `sobrante_usd <= 0`: no hay propuesta automática. La pantalla de cierre
muestra igual el número (negativo o cero) y pregunta si se quiere retirar
de algún motivo para cubrirlo, o dejarlo así (Ronda 3) — un "dejarlo así"
simplemente no genera ningún movimiento, solo la fila de
`fin_savings_closures` que cierra la pregunta.

### 4.4 Confirmar el cierre

Al confirmar (con ajustes o sin ellos), por cada motivo con monto > 0
propuesto se crea una `transferencia` real: `account_id` = una cuenta
regular elegida por el usuario en la confirmación (de dónde sale la
plata), `to_account_id` = una cuenta `is_savings` (a elección, si el motivo
vive en más de una), `savings_goal_id` = el motivo, fecha = hoy. Después se
inserta la fila de `fin_savings_closures` con el `surplus_usd` congelado.
Las dos escrituras son atómicas en el sentido de Sprint 2 §4.7/Sprint 4
§4.8: si falla la segunda, se deshace la primera tanda de transferencias y
se devuelve `500`.

### 4.5 `flow_type` extendido para cuentas de ahorro

Extiende `flowTypeFor`/`flowTypeOnEdit` (`lib/finanzas/transactions.ts`),
que ya resuelven esto para `is_investment`:

```
flowTypeFor(type, account):
  type = 'transferencia'                        → 'movimiento'  (ya existente)
  account.is_investment                         → 'movimiento'  (ya existente)
  account.is_savings Y type = 'ingreso'          → 'movimiento'  (aporte directo, no es ingreso nuevo que reportar)
  account.is_savings Y type = 'gasto'            → 'consumo'     (retiro real, cuenta como gasto — Ronda 2)
  cualquier otro caso                            → 'consumo'
```

Una `transferencia` ya es siempre `'movimiento'` por la regla existente, así
que un aporte o un retiro-a-otra-cuenta (ambos vía `transferencia`) nunca
ensucian el gasto/ingreso real del mes — solo un retiro tipo `gasto`
("lo usé") sí cuenta, que es exactamente la distinción de la Ronda 2.

### 4.6 Justificativo obligatorio en toda salida

Cualquier movimiento donde `account_id` (el origen) sea una cuenta
`is_savings` y el tipo sea `gasto` o `transferencia` — es decir, plata
**saliendo** de ahorro — exige `savings_reason` no nulo. Un `ingreso` o una
`transferencia` donde la cuenta de ahorro es el **destino** (`to_account_id`)
es una entrada y no lo pide, pero sí exige `savings_goal_id` (a qué motivo
corresponde).

### 4.7 Meta cumplida

`saldo(motivo) >= target_amount_usd` (cuando el motivo tiene meta): se
excluye de la propuesta automática (§4.3) y la UI le pone un badge "🎉 Meta
cumplida". No se bloquea nada — el usuario puede seguir aportando a mano
desde el quick-add si quiere pasarse.

### 4.8 Edición del reparto — sin retroactividad

Cambiar `allocation_type`/`allocation_value` de un motivo se aplica desde
el **próximo** cierre — no hay tabla de "montos por período" como en
Presupuesto porque no hace falta recalcular nada hacia atrás: los cierres ya
confirmados guardan su `surplus_usd` y los movimientos reales quedan tal
cual se generaron, ambos inmutables por diseño (mismo criterio que
`exchange_rate` congelado).

### 4.9 Transferencias entre dos cuentas de ahorro

No llevan `savings_goal_id` (§0.1.2) — mueven plata entre billeteras físicas
sin afectar el saldo de ningún motivo, porque el saldo de un motivo nunca
depende de en qué cuenta esté guardado.

### 4.10 Bloqueo — blando, en el cliente

Mismo principio que el tope de saldo (Sprint 1 §4.4.1) y el bloqueo de
Presupuesto (Sprint 6 §4.6): el quick-add no ofrece una cuenta `is_savings`
para un `gasto`/`ingreso` sin `savings_goal_id`, ni dos cuentas de ahorro
distintas en una transferencia sin decidir a qué motivo corresponde — pero
el servidor no lo rechaza si igual llega así. Es una app de un solo
usuario: la UI es la puerta real.

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/
├── screens/ahorro.tsx                  — lista de motivos + card de cada uno + banner de cierre pendiente
└── components/
    ├── savings-goal-sheet.tsx          — crear/editar un motivo (nombre, moneda, reparto, meta)
    ├── savings-closure-sheet.tsx       — la confirmación mensual del reparto, editable antes de guardar
    └── savings-withdraw-reason.tsx     — el picker de justificativo, usado desde quick-add en un retiro

app/api/finanzas/
├── savings-goals/route.ts              — GET lista con saldo derivado · POST crear
├── savings-goals/[id]/route.ts         — PATCH (reparto, meta, archivar) · DELETE
└── savings-goals/close/route.ts        — GET la propuesta del período pendiente · POST confirmar (con ajustes)

lib/finanzas/
└── savings.ts                          — sobrante, saldo por motivo, algoritmo de propuesta, needsSavingsClosure
```

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/types.ts` | `SavingsGoal`, `SavingsGoalProgress`, `SavingsClosure`, `SavingsProposal` |
| `lib/finanzas/transactions.ts` | `flowTypeFor`/`flowTypeOnEdit` ganan el caso `is_savings` (§4.5) |
| `lib/finanzas/load.ts` | `loadSavingsGoals()` |
| `app/api/finanzas/bootstrap/route.ts` | Un load más en el mismo viaje — el quick-add necesita los motivos en cualquier pantalla para el picker |
| `lib/finanzas/snapshot.ts` | `savingsGoals` en el snapshot · sube `VERSION` |
| `app/finanzas/components/data-context.tsx` | Expone `savingsGoals` y `savingsGoalFor(accountId)` |
| `app/finanzas/components/quick-add.tsx` | Cuenta `is_savings` habilita el picker de motivo (entrada) o el de justificativo (salida) en vez de guardar directo |
| `app/finanzas/components/nav-items.tsx` | Entrada "Ahorro", sin `tab: true` |
| `app/finanzas/screens/cuentas.tsx` | Toggle "Cuenta de ahorro", mismo patrón que "Cuenta de inversión", mutuamente excluyentes en el formulario |

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin usuario, cliente con RLS.
**Nunca** `createAdminClient()`.

### `GET /api/finanzas/savings-goals`
```jsonc
{
  "goals": [{
    "id": "uuid", "name": "Emergencia", "input_currency": "USD",
    "allocation_type": "fixed", "allocation_value": 50.00,
    "target_amount": 1000.00, "target_date": null,
    "balance": 320.00, "balance_usd": 320.00,
    "goal_reached": false, "archived": false
  }]
}
```

### `POST /api/finanzas/savings-goals`
Body: `{ name, currency, allocation_type, allocation_value, target_amount?, target_date? }`.

### `PATCH /api/finanzas/savings-goals/[id]`
Body: cualquier subconjunto de `{ name, allocation_type, allocation_value, target_amount, target_date, archived }`.

### `DELETE /api/finanzas/savings-goals/[id]`
Borra el motivo. Sus movimientos ya registrados **no se tocan** —
`savings_goal_id` cae a `null` por el `on delete set null`, mismo criterio
que borrar un fijo o un pasanaku.

### `GET /api/finanzas/savings-goals/close`
Devuelve el período pendiente más antiguo (si hay), con la propuesta ya
calculada:
```jsonc
{
  "pending_period": "2026-07-01",
  "surplus_usd": 245.60,
  "proposal": [
    { "goal_id": "uuid", "name": "Emergencia", "amount": 50.00, "currency": "USD", "amount_usd": 50.00, "capped": false },
    { "goal_id": "uuid", "name": "Viaje", "amount": 1358.40, "currency": "BOB", "amount_usd": 195.60, "capped": false }
  ],
  "unassigned_usd": 0,
  "insufficient_for_fixed": false
}
```
`insufficient_for_fixed: true` cuando `suma_fijos_usd > sobrante_usd` — la
UI muestra el modo de ajuste manual en vez de la propuesta automática.

### `POST /api/finanzas/savings-goals/close`
Body: `{ period, allocations: [{ goal_id, amount, from_account_id, to_account_id }], skip? }`.
`skip: true` cuando el usuario decide no repartir nada ese mes (mes en rojo,
o simplemente "no" a la propuesta) — crea solo la fila de
`fin_savings_closures`, cero transferencias. `409` si el período ya tiene
cierre.

---

## 7. UI

### Pantalla principal — `/finanzas/ahorro`

```
Ahorro                                            [ + Nuevo motivo ]
────────────────────────────────────────────────────────
⚠ Tenés un mes por repartir (julio)      [ Revisar ]

🛡️ Emergencia                              $320 / $1.000
▓▓▓▓▓▓▓▓░░░░░░░░░░░░  32%
Aporte fijo: $50/mes

🌴 Viaje a Brasil                     Bs 2.400 / Bs 5.000
▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  48%
30% del sobrante cada mes

🚀 Crecimiento                                    $1.240
(sin meta — solo acumula)
20% del sobrante cada mes
```

Tocar una card abre el detalle (saldo, historial de aportes/retiros,
editar reparto/meta, "Registrar retiro"). El botón "+ Nuevo motivo" abre
`<SavingsGoalSheet>`.

### Confirmación mensual — `<SavingsClosureSheet>`

```
Julio — tu sobrante fue $245,60
──────────────────────────────
🛡️ Emergencia (fijo)              $ [ 50,00 ]
🌴 Viaje a Brasil (30%)            $ [ 58,68 ]
🚀 Crecimiento (20%)               $ [ 39,12 ]

Sin asignar: $97,80

[ Confirmar reparto ]     [ No repartir este mes ]
```

Si `insufficient_for_fixed`, la primera línea de arriba se reemplaza por un
aviso: *"Tus motivos fijos piden $180 pero solo tenés $120 de sobrante —
ajustá los montos abajo"*, y cada campo fijo arranca editable con el pedido
original como referencia tachada al lado.

Con `sobrante_usd <= 0`:
```
Julio cerró en rojo: −$32,40
──────────────────────────────
¿Retirás de algún motivo para cubrirlo, o lo dejás así?

[ Elegir de dónde retirar ]     [ Dejarlo así ]
```

### Retiro — dentro del quick-add

Al elegir `gasto` o `transferencia` con una cuenta de origen `is_savings`,
antes del botón de guardar:

```
¿Por qué retirás de Emergencia?
──────────────────────────────
[ Emergencia real ]  [ Se cumplió la meta ]
[ Cambio de planes ]  [ Otro ]

Detalle (opcional)
[                                        ]
```

---

## 8. Verificación

Pendiente — el sprint todavía no se construye. Al implementar: `unit.mjs`
para el algoritmo de propuesta (fijos cubiertos, fijos sin fondos, resto
por %, % que no suman 100, meta cumplida excluida, sobrante negativo);
`db.mjs` para RLS, el `check` de exclusión mutua `is_investment`/`is_savings`,
el `unique(user_id, period)` de cierres; `api.mjs` para las 5 rutas con
sesión real, incluido el flujo completo alta de motivo → mes que cierra →
propuesta → ajuste manual → confirmar → retiro con justificativo.

---

## 9. Qué desbloquea

| Qué | Cómo |
|---|---|
| **Feature #8 — Reportes** | El cálculo de `sobrante_usd` de este sprint es directamente "cuánto ahorraste cada mes", uno de los números centrales de cualquier reporte |
| **Feature #10 — Alertas** | Los cierres pendientes y las metas cumplidas ya están calculados; falta solo el envío pasivo |
| **Panel en la Home** | Mismo camino que Presupuesto: los datos ya viajan en `/bootstrap` desde el día uno, exponerlos en una card es barato si se decide después |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby permite **1 cron al
día** y ya está usado. Este sprint no agrega ninguno — la detección de "mes
por repartir" es bajo demanda, al cargar la pantalla, mismo criterio que
Presupuesto.
