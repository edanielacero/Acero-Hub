# Finanzas — Sprint 8: "Perfiles"

> Contexto financiero y de producto: `contexto_finanzas.md` (§7.4 tiene el
> resumen de las decisiones y por qué se descartó cada alternativa).
> Dirección visual: `contexto_ui_finanzas.md` (§4.1: el acento por perfil).
> Sprints anteriores: `documento_maestro_finanzas.md` (1), `sprint_2_compartidos.md` (2),
> `sprint_3_fijos.md` (3), `sprint_4_planes_de_pago.md` (4), `sprint_5_pasanaku.md` (5),
> `sprint_6_presupuesto.md` (6), `sprint_7_ahorro.md` (7).
>
> Este documento especifica **únicamente el Sprint 8** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-27 · Estado: **construido**. 661/202/737
> pruebas en verde (unit/db/api), build en verde. Cinco desviaciones respecto
> de lo especificado acá (§0.2) y seis bugs encontrados en la revisión posterior
> (§0.3). Las dos secciones mandan sobre el resto del documento donde difieran.

---

## 0. Preguntas que este sprint cierra

El roadmap no tenía nada de esto: Perfiles apareció el 2026-08-27 en
conversación, reemplazando en el orden a Reportes (#8), que quedó congelado
junto con Fondo de crecimiento (#9) y Reglas y automatismos (#12).

Todo se decidió en cuatro rondas el mismo día.

### Ronda 1 — el modelo general

| Pregunta | Decisión |
|---|---|
| ¿Perfiles de tipo personal y empresa? | **No hay tipos.** Se evaluó `type ∈ ('personal','empresa')` y se descartó: los dos se comportarían idénticamente. Lo que distingue a un perfil es su **nombre** y su **color** |
| ¿Cuántos perfiles? | **Sin límite** |
| ¿Patrimonio compartido entre perfiles o propio de cada uno? | **Propio de cada uno**, aislado (§4.3) |
| ¿Hay un total consolidado? | **No.** Se propuso mostrarlo en el selector y el usuario lo rechazó: *"quiero saber cómo va cada perfil aislado"* |

### Ronda 2 — qué se aísla y qué no

| Pregunta | Decisión |
|---|---|
| ¿Categorías globales o por perfil? | **Por perfil.** Globales llenarían el picker de cada perfil con ruido irrelevante, y Presupuesto —que es por categoría— heredaría el ruido |
| ¿Personas globales o por perfil? | **Por perfil.** Se propuso dejarlas globales (una persona es la misma con cualquier sombrero) y el usuario decidió lo contrario, para aislar de verdad |
| ¿Tasa de cambio y cotizaciones? | **Globales.** Son hechos del mundo, no de un cajón: duplicarlas dejaría al mismo día con dos tasas distintas |
| ¿Se pueden mover movimientos entre perfiles? | **No.** Si se registró en el equivocado, se borra y se vuelve a cargar |

### Ronda 3 — ciclo de vida

| Pregunta | Decisión |
|---|---|
| ¿Se puede borrar un perfil? | **Sin movimientos sí; con movimientos no, se archiva.** Copia exacta de la regla de cuentas (maestro §4.5) |
| ¿Y el default? | **Ni se borra ni se archiva, nunca** |
| ¿Se pueden renombrar? | **Sí, todos, incluido el default.** Indeleble no es lo mismo que inmutable |
| ¿Qué pasa con lo ya cargado? | **Todo cae en el perfil default** |
| ¿Y un usuario nuevo? | Se le crea su perfil default solo. **Nunca hay un usuario sin perfil** |

### Ronda 4 — cómo se sabe en qué perfil estás

| Pregunta | Decisión |
|---|---|
| ¿Cómo se distingue un perfil de otro? | **Cada perfil tiene su color de acento**, aplicado global (§4.8) |
| ¿El azul puede ser un acento? | **No: el azul ya significa ahorro.** Ver §4.8 |
| ¿Dónde se cambia? | Un ícono en el header del Home, al lado del engranaje. **Solo aparece con 2 o más perfiles** |
| ¿Se recuerda el perfil activo? | **Sí, por dispositivo** (`localStorage`). Cambiarlo en el celular no debe cambiarlo en la computadora |
| ¿El perfil va en la URL? | **No.** Obligaría a reescribir el router de `[[...slug]]` a cambio de nada: un solo usuario, sin links compartidos |

### 0.1 Una decisión de implementación que tomo yo

**`profile_id` se denormaliza en las 17 tablas, no solo en las raíz.**

Las tablas hijas (`fin_budget_line_categories`, `fin_recurring_splits`,
`fin_pasanaku_historico`, `fin_debts`) podrían heredar el perfil por su FK al
padre. No lo van a hacer, por dos razones:

1. **Es lo que el código ya hace con `user_id`.** Las 17 tablas lo llevan
   denormalizado, incluidas las hijas. Un `profile_id` que a veces está y a
   veces se resuelve por join sería una segunda convención conviviendo con la
   primera.
2. **RLS y las consultas quedan planas.** 159 filtros `.eq('user_id', …)`
   repartidos en `lib/finanzas/` y 41 rutas se convierten en un segundo `.eq()`
   al lado. Con herencia por join, cada uno sería un subquery.

El riesgo que abre —una fila hija apuntando a un padre de otro perfil— se cierra
con FKs compuestas en los tres pares que importan (§3.4).

### 0.2 Lo que cambió al construirlo

Cuatro desviaciones respecto de lo escrito arriba. Las tres primeras salieron de
mirar la base real en vez de las migraciones; la cuarta es un agujero que la
especificación no vio.

#### a) La FK compuesta reemplaza a las 68 policies (§3.5)

§3.5 proponía agregar a cada policy de insert/update un `exists (…)` que
verificara que el `profile_id` fuera del usuario. Son **68 policies**.

En vez de eso, `fin_profiles` lleva `unique (id, user_id)` y las 17 tablas
apuntan con una FK **compuesta**:

```sql
foreign key (profile_id, user_id) references fin_profiles (id, user_id)
  on delete restrict
```

Escribir el perfil de otro usuario pasa a ser imposible **por definición del
esquema**, no por una validación repetida 68 veces. Las policies existentes
(`auth.uid() = user_id`) quedaron intactas.

#### b) Son cinco únicos, no seis (§3.2.1)

`fin_budget_lines_category_idx` **no existe**. Su columna `category_id` se borró
el 2026-08-23 (`…_presupuesto_multi_categoria.sql`) con un `drop column …
cascade` que se llevó el índice. La fuente de verdad es la tabla puente.

Lo detectó la migración al fallar: `column "category_id" does not exist`. La
lección para la próxima auditoría de esquema es que **leer las migraciones no
alcanza** — un `drop column` se lleva índices sin nombrarlos, así que hay que
mirar el estado real de la base.

#### c) ⚠️ Los nombres de las FKs son API, no detalle interno

El hallazgo más caro del sprint, y el que hay que recordar.

**PostgREST resuelve los embeds por nombre de constraint.**
`lib/finanzas/shared.ts` pide, entre otros:

```
person:fin_people!fin_debts_person_id_fkey(id,name,archived)
```

Al reemplazar esa FK por su versión compuesta con un nombre nuevo y descriptivo,
el embed dejó de resolver, la consulta entera falló, y como el código hace
`data ?? []`, **`GET /debts` empezó a devolver `por_cobrar_usd: 0` con las
deudas intactas en la base**. Un cero silencioso: la peor forma de romper una
app de plata.

Se arregló en `20260827010000_finanzas_perfiles_fk_names.sql` devolviéndoles los
nombres de siempre. Las restricciones son las mismas.

**Regla para el futuro:** antes de renombrar una FK de `fin_debts` o
`fin_transactions`, buscar `!fin_` en `lib/` y `app/`.

#### d) `fzFetch` — el agujero que la especificación no vio

§4.2 cubría el server (159 filtros, 41 rutas) pero daba por resuelto el cliente.
No lo estaba: las pantallas llaman a `/api/finanzas/…` en **35 puntos**, ninguno
mandaba `?profile=`, y el que se olvidara **no fallaría** — escribiría en el
perfil default en silencio. Un gasto de la empresa apareciendo en el personal.

Se cerró con `app/finanzas/components/fz-fetch.ts`: un envoltorio de `fetch` que
lee el perfil activo de `localStorage` y lo agrega. Los 35 puntos pasaron a
usarlo, y queda un solo lugar del que acordarse.

#### e) El seed dejó de ser quien crea las categorías

`createProfile` las siembra al crear el perfil (§4.7), y eso ocurre en el primer
request que pasa por `requireProfile`. `POST /seed` pasó de crear 14 a crear 0:
sigue siendo idempotente y ahora es la red de seguridad que las repone si
faltara alguna, no el camino normal. El test de la suite se actualizó para
reflejarlo.

### 0.3 Los seis bugs que encontró la revisión posterior

Revisión del 2026-08-27, después de dar el sprint por construido y con las tres
suites en verde. **Ninguno lo habían atrapado los tests**, y vale anotar por qué:
cuatro son de estado del cliente o de CSS, y dos necesitaban un perfil en un
estado que ninguna prueba armaba.

#### 1. ⚠️ El borrado fallido se llevaba las categorías (destructivo)

`DELETE /profiles/[id]` borraba las 14 categorías sembradas y **después**
intentaba borrar el perfil. Con cualquier otro dato cargado —una persona, un
ahorro, un fijo— el segundo delete fallaba por el `on delete restrict`, la ruta
devolvía un 409 correcto… y las categorías ya no estaban. El perfil sobrevivía
inutilizable y nada lo decía.

Causa raíz: `profileHasMovements` miraba **2 de las 16 tablas** (cuentas y
movimientos), así que un perfil con solo una persona se reportaba vacío y la UI
ofrecía "Borrar".

Arreglado en `20260827020000_finanzas_perfiles_borrado_atomico.sql` con dos
funciones de Postgres: `fin_profile_has_data` mira las 16, y `fin_delete_profile`
verifica y borra **en una sola transacción** — si el borrado del perfil falla, el
de las categorías se deshace con él. Con regresión en la suite `api`.

#### 2. Una respuesta lenta podía pisar el perfil recién elegido

`reload()` no recordaba con qué perfil había salido. Si el usuario cambiaba de
perfil con una carga en vuelo, la respuesta vieja podía aterrizar después de la
nueva y dejar **la plata de un perfil bajo el nombre del otro** — y como también
escribía `localStorage`, la próxima apertura heredaba el error.

Arreglado capturando el perfil pedido al inicio de `reload()` y descartando la
respuesta si cambió mientras tanto.

#### 3. Todos los puntos de color salían del mismo color

Las paletas estaban escritas como `#fz-root[data-accent='X']`, que **solo
matchea el nodo raíz**. `<ProfileDot>` pone su propio `data-accent` en un
`<span>`, que no matchea nada y por lo tanto heredaba el acento activo.

Resultado: la lista de perfiles no distinguía ninguno, y los cinco puntos del
selector de color se veían idénticos — la pantalla que existe para elegir color
no mostraba colores.

Arreglado agregando el selector de descendiente: `#fz-root [data-accent='X']`.

#### 4. El acento se pintaba un frame tarde

El `data-accent` se escribía con `useEffect`, que corre **después** del primer
paint. La app se pintaba un frame en verde antes de tomar su color. No es solo
un parpadeo: durante ese frame el color está diciendo que estás en otro perfil.
Cambiado a `useIsoLayoutEffect`.

#### 5. La primera apertura podía devolver 401

La primera visita dispara varias llamadas casi a la vez y **todas** encuentran
cero perfiles. El `unique (user_id, name)` deja crear a una sola; las demás
recibían `profile: null` y la ruta respondía **"No autorizado"** — en la primera
pantalla que ve alguien que acaba de entrar.

Arreglado releyendo la lista cuando el insert choca, en vez de fallar: el índice
decide quién creó, no quién llegó primero. Mismo patrón que ya usaba
`resolvePeople`. Verificado con 6 requests simultáneos.

#### 6. La etiqueta prometía menos de lo que medía

Ajustes decía *"con movimientos"* para un campo que ahora mira las 16 tablas.
Pasó a decir *"con datos"*.

#### Lo que se revisó y estaba bien

- Las **159 lecturas y 34 inserts**: ninguna quedó sin filtro de perfil.
- Las **mutaciones por id**: todas llevan `.eq('profile_id')`, incluidas las tres
  rutas de reordenamiento.
- Los **cruces entre perfiles**: gasto desde una cuenta ajena, categoría ajena,
  transferencia hacia una cuenta ajena, deuda con persona ajena, fijo con
  categoría o ahorro ajenos, y editar una cuenta de otro perfil — los ocho
  rebotan.
- **Archivar el perfil activo**, y pedir un perfil **archivado o ya borrado**:
  caen al principal sin romper.

#### Uno conocido, que NO se tocó

`DELETE` de un recurso de **otro** perfil devuelve **200** sin borrar nada (el
`.eq('profile_id')` hace que afecte 0 filas, pero no se verifica cuántas tocó).
No hay pérdida de datos ni fuga.

**Predata al Sprint 8**: antes era `.eq('user_id')` con exactamente el mismo
comportamiento. Lo que cambia es que ahora es *alcanzable* —un id de perfil viejo
es más probable que el id de otro usuario—, aunque después del arreglo del bug 2
el cliente ya no manda un perfil desactualizado. Son 26 sitios y la mayoría son
limpiezas internas donde borrar 0 filas es lo correcto, así que separarlo de este
sprint es más seguro que reescribirlos acá.

---

## 1. Objetivo del sprint

**Que la misma cuenta pueda tener varios juegos de finanzas que no se ven entre
sí.**

Al terminar, el usuario puede crear un perfil desde Ajustes, cambiar a él desde
el Home, y encontrarse una app idéntica pero vacía: sin cuentas, sin
movimientos, sin deudas, sin fijos, con su propio patrimonio y con otro color.
Lo que registre ahí no aparece en el perfil personal, y viceversa.

### Definición de "terminado"

1. Existe un perfil default para todo usuario que entre a la mini-app, y todo lo
   cargado hasta hoy vive en él.
2. Se puede crear, renombrar y archivar perfiles desde Ajustes; borrarlos solo
   si están vacíos.
3. El selector aparece en el Home cuando hay 2 o más perfiles y cambia el perfil
   activo sin recargar la página.
4. Cada perfil pinta la app con su acento, desde el primer frame.
5. Todas las pantallas muestran **solo** datos del perfil activo, y el quick-add
   escribe **solo** en el perfil activo.
6. El perfil activo sobrevive a cerrar y volver a abrir la app en ese
   dispositivo, y no se contagia a otro dispositivo.
7. La batería completa en verde (unit/db/api), más las regresiones nuevas de
   aislamiento (§8).

---

## 2. Alcance

### Entra

- Tabla `fin_profiles` y columna `profile_id` en 17 tablas.
- Migración con backfill: perfil default por usuario + todo lo existente
  apuntándole.
- `requireProfile()` — el helper que resuelve el perfil activo del request.
- `/bootstrap` y las 41 rutas, filtrando y escribiendo por perfil.
- Pantalla **Ajustes → Perfiles**: lista, crear, renombrar, cambiar color,
  archivar, borrar.
- Selector en el header del Home.
- Acento por perfil aplicado sobre `#fz-root`.
- Nombre del perfil en el header del quick-add.
- Snapshot del cliente cacheado por perfil.

### No entra en este sprint

| Fuera | Por qué |
|---|---|
| **Total consolidado entre perfiles** | Rechazado explícitamente (Ronda 1). Si algún día vuelve, es territorio de Reportes (#8, congelado) |
| **Mover un movimiento entre perfiles** | Rechazado explícitamente (Ronda 2) |
| **Borrado duro de un perfil con historia** | Se archiva. Un "vaciar y borrar" en dos pasos es fácil de agregar después y hoy no hace falta |
| **Compartir un perfil con otra persona** | Sigue habiendo un solo usuario (`contexto_finanzas.md` §1). Los perfiles son cajones del mismo dueño, no colaboración |
| **Copiar datos de un perfil a otro** | Un perfil nuevo nace con las categorías semilla y nada más. Clonar cuentas o fijos no se pidió |
| **Perfil en la URL** | Rechazado (Ronda 4) |
| **Que Alertas sepa de qué perfil es cada aviso** | Es el Sprint 9. Queda anotado en §9 |

---

## 3. Modelo de datos

### 3.1 `fin_profiles`

```sql
create table if not exists fin_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  -- Clave de paleta, no un hex: los colores viven en theme.css y acá se guarda
  -- cuál le toca. Un hex suelto en la base dejaría al perfil fuera del sistema
  -- de color (§4.8) y permitiría guardar el azul, que está reservado.
  accent      text not null default 'verde'
                check (accent in ('verde','naranja','violeta','magenta','teal')),
  is_default  boolean not null default false,
  archived    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Un perfil no puede llamarse igual que otro del mismo usuario: el selector
  -- sería ambiguo y el error de registrar en el equivocado es irreversible.
  unique (user_id, name),
  -- El default nunca se archiva. Lo garantiza la base, no solo el server.
  constraint fin_profiles_default_no_archivado check (not (is_default and archived))
);

-- Exactamente un default por usuario.
create unique index if not exists fin_profiles_one_default
  on fin_profiles (user_id) where is_default;

create index if not exists fin_profiles_user_idx
  on fin_profiles (user_id, archived, sort_order);
```

**`accent` es una clave, no un hex.** Guardar `#F97316` en la base rompería dos
cosas: dejaría al perfil fuera del sistema de color de `theme.css` (donde cada
acento es un set de 4–5 tokens, no un color) y permitiría guardar un azul, que
está reservado para ahorro. El `check` lo hace imposible a nivel de base.

**⚠️ No confundir con `profiles` del Hub.** Esa tabla es la identidad del
usuario y no se toca. Y ya existió un `fin_profiles` en el intento anterior
(borrado el 2026-08-17) cuyo modelo era el opuesto: `profile_id` nullable solo
en `fin_transactions`, para etiquetar *"sin dividir el patrimonio, que sigue
compartido"*. Esa migración es una advertencia, no un punto de partida.

### 3.2 `profile_id` en las 17 tablas del perfil

```sql
alter table <tabla>
  add column profile_id uuid references fin_profiles(id) on delete restrict;
```

`on delete restrict`, no `cascade`: es lo que hace que borrar un perfil con
movimientos falle **en la base** aunque falle la validación del server, igual
que la FK de cuentas (maestro §4.5).

Las 17: `fin_accounts`, `fin_transactions`, `fin_categories`, `fin_people`,
`fin_debts`, `fin_debt_plans`, `fin_recurring`, `fin_recurring_splits`,
`fin_pasanaku`, `fin_pasanaku_historico`, `fin_budget_periods`,
`fin_budget_lines`, `fin_budget_line_categories`, `fin_budget_extensions`,
`fin_budget_closures`, `fin_savings_goals`, `fin_savings_closures`.

`fin_asset_valuations` **no la lleva**: cuelga de `fin_accounts` y no tiene
`user_id` propio, así que ya hereda todo por su FK.

**Índices.** Todos los `fin_*_user_idx` existentes anteponen `user_id`. Se
recrean con `profile_id` en su lugar —no además—: toda consulta del dominio
filtra por perfil, y el perfil ya implica el usuario. Ejemplo:

```sql
drop index if exists fin_accounts_user_idx;
create index fin_accounts_profile_idx on fin_accounts (profile_id, archived, sort_order);
```

### 3.2.1 Los seis únicos que cambian de alcance

**Ninguno es opcional.** Cada uno está hoy scopeado por `user_id` y pasa a
estarlo por `profile_id`. Los dos últimos no darían un error confuso: harían
**imposible** una feature entera en todo perfil que no sea el primero.

| # | Índice / constraint | Hoy | Qué rompe si queda sin migrar |
|---|---|---|---|
| 1 | `fin_categories_unique_name` | `(user_id, kind, name)` | No podrías tener "Servicios" en dos perfiles |
| 2 | `fin_people_user_name_idx` | `(user_id, lower(name)) where not archived` | No podrías tener a la misma persona en dos perfiles — y personas **es** por perfil (Ronda 2) |
| 3 | `fin_budget_lines_category_idx` | `(user_id, category_id) where not archived` | Una sola línea de presupuesto por categoría **en toda la cuenta** |
| 4 | `fin_budget_line_categories_category_idx` | `(user_id, category_id)` | Igual que #3, un nivel más abajo |
| 5 | `fin_savings_closures` (constraint) | `unique (user_id, period)` | Cerrar el mes en un perfil marcaría el mes cerrado en todos |
| 6 | ⚠️ `fin_savings_goals_catchall_idx` | `(user_id) where is_catchall and not archived` | **Un solo cajón de sastre en toda la cuenta.** El segundo perfil nunca podría tener uno — y es lo que garantiza que "nunca queda plata sin asignar" (Sprint 7 §4.3) |

El #6 es un índice parcial de un solo campo: dice *"como máximo un cajón de
sastre activo por usuario"*. Traducido mal, el segundo perfil recibe un
`duplicate key` al crear el suyo, y no hay forma de llegar a ese estado desde la
UI — parecería un bug de la app, no un índice.

> **Corrección (verificado en las migraciones al construir).** Una versión
> anterior de esta tabla listaba también `fin_budget_lines_general_idx`. **Ese
> índice ya no existe**: se eliminó el 2026-08-23 en
> `20260823000000_finanzas_presupuesto_sin_general.sql`, cuando el tope general
> dejó de ser una fila y pasó a ser un agregado (Sprint 6 §4.7). No hay nada que
> migrar ahí.

```sql
-- Los cinco directos: mismo índice, cambiando user_id por profile_id.
drop index if exists fin_categories_unique_name;
create unique index fin_categories_unique_name
  on fin_categories (profile_id, kind, name);

drop index if exists fin_people_user_name_idx;
create unique index fin_people_user_name_idx
  on fin_people (profile_id, lower(name)) where not archived;

drop index if exists fin_budget_lines_category_idx;
create unique index fin_budget_lines_category_idx
  on fin_budget_lines (profile_id, category_id) where not archived;

drop index if exists fin_budget_line_categories_category_idx;
create unique index fin_budget_line_categories_category_idx
  on fin_budget_line_categories (profile_id, category_id);

alter table fin_savings_closures
  drop constraint if exists fin_savings_closures_user_id_period_key;
alter table fin_savings_closures
  add constraint fin_savings_closures_profile_period_key unique (profile_id, period);

-- El parcial de un solo campo (#6).
drop index if exists fin_savings_goals_catchall_idx;
create unique index fin_savings_goals_catchall_idx
  on fin_savings_goals (profile_id) where is_catchall and not archived;
```

**El orden importa:** estos seis se recrean en el paso 4 de la migración
(§3.6), **después** del backfill. Recrearlos antes, con `profile_id` todavía
nulo en todas las filas, haría colisionar cada índice contra sí mismo.

### 3.2.2 Los tres triggers no necesitan cambios — verificado

Vale dejarlo escrito para que nadie los revise dos veces:

| Trigger | Por qué es seguro |
|---|---|
| `fin_normalize_flow_type()` | Solo lee y escribe `new.type` / `new.flow_type` de la fila. No consulta ninguna tabla |
| `fin_budget_lines_delete_if_empty()` | Borra por `old.line_id`; el id ya identifica el perfil |
| `fin_clear_savings_tag()` | Actualiza `where savings_goal_id = old.id`; el id ya identifica el perfil |

Ninguno filtra por `user_id`, así que ninguno puede cruzar perfiles.

### 3.3 Lo que queda global

`fin_rates`, `fin_quotes` y `fin_settings` **no llevan `profile_id`** y siguen
con su `user_id`. Un cambio de tasa en un perfil se ve en todos, y eso es lo
correcto: la tasa del día es un hecho del mundo.

Consecuencia para la UI: **Ajustes → Tipo de cambio es global**, y conviene que
lo diga. Ajustes → Categorías y Ajustes → Personas, en cambio, operan sobre el
perfil activo.

### 3.4 Integridad cruzada: FKs compuestas en tres pares

Con `profile_id` denormalizado (§0.1), nada impide por sí solo que una fila
apunte a un padre de otro perfil. Se cierra con la técnica estándar de Postgres
—unique compuesto en el padre, FK compuesta en el hijo— en los tres pares donde
un cruce corrompería números:

```sql
-- 1. Un movimiento no puede salir de una cuenta de otro perfil.
alter table fin_accounts add constraint fin_accounts_id_profile unique (id, profile_id);
alter table fin_transactions add constraint fin_tx_account_same_profile
  foreign key (account_id, profile_id) references fin_accounts (id, profile_id);

-- 2. Ni caer en una categoría de otro perfil.
alter table fin_categories add constraint fin_categories_id_profile unique (id, profile_id);
alter table fin_transactions add constraint fin_tx_category_same_profile
  foreign key (category_id, profile_id) references fin_categories (id, profile_id);

-- 3. Una deuda no puede ser de una persona de otro perfil.
alter table fin_people add constraint fin_people_id_profile unique (id, profile_id);
alter table fin_debts add constraint fin_debts_person_same_profile
  foreign key (person_id, profile_id) references fin_people (id, profile_id);
```

`to_account_id` de las transferencias necesita el mismo tratamiento que el par
1. En los demás pares (líneas de presupuesto, splits de fijos, histórico de
pasanaku) alcanza con que la ruta escriba el perfil activo en las dos puntas:
un cruce ahí ensucia una lista, no un saldo.

### 3.5 RLS

Las policies siguen siendo `auth.uid() = user_id`, con las cuatro de siempre
(select/insert/update/delete) por tabla, más las cuatro nuevas de
`fin_profiles`.

**⚠️ RLS protege entre usuarios, no entre perfiles.** El perfil activo es un
concepto del request, no de la identidad: `auth.uid()` no sabe en qué perfil
estás. El aislamiento entre perfiles se aplica **en código**, y la base solo
garantiza que la fila pertenezca a un perfil que es tuyo.

Es una distinción de seguridad que hay que tener clara: un bug de filtrado
mezcla tus propios perfiles —molesto, corrige números— pero **no** filtra datos
a otro usuario. Eso lo sigue cubriendo RLS.

Lo que sí conviene agregar es un `check` que impida escribir un `profile_id` de
otro usuario, vía policy de insert/update sobre las 17:

```sql
create policy "fin: crear propias accounts" on fin_accounts for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from fin_profiles p
                where p.id = profile_id and p.user_id = auth.uid())
  );
```

### 3.6 La migración: cinco pasos, en este orden

Esta sección manda sobre el orden de **todo** el §3: el DDL de §3.2, §3.2.1 y
§3.4 se ejecuta desde acá, no donde está escrito.

```sql
-- 1. La tabla.
create table fin_profiles (…);   -- §3.1

-- 2. Un default por cada usuario que ya tenga algo cargado.
insert into fin_profiles (user_id, name, accent, is_default, sort_order)
select distinct user_id, 'Personal', 'verde', true, 0
from fin_accounts
union
select distinct user_id, 'Personal', 'verde', true, 0
from fin_transactions
on conflict (user_id, name) do nothing;

-- 3. profile_id NULLABLE en las 17 + backfill.   §3.2
alter table <tabla> add column profile_id uuid references fin_profiles(id) on delete restrict;
update <tabla> t set profile_id = p.id
  from fin_profiles p where p.user_id = t.user_id and p.is_default;

-- 4. Recién ahora, NOT NULL. Es el paso que verifica el backfill.
alter table <tabla> alter column profile_id set not null;

-- 5. Todo lo que depende de que profile_id ya esté poblado:
--    · los índices de §3.2      (fin_*_user_idx → fin_*_profile_idx)
--    · los seis únicos de §3.2.1
--    · las FKs compuestas de §3.4 (con su unique (id, profile_id) en el padre)
--    · las policies de §3.5
```

**Por qué el orden importa, en los tres puntos donde se puede romper:**

| Si se adelanta | Qué pasa |
|---|---|
| Los seis únicos (§3.2.1) antes del paso 4 | `profile_id` está nulo en todas las filas: cada índice parcial colisiona contra sí mismo |
| Las FKs compuestas (§3.4) antes del paso 4 | La FK falla al validar filas con `profile_id` nulo |
| El `NOT NULL` (paso 4) antes del backfill | Falla la migración entera, que es lo correcto — pero por el motivo equivocado, y esconde si el backfill estaba bien |

El paso 4 es el que verifica que el backfill fue completo: si alguna fila quedó
sin perfil, la migración falla ruidosamente en vez de dejar filas invisibles
para siempre.

**El default no se crea en la migración para usuarios sin datos.** Un usuario
que todavía no abrió Finanzas no tiene filas de las que derivarlo. Su perfil se
crea en el primer `/bootstrap` (§4.1), que es donde ya vive `ensureRates` por el
mismo motivo (`seed/route.ts`: *"una migración no puede conocer el auth.uid()
del usuario de forma limpia"*).

---

## 4. Reglas de negocio

### 4.1 Siempre hay un perfil, y se crea solo

`/bootstrap` resuelve el perfil activo así:

1. Si el request trae `?profile=<id>` y ese perfil es del usuario y no está
   archivado → ese.
2. Si no → el `is_default` del usuario.
3. Si el usuario no tiene ninguno → **se le crea el default en ese mismo
   request** (`name: 'Personal'`, `accent: 'verde'`) y se siembran sus
   categorías.

El paso 3 es lo que cubre al usuario nuevo. Nunca se responde "no tenés perfil":
esa rama no existe en la UI.

Un `?profile=<id>` inválido —de otro usuario, archivado, o borrado desde otro
dispositivo— **no es un error**: cae al default en silencio. El cliente
descubre el cambio porque la respuesta trae el perfil activo, y actualiza su
`localStorage`.

### 4.2 El aislamiento se aplica en el filtro, no en la vista

Toda lectura y toda escritura del dominio llevan el perfil. En números: **159
filtros `.eq('user_id', …)`** en `lib/finanzas/` y las 41 rutas, y **34
inserts** que escriben `user_id: userId`.

No se editan 193 veces a mano. `requireUser()` se envuelve:

```ts
// lib/supabase-server.ts — al lado de requireUser()
export async function requireProfile(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return { supabase, userId: null, profileId: null }
  const profileId = await resolveProfile(supabase, userId, new URL(request.url).searchParams.get('profile'))
  return { supabase, userId, profileId }
}
```

…y cada consulta gana un `.eq('profile_id', profileId)` al lado del que ya
tiene. El `user_id` **se queda**: es lo que sostiene RLS (§3.5).

**La regresión que hay que escribir sí o sí** es la que recorre las 17 tablas y
verifica que ninguna consulta del dominio devuelva filas de otro perfil. Es la
única forma honesta de saber que no quedó un `.eq()` sin poner entre 159.

### 4.3 Patrimonio: aislado por construcción

`patrimonio = Σ saldo(cuenta)` (maestro §4.3) y `saldo(cuenta)` se deriva de los
movimientos de esa cuenta (§4.2). Como la **cuenta** pertenece a un perfil, todo
lo derivado queda aislado sin un solo caso especial: patrimonio, gasto del mes,
sobrante, presupuesto, piso de ahorro y deudas.

Es la razón de fondo por la que el perfil vive en `fin_accounts` y no solo en
`fin_transactions`. Etiquetar movimientos sobre cuentas compartidas —lo que
hacía el intento anterior— dejaba tres cosas rotas:

1. *"El saldo de este perfil"* sería una ficción: si una cuenta tiene $500 con
   movimientos de dos perfiles, la plata es fungible.
2. **Rompería el piso de ahorro** (Sprint 7 §4.11), que valida cada gasto contra
   el saldo de la cuenta. ¿Contra cuál?
3. Ya se construyó y se tiró en cuatro días.

**Sin total consolidado.** El hero del Home muestra el patrimonio del perfil
activo y nada más.

**Costo aceptado:** si la plata de dos perfiles vive físicamente en la misma
cuenta bancaria, se crea la cuenta dos veces y se reparte el saldo a mano. Mover
plata entre perfiles son dos registros —un gasto en uno, un ingreso en el otro—,
que es lo que pasa de verdad entre dos entidades distintas.

### 4.4 Borrado y archivado

| Caso | Qué pasa |
|---|---|
| Perfil sin movimientos | Se borra (`DELETE`) |
| Perfil con movimientos | **409.** No se borra: se archiva (`archived = true`) |
| Perfil default | Ni una cosa ni la otra. **409 siempre** |
| Se archiva el perfil activo | La app salta al default |
| Perfil archivado | Sale del selector; sus datos quedan intactos y se puede reactivar |

Es la regla de cuentas (maestro §4.5) un nivel más arriba, y el `on delete
restrict` de §3.2 la garantiza en la base aunque falle la validación del server.

Por qué no un cascade: borrar un perfil con historia sería la acción más
destructiva de la app —N cuentas por meses de carga manual—, y esta app se
define por la entrada 100% manual (`contexto_finanzas.md` §1). Sumado a que los
movimientos no se mueven entre perfiles (§4.5), un borrado equivocado no se
desharía de ninguna forma.

### 4.5 Los movimientos no se mueven entre perfiles

No existe "cambiar este movimiento de perfil". Si se registró en el equivocado,
se borra y se vuelve a cargar.

**Consecuencia de diseño:** registrar en el perfil equivocado es el único error
irreversible que introduce este sprint. Por eso el acento (§4.8) y el nombre del
perfil en el quick-add (§7) no son adorno — son la mitigación.

### 4.6 El perfil activo vive en el dispositivo

`localStorage`, con el mismo patrón que `fz:hero` y `fz:hidden`
(`components/hero-pref.tsx`): arranca en el default y se corrige al montar, no
en el inicializador, porque en el prerender del servidor no hay `localStorage` y
pintar otra cosa sería un hydration mismatch.

```ts
const KEY = 'fz:profile'   // { id: string, accent: AccentKey }
```

**Se guarda el acento junto al id, no solo el id.** Es la misma lógica del
snapshot (`snapshot.ts`: *"$0 no es 'todavía no sé', es un número falso"*):
pintar el primer frame en verde para corregirlo a naranja medio segundo después
es un parpadeo que además dice algo falso sobre en qué perfil estás.

**El snapshot se cachea por perfil.** Hoy la clave es
`fz:snap:{VERSION}:{uid}` (`snapshot.ts`). Pasa a
`fz:snap:{VERSION}:{uid}:{profileId}` y **`VERSION` sube a 9**, que descarta los
snapshots viejos sin migrarlos. Sin esto, cambiar de perfil mostraría el
patrimonio del anterior en el primer frame — exactamente el número falso que el
snapshot existe para evitar.

### 4.7 Un perfil nuevo nace con categorías y nada más

Al crearlo se siembran las `SEED_CATEGORIES` (las mismas 14 del Sprint 1,
`lib/finanzas/types.ts`) en ese perfil. Nada más: sin cuentas, sin personas, sin
fijos, sin presupuestos, sin ahorros.

No se copia nada del perfil de origen. Clonar cuentas o fijos no se pidió y
tendría que decidir qué hacer con los saldos iniciales.

`POST /api/finanzas/seed` pasa a sembrar **en el perfil activo** y sigue siendo
idempotente: lee lo que ya existe en ese perfil e inserta solo lo que falta.

### 4.8 El acento por perfil

**Cómo funciona.** Hay 88 usos de `--fz-accent` en 31 archivos y **todos leen el
token** — ninguno tiene un hex escrito a mano. La app no tiene modo oscuro y
todos los tokens cuelgan de `#fz-root` (`theme.css:23`). Cambiar de perfil es
sobrescribir variables CSS en el nodo raíz: **cero componentes tocados**.

Se aplica **global**, no solo al hero y a los botones: así tiñe también la tab
bar activa, los focus rings y los sheets. Más visible, que es el objetivo, y
menos trabajo que scopearlo.

**Es un set de 4 tokens, no un color.** Cada paleta define:

| Token | Rol |
|---|---|
| `--fz-accent` | Superficies llenas: FAB, botones, tab activo |
| `--fz-accent-press` | El mismo, presionado |
| `--fz-accent-tint` | Fondos suaves |
| `--fz-glass-pill` | El acento al 10% — la píldora del tab bar |

Cambiar solo el primero deja los otros tres en verde y se ve sucio.

**`--fz-lime` se queda fija.** Es la contraparte del acento sobre el hero oscuro
y se usa en dos lugares (`sidebar.tsx`, `person-picker.tsx`). Que varíe por
perfil obligaría a encontrar cinco limas legibles sobre `--fz-hero`; que se
quede es un detalle que nadie va a notar. Si al implementar se ve mal con
naranja o violeta, se revisa entonces.

**⚠️ El azul está reservado: significa ahorro.** El sistema tiene cuatro roles
de color con significado fijo —marca, ingreso, gasto, ahorro— y el acento de
perfil tiene que esquivar los cuatro. El azul se eligió en la Ronda 9 del
Sprint 7 precisamente porque *"con el verde de la marca el botón 'Ahorrar' se
confundía con cualquier acción primaria"* (comentario en `theme.css`). Un perfil
con acento azul recrea ese bug dentro de ese perfil.

| Clave | Acento | Nota |
|---|---|---|
| `verde` | Verde bosque `#16613C` | La marca. Default del perfil default |
| `naranja` | Naranja tipo Claude | |
| `violeta` | Violeta | |
| `magenta` | Magenta | |
| `teal` | Teal oscuro | **Medir el hex**: roza el verde de la marca |
| — | ~~Azul~~ | Reservado para ahorro |

Los hexes concretos de naranja, violeta, magenta y teal se eligen al
implementar, con dos requisitos: 4.5:1 sobre `--fz-surface` para texto, y
distinguibles entre sí de un vistazo.

**El acento se guarda, no se deriva del orden.** Se asigna solo al crear —la
siguiente clave libre— y se puede cambiar después. Si dependiera de la posición,
borrar el perfil 2 recolorearía al 3 y el perfil que ya tenías identificado de
un vistazo cambiaría de color: exactamente lo que provoca registrar en el lugar
equivocado.

**Del sexto perfil en adelante las paletas se reciclan.** No se bloquea la
creación: el perfil funciona igual, solo repite color.

---

## 5. Estructura de archivos

### Nuevos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/2026XXXX_finanzas_perfiles.sql` | §3.6 |
| `lib/finanzas/profiles.ts` | `resolveProfile()`, `ensureDefaultProfile()`, `createProfile()` (con seed), las paletas y sus tokens |
| `app/api/finanzas/profiles/route.ts` | `GET` / `POST` |
| `app/api/finanzas/profiles/[id]/route.ts` | `PATCH` / `DELETE` |
| `app/api/finanzas/profiles/[id]/archive/route.ts` | `POST` — archivar y reactivar |
| `app/finanzas/screens/ajustes/perfiles.tsx` | La pantalla de gestión |
| `app/finanzas/components/profile-sheet.tsx` | Crear y editar (nombre + color) |
| `app/finanzas/components/profile-switcher.tsx` | El botón del header del Home y su sheet |
| `app/finanzas/components/profile-pref.tsx` | `useProfilePref()` — `localStorage` (§4.6) |

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/supabase-server.ts` | `requireProfile()` (§4.2) |
| `lib/finanzas/load.ts` | Las 11 `load*()` reciben `profileId` y filtran por él |
| `lib/finanzas/snapshot.ts` | Clave por perfil, `VERSION` → 9 |
| `app/api/finanzas/bootstrap/route.ts` | Resuelve el perfil (§4.1); devuelve `profiles` y `profile` |
| Las otras 40 rutas | `requireProfile()` en vez de `requireUser()`; `.eq('profile_id')` y `profile_id` en los inserts |
| `app/finanzas/components/data-context.tsx` | Expone `profiles`, `profile`, `setProfile()` |
| `app/finanzas/theme.css` | Las 5 paletas como clases o `data-accent` sobre `#fz-root` |
| `app/finanzas/screens/home.tsx` | El botón del selector, tercero del header |
| `app/finanzas/components/quick-add.tsx` | El nombre del perfil en el header |
| `app/finanzas/screens/ajustes/menu.tsx` | Fila "Perfiles"; aclarar que Tipo de cambio es global |
| `app/api/finanzas/seed/route.ts` | Siembra en el perfil activo |

---

## 6. Contratos de API

Todas las rutas del dominio pasan a aceptar `?profile=<id>`. Si no viene, el
default (§4.1).

### `GET /api/finanzas/profiles`

```jsonc
{
  "profiles": [
    { "id": "…", "name": "Personal", "accent": "verde",  "is_default": true,
      "archived": false, "has_movements": true },
    { "id": "…", "name": "Acero SRL", "accent": "naranja", "is_default": false,
      "archived": false, "has_movements": false }
  ],
  "active": "…"
}
```

`has_movements` es lo que decide si la UI ofrece **Borrar** o **Archivar** — sin
él la pantalla tendría que adivinar y mostrar un 409 después del click.

### `POST /api/finanzas/profiles`

`{ name, accent? }`. Si no viene `accent`, la siguiente clave libre. Crea el
perfil y **siembra sus categorías** en la misma operación (§4.7). Devuelve el
perfil creado.

### `PATCH /api/finanzas/profiles/[id]`

`{ name?, accent? }`. Renombrar y cambiar color, **también el default** (§4.4).

### `DELETE /api/finanzas/profiles/[id]`

- Con movimientos → **409** con `{ error, has_movements: true }`, para que la UI
  ofrezca archivar.
- Es el default → **409** siempre.
- Vacío → se borra.

### `POST /api/finanzas/profiles/[id]/archive`

`{ archived: boolean }`. El default → **409**. Si se archiva el activo, la
respuesta trae el nuevo activo (el default) para que el cliente se reubique sin
un segundo viaje.

### `GET /api/finanzas/bootstrap` — extendido

Suma dos campos a la respuesta que ya tiene:

```jsonc
{
  "uid": "…",
  "profiles": [ … ],   // para pintar el selector sin un segundo viaje
  "profile": "…",      // el activo que el server resolvió — puede NO ser el pedido (§4.1)
  // …todo lo demás, ya filtrado por ese perfil
}
```

Que el activo viaje en la respuesta es lo que cierra el caso del `?profile`
inválido: el cliente compara con su `localStorage` y se corrige.

---

## 7. UI

### El selector, en el header del Home

Hoy el header tiene el toggle del ojo y el engranaje de "qué mostrar arriba"
(`home.tsx:224-236`). El botón de perfil va **tercero**, con la misma forma:
círculo de 36px sobre `--fz-surface-sunk`.

- **Con un solo perfil no se muestra.** No hay nada que elegir.
- Al tocarlo, un sheet con la lista: nombre, un punto del color de cada uno, y
  el activo marcado. Los archivados no aparecen.
- Al pie del sheet, **"Gestionar perfiles"** → Ajustes → Perfiles.
- Cambiar de perfil **no recarga la página**: se actualiza el contexto, se
  vuelve a pedir `/bootstrap` con el nuevo id y se pinta el acento nuevo. El
  snapshot de ese perfil, si existe, evita el esqueleto.

### El acento, desde el primer frame

`useProfilePref()` lee `{ id, accent }` de `localStorage` al montar y aplica la
clase de paleta sobre `#fz-root`. El acento va en `localStorage` justamente para
no tener que esperar a `/bootstrap` (§4.6).

### El nombre del perfil en el quick-add

Una línea chica en el header del sheet, junto al título: **indicador, no
selector**. El quick-add se abre desde cualquier pantalla y es donde ocurre el
error irreversible (§4.5); el color ya lo cubre, pero el texto cubre el caso de
mirar la pantalla sin registrar el color.

No se puede cambiar de perfil desde el quick-add: sería un click de distancia
entre registrar bien y registrar mal.

### Ajustes → Perfiles

Una fila por perfil con su punto de color, el nombre, y un chip "Default" en el
que lo sea. Los archivados van en una sección aparte al final, con **Reactivar**.

Por perfil: **Renombrar**, **Cambiar color**, y **Borrar** o **Archivar** según
`has_movements`. El default no ofrece ninguna de las dos últimas.

Al pie, **Crear perfil**: nombre + color (precargado con la siguiente clave
libre). Al crearlo, la app **cambia a él** — es lo que uno espera después de
crear algo, y deja al usuario en el perfil vacío listo para cargar su primera
cuenta.

### Estado vacío de un perfil nuevo

El que ya existe (`home.tsx:205-218`): *"Empieza por tus cuentas"*. Funciona tal
cual, pintado con el acento del perfil nuevo.

### Ajustes → Tipo de cambio

Agregar una línea: **la tasa es global, se comparte entre todos los perfiles**
(§3.3). Sin eso, cambiarla en un perfil y verla cambiada en el otro parece un
bug.

---

## 8. Verificación

| # | Prueba | Tipo |
|---|---|---|
| 1 | La migración deja 0 filas con `profile_id` nulo en las 17 tablas | `db` |
| 2 | Todo lo cargado antes de la migración quedó en el default | `db` |
| 3 | Un usuario sin datos recibe su default en el primer `/bootstrap` | `api` |
| 4 | Dos perfiles con una cuenta cada uno → cada patrimonio ignora al otro | `unit` `api` |
| 5 | **Barrido de aislamiento:** para las 17 tablas, ninguna lectura del dominio devuelve filas de otro perfil | `api` |
| 6 | Un gasto registrado en el perfil B no aparece en Movimientos del A | `api` |
| 7 | El piso de ahorro del perfil A no ve lo apartado en el B | `unit` `api` |
| 8 | Presupuesto del A no cuenta gastos del B | `unit` `api` |
| 9 | Misma categoría "Servicios" en dos perfiles → no viola el unique | `db` |
| 10 | Misma persona en dos perfiles → dos filas, deudas separadas | `db` `api` |
| 10.1 | **Cada perfil puede tener su propio cajón de sastre** (único #6, §3.2.1) | `db` `api` |
| 10.3 | Cada perfil puede tener su línea de presupuesto para la misma categoría | `db` |
| 10.4 | Cerrar el mes en un perfil no lo marca cerrado en el otro | `db` `api` |
| 11 | Borrar un perfil con movimientos → 409 | `db` `api` |
| 12 | Borrar un perfil vacío → 200 | `api` |
| 13 | Borrar o archivar el default → 409 | `api` |
| 14 | Archivar el activo → la respuesta trae el default como nuevo activo | `api` |
| 15 | `?profile=` de otro usuario → cae al default, no 403 ni fuga | `api` |
| 16 | Un movimiento no puede referenciar una cuenta de otro perfil (FK compuesta) | `db` |
| 17 | Crear un perfil siembra sus 14 categorías y nada más | `api` |
| 18 | `accent` fuera del enum → rechazado; `'azul'` → rechazado | `db` |
| 19 | Dos perfiles del mismo usuario no pueden llamarse igual | `db` |
| 20 | Un solo `is_default` por usuario | `db` |
| 21 | Cambiar de perfil no reusa el snapshot del anterior | `unit` |
| 22 | El perfil activo sobrevive a recargar; no se contagia entre dispositivos | ⏳ manual |
| 23 | El acento pinta el primer frame, sin parpadeo verde | ⏳ manual |
| 24 | La tasa cambiada en un perfil se ve en el otro | `api` |

La **#5** es la que importa más: es la única forma honesta de saber que no quedó
un `.eq('profile_id')` sin poner entre 159 filtros.

Las #22 y #23 necesitan navegador real y dos dispositivos; no hay forma honesta
de automatizarlas.

---

## 9. Qué desbloquea este sprint

| Feature | Cómo se apoya |
|---|---|
| **#10 · Alertas (Sprint 9)** | Cada aviso va a tener que decir de qué perfil es — un fijo vencido en la empresa y uno en el personal no son el mismo aviso. `profile_id` ya está en `fin_recurring` y en `fin_budget_periods`, así que es cuestión de arrastrarlo al mensaje. ⚠️ Vercel Hobby sigue permitiendo **un solo cron por día** |
| **#8 · Reportes** (congelado) | Si vuelve, nace pudiendo comparar perfiles: todas las tablas ya saben de cuál es cada fila |
| **Cualquier feature futura** | A partir de acá, toda tabla nueva del dominio nace con `profile_id`. Es la tercera columna obligatoria, junto a `id` y `user_id` |

⚠️ **Recordatorio para el que siga:** el aislamiento entre perfiles es
**responsabilidad del código**, no de RLS (§3.5). Una tabla nueva sin
`profile_id`, o una consulta sin su `.eq()`, mezcla perfiles en silencio y la
base no va a avisar.
