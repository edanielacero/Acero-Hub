-- Registro de la mini-app Gas en el Hub.
-- `projects` es la fuente de verdad del control de acceso: sin esta fila el
-- admin no puede darle acceso a nadie y la tarjeta nunca aparece en el home.
insert into projects (name, slug, description)
values (
  'Gas',
  'gas',
  'Próximamente'
)
on conflict (slug) do nothing;
