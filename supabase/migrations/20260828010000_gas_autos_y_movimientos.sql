-- Gas · el modelo entero de la mini-app.
--
-- Cada auto es una CUENTA CORRIENTE con dos tipos de movimiento:
--   carga → suma Bs al saldo (cuando el usuario carga gas)
--   viaje → resta lo que le tocó pagar A ÉL de ese viaje
--
-- El saldo es la suma de todo eso y puede quedar NEGATIVO: eso es la deuda que
-- el usuario tiene que reponer. No se guarda en ninguna columna; se calcula
-- recorriendo los movimientos, que es la única forma de que no pueda quedar
-- desfasado de lo que realmente pasó (ver lib/gas/calc.ts).
--
-- Decisión del usuario (28/08/2026): en un viaje compartido el saldo baja SOLO
-- por su parte, no por el costo total. O sea que el saldo mide SU plata, no el
-- gas físico del tanque, y los "km disponibles" son los km que tiene pagados.

create table if not exists gas_autos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  -- Define el color del dibujo en la tarjeta. Cerrado a propósito: cada valor
  -- necesita su ilustración en app/gas/components/car-art.tsx.
  color      text not null check (color in ('rojo','plomo')),
  bs_por_km  numeric(10,2) not null check (bs_por_km > 0),
  orden      smallint not null default 0,
  created_at timestamptz not null default now(),

  -- Un auto por color y usuario: es lo que hace idempotente el alta inicial de
  -- los dos autos la primera vez que alguien abre la mini-app.
  unique (user_id, color)
);

create table if not exists gas_movimientos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  auto_id     uuid not null references gas_autos(id) on delete cascade,
  tipo        text not null check (tipo in ('viaje','carga')),

  -- Cuándo pasó. En un viaje es el momento de subirse; el orden del historial
  -- y el saldo corriente se calculan con esto.
  ocurrido_en timestamptz not null default now(),

  -- ── Solo para 'carga' ──
  monto       numeric(10,2),

  -- ── Solo para 'viaje' ──
  km_inicial  numeric(10,1),
  -- NULL = viaje en curso. Es el estado que hace que el botón de la tarjeta
  -- diga "Finalizar viaje" en vez de "Iniciar viaje".
  km_final    numeric(10,1),
  -- Incluye al conductor: si van 4, a él le toca un cuarto.
  personas    smallint,
  -- Congelado al iniciar el viaje. Si mañana se corrige el promedio del auto,
  -- los viajes viejos siguen costando lo que costaron.
  bs_por_km   numeric(10,2),
  terminado_en timestamptz,

  created_at  timestamptz not null default now(),

  -- Cada tipo trae sus campos y ninguno del otro. Sin esto, una carga con
  -- kilometraje o un viaje con monto entrarían sin que nada avise.
  constraint gas_mov_forma check (
    case tipo
      when 'carga' then
        monto is not null and monto > 0
        and km_inicial is null and km_final is null
        and personas is null and bs_por_km is null and terminado_en is null
      when 'viaje' then
        monto is null
        and km_inicial is not null and km_inicial >= 0
        and personas is not null and personas >= 1
        and bs_por_km is not null and bs_por_km > 0
    end
  ),

  -- El odómetro no camina para atrás. 0 km sí se permite: subirse y bajarse
  -- sin moverse es un viaje válido que no cuesta nada.
  constraint gas_mov_km_orden check (km_final is null or km_final >= km_inicial),

  -- Un viaje terminado tiene las dos cosas, o ninguna.
  constraint gas_mov_cierre check ((km_final is null) = (terminado_en is null))
);

-- Un solo viaje abierto por auto. Es la garantía de que "Iniciar viaje" dos
-- veces seguidas no pueda dejar dos viajes vivos compitiendo por el mismo
-- odómetro — la validación del servidor puede perder una carrera, el índice no.
create unique index if not exists gas_movimientos_viaje_abierto
  on gas_movimientos (auto_id)
  where tipo = 'viaje' and km_final is null;

create index if not exists gas_movimientos_auto_idx
  on gas_movimientos (auto_id, ocurrido_en desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table gas_autos       enable row level security;
alter table gas_movimientos enable row level security;

drop policy if exists "gas: ver propios autos"        on gas_autos;
drop policy if exists "gas: crear propios autos"      on gas_autos;
drop policy if exists "gas: actualizar propios autos" on gas_autos;
drop policy if exists "gas: borrar propios autos"     on gas_autos;

create policy "gas: ver propios autos" on gas_autos for select
  using (auth.uid() = user_id);
create policy "gas: crear propios autos" on gas_autos for insert
  with check (auth.uid() = user_id);
create policy "gas: actualizar propios autos" on gas_autos for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gas: borrar propios autos" on gas_autos for delete
  using (auth.uid() = user_id);

drop policy if exists "gas: ver propios movimientos"        on gas_movimientos;
drop policy if exists "gas: crear propios movimientos"      on gas_movimientos;
drop policy if exists "gas: actualizar propios movimientos" on gas_movimientos;
drop policy if exists "gas: borrar propios movimientos"     on gas_movimientos;

create policy "gas: ver propios movimientos" on gas_movimientos for select
  using (auth.uid() = user_id);
create policy "gas: crear propios movimientos" on gas_movimientos for insert
  with check (auth.uid() = user_id);
create policy "gas: actualizar propios movimientos" on gas_movimientos for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gas: borrar propios movimientos" on gas_movimientos for delete
  using (auth.uid() = user_id);
