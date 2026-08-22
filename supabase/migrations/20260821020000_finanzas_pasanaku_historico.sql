-- Finanzas · Pasanaku: aportes de ANTES de empezar a usar la app.
--
-- Feedback del usuario: quiere dejar constancia de los aportes que ya pagó
-- antes de cargar el pasanaku acá, sin que eso mueva el saldo de ninguna
-- cuenta — esa plata ya salió en la vida real, antes de que la app supiera
-- de su existencia. Registrarlo como un `gasto` normal la restaría dos
-- veces: una en la vida real (ya reflejada en el saldo inicial de la
-- cuenta), otra en la app, al crear el movimiento.
--
-- Tabla nueva y separada de fin_transactions a propósito: no es un
-- movimiento de cuentas, es una anotación — cero impacto en
-- computeBalances() ni en Movimientos, cero riesgo sobre el cálculo de
-- saldos que ya existe. "Sin romper nada" tomado literal: ni una columna
-- tocada en fin_transactions ni en fin_accounts.

create table fin_pasanaku_historico (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- cascade: esta fila no tiene sentido sin su pasanaku — a diferencia de
  -- fin_transactions.pasanaku_id (on delete set null), acá no hay ninguna
  -- historia financiera real e independiente que preservar.
  pasanaku_id   uuid not null references fin_pasanaku(id) on delete cascade,
  date          date not null,
  amount        numeric(24,8) not null check (amount > 0),
  note          text,
  created_at    timestamptz not null default now()
);

create index on fin_pasanaku_historico (user_id, pasanaku_id);

alter table fin_pasanaku_historico enable row level security;

create policy "fin: ver propio historico de pasanaku" on fin_pasanaku_historico for select
  using (auth.uid() = user_id);
create policy "fin: crear propio historico de pasanaku" on fin_pasanaku_historico for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propio historico de pasanaku" on fin_pasanaku_historico for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propio historico de pasanaku" on fin_pasanaku_historico for delete
  using (auth.uid() = user_id);
