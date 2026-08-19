-- Finanzas · separar "deuda" de "compartido"
--
-- Corrección de un error de modelado del Sprint 2. Se habían mezclado dos
-- conceptos que en la vida real son distintos:
--
--   COMPARTIDO  responsabilidad RECURRENTE sobre un servicio (Spotify).
--               Todos ponen su parte, mes a mes. Es un atributo del FIJO.
--
--   DEUDA       alguien te debe plata, por lo que sea. Espontánea. Prestaste
--               efectivo, cubriste algo, te deben una cuota.
--
-- `fin_splits.transaction_id` era NOT NULL: una deuda no podía existir sin un
-- gasto que la originara. Eso obligaba a inventar un gasto padre para deudas
-- que no lo tienen — y es la razón por la que los $957 que le deben al usuario
-- necesitaban un sprint entero aparte.
--
-- Con el padre opcional, la deuda pasa a ser entidad de primera clase y ese
-- sprint deja de existir: los $957 son una deuda más.

alter table fin_splits rename to fin_debts;

-- El corazón del cambio: una deuda puede no venir de ningún gasto.
alter table fin_debts alter column transaction_id drop not null;

-- Los nombres de constraints e índices no se renombran solos al renombrar la
-- tabla. Hay que hacerlo a mano: PostgREST desambigua los embeds POR NOMBRE DE
-- CONSTRAINT — `fin_debts` apunta dos veces a `fin_transactions` (el gasto que
-- la originó y el cobro que la saldó) — así que dejarlos como `fin_splits_*`
-- sería una trampa esperando al próximo que lea el código.
alter table fin_debts rename constraint fin_splits_pkey                     to fin_debts_pkey;
alter table fin_debts rename constraint fin_splits_user_id_fkey             to fin_debts_user_id_fkey;
alter table fin_debts rename constraint fin_splits_transaction_id_fkey      to fin_debts_transaction_id_fkey;
alter table fin_debts rename constraint fin_splits_person_id_fkey           to fin_debts_person_id_fkey;
alter table fin_debts rename constraint fin_splits_settled_tx_id_fkey       to fin_debts_settled_tx_id_fkey;
alter table fin_debts rename constraint fin_splits_transaction_id_person_id_key
                                                                            to fin_debts_transaction_id_person_id_key;
alter table fin_debts rename constraint fin_split_settle_shape              to fin_debt_settle_shape;
alter table fin_debts rename constraint fin_splits_amount_check             to fin_debts_amount_check;
alter table fin_debts rename constraint fin_splits_currency_check           to fin_debts_currency_check;

alter index fin_splits_user_open_idx rename to fin_debts_user_open_idx;
alter index fin_splits_tx_idx        rename to fin_debts_tx_idx;
alter index fin_splits_person_idx    rename to fin_debts_person_idx;
alter index fin_splits_settled_idx   rename to fin_debts_settled_idx;

-- `unique (transaction_id, person_id)` con transaction_id nullable deja de
-- servir: en Postgres, NULL nunca es igual a NULL, así que N deudas sueltas de
-- la misma persona conviven sin chocar. Eso es exactamente lo que queremos —
-- Ana te puede deber tres cosas distintas. La regla "una sola parte por persona
-- por gasto" sigue valiendo solo cuando hay gasto, que es lo que el unique ya
-- hace por sí solo.

-- El motivo de la deuda cuando NO viene de un gasto. Con gasto padre, el
-- concepto lo da el gasto; sin él, hace falta poder escribirlo.
alter table fin_debts add column if not exists concept text;

-- La fecha en que nació la deuda. Con gasto padre se hereda de él; suelta, la
-- pone el usuario. Se guarda siempre para no tener que ramificar cada vez que
-- se calcula la antigüedad.
alter table fin_debts add column if not exists incurred_on date not null default current_date;

update fin_debts d
   set incurred_on = t.date
  from fin_transactions t
 where t.id = d.transaction_id
   and d.transaction_id is not null;

-- Una deuda suelta necesita decir de qué es; una con gasto padre no.
alter table fin_debts drop constraint if exists fin_debt_origin_shape;
alter table fin_debts add constraint fin_debt_origin_shape check (
  transaction_id is not null or (concept is not null and length(btrim(concept)) > 0)
);

create index if not exists fin_debts_user_incurred_idx on fin_debts (user_id, incurred_on desc);

-- ─── Policies ───────────────────────────────────────────────────────────────
-- Se recrean con el nombre nuevo: una policy llamada "propios repartos" sobre
-- una tabla de deudas es la misma trampa que los constraints.

drop policy if exists "fin: ver propios repartos"        on fin_debts;
drop policy if exists "fin: crear propios repartos"      on fin_debts;
drop policy if exists "fin: actualizar propios repartos" on fin_debts;
drop policy if exists "fin: borrar propios repartos"     on fin_debts;

create policy "fin: ver propias deudas" on fin_debts for select
  using (auth.uid() = user_id);
create policy "fin: crear propias deudas" on fin_debts for insert
  with check (auth.uid() = user_id);
create policy "fin: actualizar propias deudas" on fin_debts for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fin: borrar propias deudas" on fin_debts for delete
  using (auth.uid() = user_id);
