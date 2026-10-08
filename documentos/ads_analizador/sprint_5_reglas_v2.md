# Ads Analizador — Sprint 5: "Reglas v2 · Low Ticket y High Ticket"

> Documento maestro: `documento_maestro_ads_analizador.md`.
> Sprints anteriores: 1 a 4 (`sprint_1_…` a `sprint_4_…`).
>
> Fuente: la especificación "Reglas de análisis de campañas — Low Ticket y
> High Ticket" que pasó el usuario el 2026-10-08 (§1–§11). Este documento dice
> **cómo quedó construida** y qué se decidió donde la especificación dejaba
> margen. Las secciones citadas (§3, §4.3…) son las de esa especificación.
>
> Última actualización: 2026-10-08 · Estado: **construido y probado**.

---

## 0. Qué reemplaza

Las reglas 1, 3, 4 y 6 del documento maestro quedan reemplazadas:

| Antes | Ahora |
|---|---|
| "En aprendizaje" con < 50 resultados en 7 días | Ya no existe. La estructura es por **ciclos** (§7): no se espera a 50 conversiones por conjunto. |
| Focos rojos tempranos (gasto ≥ 2.5× margen sin ventas) | **Corte por ventana** (§4.3): conservador al día 5 (5×CPA), estándar al día 3 (3×CPA). El ritmo bajo avisa, pero no corta antes. |
| Semáforo sobre toda la vida de la campaña (o el rango elegido) | Semáforo sobre el **ciclo actual**: desde el último cambio registrado o, sin cambios, desde el primer día con gasto. El filtro de rango ya no lo mueve. |
| Cooldown de 7 días después de un cambio | Un cambio **arranca un ciclo nuevo**: día 1 chequeo técnico → recolección → corte → decisión día 7. |

Se mantienen: ROAS de empate desde precio/margen, piso = empate × 1.35 (editable),
muestra chica < 10, fatiga con frecuencia ≥ 3.5. (La bandera de "reajuste técnico"
se sacó el 2026-10-08: el día 1 y la recolección del ciclo ya cubren eso.)

## 1. Datos nuevos

Migración `supabase/migrations/20261008000000_ads_analizador_reglas_v2.sql`
(aplicada; compatible con el código anterior: columnas nuevas con default o nulas).

- `ads_campaigns`: `cpa_esperado` (nulo = automático), `modo_corte`
  (`conservador` | `estandar`, default conservador), `show_estimado`,
  `close_estimado` (fracción 0–1, nulas = 60 % / 20 %), `capacidad_chats_dia`.
- `tipo_conversion` acepta **`llamadas`** (High Ticket).
- `ads_cambios_log.presupuesto`: el presupuesto diario **nuevo** del cambio.
  Es la base del escalado y de la reserva.
- Tabla **`ads_llamadas`**: una fila por campaña y **fecha de la llamada**
  (§6): agendadas, calificadas (opcional), asistidas, cerradas, nota. Mismo
  patrón de RLS que el resto (`user_id` denormalizado + FK compuesta).

## 2. Motor (`lib/ads-analizador/calc.ts`)

Funciones puras de §9 (`poissonPmf`, `poissonCdf`, `probAtLeast`, `lambdaDia`,
`probZeroDia`, `probZeroRacha`, `roasEmpate`, `roasPiso`, `profit`,
`gastoDeCorte`, `diasDeCorte`, `ventasParaEmpate`, `ventasParaPiso`,
`ventasNuevasParaObjetivo`, `estadoPorRitmo`, `valorPorLlamada`,
`cpaEspLlamadaInicial`). `calcularEstado` arma con ellas el estado completo.

### 2.1 CPA esperado (§1)

En este orden: **real del ciclo** si ya hay ≥ 5 conversiones → el que cargó el
usuario → el de una campaña **comparable** (mismo tipo y moneda, ≥ 5
conversiones; la de más conversiones) → en llamadas, 0.45 × valor por llamada
→ el margen por venta. La pantalla dice de dónde salió.

### 2.2 Fases del ciclo

| Fase | Cuándo | Qué dice |
|---|---|---|
| Sin datos | sin gasto en el ciclo (o el cambio fue hoy) | — |
| Chequeo (día 1) | primer día completo | gasto > 0; visitas a la landing (compras/llamadas) o conversaciones (WhatsApp) o leads. Falla → rojo. |
| Muy pronto | hasta invertir lo del corte | sin acción; 0 ventas es normal |
| Corte | inversión de corte cumplida (≥ día 3) | 0 ventas → **frenar**; < empate → **decidir**; < piso → esperar; ≥ piso → verde |
| Decisión | desde el día 7 | ROAS < empate → frenar; < piso → mantener; ≥ piso con < 10 → muestra chica |

**Corte por inversión acumulada (complemento del 2026-10-08).** El corte no
cae en un día fijo: se evalúa cuando el ciclo invirtió `factor × CPA esperado`
(5 conservador, 3 estándar; 3 en llamadas) y van ≥ 3 días. Con
`k = gasto diario / CPA esperado`, el día es `max(3, ⌈factor / k⌉)`: k ≥ 2 → día
3; k = 1 → 5 (conservador); k = 0,5 → 10. La app usa el día en que la inversión
se alcanzó, o lo estima con lo que falta al ritmo de los últimos 3 días.

- Mientras no se alcanza, la fase es **"Muy pronto para evaluar"** (acción
  `muy_pronto`): nunca rojo, aunque sean 0 ventas; la píldora dice "En ritmo" o
  "Bajo el ritmo", y no cuenta en el resumen del home.
- La **decisión** también espera: día `max(7, día de corte)`. Si el corte cae el
  7 o después, la línea muestra una sola etapa "Corte y decisión". Con 0 ventas
  al llegar, stop-loss. Escalar pide ≥ 10 ventas; si no, se revisa cada 7 días.
- Con presupuesto < 0,75 × CPA esperado aparece la bandera **presupuesto bajo**
  (y un aviso bajo la línea del ciclo).

**Hoy no cuenta** (día incompleto); los totales sí lo incluyen.

### 2.3 Ritmo (§3, §8.1)

λ = gasto diario / CPA esperado. P(≤ S | gasto del ciclo): > 20 % verde,
5–20 % amarillo, < 5 % rojo. El panel "Ritmo y próximos pasos" muestra
P(0) de un día (y el +5–10 pts de la práctica), racha en cero, P(0) en 3/5/7
días, ventas necesarias para empate y piso, reserva hasta el corte y hasta el
día 7, y el % observado de días en cero.

### 2.4 Escalado (§4.4–§4.6)

- Se puede escalar con ROAS ≥ piso, ≥ 10 conversiones y **solo al cerrar el
  ciclo** (fase decisión). Durante el ciclo no se cambia nada, aunque vaya bien
  (2026-10-08: se quitó el "paso temprano" del día 4). En el corte, con ventas
  bajo el empate, la app ya no ofrece pausar: manda a esperar el cierre. La
  única salida anticipada es el stop-loss (0 ventas), que cierra el ciclo.
- **Vertical** si ROAS > piso × 1.1; si no, **horizontal** (conjuntos máximos
  = presupuesto / CPA esperado, 1–2 anuncios de prueba).
- Paso: +20–30 %; +30–50 % si el presupuesto es chico (< USD 25 o < Bs 175).
- CPA máximo para que el escalado convenga: `M × B_nuevo / (B_nuevo + profit_diario)`.
- Duplicar: controles a los 4 y 7 días, pérdida máxima 7 × presupuesto nuevo.
- Presupuesto actual = el del último cambio registrado; sin eso, el gasto diario real.

### 2.5 WhatsApp (§5)

KPIs de costo por conversación y % de conversión, conversaciones esperadas por
día contra la capacidad (bandera si la supera), y **alerta de calidad**: en
los últimos 3 días el costo por conversación ≤ 0.9× y el % de conversión
≤ 0.75× del resto (pide ≥ 6 días).

### 2.6 High Ticket (§6)

- Valor por llamada = margen × asistencia × cierre. Asistencia real con ≥ 10
  agendadas; cierre real con ≥ 10 asistidas; antes, las estimadas.
- El semáforo mide **ROAS por llamadas** (agendadas × valor / gasto), porque el
  cierre llega semanas después; el "ROAS real" (cerradas × precio) va como KPI.
- Presupuesto sugerido: 40–50 % del valor por llamada.
- Cargas por **fecha de la llamada**, en la tabla "Día por día" (lápiz).

## 3. API

| Ruta | Qué |
|---|---|
| `PATCH /campaigns/[id]` | acepta `cpaEsperado`, `modoCorte`, `showEstimado`, `closeEstimado` ("60", "60%" o "0,6"), `capacidadChatsDia` |
| `POST /campaigns/[id]/cambios` | acepta `presupuesto` (con coma) |
| `POST/PATCH /campaigns/[id]/llamadas` | upsert del día; agendadas ≥ asistidas ≥ cerradas, calificadas ≤ agendadas. 404 si la campaña no es de llamadas |
| `DELETE /campaigns/[id]/llamadas?fecha=` | borra la carga del día |
| `POST /sync` con `{ campaignId }` | actualiza solo esa campaña (botón "Actualizar" del dashboard). 400 si el id no es válido, 404 si no es tuya o está pausada |

## 4. UI

- Tarjeta del semáforo: su parte principal es el **ciclo actual** en dos barras
  sobre el mismo eje de tiempo (inicio → fin del ciclo). **Días** se llena con
  los días completos; **Ventas** se llena hacia la **meta del ciclo**: las
  ventas para el piso al cierre del día de decisión, con la inversión
  proyectada al ritmo actual (`necesarias.pisoAlCierre`). La marca de la barra
  de ventas es lo que deberías llevar hoy (`necesarias.piso`); con gasto
  parejo cae justo debajo del avance de los días. Pasado el día de decisión,
  la meta es el piso con todo lo invertido. El medidor grande de ROAS se quitó
  del dashboard (el ROAS va en el encabezado del ciclo).
  Las etapas van arriba de las barras (así días y ventas quedan juntas), cada
  una con un calendario chico al lado del nombre. Un corte ya hecho, o que no
  aplica porque hubo ventas (apagado y tildado), no muestra fecha. En la barra de ventas, las etiquetas van sobre la barra: las
  ventas del ciclo arriba del relleno, "N para hoy" debajo de la marca y la
  meta en la columna derecha (en días, el total del ciclo).
- Antes, la **línea del
  ciclo**: una sola barra que se llena día a día hasta el 7, con cada fase y su
  fecha (Chequeo técnico, Juntar datos, Corte, Decisión). Cada etapa se marca
  hecha cuando termina su último día (23:59, hora de Bolivia); las fechas son
  días del ciclo (`fechaCorte` = día N, `fechaDecision` = día 7). El corte solo
  aparece mientras el ciclo no tenga ventas: con la primera, la etapa se quita y
  se muestra "Primera venta el … · sin corte". Las banderas ya no se
  muestran al lado del semáforo (2026-10-08); siguen en las tarjetas del home.
- **Escalado** (vertical u horizontal) con cifras concretas, solo cuando aplica.
- **Semáforo por resultado** (dentro de la tarjeta del semáforo): la fila de
  toda la campaña y, en un desplegable, los ciclos anteriores, con ROAS contra empate y piso, conversiones y profit.
  Cada ciclo se evalúa con el mismo motor, como si "hoy" fuera el día en que
  cerró (`armarCiclos` en `load.ts`). Dos cambios el mismo día abren un solo
  ciclo; uno anterior al primer gasto no abre ninguno.
- **Probabilidades** (§2.3): barra de conversiones del ciclo contra empate y
  piso, y cuatro números grandes (un día en cero, 3 y 7 días en cero, y la
  racha actual o "por azar"). Debajo, en una línea cada uno, costo esperado,
  máximo para el piso, reservas y, según el tipo, asistencia/cierre o chats.
- **Ventas por día** con un tramo punteado por día en el mínimo para recuperar
  lo invertido (inversión / margen por conversión): rojo debajo, amarillo entre
  el mínimo y el piso, verde encima; hoy en gris. En llamadas el gráfico es de
  **agendadas** (mismo criterio que el semáforo).
- Botón **Actualizar** en el encabezado de la campaña.
- La tabla de anuncios se sacó (2026-10-08).
- Ajustes: tarjeta **Reglas de corte** (CPA esperado, modo, asistencia/cierre o capacidad de chats).
- Registrar cambio pide el **presupuesto nuevo** (opcional).
- Alta: tercer tipo "Llamadas (High Ticket)".
- "Analizar con Claude": el prompt manda el estado ya calculado y pide 3–5
  líneas, sin recalcular (§8.3).

## 5. Pruebas

- `unit`: 226 casos, incluidos los de §9, las tablas de §3 y el semáforo por ciclo.
- `api`: 139 casos (ajustes nuevos, cambio con presupuesto, llamadas, sync de una campaña, aislamiento entre usuarios).
- `npx tsc` y `npm run build` limpios; capturas de escritorio y móvil sin scroll horizontal ni errores de consola.

## 6. Pendiente de confirmar con datos reales

- **Evento de Meta para campañas de llamadas**: se toma el primero de
  `schedule_total`, `schedule_website`, `offsite_conversion.fb_pixel_schedule`,
  `lead`, `onsite_conversion.lead_grouped`, `offsite_conversion.fb_pixel_lead`.
  Ver `pendientes_configuracion.md` §6.
- La tabla `ads_pagos_stripe` queda sin uso (Stripe se sacó en el Sprint 4); no se borró.
