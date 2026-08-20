-- Finanzas: cobrar con margen puede crear DOS movimientos — el reembolso
-- (flow_type movimiento) y la ganancia (flow_type consumo, cuenta como
-- ingreso real). `settled_tx_id` solo alcanza para uno.
--
-- `settled_tx_id` sigue siendo la señal de "esta deuda está cobrada" (nunca
-- cambia de significado: isOpen/debtState no se tocan). `settled_margin_tx_id`
-- es un puntero EXTRA al otro movimiento del mismo cobro, que solo existe
-- para que deshacer el cobro (`/debts/unsettle`) pueda borrar los dos, no
-- dejar uno huérfano contando como ingreso real de un cobro que ya no está.

alter table fin_debts
  add column if not exists settled_margin_tx_id uuid references fin_transactions(id) on delete set null;

-- No puede haber "movimiento de margen" sin el cobro principal que lo trajo.
alter table fin_debts add constraint fin_debts_margin_needs_settle
  check (settled_margin_tx_id is null or settled_tx_id is not null);

create index if not exists fin_debts_settled_margin_idx on fin_debts (settled_margin_tx_id);
