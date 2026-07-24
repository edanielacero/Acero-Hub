# Plan — Depósitos y Retiros de capital (Journal)

Feature nueva para sesiones tipo `journal`: permitir registrar movimientos de
capital (depósitos/retiros) sin que afecten el % de rentabilidad generado por
los trades.

## Problema que resuelve

Hoy el capital y la rentabilidad del journal se derivan así (`BasicMetrics`,
`app/trading-journal/[sessionId]/page.tsx:850-859`):

```js
returnPct = ((last.capital_end - capitalInitial) / capitalInitial) * 100
```

Esto compara directamente el `capital_end` del último trade contra el
`capital_initial` de la sesión. Si el usuario deposita o retira dinero, ese
monto queda mezclado dentro de `capital_end` del siguiente trade y distorsiona
el % de rentabilidad — un depósito infla el resultado, un retiro lo castiga,
aunque los trades no hayan cambiado.

## Principio de diseño

Separar dos conceptos que hoy están fusionados en un solo número
(`capital_end`):

- **Rentabilidad de trading** → depende solo de los resultados de los trades.
- **Capital actual (caja)** → depende de los trades *y* de los movimientos de
  capital.

```
Rentabilidad %  = Σ(pnl_usd de los trades) / capital_inicial × 100
Capital actual  = capital_inicial + Σ(pnl_usd) + Σ(depósitos) − Σ(retiros)
```

Con esto, un depósito/retiro mueve el "Capital actual" pero nunca la
"Rentabilidad %".

## 1. Modelo de datos

Nueva tabla `tj_capital_transactions` (sigue el patrón de `tj_trades` /
`tj_share_invitations` en `documento_maestro_trading.md`):

```sql
id           uuid PK
session_id   uuid FK → tj_sessions(id) ON DELETE CASCADE
type         text not null        -- 'deposit' | 'withdrawal'
amount       numeric not null     -- siempre positivo; el signo lo da `type`
date         timestamptz not null
note         text
created_at   timestamptz default now()
```

Migración: `supabase/migrations/<timestamp>_trading_journal_capital_transactions.sql`

```sql
CREATE TABLE IF NOT EXISTS public.tj_capital_transactions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.tj_sessions(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount     numeric NOT NULL CHECK (amount > 0),
  date       timestamptz NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tj_capital_transactions_session_idx
  ON public.tj_capital_transactions (session_id, date);
```

Por qué tabla separada y no un "trade falso": evita ensuciar la lógica de
import/export CSV, los filtros de trades, y los cálculos de winrate/RR que
asumen `direction`/`result`. Un depósito no es un trade.

## 2. Backend

### `GET /api/trading-journal/sessions/[id]/route.ts` (o el trades route)
Incluir `capitalTransactions` en la respuesta de la sesión, junto a `trades`,
para que el frontend pueda mezclarlos cronológicamente.

### `POST /api/trading-journal/sessions/[id]/capital-transactions/route.ts` (nuevo)
- Valida `type`, `amount > 0`, `date`.
- Si `type === 'withdrawal'`: calcula el capital actual **a la fecha del
  retiro** (capital_initial + pnl acumulado + depósitos − retiros, todo hasta
  esa fecha) y rechaza con 400 si `amount` lo deja negativo.
- Inserta en `tj_capital_transactions`.

### `DELETE /api/trading-journal/capital-transactions/[id]/route.ts` (nuevo)
Por si el usuario se equivoca al registrar un movimiento — permite borrarlo
(con el mismo chequeo de ownership que el resto de rutas).

## 3. Cálculo de capital actual y rentabilidad

Nueva función compartida (ej. `lib/trading/capital.ts`) que:

1. Toma `trades` + `capitalTransactions` de una sesión journal.
2. Los ordena cronológicamente por fecha (trade.date_exit ?? date_entry, o
   transaction.date).
3. Recorre la línea de tiempo acumulando `capital_actual` trade por trade y
   movimiento por movimiento.
4. Devuelve:
   - `capitalActual` (último valor acumulado)
   - `rentabilidadPct = Σ(pnl_usd) / capital_initial × 100` (sin tocar
     depósitos/retiros)

Esto reemplaza el cálculo actual en `BasicMetrics` (líneas 850-859) y también
alimenta el prefill de "Capital antes del trade" en `SyncModal`
(`page.tsx:1104` en adelante) — ese prefill hoy usa el `capital_end` del
último trade o el `capital_initial`; con esta feature debe usar
`capitalActual` (que ya incluye movimientos posteriores al último trade).

## 4. Frontend

### Botones
En la vista de sesión `journal` (junto a las tarjetas de capital, línea
~1019-1051), agregar dos botones: **"+ Depósito"** y **"− Retiro"**.

### Modal (`DepositWithdrawalModal`, mismo patrón que `SyncModal`/`BottomSheet`)
Campos: monto, fecha (default hoy), nota opcional. Botón "Guardar depósito" /
"Guardar retiro" según el tipo. Si el backend rechaza el retiro por capital
insuficiente, mostrar el error inline.

### Historial de trades
Los movimientos se insertan como filas especiales, intercaladas por fecha
junto a los trades, visualmente distintas (sin winrate/RR/dirección):

```
↑ Depósito   +$500.00   12/07/2026   "aporte extra"
↓ Retiro     −$200.00   15/07/2026
```

### Tarjetas de stats
"Capital Inicial" se mantiene igual. "Capital Actual" y "Rentabilidad %" pasan
a usar la función compartida del punto 3.

## 5. Fuera de alcance (por ahora)

- Sesiones `backtesting` no tienen depósitos/retiros (no representan una
  cuenta real).
- Sesiones espejo (`is_read_only`, múltiples journals fusionados) — decidir
  después si se combinan los movimientos de todas las fuentes o se ocultan.
- Edición de un movimiento existente (solo crear/borrar por ahora).

## 6. Orden de implementación sugerido

1. Migración SQL (`tj_capital_transactions`).
2. `lib/trading/capital.ts` con la función de cálculo compartida.
3. Endpoints POST/DELETE de capital-transactions + incluir en el GET de sesión.
4. Actualizar `BasicMetrics` y el prefill de `SyncModal` para usar la función
   compartida.
5. UI: botones + modal + filas en el historial.
