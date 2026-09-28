-- Ads Analizador · neto recibido cargado a mano (campañas de Stripe).
--
-- Las comisiones de Stripe cambian por país de la tarjeta, así que el margen
-- promedio no alcanza para un profit exacto. El usuario puede cargar, por día,
-- lo que Stripe le depositó después de comisiones; con eso el profit de ese
-- día es neto − inversión (productos digitales: no hay otro costo por venta).
--
-- `cantidad` pasa a ser opcional: en compras, una fila puede corregir solo el
-- neto y dejar las ventas en automático (Stripe o Meta). En WhatsApp la API
-- sigue exigiendo la cantidad — es la venta en sí.

alter table ads_ventas_manuales
  add column if not exists neto numeric(12,2) check (neto is null or neto >= 0);

alter table ads_ventas_manuales
  alter column cantidad drop not null;

-- Una fila vacía no corrige nada: tiene que traer al menos uno de los dos.
alter table ads_ventas_manuales
  drop constraint if exists ads_ventas_algo_que_corregir;
alter table ads_ventas_manuales
  add constraint ads_ventas_algo_que_corregir check (cantidad is not null or neto is not null);
