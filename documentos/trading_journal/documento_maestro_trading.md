# Trading Journal — Documento Maestro de Planificación

## Qué es

Plataforma personal de análisis de trading integrada en Acero Hub. Cada usuario con acceso puede gestionar sesiones de **Backtesting** (análisis de estrategia en RR y %) y **Journal** (registro real con PnL en USD). Las sesiones son independientes entre usuarios. Soporta métricas estadísticas avanzadas, simulador Montecarlo, análisis con IA y compartir sesiones entre usuarios del hub.

---

## Proyecto individual dentro del hub

Trading Journal es un proyecto independiente que vive dentro de Acero Hub. Sigue el mismo principio de aislamiento que Mundial 2026: **todo lo que pertenece a Trading Journal vive en sus propias carpetas y no toca archivos de otros proyectos**.

Los únicos archivos compartidos del hub que puede usar son:
- `lib/supabase.ts` — cliente Supabase del navegador
- `lib/supabase-server.ts` — cliente Supabase del servidor
- `lib/resend.ts` — email (para notificaciones de invitaciones)

Todo lo demás (lógica, librerías, schema de BD, documentación) vive en carpetas con prefijo `trading/` o `tj_`.

---

## Decisiones de arquitectura

- **Stack:** Next.js App Router, Tailwind CSS, Supabase (auth + DB + Storage), Claude Haiku 4.5 (IA)
- **Mobile first:** toda la UI se diseña para móvil primero, luego desktop
- **Variables personalizadas:** columna JSONB en trades (flexible, indexable, compatible con análisis de IA)
- **Variables predefinidas opcionales:** definidas a nivel de sesión en tabla separada (permite filtrar y analizar por ellas)
- **Permisos:** tabla `project_access` en el hub — rol `trading_journal` para acceder
- **Prefijo de tablas:** `tj_` para no colisionar con el hub ni con Mundial

---

## Estructura de archivos

```
app/trading-journal/
├── layout.tsx
├── page.tsx                    — lista de sesiones (home del proyecto)
├── [sessionId]/
│   ├── layout.tsx              — header de sesión con back nav y acceso a variables
│   ├── page.tsx                — dashboard de la sesión (Sprint 5)
│   ├── variables/page.tsx      — gestión de variables de la sesión (Sprint 2)
│   ├── trades/page.tsx         — tabla + calendario de trades (Sprint 4)
│   ├── stats/page.tsx          — métricas avanzadas (Sprint 6)
│   ├── montecarlo/page.tsx     — simulador (Sprint 7)
│   ├── sweetspot/page.tsx      — análisis de sweet spot (Sprint 6)
│   └── ai/page.tsx             — análisis con IA (Sprint 8)
└── notifications/page.tsx      — panel de notificaciones (Sprint 9)

app/api/trading-journal/
├── sessions/route.ts           — CRUD sesiones
├── sessions/[id]/route.ts
├── sessions/[id]/duplicate/route.ts
├── sessions/[id]/connect/route.ts
├── trades/route.ts             — CRUD trades
├── trades/import/route.ts      — importación CSV/Excel
├── variables/route.ts          — CRUD definiciones de variables
├── montecarlo/route.ts         — cálculo Montecarlo (server-side)
├── ai/analyze/route.ts         — proxy a Claude Haiku
├── share/route.ts              — envío de copia
└── notifications/route.ts      — CRUD notificaciones

lib/trading/
├── metrics.ts                  — todas las fórmulas estadísticas
├── montecarlo.ts               — algoritmo Montecarlo
├── sweetspot.ts                — algoritmo sweet spot
├── csv-parser.ts               — parser de importación
└── ai-prompts.ts               — prompts para Claude Haiku

supabase/trading/
└── schema.sql
```

---

## Base de datos

### `tj_sessions`
```sql
id            uuid PK
user_id       uuid FK → profiles(id)
type          text  -- 'backtesting' | 'journal'
name          text
description   text
instrument      text    -- par/instrumento principal (opcional, puede ser por trade)
capital_initial numeric -- solo journal: capital inicial de la cuenta
is_archived   boolean default false
is_favorite   boolean default false
sync_paused   boolean default false  -- pausa recepción desde backtesting conectado
created_at    timestamptz
updated_at    timestamptz
```

### `tj_session_connections`
Relación N:M entre backtesting y journal.
```sql
id               uuid PK
backtesting_id   uuid FK → tj_sessions(id)
journal_id       uuid FK → tj_sessions(id)
sync_paused      boolean default false  -- pausa solo este vínculo
created_at       timestamptz
UNIQUE(backtesting_id, journal_id)
```

### `tj_variable_definitions`
Variables que el usuario eligió activar para una sesión (predefinidas + personalizadas).
```sql
id          uuid PK
session_id  uuid FK → tj_sessions(id)
key         text        -- identificador interno (ej. 'session_time', 'my_custom_var')
label       text        -- nombre visible
type        text        -- 'text' | 'number' | 'select_single' | 'select_multiple' | 'boolean'
options     jsonb       -- solo para select: ["London", "New York", "Asia"]
is_preset   boolean     -- true = viene de la lista predefinida, false = creada por usuario
is_required boolean default false
is_active   boolean default true  -- false = desactivada (oculta en trades, datos preservados)
sort_order  int
```

### `tj_trades`
```sql
id              uuid PK
session_id      uuid FK → tj_sessions(id)
linked_trade_id uuid FK → tj_trades(id)  -- si viene de un backtesting conectado

-- Campos fijos (ambos tipos)
date_entry      timestamptz not null
date_exit       timestamptz
instrument      text
direction       text   -- 'long' | 'short'
result          text   -- 'tp' | 'sl' | 'be'
notes           text

-- Solo backtesting (análisis en R/RR)
rr_target       numeric  -- RR objetivo original
rr_max          numeric  -- RR máximo que alcanzó el precio
rr_exit         numeric  -- RR donde realmente cerró
be_moved        boolean default false  -- ¿movió SL a BE en algún momento?

-- Solo journal (análisis en % y USD)
risk_percent    numeric  -- % de riesgo en este trade concreto
pnl_usd         numeric  -- ganancia/pérdida en USD
capital_start   numeric  -- capital total de la cuenta al iniciar el trade
capital_end     numeric  -- capital total de la cuenta al cerrar el trade

-- Variables opcionales y personalizadas (schema flexible)
custom_fields   jsonb   -- { "session_time": "London", "quality": 4, "followed_plan": true }

created_at      timestamptz
updated_at      timestamptz
```

### `tj_share_invitations`
```sql
id            uuid PK
from_user_id  uuid FK → profiles(id)
to_email      text     -- email del receptor (debe ser usuario del mismo hub)
session_id    uuid FK → tj_sessions(id)
status        text default 'pending'  -- 'pending' | 'accepted' | 'rejected'
created_at    timestamptz
```

### `tj_notifications`
```sql
id          uuid PK
user_id     uuid FK → profiles(id)
type        text   -- 'session_share'
payload     jsonb  -- { invitationId, fromName, sessionName }
read        boolean default false
created_at  timestamptz
```

### `tj_ai_analyses`
Historial de análisis IA por sesión.
```sql
id          uuid PK
session_id  uuid FK → tj_sessions(id)
prompt      text   -- lo que envió el usuario
response    text   -- respuesta de Claude
created_at  timestamptz
```

---

## Variables predefinidas opcionales

El usuario elige cuáles activar al crear una sesión. No son obligatorias. Se seleccionan en el formulario de creación; también pueden agregarse variables completamente personalizadas desde el mismo formulario o desde la página de variables de la sesión.

Lista reducida a las 9 más esenciales (implementadas en `lib/trading/presets.ts`):

| key | label | tipo |
|---|---|---|
| `session_time` | Sesión horaria | select_single: Asiática / Londres / Nueva York / Overlap L-NY / Overlap A-L |
| `timeframe_entry` | Timeframe de entrada | select_single: M1 / M5 / M15 / M30 / H1 / H4 / D1 |
| `setup_type` | Tipo de setup | text |
| `confluences` | Confluencias | select_multiple: BOS / CHoCH / FVG / OB / Liquidez / Soporte / Resistencia / Tendencia / EMA / Fibonacci / Otro |
| `exit_reason` | Razón de salida | select_single: TP / SL / Manual / Trailing / BE |
| `followed_plan` | ¿Seguí el plan? | boolean |
| `emotion_pre` | Emoción pre-trade | select_single: Neutral / Confiado / Ansioso / Dudoso / FOMO / Impaciente |
| `setup_quality` | Calidad del setup | number (1–5) |
| `tags` | Tags | select_multiple: Buena ejecución / Error de entrada / FOMO / Gestión correcta / Revenge trade (editables) |

El usuario puede crear variables completamente personalizadas de cualquier tipo (text, number, select_single, select_multiple, boolean).

---

## Fórmulas y algoritmos

### Métricas básicas
```
Total trades     = count(trades)
Ganadores        = count(result = 'tp')
Perdedores       = count(result = 'sl')
BE               = count(result = 'be')
Winrate          = (ganadores / total) × 100

RR promedio gan. = avg(rr_exit) where result = 'tp'
RR promedio perd.= avg(rr_exit) where result = 'sl'  [valor absoluto]

Expectativa mat. = (winrate × RR_prom_gan) − ((1 − winrate) × RR_prom_perd)
Profit Factor    = suma(rr_exit ganadores) / |suma(rr_exit perdedores)|

Rentabilidad %   = suma de % resultado de cada trade (compuesto o simple según config)

Racha TP máx.    = secuencia más larga de trades consecutivos ganadores
Racha SL máx.    = secuencia más larga de trades consecutivos perdedores
```

### Métricas avanzadas

**Z-Score** (mide dependencia entre trades — ¿hay rachas o alternancia?)
```
N = total trades
W = ganadores
L = perdedores
R = número de rachas (cambios de resultado + 1)

Z = (N × R − 2 × W × L) / √(2WL(2WL − N) / (N − 1))

Interpretación:
Z >  1.96 → trades agrupados en rachas (p < 0.05)
Z < −1.96 → trades se alternan más de lo esperado (p < 0.05)
−1.96 < Z < 1.96 → comportamiento aleatorio (estrategia independiente)
```

**P-Value** (probabilidad de obtener este winrate por azar)
```
Prueba binomial unilateral:
H0: winrate real = 50% (azar puro)
P-value bajo (< 0.05) → la estrategia tiene edge estadístico
```

**Varianza y desviación estándar del RR**
```
μ   = expectativa matemática
σ²  = avg((rr_exit_i − μ)²)
σ   = √σ²
```

**Consistencia mensual**
```
Meses con PnL neto positivo / total de meses con actividad
```

**Meses en pérdida: obtenidos vs esperados**
```
Esperados = binomial(n_meses, 1 − consistencia_esperada)
```

**Expectativa por mes**
```
Trades por mes promedio × Expectativa matemática
```

**Barra de progreso de confiabilidad**
El sistema define umbrales dinámicos por métrica:
- 30 trades → winrate básico confiable
- 100 trades → profit factor y expectativa confiables
- 200 trades → z-score y p-value confiables
- 300 trades → consistencia mensual y proyecciones confiables

La barra muestra progreso hacia 300 trades (confiabilidad plena). Cada métrica avanzada muestra su propio nivel de confianza si el usuario no llega al umbral.

---

### Algoritmo Sweet Spot

Para cada nivel X desde 0.25R hasta `max(rr_max)` en pasos de 0.25:

```
resultado_simulado(trade, X):
  si trade.rr_max >= X → +X (hubieras cerrado en ganador)
  sino               → trade.rr_exit (lo que pasó realmente)

Para cada X:
  total_rr[X]     = suma(resultado_simulado(t, X) for t in trades)
  winrate[X]      = count(rr_max >= X) / total × 100
  profit_factor[X] = calculado con resultados simulados

Sweet spot = X donde total_rr[X] es máximo
```

Gráfica: línea de total RR acumulado vs nivel de salida X. El pico es el sweet spot.

Naturalmente toma en cuenta BE: si un trade llegó a 1:1, movió BE y fue parado en 0 (rr_exit=0, rr_max=1), simular X=1 da +1:1, simular X=1.5 da 0 (lo real).

---

### Algoritmo Montecarlo

**Input:** array de resultados históricos (rr_exit o % por trade), capital hipotético, N simulaciones, modo.

**Modos de gestión de capital:**

| Modo | Lógica |
|---|---|
| Interés simple | arriesgar siempre X% del **capital inicial** |
| Interés compuesto | arriesgar siempre X% del **capital actual** |
| High Water Mark | arriesgar X% del **máximo capital alcanzado** — si hay drawdown, el % se reduce hasta recuperar HWM |
| D'Alembert inverso | después de ganador: +1 unidad de riesgo. Después de perdedor: −1 unidad (mínimo 1 unidad) |

**Por cada simulación:**
```
1. Barajar aleatoriamente (bootstrap con reemplazo) el array de trades
2. Aplicar modo de capital elegido en cada trade
3. Registrar equity curve completa
4. Registrar: capital final, capital máximo, racha TP máx, racha SL máx
5. ¿Ruina? → capital cae a 0 (o a nivel definido por usuario)
```

**Estadísticas output:**
- Capital Final: promedio, mejor, peor, distribución
- Capital Máximo: promedio, mejor, peor
- Racha TP máxima: promedio, mejor, peor
- Racha SL máxima: promedio, mejor, peor
- Probabilidad de ruina: `count(simulaciones con ruina) / N × 100`

**Gráfica:** N líneas grises (todas las simulaciones) + línea verde (mejor) + línea roja (peor) + línea blanca gruesa (promedio).

---

### Análisis con IA (Claude Haiku 4.5)

Modelo: `claude-haiku-4-5-20251001`

El sistema construye un prompt con:
1. Resumen de la sesión (N trades, winrate, profit factor, expectativa)
2. Lista de trades en JSON (campos fijos + custom_fields)
3. Definiciones de variables (para que Claude entienda el schema)
4. La pregunta del usuario

**Preguntas sugeridas predefinidas:**
- ¿En qué sesión horaria rindo mejor?
- ¿Cuál es mi mejor setup?
- ¿Qué variable correlaciona más con mis pérdidas?
- ¿Hay un patrón en mis rachas perdedoras?
- ¿En qué días de la semana tengo mejor rendimiento?
- ¿Mis emociones pre-trade afectan el resultado?
- ¿Cuándo debería parar de operar en el día?
- Dame un resumen honesto de mi estrategia

**Prompt base:**
```
Eres un analista de trading experto. Analiza estos trades y responde de forma 
concisa y directa. No repitas los datos que te doy, ve al análisis.

Sesión: {nombre}
Tipo: {backtesting|journal}
Resumen: {N} trades | Winrate: {W}% | Expectativa: {E}R | Profit Factor: {PF}

Variables registradas: {lista de variable_definitions}

Trades (JSON):
{trades_json}

Pregunta: {pregunta_usuario}
```

Historial de análisis guardado en `tj_ai_analyses` (no se recalcula, el usuario puede volver a verlos).

---

## Flujo: Backtesting → Journal

1. Usuario crea sesión de **backtesting**
2. Puede hacer clic en **"Crear Journal con esta Estrategia"**:
   - Crea nueva sesión `type='journal'`
   - Copia todas las `tj_variable_definitions` de la sesión backtesting
   - Pregunta: *"¿Conectar este Journal a la estrategia?"* → si acepta, crea registro en `tj_session_connections`
3. Al ingresar un trade en el **backtesting**, se **copia automáticamente** a todos los journals conectados con sync activo:
   - Se crea una fila nueva en `tj_trades` por cada journal, con `linked_trade_id` apuntando al trade original (solo referencia histórica)
   - La copia lleva **todos los campos** del trade de backtesting (dirección, resultado, RR, notas, variables, etc.)
   - El usuario luego va al journal y completa los campos de dinero real: `risk_percent`, `pnl_usd`, `capital_start`, `capital_end`
4. **Las copias son totalmente independientes tras la creación:**
   - Editar un trade en el journal → solo modifica la fila del journal, nunca la del backtesting
   - Editar un trade en el backtesting → solo modifica la fila del backtesting, nunca las copias en journals
   - `linked_trade_id` es solo trazabilidad (saber de qué trade de backtesting provino), no un canal de sync
5. El trade del journal muestra tanto los datos de contexto del backtesting (RR, dirección) como los datos reales de dinero (% y USD), todos editables de forma independiente

**Pausar sincronización:** toggle en `tj_session_connections.sync_paused`. Mientras está pausada, los trades nuevos en backtesting **no** se copian al journal. Al reanudar, los trades creados durante la pausa no se recuperan retroactivamente — la pausa solo afecta trades futuros.

---

## Importación CSV/Excel

1. Usuario sube archivo
2. Sistema detecta columnas automáticamente
3. Muestra pantalla de mapeo: "¿Esta columna de tu CSV corresponde a qué campo?"
4. Columnas mapeables: todos los campos fijos + variables definidas en la sesión
5. Preview de primeras 5 filas antes de confirmar
6. Importación en batch con reporte: "X trades importados, Y errores"

**Formato mínimo aceptado para CSV:**
- `date_entry` (fecha)
- `result` (tp/sl/be)
- `rr_exit` (número)

---

## Sprint 0 — Fundación y DB

**Objetivo:** Todo lo estructural listo. Sin UI todavía.

- [ ] Agregar permisos de Trading Journal en el hub (`project_access` o campo en `profiles`)
- [ ] Crear todas las tablas en Supabase (`supabase/trading/schema.sql`)
- [ ] Configurar RLS: cada usuario solo ve sus propias sesiones y trades
- [ ] Crear estructura de carpetas en Next.js (`app/trading-journal/`, `app/api/trading-journal/`, `lib/trading/`)
- [ ] Layout base de Trading Journal (`app/trading-journal/layout.tsx`) con metadata

**Dependencias:** ninguna. Es el punto de partida.

---

## Sprint 1 — Sesiones

**Objetivo:** El usuario puede crear, ver, editar y organizar sus sesiones.

- [ ] Lista de sesiones en `app/trading-journal/page.tsx` separada en 2 tabs por tipo: **Backtesting** / **Journal**. Dentro de cada tab: sesiones activas primero, archivadas al final con separador. Favorito es un atributo de la tarjeta (estrella), no un tab.
- [ ] Tarjeta de sesión: nombre, tipo (B/J), instrumento, fecha, N trades, indicador conectada
- [ ] Crear sesión: modal con nombre, tipo, instrumento (opcional), % riesgo, capital inicial (solo journal)
- [ ] Elegir variables predefinidas opcionales al crear (selector con checkboxes, descripciones)
- [ ] Editar sesión (nombre, descripción, configuración)
- [ ] Duplicar sesión (copia sesión + variable definitions, sin trades)
- [ ] Archivar / Desarchivar
- [ ] Marcar / Desmarcar favorito
- [ ] Eliminar sesión (con confirmación)
- [ ] "Crear Journal con esta Estrategia" en sesiones de backtesting
- [ ] Gestión de conexiones backtesting ↔ journal (ver conectados, añadir, pausar, desconectar)
- [ ] API routes: `/api/trading/sessions` CRUD completo

**Dependencias:** Sprint 0 completo.

---

## Sprint 2 — Variables personalizadas

**Objetivo:** El usuario puede gestionar el schema de variables de cada sesión.

- [ ] Sección "Configuración de Variables" dentro de cada sesión
- [ ] Ver lista de variables activas (predefinidas + personalizadas)
- [ ] Crear variable personalizada: nombre, tipo, opciones (si select)
- [ ] Editar label y opciones de cualquier variable
- [ ] Reordenar variables (drag & drop o flechas)
- [ ] Desactivar variable (no elimina datos existentes)
- [ ] Eliminar variable (con confirmación — borra `custom_fields[key]` de todos los trades de la sesión)
- [ ] API routes: `/api/trading/variables` CRUD

**Dependencias:** Sprint 1 completo (necesita sesiones existentes).

---

## Sprint 3 — Ingreso y gestión de trades

**Objetivo:** El usuario puede registrar, editar e importar trades.

- [ ] Formulario de trade (modal o página):
  - Campos fijos: fecha entrada, fecha salida, instrumento, dirección, resultado, RR objetivo, RR máximo, RR salida, BE movido, notas
  - Helper de % riesgo: si el usuario tiene % configurado y (journal) capital_start, pre-calcula capital_end estimado. Todo editable.
  - Campos journal: capital inicio, capital fin, PnL USD (auto-calculado o manual)
  - Variables opcionales: renderizadas dinámicamente según `tj_variable_definitions` de la sesión
- [ ] Al guardar trade en backtesting con journals conectados (sync activo): modal inline "¿Registrar en [Journal]?" con campos de capital/PnL
- [ ] Editar trade existente
- [ ] Eliminar trade (con confirmación)
- [ ] Importación CSV/Excel: upload → mapeo de columnas → preview → confirmar
- [ ] API routes: `/api/trading/trades` CRUD + `/api/trading/trades/import`

**Dependencias:** Sprint 2 completo (necesita variables definidas para el formulario).

---

## Sprint 4 — Tabla y Calendario de trades

**Objetivo:** El usuario puede explorar todos sus trades de forma organizada.

- [ ] Tabla de trades con columnas: fecha, instrumento, dirección, resultado, RR, % (+ journal: PnL USD)
- [ ] Columnas adicionales según variables activas de la sesión (toggleables)
- [ ] Ordenar por cualquier columna
- [ ] Filtrar por: rango de fechas, resultado (tp/sl/be), dirección, instrumento, cualquier variable
- [ ] Búsqueda por notas/tags
- [ ] Paginación o scroll infinito
- [ ] Vista Calendario mensual:
  - Celda por día con: color (verde/rojo/gris), N trades, RR neto del día
  - Verde = PnL neto positivo, Rojo = negativo, Gris = BE / sin trades
  - Navegación mes anterior / mes siguiente
  - Al tocar un día: detalle de los trades de ese día

**Dependencias:** Sprint 3 completo (necesita trades existentes).

---

## Sprint 5 — Dashboard y métricas básicas

**Objetivo:** El usuario ve un resumen visual del rendimiento de su sesión.

- [ ] Dashboard principal de la sesión (`app/trading-journal/[sessionId]/page.tsx`)
- [ ] Tarjetas de métricas básicas:
  - Total trades / Ganadores / Perdedores / BE
  - Winrate %
  - Profit Factor
  - Expectativa matemática (en R)
  - Rentabilidad total (% y R)
  - Racha TP máxima
  - Racha SL máxima
- [ ] Barra de progreso de confiabilidad (0–300 trades, segmentada por umbrales)
- [ ] Gráfica de equity curve: línea del resultado acumulado en el tiempo (en R o % o USD según tipo)
  - Toggle: interés simple vs compuesto
  - Mostrar máximo drawdown en la gráfica
- [ ] Filtro de rango de fechas global para el dashboard
- [ ] `lib/trading/metrics.ts` con todas las funciones de cálculo

**Dependencias:** Sprint 3 completo.

---

## Sprint 6 — Métricas avanzadas y Sweet Spot

**Objetivo:** Análisis estadístico profundo y optimización de salidas.

**Métricas avanzadas** (`app/trading-journal/[sessionId]/stats/page.tsx`):
- [ ] Expectativa matemática detallada (con breakdown de RR ganador vs perdedor)
- [ ] Varianza y desviación estándar del RR
- [ ] Z-Score con interpretación visual (zona de aleatoriedad vs dependencia)
- [ ] P-Value con nivel de significancia (¿tiene edge real?)
- [ ] Consistencia mensual (% meses positivos, tabla mes a mes)
- [ ] Meses en pérdida: obtenidos vs esperados estadísticamente
- [ ] Expectativa por mes (proyección mensual)
- [ ] Cada métrica avanzada muestra su nivel de confianza si hay pocos trades
- [ ] `lib/trading/metrics.ts` extendido con fórmulas estadísticas

**Sweet Spot** (`app/trading-journal/[sessionId]/sweetspot/page.tsx`):
- [ ] Gráfica de RR acumulado simulado vs nivel de salida (0.25R en 0.25R)
- [ ] Punto resaltado en el máximo (sweet spot)
- [ ] Tabla comparativa: para cada nivel → total RR, winrate simulado, profit factor simulado
- [ ] Toma en cuenta BE automáticamente (ver algoritmo arriba)
- [ ] `lib/trading/sweetspot.ts`

**Dependencias:** Sprint 5 completo.

---

## Sprint 7 — Simulador Montecarlo

**Objetivo:** Proyecciones probabilísticas del rendimiento futuro.

- [ ] Pantalla de configuración (`app/trading-journal/[sessionId]/montecarlo/page.tsx`):
  - Capital hipotético inicial
  - % de riesgo por trade
  - Número de simulaciones (slider 1000–10000)
  - Número de trades a simular
  - Modo: Interés Simple / Compuesto / High Water Mark / D'Alembert Inverso
  - Toggle: usar trades reales vs ingresar distribución manual (% de win, RR promedio, etc.)
- [ ] Botón "Simular" → cálculo server-side en `/api/trading/montecarlo`
- [ ] Gráfica: N líneas grises + mejor (verde) + peor (rojo) + promedio (blanco/amarillo)
- [ ] Panel de estadísticas:
  - Capital Final: promedio y %, mejor, peor
  - Capital Máximo: promedio y %, mejor, peor
  - Racha TP máx.: promedio, mejor, peor
  - Racha SL máx.: promedio, mejor, peor
  - Probabilidad de ruina %
- [ ] `lib/trading/montecarlo.ts`

**Dependencias:** Sprint 5 completo (necesita trades y métricas base).

---

## Sprint 8 — Análisis con IA

**Objetivo:** El usuario puede consultar a Claude Haiku sobre su estrategia.

- [ ] Sección "Análisis con IA" (`app/trading-journal/[sessionId]/ai/page.tsx`)
- [ ] Grid de preguntas sugeridas (8 tarjetas, ver lista arriba)
- [ ] Campo de prompt abierto (textarea)
- [ ] Botón "Analizar" (manual, nunca automático)
- [ ] Loading state mientras Claude responde
- [ ] Respuesta mostrada en formato markdown
- [ ] Historial de análisis anteriores (colapsables, con fecha)
- [ ] `lib/trading/ai-prompts.ts` con constructor de prompts
- [ ] `/api/trading/ai/analyze` → llama a Claude Haiku 4.5 con los trades de la sesión

**Variables de entorno necesarias:**
- `ANTHROPIC_API_KEY` (ya existe en el hub según contexto)

**Dependencias:** Sprint 3 completo (necesita trades para analizar).

---

## Sprint 9 — Compartir sesiones y Notificaciones

**Objetivo:** El usuario puede compartir sesiones y recibir copias de otros usuarios.

- [ ] Botón "Compartir sesión" en el menú de cada sesión
- [ ] Modal: ingresar email del receptor (validar que sea usuario del mismo hub)
- [ ] Crear `tj_share_invitations` + `tj_notifications` para el receptor
- [ ] Panel de notificaciones (`app/trading-journal/notifications/page.tsx`):
  - Lista de notificaciones no leídas (badge con contador en nav)
  - Tarjeta: "{Nombre} te compartió la sesión '{Nombre Sesión}'" + botones Aceptar / Rechazar
  - Al Aceptar: se crea una copia completa de la sesión (sesión + variable definitions + trades) en la cuenta del receptor — completamente independiente
  - Al Rechazar: se marca la invitación como rechazada
- [ ] `/api/trading/share` y `/api/trading/notifications` routes
- [ ] Marcar notificaciones como leídas

**Dependencias:** Sprint 1 completo (necesita sesiones para compartir).

---

## Resumen de sprints

| Sprint | Qué se construye | Depende de |
|---|---|---|
| 0 | DB, permisos, estructura base | — |
| 1 | CRUD sesiones, conexiones B↔J | Sprint 0 |
| 2 | Variables personalizadas | Sprint 1 |
| 3 | Ingreso de trades, importación CSV | Sprint 2 |
| 4 | Tabla y calendario de trades | Sprint 3 |
| 5 | Dashboard, métricas básicas, equity curve | Sprint 3 |
| 6 | Métricas avanzadas, sweet spot | Sprint 5 |
| 7 | Simulador Montecarlo | Sprint 5 |
| 8 | Análisis con IA | Sprint 3 |
| 9 | Compartir sesiones, notificaciones | Sprint 1 |

Los sprints 4, 5, 8 y 9 pueden desarrollarse en paralelo una vez Sprint 3 está completo.
Los sprints 6 y 7 pueden desarrollarse en paralelo una vez Sprint 5 está completo.

---

## Variables de entorno necesarias

| variable | uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ya existe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya existe |
| `SUPABASE_SERVICE_ROLE_KEY` | ya existe |
| `ANTHROPIC_API_KEY` | Claude Haiku para análisis IA |

---

## Notas para el desarrollo

1. **Cálculos pesados server-side:** Montecarlo (hasta 10K simulaciones) se calcula en el API route, no en el cliente.
2. **JSONB indexing:** Crear índices GIN en `tj_trades.custom_fields` para que los filtros por variables personalizadas sean rápidos.
3. **Equity curve:** calcular en el servidor y enviar puntos reducidos al cliente (no enviar 1000 trades al frontend para graficar).
4. **Mobile first:** gráficas con scroll horizontal en móvil, tablas con columnas fijas (instrumento + resultado siempre visibles).
5. **Librerías de gráficas:** usar Recharts (ya compatible con Next.js) para equity curve, Montecarlo y Sweet Spot.
6. **Importación CSV:** usar `papaparse` en el cliente para parse + preview antes de enviar al servidor.
