-- Finanzas · Fijos: borrar una categoría ya no puede dejar un fijo sin ella.
--
-- `fin_recurring.category_id` estaba en ON DELETE SET NULL, heredado de
-- cuando la categoría de un fijo era opcional. Desde que pasó a ser
-- obligatoria (§ validateRecurring), ese SET NULL deja al fijo en un estado
-- que la propia app considera inválido: cualquier PATCH posterior —incluido
-- el toggle de pausa, que solo manda `{active}`— revalida el registro entero
-- y rebota con "Elige una categoría". El fijo queda sin poder pausarse ni
-- editarse, y de paso desaparece del comprometido de su presupuesto.
--
-- Pasa a RESTRICT, igual que `account_id` en esta misma tabla: primero se
-- reasigna el fijo, después se borra la categoría. La ruta de borrado avisa
-- cuáles son antes de que Postgres tire el error crudo.
--
-- `fin_transactions.category_id` NO cambia: ahí SET NULL es lo correcto — un
-- movimiento viejo conserva su historia aunque pierda la etiqueta.

alter table fin_recurring drop constraint if exists fin_recurring_category_id_fkey;

alter table fin_recurring
  add constraint fin_recurring_category_id_fkey
  foreign key (category_id) references fin_categories(id) on delete restrict;
