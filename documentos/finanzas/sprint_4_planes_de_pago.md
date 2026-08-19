# Finanzas — Sprint 4: "Planes de pago"

> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1),
> `sprint_2_compartidos.md` (2) y `sprint_3_fijos.md` (3).
>
> Última actualización: 2026-08-19 · Estado: **especificado, sin construir**.

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

## 1. Objetivo del sprint

> **Elegir en cuántas cuotas cobro una deuda, con o sin interés, y no perder el
> hilo de cuál falta.**

Tres preguntas nuevas que la app responde:

1. ¿Cuánto me falta cobrar de este trato, en total?
2. ¿Cuál es la próxima cuota y cuándo vence?
3. ¿Qué pasa si renegociamos las condiciones a mitad de camino?

### Definición de "terminado"

- [ ] Puedo crear un plan de N cuotas sobre una persona, con capital y fecha de arranque
- [ ] Puedo agregar un interés simple opcional, o dejarlo vacío y cobrar solo el capital
- [ ] Puedo elegir "cuotas iguales" o tipear cada cuota (monto y fecha) a mano
- [ ] Cada cuota generada es una deuda normal: la cobro, la condono o la edito con las pantallas de Deudas que **ya existen**, sin ir a ningún lugar nuevo
- [ ] Cobrar o condonar una cuota no toca el plan ni las demás cuotas
- [ ] Puedo regenerar el plan si cambian las condiciones, sin perder lo que ya se cobró o condonó
- [ ] Puedo cargar los $957 con el calendario real que se acuerde con el deudor, sin esperar a que confirme nada
- [ ] Borrar un plan sin cuotas tocadas borra todo; con alguna cobrada, `409`
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Plan** | Persona, concepto, capital, moneda, interés simple opcional, N cuotas, frecuencia, fecha de arranque |
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
  (plan_id is null and plan_installment_no is null)
  or (plan_id is not null and plan_installment_no > 0)
);

create index on fin_debts (plan_id);
```

**`on delete set null`, no `cascade` ni `restrict`.** Mismo razonamiento que
`fin_transactions.recurring_id` en el Sprint 3 (§3.4): borrar el plan **no**
borra la historia de lo que ya se cobró o condonó — esas filas quedan, solo
pierden el vínculo. El caso en que sí hace falta borrar cuotas (todas
pendientes) lo maneja la API explícitamente (§4.7), no la base.

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

Un plan es una intención de cobro sobre **una** persona: capital, interés
opcional, N cuotas. Al crearlo, genera N filas normales en `fin_debts`, cada
una con `plan_id` y `plan_installment_no`. A partir de ahí, cada cuota vive su
propia vida con la maquinaria de Deudas que **ya existe**.

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

Este modo es el que resuelve el caso real de los $957 sin necesitar la
respuesta exacta del deudor: 9 cuotas de $100 y la última de $57 se tipean tal
cual, o se ajustan después editando esa cuota cuando confirme.

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
posible es que no quede ningún dato corrupto y haya que reintentar.

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
| `app/finanzas/components/debt-sheet.tsx` | Toggle "¿En cuotas?" que abre `<PlanSheet>` en vez de crear una deuda suelta |
| `app/finanzas/screens/deudas.tsx` | Sección "Planes" arriba de "Por persona" |

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
    "concept": "Deuda de Juan", "principal": 957.00, "currency": "USD",
    "interest_rate": null, "installments": 10, "frequency": "mensual",
    "starts_on": "2026-09-05",
    "total_usd": 957.00, "pagado_usd": 100.00, "pendiente_usd": 857.00,
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
  "person_id": "uuid",              // o person_name, crea la persona al vuelo
  "concept": "Deuda de Juan",
  "principal": 957.00, "currency": "USD",
  "interest_rate": null,
  "installments": 10, "frequency": "mensual",
  "starts_on": "2026-09-05",
  "mode": "manual",                 // "iguales" | "manual"
  "cuotas": [{ "amount": 100, "incurred_on": "2026-09-05" }, "…"]   // solo si mode = "manual"
}
```
El server: resuelve la persona (`resolvePeople`, igual que una deuda suelta),
calcula el total (§4.2), genera las N fechas y montos (§4.3–4.4), inserta el
plan y sus cuotas con `amount_usd` congelado a la tasa de hoy (§4.5). Si falla
la segunda escritura, borra el plan y devuelve `500` (§4.8).

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
Planes                                    Nuevo
──────────────────────────────────────────────
👤 Juan · Deuda de Juan
   $857,00 pendiente de $957,00        [Ver]
   ▸ 9 cuotas · próxima 5 sep · $100,00

👤 Ana · Préstamo cámara
   $0,00 pendiente · cerrado             ✓
```

**Sheet de creación** (`<PlanSheet>`), disparado desde "Nuevo" acá o desde el
toggle "¿En cuotas?" del sheet de deuda suelta:

```
Nuevo plan de pago
──────────────────────────────
Quién      [ Juan ▾ ]
Concepto   [ Deuda de Juan            ]
Capital    $ 957,00
Interés    ( ) Sin interés   ( ) % simple ___
Cuotas     [ 10 ]     Frecuencia [ Mensual ▾ ]
Empieza    05/09/2026

Total a cobrar: $957,00

[ Cuotas iguales ]  [ Manual ]

  1. 05/09/2026    $ 95,70
  2. 05/10/2026    $ 95,70
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

Nada de esto existe todavía. Esta es la lista contra la que se valida al
construirlo, en el mismo formato que usaron los tres sprints anteriores.

| # | Prueba |
|---|---|
| 1 | Plan de $957 en modo manual, 9 cuotas de $100 + la última de $57: se crea sin bloquear |
| 2 | Plan de $100 en 3 cuotas iguales sin interés → $33,33 / $33,33 / $33,34 |
| 3 | Plan de $100 con 10% de interés en 2 cuotas iguales → total $110,00 → $55,00 c/u |
| 4 | Cobrar la cuota 1 de un plan no toca las demás ni el plan |
| 5 | Condonar una cuota la saca de "pendiente" sin generar movimiento |
| 6 | Editar el monto de una cuota pendiente con `PATCH /debts/[id]` funciona sin tocar el endpoint |
| 7 | Intentar cambiar la moneda de una cuota de un plan → rechazado |
| 8 | Borrar un plan con todas las cuotas pendientes borra también las cuotas |
| 9 | Borrar un plan con alguna cuota cobrada → `409` |
| 10 | Regenerar un plan con 3 de 10 cuotas ya cobradas: esas 3 quedan intactas, las 7 pendientes se reparten de nuevo |
| 11 | `npm run build` pasa sin errores |

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
