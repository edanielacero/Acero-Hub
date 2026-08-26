-- Finanzas · Sprint 7 (Ronda 9): guardar sin mover de cuenta.
--
-- Al ahorrar, lo normal es que la plata ya esté donde tiene que estar: lo que
-- cambia no es de banco, es que pasa a estar apartada. Eso se registra como
-- una transferencia de la cuenta a SÍ MISMA — el saldo no se mueve un peso
-- (sale y entra el mismo monto) y lo apartado sube.
--
-- `fin_tx_transfer_shape` lo prohibía de plano, y con razón para una
-- transferencia común: mover plata de una cuenta a la misma no significaría
-- nada. Con una etiqueta de ahorro y dirección `aporte`, sí significa: es la
-- única forma de decir "esto de acá ahora es ahorro" sin inventar un traspaso
-- que nunca ocurrió.
--
-- Se abre solo para ese caso, y exigiendo `to_amount is null`: origen y
-- destino son la misma cuenta, así que comparten moneda y no hay dos lados que
-- congelar.

alter table fin_transactions
  drop constraint if exists fin_tx_transfer_shape;
alter table fin_transactions
  add constraint fin_tx_transfer_shape check (
    (type = 'transferencia'
      and to_account_id is not null
      and category_id is null
      and (
        to_account_id <> account_id
        or (savings_flow = 'aporte' and to_amount is null)
      ))
    or
    (type in ('gasto','ingreso')
      and to_account_id is null
      and to_amount is null)
  );
