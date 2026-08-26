# Finanzas — Sprint 5: "Pasanaku"

> Contexto financiero y de producto: ver `contexto_finanzas.md` en esta misma
> carpeta. Este documento especifica **únicamente el Sprint 5**.
>
> Última actualización: 2026-08-21 · Estado: **construido**, pendiente de
> verificación visual en navegador (§7)

---

## 0. Cambio de alcance — 2026-08-21

El roadmap original (`contexto_finanzas.md` §4) preveía un "modelo completo:
participantes, rondas, turno, fechas esperadas" — el pasanaku entero, con
quién está en el grupo y cuándo le toca a cada uno.

**Se recortó a un tracker personal.** El usuario decidió que no quiere
modelar el grupo — ni participantes, ni turnos ajenos, ni rondas de otra
gente. Solo su propio lado:

- Cuánto aporta cada mes.
- Cuántos puestos tiene la ronda en total.
- Cuál es su puesto.
- Cuándo le toca recibir (**derivado**, nunca se pregunta directamente).
- Poder marcar que ya recibió, y poder cargar los aportes que ya dio.

Esto convirtió un sprint de varias tablas (`fin_pasanaku_participants`,
`fin_pasanaku_rounds`…) en una sola tabla chica y dos rutas de registro. El
bloqueo técnico que los Sprints 2 y 3 habían anotado —`fin_tx_flow_shape` no
permitía `gasto · movimiento`— ya no aplica: se relajó como efecto colateral
de la Feature 11 (`20260819070000_finanzas_flow_shape_inversion.sql`).

---

## 1. Objetivo del sprint

> **Registrar lo que aporto al pasanaku sin que ensucie mi gasto del mes, y
> saber cuándo me toca recibir sin tener que hacer la cuenta a mano.**

### Definición de "terminado"

- [x] Puedo crear un pasanaku: nombre, cuenta, aporte mensual, puestos
      totales, mi puesto, fecha del primer aporte
- [x] La app calcula sola cuándo me toca recibir
- [x] Puedo registrar un aporte (de hoy o de un mes anterior que ya di)
- [x] El aporte baja el saldo de la cuenta pero **no** cuenta como gasto real
      del mes
- [x] Puedo marcar que recibí mi turno — es un ingreso real, no un checkbox
      suelto
- [x] Esa recepción tampoco ensucia el ingreso real del mes
- [x] Aparece en Movimientos como cualquier otro movimiento de plata
- [x] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Pasanaku** | Nombre, cuenta, aporte mensual, puestos totales, mi puesto, fecha de inicio |
| **Turno** | Derivado: `start_date` + `(my_slot − 1)` meses. Nunca se guarda |
| **Aportes** | Se registran contra el pasanaku, uno por uno, con fecha editable (backfill) |
| **Recepción** | Un ingreso real por el pozo sugerido (puestos × aporte), editable |
| **Navegación** | Card en "Más" (mobile) / link directo en la sidebar (desktop) — mismo patrón que Deudas |

### No entra (y por qué)

| Fuera | Razón |
|---|---|
| Participantes del grupo | Decisión explícita del 2026-08-21: es un tracker personal |
| Rondas de otra gente / a quién le toca después | Mismo motivo — no se modela el grupo |
| Recordatorio automático del aporte mensual | Podría vivir en Fijos (`fin_recurring`) más adelante si hace falta; no es parte de este sprint |
| Tipo de cambio especial para el pasanaku | Pregunta abierta #3 de `contexto_finanzas.md` queda resuelta *de hecho*: usa el mismo mecanismo de tasa congelada que cualquier transacción en Bs — no hace falta una decisión aparte |

---

## 3. Modelo de datos

Una tabla nueva y una columna en `fin_transactions`. Migración:
`supabase/migrations/20260821000000_finanzas_pasanaku.sql`, aplicada con
Supabase CLI.

### 3.1 `fin_pasanaku`

```sql
create table fin_pasanaku (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null default 'Pasanaku',
  account_id           uuid references fin_accounts(id) on delete restrict,
  currency             text not null default 'USD' check (currency in ('USD','BOB','USDT','USDC','BTC')),
  contribution_amount  numeric(24,8) not null check (contribution_amount > 0),
  total_slots          integer not null check (total_slots > 1),
  my_slot              integer not null check (my_slot >= 1),
  start_date           date not null,
  archived             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint fin_pasanaku_slot_shape check (my_slot <= total_slots)
);
```

`contribution_amount` es un **default editable**, no una ley — mismo trato
que `fin_recurring.amount`: se puede pisar al registrar cada aporte.

**Corrección del 2026-08-21, mismo día:** la primera versión tenía
`account_id not null` — el usuario probó la app y señaló que un pasanaku es
"un monto en una moneda", igual que un fijo: la cuenta se elige al aportar o
recibir, no al crear. Se corrigió con
`20260821010000_finanzas_pasanaku_cuenta_opcional.sql`, calcado de
`20260820000000_finanzas_fijos_moneda_cuenta_opcional.sql` (la misma
corrección que ya había pasado `fin_recurring`): `account_id` pasa a
nullable y se agrega `currency` como campo independiente — sin él no hay
decimales (BTC usa 8) ni label que mostrar en "Aporte por mes" mientras
todavía no hay cuenta elegida. `PasanakuSheet` (crear/editar) ya no pide
cuenta, solo moneda; `PasanakuAporteSheet`/`PasanakuRecibirSheet` la piden
recién ahí, con `account_id` guardado en cada movimiento como sugerencia
para la próxima vez — no en el pasanaku.

### 3.2 El vínculo con `fin_transactions`

```sql
alter table fin_transactions
  add column if not exists pasanaku_id uuid references fin_pasanaku(id) on delete set null;
```

Cada aporte y la recepción son filas **normales** de `fin_transactions` con
este puntero — no hay tipos de transacción nuevos (`aporte_pasanaku` /
`recepcion_pasanaku`, previstos en el plan original, quedaron descartados:
innecesarios con el alcance recortado). `set null`: borrar el pasanaku no
borra el historial de lo aportado, solo el vínculo — mismo trato que
`recurring_id` (Sprint 3).

### 3.3 RLS

`enable row level security` + 4 policies (select/insert/update/delete,
`user_id = auth.uid()`), sin excepciones — misma regla que toda tabla nueva
del Hub.

---

## 4. Reglas de negocio

### 4.1 "¿Se marcan como gasto?" — sí, pero no como consumo

Ya estaba resuelto en `contexto_finanzas.md` §3.1: un aporte al pasanaku es
un **movimiento financiero**, no un **gasto real**. En términos del modelo:

- Aporte → `type: 'gasto'`, `flow_type: 'movimiento'`.
- Recepción → `type: 'ingreso'`, `flow_type: 'movimiento'`.

`flow_type: 'movimiento'` es lo que ya excluye una fila de
`total_gasto_usd`/`total_ingreso_usd` (`lib/finanzas/transactions.ts`,
`isConsumo`) — el mismo mecanismo que usan transferencias, reembolsos y
ajustes de cuentas de inversión. No hizo falta tocar esa lógica.

### 4.2 Cuándo te toca recibir — derivado, nunca guardado

```
expectedTurnDate(p) = addMonthsClamped(p.start_date, p.my_slot - 1)
```

Puesto 1 recibe en `start_date`; puesto 4, tres meses después. El día se
topa contra el largo real del mes destino (un inicio el 31 de enero con
puesto 2 cae el 28 de febrero) — mismo criterio que `periodOf` en
`lib/finanzas/recurring.ts`. Vive en `lib/finanzas/pasanaku.ts`.

### 4.3 "Marcar con verificación que recibí" — es el ingreso mismo

No hay un booleano `received` guardado. `loadPasanaku` deriva:

```
received     = existe un 'ingreso' con este pasanaku_id
received_at  = la fecha del más reciente, si hay más de uno
```

Registrar la recepción **es** la verificación — no hay un flag aparte que se
pueda desincronizar de si de verdad entró la plata. Mismo principio que el
estado de los fijos (Sprint 3) y de las deudas (Sprint 2): un puntero o una
existencia, nunca un flag persistido.

Es repetible a propósito: si el pasanaku sigue rotando después de tu turno y
volvés a recibir en una vuelta futura, se registra otra recepción — la lista
muestra la más reciente.

### 4.4 El aporte respeta el saldo; la recepción no lo topea

Un aporte es un `gasto` normal: no puede dejar la cuenta en negativo (misma
regla de `assertBalance` que cualquier otro gasto). Una recepción es un
`ingreso`: nunca se topea, igual que cualquier otro ingreso.

### 4.5 La cuenta del pasanaku es un default, no una ley

`fin_pasanaku.account_id` fija la cuenta **sugerida** — la que precarga el
selector al abrir "Registrar aporte" o "Recibí mi turno" — pero cada
movimiento guarda su propio `account_id` en `fin_transactions`, igual que
`fin_recurring.amount` es un default editable y no el monto real de cada
mes (Sprint 3). Podés aportar un mes en efectivo y el siguiente desde el
banco sin que eso afecte a los aportes ya registrados: cada fila es
independiente. Mismo patrón de chips que "Sale de" en `RegisterSheet`
(Fijos), con las cuentas de inversión afuera del picker por la razón del
§4.1 de más arriba — y rechazadas también del lado del server en las 4
rutas (`POST /pasanaku`, `PATCH /pasanaku/[id]`, `/aporte`, `/recibir`),
no solo en la UI.

### 4.6 Aportes de antes de la app — un registro, nunca un movimiento

**Feedback del usuario, mismo día:** al cargar un pasanaku que ya venía de
antes (con `start_date` de varios meses atrás), los aportes que ya pagó en
la vida real no se pueden cargar como un `gasto` normal — esa plata ya
salió, y el saldo inicial de la cuenta ya la refleja. Registrarla de nuevo
la restaría dos veces.

Tabla nueva y completamente separada, `fin_pasanaku_historico`
(`20260821020000_finanzas_pasanaku_historico.sql`): **cero cambios** en
`fin_transactions`, `fin_accounts` o `computeBalances()`. Una fila acá es
una anotación (fecha, monto, nota opcional) sin cuenta, sin conversión
congelada y sin ningún efecto sobre ningún saldo — nunca aparece en
Movimientos.

- `POST /api/finanzas/pasanaku/[id]/historico` — crea la anotación.
- `DELETE /api/finanzas/pasanaku/historico/[id]` — la borra. Como nunca
  tocó un saldo, no hay nada que compensar al borrar.
- `on delete cascade` (no `set null`, a diferencia de `pasanaku_id` en
  `fin_transactions`): esta fila no tiene ningún sentido fuera de su
  pasanaku, así que borrar el pasanaku se lleva su histórico entero.
- `loadPasanaku` suma estas filas a `aportes_count`/`total_aportado` junto
  con los aportes reales — directo, sin convertir nada: ya nacen en la
  moneda del pasanaku (§4.7 de más abajo explica por qué `total_aportado`
  no es en USD).
- En `PasanakuAporteSheet` había un toggle **"Ya lo pagué antes de usar la
  app"** que cambiaba el sheet entero a este modo (sin selector de cuenta,
  sin tope de saldo). **Se sacó el 2026-08-26** (§4.10): todo aporte que se
  registra hoy mueve plata de una cuenta real. Los históricos que ya
  existen se siguen listando —y borrando de a uno— en el detalle del
  pasanaku, y `POST .../historico` sigue en pie para ellos; lo único que
  desapareció es la forma de crear uno nuevo desde la UI.

### 4.7 `total_aportado` va en la moneda del pasanaku, no en USD

**Feedback del usuario, mismo día:** el total aportado tiene que verse en
la moneda en la que se creó el pasanaku — un solo número, no un USD que
además mezclaba los aportes de varios pasanaku distintos en un panel
agregado arriba de la lista (ese panel se sacó entero).

`PasanakuWithState.total_aportado` reemplaza a `total_aportado_usd`:

- Un aporte cuya cuenta ya está en `Pasanaku.currency` suma su `amount`
  **tal cual** — cero conversión, cero redondeo de por medio.
- Un aporte de una cuenta en otra moneda (el caso cross-currency de §4.5)
  se convierte con la tasa de **hoy** vía `crossCurrencySuggestion` — acá
  sí hay un redondeo inevitable, el mismo que ya se ve al elegir esa
  cuenta en el sheet.
- Los históricos (§4.6) ya nacen en `Pasanaku.currency` — jamás pasan por
  ninguna conversión.

Se muestra en la fila de la lista (`N aportes · 900 Bs`) y en el detalle
(`Total aportado: 900 Bs`) — un solo lugar, un solo número, en la moneda
que el usuario ya está pensando.

### 4.8 Cards + lista de cobro por jugador (revisión del 2026-08-21)

**Feedback del usuario:** el total aportado seguía sin verse bien, y pidió
además una forma de ir marcando, cuando le toca el turno, que cada uno de
los demás jugadores le va pagando su parte — sin nombres (decisión
explícita: "anónimo" alcanza), pero que cada marca sea un cobro real, no
solo una lista de control aparte.

**La lista de Pasanaku pasa de filas a cards** (`app/finanzas/screens/
pasanaku.tsx`, componente `Card`): cada pasanaku es un `<Panel>` con el
total aportado grande arriba, el próximo aporte (`next_aporte_due`, día del
mes de `start_date`, la próxima vez que cae — `nextAporteDue()` en
`lib/finanzas/pasanaku.ts`), el turno, un botón "Aportar" siempre visible, y
— solo cuando `expected_turn <= hoy` — una sección desplegable "Lista de
cobro".

**Un cobro es un `ingreso · movimiento` real, uno por jugador:**
`POST /api/finanzas/pasanaku/[id]/recibir` (la ruta no cambió de nombre,
pero sí de propósito — cambió también el componente que la llama, ahora
`PasanakuCobroSheet` en vez de `PasanakuRecibirSheet`) ya no sugiere el pozo
entero (`contribution_amount × total_slots`): sugiere la parte de **un**
jugador (`contribution_amount`), y se abre una vez por cada uno de los
demás puestos que van pagando.

`received` cambia de significado — antes bastaba con que existiera un
`ingreso`, ahora hace falta juntar la parte de todos:

```
collection_target  = contribution_amount × (total_slots − 1)   // la tuya no se la "cobrás" a vos mismo
collected_amount   = Σ cobros, convertidos a Pasanaku.currency con la tasa de hoy si hace falta
received           = collected_amount >= collection_target
```

Ambos derivados, nunca guardados — mismo principio que todo lo demás en
esta app. `PasanakuWithState.cobros: PasanakuCobro[]` expone la lista para
poder mostrarla (con fecha y monto) y borrar uno de a uno — el borrado usa
`DELETE /api/finanzas/transactions/[id]`, la ruta genérica que ya existía;
no hizo falta ninguna ruta nueva para esto. Borrar un cobro simplemente
resta de `collected_amount`, y si eso lo deja por debajo del objetivo,
`received` vuelve solo a `false` — es un cálculo, no un flag que alguien
tenga que acordarse de destildar.

### 4.9 Barra de progreso "hasta que te toque" (2026-08-22)

**Pedido del usuario:** una barra en la card que muestre cuántas rondas ya
pasaron camino a tu turno, no solo la fecha.

`currentRound(start_date, hoy)` en `lib/finanzas/pasanaku.ts` — misma
familia que `nextAporteDue`, mismo cálculo de meses transcurridos, pero
devuelve el número de ronda (1 = `start_date`) en vez de una fecha. Es una
aproximación por **mes calendario**, no un conteo de aportes realmente
registrados — igual que `next_aporte_due` tampoco mira si vos en particular
ya cargaste el tuyo ese mes.

La card muestra `current_round / my_slot` como barra solo mientras
`!received && !tuTurnoLlego` — en cuanto la ronda te alcanza, la barra que
importa pasa a ser la de "Lista de cobro" (§4.8), así que esta desaparece
para no mostrar dos barras compitiendo por atención.

### 4.10 Tabla de meses del ciclo + fuera el toggle histórico (2026-08-26)

**Pedido del usuario:** (1) sacar del sheet de aporte la opción "Ya lo
pagué antes de usar la app"; (2) ver en el detalle del pasanaku qué meses
ya aportó y cuáles quedan pendientes hasta cerrar el ciclo, con un check en
los que ya están.

`pasanakuRounds(p, aportes)` en `lib/finanzas/pasanaku.ts` arma el ciclo
entero: una fila por puesto (`total_slots`), desde `start_date`, con el mes
(`'2026-08'`), si está pagado, cuánto y si esa ronda es la tuya
(`my_slot`). Reglas:

- Un aporte cuenta para el mes de **su fecha**, no para el mes en que se
  cargó — cargar hoy el de junio marca junio. Mismo criterio que el resto
  de la mini-app, donde la fecha del movimiento manda.
- Dos aportes del mismo mes se suman en la misma fila.
- Un aporte fuera del ciclo (anterior al inicio o posterior a la última
  ronda) no aparece: la tabla contesta "¿me falta algún mes?", no es el
  historial completo.
- Los meses se cuentan sobre enteros de año/mes, nunca sumando días a un
  `Date` — por lo mismo que explica `lastMonths` en `transactions.ts`.

Para poder mirar mes a mes hacía falta la lista de aportes, no solo el
total: `PasanakuWithState.aportes` (`PasanakuAporte[]`) trae cada aporte
real con su `amount`/`currency` de `fin_transactions` **y**
`amount_in_currency`, el mismo aporte llevado a `Pasanaku.currency` con la
tasa de hoy. La conversión se resuelve en `loadPasanaku`, donde ya están
las tasas, así que el detalle suma aportes de cuentas en distintas monedas
sin volver a convertir nada en el cliente. La tabla mezcla estos aportes
con los históricos (§4.6): para "¿me falta algún mes?" da lo mismo de dónde
salió la plata.

Cada fila pendiente se etiqueta sola según el mes: **Atrasado** (en rojo)
si ya pasó, **Este mes** si es el corriente, **Pendiente** si todavía no
llegó.

### 4.11 "Aportar" bloqueado hasta el día del aporte (2026-08-26)

**Pedido del usuario:** si todavía no es fecha de aportar, el botón
**Aportar** de la card tiene que estar bloqueado; se habilita recién cuando
llega la fecha.

`canAportar(start_date, rounds, hoy)` en `lib/finanzas/pasanaku.ts`:

- Se habilita desde `currentAporteDue(start_date, hoy)` — el mismo día del
  mes que `start_date`, **en el mes corriente**. Es una función aparte de
  `nextAporteDue` justamente porque esta NO salta al mes siguiente cuando
  el día ya pasó: si saltara, el botón se habilitaría un solo día por mes.
- **Excepción, los meses atrasados:** si `rounds` (§4.10) tiene una ronda
  anterior al mes corriente sin aportar, se puede aportar en cualquier
  momento. Sin esto, saltarse un mes dejaba la deuda trabada hasta que
  cayera el día del mes siguiente — justo al revés de lo que hace falta.
- El mes corriente sin aportar no cuenta como atraso antes de su día: si
  contara, la regla no bloquearía nunca nada.

Bloqueado, la card muestra "Se habilita el 5 de septiembre" debajo del
botón. El bloqueo es solo de UI: `POST .../aporte` sigue aceptando
cualquier fecha, porque la fecha del movimiento se elige a mano en el sheet
y cargar un mes viejo es un caso legítimo.

### 4.12 Tu mes: la acción principal pasa a ser cobrar (2026-08-26)

**Pedido del usuario:** el mes que le toca recibir, el botón de la card
tendría que cambiar y decir **"Registrar pagos recibidos"** — ahí registra
los pagos que le van haciendo los demás participantes.

En la card, con `toCobrar = tuTurnoLlego && !received`:

- El botón primario pasa a ser **"Registrar pagos recibidos"** (abre
  `<PasanakuCobroSheet>`, que ya registraba **un** pago por vez y muestra
  "3 de 9 jugadores ya te pagaron · faltan 6").
- Dura hasta cobrarle a todos, no solo el mes del turno: al que se atrasa
  se le sigue cobrando después, y `received` se deriva de que
  `collected_amount` alcance `collection_target` (§4.8).
- **"Aportar" no desaparece, baja a secundario** (`variant="soft"`). Tu
  parte la seguís poniendo ese mes igual que cualquier otro —por eso
  `collection_target` es la parte de los OTROS (§4.8)— y las rondas
  posteriores a tu turno también son tuyas. Si el botón desapareciera, esos
  meses quedarían imposibles de registrar y su fila de la tabla (§4.10) no
  se marcaría nunca.
- El "Registrar cobro" que vivía dentro del desplegable ahora aparece solo
  cuando `!toCobrar`: mientras el botón grande hace lo mismo, sobra. Queda
  para después — corregir o sumar un pago tardío sobre un pasanaku que ya
  figuraba cobrado del todo.
- En la tabla de meses del detalle (§4.10), la fila de tu turno suma abajo
  "3 de 9 pagos recibidos": ese mes tiene dos cosas que mirar, tu aporte (el
  check de la fila) y lo que te tienen que pagar.

Pasada de vocabulario, para que el botón y lo que abre hablen igual: el
sheet se llama **"Pago recibido"** y su submit "Registrar pago recibido"; el
desplegable de la card, "Pagos recibidos · 3 de 9"; el confirm de borrado,
"Borrar pago recibido". En el código y la API sigue siendo `cobros` /
`POST .../recibir` — no se tocó ni un contrato.

---

## 4.99 Actualizaciones posteriores

### El piso de ahorro alcanza al aporte (Sprint 7, 2026-08-26)

`POST /pasanaku/[id]/aporte` pasa por `assertBalance`, así que desde el Sprint 7
**un aporte no puede comerse lo apartado en ahorros** de la cuenta elegida
(§4.4.1 del documento maestro). Si el saldo libre no alcanza, se rechaza
nombrando lo apartado.

`<PasanakuAporteSheet>` muestra el mismo `disponible` que aplica el servidor
—saldo menos apartado— con *"· X en ahorros"* al lado.

**Recibir el turno no se ve afectado**: es plata que **entra**, y
`consumesBalance` deja los ingresos fuera del control de saldo. Lo mismo vale
para cobrar una cuota de deuda. Hay una regresión que lo prueba en
`probe.mjs` §AQ, que verifica los dos casos en una cuenta cuyo saldo está 100%
apartado.

### Cualquier cuenta sirve para un pasanaku

Entre el 24 y el 26 de agosto existió un flag `is_savings` en las cuentas y el
pasanaku las excluía. El flag se eliminó: una cuenta que aloja ahorros es una
cuenta normal y **sí puede usarse** para un pasanaku. La única exclusión que
sigue viva es la de **cuentas de inversión** (§4), y por la razón de siempre: un
aporte ahí sería indistinguible de un ajuste de valor.

## 5. Estructura de archivos

```
lib/finanzas/
├── pasanaku.ts                        — addMonthsClamped, expectedTurnDate, validatePasanaku
├── types.ts                           — Pasanaku, PasanakuInput, PasanakuWithState + Transaction.pasanaku_id
└── load.ts                            — loadPasanaku (agrega TX_COLS: pasanaku_id)

app/api/finanzas/pasanaku/
├── route.ts                           — GET lista · POST crear
├── [id]/route.ts                      — PATCH · DELETE (no restrict: pasanaku_id es on delete set null)
├── [id]/aporte/route.ts               — POST registrar un aporte
└── [id]/recibir/route.ts              — POST marcar recepción

app/finanzas/
├── screens/pasanaku.tsx               — lista + resumen + acciones
└── components/
    ├── pasanaku-sheet.tsx             — crear/editar + borrar
    ├── pasanaku-aporte-sheet.tsx      — registrar un aporte (monto, cuenta, fecha, disponible/MAX)
    └── pasanaku-cobro-sheet.tsx       — registrar UN cobro de tu turno (monto sugerido, cuenta, fecha)
```

### 5.1 Navegación — sin tab nueva

Se agregó una entrada a `NAV_ITEMS` (`nav-items.tsx`) **sin** `tab: true` —
mismo patrón que Deudas:

| | Mobile | Desktop |
|---|---|---|
| Dónde aparece | Card en "Más" (`MORE_ITEMS` la incluye sola, por no tener `tab: true`) | Link directo en la sidebar (`Sidebar` renderiza `NAV_ITEMS` completo, no `TAB_ITEMS`) |
| Por qué | El tab bar tiene 4 slots fijos + "Más"; no hay espacio para un quinto ícono | La sidebar no tiene ese límite — todo entra vertical |

Cero lógica nueva: es la misma mecánica que ya resolvía Deudas y Ajustes.

### 5.2 `tx-row.tsx` — un aporte/recepción se identifica en Movimientos

`esPasanaku = !isTransfer && !!tx.pasanaku_id` se suma a las ramas que ya
distinguían `isInversion`/`isReembolso` (ambas comparten `flow_type:
'movimiento'` con causas distintas). Ícono propio (`IconRotateClockwise2`),
subtítulo "Pasanaku · aporte" / "Pasanaku · recepción", y una nota en el
detalle ("No cuenta como gasto/ingreso real del mes") — mismo tratamiento que
ya tenían inversión y reembolso.

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin sesión, nunca
`createAdminClient()`.

### `GET` / `POST /api/finanzas/pasanaku`
`POST` body: `{ name, account_id, contribution_amount, total_slots, my_slot, start_date }`.
Rechaza `total_slots <= 1`, `my_slot < 1` o `my_slot > total_slots`,
`contribution_amount <= 0`, cuenta inexistente.

### `PATCH` / `DELETE /api/finanzas/pasanaku/[id]`
`PATCH` acepta cualquier subconjunto de los campos de arriba más `archived`.
`DELETE` es un borrado real — no hace falta "restrict + archivar" como en
Cuentas: `pasanaku_id` es `on delete set null`, así que nada queda huérfano
de un modo que rompa algo.

### `POST /api/finanzas/pasanaku/[id]/aporte`
Body: `{ amount?, date?, account_id?, description? }`. Default de `amount`:
`contribution_amount` de la plantilla. Default de `account_id`: la cuenta del
pasanaku. Repetible sin límite — a diferencia de un fijo, no hay control de
"ya registraste este período".

### `POST /api/finanzas/pasanaku/[id]/recibir`
Body: `{ amount?, date?, account_id?, description? }`. Default de `amount`:
`contribution_amount × total_slots` (el pozo completo), redondeado a la
precisión de la moneda.

---

## 7. Verificación

`npm run build` y `npx tsc --noEmit` limpios. Las tres suites de
`tests/finanzas/` en verde:

| Suite | Nuevo en este sprint | Total |
|---|---|---|
| `unit.mjs` | `addMonthsClamped`, `expectedTurnDate`, `validatePasanaku`, `crossCurrencySuggestion` | 425/425 |
| `db.mjs` | constraints de `fin_pasanaku` (cuenta opcional, moneda con default), RLS, vínculo `on delete set null` con `fin_transactions` | 123/123 |
| `api.mjs` | flujo completo por HTTP sin cuenta al crear: aportar/recibir a cuentas distintas, conversión real de moneda (incluida la sugerida por el server cuando no viene `amount` explícito), cuentas de inversión rechazadas en las 4 rutas, `DELETE /accounts` y `PATCH .../is_investment` protegidos | 410/410 |

**Pendiente: verificación visual en navegador.** Se intentó automatizar con
un usuario de prueba temporal (mismo patrón `@acerotest.local` que ya usan
`db.mjs`/`api.mjs`) promovido a `role: 'admin'` para pasar el gate de acceso
de la mini-app. El intento reveló que `trg_prevent_self_role_escalation`
(`20260630000000_prevent_self_role_escalation.sql`) revierte **cualquier**
cambio a `profiles.role` — incluso vía `service_role` key — porque el trigger
corre para toda `UPDATE` sin importar si RLS está activo, y `auth.uid()` da
`NULL` con esa key. Forzarlo requería deshabilitar el trigger, aunque sea
brevemente, sobre una tabla de seguridad en producción — se prefirió no
hacerlo sin permiso explícito. El usuario de prueba se creó, se usó y se
borró sin dejar rastro (perfil temporal `@acerotest.local`, limpiado al
final). Queda pendiente probar `/finanzas/pasanaku` a mano o autorizar el
toggle del trigger para una corrida de verificación.
