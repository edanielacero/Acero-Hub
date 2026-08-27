-- Finanzas · Sprint 8: devolverle a las FKs compuestas sus nombres originales.
--
-- La migración anterior reemplazó cuatro FKs simples por sus versiones
-- compuestas `(columna, profile_id)` y les puso nombres nuevos y descriptivos.
-- Eso rompió algo que no es evidente:
--
--   **PostgREST resuelve los embeds por NOMBRE DE CONSTRAINT.**
--
-- `lib/finanzas/shared.ts` pide, entre otros:
--
--     person:fin_people!fin_debts_person_id_fkey(id,name,archived)
--
-- Al desaparecer ese nombre, PostgREST ya no puede resolver el embed y la
-- consulta entera falla. Y como el código hace `data ?? []`, el fallo no se ve:
-- `GET /debts` empezó a devolver `por_cobrar_usd: 0` con las deudas intactas en
-- la base. Un cero silencioso, que es la peor forma de romper una app de plata.
--
-- Se renombran a los nombres de siempre. Las restricciones son las mismas —
-- siguen siendo compuestas y siguen impidiendo el cruce entre perfiles—, solo
-- recuperan el nombre por el que el código las nombra.
--
-- ⚠️ Regla para el futuro: renombrar una FK de `fin_debts` o `fin_transactions`
-- es un cambio de API, no de esquema. Antes de tocar una, buscar `!fin_` en
-- lib/ y app/.

alter table fin_transactions rename constraint fin_tx_account_same_profile
  to fin_transactions_account_id_fkey;

alter table fin_transactions rename constraint fin_tx_to_account_same_profile
  to fin_transactions_to_account_id_fkey;

alter table fin_transactions rename constraint fin_tx_category_same_profile
  to fin_transactions_category_id_fkey;

alter table fin_debts rename constraint fin_debts_person_same_profile
  to fin_debts_person_id_fkey;
