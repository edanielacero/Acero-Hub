-- Finanzas · que una transferencia no pueda nacer mal clasificada.
--
-- La migración anterior dejó un footgun: el default de `flow_type` es
-- 'consumo', pero `fin_tx_flow_shape` exige que una transferencia sea
-- 'movimiento'. Insertar una transferencia sin setear la columna a mano falla
-- con un error de constraint ilegible — y va a fallar igual en cada sprint
-- futuro que escriba movimientos.
--
-- Que una transferencia sea un movimiento financiero no es una decisión del
-- que escribe: es una propiedad del dato. Así que lo deriva la base, y el
-- check queda solo para lo que sí es una decisión (que un `ingreso` sea
-- reembolso o plata ganada, y que si es reembolso no lleve categoría).

create or replace function fin_normalize_flow_type()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'transferencia' then
    new.flow_type := 'movimiento';
  end if;
  return new;
end;
$$;

drop trigger if exists fin_tx_flow_type on fin_transactions;
create trigger fin_tx_flow_type
  before insert or update on fin_transactions
  for each row execute function fin_normalize_flow_type();
