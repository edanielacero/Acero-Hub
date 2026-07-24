-- Trades sincronizados desde backtesting a un journal empiezan como "borrador"
-- (sin capital completado) y no deben afectar las estadísticas del journal
-- hasta que se completen.

alter table tj_trades add column if not exists is_draft boolean not null default false;

create index if not exists tj_trades_is_draft on tj_trades(session_id, is_draft) where is_draft = true;
