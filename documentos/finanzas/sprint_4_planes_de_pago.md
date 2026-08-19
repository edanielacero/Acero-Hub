# Finanzas — Sprint 4: "Planes de pago"

> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1),
> `sprint_2_compartidos.md` (2) y `sprint_3_fijos.md` (3).
>
> Última actualización: 2026-08-19 · Estado: **construido**, modelo corregido
> el mismo día (§0.6: el plan parte de una deuda que ya existe). 80 pruebas
> nuevas propias del sprint, todas en verde; ver §8.

---

## 0. Por qué este sprint y no Pasanaku

El roadmap original (`contexto_finanzas.md` §7) tenía a Pasanaku en el puesto 4
y daba por bloqueado el calendario de los $957 hasta confirmar con el deudor si
la última cuota es de $57 o son 10 de $100 (pregunta abierta #1).

Esa pregunta dejó de ser un bloqueo el 2026-08-19: el usuario definió que **el
plan lo arma él**, no la app — cuántas cuotas, de cuánto, con o sin interés, y
puede editar cada una después. Con eso:

- La pregunta #1 desaparece: se carga el trato que se haya acordado y se edita
  cuando el deudor confirme. No hay nada que esperar.
- La feature deja de ser específica de una deuda — sirve para **cualquier**
  deuda registrada, presente o futura, no solo los $957.
- No requiere tocar `fin_tx_flow_shape` ni ningún constraint existente — a
  diferencia de Pasanaku, que sí lo necesita (anotado en Sprint 2 §9 y
  Sprint 3 §9: el aporte de 300 Bs es un `gasto · movimiento`, combinación que
  hoy el check constraint no permite).

Por eso este sprint ocupa el puesto 4 y Pasanaku corre al 5.

---

## 0.6 Corrección del modelo · 2026-08-19

La primera versión dejaba crear un plan **de la nada**: se tipeaba persona,
concepto, capital y moneda directo en el sheet, sin que existiera ninguna
deuda detrás. El usuario lo corrigió:

> *"Un plan de pagos no debería poder crearse sin una deuda. Primero se
> registra la deuda y luego el plan de pagos es para esa deuda."*

Tenía razón: un plan no es una forma alternativa de cargar una deuda, es una
forma de **reestructurar una que ya existe**. Dejar crear las dos cosas a la
vez duplicaba el camino de alta (con Deudas ya resuelto desde el Sprint 2) y
abría la puerta a que un plan y una deuda suelta describieran la misma plata
dos veces.

### Qué cambió

| Antes | Ahora |
|---|---|
| `POST /debt-plans` pedía `person_id`/`person_name`, `concept`, `principal`, `currency` | Pide **`debt_id`**: una deuda suelta que ya existe |
| El plan podía nacer sin que hubiera ninguna deuda | El plan **siempre** parte de una deuda registrada con el flujo normal (`DebtSheet`) |
| La deuda y el plan podían coexistir | Al crear el plan, la deuda original **se borra** — sus cuotas la reemplazan, mismo monto, ahora partido |
| El sheet de deuda suelta tenía un toggle "¿Es en cuotas?" | Se sacó. La entrada es **"Planificar en cuotas"** en el menú de una deuda ya registrada, dentro de "Deudas abiertas" |
| El sheet de creación pedía persona, concepto, capital y moneda | Esos cuatro datos se muestran **fijos**, heredados de la deuda; solo se decide interés, cuotas, frecuencia y arranque |

### Qué NO cambió

`fin_debt_plans` sigue guardando `person_id`, `concept`, `principal` y
`currency` — no hace falta un `debt_id` persistido, porque la deuda de origen
deja de existir en cuanto el plan se crea (§4.9). El resto del modelo —
cuotas como filas normales de `fin_debts`, regenerar, borrar — no se tocó.

### Por qué se borra la deuda original y no se la deja como "padre"

Se evaluó guardar un vínculo al estilo `transaction_id` (la deuda original
como padre, las cuotas como hijas). Se descartó: la deuda original y sus
cuotas describirían el mismo monto dos veces, y cualquier cálculo de "cuánto
me deben" tendría que acordarse de excluir al padre — una regla especial más,
para un caso que no aporta nada dejar vivo. Borrarla es lo mismo que ya hace
esta app en otros lugares: un fijo compartido reemplaza su reparto por uno
nuevo al editarse (Sprint 3), un cobro reemplaza el estado "pendiente" de una
deuda. La plata no desaparece, cambia de forma.

---

## 1. Objetivo del sprint

> **Elegir en cuántas cuotas cobro una deuda, con o sin interés, y no perder el
> hilo de cuál falta.**

Tres preguntas nuevas que la app responde:

1. ¿Cuánto me falta cobrar de este trato, en total?
2. ¿Cuál es la próxima cuota y cuándo vence?
3. ¿Qué pasa si renegociamos las condiciones a mitad de camino?

### Definición de "terminado"

- [x] Puedo crear un plan de N cuotas sobre una persona, con capital y fecha de arranque
- [x] Puedo agregar un interés simple opcional, o dejarlo vacío y cobrar solo el capital
- [x] Puedo elegir "cuotas iguales" o tipear cada cuota (monto y fecha) a mano
- [x] Cada cuota generada es una deuda normal: la cobro, la condono o la edito con las pantallas de Deudas que **ya existen**, sin ir a ningún lugar nuevo
- [x] Cobrar o condonar una cuota no toca el plan ni las demás cuotas
- [x] Puedo regenerar el plan si cambian las condiciones, sin perder lo que ya se cobró o condonó
- [x] Puedo cargar los $957 con el calendario real que se acuerde con el deudor, sin esperar a que confirme nada
- [x] Borrar un plan sin cuotas tocadas borra todo; con alguna cobrada, `409`
- [x] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Plan** | Se crea **a partir de una deuda suelta ya registrada**: hereda persona, concepto, capital y moneda de ella. Lo único que se decide en el sheet es interés simple opcional, N cuotas, frecuencia y fecha de arranque |
| **Generación** | Modo "cuotas iguales" (reparto parejo con resto en la última) o "manual" (el usuario tipea cada una) |
| **Cuotas** | Cada una es una fila normal de `fin_debts`: se cobra, condona, edita o borra con los endpoints existentes |
| **Regenerar** | Recalcular el resto pendiente en nuevas condiciones, sin tocar lo ya cobrado o condonado |
| **Pantalla** | Sección "Planes" dentro de `/finanzas/deudas`, sin pestaña nueva |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Amortización francesa/alemana (interés sobre saldo vivo, cuota a cuota) | El caso real es prestarle a alguien, no un banco. Interés simple una sola vez alcanza y es auditable a ojo |
| Interés compuesto | Mismo motivo |
| Recordatorios de cuotas por vencer | Es el Sprint de Alertas (hoy #10). El envejecimiento se lee pasivo, igual que Deudas y Fijos |
| Planes sobre deudas **tuyas** (vos debiéndole a alguien) | Fuera de alcance desde el contexto general — no le pasa en su vida real |
| Pagos parciales dentro de una cuota | Ya excluido en el Sprint 2: una deuda es binaria. Una cuota que se paga a medias se resuelve editando su monto o condonando el resto |

---

## 3. Modelo de datos

Una tabla nueva y dos columnas sobre `fin_debts`. Nada de lo que existe cambia
de forma — mismo compromiso que los tres sprints anteriores.

### 3.1 `fin_debt_plans`

```sql
create table fin_debt_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid not null references fin_people(id) on delete restrict,
  concept        text not null,
  principal      numeric(24,8) not null check (principal > 0),
  currency       text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  interest_rate  numeric(7,3) check (interest_rate is null or interest_rate >= 0),
  installments   integer not null check (installments > 0),
  frequency      text not null default 'mensual'
                 check (frequency in ('semanal','quincenal','mensual')),
  starts_on      date not null,
  note           text,
  created_at     timestamptz not null default now()
);

create index on fin_debt_plans (user_id, person_id);
```

`interest_rate` es **nullable a propósito**: `null` significa "solo capital".
Es la respuesta directa a "debo poder cobrar con intereses si quiero o solo el
monto del capital" — no hay un booleano aparte, el campo vacío ya lo dice.

`person_id → on delete restrict`: igual que en `fin_debts` y `fin_people`, una
persona con historial no se borra, se archiva.

### 3.2 `fin_debts.plan_id` y `plan_installment_no`

```sql
alter table fin_debts
  add column if not exists plan_id uuid references fin_debt_plans(id) on delete set null,
  add column if not exists plan_installment_no integer;

alter table fin_debts add constraint fin_debt_plan_shape check (
  plan_installment_no is null or plan_installment_no > 0
);

create index on fin_debts (plan_id);
```

**`on delete set null`, no `cascade` ni `restrict`.** Mismo razonamiento que
`fin_transactions.recurring_id` en el Sprint 3 (§3.4): borrar el plan **no**
borra la historia de lo que ya se cobró o condonó — esas filas quedan, solo
pierden el vínculo. El caso en que sí hace falta borrar cuotas (todas
pendientes) lo maneja la API explícitamente (§4.7), no la base.

⚠️ **El constraint no exige `plan_installment_no` en null cuando `plan_id`
también lo es.** La primera versión sí lo exigía, y eso hacía que el propio
`on delete set null` dejara la fila violando su constraint al borrar un plan
— Postgres anula `plan_id` pero no toca `plan_installment_no`, que no es
parte de la FK. Corregido en `20260819050000_finanzas_planes_de_pago_fix.sql`
(§8, "Bug encontrado y corregido"). Un número de cuota puede quedar colgando
sin plan; es inofensivo.

`plan_installment_no` existe para poder mostrar "Cuota 3 de 10" después de que
el usuario haya editado fechas a mano — si se derivara ordenando por
`incurred_on`, una cuota reprogramada más adelante que otra cambiaría de
número sin que nadie lo pidiera.

### 3.3 RLS

`fin_debt_plans`: `enable row level security` y las 4 policies
(select/insert/update/delete) con `user_id = auth.uid()`. Sin excepciones, sin
`createAdminClient()` — misma regla del Hub que todas las tablas anteriores.

---

## 4. Reglas de negocio

### 4.1 Qué es un plan

Un plan **parte de una deuda suelta que ya existe** (§0.6): persona, concepto,
capital y moneda se heredan de ella, no se vuelven a escribir. Lo que el plan
agrega es interés opcional y N cuotas. Al crearlo, genera N filas normales en
`fin_debts`, cada una con `plan_id` y `plan_installment_no`, y borra la deuda
original (§4.9). A partir de ahí, cada cuota vive su propia vida con la
maquinaria de Deudas que **ya existe**.

### 4.2 Cálculo del total y el interés

```
total = principal + (interest_rate ? principal × interest_rate / 100 : 0)
```

Interés simple, aplicado **una sola vez** sobre el capital — no por período, no
compuesto. Si el usuario deja `interest_rate` vacío, `total = principal`.

### 4.3 Repartir el total en cuotas — dos modos

**"Cuotas iguales"** (mismo patrón que la división pareja del Sprint 2 §4.2,
con un giro):

```
parte     = floorTo(total / N, currency)
cuota[i]  = parte                          para i = 0 .. N-2
cuota[N-1] = total − parte × (N−1)         ← el resto absorbe el redondeo
```

El resto va a la **última** cuota, no a la primera. En el reparto de gastos el
resto queda del lado de "vos" porque sos quien paga; acá no hay "vos" en la
lista — todas las cuotas son ajenas, y la última es la que menos duele ajustar
por unos centavos porque falta más para que venza.

**"Manual"**: el usuario tipea cada cuota (monto y fecha). **No se exige
`Σ cuotas = total`** — es la misma libertad que Fijos le dio al reparto en el
Sprint 3 §4.3: cobrar de más es un margen, cobrar de menos es un descuento que
decidís vos. La UI muestra la diferencia contra el total sugerido, no bloquea.

Este modo es el que resuelve un acuerdo verbal que no se reparte parejo: si el
deudor y vos ya acordaron cuotas de montos distintos (una más chica al final,
por ejemplo), se tipean tal cual quedaron, o se ajustan después editando la
cuota puntual el día que haga falta.

### 4.4 Fechas de cada cuota

```
cuota[i].incurred_on = addPeriod(starts_on, frequency, i)     i = 0 .. N-1
```

Para `frequency = 'mensual'`, `addPeriod` respeta el mismo tope de fin de mes
que ya usa Fijos (`lastDayOf` en `lib/finanzas/recurring.ts`): un plan que
arranca el 31 de enero cae el 28 de febrero, no se corre al 1 de marzo. Para
`'quincenal'` suma 15 días × i; para `'semanal'`, 7 días × i.

### 4.5 Cada cuota es una deuda normal — nada que reconstruir

| Acción | Endpoint | Cambios que necesita |
|---|---|---|
| Cobrar una o varias cuotas (de a una o juntas) | `POST /api/finanzas/debts/settle` | Ninguno |
| Condonar una cuota | `POST /api/finanzas/debts/waive` | Ninguno |
| Deshacer un cobro | `POST /api/finanzas/debts/unsettle` | Ninguno |
| Editar monto, fecha o nota de una cuota pendiente | `PATCH /api/finanzas/debts/[id]` | Uno: el bloqueo de cambiar `currency` hoy solo mira `transaction_id` (§ del Sprint 2); tiene que mirar también `plan_id`, por la misma razón — la moneda de una cuota no se cambia sin desincronizar el plan |

Es la misma decisión que evitó que Fijos tocara Deudas en el Sprint 3: una
cuota-deuda y una deuda suelta son la **misma entidad**. La máquina de estados
(pendiente / cobrado / perdonado, derivada de `settled_tx_id` y `waived_at`,
nunca guardada) ya está construida y con 486+ pruebas encima.

`currency` de cada cuota se copia de `fin_debt_plans.currency` al generarla; el
server nunca acepta una del cliente, igual que en el reparto de gastos
(Sprint 2 §3.3).

### 4.6 Regenerar un plan

Cuando se renegocia (cambia N, la tasa, o la fecha de arranque):

1. El server suma `Σ amount` de las cuotas **pendientes** del plan
   (`saldo_restante`) y lo ofrece como capital sugerido, editable — mismo
   patrón de "sugerido, editable" que ya usan las transferencias entre monedas
   y el cobro de deudas.
2. Se borran las cuotas **pendientes** actuales del plan. Las **cobradas y
   condonadas se conservan intactas**: son historia real.
3. Se generan las cuotas nuevas sobre el capital resultante, con la mecánica
   de §4.2–4.4.
4. Los parámetros del plan (`installments`, `interest_rate`, `frequency`,
   `starts_on`) se actualizan a los nuevos.

Regenerar **no crea un plan nuevo** — edita el existente. Si ya hay cuotas
cobradas, sigue siendo "el mismo" trato; solo cambia cómo se reparte el resto.

### 4.7 Borrar un plan

Solo si **ninguna** cuota fue tocada (todas pendientes): borra las cuotas y el
plan juntos. Si alguna ya está cobrada o condonada, `409` — *"Este plan ya
tiene cuotas cobradas o perdonadas. Regenéralo en vez de borrarlo."* Mismo
lenguaje que el 409 de borrar una cuenta con movimientos (Sprint 1 §4.5).

### 4.8 Atomicidad

Crear un plan son dos escrituras (el plan, después sus N cuotas) sin
transacción SQL — el mismo caso ya resuelto en el Sprint 2 §4.7. Si falla la
segunda, se borra el plan recién creado y se devuelve `500`. El peor caso
posible es que no quede ningún dato corrupto y haya que reintentar. La deuda
de origen no se toca hasta acá — si algo falla antes de este punto, sigue
intacta y no se perdió nada (§4.9).

### 4.9 La deuda de origen se consume, al final y no antes

Después de insertar el plan y sus cuotas con éxito, el último paso borra la
deuda que se planificó. **Al final, no al principio**: si se borrara primero
y algo fallara después, quedaría la plata sin representar en ningún lado. El
orden es insertar → insertar → borrar, nunca borrar → insertar.

Requisitos para poder planificar una deuda (todos, o `400`/`404`):

| Condición | Por qué |
|---|---|
| La deuda existe y es del usuario | Lo de siempre |
| `transaction_id` es `null` | Viene suelta, no de un gasto compartido — ese caso queda fuera de alcance (§2) |
| `plan_id` es `null` | No es ya una cuota de otro plan — planificar una cuota no tiene sentido |
| Sigue **pendiente** (`isOpen`) | Una deuda cobrada o condonada ya está cerrada; no hay nada que repartir |

Si el borrado final falla —caso raro, es una fila del propio usuario ya
validada— el plan y sus cuotas quedan bien creados igual; lo único que pasa es
que la deuda vieja sigue visible, duplicada, y se borra a mano. Mejor eso que
perder el plan recién armado.

---

## 5. Estructura de archivos

### Nuevos

```
app/api/finanzas/debt-plans/route.ts                 — GET lista · POST crear
app/api/finanzas/debt-plans/[id]/route.ts             — PATCH (concept/note) · DELETE
app/api/finanzas/debt-plans/[id]/regenerate/route.ts  — POST

app/finanzas/components/plan-sheet.tsx                — crear / regenerar un plan

lib/finanzas/plans.ts                                 — interés, reparto de cuotas, fechas

supabase/migrations/2026XXXXXXXXXX_finanzas_planes_de_pago.sql
```

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/types.ts` | `DebtPlan`, `DebtPlanInput`, `DebtPlanWithCuotas`; `plan_id` / `plan_installment_no` en `Debt` |
| `lib/finanzas/load.ts` | `loadDebtPlans()` |
| `lib/finanzas/shared.ts` | `DEBT_COLS` / `DEBT_CTX_COLS` suman `plan_id, plan_installment_no` |
| `app/api/finanzas/debts/[id]/route.ts` | El bloqueo de cambiar `currency` también mira `plan_id` (§4.5) |
| `app/api/finanzas/bootstrap/route.ts` | Un octavo `load` en el mismo viaje |
| `app/finanzas/screens/deudas.tsx` | Sección "Planes" arriba de "Por persona"; en "Deudas abiertas", ítem **"Planificar en cuotas"** en el menú de cada deuda suelta y sin plan |

**`debt-sheet.tsx` no se toca** (§0.6): el alta de una deuda sigue siendo
exactamente la de siempre. El plan se arma después, desde una deuda que ya
está en la lista.

**No hay pantalla ni pestaña nueva.** Mismo criterio que Compartidos y Fijos
en los sprints 2 y 3: la tab bar se queda en 4; esto se llega desde Deudas.

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin usuario, cliente con RLS. **Nunca**
`createAdminClient()`.

### `GET /api/finanzas/debt-plans`
```jsonc
{
  "plans": [{
    "id": "uuid", "person": { "id": "uuid", "name": "Juan" },
    "concept": "Deuda de Juan", "principal": 500.00, "currency": "USD",
    "interest_rate": null, "installments": 5, "frequency": "mensual",
    "starts_on": "2026-09-05",
    "total_usd": 500.00, "pagado_usd": 100.00, "pendiente_usd": 400.00,
    "perdonado_usd": 0,
    "cerrado": false,
    "cuotas": [
      { "id": "uuid", "plan_installment_no": 1, "amount": 100.00, "currency": "USD",
        "incurred_on": "2026-08-05", "state": "cobrado" },
      { "id": "uuid", "plan_installment_no": 2, "amount": 100.00, "currency": "USD",
        "incurred_on": "2026-09-05", "state": "pendiente" }
    ]
  }]
}
```
`cerrado` es **derivado**: `true` cuando todas las cuotas están `cobrado` o
`perdonado` — el mismo principio que el estado de cada deuda (punteros, nunca
una columna de estado).

### `POST /api/finanzas/debt-plans`
```jsonc
{
  "debt_id": "uuid",                // la deuda suelta que se pone en cuotas
  "interest_rate": null,
  "installments": 5, "frequency": "mensual",
  "starts_on": "2026-09-05",
  "mode": "manual",                 // "iguales" | "manual"
  "cuotas": [{ "amount": 100, "incurred_on": "2026-09-05" }, "…"]   // solo si mode = "manual"
}
```
**No lleva `person_id`, `concept`, `principal` ni `currency`** — los cuatro se
leen de `debt_id` (§0.6, §4.9). El server: valida la deuda (existe, suelta, no
es ya una cuota, sigue pendiente), calcula el total (§4.2), genera las N
fechas y montos (§4.3–4.4), inserta el plan y sus cuotas con `amount_usd`
congelado a la tasa de hoy (§4.5), y por último borra la deuda de origen
(§4.9). Si falla la escritura de las cuotas, borra el plan y devuelve `500`
sin tocar la deuda (§4.8).

### `PATCH /api/finanzas/debt-plans/[id]`
`{ concept?, note? }`. No toca N, interés ni fechas — para eso está
`regenerate`.

### `DELETE /api/finanzas/debt-plans/[id]`
`409` si alguna cuota ya está cobrada o condonada (§4.7).

### `POST /api/finanzas/debt-plans/[id]/regenerate`
```jsonc
{
  "principal": 857.00,              // opcional: default = Σ cuotas pendientes
  "interest_rate": 5, "installments": 6,
  "frequency": "mensual", "starts_on": "2026-09-05",
  "mode": "iguales"
}
```
Ver §4.6.

---

## 7. UI

**La tab bar se queda en 4.** Planes vive dentro de `/finanzas/deudas`, arriba
de "Por persona" — mismo criterio de Compartidos (Sprint 2 §7.1) y Fijos
(Sprint 3 §7).

```
Planes
──────────────────────────────────────────────
👤 Juan · Deuda de Juan
   $400,00 pendiente de $500,00        [Ver]
   ▸ 4 cuotas · próxima 5 sep · $100,00

👤 Ana · Préstamo cámara
   $0,00 pendiente · cerrado             ✓
```

Sin botón "Nuevo": acá no se puede arrancar un plan de la nada (§0.6). Si no
hay ninguno todavía, el panel lo dice y manda a "Deudas abiertas".

**Cómo se entra a crear uno.** Toda deuda suelta y que todavía no es cuota de
nada gana una entrada en su menú (⋮), al lado de Editar y Perdonar:

```
Le presté para el pasaje              $500,00   ⋮
                                              ├ Editar
                                              ├ Planificar en cuotas
                                              ├ Perdonar
                                              └ Eliminar
```

**Sheet de creación** (`<PlanSheet>`), disparado desde "Planificar en
cuotas". Persona, concepto, capital y moneda vienen de la deuda y se muestran
fijos — lo único que se decide es interés, cuotas, frecuencia y arranque:

```
Poner en cuotas
──────────────────────────────
👤 Juan · Le presté para el pasaje         $500,00

Interés    ( ) Sin interés   ( ) % simple ___
Cuotas     [ 5 ]      Frecuencia [ Mensual ▾ ]
Empieza    05/09/2026

Total a cobrar: $500,00

[ Cuotas iguales ]  [ Manual ]

  1. 05/09/2026    $ 100,00
  2. 05/10/2026    $ 100,00
  …

              [ Crear plan ]
```

En "Manual" cada fila es editable (monto y fecha), con
`parseDecimalInput()` en el campo de monto — el mismo bug de coma/punto que ya
mordió una vez (Sprint 1 §8) y cada input nuevo es una oportunidad de
repetirlo.

**Detalle del plan** (al tocar "Ver"): la lista de sus cuotas, cada una con el
mismo swipe/menú **Cobrar** / **Condonar** que ya tiene Compartidos
(Sprint 2 §7.4), más un botón **Regenerar** que abre el mismo sheet
precargado con lo pendiente.

---

## 8. Verificación

**80 pruebas nuevas propias del sprint, todas en verde** (2026-08-19, con el
modelo ya corregido según §0.6): 26 en `unit.mjs` (verificadas de forma
aislada, ver nota abajo), 19 en `db.mjs`, 35 en `api.mjs` — sumadas a las
suites completas, que siguen en verde.

```bash
node tests/finanzas/run.mjs db     # 101/101
node tests/finanzas/run.mjs api    # 295/295 (necesita el dev server)
```

| # | Prueba | Resultado |
|---|---|---|
| 1 | Plan en modo manual con montos elegidos a mano (no exigidos a coincidir con nada) se crea a partir de una deuda existente, y esa deuda desaparece al crearse | ✅ `api` |
| 2 | Plan de $100 en 3 cuotas iguales sin interés → $33,33 / $33,33 / $33,34 | ✅ `unit` `api` |
| 3 | Plan de $100 con 10% de interés en 2 cuotas iguales → total $110,00 → $55,00 c/u | ✅ `unit` `api` |
| 4 | Cobrar la cuota 1 de un plan no toca las demás ni el plan | ✅ `api` |
| 5 | Condonar una cuota la saca de "pendiente" sin generar movimiento | ✅ `api` |
| 6 | Editar el monto de una cuota pendiente con `PATCH /debts/[id]` funciona sin tocar el endpoint | ✅ `db` (edición vía REST directo) |
| 7 | Intentar cambiar la moneda de una cuota de un plan → rechazado | ✅ `api` |
| 8 | Borrar un plan con todas las cuotas pendientes borra también las cuotas | ✅ `api` |
| 9 | Borrar un plan con alguna cuota cobrada → `409` | ✅ `api` |
| 10 | Regenerar un plan con cuotas ya cobradas: esas quedan intactas, las pendientes se reparten de nuevo | ✅ `api` |
| 11 | `npm run build` pasa sin errores | ✅ |

### Bug encontrado y corregido durante el testing

**`ON DELETE SET NULL` contra un check constraint que no lo esperaba.**
`fin_debts.plan_id` anula solo esa columna al borrar el plan — `Postgres` no
toca `plan_installment_no`, que no es parte de la FK. El constraint original
(`fin_debt_plan_shape`) exigía que las dos fueran `null` juntas, así que el
propio `on delete set null` habría dejado la fila violando su constraint y el
`DELETE` del plan habría fallado en seco, siempre, para cualquier plan con
cuotas ya cobradas.

Se corrigió en `20260819050000_finanzas_planes_de_pago_fix.sql`: el
constraint ahora solo exige `plan_installment_no is null or > 0`,
independiente de `plan_id`. Un número de cuota puede quedar colgando después
de borrar el plan — es inofensivo, misma tolerancia que ya tiene
`fin_transactions.recurring_id` con los fijos borrados. Lo agarró el test
"borrar el plan libera plan_id de sus cuotas" de `db.mjs`, no una prueba
manual.

### Cuatro bugs encontrados en una revisión posterior, no al escribirlo

Una relectura completa del código (2026-08-19, después de dar el sprint por
construido) encontró cuatro problemas reales, ninguno agarrado por las 393
pruebas de arriba porque los cuatro son de la clase que una prueba
determinista no ve fácil — carreras, precisión y un caso que solo aparece
después de **regenerar dos veces**:

1. **`round2` en vez de `roundFor` al calcular el saldo restante de un plan**
   (`regenerate`). Un plan en BTC (8 decimales) habría perdido precisión al
   sugerir el capital para regenerar — el mismo error de categoría que la
   regla "roundFor para todo lo que no sea USD" existe para prevenir en el
   resto de la app.
2. **Carrera al regenerar**: el `DELETE` de las cuotas pendientes viejas no
   verificaba que siguieran pendientes en el momento de borrarlas. Si alguien
   cobraba una de esas cuotas desde otra pestaña justo entre el `SELECT` y el
   `DELETE`, se perdía el rastro de un cobro real. Se agregó el mismo guard
   `is('settled_tx_id', null).is('waived_at', null)` que ya usa
   `debts/settle`.
3. **La misma carrera en `DELETE /debt-plans/[id]`**, por la misma razón.
4. **"Cuota N/Total" deja de ser cierto después de regenerar.** La numeración
   de `plan_installment_no` sigue sumando sobre el máximo histórico (para no
   pisar las cuotas ya cobradas), pero `installments` en el plan se
   actualiza al tamaño de la tanda nueva — la fracción que mostraban el
   `concept` de la cuota y la pantalla de Deudas quedaba con el numerador más
   grande que el denominador (p. ej. "Cuota 4/2"). Se sacó la fracción falsa
   del `concept` generado al regenerar, y la pantalla ahora calcula "N de
   cuántas hay" contando la posición real dentro de `p.cuotas` en vez de leer
   los dos campos guardados — así queda cierto sin importar cuántas veces se
   regenere.

Los cuatro se corrigieron y la suite se volvió a correr en verde.

### Quinta corrección: el modelo, no el código

Después de esta revisión llegó la corrección de fondo (§0.6): un plan no se
crea de la nada, tiene que partir de una deuda que ya existe. No fue un bug
que una prueba encontrara — fue una decisión de producto que faltaba, y
obligó a reescribir `POST /debt-plans`, `<PlanSheet>` y las pruebas de
`api.mjs` que armaban planes directo con persona/concepto/capital. Las 80
pruebas del sprint (§8, arriba) ya reflejan el modelo corregido.

### Nota sobre `unit.mjs`

La suite `unit.mjs` completa no corrió: un trabajo en curso, en paralelo y
sin relación con este sprint (personalizar el saludo de la Home con el
nombre de sesión), sacó `currentUserId()` de `lib/finanzas/snapshot.ts`, y
`unit.mjs` todavía la importa para su propia sección de pruebas — el archivo
no carga. Las 26 pruebas nuevas de `lib/finanzas/plans.ts` (interés, reparto,
fechas, `planCerrado`, `planRollup`) se verificaron aparte, compilando el
módulo de forma aislada, y las 26 pasan. Quedan escritas en `unit.mjs` tal
cual correrán solas en cuanto se resuelva el import roto, que no es de este
sprint.

---

## 9. Qué desbloquea

| Qué | Cómo |
|---|---|
| Los $957 | Deja de bloquear la pregunta #1 del documento de contexto: se carga el plan que se haya acordado, sin esperar confirmación de nadie |
| **5 · Pasanaku** | No depende de esto, pero confirma el patrón "plantilla que genera filas" (`fin_recurring → fin_transactions`, ahora `fin_debt_plans → fin_debts`) por segunda vez. Si Pasanaku necesita algo parecido para sus rondas, ya hay dos precedentes |
| **7 · Reportes** | Un plan con interés es la única fuente de "ingreso" que no es sueldo ni reembolso. Cuando exista reporte de ingresos por origen, ya queda separable por `plan_id` |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby permite **1 cron al día**
y ya está usado. Este sprint no agrega ninguno — no hay nada que automatizar,
el usuario decide cuándo cobrar cada cuota.
