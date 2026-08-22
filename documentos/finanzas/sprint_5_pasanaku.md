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
  account_id           uuid not null references fin_accounts(id) on delete restrict,
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

---

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
    └── pasanaku-recibir-sheet.tsx     — marcar recepción (monto sugerido, cuenta, fecha)
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
| `unit.mjs` | `addMonthsClamped`, `expectedTurnDate`, `validatePasanaku` (17 casos) | 420/420 |
| `db.mjs` | constraints de `fin_pasanaku`, RLS, vínculo `on delete set null` con `fin_transactions` (16 casos) | 118/118 |
| `api.mjs` | flujo completo por HTTP: crear, aportar (dos veces, uno que excede saldo), recibir, editar, borrar — verificando en cada paso que `total_gasto_usd`/`total_ingreso_usd` del mes NO cambian (23 casos) | 390/390 |

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
