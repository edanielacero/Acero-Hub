-- Ads Analizador · con qué se fijó la duración de cada ciclo.
-- 'presupuesto_meta' (presupuesto diario de Meta) o 'gasto_real' (promedio de
-- los días 1 a 3). Null = calculada con una regla anterior: si el ciclo sigue
-- abierto, la app la recalcula una vez con la regla vigente.
alter table ads_ciclos
  add column if not exists duracion_base text
    check (duracion_base is null or duracion_base in ('presupuesto_meta', 'gasto_real'));
