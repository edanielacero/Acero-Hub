# Ads Analizador — Documento Maestro de Planificación

## Qué es

Mini-app para monitorear campañas de Facebook/Meta Ads sin tener que abrir
Ads Manager, Stripe y una hoja de cálculo por separado cada vez. Sincroniza
en **modo lectura** las métricas de Meta (spend, alcance, CTR, resultados,
etc.), cruza automáticamente los pagos reales de **Stripe** para las
campañas que venden por checkout, permite **cargar manualmente** las ventas
de las campañas que cierran por chat (WhatsApp/Messenger), y aplica un
conjunto de reglas de decisión (fase de aprendizaje, ROAS de equilibrio,
cuándo escalar, cuándo frenar) para que el dashboard diga directamente
"todavía es pronto", "sano, puedes escalar" o "cuidado, revisa esto" en vez
de solo mostrar números sueltos.

No cambia nada en Meta ni en Stripe — es de solo lectura hacia esas dos
APIs. Lo único que escribe son sus propias tablas (campañas trackeadas,
ventas manuales, historial de cambios).

## Contexto de negocio (las reglas que tiene que aplicar)

> **2026-10-08:** las reglas 1, 3, 4 y 6 de esta lista quedaron reemplazadas
> por las "Reglas v2 · Low Ticket y High Ticket" (ciclos, corte por ventana,
> modelo de Poisson, llamadas). Ver `sprint_5_reglas_v2.md`.

Esto no es una preferencia de diseño, es el motivo de ser de la app: sin
estas reglas, es solo un espejo de Ads Manager. Vienen de un análisis real
de dos campañas (una vendiendo por Stripe, otra por WhatsApp) y deben quedar
como lógica de negocio, no como texto de ayuda.

1. **Fase de aprendizaje.** Un conjunto de anuncios necesita ~50 resultados
   del evento optimizado en 7 días para estabilizarse. Si en los últimos 7
   días corridos los `resultados` acumulados de una campaña están por debajo
   de 50, se marca **"en aprendizaje"** y no se resaltan tendencias del costo
   por resultado como si fueran definitivas.
2. **ROAS de equilibrio, no un número fijo.** `roas_equilibrio = precio_venta
   / margen_venta`. Con márgenes cercanos al 100% (típico en digital/servicio)
   da ~1.0x; con costo de producto (físico, comisiones) sube. Nunca usar 1.0x
   ni ningún otro número como umbral universal — sale de estos dos campos por
   campaña.
3. **Colchón, no el punto de equilibrio.** El semáforo de "puedes seguir
   escalando verticalmente" no se apaga en `roas_equilibrio`, se apaga a un
   **30-40% por encima** de ese punto (`roas_objetivo` default =
   `roas_equilibrio * 1.35`, editable por campaña). Por debajo de eso, la
   sugerencia de la app cambia de "sube presupuesto" a "prueba un anuncio o
   audiencia nueva" (escalar horizontal en vez de vertical).
4. **Focos rojos tempranos** (no hace falta esperar 7 días para estos):
   - Gasto acumulado ≥ 2.5× el margen por venta con **cero** resultados.
   - 0 ventas en varios días seguidos ya con gasto significativo.
5. **Muestra chica.** Con menos de ~10 conversiones confirmadas (compras o
   ventas manuales), cualquier ROAS o costo por resultado se marca como
   "muestra chica — no tomes decisiones grandes con esto todavía", sin
   importar qué tan bueno o malo se vea el número.
6. **Reloj de cambios, por campaña.** Cada vez que se registra un cambio
   (presupuesto, creativo, audiencia), la campaña entra en:
   - **Reajuste técnico** (4 días): los números pueden estar inestables por
     el algoritmo reacomodándose. La UI lo marca, no oculta los datos.
   - **Ventana de decisión** (7 días desde el cambio): la app no sugiere un
     nuevo cambio grande antes de esa fecha, salvo que dispare un foco rojo
     temprano (regla 4).
7. **Fatiga de audiencia.** Frecuencia ≥ 3.5 (configurable) marca "la misma
   audiencia está viendo el anuncio muchas veces" — motivo para refrescar
   creativo o ampliar audiencia, no para seguir subiendo presupuesto.

Todo esto vive en `lib/ads-analizador/calc.ts` como funciones puras
(entrada: filas de métricas; salida: banderas), no como texto hardcodeado en
las pantallas — así se puede testear y ajustar los umbrales sin tocar UI.

## Proyecto individual dentro del Hub

- **Slug:** `ads-analizador`
- **Ruta:** `/ads-analizador`
- **Acceso:** mini-app privada, mismo patrón que Gas/Trading Journal — fila
  en `projects`, acceso vía `project_access`, gate con `<AccessGate
  project="ads-analizador">`.
- **Tablas propias:** `ads_campaigns`, `ads_metricas_diarias`,
  `ads_ventas_manuales`, `ads_pagos_stripe`, `ads_cambios_log` — prefijo
  `ads_`, igual que `gas_*` o `fin_*`.

## Decisiones de arquitectura

**Dos tipos de campaña, un solo modelo.** En vez de dos mini-apps o dos
flujos separados, cada fila de `ads_campaigns` tiene un
`tipo_conversion`:

- `compra_stripe` — el checkout es Stripe. Las ventas se sincronizan solas
  desde la API de Stripe (Payment Intents). El dashboard es puramente de
  lectura: no hay nada que cargar a mano.
- `venta_manual` — la venta se cierra fuera de Meta (WhatsApp, chat). El
  dashboard trae de Meta hasta "conversación iniciada", y el usuario carga
  la cantidad de ventas de cada día con un formulario de un solo campo.

Esto evita construir dos dashboards separados: la pantalla es la misma
plantilla de funnel, con el último escalón viniendo de una fuente distinta
según el tipo.

**Campañas se agregan desde la app, no se auto-descubren todas.** El
usuario decide qué trackear (así lo pidió explícitamente): un formulario
"+ Agregar campaña" deja pegar el ID de campaña de Meta directamente, o
elegir de una lista corta que la app trae en vivo desde `GET
/{ad_account_id}/campaigns` filtrando por activas. Al agregar, se pide
también: cuenta publicitaria, moneda, tipo de conversión, precio de venta y
margen. Nada de esto sincroniza campañas que el usuario no dio de alta.

**Sync: al abrir la app + botón manual, sin cron.** *(Actualizado
2026-09-28; la versión original proponía un cron diario de Vercel.)* La app
sincroniza sola al abrirse si alguna campaña activa tiene más de 6 horas sin
sincronizar, y con el botón "Actualizar". La ruta solo acepta un usuario
logueado y corre con RLS: no hay secreto de cron ni cliente admin. Los números
solo importan cuando alguien los mira, y así `vercel.json` no se toca.

**Atribución Stripe → campaña (limitación real, no ignorarla).** Stripe no
sabe de por sí qué campaña de Meta generó un pago. Mientras exista **un solo
checkout de Stripe activo a la vez**, se asume que todo pago de esa cuenta
de Stripe pertenece a la campaña `compra_stripe` activa — es una
simplificación válida para el caso de uso de hoy (una campaña de curso, un
checkout). Si el día de mañana hay más de una campaña vendiendo por el mismo
checkout, hace falta pasar un identificador de campaña en los `metadata` del
Payment Intent (por ejemplo, vía parámetro de URL → pixel → metadata al
crear la sesión de checkout) para poder separarlos. Documentar esto como
deuda conocida, no resolverlo ahora.

**Sigue las 4 reglas de `documentos/arquitectura/mini-apps.md` sin
excepción:** sin middleware, gate en el cliente vía `<AccessGate>`, sesión
refrescada por `<SessionKeeper/>` (ya global), una sola ruta Next
(`[[...slug]]/page.tsx` + `generateStaticParams`), router propio
(`createMiniAppRouter('/ads-analizador')`), nunca `next/link` ni
`usePathname` dentro de la mini-app.

## Estructura de archivos (propuesta)

```
app/ads-analizador/
  layout.tsx                    AccessGate + Provider + shell
  [[...slug]]/page.tsx          única ruta; generateStaticParams
  router.tsx                    createMiniAppRouter('/ads-analizador')
  screens/
    paths.ts                    URLs (sin 'use client')
    index.tsx                   resuelve pantalla desde segmentos
    home.tsx                    lista de campañas + semáforo de estado
    agregar-campana.tsx         alta: pegar ID o elegir de lista de Meta
    campana-stripe.tsx          dashboard funnel para tipo compra_stripe
    campana-whatsapp.tsx        dashboard funnel + carga de venta manual
    ajustes-campana.tsx         editar precio/margen/roas objetivo, pausar
  components/
    campaign-card.tsx           tarjeta de campaña en el home (semáforo)
    funnel-chart.tsx            embudo alcance→clics→…→venta
    roas-badge.tsx              ROAS actual / equilibrio / colchón
    estado-badges.tsx           aprendizaje / cooldown / fatiga / foco rojo
    ventas-manuales-form.tsx    input de ventas del día
    decline-reasons-table.tsx   solo para compra_stripe

app/api/ads-analizador/
  campaigns/route.ts                    GET listar, POST crear
  campaigns/[id]/route.ts               GET detalle, PATCH editar, DELETE
  campaigns/[id]/ventas/route.ts        POST/PATCH venta manual de un día
  campaigns/[id]/cambios/route.ts       POST registrar cambio (presupuesto/creativo/audiencia)
  meta/campaigns-disponibles/route.ts   GET campañas activas del ad account (para el picker)
  sync/route.ts                         al abrir la app + botón manual: Meta + Stripe

lib/ads-analizador/
  types.ts
  load.ts          cargarCampanas, cargarMetricas, cargarVentas
  calc.ts          roasEquilibrio, colchon, banderas de estado (regla de negocio, puro)
  meta-api.ts      cliente delgado sobre Graph API (Insights + Campaigns)
  stripe-api.ts    cliente delgado sobre Stripe (Payment Intents, decline reasons, 3DS)
  format.ts        formateo de moneda multi-divisa (USD/BOB)

supabase/migrations/
  <timestamp>_ads_analizador_foundation.sql
```

## Modelo de datos (propuesta)

```sql
-- Campañas que el usuario decidió trackear
create table ads_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  meta_campaign_id   text not null,
  meta_ad_account_id text not null,
  nombre             text not null,
  moneda             text not null check (moneda in ('USD','BOB')),
  tipo_conversion    text not null check (tipo_conversion in ('compra_stripe','venta_manual')),
  precio_venta       numeric(10,2) not null check (precio_venta > 0),
  margen_venta       numeric(10,2) not null check (margen_venta > 0),
  roas_objetivo      numeric(4,2), -- si es null, se calcula: (precio/margen) * 1.35
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (user_id, meta_campaign_id)
);

-- Snapshot diario sincronizado desde Meta Insights (solo lectura para el usuario)
create table ads_metricas_diarias (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references ads_campaigns(id) on delete cascade,
  fecha               date not null,
  gasto               numeric(10,2) not null default 0,
  alcance             int, impresiones int, frecuencia numeric(5,2),
  cpm                 numeric(10,4),
  clics_enlace        int, cpc_enlace numeric(10,4), ctr_enlace numeric(6,4),
  resultados          int not null default 0,   -- evento optimizado (compra o conversación)
  costo_por_resultado numeric(10,4),
  landing_page_views  int,                       -- solo aplica a compra_stripe
  pagos_iniciados     int,                       -- solo aplica a compra_stripe
  raw_json            jsonb,                     -- respuesta cruda de Meta, por si hace falta reprocesar
  unique (campaign_id, fecha)
);

-- Ventas cargadas a mano (solo campañas tipo venta_manual)
create table ads_ventas_manuales (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references ads_campaigns(id) on delete cascade,
  fecha        date not null,
  cantidad     int not null check (cantidad >= 0),
  nota         text,
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, fecha)
);

-- Pagos de Stripe agregados por día (solo campañas tipo compra_stripe)
create table ads_pagos_stripe (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references ads_campaigns(id) on delete cascade,
  fecha               date not null,
  compras_exitosas    int not null default 0,
  monto_total         numeric(10,2) not null default 0,
  pagos_fallidos      int not null default 0,
  pagos_incompletos   int not null default 0,
  tres_ds_solicitados int not null default 0,
  tres_ds_exitosos    int not null default 0,
  decline_reasons     jsonb, -- {"do_not_honor": 3, "insufficient_funds": 1, ...}
  unique (campaign_id, fecha)
);

-- Historial de cambios, para el "reloj de 7 días" por campaña
create table ads_cambios_log (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references ads_campaigns(id) on delete cascade,
  fecha       timestamptz not null default now(),
  tipo        text not null check (tipo in ('presupuesto','creativo','audiencia','otro')),
  detalle     text, -- ej. "Subí de 25 a 30 Bs/día"
  created_by  uuid references auth.users(id)
);
```

RLS: mismo patrón que `gas_*` — todas con `enable row level security` y
policies `using (auth.uid() = user_id)` (directo en `ads_campaigns`; en las
tablas hijas, vía join implícito por `campaign_id` con una policy que
resuelve el dueño a través de `ads_campaigns`, igual que se resuelve en
`gas_movimientos` vía `auto_id`).

## Integraciones externas

### Meta Marketing API

No hay token configurado todavía. Pasos:

1. En [Meta Business Suite](https://business.facebook.com) → Configuración
   del negocio → Usuarios del sistema → crear un **usuario del sistema**
   (no un token de usuario personal — ese expira en 60 días y la sincronización deja de funcionar).
2. Generar un token para ese usuario del sistema con el permiso `ads_read`.
3. Asignar al usuario del sistema acceso de solo lectura a la(s) cuenta(s)
   publicitaria(s) que se van a trackear (la de USD del curso, la de BOB del
   ebook).
4. Guardar el token como `META_ACCESS_TOKEN` en `.env.local` y en las
   variables de entorno del proyecto en Vercel.

Endpoints que usa la app:
- `GET /{ad_account_id}/campaigns?filtering=[{field:"effective_status",operator:"IN",value:["ACTIVE"]}]`
  — para el picker de "agregar campaña".
- `GET /{campaign_id}/insights?fields=spend,reach,impressions,frequency,cpm,clicks,ctr,actions,cost_per_action_type,...&time_range={...}`
  — para el sync diario.

### Stripe API

No confirmado si ya existe una key de solo lectura — hay que crear una
nueva, específica para esta mini-app:

1. Dashboard de Stripe → Developers → API keys → **"+ Create restricted
   key"**.
2. Dar permiso **Read-only** sobre: Payments, Charges, PaymentIntents. Nada
   de escritura — la app nunca crea ni modifica cobros.
3. Guardar como `STRIPE_SECRET_KEY_ADS` (nombre específico, para no
   confundir con una key de Stripe que se agregue después para otra cosa).

Endpoints que usa la app:
- `GET /v1/payment_intents?created[gte]=...&created[lte]=...` — para contar
  éxitos/fallos/incompletos del día y armar `decline_reasons` desde el
  `last_payment_error.decline_code` de cada uno.

### Nuevas variables de entorno (resumen)

| Variable | Para qué |
|---|---|
| `META_ACCESS_TOKEN` | Leer Insights y campañas de Meta |
| `STRIPE_SECRET_KEY_ADS` | Leer pagos de Stripe (restricted, solo lectura) |

Sin cron: `vercel.json` no lleva ninguna entrada de Ads Analizador (ver "Sync"
arriba).

## Flujo de uso

1. **Agregar campaña**: pegar el ID de Meta o elegirla de la lista en vivo →
   completar cuenta publicitaria, moneda, tipo de conversión, precio de
   venta, margen.
2. **Sync automático** (diario) o botón "Actualizar ahora": trae Insights de
   Meta y, si es `compra_stripe`, agrega pagos de Stripe del mismo rango de
   fechas.
3. **Home**: lista de campañas con semáforo — 🟢 sana, 🟡 revisar (fase de
   aprendizaje / cooldown / muestra chica), 🔴 foco rojo (gasto alto sin
   resultados, o colchón de ROAS agotado).
4. **Dashboard por campaña**: funnel completo, ROAS actual vs. equilibrio vs.
   objetivo, banda de estado con la razón en texto plano (ej. "en
   reajuste técnico hasta el 3 oct — los números de estos días pueden no
   reflejar el rendimiento real").
5. **Venta por WhatsApp**: un campo numérico por día ("¿cuántas ventas
   cerraste hoy?"), editable con retroactividad si se cargó tarde.
6. **Registrar un cambio**: al subir presupuesto o cambiar creativo, un
   botón "Registrar cambio" en el dashboard de la campaña guarda la fecha y
   arranca el reloj de cooldown — sin esto, la app no sabe cuándo evaluar de
   nuevo.

## Ejemplo de uso inicial (para probar que la lógica calza)

Los dos casos reales que motivaron esta app, útiles como datos de prueba:

- **TOEFL (compra_stripe, USD)**: precio/margen ≈ $24, costo por compra
  reciente ≈ $18.80 → ROAS ≈ 1.33x sobre un equilibrio de ~1.0x (colchón
  33%, por debajo del objetivo de 1.35x → la app debería sugerir NO escalar
  todavía y señalar el embudo checkout iniciado→compra como el punto débil).
- **Ebook TOEFL Bolivia (venta_manual, BOB)**: precio/margen = 25 Bs, costo
  por venta ≈ 13.59 Bs → ROAS ≈ 1.84x (colchón 84%, por encima del objetivo
  → la app debería sugerir que sí se puede seguir escalando verticalmente).

## Fuera de alcance (por ahora)

- Cambiar presupuestos o pausar campañas desde la app (es de solo lectura
  hacia Meta; cualquier acción se sigue haciendo en Ads Manager).
- Atribuir pagos de Stripe a múltiples campañas simultáneas sobre el mismo
  checkout (ver limitación documentada arriba).
- Consolidar métricas de USD y BOB en un solo total combinado — cada
  campaña se ve en su propia moneda.
- Notificaciones push/email de alertas (la infraestructura de Resend/VAPID
  ya existe en el Hub para cuando se quiera agregar).
- Integración con la pestaña "Campañas" de Expandlogy — son mini-apps
  separadas por ahora; si en el futuro se quiere unificar, revisar primero
  `documentos/expandlogy/documento_maestro_expandlogy.md` (esa pestaña hoy
  es solo un placeholder visual, pensado para una integración con Meta que
  nunca se implementó).

## Roadmap de sprints

El plan de construcción quedó especificado en detalle, sprint por sprint —
cada documento trae objetivo, modelo de datos, reglas de negocio con
fórmulas exactas, contratos de API, UI y verificación, para empezar a
programar sin volver a decidir nada:

1. `sprint_1_fundaciones_y_reglas.md` — migración SQL completa + esqueleto de
   la mini-app + `lib/ads-analizador/calc.ts` (las 7 reglas de "Contexto de
   negocio" como funciones puras, probadas contra los dos casos de "Ejemplo
   de uso inicial"). Incluye una corrección al patrón de RLS descrito arriba
   (ver §0.1 de ese sprint: sin join, con `user_id` denormalizado).
2. `sprint_2_alta_de_campanas.md` — CRUD de campañas (pegando el ID a mano),
   home con el semáforo, ajustes. Todavía sin ninguna llamada externa.
3. `sprint_3_integraciones_meta_stripe.md` — `meta-api.ts`, `stripe-api.ts`,
   `sync/route.ts` (cron + botón manual), picker en vivo de campañas.
4. `sprint_4_dashboards_y_ventas.md` — dashboards por tipo de campaña,
   ventas manuales, registrar cambios. Cierra el alcance completo de este
   documento.

**Estado (2026-09-28): los cuatro sprints están construidos y probados.** Lo que
falta configurar para tener datos reales de Meta y Stripe (tokens, secreto del
cron, acceso) está en `pendientes_configuracion.md`.

### Cambios de alcance posteriores (2026-09-28)

- **Sin Stripe.** El usuario decidió no traer nada de Stripe por ahora. Las
  campañas de compras usan las compras que reporta Meta (corregibles a mano) y
  el neto después de comisiones se carga a mano. Lo de "Atribución Stripe →
  campaña" y las variables de Stripe de más abajo quedan como historia.
- **Sin cron.** La app sincroniza al abrirse si los datos tienen más de 6 horas.
- **Hoy en curso.** El sync trae el día de hoy; el semáforo lo ignora.

### Agregado después: "Analizar con Claude" (2026-09-28)

En vez de un agente de IA dentro de la app (que usaría la API de Claude, con
costo aparte), cada dashboard y el home tienen un botón **Analizar con
Claude**. Arma un prompt con las 7 reglas de negocio (leídas de las constantes
de `calc.ts`, así nunca se desincronizan), el veredicto de la app y los datos
en JSON, lo copia al portapapeles y ofrece abrir claude.ai para pegarlo. Usa la
suscripción de Claude, sin API ni costo extra.

- `lib/ads-analizador/prompt.ts` — `promptCampana` (config, veredicto,
  totales, últimos 30 días, resumen de Stripe, cambios) y `promptPortafolio`
  (todas las campañas). Puro y probado en `unit`.
- El texto se arma y se copia **dentro del click**: Safari de iPhone solo
  deja escribir el portapapeles durante el gesto del usuario.
- No viajan ids internos, ids de Meta ni credenciales.
- Si más adelante se quiere que Claude consulte los datos solo (sin copiar y
  pegar), el paso siguiente es un conector MCP; el prompt de acá se reutiliza.

### Agregado después: Reglas v2 · Low Ticket y High Ticket (2026-10-08)

`sprint_5_reglas_v2.md` — el semáforo pasa a evaluarse por ciclos (día 1 →
recolección → corte día 3/5 → decisión día 7), con el ritmo esperado por
Poisson, escalado vertical/horizontal con cifras concretas, desglose por
anuncio en vivo, alerta de calidad para WhatsApp y un tercer tipo de campaña,
**Llamadas (High Ticket)**, con su propia carga diaria.

### Agregado después: Cierre de ciclo y Campaña en curso (2026-10-08)

`sprint_6_cierre_de_ciclo.md` — el ciclo tiene duración fija y se cierra solo
al llegar a su último día (o cortado, o interrumpido por un cambio). Al cerrar
guarda una foto en `ads_ciclos`; el panel queda congelado hasta que el usuario
confirma y pasa a «Campaña en curso» (semáforo de la campaña, Total / Desde el
cambio, próxima revisión cada 7 días, alertas en vivo). Cada ciclo cerrado se
abre en «Ciclos anteriores» con sus barras.
