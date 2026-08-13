-- Policies de insert/update/delete para fin_* — hasta ahora solo existían de
-- select, así que el cliente admin (service role) era la única puerta real
-- para escrituras. Espejan exactamente la lógica de ownership de sus
-- policies de select ya existentes.

-- fin_accounts (raíz)
create policy "fin: crear propias cuentas" on fin_accounts for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias cuentas" on fin_accounts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias cuentas" on fin_accounts for delete
  using (user_id = auth.uid());

-- fin_asset_valuations (hija de fin_accounts)
create policy "fin: crear propias valuaciones" on fin_asset_valuations for insert
  with check (exists (select 1 from fin_accounts where id = account_id and user_id = auth.uid()));
create policy "fin: actualizar propias valuaciones" on fin_asset_valuations for update
  using (exists (select 1 from fin_accounts where id = account_id and user_id = auth.uid()))
  with check (exists (select 1 from fin_accounts where id = account_id and user_id = auth.uid()));
create policy "fin: borrar propias valuaciones" on fin_asset_valuations for delete
  using (exists (select 1 from fin_accounts where id = account_id and user_id = auth.uid()));

-- fin_categories (raíz)
create policy "fin: crear propias categorias" on fin_categories for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias categorias" on fin_categories for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias categorias" on fin_categories for delete
  using (user_id = auth.uid());

-- fin_exchange_rates (raíz)
create policy "fin: crear propias tasas de cambio" on fin_exchange_rates for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias tasas de cambio" on fin_exchange_rates for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias tasas de cambio" on fin_exchange_rates for delete
  using (user_id = auth.uid());

-- fin_transactions (raíz)
create policy "fin: crear propias transacciones" on fin_transactions for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias transacciones" on fin_transactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias transacciones" on fin_transactions for delete
  using (user_id = auth.uid());

-- fin_category_rules (raíz)
create policy "fin: crear propias reglas de categoria" on fin_category_rules for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propias reglas de categoria" on fin_category_rules for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propias reglas de categoria" on fin_category_rules for delete
  using (user_id = auth.uid());

-- fin_profiles (raíz)
create policy "fin: crear propios perfiles" on fin_profiles for insert
  with check (user_id = auth.uid());
create policy "fin: actualizar propios perfiles" on fin_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "fin: borrar propios perfiles" on fin_profiles for delete
  using (user_id = auth.uid());
