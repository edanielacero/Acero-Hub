insert into projects (name, slug, description)
values (
  'Daily',
  'daily',
  'Genera tu reporte de actividad diaria'
)
on conflict (slug) do nothing;
