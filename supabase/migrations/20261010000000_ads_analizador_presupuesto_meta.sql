-- Ads Analizador · presupuesto diario leído de Meta.
-- Spec: documentos/ads_analizador/sprint_6_cierre_de_ciclo.md
--
-- Se trae en cada sincronización: el de la campaña (presupuesto de campaña) o
-- la suma de los conjuntos activos. Null si la campaña usa presupuesto total o
-- si Meta no lo devolvió. Es solo referencia: los cálculos usan el gasto real.
alter table ads_campaigns
  add column if not exists presupuesto_meta numeric(12,2)
    check (presupuesto_meta is null or presupuesto_meta > 0),
  add column if not exists presupuesto_meta_en timestamptz;
