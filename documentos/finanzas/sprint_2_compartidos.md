# Finanzas — Sprint 2: "Compartidos y reembolsos"

> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprint 1 (base sobre la que se apoya todo esto):
> `documento_maestro_finanzas.md`.
>
> Este documento especifica **únicamente el Sprint 2** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-18 · Estado: **construido**, 486 pruebas en verde
> (§8), verificado en navegador real. Pendiente: probarlo en el iPhone (§8).

---

## 0. Preguntas que este sprint cierra

La pregunta abierta **#2** del documento de contexto (§5) bloqueaba este sprint.
Queda resuelta, junto con dos decisiones de modelo que aparecieron al
especificar:

| Pregunta | Decisión |
|---|---|
| ¿Compartidos en bruto o en neto? | **Bruto + reembolsos + neto.** Las tres cifras existen y se muestran. El gasto que se registra es el que salió de tu bolsillo |
| ¿A quién le cobrás — detalle o total? | **Por persona.** Tabla `fin_people`. Sabés quién te debe, cuánto y desde cuándo |
| ¿Solo suscripciones o cualquier gasto? | **Cualquier gasto.** Marcar un gasto como compartido es una casilla en el quick-add. Spotify y TradingView son dos casos de uso, no el mecanismo |

`contexto_finanzas.md` ya quedó actualizado con las tres (§4, §5 y §7).

---

## 1. Objetivo del sprint

> **Pagar algo completo y no perder de vista quién me tiene que devolver
> cuánto.**

Al terminar el sprint, la app responde tres preguntas nuevas:

1. ¿Quién me debe plata y desde hace cuánto?
2. De lo que gasté este mes, ¿cuánto es realmente mío?
3. Cuando me pagan, ¿cómo lo registro sin que parezca un ingreso?

La tercera es la que tiene trampa, y es la razón por la que este sprint importa
más de lo que parece. Ver §4.3.

### Definición de "terminado"

- [ ] Puedo registrar Spotify por sus **$11.99 completos** y repartirlo entre 3 personas
- [ ] Puedo crear una persona nueva escribiendo su nombre, sin salir del quick-add
- [ ] La Home me dice **"te deben $X"** y no lo suma al patrimonio
- [ ] Puedo marcar "Ana me pagó" y el saldo de la cuenta sube
- [ ] Ese cobro **no aparece** como ingreso del mes
- [ ] Veo gasto bruto y gasto real del mes, uno al lado del otro
- [ ] Un solo cobro puede saldar varias deudas de la misma persona
- [ ] Puedo condonar una deuda, y entonces sí pasa a ser gasto mío
- [ ] Borrar el cobro devuelve la deuda a pendiente
- [ ] El quick-add sigue registrando un gasto normal en **< 10 segundos**
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Personas** | Nombre + emoji. Crear al vuelo desde el quick-add, renombrar, archivar |
| **Reparto** | N personas por gasto. División pareja o montos manuales. Solo sobre `gasto` |
| **Cobros** | Marcar 1..n deudas como cobradas con un único movimiento real |
| **Condonar** | Perdonar una deuda: pasa a ser gasto tuyo, sin movimiento de plata |
| **`flow_type`** | La columna que separa *consumo* de *movimiento financiero* |
| **Pantalla Compartidos** | Deudas agrupadas por persona + historial |
| **Home** | Panel "te deben" + gasto bruto vs. gasto real del mes |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Plantillas / recurrencia de Spotify y TradingView | Es el **Sprint 8**. Acá se resuelve con "Repetir reparto" (§7.3), que cuesta cero tablas |
| Recordatorios por email de deudas viejas | Es el **Sprint 11** (Alertas). Acá el envejecimiento se muestra pasivo: "hace 13 días" |
| Pagos parciales | Ana paga los $3 o no los paga. Media deuda es una máquina de estados que no vale para montos de $3. Si hace falta, se condona el resto |
| Compartir un **ingreso** | No pasa en su vida real. El modelo no lo prohíbe conceptualmente, pero no se construye |
| Repartir una **transferencia** | Una transferencia no es un gasto: no hay nada que repartir |
| Que "te deben" sume al patrimonio | Decisión de producto ya cerrada para la deuda de los $957 (contexto §2.2) y se aplica igual acá. Ver §4.5 |
| Deudas **tuyas** (vos le debés a alguien) | Es la otra mitad del problema y duplica la UI. Hoy no le pasa |

### Deuda técnica que se limpia de paso

`fin_settings` quedó huérfana: la creó la migración `20260818000000` y la
reemplazó `fin_rates` en `20260818010000`. **Ningún archivo del código la lee.**
La migración de este sprint la borra. Es una línea, y la tabla está vacía.

---

## 3. Modelo de datos

2 tablas nuevas + 1 columna sobre `fin_transactions`. Migración:
`supabase/migrations/20260818040000_finanzas_compartidos.sql`, aplicada con
Supabase CLI durante el desarrollo.

**Nada de lo que existe cambia de forma.** `fin_transactions` recibe una columna
con default, y las dos tablas nuevas son satélites. Es exactamente lo que el
Sprint 1 prometió en su §9.

### 3.1 `fin_transactions.flow_type` — la columna que mantiene todo honesto

```sql
alter table fin_transactions
  add column if not exists flow_type text not null default 'consumo'
  check (flow_type in ('consumo','movimiento'));

update fin_transactions set flow_type = 'movimiento' where type = 'transferencia';

alter table fin_transactions add constraint fin_tx_flow_shape check (
  (type = 'transferencia' and flow_type = 'movimiento')
  or (type = 'ingreso' and flow_type = 'movimiento' and category_id is null)
  or (type in ('gasto','ingreso') and flow_type = 'consumo')
);
```

Es el mecanismo que el documento de contexto §3.1 pedía y que el Sprint 1 dejó
anotado como pendiente. Traduce a SQL una sola idea:

> **No toda plata que entra es un ingreso, y no toda plata que sale es un gasto.**

| `type` | `flow_type` | Qué es | Suma al patrimonio | Cuenta como ingreso/gasto |
|---|---|---|---|---|
| `gasto` | `consumo` | Un gasto normal | Baja | ✅ Sí |
| `ingreso` | `consumo` | Sueldo, freelance | Sube | ✅ Sí |
| `ingreso` | `movimiento` | **Un reembolso** | Sube | ❌ No |
| `transferencia` | `movimiento` | Plata que cambia de lugar | Neutro | ❌ No |

**Por qué el reembolso es un `ingreso` y no un tipo nuevo.** Se evaluó agregar
`type = 'reembolso'`. Se descartó: estructuralmente *es* plata entrando a una
cuenta, igual que un sueldo — el saldo sube, el patrimonio sube, la fila tiene la
misma forma. Lo único distinto es que no debe contarse como ingreso en los
reportes, y eso es precisamente lo que `flow_type` dice. Un tipo nuevo obligaría
a tocar el enum, el check constraint de transferencias, el selector del
quick-add y las 5 pantallas — para expresar algo que una columna booleana en
esencia ya expresa.

**Por qué `category_id is null` cuando es `movimiento`.** Un reembolso con
categoría "Otros ingresos" contaminaría cualquier reporte futuro de ingresos por
categoría. La base lo impide en vez de confiar en que nadie lo haga.

### 3.2 `fin_people`

```sql
create table if not exists fin_people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create unique index if not exists fin_people_user_name_idx
  on fin_people (user_id, lower(name)) where not archived;
```

Personas, no usuarios. **No hay `auth.users` detrás de ellas y nunca lo habrá**:
es una app de un solo usuario (contexto §1). "Ana" es una etiqueta, no una
cuenta. Cualquier feature que implique que Ana vea algo está fuera de alcance
por definición.

El índice único va sobre `lower(name)` para que "ana" y "Ana" no coexistan — el
error más probable al crear personas escribiendo el nombre. Es **parcial**
(`where not archived`) para poder reusar un nombre después de archivarlo.

Sin `default_currency`: la gente te paga en lo que sea, y la moneda del cobro la
define la cuenta donde cae la plata.

### 3.3 `fin_splits`

Una fila por persona por gasto compartido. Es el corazón del sprint.

```sql
create table if not exists fin_splits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  transaction_id  uuid not null references fin_transactions(id) on delete restrict,
  person_id       uuid not null references fin_people(id)       on delete restrict,
  amount          numeric(24,8) not null check (amount > 0),
  currency        text not null check (currency in ('USD','BOB','USDT','USDC','BTC')),
  amount_usd      numeric(14,2) not null,
  settled_tx_id   uuid references fin_transactions(id) on delete set null,
  waived_at       date,
  note            text,
  created_at      timestamptz not null default now(),

  unique (transaction_id, person_id),

  constraint fin_split_settle_shape check (
    settled_tx_id is null or waived_at is null
  )
);

create index if not exists fin_splits_user_open_idx
  on fin_splits (user_id) where settled_tx_id is null and waived_at is null;
create index if not exists fin_splits_tx_idx      on fin_splits (transaction_id);
create index if not exists fin_splits_settled_idx on fin_splits (settled_tx_id);
```

#### Lo que faltó: un trigger para `flow_type`

Al construirlo apareció un footgun que la especificación no había visto. El
default de la columna es `'consumo'`, pero `fin_tx_flow_shape` exige que una
transferencia sea `'movimiento'`: **insertar una transferencia sin setear la
columna a mano fallaba** con un error de constraint ilegible. Rompió las pruebas
del Sprint 1 apenas se aplicó la migración, y habría roto cada sprint futuro que
escriba movimientos.

Que una transferencia sea un movimiento financiero no es una decisión de quien
escribe: es una propiedad del dato. Así que lo deriva la base
(`20260818050000_finanzas_flow_type_trigger.sql`):

```sql
create or replace function fin_normalize_flow_type()
returns trigger language plpgsql as $$
begin
  if new.type = 'transferencia' then new.flow_type := 'movimiento'; end if;
  return new;
end; $$;

create trigger fin_tx_flow_type
  before insert or update on fin_transactions
  for each row execute function fin_normalize_flow_type();
```

El check se queda solo con lo que **sí** es una decisión: si un `ingreso` es
reembolso o plata ganada, y que si es reembolso no lleve categoría.

#### Los tres estados de una deuda

| Estado | Cómo se ve en la base | Qué significa |
|---|---|---|
| **Pendiente** | `settled_tx_id is null and waived_at is null` | Te deben la plata |
| **Cobrada** | `settled_tx_id` apunta al movimiento | Te la pagaron y entró a una cuenta |
| **Condonada** | `waived_at` con fecha | La perdonaste. Pasa a ser gasto tuyo |

No hay columna `status`. El estado se deriva de dos punteros, así que **es
imposible que diga "cobrada" y no exista el movimiento que la cobró**. Un enum
guardado sí puede desincronizarse del hecho que describe; dos punteros no.

#### Las tres claves foráneas, una por una

**`transaction_id → on delete restrict`.** No podés borrar un gasto que tiene
reparto sin borrar antes el reparto. El caso que esto previene es concreto: un
split cobrado cuyo gasto padre desaparece deja un `ingreso` en la cuenta sin
nada que lo explique. El `restrict` hace que la base se plante, y la API traduce
eso a un mensaje legible (§4.6). Es el mismo patrón que "no se borra una cuenta
con movimientos" del Sprint 1 §4.5.

**`person_id → on delete restrict`.** Una persona con historial no se borra, se
archiva. Igual que las cuentas y las categorías.

**`settled_tx_id → on delete set null`.** Acá sí conviene el `set null`, y la
diferencia con el caso de arriba es importante: si borrás el movimiento del
cobro, la deuda **vuelve a pendiente**, que es exactamente la verdad — la plata
ya no está. El estado de reposo es correcto y significa algo. En cambio un split
sin gasto padre no significa nada, y por eso ahí va `restrict`.

#### Un cobro puede saldar varias deudas

`settled_tx_id` **no** es único a propósito. Ana te debe Spotify de julio y de
agosto, te transfiere $6 de una: un solo movimiento, dos splits apuntando a él.
La UI lo expone directamente (§7.4) porque es lo que pasa en la vida real.

#### `amount_usd` hereda la tasa del padre — **no** hace su propia conversión

```
split.amount_usd = round2(split.amount × transaction.exchange_rate)
```

El split usa el `exchange_rate` **congelado del gasto padre**, nunca la tasa de
hoy. Si hiciera su propio `toUsd()`, un gasto de Bs 350 registrado a 6.96 y
repartido tres días después a 7.20 daría partes que no suman al total, y
"cuánto es realmente mío" quedaría mal por la diferencia. La parte de un gasto
tiene que estar congelada con la misma foto que el gasto.

`currency` es una copia de la moneda del padre. Se denormaliza para que el
rollup de "te deben" no tenga que hacer join con `fin_transactions`; el server
la copia y nunca la acepta del cliente.

#### `is_shared` no existe, y es a propósito

El Sprint 1 §9 anticipó una columna `is_shared` en `fin_transactions`. Al
especificar quedó claro que sobra: para pintar el badge de compartido la lista
ya necesita traer los splits (necesita los montos, no solo el sí/no), así que
`is_shared` sería un flag denormalizado que solo puede desincronizarse. Un gasto
es compartido si tiene splits. Punto.

### 3.4 RLS

Las 2 tablas nuevas: `enable row level security` y las **4 policies** (select,
insert, update, delete) con `user_id = auth.uid()`. Sin excepciones y sin
`createAdminClient()` en las rutas de datos. Es la regla de seguridad del Hub,
no un patrón heredado.

⚠️ Cuidado con un agujero fácil de dejar: la policy de `insert` sobre
`fin_splits` valida `user_id = auth.uid()`, **pero no que `transaction_id` sea
tuyo**. Con RLS activo en `fin_transactions` un id ajeno no es adivinable ni
legible, así que el riesgo real es nulo en una app de un usuario — pero la
validación de que el gasto padre pertenece al usuario se hace igual en el
server, porque ahí también se necesita leer su `exchange_rate` y su `currency`.
Sale gratis.

---

## 4. Reglas de negocio

### 4.1 Un gasto compartido es un gasto normal

Esta es la regla de la que cuelga todo lo demás:

> El gasto se registra por el **monto completo** que salió de tu cuenta. El
> reparto es metadata que cuelga de él, no una modificación del movimiento.

Spotify son $11.99 saliendo de Airtm. El saldo de Airtm baja $11.99. El
patrimonio baja $11.99. Que tres personas te deban $8.99 es información
**adicional**, no un descuento retroactivo sobre lo que pasó.

Lo que esto compra: la app siempre cuadra con el extracto real de la cuenta.
El modelo alternativo (registrar solo tu parte) es más simple de construir y
hace que la app mienta desde el primer mes.

### 4.2 División pareja: el que paga se come los centavos

```
n     = participantes, incluyéndote          (3 amigos + vos = 4)
parte = floorTo(amount / n, decimals(moneda))
```

Cada una de las `n − 1` personas recibe `parte`. Tu parte es el resto:
`amount − (n − 1) × parte`.

Bs 350 entre 3 (vos + 2):

| | Monto |
|---|---|
| `350 / 3` | `116.6666…` |
| `floorTo(…, 2)` | `116.66` |
| Ana | `116.66` |
| Juan | `116.66` |
| **Vos** | **`116.68`** ← el resto |

Redondear hacia arriba daría `116.67 × 3 = 350.01`, un centavo que no existe y
que rompería la invariante `Σ splits ≤ amount`. Redondear hacia abajo y dejar el
resto al que paga es la única variante en la que los números cierran y en la que
el error, si lo hay, va contra vos. Funciona igual con los 8 decimales del BTC.

### 4.3 El reembolso: la regla que justifica el sprint

Cuando Ana te paga, entra plata a una cuenta. Eso es un movimiento real y tiene
que existir como fila:

```
type       = 'ingreso'
flow_type  = 'movimiento'      ← acá está todo
category_id = null
account_id = donde cayó la plata
amount     = lo que realmente llegó, en la moneda de esa cuenta
```

Consecuencias, que son exactamente las que se buscan:

- ✅ El saldo de la cuenta **sube**
- ✅ El patrimonio **sube**
- ❌ Los "ingresos del mes" **no se mueven**
- ❌ La futura tasa de ahorro **no se infla**

Sin esta distinción, recuperar $8.99 de Spotify se vería como haber ganado
$8.99, y en diciembre el reporte anual diría que tenés una fuente de ingresos
que no existe.

**El cobro salda la deuda completa, aunque llegue distinto.** Ana debía Bs
116.66 (congelados en $16.76) y te transfiere $16.40 a Airtm porque la
plataforma le cobró comisión. La deuda se marca cobrada igual. La diferencia no
se persigue: aparece sola en el patrimonio, que es donde corresponde — recibiste
menos plata. Perseguir 36 centavos con una máquina de pagos parciales cuesta más
de lo que vale.

**El monto sugerido al cobrar** sale de `split.amount_usd` convertido a la
moneda de la cuenta destino con la tasa de **hoy**, y es editable. Lo que se
guarda es siempre lo que realmente llegó, nunca la sugerencia. Es la misma
mecánica que ya usa el quick-add para transferencias entre monedas (Sprint 1
§7), y por la misma razón.

### 4.4 Gasto bruto, gasto real y lo que se muestra

```
gasto_bruto_usd   = Σ tx.amount_usd     donde type='gasto' y flow_type='consumo' y mes
repartido_usd     = Σ split.amount_usd  donde el gasto padre cae en el mes
                                        y el split NO está condonado
gasto_real_usd    = gasto_bruto_usd − repartido_usd

por_cobrar_usd    = Σ split.amount_usd  donde el split está pendiente   (todos los meses)
cobrado_mes_usd   = Σ split.amount_usd  donde el cobro cayó en el mes
```

Dos detalles que parecen menores y no lo son:

**`repartido_usd` resta los splits pendientes también.** La parte de Ana no es
tu gasto, te la haya pagado o no. Que pague es un problema de *cobranza*, no de
*gasto*. Si la app esperara al cobro para descontarlo, el gasto real del mes
cambiaría solo, semanas después, sin que vos hayas hecho nada.

**Los condonados sí vuelven a ser gasto tuyo.** Perdonarle los $3 a Ana es
exactamente decidir gastarlos vos. Por eso `waived_at` los saca del descuento y
`gasto_real_usd` sube. Es la única forma de que condonar tenga consecuencias
visibles, que es de lo que se trata.

**`por_cobrar_usd` no se filtra por mes.** Lo que te deben es un saldo
acumulado, no un flujo. Una deuda de marzo sigue siendo una deuda en agosto.

### 4.5 Lo que te deben **no** es patrimonio

```
patrimonio_usd = Σ saldos      ← no cambia respecto al Sprint 1
```

`por_cobrar_usd` se muestra **al lado**, nunca sumado. Es la misma decisión ya
cerrada para los $957 en el contexto §2.2 ("no se cuenta como dinero disponible
hoy"), aplicada al caso chico. La coherencia acá importa: el Sprint 3 va a
mostrar la deuda por cobrar con la misma regla, y si Compartidos hiciera lo
contrario habría dos definiciones de patrimonio en la misma app.

También significa que **el tope de saldo del quick-add (Sprint 1 §4.4.1) no
cambia.** No podés gastar plata que te deben.

### 4.6 Borrados y ediciones

| Acción | Qué pasa |
|---|---|
| Borrar un gasto **sin** reparto | Igual que siempre |
| Borrar un gasto con reparto **todo pendiente** | La API borra los splits y después el gasto |
| Borrar un gasto con **algún split cobrado** | **409.** "Este gasto tiene cobros registrados. Deshacelos primero" |
| Borrar el movimiento de un cobro | Permitido. Los splits vuelven a **pendiente** solos (FK `set null`) |
| Bajar el monto de un gasto por debajo de `Σ splits` | **400** con el mínimo permitido en el mensaje |
| Subir el monto de un gasto compartido | Permitido. El reparto **no se toca**; la UI avisa que ya no cubre el total y ofrece recalcular |
| Archivar una persona con deudas pendientes | Permitido, pero la UI avisa cuánto queda abierto |
| Borrar una persona con historial | **409** → archivar (`on delete restrict`) |

**Por qué editar el monto no recalcula el reparto solo.** Si corregís Spotify de
$11.99 a $11.49 porque te equivocaste al tipear, no querés que la app decida
callada cuánto le debe ahora cada uno. Cambiar montos que otra persona te debe
sin avisar es la clase de sorpresa que hace desconfiar de la app entera. Avisa y
ofrece el botón; la decisión es tuya.

### 4.7 Atomicidad: qué pasa si falla a la mitad

Crear un gasto compartido son dos escrituras (el gasto, después sus splits) y no
hay transacción SQL de por medio — Supabase REST no la ofrece sin escribir una
función de Postgres.

La API compensa: si falla la inserción de los splits, borra el gasto recién
creado y devuelve `500`. Y si **esa** compensación también falla, el peor
resultado posible es **un gasto normal sin reparto** — una fila válida, visible
en Movimientos, que se arregla editándola. No queda dato corrupto ni saldo
inconsistente en ningún camino.

Lo mismo al cobrar: primero el movimiento, después el update de los splits. Si
el update falla, se borra el movimiento; si eso falla, queda un
`ingreso · movimiento` suelto en la lista, que también se arregla a mano.

Escribir esto como función de Postgres daría atomicidad real. Se difiere a
propósito, en línea con la lección 2 del contexto (§6): la infraestructura se
posterga hasta que duela. Para un usuario que registra ~40 movimientos al mes,
un modo de falla cuyo peor caso es "quedó un gasto sin repartir" no duele.

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/
├── compartidos/page.tsx              — deudas por persona + historial
└── components/
    ├── split-editor.tsx              — el bloque de reparto dentro del quick-add
    ├── person-picker.tsx             — chips de personas + crear al vuelo
    └── settle-sheet.tsx              — cobrar 1..n deudas de una persona

app/api/finanzas/
├── people/route.ts                   — GET · POST
├── people/[id]/route.ts              — PATCH · DELETE
└── shared/
    ├── route.ts                      — GET panel completo
    ├── settle/route.ts               — POST cobrar
    ├── waive/route.ts                — POST condonar
    └── unsettle/route.ts             — POST deshacer

lib/finanzas/
├── splits.ts                         — división pareja, validación, rollups
├── people.ts                         — resolver nombres a ids, crear al vuelo
└── shared.ts                         — leer repartos con su contexto (los embeds)

supabase/migrations/
├── 20260818040000_finanzas_compartidos.sql
└── 20260818050000_finanzas_flow_type_trigger.sql
```

**Dos archivos de `lib/` que no estaban en el plan y por qué:**

| Archivo | Razón |
|---|---|
| `people.ts` | Resolver `person_name` → id creando la persona que falte lo necesitan `POST /transactions` y `PATCH /transactions/[id]`. Escrito dos veces se desincroniza |
| `shared.ts` | Un split trae dos filas de `fin_transactions` por caminos distintos — el gasto que lo originó y el cobro que lo saldó — así que el embed hay que desambiguarlo por nombre de constraint. Ese string largo lo usan cuatro rutas |

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/types.ts` | `FlowType`, `Person`, `Split`, `SplitInput`, `SharedSummary` |
| `lib/finanzas/transactions.ts` | `gastoUsd()` e `ingresoUsd()` filtran por `flow_type='consumo'` |
| `app/api/finanzas/transactions/route.ts` | `POST` acepta `splits[]`; `GET` los devuelve y suma `total_por_cobrar_usd` |
| `app/api/finanzas/transactions/[id]/route.ts` | `PATCH` reemplaza splits; `DELETE` con la regla del 409 |
| `app/finanzas/components/quick-add.tsx` | Casilla "Es compartido" + monta `<SplitEditor>` |
| `app/finanzas/components/data-context.tsx` | Agrega `people` y `sharedSummary` al estado compartido |
| `app/finanzas/components/nav-items.tsx` | Campo `mobile: boolean` — Compartidos va solo en la sidebar (§7.1) |
| `app/finanzas/components/tx-row.tsx` | Badge de compartido + la línea "tu parte" |
| `app/finanzas/page.tsx` | Panel "te deben" + gasto bruto vs. real |
| `app/finanzas/movimientos/page.tsx` | Filtro "Solo compartidos" |
| `app/finanzas/ajustes/page.tsx` | Sección Personas (renombrar / emoji / archivar) |
| `documentos/finanzas/contexto_finanzas.md` | Tacha la pregunta #2 y marca la feature 2 como construida |

**Ningún archivo del Hub se toca.** `lib/project-assets.tsx` ya tiene la entrada
de `finanzas` desde el Sprint 1, y la fila de `projects` ya existe. No hay
migración de registro que hacer.

### 5.1 Regla de independencia — sigue vigente

Nada de `lib/finanzas/` ni de `app/finanzas/components/` importa de otra
mini-app, y nada de otra mini-app importa de acá. Si `<PersonPicker>` se parece
a un selector que existe en Expandlogy, es coincidencia. Ver
`documento_maestro_finanzas.md` §5.1.

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin usuario, cliente con RLS. **Nunca**
`createAdminClient()`.

### `GET /api/finanzas/people`
```jsonc
{
  "people": [
    { "id": "uuid", "name": "Ana", "emoji": "🌿", "archived": false,
      "open_count": 2, "open_usd": 6.00 }
  ]
}
```
`open_count` / `open_usd` vienen calculados: la pantalla de Compartidos y el
picker los necesitan, y hacerlos en el server evita traer todos los splits al
cliente solo para contarlos.

### `POST /api/finanzas/people`
Body: `{ name, emoji? }`. **Idempotente por nombre**: si ya existe una persona
activa con ese nombre (comparación `lower()`), devuelve la existente con `200`
en vez de fallar con el índice único. Es lo que hace que crear al vuelo desde el
quick-add nunca explote por tipear dos veces lo mismo.

### `PATCH` / `DELETE /api/finanzas/people/[id]`
`PATCH`: `{ name?, emoji?, archived? }`.
`DELETE`: `409` si tiene splits → sugerir archivar.

### `GET /api/finanzas/shared`
El panel entero en un viaje.
```jsonc
{
  "por_cobrar_usd": 6.00,
  "cobrado_mes_usd": 3.00,
  "condonado_mes_usd": 0,
  "por_persona": [{
    "person": { "id": "uuid", "name": "Ana", "emoji": "🌿" },
    "open_usd": 3.00,
    "oldest_days": 13,
    "splits": [{
      "id": "uuid", "amount": 3.00, "currency": "USD", "amount_usd": 3.00,
      "state": "pendiente",
      "transaction": { "id": "uuid", "date": "2026-08-05",
                       "description": "Spotify", "amount": 11.99, "currency": "USD" }
    }]
  }],
  "historial": [ /* últimos 20 splits cobrados o condonados, misma forma */ ],
  "repartos_recientes": [{
    "label": "Spotify", "people": [{ "id": "uuid", "name": "Ana" }, "…"], "mode": "igual"
  }]
}
```
`repartos_recientes` son los últimos 3 repartos **distintos**, derivados de los
gastos compartidos recientes. Alimentan el "Repetir reparto" del quick-add
(§7.3) sin necesidad de tabla de plantillas.

### `POST /api/finanzas/shared/settle`
```jsonc
{ "split_ids": ["uuid", "uuid"], "account_id": "uuid",
  "amount": 6.00, "date": "2026-08-18", "description": "Ana · Spotify jul+ago" }
```
El server:
1. Verifica que los splits existan, sean tuyos, estén **pendientes** y sean todos de la **misma persona**.
2. Crea el movimiento: `type='ingreso'`, `flow_type='movimiento'`, `category_id=null`, moneda de `account_id`, tasa congelada.
3. Apunta los splits a ese movimiento.
4. Si el paso 3 falla, borra el movimiento y devuelve `500` (§4.7).

`400` si algún split ya está cobrado o condonado — con el nombre del gasto en el
mensaje, no solo el id.

### `POST /api/finanzas/shared/waive`
`{ "split_ids": [...], "note"? }` → marca `waived_at = current_date`. **No crea
ningún movimiento**: no se movió plata. Sube `gasto_real_usd` del mes del gasto
padre (§4.4).

### `POST /api/finanzas/shared/unsettle`
`{ "split_ids": [...], "delete_transaction": true|false }`

Devuelve los splits a pendiente. Con `delete_transaction: true` borra además el
movimiento del cobro — que es lo que casi siempre querés, porque si la deuda
vuelve a estar abierta es porque esa plata no entró. Con `false` el movimiento
queda suelto, para el caso raro de "sí me pagó, pero era por otra cosa".

Sobre un split condonado simplemente limpia `waived_at`.

### `POST /api/finanzas/transactions` — extendido
Body: lo del Sprint 1 **más**
```jsonc
"splits": [
  { "person_id": "uuid", "amount": 3.00 },
  { "person_name": "Carlos", "amount": 3.00 }   // se crea al vuelo
]
```
Reglas nuevas que valida el server:
- `splits` solo con `type = 'gasto'` → si no, `400`.
- `Σ splits.amount ≤ amount` → si no, `400` con cuánto sobra.
- Sin `person_id` repetido en el array → `400` (el `unique` de la base es la red, el mensaje es acá).
- Cada `amount_usd` se calcula con el `exchange_rate` **del gasto** (§3.3), nunca con una tasa fresca.
- `currency` se copia del gasto. Si el cliente manda una, se ignora.

### `PATCH /api/finanzas/transactions/[id]` — extendido
Mandar `splits` **reemplaza el reparto completo**. Los splits que desaparecen del
array se borran; los que quedan se actualizan. Un split **cobrado** no se puede
borrar ni cambiar de monto → `409`.

Reemplazo total y no delta a propósito: el editor del cliente ya tiene la lista
entera en pantalla, y un protocolo de altas/bajas/modificaciones para 3 filas es
más superficie de bug que valor.

Si `splits` **no viene** en el body, el reparto queda intacto. Editar la
descripción de un gasto compartido no debe requerir reenviar el reparto.

### `GET /api/finanzas/transactions` — extendido
Cada fila suma `splits[]` con su estado, y la respuesta agrega:
```jsonc
{ "total_gasto_usd": 142.30, "total_ingreso_usd": 900.00,
  "total_repartido_usd": 8.99, "total_gasto_real_usd": 133.31 }
```
Nuevo query param: `shared=1` para filtrar solo los que tienen reparto.

⚠️ **`total_ingreso_usd` cambia de significado**: ahora excluye los
`flow_type='movimiento'`. Es un cambio de comportamiento sobre una ruta del
Sprint 1 y está buscado — pero hay que actualizar las pruebas que lo asumían.

---

## 7. UI

### 7.1 Navegación: la tab bar se queda en 4

Compartidos **no entra en la tab bar**. El diseño móvil son 4 pestañas + el FAB
central (`contexto_ui_finanzas.md` §6), y meter una quinta rompe el pill
flotante: los targets bajan de 44px y el botón de acción deja de estar centrado.

Se llega a Compartidos por tres caminos:

| Dónde | Cómo |
|---|---|
| **Home (móvil y desktop)** | Panel "Te deben $6.00" → tap → `/finanzas/compartidos` |
| **Sidebar (desktop)** | Quinta entrada. Ahí no hay problema de espacio |
| **Movimientos** | Chip de filtro "Compartidos" |

Por eso `nav-items.tsx` gana un campo `mobile: boolean`: la tab bar renderiza
`NAV_ITEMS.filter(i => i.mobile)` y la sidebar los renderiza todos. Sigue
habiendo una sola fuente de verdad para los destinos, que es de lo que se
trataba.

### 7.2 Home

Dos bloques nuevos, ambos **condicionales**: si no hay nada compartido, la Home
se ve exactamente igual que en el Sprint 1. La feature no le cobra espacio a
quien no la usa.

```
┌─────────────────────────────────────┐
│  Patrimonio total          👁        │   ← sin cambios: los cobros
│  $3.209,00                          │      pendientes NO suman acá
└─────────────────────────────────────┘

┌──────────────────┬──────────────────┐
│ Gasto de agosto  │ Te deben         │   ← el segundo tile solo
│ $142,30          │ $6,00            │      aparece si hay pendientes
│ real $133,31 ↓   │ 2 personas       │
└──────────────────┴──────────────────┘
```

`real $133,31` va debajo del bruto, en tamaño chico, y solo cuando difieren.
El tile "Te deben" es tappable y lleva a Compartidos.

### 7.3 Quick-add: el reparto

**La restricción que manda: el gasto normal tiene que seguir tardando menos de
10 segundos.** Por eso:

- La casilla **"Es compartido"** aparece solo en modo `gasto`, colapsada, como
  una fila más debajo de la categoría.
- El foco sigue cayendo en el monto al abrir el sheet. Nada del camino de 10
  segundos cambia.
- Solo al marcarla se despliega el bloque de reparto.

Desplegado:

```
☑ Es compartido
  ┌───────────────────────────────────────┐
  │ Repetir:  [Spotify · 3]  [TV · 1]     │  ← si hay repartos recientes
  ├───────────────────────────────────────┤
  │ Entre:  (Yo)  (Ana ✕)  (Juan ✕)  (+)  │
  │                                       │
  │ [ Partes iguales ]  [ Manual ]        │
  │                                       │
  │   Ana      $ 3,00                     │  ← editables solo en Manual
  │   Juan     $ 3,00                     │
  │   ─────────────────────               │
  │   Tu parte $ 5,99                     │  ← derivada, nunca editable
  └───────────────────────────────────────┘
```

Decisiones del bloque:

- **"Yo" es un chip, no una persona.** Cuenta para dividir, pero no genera fila
  en `fin_splits` ni existe en `fin_people`. Tu parte es siempre el resto
  (§4.2), y por eso se muestra pero no se edita: editarla sería editar la resta.
- **Crear personas al vuelo.** El `(+)` abre un input de texto; Enter crea la
  persona y la agrega al reparto. No hay que ir a Ajustes primero — si hubiera
  que hacerlo, la mitad de las veces no se registraría el gasto como compartido.
- **"Repetir reparto"** carga personas y modo de un gasto compartido reciente.
  Es el sustituto barato de las plantillas del Sprint 8: para Spotify y
  TradingView, que son los dos casos reales de hoy, resuelve el problema con un
  tap y cero tablas nuevas.
- **En Manual**, si `Σ partes > monto`, los montos se pintan en rojo y guardar
  se bloquea con el motivo — el mismo lenguaje visual que el tope de saldo del
  Sprint 1.
- **Separador decimal:** los inputs de monto por persona usan
  `parseDecimalInput()`. Es el mismo bug de 100× que ya mordió una vez (Sprint 1
  §8) y cada input de monto nuevo es una oportunidad de repetirlo.

### 7.4 `/finanzas/compartidos`

```
Te deben                          Cobrado en agosto
$6,00                             $3,00

┌─────────────────────────────────────────────┐
│ 🌿 Ana                    $3,00   [Cobrar]  │
│   📱 Spotify · 5 ago · hace 13 días  $3,00  │
├─────────────────────────────────────────────┤
│ 🎧 Juan                   $3,00   [Cobrar]  │
│   📱 Spotify · 5 ago · hace 13 días  $3,00  │
└─────────────────────────────────────────────┘

▸ Historial (3)
```

- Agrupado **por persona**, no por gasto: la acción real es cobrarle a alguien.
- `[Cobrar]` a nivel persona abre el sheet con **todas** sus deudas
  preseleccionadas — el caso "Ana me paga julio y agosto juntos" es un tap.
- Cada deuda tiene su swipe/menú con **Cobrar** y **Condonar**.
- El envejecimiento se muestra pasivo ("hace 13 días"). Sin colores de alarma ni
  notificaciones: eso es el Sprint 11.
- El historial es plegable y arranca cerrado.

### 7.5 Sheet de cobro

```
Cobrar a Ana
──────────────────────────────
☑ Spotify · 5 ago        $3,00
☐ Netflix · 2 jul        $2,50

Entra a       [ Airtm ▾ ]
Monto         $ 3,00          ← sugerido, editable
Fecha         18/08/2026
Nota          (opcional)

              [ Registrar cobro ]
```

- Preselecciona todo lo pendiente; podés destildar.
- El monto se recalcula al tildar/destildar, convertido a la moneda de la cuenta
  con la tasa de hoy, y deja de recalcularse en cuanto lo tocás a mano — la
  misma mecánica y el mismo enlace de "volver a la sugerencia" que ya tiene la
  transferencia entre monedas.
- Debajo, en gris: `Se registra como movimiento, no cuenta como ingreso.` La
  regla de §4.3 dicha en voz alta, en el único lugar donde el usuario podría
  dudar de qué va a pasar.

### 7.6 Movimientos

- Los gastos compartidos llevan un badge discreto (`👥 3`) en la fila.
- Debajo del monto, en chico: `tu parte $3,00`.
- Los reembolsos se pintan como ingreso (verde) pero con el chip de movimiento,
  no con el de categoría — se distinguen de un sueldo de un vistazo.
- Chip de filtro "Compartidos".

### 7.7 Ajustes

Sección **Personas**, con el mismo patrón que Categorías: lista, renombrar en el
lugar, emoji editable tocando el chip, archivar. Al archivar a alguien con
deudas abiertas, avisa cuánto queda sin cobrar antes de confirmar.

---

## 8. Verificación

**486 pruebas automatizadas, todas en verde** (2026-08-18). Eran 303 antes del
sprint.

```bash
node tests/finanzas/run.mjs          # las tres suites
node tests/finanzas/run.mjs unit     # solo una
```

| Suite | Antes | Ahora | Qué cubre de este sprint |
|---|---|---|---|
| `unit.mjs` | 168 | **235** | División pareja y sus centavos, `floorTo` contra el ruido binario, estados derivados, congelado heredado del padre, validación del reparto, bruto/repartido/real, `flow_type`, antigüedad, agrupado por persona |
| `db.mjs` | 35 | **62** | RLS de las dos tablas, el índice único parcial `lower(name)`, `unique(transaction_id, person_id)`, los tres `on delete`, `fin_split_settle_shape`, `fin_tx_flow_shape`, el trigger, 8 decimales en un reparto en BTC |
| `api.mjs` | 100 | **189** | Las 10 rutas nuevas o extendidas: idempotencia de personas, saldo bruto vs. tu parte, cobrar sin inflar ingresos, un cobro saldando dos deudas, condonar, deshacer, los 409, reemplazo de reparto, auth |

### Verificación en navegador real

Las pantallas se manejaron con Chrome (puppeteer) contra un usuario de prueba
con acceso concedido a `finanzas`, a 390px y a 1440px:

| Comprobación | Resultado |
|---|---|
| Las 5 pantallas renderizan sin error de consola | ✅ |
| Sin scroll horizontal en ninguna, a 390px | ✅ |
| La tab bar sigue con **4 pestañas** y el FAB centrado | ✅ |
| Compartidos aparece como 5ª entrada en la sidebar | ✅ |
| Bs 350 entre 4 → tres partes de 87.50 y tu parte 87.50 | ✅ |
| Un reparto que se pasa del gasto: rojo + guardar bloqueado con el motivo | ✅ |
| El reembolso se distingue del sueldo en la lista | ✅ |
| Home: bruto $64.66 con "real $16.18" debajo, y el panel "Te deben" | ✅ |

### Dos bugs encontrados al probarlo, no al escribirlo

**1. Volver de "Manual" a "Partes iguales" no recalculaba.** El guard de
recálculo se saltaba porque ni el total ni la cantidad de participantes habían
cambiado — que es exactamente el caso de "toqué los montos a mano y me
arrepentí". El usuario quedaba trabado sin forma de deshacer su propia edición.
Se arregló olvidando la última clave al salir del modo parejo.

**2. El cobro sugería Bs 112.47 cuando la deuda eran Bs 112.50.** Convertir a
USD y volver introduce centavos que no existen. Ahora, si las deudas ya están en
la moneda de la cuenta destino, se suman directo; el viaje por USD queda solo
para cuando las monedas difieren de verdad.

Ninguno de los dos lo habría visto una prueba automatizada de las que estaban
escritas: los dos son de interacción.

### Pendiente

| # | Prueba | Estado |
|---|---|---|
| 1 | Registrar Spotify repartido entre 3 en el iPhone real, en < 20 s | ⏳ manual |
| 2 | Que un gasto normal siga tardando < 10 s con el bloque presente | ⏳ manual |
| 3 | La tab bar y el vidrio en Safari iOS real | ⏳ manual |

La #2 es la que puede hundir el sprint sin que ninguna prueba se entere. El
bloque de reparto arranca colapsado y el foco sigue cayendo en el monto, así que
el camino corto no cambió — pero eso hay que sentirlo, no deducirlo.

### Nota sobre el usuario de prueba

Las suites `db` y `api` crean un usuario `@acerotest.local`, trabajan ahí y lo
borran, barriendo huérfanos antes de empezar. Un detalle que apareció al armar
la verificación de navegador: **`prevent_self_role_escalation` revierte
cualquier cambio de `role`, incluso con la service role key.** Para que un
usuario de prueba pueda abrir `/finanzas` hay que concederle `project_access`,
que además es el camino real por el que entra un usuario.

## 9. Qué desbloquea

| Sprint siguiente | Cómo se apoya en esto |
|---|---|
| **3 · Dinero por cobrar** | Reusa `flow_type='movimiento'` tal cual: cada cuota de los $957 es un `ingreso · movimiento`. Y hereda la regla de §4.5 — lo que te deben no es patrimonio. Solo agrega `fin_receivables` |
| **4 · Pasanaku** | El aporte mensual de 300 Bs es un `gasto · movimiento`… que este sprint **no** permite (§3.1 obliga a `gasto → consumo`). Ese es el único punto donde el Sprint 4 tiene que aflojar el check constraint, y ya se sabe cuál es |
| **6 · Reportes** | Puede confiar en `flow_type` para no mentir. Sin esta columna, todo reporte de ingresos habría nacido inflado por los reembolsos |
| **8 · Recurrentes** | `repartos_recientes` se convierte en plantillas de verdad: `fin_recurring` con `default_splits`. La forma del reparto ya está definida |
| **9 · ROI** | `fin_people` es la tabla donde van a colgar contrapartes de préstamos |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby permite **1 cron al día** y
ya está usado (`0 11 * * *`, cotizaciones). Este sprint **no agrega ninguno** —
los recordatorios de deuda son del Sprint 11 y van a tener que colgarse del cron
existente o dispararse al abrir la app, como ya hacen las tasas.
