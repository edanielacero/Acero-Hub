-- Revierte 20260901000000: la feature de "ingreso esperado" no se usó.
--
-- Se construyó para que Ahorro supiera cuánto se espera cobrar y pudiera
-- avisar si repartir dejaba corto al presupuesto. En uso resultó ser una
-- carga mensual que nadie pidió, y encima el aviso salía en rojo con un
-- número falso cuando no había nada declarado. Se saca entera.
--
-- Las tablas están vacías: nunca llegó a cargarse una fuente.

drop table if exists fin_income_periods;
drop table if exists fin_income_sources;

-- La función vuelve a su definición de 20260827020000, sin las dos tablas.
create or replace function fin_profile_has_data(p_profile uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from fin_accounts             where profile_id = p_profile)
      or exists (select 1 from fin_transactions         where profile_id = p_profile)
      or exists (select 1 from fin_people               where profile_id = p_profile)
      or exists (select 1 from fin_debts                where profile_id = p_profile)
      or exists (select 1 from fin_debt_plans           where profile_id = p_profile)
      or exists (select 1 from fin_recurring            where profile_id = p_profile)
      or exists (select 1 from fin_recurring_splits     where profile_id = p_profile)
      or exists (select 1 from fin_pasanaku             where profile_id = p_profile)
      or exists (select 1 from fin_pasanaku_historico   where profile_id = p_profile)
      or exists (select 1 from fin_budget_periods       where profile_id = p_profile)
      or exists (select 1 from fin_budget_lines         where profile_id = p_profile)
      or exists (select 1 from fin_budget_line_categories where profile_id = p_profile)
      or exists (select 1 from fin_budget_extensions    where profile_id = p_profile)
      or exists (select 1 from fin_budget_closures      where profile_id = p_profile)
      or exists (select 1 from fin_savings_goals        where profile_id = p_profile)
      or exists (select 1 from fin_savings_closures     where profile_id = p_profile);
$$;
