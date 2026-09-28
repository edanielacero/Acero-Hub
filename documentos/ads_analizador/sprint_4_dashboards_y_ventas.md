# Ads Analizador — Sprint 4: "Dashboards, ventas manuales y cambios"

> Documento maestro: `documento_maestro_ads_analizador.md`.
> Sprints anteriores: `sprint_1_fundaciones_y_reglas.md` (1),
> `sprint_2_alta_de_campanas.md` (2), `sprint_3_integraciones_meta_stripe.md` (3).
>
> Este documento especifica **únicamente el Sprint 4** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-09-28 · Estado: **construido**. Desviaciones en
> §0.

---

## 0. Lo que cambió al construirlo

- **Una sola pantalla, `screens/campana.tsx`**, que cambia sus secciones según
  el tipo (ventas manuales o pagos de Stripe) en vez de dos archivos casi
  iguales.
- **El embudo arranca en impresiones**, no en alcance: el alcance diario no se
  suma sin duplicar personas. Y el punto débil se busca **desde clics**: de
  impresiones a clic siempre se pierde el 97-99% (es el CTR) y marcarlo no
  decía nada.
- **Filtro de rango (7 / 14 / 30 días / todo)** arriba de los números. El
  semáforo sigue mirando toda la vida de la campaña; la pantalla lo aclara.
- **Se puede deshacer un cambio registrado** (`DELETE …/cambios?cambio=`). Sin
  eso, uno cargado por error reiniciaba el cooldown sin vuelta atrás.
- Gasto y ventas diarias van en **dos gráficos separados**, nunca con doble eje,
  con tooltip por día y una tabla "Día por día" como vista accesible.
- **Rediseño pedido por el usuario (2026-09-28):** las ventas de WhatsApp ya no
  tienen formulario propio: se editan **en la tabla "Día por día"**, con − / +
  por fila y guardado automático (espera 700 ms desde el último toque, así
  cuatro "+" seguidos son un solo guardado). La columna Ventas va segunda para
  editarse en el celular sin deslizar la tabla, y siempre hay una fila "Hoy"
  aunque Meta no haya traído el día. La tabla va justo debajo del filtro de
  Rendimiento. **Cambios** dejó de ser una tarjeta: es una línea con el último
  cambio y los botones "Registrar cambio" e "Historial" (que se abre en una
  hoja), dentro de la tarjeta del semáforo. `ventas-manuales-form.tsx` ya no
  existe; lo reemplaza `components/tabla-diaria.tsx`.
- **Segundo rediseño (2026-09-28):**
  - El **filtro de fechas va arriba de todo y mueve también el semáforo**:
    el estado se recalcula con las mismas reglas sobre el rango
    (`armarEstado` corre en el cliente). Por defecto "Todo", para coincidir con
    la tarjeta del home.
  - Sin texto repetido: el mensaje bajo el título solo aparece si ninguna
    bandera ya explica el color.
  - Cambios es plegable; "Analizar con Claude" pasó a la barra superior.
  - Indicadores arriba de la tabla: Inversión, Facturación, Profit, Ventas,
    Costo por venta, Conversaciones (o visitas a la landing en compras), su
    costo y % de conversión.
  - **Profit** = facturación × (margen / precio) − inversión.
  - Tabla con columnas por objetivo. Las ventas se editan con el lápiz
    también en campañas de compras: una fila en `ads_ventas_manuales` pisa a
    Stripe/Meta ese día ("editado") y `DELETE …/ventas?fecha=` vuelve al
    automático. Todo sale de `ventasPorDia` (lib/ads-analizador/load.ts), la
    única fuente de ventas por día para tabla, totales, semáforo y prompt.
- **Tercer ajuste (2026-09-28): columna "Acciones" en la tabla.** Fija a la
  derecha (como la fecha a la izquierda) para usarla en el celular sin
  deslizar. Por fila: ✏️ editar ventas — la celda pasa a ser solo un campo de
  texto; ✓ / ✕ (y ↺ "volver al automático" en compras) reemplazan a los
  íconos de Acciones mientras se edita — y 🚩 registrar un cambio **en esa
  fecha**. `POST …/cambios` acepta `fecha` (no futura); un día pasado se guarda
  al mediodía de Bolivia para que no se corra de día al pasar por UTC. Los
  cambios salieron del semáforo: el día con cambios muestra su ícono junto a la
  fecha, y tocarlo abre el detalle (con borrar). Siempre hay fila "Hoy".

**Verificación:** `api.mjs` (ventas: upsert, retroactivas, validación, solo
`venta_manual`; cambios: el semáforo pasa de verde a "esperar" y vuelve al
deshacer), y el flujo real en Chrome: alta desde el formulario → dashboard →
cargar 3 ventas con el stepper.

## 1. Objetivo del sprint

Cerrar el alcance completo del maestro: la pantalla de detalle por campaña
(funnel, ROAS, banderas), la carga de ventas manuales para `venta_manual`, y
el botón "Registrar cambio" que arranca el reloj de cooldown (regla 6 del
Sprint 1). Con esto la app deja de ser "una lista con semáforo" y se
convierte en la herramienta de decisión que describe el maestro.

### Definición de "terminado"

- [ ] `campana-stripe.tsx` muestra el funnel completo y el checkout como
      punto débil cuando corresponde
- [ ] `campana-whatsapp.tsx` muestra el funnel hasta "conversación iniciada"
      y el formulario de ventas manuales
- [ ] `POST/PATCH /api/ads-analizador/campaigns/[id]/ventas` carga o corrige
      la venta de un día, con retroactividad
- [ ] `POST /api/ads-analizador/campaigns/[id]/cambios` registra un cambio y
      el dashboard refleja el cooldown en el momento, sin recargar
- [ ] `decline-reasons-table.tsx` muestra los motivos de rechazo de Stripe
      (solo `compra_stripe`)
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

- Las dos pantallas de dashboard por tipo de campaña.
- `funnel-chart.tsx`, `decline-reasons-table.tsx`.
- Carga/edición de ventas manuales.
- Registro de cambios (presupuesto/creativo/audiencia/otro).

### No entra

| Fuera | Por qué |
|---|---|
| Editar presupuestos o pausar en Meta | Fuera de alcance del maestro — solo lectura hacia Meta |
| Notificaciones de los focos rojos | El maestro lo deja para cuando se quiera usar la infraestructura de push que ya existe en el Hub — no es parte de este alcance |
| Consolidar USD y BOB en un total combinado | Excluido explícitamente por el maestro |

---

## 3. Modelo de datos

No cambia — usa las tablas del Sprint 1 y los datos que el Sprint 3 ya llena.

---

## 4. Reglas de negocio

### 4.1 Dos funnels distintos, una sola plantilla

Por `tipo_conversion`:

```
compra_stripe:  alcance → clics_enlace → landing_page_views → pagos_iniciados → compras_exitosas
venta_manual:   alcance → clics_enlace → resultados (conversación iniciada) → ventas_manuales.cantidad
```

`funnel-chart.tsx` recibe un arreglo genérico `{ etiqueta, valor }[]` armado
por cada pantalla según su tipo — el componente no sabe de `tipo_conversion`,
solo dibuja escalones. Antes de tocar este componente, cargar la skill
`dataviz` para la paleta y la estructura de embudo consistentes con el resto
del Hub.

### 4.2 El "punto débil" del funnel

El maestro pide que el dashboard de TOEFL "señale el embudo checkout
iniciado→compra como el punto débil". Esto se calcula, no se hardcodea: el
escalón con la **mayor caída porcentual** entre dos pasos consecutivos se
resalta en el funnel con un color distinto y un texto ("Acá se pierde más
gente: de landing page a pago iniciado"). Es genérico para los dos tipos de
funnel — no hace falta una regla aparte para cada uno.

### 4.3 Ventas manuales: upsert por día, con retroactividad

```
POST /campaigns/[id]/ventas  { fecha, cantidad, nota? }
```

`unique (campaign_id, fecha)` en la tabla ya obliga el upsert: cargar de
nuevo una fecha ya cargada actualiza esa fila, no crea una segunda. El campo
`fecha` acepta **cualquier día pasado** — el maestro pide explícitamente
poder cargar tarde ("editable con retroactividad si se cargó tarde").

`cantidad` es un conteo entero, no un monto de plata — el input es un
stepper `+`/`-` sobre un número entero, no un campo de texto libre. Al ser un
conteo y no plata, no aplica `parseDecimalInput()` acá (a diferencia de
precio/margen en el Sprint 2): no hay coma que interpretar si nunca se
escribe un decimal.

### 4.4 Registrar un cambio reinicia el cooldown, siempre

```
POST /campaigns/[id]/cambios  { tipo, detalle? }
```

Cada inserción usa `fecha = now()` — no hay forma de registrar un cambio
"en el pasado". El cooldown de la regla 6 (Sprint 1, §4.7) siempre se lee
sobre el cambio **más reciente** de la campaña, así que registrar uno nuevo
mientras ya había un cooldown corriendo simplemente lo reinicia desde hoy —
es el comportamiento esperado: un segundo cambio a mitad del reajuste técnico
reinicia el reajuste, no lo acorta.

### 4.5 `decline-reasons-table.tsx` es puramente de lectura

Lee `ads_pagos_stripe.decline_reasons` (jsonb tipo
`{"do_not_honor": 3, "insufficient_funds": 1}`) del rango visible del
dashboard y lo suma por motivo. Solo aparece en `campana-stripe.tsx` — para
`venta_manual` no hay pagos de Stripe que mostrar.

---

## 5. Estructura de archivos

### Nuevos

```
app/api/ads-analizador/
  campaigns/[id]/ventas/route.ts    POST/PATCH venta manual de un día
  campaigns/[id]/cambios/route.ts   POST registrar cambio

app/ads-analizador/
  screens/campana-stripe.tsx
  screens/campana-whatsapp.tsx
  components/funnel-chart.tsx
  components/ventas-manuales-form.tsx
  components/decline-reasons-table.tsx
```

### Modificados

| Archivo | Cambio |
|---|---|
| `app/ads-analizador/screens/paths.ts` | Ruta de detalle `campana/[id]` |
| `app/ads-analizador/screens/home.tsx` | Cada tarjeta enlaza a su dashboard |
| `app/ads-analizador/components/estado-badges.tsx` | Muestra la fecha exacta del cooldown ("hasta el 3 oct") ya calculada en el Sprint 1 |

---

## 6. Contratos de API

### `POST /api/ads-analizador/campaigns/[id]/ventas`

```jsonc
{ "fecha": "2026-09-20", "cantidad": 3, "nota": "cargado tarde, se me pasó el finde" }
```
`404` si la campaña no es `venta_manual` — cargar ventas manuales sobre una
`compra_stripe` no tiene sentido, esas vienen del sync.

### `POST /api/ads-analizador/campaigns/[id]/cambios`

```jsonc
{ "tipo": "presupuesto", "detalle": "Subí de 25 a 30 Bs/día" }
```
`tipo` uno de `'presupuesto' | 'creativo' | 'audiencia' | 'otro'`.

---

## 7. UI

### Dashboard `compra_stripe`

```
TOEFL                                              🟡 Colchón bajo
──────────────────────────────────────────────────────────────────
Alcance 12.400 → Clics 890 → Landing 640 → Pago iniciado 210 → Compra 85
                                    ▲ acá se pierde más gente (67%)

ROAS actual 1.28x   equilibrio 1.0x   objetivo 1.35x
En ventana de decisión hasta el 3 de octubre (cambio: presupuesto, 26 sep)

Motivos de rechazo (últimos 30 días)
  do_not_honor          3
  insufficient_funds    1

                                        [ Registrar cambio ]
```

### Dashboard `venta_manual`

```
Ebook TOEFL Bolivia                                🟢 Sano
──────────────────────────────────────────────────────────────────
Alcance 8.100 → Clics 410 → Conversación iniciada 96 → Ventas 52

ROAS actual 1.84x   equilibrio 1.0x   objetivo 1.35x

¿Cuántas ventas cerraste hoy?
  [ − ]   3   [ + ]        Nota (opcional) [                    ]
                                                    [ Guardar ]

Historial reciente
  20 sep · 3 ventas
  19 sep · 1 venta      [editar]

                                        [ Registrar cambio ]
```

### Registrar cambio (modal/sheet)

```
Registrar cambio
──────────────────────────────
Tipo      ( Presupuesto )  ( Creativo )  ( Audiencia )  ( Otro )
Detalle   [ Subí de 25 a 30 Bs/día                        ]

                              [ Registrar ]
```

---

## 8. Verificación

```bash
node tests/ads-analizador/run.mjs unit   # punto débil del funnel
node tests/ads-analizador/run.mjs api    # ventas, cambios, dashboards end-to-end
```

| # | Prueba | Tipo |
|---|---|---|
| 1 | El escalón con mayor caída porcentual se marca como punto débil, para los dos tipos de funnel | `unit` |
| 2 | Cargar una venta en una fecha ya cargada actualiza la fila, no duplica | `api` |
| 3 | Cargar una venta con fecha pasada (retroactiva) funciona igual que con la de hoy | `api` |
| 4 | Cargar venta manual sobre una campaña `compra_stripe` → `404` | `api` |
| 5 | Registrar un cambio actualiza el cooldown mostrado en el dashboard sin recargar | `api` |
| 6 | Registrar un segundo cambio a mitad de un cooldown lo reinicia desde hoy | `api` |
| 7 | `decline_reasons` se suma correctamente sobre varios días | `unit` |
| 8 | `decline-reasons-table` no aparece en el dashboard de `venta_manual` | ⏳ manual |
| 9 | `npm run build` pasa sin errores | — |

---

## 9. Qué desbloquea

Con este sprint el alcance del maestro queda completo. Lo que sigue son las
líneas explícitas de su sección "Fuera de alcance" — atribución de Stripe a
múltiples campañas, notificaciones push, consolidación de monedas — que
quedan documentadas ahí como deuda conocida o decisión deliberada, no como
sprints pendientes.
