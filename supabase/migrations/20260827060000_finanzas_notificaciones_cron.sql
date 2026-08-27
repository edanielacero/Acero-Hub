-- Finanzas · Sprint 9: el job que evalúa y manda las notificaciones.
--
-- Spec: documentos/finanzas/sprint_9_notificaciones.md §4.3
--
-- POR QUÉ CADA 15 MINUTOS Y NO CADA MINUTO
--
-- La Ronda 1 pidió avisos "al momento" y no un resumen diario. En la práctica
-- eso es un cron frecuente, pero ninguno de los cinco tipos cambia de estado
-- dentro del minuto: un fijo vence un día, un presupuesto se pasa cuando
-- registrás un gasto —y ahí la app ya te lo muestra en pantalla—, y el
-- recordatorio tiene hora fija. Correr cada minuto sería despertar la función
-- 1.440 veces por día para que en 1.439 no haya nada que hacer.
--
-- Que la función sea idempotente (compara contra fin_notifications) es lo que
-- permite subir o bajar esta frecuencia después sin tocar nada más.
--
-- EL SECRETO NO ESTÁ ACÁ
--
-- Se lee de Vault en tiempo de ejecución. Escribirlo en el `command` del job lo
-- dejaría en texto plano dentro de `cron.job` y, peor, en el historial de git.
--
-- Tampoco es la service role key: `FIN_CRON_SECRET` solo sirve para disparar
-- estas funciones. Si se filtra, lo peor que alguien logra es pedir que se
-- evalúen las notificaciones — molesto, no grave. Es una diferencia deliberada
-- respecto del CRM, que sí pasa la service role key en sus jobs.

do $$
declare
  base    text;
  secreto text;
begin
  select decrypted_secret into base    from vault.decrypted_secrets where name = 'fin_functions_url';
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'fin_cron_secret';

  if base is null or secreto is null then
    raise exception 'Faltan los secretos en Vault: fin_functions_url y/o fin_cron_secret. '
      'Cargalos con vault.create_secret() antes de correr esta migración.';
  end if;

  -- Idempotente: si el job ya existe, se reemplaza.
  perform cron.unschedule('finanzas-notificaciones')
  where exists (select 1 from cron.job where jobname = 'finanzas-notificaciones');

  perform cron.schedule(
    'finanzas-notificaciones',
    '*/15 * * * *',
    format(
      $cmd$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || %L
                   ),
        body    := '{}'::jsonb,
        -- Con datos de varios perfiles la evaluación puede tardar unos segundos.
        -- El default de pg_net son 5s, que dejaría corridas cortadas a la mitad.
        timeout_milliseconds := 60000
      );
      $cmd$,
      base || '/functions/v1/finanzas-notificaciones',
      secreto
    )
  );
end $$;
