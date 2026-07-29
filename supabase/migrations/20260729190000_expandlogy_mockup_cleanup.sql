-- Expandlogy pasó a ser un MVP 100% hardcodeado en el cliente (sin base de
-- datos propia). Se eliminan las tablas que quedaron sin uso. El registro en
-- `projects`/`project_access` se conserva: sigue siendo necesario para el
-- gate de acceso del Hub a la mini-app.

drop table if exists exp_creatives cascade;
drop table if exists exp_copies cascade;
drop table if exists exp_client_access cascade;
drop table if exists exp_clients cascade;
