-- `fin_tx_transfer_shape` (20260826080000) exigía `to_account_id is not null`
-- para CUALQUIER `transferencia` — cierto hasta ahora, porque las dos puntas
-- siempre vivían en el mismo perfil. La pata que SALE de una transferencia
-- entre perfiles (20260908000000) no puede tener `to_account_id`: apuntaría a
-- una cuenta de OTRO perfil, y el FK compuesto `fin_tx_to_account_same_profile`
-- lo impide. Su destino real está en `linked_tx_id`, solo que en otra fila.
--
-- Se abre una tercera forma válida en vez de aflojar la que ya existía: sigue
-- siendo imposible guardar una transferencia común sin destino.

alter table fin_transactions
  drop constraint if exists fin_tx_transfer_shape;
alter table fin_transactions
  add constraint fin_tx_transfer_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and category_id is null
      and (
        to_account_id <> account_id
        or (savings_flow is not distinct from 'aporte' and to_amount is null)
      ))
    or
    (type = 'transferencia'
      and to_account_id is null
      and category_id is null
      and linked_tx_id is not null)
    or
    (type in ('gasto','ingreso')
      and to_account_id is null
      and to_amount is null)
  );
