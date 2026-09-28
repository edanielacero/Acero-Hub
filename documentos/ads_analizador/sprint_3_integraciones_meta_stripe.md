# Ads Analizador — Sprint 3: "Integraciones: sync de Meta y Stripe"

> Documento maestro: `documento_maestro_ads_analizador.md`.
> Sprints anteriores: `sprint_1_fundaciones_y_reglas.md` (1),
> `sprint_2_alta_de_campanas.md` (2).
>
> Este documento especifica **únicamente el Sprint 3** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-09-28 · Estado: **construido, sin credenciales**.
> Lo que falta configurar está en `pendientes_configuracion.md`. Desviaciones
> en §0.

---

## 0. Lo que cambió al construirlo

- **La orquestación vive en `lib/ads-analizador/sync.ts`** con Meta y Stripe
  inyectados (`deps`). Así se probó el sync completo contra la base real, con
  RLS, sin credenciales: backfill de 7 días, re-sync de los últimos 3 sin
  duplicar, guard de dos campañas de Stripe, una campaña que falla sin frenar a
  las demás, pausadas fuera, y que un usuario no pueda escribir en campañas
  ajenas.
- **El cron procesa usuario por usuario.** La regla de "una sola campaña de
  Stripe activa" es por dueño; con el cliente admin del cron, contarla global
  habría mezclado usuarios.
- **Sin clave de Stripe no es un error**: se omite con motivo
  `stripe_sin_credenciales` y Meta sigue. El home lo explica en "Ver detalle".
- **Graph API v24.0.** El evento optimizado se elige por la primera acción
  presente en una lista ordenada: Meta reporta la misma compra como `omni_`,
  `purchase` y `offsite_…`, y sumarlas la contaba tres veces.
- Stripe: días sin pagos se escriben en cero (corrige días mal contados), y
  solo cuentan los intents en la moneda de la campaña.
- **Sin cron (2026-09-28, decisión del usuario).** Se sacó la entrada de
  `vercel.json` y el camino de cron de `sync/route.ts` (con él, el cliente admin
  y `ADS_CRON_SECRET`). La app sincroniza sola al abrirse si alguna campaña
  activa tiene más de 6 horas sin sincronizar (`sync-al-abrir.ts`), una sola vez
  por apertura, mostrando lo guardado mientras tanto; el botón "Actualizar"
  sigue. La ruta ahora es solo `POST` con sesión de usuario y RLS. Las §4.5 y
  §4.6 de abajo quedan como historia.
- **Sin Stripe (2026-09-28, decisión del usuario).** Se sacó `stripe-api.ts` y
  toda la parte de Stripe del sync (rango propio, guard de "un solo checkout",
  omisiones). Las campañas `compra_stripe` —en pantalla, "Compras web"— toman
  las compras de Meta, corregibles a mano, y el neto se carga a mano. La tabla
  `ads_pagos_stripe` quedó en la base sin uso, por si vuelve; el código está en
  el historial de git. La §4.2 de abajo queda como historia.
- **El sync trae hasta hoy** (día en curso incluido); el semáforo lo ignora y se
  calcula con días completos. Ver `rangoSync` y `armarEstado`.

**Verificación:** `unit` (mapeo de Insights con una respuesta real, agregación
de Stripe con cambio de día en hora de Bolivia, rango de sync) y `api` (ruta y
orquestación), todo en verde.

## 1. Objetivo del sprint

Que los datos dejen de ser manuales: `sync/route.ts` trae Insights de Meta
(y Payment Intents de Stripe cuando corresponde) y los guarda en
`ads_metricas_diarias` / `ads_pagos_stripe`, corriendo por cron diario o por
el botón "Actualizar ahora". Y que "agregar campaña" pueda elegir de una
lista viva en vez de solo pegar el ID.

### Definición de "terminado"

- [ ] `lib/ads-analizador/meta-api.ts` trae campañas activas y Insights por
      rango de fechas de una cuenta publicitaria
- [ ] `lib/ads-analizador/stripe-api.ts` trae Payment Intents por rango y los
      agrega por día
- [ ] `POST /api/ads-analizador/sync` corre para todas las campañas activas
      del usuario (o de todos los usuarios, si lo dispara el cron), guarda en
      las tablas correspondientes, y no se cae entera si una campaña falla
- [ ] El botón "Actualizar ahora" en el home dispara el mismo endpoint con
      sesión de usuario
- [ ] `GET /api/ads-analizador/meta/campaigns-disponibles` alimenta el picker
      en vivo de "agregar campaña"
- [ ] `vercel.json` tiene la entrada de cron nueva, sin tocar la de Finanzas,
      y el deploy no se rompe (§4.5)
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

- Los dos clientes delgados (`meta-api.ts`, `stripe-api.ts`).
- `sync/route.ts`: acepta `Authorization: Bearer $ADS_CRON_SECRET` (cron) o
  usuario logueado (botón manual) — mismo patrón que
  `app/api/finanzas/rates/refresh`.
- `meta/campaigns-disponibles/route.ts`: el picker en vivo.
- Variables de entorno: `META_ACCESS_TOKEN`, `STRIPE_SECRET_KEY_ADS`,
  `ADS_CRON_SECRET`.
- Entrada nueva en `vercel.json`.
- Upgrade de `agregar-campana.tsx` (Sprint 2): segundo modo "Elegir de la
  lista" arriba del formulario que ya existe.

### No entra

| Fuera | Por qué |
|---|---|
| Dashboards por campaña, ventas manuales, registrar cambio | Sprint 4 — este sprint solo llena las tablas, no las muestra en detalle |
| Cambiar presupuestos o pausar campañas en Meta | Fuera de alcance del maestro — la app es de solo lectura hacia Meta |
| Atribuir Stripe a más de una campaña simultánea | Limitación documentada del maestro; este sprint la refuerza con un guard (§4.4), no la resuelve |

---

## 3. Modelo de datos

No cambia — usa las tablas del Sprint 1.

---

## 4. Reglas de negocio

### 4.1 Rango de sync por campaña

Para cada campaña activa:

```
desde = max(ads_metricas_diarias.fecha para esta campaña) - VENTANA_RESYNC_DIAS + 1
       (o "hace 7 días" si nunca sincronizó — primer sync trae una semana completa
        de una, así el semáforo tiene algo que decir desde el primer momento)
hasta = ayer (hora del servidor)
```

```ts
export const VENTANA_RESYNC_DIAS = 3;
export const DIAS_BACKFILL_INICIAL = 7;
```

**Por qué re-sincronizar días que ya están guardados, y no solo los nuevos:**
Meta atribuye conversiones con un delay de hasta ~72 horas (alguien ve el
anuncio hoy, compra 2 días después, y esa compra se atribuye retroactivamente
al día del clic). Sincronizar solo el día siguiente al último guardado
dejaría esas conversiones tardías sin contar nunca. El `upsert` por
`(campaign_id, fecha)` hace que re-traer un día ya guardado sea seguro:
reemplaza la fila entera, no la duplica.

**Por qué `hasta = ayer` y no `hoy`:** el día de hoy todavía está en curso —
sincronizarlo a las 10am solo trae medio día de datos, y ese medio día
quedaría guardado como si fuera el total, hasta el sync de mañana que lo
reemplaza. Más simple no sincronizar el día en curso: cuando termine, entra
completo en la corrida siguiente.

### 4.2 Un solo checkout de Stripe activo — verificado, no asumido

El maestro documenta la limitación: mientras haya **una sola** campaña
`compra_stripe` activa, todo pago de esa cuenta de Stripe le pertenece. Este
sprint no resuelve la limitación, pero tampoco la ignora en silencio:

```ts
const stripeActivas = campanas.filter(c => c.tipo_conversion === 'compra_stripe' && c.activo);
if (stripeActivas.length > 1) {
  // No reparte pagos a ninguna — adivinar mal duplicaría ventas en dos dashboards.
  registrarOmision('mas_de_una_campana_stripe_activa', stripeActivas.map(c => c.id));
  // El resto del sync (Meta, para todas las campañas) sigue corriendo igual.
}
```

Si eso pasa, el sync de Meta sigue normal para todas las campañas — solo se
salta la parte de Stripe, y lo deja visible en la respuesta del endpoint
(§6) para que no sea un silencio confuso.

### 4.3 Una campaña que falla no tumba las demás

`sync/route.ts` procesa cada campaña en su propio `try/catch`. Si Meta
devuelve un error para una campaña (token vencido, ID inválido, rate limit),
las demás campañas del mismo usuario se siguen sincronizando. El resultado
final reporta éxitos y fallos por campaña (§6), nunca un `500` genérico que
oculte cuáles sí funcionaron.

### 4.4 Insights que trae Meta, mapeados a la tabla

```
spend                              → gasto
reach                              → alcance
impressions                        → impresiones
frequency                          → frecuencia
cpm                                → cpm
clicks (tipo link_click)           → clics_enlace
cpc / ctr (tipo link_click)        → cpc_enlace / ctr_enlace
actions[evento optimizado]         → resultados
cost_per_action_type[ese evento]   → costo_por_resultado
actions[landing_page_view]         → landing_page_views   (solo compra_stripe)
actions[initiate_checkout]         → pagos_iniciados       (solo compra_stripe)
respuesta cruda completa           → raw_json
```

El "evento optimizado" (qué acción de `actions[]` cuenta como `resultados`)
depende de `tipo_conversion`: `omni_purchase` para `compra_stripe`,
`onsite_conversion.messaging_conversation_started_7d` (o el que corresponda
al objetivo de Meta configurado) para `venta_manual`. Se resuelve en
`meta-api.ts`, no se hardcodea en `sync/route.ts`.

### 4.5 El cron nuevo, dentro del límite de Vercel Hobby

`vercel.json` hoy tiene un solo cron (`/api/finanzas/rates/refresh`, `0 11 * * *`).
Este sprint agrega el segundo:

```jsonc
{
  "crons": [
    { "path": "/api/finanzas/rates/refresh", "schedule": "0 11 * * *" },
    { "path": "/api/ads-analizador/sync",    "schedule": "0 10 * * *" }
  ]
}
```

Dos crons, cada uno a **una sola hora fija** — dentro del límite del plan
Hobby. La expresión que rompió producción dos veces fue una con **más de una
hora por día** (`0 0,12 * * *`), no la cantidad de entradas; igual, después
de este deploy conviene el mismo chequeo que ya deja anotado el Hub para
estos casos: comparar `git ls-remote origin master` contra el HEAD local y
pedir una ruta `/api/ads-analizador/*` — un `404` donde se espera un `401`
es la señal de que el build no llegó a producción.

### 4.6 El botón manual no necesita el secreto

`sync/route.ts` acepta **o** `Authorization: Bearer $ADS_CRON_SECRET` **o**
un usuario logueado vía `requireUser()`. Con usuario logueado, solo procesa
las campañas de ese usuario — nunca las de todos, aunque el request llegue
sin el secreto. El secreto es exclusivamente para que el cron (que no tiene
sesión de nadie) pueda procesar a todos los usuarios de una sola corrida.

---

## 5. Estructura de archivos

### Nuevos

```
lib/ads-analizador/
  meta-api.ts      cliente delgado sobre Graph API (Campaigns + Insights)
  stripe-api.ts    cliente delgado sobre Stripe (Payment Intents, decline reasons)

app/api/ads-analizador/
  sync/route.ts                          cron + botón manual: Meta + Stripe
  meta/campaigns-disponibles/route.ts    GET campañas activas del ad account
```

### Modificados

| Archivo | Cambio |
|---|---|
| `app/ads-analizador/screens/agregar-campana.tsx` | Modo "Elegir de la lista" usando `campaigns-disponibles` |
| `app/ads-analizador/screens/home.tsx` | Botón "Actualizar ahora" + timestamp del último sync |
| `vercel.json` | Entrada de cron nueva (§4.5) |
| `.env.local` / variables de Vercel | `META_ACCESS_TOKEN`, `STRIPE_SECRET_KEY_ADS`, `ADS_CRON_SECRET` — pasos de generación ya están en el maestro, sección "Integraciones externas" |

---

## 6. Contratos de API

### `GET /api/ads-analizador/meta/campaigns-disponibles?ad_account_id=act_123`

```jsonc
{ "campaigns": [{ "id": "120211...", "nombre": "TOEFL — Conversión" }] }
```
Filtra por `effective_status IN ["ACTIVE"]`, como especifica el maestro.

### `POST /api/ads-analizador/sync`

Sin body. Header `Authorization: Bearer $ADS_CRON_SECRET` o sesión de
usuario.

```jsonc
{
  "procesadas": 3,
  "omitidas": [{ "motivo": "mas_de_una_campana_stripe_activa", "campanas": ["uuid1", "uuid2"] }],
  "resultados": [
    { "campaign_id": "uuid", "ok": true,  "dias_sincronizados": 3 },
    { "campaign_id": "uuid", "ok": false, "error": "token de Meta vencido" }
  ]
}
```

---

## 7. UI

### Home — botón manual

```
Ads Analizador                    Última sync: hace 6 h    [ Actualizar ahora ⟳ ]
```
Deshabilitado mientras corre; si algún `resultado.ok === false`, un badge
chico "1 campaña no se pudo sincronizar" con el detalle en un tap.

### Agregar campaña — picker en vivo

```
Agregar campaña
──────────────────────────────
Cuenta publicitaria    [ act_123...             ]

( Pegar ID de Meta )     ( Elegir de la lista )
                          ┌───────────────────────┐
                          │ TOEFL — Conversión     │
                          │ Ebook TOEFL — Tráfico  │
                          └───────────────────────┘

[resto del formulario igual que Sprint 2: nombre, moneda, tipo, precio, margen]
```

---

## 8. Verificación

Los tests de `meta-api.ts` y `stripe-api.ts` **no llaman a las APIs reales**:
usan respuestas fijas (fixtures) grabadas a mano a partir de la forma
documentada en el maestro, para no gastar cuota ni depender de que haya una
campaña real activa para correr la suite.

```bash
node tests/ads-analizador/run.mjs unit   # mapeo de Insights, agregación de Stripe
node tests/ads-analizador/run.mjs api    # sync end-to-end contra el dev server
```

| # | Prueba | Tipo |
|---|---|---|
| 1 | Insights de Meta se mapean a las columnas correctas (§4.4) | `unit` |
| 2 | Payment Intents de un día se agregan en `compras_exitosas`/`monto_total`/`decline_reasons` | `unit` |
| 3 | Rango de sync: primera vez trae 7 días; con historial, re-trae los últimos 3 + los nuevos | `unit` |
| 4 | `upsert` por `(campaign_id, fecha)` no duplica al re-sincronizar el mismo día | `api` |
| 5 | Dos campañas `compra_stripe` activas a la vez → sync de Stripe se omite para ambas, Meta sigue para todas | `api` |
| 6 | Una campaña con error de Meta no impide que las demás se sincronicen | `api` |
| 7 | `sync` con `ADS_CRON_SECRET` procesa todos los usuarios; sin secreto y con sesión, solo el propio | `api` |
| 8 | `sync` sin secreto y sin sesión → `401` | `api` |
| 9 | Picker trae solo campañas `ACTIVE` de la cuenta pedida | `api` |
| 10 | `npm run build` pasa sin errores | — |

---

## 9. Qué desbloquea

| Qué | Cómo |
|---|---|
| **Sprint 4** | Los dashboards por campaña recién tienen datos reales para mostrar — sin este sprint, `funnel-chart.tsx` estaría vacío |
| **El semáforo del home** | Deja de decir "sin datos aún" para casi todas las campañas y empieza a reflejar el estado real |
