# Ads Analizador — Sprint 1: "Fundaciones y motor de reglas"

> Documento maestro: `documento_maestro_ads_analizador.md`.
> Este documento especifica **únicamente el Sprint 1** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-09-28 · Estado: **construido**. Las desviaciones
> respecto de lo especificado están en §0.2 y mandan sobre el resto.

---

## 0.2 Lo que cambió al construirlo

- **FK compuesta en las tablas hijas.** `(campaign_id, user_id) →
  ads_campaigns(id, user_id)`. Con `user_id` denormalizado (§0.1) hacía falta: la
  FK simple se chequea saltándose RLS, y sin la compuesta alguien podía colgar
  una fila suya de la campaña de otro. Probado en `api.mjs`.
- **`created_by` no existe**: duplicaba `user_id`. **`ultima_sync`** se agregó a
  `ads_campaigns` para el "Última sincronización hace 6 h" del home.
- **`EstadoCampana` suma `accion` y `colchon`.** `accion` (`sin_datos`,
  `frenar`, `esperar`, `escalar_horizontal`, `escalar_vertical`) es lo que la UI
  traduce a "Qué hacer"; el color solo no alcanzaba.
- **Estado `sin_datos` antes de todas las reglas.** Sin un solo día de Meta, la
  regla 1 decía "en aprendizaje: 0 de 50" de una campaña que nunca sincronizó.
- **Bug encontrado y corregido:** un día con venta cargada pero sin datos de
  Meta (anotar las ventas de hoy antes del sync) movía el ancla de la ventana de
  7 días y le restaba resultados — una campaña sana podía pasar a "en
  aprendizaje" solo por cargar ventas. `FilaDiaria.soloVenta` hace que esos días
  cuenten sus conversiones sin mover la ventana.
- Migración: `supabase/migrations/20260928000000_ads_analizador_foundation.sql`,
  aplicada.

**Verificación:** `node tests/ads-analizador/run.mjs unit` → 114/114, incluidos
los dos casos del maestro (§4.9).

## 0. Por qué este sprint primero

Sin tablas ni ruta no hay dónde correr nada de lo demás. Y las reglas de
negocio (`calc.ts`) son la única pieza que no depende de Meta, de Stripe ni de
ninguna pantalla: son funciones puras que reciben filas y devuelven banderas.
Escribirlas ahora, con tests desde el día uno y contra los dos casos reales
del maestro, evita el riesgo que el propio maestro señala — que la app termine
siendo "solo un espejo de Ads Manager" si las reglas se improvisan al final,
mezcladas con la UI.

### 0.1 Corrección respecto al maestro: RLS de las tablas hijas, sin join

El maestro (sección "Modelo de datos") propone resolver el dueño de
`ads_metricas_diarias`, `ads_ventas_manuales`, `ads_pagos_stripe` y
`ads_cambios_log` "vía join implícito por `campaign_id`... igual que se
resuelve en `gas_movimientos` vía `auto_id`".

Revisando `gas_movimientos` (`supabase/migrations/20260828010000_gas_autos_y_movimientos.sql`)
eso **no es lo que hace**: la tabla tiene su propia columna `user_id`,
denormalizada, y su policy es `auth.uid() = user_id` directo, sin ningún join
a `gas_autos`. El maestro describió mal su propio precedente.

El patrón denormalizado es mejor: una policy sin subquery es más simple y no
paga el costo de resolver el dueño fila por fila. Este sprint denormaliza
`user_id` en las cuatro tablas hijas de la misma forma — un campo más al
insertar, cuatro policies más simples, cero joins en el camino caliente.

---

## 1. Objetivo del sprint

Que la mini-app exista — tablas, acceso, esqueleto de pantallas — y que el
motor de reglas de negocio esté escrito y probado contra los dos casos reales
del maestro. Al terminar este sprint **no hay ninguna pantalla usable
todavía**, pero todo lo que se construya después se apoya en algo que ya
compila y ya pasa tests.

### Definición de "terminado"

- [ ] Migración aplicada: 5 tablas + RLS completo + fila en `projects`
- [ ] `/ads-analizador` gatea con `<AccessGate project="ads-analizador">` y
      muestra una pantalla placeholder ("Próximamente")
- [ ] Router propio (`createMiniAppRouter('/ads-analizador')`), sin
      `next/link` ni `usePathname` dentro de la mini-app
- [ ] `lib/ads-analizador/calc.ts` implementa las 7 reglas de negocio del
      maestro como funciones puras, sin acceso a red ni a Supabase
- [ ] Los dos casos de "Ejemplo de uso inicial" del maestro (TOEFL y Ebook
      TOEFL Bolivia) están escritos como test y pasan
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

- Las 5 tablas de una sola vez — están relacionadas por FK entre sí, así que
  partirlas en más de un sprint solo demoraría lo mismo en dos pasos.
- Scaffolding completo de la mini-app: `layout.tsx`, `router.tsx`,
  `screens/paths.ts` + `index.tsx` (pantalla placeholder), sin pantallas
  reales.
- `lib/ads-analizador/types.ts` y `lib/ads-analizador/calc.ts` + sus tests.

### No entra (y en qué sprint entra)

| Fuera | Por qué / dónde |
|---|---|
| CRUD real de campañas (alta, edición, borrado) | Sprint 2 |
| Cualquier llamada a Meta o Stripe | Sprint 3 |
| Cualquier pantalla más allá del placeholder | Sprints 2 y 4 |
| `lib/ads-analizador/load.ts` (lee de Supabase) | Sprint 2 — este sprint no toca la base desde código, solo la crea |

---

## 3. Modelo de datos

Las 5 tablas del maestro, con `user_id` denormalizado en las cuatro hijas
(§0.1) y los índices que ese patrón necesita.

```sql
-- Ads Analizador · Sprint 1 — fundaciones.
-- Una madre (campañas que el usuario decidió trackear) y cuatro hijas que
-- cuelgan de campaign_id. Las cuatro hijas llevan también su propio user_id
-- para que el RLS no necesite join — ver §0.1.

create table if not exists ads_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  meta_campaign_id   text not null,
  meta_ad_account_id text not null,
  nombre             text not null,
  moneda             text not null check (moneda in ('USD','BOB')),
  tipo_conversion    text not null check (tipo_conversion in ('compra_stripe','venta_manual')),
  precio_venta       numeric(10,2) not null check (precio_venta > 0),
  margen_venta       numeric(10,2) not null check (margen_venta > 0),
  roas_objetivo      numeric(4,2) check (roas_objetivo is null or roas_objetivo > 0),
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (user_id, meta_campaign_id)
);

create index if not exists ads_campaigns_user_idx on ads_campaigns (user_id);

create table if not exists ads_metricas_diarias (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid not null references ads_campaigns(id) on delete cascade,
  fecha               date not null,
  gasto               numeric(10,2) not null default 0,
  alcance             int,
  impresiones         int,
  frecuencia          numeric(5,2),
  cpm                 numeric(10,4),
  clics_enlace        int,
  cpc_enlace          numeric(10,4),
  ctr_enlace          numeric(6,4),
  resultados          int not null default 0,   -- evento optimizado que reporta Meta (compra o "conversación iniciada")
  costo_por_resultado numeric(10,4),
  landing_page_views  int,                       -- solo aplica a compra_stripe
  pagos_iniciados     int,                       -- solo aplica a compra_stripe
  raw_json            jsonb,                     -- respuesta cruda de Meta, por si hace falta reprocesar
  unique (campaign_id, fecha)
);

create index if not exists ads_metricas_user_idx     on ads_metricas_diarias (user_id);
create index if not exists ads_metricas_campaign_idx on ads_metricas_diarias (campaign_id, fecha desc);

create table if not exists ads_ventas_manuales (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references ads_campaigns(id) on delete cascade,
  fecha        date not null,
  cantidad     int not null check (cantidad >= 0),  -- ventas confirmadas reales de ese día, no el evento de Meta
  nota         text,
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, fecha)
);

create index if not exists ads_ventas_user_idx on ads_ventas_manuales (user_id);

create table if not exists ads_pagos_stripe (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid not null references ads_campaigns(id) on delete cascade,
  fecha               date not null,
  compras_exitosas    int not null default 0,       -- ventas confirmadas reales de ese día
  monto_total         numeric(10,2) not null default 0,
  pagos_fallidos      int not null default 0,
  pagos_incompletos   int not null default 0,
  tres_ds_solicitados int not null default 0,
  tres_ds_exitosos    int not null default 0,
  decline_reasons     jsonb,  -- {"do_not_honor": 3, "insufficient_funds": 1, ...}
  unique (campaign_id, fecha)
);

create index if not exists ads_pagos_user_idx on ads_pagos_stripe (user_id);

create table if not exists ads_cambios_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references ads_campaigns(id) on delete cascade,
  fecha       timestamptz not null default now(),
  tipo        text not null check (tipo in ('presupuesto','creativo','audiencia','otro')),
  detalle     text,
  created_by  uuid references auth.users(id)
);

create index if not exists ads_cambios_user_idx     on ads_cambios_log (user_id);
create index if not exists ads_cambios_campaign_idx on ads_cambios_log (campaign_id, fecha desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Misma forma en las cinco tablas: select/insert/update/delete contra
-- auth.uid() = user_id, sin ningún join (§0.1).

alter table ads_campaigns        enable row level security;
alter table ads_metricas_diarias enable row level security;
alter table ads_ventas_manuales  enable row level security;
alter table ads_pagos_stripe     enable row level security;
alter table ads_cambios_log      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ads_campaigns', 'ads_metricas_diarias', 'ads_ventas_manuales',
    'ads_pagos_stripe', 'ads_cambios_log'
  ]
  loop
    execute format('drop policy if exists "ads: ver propios (%1$s)" on %1$s', t);
    execute format('drop policy if exists "ads: crear propios (%1$s)" on %1$s', t);
    execute format('drop policy if exists "ads: actualizar propios (%1$s)" on %1$s', t);
    execute format('drop policy if exists "ads: borrar propios (%1$s)" on %1$s', t);

    execute format('create policy "ads: ver propios (%1$s)" on %1$s for select using (auth.uid() = user_id)', t);
    execute format('create policy "ads: crear propios (%1$s)" on %1$s for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "ads: actualizar propios (%1$s)" on %1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "ads: borrar propios (%1$s)" on %1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ── Registro en el Hub ──────────────────────────────────────────────────
insert into projects (name, slug, description)
values ('Ads Analizador', 'ads-analizador', 'Próximamente')
on conflict (slug) do nothing;
```

Archivo: `supabase/migrations/<timestamp>_ads_analizador_foundation.sql`.

---

## 4. El motor de reglas — `lib/ads-analizador/calc.ts`

### 4.1 Dos fuentes de "conversión", no una

Esta es la distinción más importante del sprint, y el maestro no la separa
explícitamente. Cada fila de `ads_metricas_diarias` trae `resultados`: el
evento optimizado que reporta **Meta**. Para `compra_stripe` ese evento
suele ser la compra; para `venta_manual` es "conversación iniciada" — **no**
la venta real, que se carga a mano en `ads_ventas_manuales`.

Si `calc.ts` usara `resultados` como si fuera siempre "la venta", el foco
rojo de "0 ventas en varios días" (regla 4) nunca dispararía para una
campaña de WhatsApp que genera conversaciones pero no cierra ninguna — que es
exactamente el caso que la app tiene que agarrar. Por eso la entrada de
`calc.ts` separa las dos señales por día:

```ts
export interface FilaDiaria {
  fecha: string;               // YYYY-MM-DD
  gasto: number;
  resultadosMeta: number;      // evento optimizado de Meta — regla 1 (aprendizaje)
  conversionesReales: number;  // venta/compra confirmada ese día — reglas 4 y 5
  frecuencia: number | null;
}
```

`conversionesReales` sale de `ads_pagos_stripe.compras_exitosas` (tipo
`compra_stripe`) o de `ads_ventas_manuales.cantidad` (tipo `venta_manual`) —
esa traducción vive en `load.ts` (Sprint 2), no en `calc.ts`, que no toca la
base.

### 4.2 Entrada y salida de `calcularEstado`

```ts
export interface EntradaCalculo {
  tipoConversion: 'compra_stripe' | 'venta_manual';
  precioVenta: number;
  margenVenta: number;
  roasObjetivoManual: number | null;   // override guardado en ads_campaigns.roas_objetivo
  metricas: FilaDiaria[];              // historial completo, orden ascendente por fecha
  conversionesConfirmadas: number;     // acumulado histórico — regla 5
  ingresoTotal: number;                // acumulado histórico — ver §4.5
  gastoTotal: number;                  // acumulado histórico
  ultimoCambioFecha: string | null;    // fecha del cambio más reciente en ads_cambios_log
  hoy: string;                         // fecha de referencia, inyectada
}

export interface Bandera {
  tipo: 'foco_rojo' | 'en_aprendizaje' | 'muestra_chica'
      | 'reajuste_tecnico' | 'ventana_decision' | 'fatiga_audiencia';
  detalle?: Record<string, unknown>;   // ej. { motivo: 'gasto_sin_resultados' } o { hasta: '2026-10-03' }
}

export interface EstadoCampana {
  color: 'verde' | 'amarillo' | 'rojo';
  mensaje: string;
  banderas: Bandera[];
  roasEquilibrio: number;
  roasObjetivo: number;
  roasActual: number | null;   // null si gastoTotal === 0 — todavía no hay nada que dividir
}

export function calcularEstado(e: EntradaCalculo): EstadoCampana
```

**`hoy` se recibe como parámetro, nunca `new Date()` adentro de la
función.** Mismo problema que ya resolvió Finanzas en varios sprints: el
servidor de Vercel corre en UTC, y una función pura que decide sola "qué día
es hoy" se desincroniza de la fecha real del usuario en Bolivia.

### 4.3 Constantes (todas exportadas — nada de números mágicos sueltos)

```ts
export const RESULTADOS_MINIMOS_APRENDIZAJE = 50;
export const DIAS_VENTANA_APRENDIZAJE       = 7;
export const CONVERSIONES_MINIMAS_MUESTRA   = 10;
export const MULTIPLICADOR_ROAS_OBJETIVO    = 1.35;
export const MULTIPLICADOR_FOCO_ROJO_GASTO  = 2.5;
export const DIAS_SIN_VENTA_FOCO_ROJO       = 3;
export const DIAS_REAJUSTE_TECNICO          = 4;
export const DIAS_VENTANA_DECISION          = 7;
export const FRECUENCIA_FATIGA              = 3.5;
```

`roas_objetivo` ya es editable por campaña en la base (columna nullable). Las
demás quedan fijas en código por ahora — si algún día hace falta que
`FRECUENCIA_FATIGA` sea por campaña, es agregar una columna y leerla en vez de
la constante, no rediseñar la función.

### 4.4 Fórmulas base

```ts
roasEquilibrio = precioVenta / margenVenta;
roasObjetivo   = roasObjetivoManual ?? roasEquilibrio * MULTIPLICADOR_ROAS_OBJETIVO;
roasActual     = gastoTotal > 0 ? ingresoTotal / gastoTotal : null;
```

### 4.5 De dónde sale `ingresoTotal`

No es `conversionesConfirmadas * precioVenta` para las dos igual:

- **`compra_stripe`**: suma de `ads_pagos_stripe.monto_total` — plata real
  cobrada, no una estimación.
- **`venta_manual`**: `conversionesConfirmadas * precioVenta` — no hay otra
  fuente, porque la venta se cierra fuera de la app.

Esta distinción vive en `load.ts` (Sprint 2); `calc.ts` recibe `ingresoTotal`
ya resuelto y no necesita saber de dónde vino.

### 4.6 Detección de foco rojo temprano (regla 4)

Dos condiciones independientes, cualquiera dispara:

```ts
function detectarFocoRojo(e: EntradaCalculo): Bandera | null {
  // 4a — gasto alto sin una sola conversión real, desde el arranque
  if (e.gastoTotal >= MULTIPLICADOR_FOCO_ROJO_GASTO * e.margenVenta
      && e.conversionesConfirmadas === 0) {
    return { tipo: 'foco_rojo', detalle: { motivo: 'gasto_sin_resultados' } };
  }

  // 4b — los últimos N días corridos, todos con gasto y cero conversión real,
  // y esos días ya sumaron al menos el margen de una venta
  const ultimos = ultimosNDias(e.metricas, e.hoy, DIAS_SIN_VENTA_FOCO_ROJO);
  const todosSinVenta = ultimos.length === DIAS_SIN_VENTA_FOCO_ROJO
    && ultimos.every(d => d.gasto > 0 && d.conversionesReales === 0);
  const gastoDeEsosDias = sum(ultimos.map(d => d.gasto));
  if (todosSinVenta && gastoDeEsosDias >= e.margenVenta) {
    return { tipo: 'foco_rojo', detalle: { motivo: 'sin_ventas_dias' } };
  }

  return null;
}
```

Nota deliberada: usa `conversionesReales` (real), no `resultadosMeta` — por
la razón de §4.1. Una campaña de WhatsApp con conversaciones pero cero
cierres tiene que poder disparar esto.

### 4.7 Cooldown por cambios (regla 6)

```ts
function calcularCooldown(ultimoCambioFecha: string | null, hoy: string) {
  if (!ultimoCambioFecha) return { reajusteTecnico: false, ventanaDecision: false };
  const dias = diferenciaDias(hoy, ultimoCambioFecha);
  return {
    reajusteTecnico: dias < DIAS_REAJUSTE_TECNICO,
    ventanaDecision: dias < DIAS_VENTANA_DECISION,
  };
}
```

Con `dias < 4` las dos son `true` a la vez — eso es correcto e intencional:
"en reajuste técnico" implica que también sigue la ventana de decisión
abierta. El mensaje que se muestra usa siempre la más restrictiva
(reajuste técnico gana si las dos son ciertas).

### 4.8 Prioridad cuando varias banderas aplican a la vez

El maestro define 7 reglas pero no dice qué gana si varias son ciertas el
mismo día, y el home necesita **un** color por campaña. Este sprint fija el
orden, de más a menos urgente:

1. **🔴 Foco rojo temprano** (regla 4) — no espera nada, ni aprendizaje ni
   muestra chica lo tapan: plata quemándose sin ninguna conversión real es la
   señal más cara de ignorar, y por eso el maestro ya la llama "no hace falta
   esperar 7 días para estos".
2. **🟡 En aprendizaje** (regla 1) — silencia cualquier lectura de ROAS: con
   menos de 50 resultados de Meta en 7 días, ni "sano" ni "colchón agotado"
   son afirmaciones confiables todavía.
3. **🟡 Muestra chica** (regla 5) — mismo espíritu, pero puede seguir activa
   después de pasar la fase de aprendizaje: una campaña de ticket alto puede
   tardar semanas en juntar 10 conversiones aunque ya tenga 50 resultados de
   Meta.
4. **🟡 Reajuste técnico / ventana de decisión** (regla 6) — no se sugiere
   escalar ni frenar mientras el algoritmo se reacomoda o la ventana sigue
   abierta, salvo que ya haya disparado un foco rojo (por eso va después de
   la regla 4, nunca antes).
5. Descartadas las cuatro anteriores, recién ahí se lee el colchón real
   (reglas 2 y 3):
   - `roasActual === null` → 🟡 "todavía no hay gasto registrado" (campaña
     recién dada de alta, sin sync — cubre el caso del Sprint 2 sin que haga
     falta un chequeo aparte en la UI).
   - `roasActual < roasEquilibrio` → 🔴. **Esto es una extensión del sprint,
     no una regla textual del maestro**: el maestro explica el colchón
     (regla 3) y el objetivo, pero nunca dice qué pasa si el ROAS cae *por
     debajo* del equilibrio mismo. Ahí la campaña pierde plata contando
     margen — este sprint lo trata como rojo, al mismo nivel que un foco
     rojo, pero a diferencia de la regla 4 **sí** queda tapado por
     aprendizaje/muestra chica/cooldown (no es "urgente" en el mismo
     sentido: es una lectura de ROAS, y una lectura de ROAS no confiable no
     debe pintar de rojo nada).
   - `roasEquilibrio <= roasActual < roasObjetivo` → 🟡 "colchón por debajo
     del objetivo — prueba un anuncio o audiencia nueva antes de subir
     presupuesto" (regla 3, texto casi literal del maestro).
   - `roasActual >= roasObjetivo` → 🟢 "sano, puedes seguir escalando
     verticalmente".
6. **Fatiga de audiencia** (regla 7) **nunca cambia el color**: se agrega
   siempre a `banderas` como badge secundario, superpuesto a cualquiera de
   los estados de arriba — es una señal de "refrescar creativo", no de plata
   en riesgo inmediato.

### 4.9 Los dos casos del maestro, como test

El maestro los da como "datos de prueba" (sección "Ejemplo de uso inicial").
Van tal cual a `tests/ads-analizador/unit.mjs`:

| Caso | Entrada | Se espera |
|---|---|---|
| **TOEFL** (`compra_stripe`, USD) | `precioVenta=24, margenVenta=24, costoPorResultado≈18.80` → `roasEquilibrio=1.0`, `roasObjetivo=1.35` (sin override), fuera de aprendizaje, fuera de muestra chica, sin foco rojo, sin cambio reciente | `roasActual ≈ 1.28`, entre equilibrio y objetivo → 🟡, bandera vacía de las cuatro primeras, mensaje sugiere ángulo/audiencia nueva, no presupuesto |
| **Ebook TOEFL Bolivia** (`venta_manual`, BOB) | `precioVenta=25, margenVenta=25, costoPorVenta≈13.59` → `roasEquilibrio=1.0`, `roasObjetivo=1.35` | `roasActual ≈ 1.84`, por encima del objetivo → 🟢 |

⚠️ **Nota de precisión, no de negocio:** el maestro dice "ROAS ≈ 1.33x" para
TOEFL con esos mismos números aproximados (`24 / 18.80 = 1.28`, no `1.33`).
Es un redondeo suelto del maestro, no un error de fórmula — con los números
tal cual están escritos ahí, `1.28` es lo que da `precioVenta / costoPorResultado`.
El test fija los números exactos de arriba y verifica la conclusión
cualitativa del maestro (🟡, "prueba algo nuevo, no subas presupuesto"), que
es lo que realmente importa y no depende del redondeo.

---

## 5. Estructura de archivos

### Nuevos

```
app/ads-analizador/
  layout.tsx                    AccessGate + Provider + shell (mínimo, sin diseño final)
  [[...slug]]/page.tsx           única ruta; generateStaticParams
  router.tsx                    createMiniAppRouter('/ads-analizador')
  screens/
    paths.ts                    URLs (sin 'use client')
    index.tsx                   resuelve pantalla — hoy solo placeholder

lib/ads-analizador/
  types.ts                      EntradaCalculo, Bandera, EstadoCampana, FilaDiaria
  calc.ts                       calcularEstado + funciones de §4

tests/ads-analizador/
  run.mjs                       compila lib/ads-analizador con tsc a .ads/, corre unit (+ api cuando exista)
  unit.mjs                      los tests de §4.9 y de cada regla por separado

supabase/migrations/
  <timestamp>_ads_analizador_foundation.sql
```

`run.mjs` sigue el patrón exacto de `tests/gas/run.mjs`: compila con
`--rootDir lib/ads-analizador` para que la salida caiga plana, reescribe
imports relativos a `.mjs` para Node ESM, y limpia el directorio temporal al
terminar.

### No se toca en este sprint

`app/api/ads-analizador/`, `lib/ads-analizador/load.ts`, `meta-api.ts`,
`stripe-api.ts`, `format.ts` — todos llegan en sprints posteriores.

---

## 6. UI

Una sola pantalla, sin diseño final:

```
/ads-analizador
──────────────────────────────
   Ads Analizador
   Próximamente.
```

Suficiente para verificar que el gate, el router y el registro en `projects`
funcionan de punta a punta antes de construir nada real encima.

---

## 7. Verificación

```bash
node tests/ads-analizador/run.mjs unit
```

| # | Prueba |
|---|---|
| 1 | Caso TOEFL (§4.9) da 🟡 con el mensaje de "ángulo/audiencia nueva" |
| 2 | Caso Ebook TOEFL Bolivia (§4.9) da 🟢 |
| 3 | `gastoTotal === 0` → `roasActual === null`, color 🟡 sin ninguna otra bandera |
| 4 | Foco rojo 4a dispara con 0 conversiones y gasto ≥ 2.5× margen, incluso con 2 días de vida | 
| 5 | Foco rojo 4b dispara con 3 días seguidos sin conversión real y gasto acumulado ≥ margen, aunque `resultadosMeta` de esos días sea alto (caso WhatsApp: conversaciones sí, ventas no) |
| 6 | En aprendizaje (`resultadosMeta` < 50 en 7 días) tapa un colchón que de otra forma sería 🔴 por debajo de equilibrio |
| 7 | Muestra chica sigue activa después de pasar aprendizaje si `conversionesConfirmadas < 10` |
| 8 | `reajusteTecnico` y `ventanaDecision` son ambas `true` cuando el cambio fue hace 2 días; solo `ventanaDecision` cuando fue hace 5 |
| 9 | Fatiga de audiencia aparece como bandera sin cambiar el color de una campaña 🟢 |
| 10 | `/ads-analizador` responde 401/redirect sin sesión y sin el proyecto asignado |
| 11 | `npm run build` pasa sin errores |

---

## 8. Qué desbloquea

| Qué | Cómo |
|---|---|
| **Sprint 2** | Necesita `ads_campaigns` para el CRUD y `calcularEstado` para pintar el semáforo del home, aunque sea con datos vacíos |
| **Sprint 3** | Sincroniza hacia las cuatro tablas hijas que ya existen con su forma final |
| **Sprint 4** | Los dashboards por campaña solo arman UI sobre banderas que `calc.ts` ya sabe producir |
