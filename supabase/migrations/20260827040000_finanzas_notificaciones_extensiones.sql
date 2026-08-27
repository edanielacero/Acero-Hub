-- Finanzas · Sprint 9: las extensiones que hacen posible el scheduler propio.
--
-- Spec: documentos/finanzas/sprint_9_notificaciones.md §3.5
--
-- Vercel Hobby permite UN cron por día, y `vercel.json` ya lo tiene ocupado con
-- el refresco de cotizaciones. Agregar un segundo hace fallar el deploy entero
-- (ya rompió producción dos veces). La salida es la misma que usa Acrosoft CRM
-- sobre el mismo plan: programar dentro de Postgres.
--
--   pg_cron  → el scheduler, a la frecuencia que sea
--   pg_net   → la llamada HTTP a la Edge Function
--
-- ⚠️ En el esquema `extensions`, NUNCA en `public`. Es un hallazgo abierto de la
-- auditoría de seguridad del CRM ("pg_net instalada en el esquema public —
-- mover a extensions") que no vale la pena repetir acá.
--
-- Va sola, sin las tablas del sprint, a propósito: si alguna no estuviera
-- disponible en el proyecto, quiero que falle acá y no arrastrando media
-- migración con ella.

create schema if not exists extensions;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;
