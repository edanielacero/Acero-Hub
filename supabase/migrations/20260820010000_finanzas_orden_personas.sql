-- Finanzas: orden manual para personas, igual que ya existe para cuentas y
-- categorías. Antes se ordenaban solo por nombre; ahora `sort_order` manda y
-- el nombre queda como desempate.

alter table fin_people add column if not exists sort_order integer not null default 0;

create index if not exists fin_people_user_idx
  on fin_people (user_id, archived, sort_order);
