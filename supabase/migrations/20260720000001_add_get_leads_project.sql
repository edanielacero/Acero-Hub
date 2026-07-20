insert into projects (name, slug, description)
values (
  'Get Leads',
  'get-leads',
  'Gestión y captura de leads'
)
on conflict (slug) do nothing;
