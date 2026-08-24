# Finanzas — Sprint 6: "Presupuesto"

> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1), `sprint_2_compartidos.md` (2),
> `sprint_3_fijos.md` (3), `sprint_4_planes_de_pago.md` (4), `sprint_5_pasanaku.md` (5).
>
> Este documento especifica **únicamente el Sprint 6** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-24 · Estado: **construido**, 548/156/548
> pruebas en verde (unit/db/api). El modelo se corrigió y se amplió después
> de la construcción original — ver §0.3, que manda sobre el resto del
> documento donde difieran.

---

## 0. Preguntas que este sprint cierra

El roadmap (`contexto_finanzas.md` §7) solo anticipaba una línea: *"Tabla
`fin_budgets` por categoría/mes. Lee de `fin_transactions`"*. Todo lo demás se
decidió en tres rondas de conversación con el usuario (2026-08-22):

### Ronda 1 — el modelo general

| Pregunta | Decisión |
|---|---|
| ¿Por categoría, tope general, o ambos? | **Ambos.** Categorías puntuales más un tope general que suma **todo** el gasto real del mes, sin exigir que reconcilie con la suma de categorías |
| ¿Bruto o neto en categorías con gasto compartido? | **Neto — el gasto real** (bruto − repartido) |
| ¿Monto fijo o editable mes a mes? | **Editable mes a mes**, con el mes anterior como default |
| ¿Se ve lo gastado, lo comprometido y el rollover? | **Los tres** |
| ¿Se muestra el equivalente en Bs? | **Sí**, en cada línea |
| ¿Presupuesto sobre ingresos? | **No.** Exclusivamente sobre gasto |

### Ronda 2 — el comportamiento fino

| Pregunta | Decisión |
|---|---|
| ¿Bloquea el registro si te pasás? | **Sí**, con opción de **ampliar el límite** de ese mes ahí mismo. Queda auditado y solo afecta ese período |
| ¿El tope general también bloquea? | **No.** Solo las categorías con línea propia. El general es informativo |
| ¿Contar retroactivo o desde hoy al crear una línea? | **Elegible, y fijo para siempre** — se pregunta una sola vez, al crear |
| ¿La barra de ritmo qué muestra? | **Las dos cosas**: tick de referencia + proyección a fin de mes |

### Ronda 3 — onboarding y rollover mensual

| Pregunta | Decisión |
|---|---|
| ¿Cómo se carga el presupuesto inicial? | **Wizard**: recorre las categorías semilla una por una ("¿Cuánto gastás aproximadamente en Comida?"), con opción de saltar. Crea una línea por cada respuesta |
| ¿Sugerencia por historial y buffer %? | **Confirmado para una v1.1**, cuando haya datos suficientes. Aplica a **cualquier** categoría con historial, no solo a las de Fijos. El wizard es el mismo componente que la va a mostrar — solo cambia si el campo arranca vacío o prellenado |
| ¿Rollover fijo por línea, o decisión mensual? | **Decisión mensual, no configuración fija.** Se elimina el selector de 3 modos. Al cerrar cada mes, la app pregunta por línea: "¿Llevás el sobrante/sobregasto al mes que viene, o se queda así?" |

### 0.1 Consecuencia de la Ronda 3 sobre el diseño

Reemplazar el `rollover_mode` estático por una pregunta mensual **simplifica**
el cálculo, no lo complica: como la pregunta se responde con el número real
ya cerrado de ese mes, el arrastre deja de ser recursivo. Cada período solo
mira la decisión del período inmediatamente anterior — el efecto acumulado de
meses más viejos ya quedó adentro de ese número congelado (§4.4).

### 0.2 Una decisión de implementación que tomé yo

**Si el usuario nunca responde la pregunta de cierre de un mes**, ese período
simplemente no aporta nada al disponible del siguiente (se comporta como si
hubiera dicho "no"), pero **la pregunta queda pendiente y respondible en
cualquier momento después** — no desaparece ni fuerza una respuesta.

### 0.3 Rediseño posterior a la construcción original — 2026-08-22 a 2026-08-24

El sprint se construyó siguiendo este documento (commit `31157ed`, 22/8), pero
dos días de uso real y revisión (~15 commits, "Presupuesto: …") corrigieron el
modelo en varios puntos. **Esto manda sobre el resto del documento** donde
haya diferencia:

| Spec original | Lo que quedó construido | Por qué |
|---|---|---|
| El tope general es una línea propia de `fin_budget_lines` con `category_id = null` | **El general no existe como línea.** Es un agregado derivado: la suma de todas las categorías con presupuesto (`sumGeneral` en `lib/finanzas/load.ts`). Migración `20260823000000_finanzas_presupuesto_sin_general.sql` | Una línea general independiente podía desincronizarse de la suma real de categorías; derivarla la hace imposible de desincronizar |
| Wizard inicial que recorre las 14 categorías una por una | **No hay wizard.** Un solo sheet ("Nuevo presupuesto") con selector de categorías por chips | El wizard forzaba a decidir las 14 de una sentada; el alta suelta se volvió el único camino, tanto para la primera línea como para las siguientes |
| Una línea = una categoría (`category_id` nullable) | **Una línea puede cubrir varias categorías**, vía tabla puente `fin_budget_line_categories` (una categoría no puede estar en dos líneas activas a la vez) | Categorías chicas y relacionadas (p. ej. "Salidas" + "Delivery") se presupuestan juntas sin perder detalle en Movimientos |
| Monto siempre en USD (`fin_budget_periods.amount_usd`) | **Cada línea tiene moneda propia** (`input_currency`), y el monto nativo se guarda tal cual se escribió (`fin_budget_periods.amount`) con `exchange_rate` congelado — mismo criterio que `fin_transactions`. El usuario piensa en Bs, no en USD | El monto reconvertido desde USD "flotaba" con la tasa (p. ej. 2.400 Bs mostraba 2.400,02); guardar el nativo lo fija |
| Sin nombre editable de línea | **Alias opcional** (`fin_budget_lines.name`) — si no se pone, el default es la lista de categorías | Necesario en cuanto una línea cubre varias categorías: "Salidas, Delivery" es peor título que "Gustos" |
| Barra de ritmo: tick + proyección a fin de mes | **Solo el tick.** La proyección se quitó (commit `9d35979`) | — |
| Toggle "gastado" vs. "disponible" no estaba en el alcance | **Se agregó**, configurable en Ajustes (`useBudgetViewPref`, `localStorage`), aplica igual en Presupuesto y en la Home | El usuario quería ver a veces cuánto le queda, no siempre cuánto ya gastó |
| Panel en la Home diferido a v1.1 (§2, "No entra") | **Se construyó igual**, en carrusel junto con el hero (commits "Home: …") | Los datos ya viajaban en `/bootstrap` desde el día uno para el bloqueo del quick-add; exponerlos en la Home fue barato |
| "La tab bar se queda en 4. Presupuesto entra por la sidebar/Más" (§7) | **Al revés:** Presupuesto entró a la tab bar y Cuentas pasó a "Más" (commit `634b418`) | — |
| `budget-block-sheet.tsx` separado para el bloqueo del quick-add | **No existe como archivo aparte** — el bloqueo y "Ampliar presupuesto" viven inline en `quick-add.tsx` | — |
| `budget-wizard-sheet.tsx` | **No existe** — reemplazado por `budget-line-sheet.tsx`, que sirve tanto para alta como edición | Ver wizard, arriba |

Además, una revisión de edge cases (23–24/8) encontró y corrigió cuatro bugs
reales del módulo, ninguno agarrado por la suite hasta ese momento:

1. **Un presupuesto en BTC reportaba $0.** Todo el módulo redondeaba montos
   nativos con `round2` (2 decimales); BTC usa 8. Pasó a redondeo por moneda
   (`roundFor`), el mismo patrón que ya usaban splits y pasanaku.
2. **`category_id` no se validaba contra el usuario** al crear/editar un
   fijo o un movimiento — la FK aceptaba la categoría de cualquiera.
3. **`decimalsFor` reventaba con una moneda desconocida** en vez de caer en 2.
4. **Borrar una categoría dejaba fijos rotos** (FK en `SET NULL` cuando la
   categoría ya era obligatoria). Pasó a `RESTRICT`, igual que `account_id`.

---

## 1. Objetivo del sprint

> **Saber, mientras el mes todavía está corriendo, si voy bien o me estoy
> pasando — por categoría y en general — que la app me frene antes de
> pasarme, y que armar el presupuesto la primera vez no sea trabajo manual
> categoría por categoría.**

### Definición de "terminado"

- [ ] Puedo armar mi presupuesto inicial con un wizard que recorre las categorías semilla
- [ ] Puedo poner un tope a cualquier categoría, y uno general independiente
- [ ] Veo, por categoría: gastado, lo que me falta pagar de Fijos, disponible real
- [ ] Cada línea muestra su equivalente en bolivianos
- [ ] Un gasto que me hace pasar el tope de una categoría se bloquea, con opción de ampliar
- [ ] El tope general nunca bloquea — solo se ve
- [ ] Al cerrar cada mes, la app me pregunta por cada línea qué hacer con el sobrante o el sobregasto
- [ ] Veo una barra con un tick de "acá deberías estar hoy" y una proyección a fin de mes
- [ ] Editar el monto de este mes no cambia lo que ya se cargó en meses anteriores
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Wizard inicial** | Recorre categorías de gasto sin línea activa, pregunta un monto o "saltar", crea las líneas |
| **Línea de presupuesto** | Una por categoría de gasto, más una general (sin categoría) |
| **Monto mensual** | Editable por período, con el mes anterior como default |
| **Comprometido** | Fijos pendientes de esa categoría, sumados al cálculo de disponible |
| **Cierre mensual** | Pregunta por línea, al terminar el período: llevar el sobrante/sobregasto, o no |
| **Retroactividad** | Elegible al crear la línea, inmutable después |
| **Bloqueo + ampliación** | Solo en categorías. El tope general es informativo |
| **Equivalencia en Bs** | En cada línea de la pantalla |
| **Barra de ritmo** | Tick de referencia + proyección a fin de mes |
| **Pantalla** | `/finanzas/presupuesto` |
| **Integración con quick-add** | El sheet de gasto necesita los presupuestos para poder bloquear |

### No entra en este sprint (queda anotado para v1.1)

| Fuera | Razón |
|---|---|
| **Sugerencia de monto por historial + buffer %** | Necesita 2-3 meses de `gasto_real` acumulado por categoría, que hoy no existen (Movimientos tiene 4 días). El wizard ya queda listo para recibirla: el día que haya datos, prellena en vez de arrancar vacío — no hace falta ninguna pantalla nueva |
| Presupuesto de **ingresos** | Decisión cerrada: es solo sobre gasto |
| Notificación push cuando te pasás | Sprint de Alertas (#10) |
| Panel en la Home | Se difiere como pantalla, pero los datos sí viajan desde el día uno porque el quick-add los necesita (§5). **Construido igual, ver §0.3** |
| Presupuesto agrupado por bolsillo | Confirmado: por categoría plana, no por los 5 bolsillos del contexto |
| Bloqueo en el tope general | Nunca bloquea, solo informa |

---

## 3. Modelo de datos

Cuatro tablas nuevas. Migración:
`supabase/migrations/2026XXXXXXXXXX_finanzas_presupuesto.sql`. Nada de lo que
existe cambia de forma.

### 3.1 `fin_budget_lines` — la plantilla

```sql
create table fin_budget_lines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid references fin_categories(id) on delete cascade,  -- null = tope general
  retroactive  boolean not null default true,
  created_on   date not null default current_date,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create unique index fin_budget_lines_category_idx
  on fin_budget_lines (user_id, category_id)
  where category_id is not null and not archived;

create unique index fin_budget_lines_general_idx
  on fin_budget_lines (user_id)
  where category_id is null and not archived;
```

**Ya no tiene `rollover_mode`** (Ronda 3 §0.1) — el rollover pasó de ser
configuración de la línea a ser una decisión por período, que vive en
`fin_budget_closures` (§3.4).

`retroactive` + `created_on` siguen igual que antes: la elección de "contar
desde el día 1 o desde hoy" se hace una sola vez, al crear la línea, y no
hay endpoint que la cambie después.

`category_id` nullable sigue siendo el tope general — nunca bloquea (§4.5),
pero participa igual del cierre mensual (§4.4): también tiene sentido
preguntar "¿llevás los $88 que te sobraron en general?".

### 3.2 `fin_budget_periods` — los montos por mes

```sql
create table fin_budget_periods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  line_id    uuid not null references fin_budget_lines(id) on delete cascade,
  period     date not null,          -- primer día del mes
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (line_id, period)
);

create index on fin_budget_periods (user_id, period);
```

Solo se guardan los meses que alguien tocó:

```
montoOriginal(línea, período) =
    si existe fila para (línea, período) → su amount_usd
    si no → el amount_usd del período anterior más reciente que sí tenga fila
    si no hay ninguno → null (línea sin presupuesto todavía)
```

### 3.3 `fin_budget_extensions` — el rastro de cada ampliación

```sql
create table fin_budget_extensions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  period_id  uuid not null references fin_budget_periods(id) on delete cascade,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  created_at timestamptz not null default now()
);

create index on fin_budget_extensions (period_id);
```

```
montoAmpliado(línea, período)  = Σ fin_budget_extensions.amount_usd de ese período
montoEfectivo(línea, período)  = montoOriginal(línea, período) + montoAmpliado(línea, período)
```

Si el período todavía no tiene fila propia y llega la primera ampliación, el
server la materializa primero con el monto heredado (§3.2), recién ahí
inserta la extensión.

### 3.4 `fin_budget_closures` — la decisión de cierre de cada mes

Tabla nueva de la Ronda 3. Reemplaza al `rollover_mode` estático del
borrador anterior.

```sql
create table fin_budget_closures (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  line_id    uuid not null references fin_budget_lines(id) on delete cascade,
  period     date not null,           -- el período que se cierra
  carried    boolean not null,        -- true = se lleva al período siguiente
  amount_usd numeric(14,2) not null,  -- el disponible congelado al decidir (puede ser negativo)
  decided_at timestamptz not null default now(),

  unique (line_id, period)
);
```

**`amount_usd` puede ser negativo a propósito** — es el disponible real de
ese mes al momento de cerrar, y un mes en rojo es tan válido de "cerrar" como
uno en verde: la pregunta es la misma ("¿esto se lleva o no?"), solo cambia
si lo que se lleva suma o resta.

**Se congela al responder, no se recalcula.** Igual que `exchange_rate` en
una transacción vieja (Sprint 1 §3.4): si más adelante se edita o se
backfillea un movimiento con fecha de ese mes ya cerrado, el número que se
llevó al mes siguiente no cambia solo — es historia, como cualquier otro
dato congelado de esta app.

**La ausencia de fila es la pregunta pendiente.** Igual que el estado de
Fijos o de una deuda (nunca un flag, siempre una existencia): un período
vencido de una línea activa, sin fila en `fin_budget_closures`, es lo que la
UI detecta para mostrar el banner de "tenés una pregunta pendiente".

### 3.5 RLS

Las 4 tablas: `enable row level security` y las 4 policies con
`user_id = auth.uid()`. Sin excepciones, sin `createAdminClient()`.

---

## 4. Reglas de negocio

### 4.1 Gasto real por categoría

```
gasto_bruto(cat, período)  = Σ tx.amount_usd
                              donde tx.category_id = cat, tx.flow_type = 'consumo',
                              tx.type = 'gasto', tx.date en período
                              (y tx.date >= línea.created_on si es el período de
                               creación y línea.retroactive = false)

repartido(cat, período)    = Σ split.amount_usd del gasto anterior, no condonado

gasto_real(cat, período)   = gasto_bruto(cat, período) − repartido(cat, período)
```

### 4.2 Comprometido — lo que Fijos ya avisa que vas a pagar

```
comprometido(cat, período) = Σ fijo.amount
                              donde fijo.category_id = cat, fijo.active = true,
                              su período cae en este mes,
                              y su estado hoy es 'pendiente'
```

### 4.3 Disponible

```
disponibleSinCarry(línea, período) = montoEfectivo(línea, período)
                                      − gasto_real(línea, período)
                                      − comprometido(línea, período)

disponible(línea, período) = disponibleSinCarry(línea, período)
                              + carriedInto(línea, período)
```

Donde `gasto_real` es el de la categoría de la línea, o la suma de todas las
categorías si la línea es la general.

### 4.4 Carry — un solo salto hacia atrás, no una cadena

```
carriedInto(línea, período) =
    si existe fin_budget_closures para (línea, período_anterior)
    y carried = true → su amount_usd
    si no → 0
```

**No es recursivo.** El `amount_usd` guardado en el cierre del período
anterior **ya incluye** cualquier arrastre que ese período haya recibido a
su vez — es simplemente `disponible(línea, período_anterior)`, el número
final. Mirar un solo mes hacia atrás alcanza siempre; no hace falta
encadenar N meses como en el diseño anterior.

### 4.5 El cierre mensual — la pregunta, no una configuración

Un período de una línea activa está **listo para cerrar** cuando ya terminó
(`hoy > último día del período`) y no tiene fila en `fin_budget_closures`.
La UI lo detecta al cargar `/presupuesto` (o desde cualquier pantalla, vía
un badge liviano) y presenta, por cada línea pendiente:

```
Agosto — Comida: te sobraron $12,50
[ Llevar a septiembre ]   [ Que quede como ahorro ]

Agosto — Ocio: te pasaste $4,00
[ Restar a septiembre ]   [ Que no afecte nada ]
```

Cualquiera de las dos respuestas crea la fila en `fin_budget_closures` con
`carried` en `true` o `false` y `amount_usd = disponible(línea, período)` tal
cual estaba al momento de responder. No hay una tercera opción de "llevar
solo una parte" — es binario, a propósito: repartir manualmente el sobrante
es la clase de decisión que se resuelve mejor bajando el monto del mes
siguiente a mano, no con una UI de reparto.

**No fuerza nada.** Si el usuario ignora el banner, el período siguiente
simplemente no recibe ningún carry (§0.2) hasta que se responda — y se
puede responder en cualquier momento después, incluso meses más tarde; el
`amount_usd` sigue siendo el de aquel entonces, no el de hoy.

### 4.6 Bloqueo y ampliación — solo en categorías

Al intentar guardar un `gasto · consumo` con `category_id` = una línea no
general:

```
disponibleTrasElGasto = disponible(línea, período) − monto_del_gasto_nuevo
```

Si da negativo, el quick-add bloquea y ofrece "Ampliar presupuesto" con el
faltante prellenado y editable. Al confirmar, se registra en
`fin_budget_extensions` (materializando el período si hace falta) y se
guarda el gasto en la misma operación.

Vive en el cliente, mismo principio que el tope de saldo (Sprint 1 §4.4.1):
es una app de un solo usuario, la UI es la puerta real. Editar un gasto
existente que lo hace pasarse también dispara el bloqueo, con la misma
corrección de "revertir el efecto del propio movimiento" del tope de saldo.

**El tope general nunca pasa por esto** — se calcula y se muestra, pero
ninguna categoría sin línea propia se bloquea aunque el general esté en
rojo.

### 4.7 El tope general es un agregado, nunca una restricción

```
gasto_real_total(período) = Σ gasto_real(cat, período)   para TODAS las categorías,
                             tengan o no línea propia
```

Se compara contra `montoEfectivo` de la línea general igual que cualquier
categoría (§4.3), con su propio carry (§4.4) si corresponde.

### 4.8 Barra de ritmo: tick + proyección

```
díasDelPeríodo   = días en el mes del período
díaDeReferencia  = si el período es el actual → día de hoy
                    si es un período pasado   → díasDelPeríodo (cerrado, sin proyección)

posiciónDelTick = (díaDeReferencia / díasDelPeríodo) × montoEfectivo(línea, período)
proyección      = gasto_real(línea, período) / díaDeReferencia × díasDelPeríodo
```

La proyección es sobre el ritmo de consumo, no incluye `comprometido` — eso
ya se sabe que va a pasar sí o sí y se resta aparte en "disponible" (§4.3).

### 4.9 Edición no toca el historial

`fin_budget_periods` es una fila por mes — cambiar agosto no toca julio.

### 4.10 Categorías archivadas

Archivar una categoría no borra su línea ni sus períodos. El historial se
sigue mostrando; el gasto real futuro queda en 0 solo. Una línea archivada
**deja de mostrar preguntas de cierre pendientes** — si nunca se respondió
antes de archivar, queda como "no" implícito (§0.2), sin forzar nada.

### 4.11 Atomicidad

Crear una línea con su primer monto, guardar un gasto con ampliación, y
responder un cierre, son cada uno una o dos escrituras sin transacción SQL —
mismo caso ya resuelto en Sprint 2 §4.7 y Sprint 4 §4.8. Si falla la
segunda, se deshace la primera y se devuelve `500`.

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/
├── presupuesto/page.tsx                — progreso por categoría + tope general + banner de cierres pendientes
└── components/
    ├── budget-wizard-sheet.tsx         — recorre categorías sin línea, un monto por vez, "Saltar"
    ├── budget-line-sheet.tsx           — crear/editar una línea suelta (monto, retroactividad)
    ├── budget-block-sheet.tsx          — el bloqueo del quick-add + "Ampliar presupuesto"
    └── budget-closure-sheet.tsx        — la pregunta de fin de mes, una línea a la vez

app/api/finanzas/
├── budgets/route.ts                    — GET progreso del mes (incluye cierres pendientes) · POST crear línea
├── budgets/[id]/route.ts               — PATCH (archivar) · DELETE
├── budgets/[id]/period/route.ts        — PATCH monto de un período puntual
├── budgets/[id]/extend/route.ts        — POST registrar una ampliación
└── budgets/[id]/close/route.ts         — POST registrar la decisión de cierre de un período

lib/finanzas/
└── budgets.ts                          — montoEfectivo, comprometido, disponible, carriedInto, proyección, cierres pendientes
```

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/types.ts` | `BudgetLine`, `BudgetPeriod`, `BudgetExtension`, `BudgetClosure`, `BudgetProgress` |
| `lib/finanzas/load.ts` | `loadBudgets()` |
| `app/api/finanzas/bootstrap/route.ts` | Un noveno `load` en el mismo viaje — el quick-add necesita `disponible` por categoría en cualquier pantalla, no solo en `/presupuesto` (Decisiones Técnicas §2.1) |
| `lib/finanzas/snapshot.ts` | `budgets` en el snapshot · sube `VERSION` |
| `app/finanzas/components/data-context.tsx` | Expone `budgets` y `disponibleFor(categoryId)` |
| `app/finanzas/components/quick-add.tsx` | Antes de guardar un gasto: si `disponibleTrasElGasto < 0`, abre `<BudgetBlockSheet>` en vez de guardar directo |
| `app/finanzas/components/nav-items.tsx` | Entrada "Presupuesto", sin `tab: true` |

**`lib/finanzas/transactions.ts` y `splits.ts` no cambian.**

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin usuario, cliente con RLS. **Nunca**
`createAdminClient()`.

### `GET /api/finanzas/budgets`
Query: `period` (default: mes en curso).
```jsonc
{
  "general": {
    "line_id": "uuid",
    "amount_usd": 900.00, "extended_usd": 0, "carried_usd": 0,
    "spent_usd": 612.40, "committed_usd": 42.00, "available_usd": 245.60,
    "day_of_period": 22, "days_in_period": 31, "projected_usd": 863.75
  },
  "categories": [{
    "line_id": "uuid", "category": { "id": "uuid", "name": "Comida" },
    "retroactive": true,
    "amount_usd": 80.00, "extensions": [{ "amount_usd": 15.00, "created_at": "…" }],
    "extended_usd": 15.00, "carried_usd": 12.50,
    "spent_usd": 58.30, "committed_usd": 0, "available_usd": 49.20,
    "day_of_period": 22, "days_in_period": 31, "projected_usd": 81.80
  }],
  "pending_closures": [
    { "line_id": "uuid", "category_name": "Comida", "period": "2026-07-01", "amount_usd": 12.50 },
    { "line_id": "uuid", "category_name": "Ocio", "period": "2026-07-01", "amount_usd": -4.00 }
  ],
  "categories_without_line": [{ "id": "uuid", "name": "Salidas con Vale" }]
}
```
`categories_without_line` alimenta tanto el wizard (§7) como el "+ Agregar
categoría" suelto.

### `POST /api/finanzas/budgets`
Body: `{ category_id?, amount_usd, retroactive? }`. `409` si ya existe línea
activa para esa categoría (o ya existe la general).

### `PATCH /api/finanzas/budgets/[id]`
Body: `{ archived? }`. No acepta `retroactive` (inmutable) ni rollover (ya no
existe como configuración).

### `PATCH /api/finanzas/budgets/[id]/period`
Body: `{ period, amount_usd }`.

### `POST /api/finanzas/budgets/[id]/extend`
Body: `{ period, amount_usd }`. `400` si la línea es la general.

### `POST /api/finanzas/budgets/[id]/close`
Body: `{ period, carried }`. El server calcula `disponible(línea, período)`
en el momento de la llamada y lo congela como `amount_usd` de la fila.
`409` si ya existe una decisión para ese `(line_id, period)` — un cierre no
se puede responder dos veces; si el usuario se equivocó, no hay endpoint
para deshacerlo en este sprint (edge case raro, se resuelve a mano en la
base si hace falta).

### `POST /api/finanzas/transactions` — extendido
Acepta `budget_extension_usd?` opcional (§4.6).

---

## 7. UI

**Superseded por §0.3:** Presupuesto terminó entrando a la tab bar (no por
sidebar/Más), y el wizard descrito abajo no se construyó — el alta es un
solo sheet con selector de categorías por chips (`budget-line-sheet.tsx`).
Se deja el diseño original como referencia de las decisiones de fondo
(bloqueo, ampliación, cierre) que sí se mantuvieron.

### Wizard inicial

```
Armemos tu presupuesto
──────────────────────────────
¿Cuánto gastás aproximadamente
al mes en Comida?

$ [        ]

        [ Saltar ]   [ Siguiente → ]

                                    3 de 14
```

Recorre `categories_without_line` una por una. "Siguiente" con un monto
cargado crea la línea (`POST /budgets`); "Saltar" pasa a la próxima sin
crear nada. Al terminar, ofrece cargar también el tope general (sugerido
como la suma de lo recién cargado, editable). Reutilizable después desde
Ajustes ("Rehacer mi presupuesto") para las categorías que quedaron sin
línea — no es un flujo de una sola vez.

### Pantalla principal

```
Presupuesto — agosto                              ‹ ago ›
────────────────────────────────────────────────────────
⚠ Tenés 2 meses por cerrar          [ Revisar ]

General                              $612 / $900
▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  68%
A este ritmo: $863,75 al 31 — vas bien

🍽️ Comida    +$15 ampliado   +$12,50 llevado de jul   $58 / $95
▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░▏  61%          ← tick: día 22/31
Bs 403,44 · A este ritmo: $81,80 al 31 — vas bien

🎬 Ocio                                 $34 / $30
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  113%  ← rojo, te pasaste $4
Bs 236,64 · Te vas a pasar por ~$47 si seguís así

+ Agregar categoría        Armar con el wizard
```

### Cierre de mes

```
Julio — Comida
──────────────────────────────
Te sobraron $12,50

[ Llevar a agosto ]     [ Que quede como ahorro ]
```

Una línea a la vez, encadenadas si hay varias pendientes — no un formulario
con N preguntas juntas.

### Bloqueo en el quick-add

```
No alcanza el presupuesto
──────────────────────────────
Comida: $58,00 de $80,00 — te faltan $4,20
para este gasto de $26,20

[ Ampliar +$4,20 ]        ← prellenado, editable
[ Cancelar ]
```

### Crear una línea suelta — la pregunta de retroactividad

```
¿Contar los $18 que ya gastaste en esta
categoría desde el 1 de agosto?

[ Sí, contarlos ]     [ No, arrancar desde hoy ]
```

Solo aparece si se crea a mitad de mes y ya hay gasto real de esa categoría
en el período.

---

## 8. Verificación

**548/156/548 pruebas en verde** (2026-08-24, corridas contra el dev server
real). Eran 425/123/410 al cerrar el Sprint 5 — este sprint suma **123
pruebas nuevas en `unit`, 33 en `db` y 138 en `api`**, ya con el modelo
corregido de §0.3 (multi-categoría, moneda nativa, general derivado, sin
wizard).

```bash
node tests/finanzas/run.mjs          # las tres suites
node tests/finanzas/run.mjs unit     # solo una
```

| Suite | Sprint 5 | Ahora | Qué cubre de este sprint |
|---|---|---|---|
| `unit.mjs` | 425 | **548** | `disponible`, `carriedInto` (un salto, no cadena), `needsClosure`, `budgetBarView` en los dos modos, redondeo nativo por moneda (BTC incluido), validación de monto y de período |
| `db.mjs` | 123 | **156** | RLS de las 5 tablas (incluida `fin_budget_line_categories`), el índice único por categoría, `unique(line_id, period)` de cierres, cascadas al borrar una línea o un período, un cierre con disponible negativo, dos cierres del mismo mes rechazados |
| `api.mjs` | 410 | **548** | Las rutas con sesión real: alta multi-categoría, categoría duplicada → `409`, edición de categorías de una línea existente, bloqueo + ampliación desde el quick-add, cierre de mes, `/bootstrap` trae `budgets` con su forma esperada |

**Pendiente:** verificación visual dedicada en navegador (mismo bloqueo que
Pasanaku, §7 de `sprint_5_pasanaku.md` — el trigger `prevent_self_role_escalation`
impide promover un usuario de prueba a admin sin desactivarlo). Los cuatro
bugs de §0.3 salieron de una revisión de código dirigida a edge cases, no de
una sesión de navegador.

---

## 9. Qué desbloquea

| Qué | Cómo |
|---|---|
| **v1.1 — sugerencia por historial + buffer %** | El wizard ya es el componente que la va a mostrar; `gasto_real` por categoría y por mes ya está calculado por este sprint. Agregar la sugerencia es leer un promedio y multiplicarlo, no una pantalla nueva |
| **Feature #7 — Ahorro** (antes "Objetivos y bolsillos", renumerada el 24/8 — ver `contexto_finanzas.md` §7.3) | Necesita presupuesto construido primero — ya lo está |
| **Feature #8 — Reportes** | "Cuánto te sobró/faltó cada mes" ya está calculado acá, incluidas las decisiones de cierre |
| **Feature #10 — Alertas** | El estado de cada línea y los cierres pendientes ya están calculados; falta solo el envío pasivo |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby permite **1 cron al día**
y ya está usado. Este sprint no agrega ninguno — la detección de "período
listo para cerrar" es bajo demanda, al cargar la pantalla, no un job.

⚠️ **Recordatorio de la Decisión Técnica §2.1:** el quick-add depende de los
datos de presupuesto en cualquier pantalla, así que van a `/bootstrap` desde
el día uno, no después.
