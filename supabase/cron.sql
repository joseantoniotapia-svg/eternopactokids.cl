-- =====================================================================
-- Eterno Pacto Kids · Tarea programada de avisos (cada 10 minutos llama a la función "notificar")
-- Se ejecuta DESPUÉS de publicar la función notificar. Se puede ejecutar más de una vez.
-- =====================================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'epk-notificar';
select cron.schedule('epk-notificar', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://izkqplqwxoszwqpzxwrb.supabase.co/functions/v1/notificar',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6a3FwbHF3eG9zendxcHp4d3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MDU2MjMsImV4cCI6MjExMDA4MTYyM30.o9TizvJI1wvRRMRh-FfUDnw4bP8PT8m_jzQBath49YY"}'::jsonb,
    body := '{}'::jsonb)
$cron$);
select 'Listo: avisos programados cada 10 minutos' as resultado;
