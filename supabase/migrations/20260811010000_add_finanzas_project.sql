insert into projects (name, slug, description)
values (
  'Finanzas',
  'finanzas',
  'Finanzas personales'
)
on conflict (slug) do nothing;
