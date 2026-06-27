# Acero IA — Documento Maestro de Planificación

## Qué es

Plataforma de inteligencia artificial tipo chat integrada en Acero Hub. Utiliza **routing inteligente de modelos**: cada mensaje se evalúa con Haiku para clasificar complejidad, y el sistema sugiere escalar a Sonnet u Opus cuando la tarea lo requiere. El usuario también puede forzar manualmente el modelo. Soporta generación de imágenes (GPT Image 2), presets de system prompts, galería de imágenes, y control granular de costos por usuario con límites configurables.

---

## Proyecto individual dentro del hub

Acero IA es un proyecto independiente que vive dentro de Acero Hub. Sigue el mismo principio de aislamiento que Trading Journal y Mundial 2026: **todo lo que pertenece a Acero IA vive en sus propias carpetas y no toca archivos de otros proyectos**.

Los únicos archivos compartidos del hub que puede usar son:
- `lib/supabase.ts` — cliente Supabase del navegador
- `lib/supabase-server.ts` — cliente Supabase del servidor

Todo lo demás (lógica, librerías, schema de BD, documentación) vive en carpetas con prefijo `acero-ia/` o `aia_`.

---

## Identidad visual y diseño

### Concepto: "Prisma" — Interfaz cinematográfica oscura

Acero IA NO es un clon de ChatGPT ni Claude. El concepto visual es **"Prisma"**: una entidad geométrica cristalina que refracta y procesa información. La interfaz se siente como un terminal premium de ciencia ficción editorial — oscura, con profundidad, y acentos de luz que guían la atención.

### Mascota: El Prisma

Un poliedro geométrico abstracto (icosaedro simplificado) que representa la IA. Sus caras reflejan diferentes colores según el modelo activo:
- **Haiku →** acento ámbar (rápido, ligero)
- **Sonnet →** acento cyan (equilibrado)
- **Opus →** acento violeta (profundo, poderoso)
- **Imagen →** acento magenta (creativo)

El Prisma aparece como:
- Icono de la app en el Hub (SVG estático)
- Avatar del asistente en cada mensaje del chat (pequeño, 24px)
- Animación sutil de rotación mientras genera respuesta (loading state)
- Estado idle: brillo tenue pulsante en el color del modelo activo

### Paleta de colores

```
Fondos:
  --aia-bg-deep:       #08090a     ← fondo principal (casi negro, no puro)
  --aia-bg-surface:    #111214     ← sidebar, paneles
  --aia-bg-elevated:   #1a1b1f     ← cards, mensajes del asistente
  --aia-bg-hover:      #222328     ← hover states

Texto:
  --aia-text-primary:  #e8e8ed     ← texto principal (blanco cálido, no #fff puro)
  --aia-text-secondary:#6b6d7b     ← texto secundario, timestamps
  --aia-text-muted:    #3d3f4a     ← placeholders, deshabilitados

Acentos por modelo:
  --aia-amber:         #e5a000     ← Haiku (dorado cálido)
  --aia-cyan:          #00b8d4     ← Sonnet (cyan profundo)
  --aia-violet:        #8b5cf6     ← Opus (violeta eléctrico)
  --aia-magenta:       #d946ef     ← Imagen/creatividad

Bordes y separadores:
  --aia-border:        #1e1f25     ← bordes sutiles
  --aia-border-active: #2a2b33     ← bordes activos

Estados:
  --aia-success:       #22c55e     ← confirmaciones
  --aia-warning:       #f59e0b     ← alertas de límite
  --aia-error:         #ef4444     ← errores, límite alcanzado
```

### Tipografía

**Headings:** Space Grotesk (peso 500–700) — geométrica, futurista, con carácter propio
**Body/Chat:** DM Sans (peso 400–500) — altamente legible, moderna
**Código:** JetBrains Mono — monospace diseñada para código

```
Google Fonts:
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

Tailwind config:
fontFamily: {
  heading: ['Space Grotesk', 'sans-serif'],
  body: ['DM Sans', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

### Lo que hace DIFERENTE a esta UI

1. **Fondo con textura sutil** — un patrón de puntos microscópicos (1px, 3% opacidad) sobre el fondo oscuro. No es plano muerto como ChatGPT.
2. **Líneas de acento cinemáticas** — líneas horizontales ultrafinas (1px, 8% opacidad) que dividen secciones, como fotogramas de película.
3. **Color que respira** — el color de acento de la interfaz cambia según el modelo activo. Si Haiku responde, los bordes activos y el cursor pulsan en ámbar. Si Opus, en violeta. Toda la interfaz refleja qué modelo está trabajando.
4. **Mensajes del asistente con borde lateral** — en vez de un fondo diferente (como ChatGPT), los mensajes del asistente tienen un borde izquierdo de 2px en el color del modelo que respondió.
5. **Input flotante** — la barra de input no está pegada al fondo. Es un componente flotante con borde sutil, border-radius generoso, y sombra interna. Recuerda más a un campo de búsqueda premium que a un textarea.
6. **Sidebar translúcido** — el sidebar tiene un backdrop-blur sutil y opacidad para crear profundidad, no es un bloque opaco.
7. **Transiciones suaves** — todo usa transitions de 200-300ms. Nada aparece/desaparece de golpe.
8. **Sin íconos genéricos** — Lucide icons exclusivamente, estilo stroke de 1.5px para consistencia con la estética fina.

### Estructura visual del layout

```
┌──────────────────────────────────────────────────────────┐
│ SIDEBAR (280px)          │  CHAT AREA                    │
│ ┌──────────────────────┐ │                               │
│ │ [Prisma] Acero IA    │ │  ┌─ Preset badge ──────────┐  │
│ │                      │ │  │  Programador             │  │
│ ├──────────────────────┤ │  └──────────────────────────┘  │
│ │ [+ Nueva conversac.] │ │                               │
│ ├──────────────────────┤ │  ┌─ Mensaje usuario ────────┐  │
│ │                      │ │  │                           │  │
│ │ Conversación 1       │ │  │  {contenido}              │  │
│ │ Conversación 2  ●    │ │  │                           │  │
│ │ Conversación 3       │ │  └───────────────────────────┘  │
│ │ ...                  │ │                               │
│ │                      │ │  ┌─ Mensaje asistente ──────┐  │
│ │                      │ │  │▌ {contenido}      [Haiku]│  │
│ │                      │ │  │▌                         │  │
│ │                      │ │  │▌ ```code```    [Copiar]  │  │
│ │                      │ │  │▌                         │  │
│ │                      │ │  └───────────────────────────┘  │
│ ├──────────────────────┤ │                               │
│ │ ┌──────────────────┐ │ │                               │
│ │ │ Consumo: $2.40   │ │ │  ┌─────────────────────────┐  │
│ │ │ ████████░░ 24%   │ │ │  │ [📎] [Modelo: Auto ▾]   │  │
│ │ └──────────────────┘ │ │  │ Escribe tu mensaje...   │  │
│ │ [Presets] [Galería]  │ │  │                    [→]   │  │
│ └──────────────────────┘ │  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Mobile (< 768px):** sidebar es un drawer que se abre desde la izquierda con gesto swipe o botón hamburguesa. El chat ocupa 100% del ancho.

---

## Decisiones de arquitectura

- **Stack:** Next.js App Router, Tailwind CSS, Supabase (auth + DB + Storage)
- **Modelos de texto:** Claude Haiku 4.5 (clasificación + respuestas simples), Claude Sonnet 4.6 (tareas complejas), Claude Opus 4.8 (tareas muy complejas)
- **Modelo de imágenes:** GPT Image 2 (OpenAI API)
- **Modelo de video (próximamente):** Kling 3.0
- **Streaming:** SSE (Server-Sent Events) para respuestas de texto en tiempo real
- **Permisos:** tabla `project_access` en el hub — el admin asigna acceso a Acero IA por usuario
- **Prefijo de tablas:** `aia_` para no colisionar con el hub ni con otros proyectos
- **Límite de gasto:** $10 USD por usuario por mes (configurable por el admin)
- **Almacenamiento de imágenes:** Supabase Storage (bucket `acero-ia-images`) para descarga posterior

---

## Modelos y precios de referencia

| Modelo | Uso | Input (1M tokens) | Output (1M tokens) |
|---|---|---|---|
| Claude Haiku 4.5 | Clasificación + respuestas simples | $1.00 | $5.00 |
| Claude Sonnet 4.6 | Tareas complejas | $3.00 | $15.00 |
| Claude Opus 4.8 | Tareas muy complejas | $15.00 | $75.00 |
| GPT Image 2 | Generación de imágenes | ~$0.02–$0.19 por imagen (según tamaño/calidad) |
| Kling 3.0 | Generación de video (próximamente) | TBD |

Estos precios se usarán para calcular el costo real de cada interacción y mostrarlo al usuario.

---

## Estructura de archivos

```
app/acero-ia/
├── layout.tsx                          — layout con sidebar de conversaciones
├── page.tsx                            — nueva conversación (chat vacío)
├── [conversationId]/
│   └── page.tsx                        — chat de una conversación específica
├── gallery/
│   └── page.tsx                        — galería personal de imágenes generadas
├── usage/
│   └── page.tsx                        — panel de consumo del usuario
├── admin/
│   ├── page.tsx                        — dashboard de costos (admin)
│   ├── users/page.tsx                  — costos por usuario
│   ├── limits/page.tsx                 — gestión de límites
│   └── logs/page.tsx                   — logs de uso detallados

app/api/acero-ia/
├── chat/route.ts                       — endpoint principal de chat (streaming SSE)
├── classify/route.ts                   — clasificación de complejidad con Haiku
├── conversations/route.ts              — CRUD conversaciones
├── conversations/[id]/route.ts         — operaciones sobre una conversación
├── conversations/[id]/messages/route.ts — historial de mensajes
├── images/generate/route.ts            — generación de imágenes (GPT Image 2)
├── images/route.ts                     — CRUD galería de imágenes
├── presets/route.ts                    — CRUD system prompts del usuario
├── presets/global/route.ts             — presets globales (admin)
├── usage/route.ts                      — consumo del usuario actual
├── usage/[userId]/route.ts             — consumo por usuario (admin)
├── admin/dashboard/route.ts            — datos del dashboard admin
├── admin/limits/route.ts              — gestión de límites (admin)
├── admin/logs/route.ts                — logs de uso (admin)
└── admin/alerts/route.ts             — configuración de alertas (admin)

lib/acero-ia/
├── classifier.ts                       — lógica de clasificación de complejidad
├── cost-calculator.ts                  — cálculo de costos por modelo/tokens
├── models.ts                           — configuración de modelos y constantes
├── prompts.ts                          — system prompts base y constructor
├── stream.ts                           — utilidades de streaming SSE
└── image-utils.ts                      — utilidades para manejo de imágenes

supabase/acero-ia/
└── schema.sql
```

---

## Base de datos

### `aia_conversations`
```sql
id              uuid PK default gen_random_uuid()
user_id         uuid FK → profiles(id)
title           text        -- generado automáticamente por Haiku
preset_id       uuid FK → aia_presets(id) nullable
last_model_used text        -- último modelo usado en esta conversación
is_archived     boolean default false
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

### `aia_messages`
```sql
id              uuid PK default gen_random_uuid()
conversation_id uuid FK → aia_conversations(id) ON DELETE CASCADE
role            text        -- 'user' | 'assistant' | 'system'
content         text        -- contenido del mensaje (texto o markdown)
model_used      text        -- 'haiku' | 'sonnet' | 'opus' | 'gpt-image-2' | null (para user)
model_suggested text        -- modelo que se sugirió (si hubo sugerencia)
user_accepted   boolean     -- si el usuario aceptó la sugerencia de modelo
tokens_input    int         -- tokens de entrada consumidos
tokens_output   int         -- tokens de salida consumidos
cost_usd        numeric     -- costo calculado de esta interacción
image_ids       uuid[]      -- referencias a imágenes generadas (si aplica)
parent_id       uuid FK → aia_messages(id) nullable  -- para forks (editar mensaje)
is_regenerated  boolean default false
created_at      timestamptz default now()
```

### `aia_presets`
```sql
id              uuid PK default gen_random_uuid()
user_id         uuid FK → profiles(id) nullable  -- null = preset global (creado por admin)
name            text        -- "Experto en Python", "Traductor", etc.
system_prompt   text        -- el contenido del system prompt
is_default      boolean default false  -- si es el preset por defecto del usuario
is_global       boolean default false  -- true = visible para todos los usuarios
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

### `aia_images`
```sql
id              uuid PK default gen_random_uuid()
user_id         uuid FK → profiles(id)
conversation_id uuid FK → aia_conversations(id) nullable
message_id      uuid FK → aia_messages(id) nullable
prompt          text        -- prompt usado para generar la imagen
revised_prompt  text        -- prompt revisado por el modelo (si aplica)
storage_path    text        -- path en Supabase Storage
size            text        -- '1024x1024' | '1792x1024' | '1024x1792'
quality         text        -- 'low' | 'medium' | 'high'
cost_usd        numeric     -- costo de esta generación
parent_image_id uuid FK → aia_images(id) nullable  -- si es variación de otra imagen
created_at      timestamptz default now()
```

### `aia_usage_logs`
```sql
id              uuid PK default gen_random_uuid()
user_id         uuid FK → profiles(id)
conversation_id uuid FK → aia_conversations(id) nullable
message_id      uuid FK → aia_messages(id) nullable
model           text        -- 'haiku' | 'sonnet' | 'opus' | 'gpt-image-2'
tokens_input    int default 0
tokens_output   int default 0
cost_usd        numeric not null
created_at      timestamptz default now()
```

### `aia_usage_limits`
```sql
id              uuid PK default gen_random_uuid()
user_id         uuid FK → profiles(id) UNIQUE
monthly_limit   numeric default 10.00  -- límite en USD por mes
limit_start     timestamptz default now()  -- fecha desde la cual cuenta el mes
is_unlimited    boolean default false       -- admin puede desactivar el límite
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

### `aia_alerts`
```sql
id              uuid PK default gen_random_uuid()
user_id         uuid FK → profiles(id) nullable  -- null = alerta global
threshold_pct   int         -- porcentaje del límite (ej: 80 = 80%)
threshold_usd   numeric     -- o monto fijo en USD
type            text        -- 'percentage' | 'fixed'
notified        boolean default false
created_at      timestamptz default now()
```

### RLS (Row Level Security)
```
- aia_conversations: usuario solo ve las suyas
- aia_messages: usuario solo ve mensajes de sus conversaciones
- aia_presets: usuario ve los suyos + los globales (is_global = true)
- aia_images: usuario solo ve las suyas
- aia_usage_logs: usuario solo ve los suyos; admin ve todos
- aia_usage_limits: usuario solo ve el suyo; admin ve y edita todos
- aia_alerts: admin only para gestión
```

---

## Flujo del chat (routing inteligente)

### Paso 1 — Clasificación (Haiku)
Cuando el usuario envía un mensaje, el sistema envía a Haiku un prompt de clasificación:

```
Eres un clasificador de complejidad. Analiza el mensaje del usuario y responde 
SOLO con un JSON:

{
  "complexity": "low" | "medium" | "high",
  "category": "text" | "image",
  "recommended_model": "haiku" | "sonnet" | "opus" | "gpt-image-2",
  "reason": "explicación breve de por qué recomiendas este modelo"
}

Criterios:
- low: preguntas simples, traducciones cortas, respuestas factuales → haiku
- medium: análisis, redacción larga, código moderado, explicaciones detalladas → sonnet
- high: razonamiento complejo, arquitectura, análisis profundo, código avanzado → opus
- image: el usuario quiere generar, crear o dibujar una imagen → gpt-image-2

Contexto de la conversación: {últimos N mensajes}

Mensaje del usuario: {mensaje}
```

### Paso 2 — Sugerencia al usuario
Si el modelo recomendado es diferente al actual (o al default Haiku):
- Se muestra un componente inline en el chat: _"Esta tarea parece compleja. ¿Quieres que use **Sonnet**? Costo estimado: ~$0.003"_
- Dos botones: **Sí, usar Sonnet** / **No, continuar con Haiku**
- Si el usuario ha seleccionado manualmente un modelo, se respeta sin sugerir

### Paso 3 — Respuesta
- **Texto:** Se envía el mensaje al modelo elegido con streaming SSE. El contexto incluye los últimos mensajes de la conversación + el system prompt del preset activo.
- **Imagen:** Se envía el prompt a GPT Image 2, se almacena la imagen en Supabase Storage, se muestra inline en el chat con botón de descarga.

### Paso 4 — Registro de costos
Después de cada respuesta:
1. Calcular tokens usados (input + output)
2. Calcular costo según tabla de precios
3. Insertar en `aia_usage_logs`
4. Actualizar `aia_messages` con tokens y costo
5. Verificar si el usuario se acerca al límite → disparar alerta si aplica

### Memoria de modelo por conversación
- Si en una conversación ya se escaló a Sonnet, el sistema recuerda y sigue sugiriendo Sonnet para el resto de esa conversación (campo `last_model_used` en `aia_conversations`)
- El usuario siempre puede cambiar manualmente

---

## Selector manual de modelo

En la barra de input del chat, un dropdown permite al usuario elegir:
- **Auto** (default) — deja que el router decida
- **Haiku** — fuerza Haiku (más barato, más rápido)
- **Sonnet** — fuerza Sonnet
- **Opus** — fuerza Opus (más caro, más capaz)
- **Imagen** — fuerza generación de imagen

Cuando está en modo manual, no se ejecuta la clasificación con Haiku (ahorro de costos).

---

## System Prompts (Presets)

### Presets del usuario
- El usuario puede crear, editar y eliminar presets desde un menú en el sidebar
- Cada preset tiene: nombre y system prompt
- Un preset puede marcarse como "por defecto" (se aplica a nuevas conversaciones)
- Al crear una conversación, se puede elegir un preset diferente

### Presets globales (Admin)
- El admin puede crear presets globales visibles para todos los usuarios
- Los presets globales no son editables por usuarios normales
- Ejemplos iniciales sugeridos:
  - **Asistente general** — "Eres un asistente útil que responde en español."
  - **Programador** — "Eres un experto en programación. Responde con código claro y explicaciones concisas."
  - **Traductor** — "Eres un traductor profesional. Traduce entre español e inglés manteniendo tono y contexto."
  - **Redactor** — "Eres un redactor experto. Ayuda a escribir, corregir y mejorar textos."

### Badge visible
En la parte superior del chat se muestra un badge con el nombre del preset activo (ej: "Programador"). Si no hay preset, no se muestra nada.

---

## Generación de imágenes

### Flujo
1. El clasificador detecta intención de imagen (o el usuario selecciona modo Imagen)
2. El prompt se envía a GPT Image 2 (OpenAI API)
3. La imagen se almacena en Supabase Storage (`acero-ia-images/{userId}/{imageId}.png`)
4. Se muestra inline en el chat con:
   - Botón **Descargar**
   - Botón **Generar variación** (re-genera con el mismo prompt + modificador)
   - Botón **Editar prompt** (abre el prompt original para modificarlo y re-generar)

### Opciones de generación
El usuario puede configurar antes de generar:
- **Tamaño:** Cuadrado (1024x1024), Horizontal (1792x1024), Vertical (1024x1792)
- **Calidad:** Low, Medium, High

### Galería personal (`/acero-ia/gallery`)
- Grid de todas las imágenes generadas por el usuario
- Filtros: por fecha (rango), por tamaño, por calidad
- Cada imagen muestra: thumbnail, prompt usado, fecha, costo
- Click abre la imagen a tamaño completo con opción de descarga
- Botón para generar variación directamente desde la galería
- Botón para ver la conversación donde se generó

---

## Experiencia de chat

### Markdown renderizado
- Las respuestas del asistente renderizan markdown completo:
  - Headers, bold, italic, listas
  - Tablas
  - Bloques de código con syntax highlighting (por lenguaje)
  - Fórmulas LaTeX (inline y block)
  - Links clicables

### Bloques de código
- Cada bloque de código tiene un botón **Copiar** en la esquina superior derecha
- Syntax highlighting automático por lenguaje
- El código se muestra en formato de solo lectura, no se puede ejecutar
- Excepción: HTML se puede previsualizar en un iframe sandboxed con botón **Preview**

### Regenerar respuesta
- Botón debajo de cada respuesta del asistente: **Regenerar**
- Re-envía el último mensaje del usuario al modelo y genera una nueva respuesta
- La respuesta anterior se marca como `is_regenerated` y se oculta (pero se preserva en BD)

### Editar mensaje enviado
- Hover sobre un mensaje del usuario muestra botón **Editar**
- Al editar, se crea un fork: los mensajes posteriores al editado se preservan bajo `parent_id`, pero la conversación continúa desde el mensaje editado
- La UI muestra la rama activa; las ramas anteriores son accesibles con navegación tipo "<" / ">"

### Sugerencia de modelo (toggle inline)
Cuando el clasificador sugiere un modelo diferente, se muestra un componente dentro del flujo del chat:

```
┌─────────────────────────────────────────────┐
│  Esta tarea parece compleja.                │
│  ¿Quieres que use Sonnet?                   │
│  Costo estimado: ~$0.003                    │
│                                             │
│  [Sí, usar Sonnet]    [No, usar Haiku]      │
└─────────────────────────────────────────────┘
```

### Título automático
Después de los primeros 2 mensajes de una conversación (1 del usuario + 1 del asistente), Haiku genera un título corto (máx 50 chars) basado en el contenido. Se actualiza `aia_conversations.title`.

---

## Archivos adjuntos

El usuario puede adjuntar archivos al chat:
- **Imágenes** (PNG, JPG, GIF, WebP) — se envían al modelo para análisis visual
- **PDFs** — se extrae el texto y se incluye en el contexto del mensaje
- **Archivos de texto** (TXT, CSV, JSON, código) — se incluyen como texto en el contexto

Los archivos se almacenan temporalmente en Supabase Storage para la sesión. El modelo recibe el contenido como parte del prompt.

Límites:
- Máx 10 MB por archivo
- Máx 5 archivos por mensaje

---

## Panel del usuario — Consumo (`/acero-ia/usage`)

### Widget en el sidebar
Barra de progreso circular o lineal que muestra:
- Gasto actual del mes / Límite ($X.XX / $10.00)
- Porcentaje usado
- Color: verde (<50%), amarillo (50-80%), rojo (>80%)

### Página de consumo
- **Desglose por modelo:** gráfico de dona o barras mostrando gasto por modelo
  - Ej: "Haiku: $0.45 | Sonnet: $3.20 | Opus: $1.80 | Imágenes: $0.60"
- **Historial de consumo:** gráfica de línea de gasto diario en los últimos 7/30 días
- **Tabla de últimas interacciones:** fecha, modelo, tokens, costo
- **Proyección:** "A este ritmo, llegarás al límite el día X"

---

## Panel de Admin (`/acero-ia/admin`)

### Dashboard de costos (`/acero-ia/admin`)
- **Gasto total** del mes actual (todos los usuarios)
- **Gráfica de gasto por día/semana/mes** (línea temporal)
- **Desglose por modelo** (dona/barras): cuánto se gasta en Haiku vs Sonnet vs Opus vs Imágenes
- **Top 5 usuarios por gasto** (tabla con ranking)

### Costos por usuario (`/acero-ia/admin/users`)
- Tabla con todos los usuarios: nombre, gasto del mes, límite, % usado, N conversaciones, N mensajes
- Filtrar por rango de fechas
- Click en usuario → detalle con historial de uso y gráfica individual

### Gestión de límites (`/acero-ia/admin/limits`)
- Tabla con límites actuales de cada usuario
- Editar límite individual (cambiar monto USD)
- Toggle "ilimitado" por usuario
- Cambiar límite global por defecto (aplica a nuevos usuarios)
- Los límites se reinician cada 30 días desde `limit_start` del usuario

### Alertas de gasto (`/acero-ia/admin`)
- Configurar umbrales de alerta:
  - Porcentual: "Alertar cuando un usuario llegue al 80% de su límite"
  - Fijo: "Alertar cuando el gasto total supere $50 USD"
- Las alertas se muestran en el dashboard del admin como notificaciones
- Futuro: enviar email al admin

### Logs de uso (`/acero-ia/admin/logs`)
- Tabla detallada con cada request:
  - Timestamp, usuario, modelo, tokens input, tokens output, costo, conversación
- Filtros: por usuario, por modelo, por rango de fechas, por rango de costo
- Exportar a CSV

---

## Sprints de desarrollo

Cada sprint incluye **UI skeleton** (bloques grises como placeholders donde irán datos reales) + **backend funcional**. Al terminar cada sprint, la funcionalidad queda operativa de punta a punta.

---

### Sprint 0 — Fundación

**Objetivo:** Todo lo estructural, DB, permisos, diseño base. Cero funcionalidad todavía, pero toda la base lista para que ningún sprint posterior tenga problemas de dependencias.

**Base de datos y permisos:**
- [ ] Crear todas las tablas en Supabase (`supabase/acero-ia/schema.sql`): `aia_conversations`, `aia_messages`, `aia_presets`, `aia_images`, `aia_usage_logs`, `aia_usage_limits`, `aia_alerts`
- [ ] Configurar RLS en todas las tablas (ver reglas en sección Base de datos)
- [ ] Crear bucket `acero-ia-images` en Supabase Storage con políticas de acceso por usuario
- [ ] Registrar proyecto "Acero IA" en tabla `projects` del hub (slug: `acero-ia`)
- [ ] Insertar registro de acceso para el admin en `project_access`

**Assets del Hub:**
- [ ] Crear SVG del Prisma (mascota) — icono 17x17 para el Hub
- [ ] Crear SVG del banner para el card del Hub (estilo cinematográfico oscuro con Prisma)
- [ ] Registrar ambos en `lib/project-assets.tsx`

**Estructura de archivos:**
- [ ] Crear carpetas: `app/acero-ia/`, `app/api/acero-ia/`, `lib/acero-ia/`
- [ ] `app/acero-ia/layout.tsx` — layout raíz con metadata, importación de fuentes (Space Grotesk, DM Sans, JetBrains Mono), variables CSS del tema Prisma
- [ ] `app/acero-ia/page.tsx` — página vacía con placeholder

**Configuración:**
- [ ] Configurar variables de entorno: `ANTHROPIC_API_KEY` (ya existe), `OPENAI_API_KEY`
- [ ] Instalar dependencias: `openai`, `react-markdown`, `remark-gfm`, `rehype-highlight`
- [ ] `lib/acero-ia/models.ts` — constantes de modelos (IDs, precios por token, nombres display)
- [ ] `lib/acero-ia/cost-calculator.ts` — funciones de cálculo de costo dado modelo + tokens

**Dependencias:** ninguna.

---

### Sprint 1 — Chat básico con Haiku (UI skeleton + backend)

**Objetivo:** Chat funcional con un solo modelo (Haiku). El usuario puede crear conversaciones, enviar mensajes y recibir respuestas con streaming. Sidebar con lista de conversaciones. Markdown renderizado. Todo persiste en Supabase.

**UI skeleton del layout principal:**
- [ ] Sidebar (280px desktop, drawer en mobile):
  - Cabecera con logo Prisma + "Acero IA"
  - Botón "Nueva conversación"
  - Lista de conversaciones (cada item: bloque gris para `{title}`, bloque gris para `{date}`)
  - Zona inferior: bloque gris para widget de consumo (se integra en Sprint 5)
  - Botones de navegación: bloques grises para "Presets" y "Galería" (se integran después)
- [ ] Área de chat:
  - Estado vacío (nueva conversación): Prisma centrado + texto "¿En qué puedo ayudarte?"
  - Lista de mensajes con scroll automático
  - Mensajes del usuario: alineados derecha, fondo `--aia-bg-elevated`
  - Mensajes del asistente: borde izquierdo 2px `--aia-amber` (Haiku), avatar Prisma pequeño, bloque gris para `[modelo]` badge
  - Input flotante: textarea con border-radius 16px, borde `--aia-border`, botón enviar
  - Bloque gris para selector de modelo (se activa en Sprint 2)
  - Bloque gris para botón adjuntar archivo (se activa en Sprint 6)
- [ ] Hamburger button en mobile para abrir sidebar drawer

**Backend del chat:**
- [ ] `lib/acero-ia/stream.ts` — utilidades de streaming SSE (encoder, parser)
- [ ] `app/api/acero-ia/chat/route.ts` — endpoint POST que recibe mensajes, llama a Haiku con streaming, retorna SSE
- [ ] `app/api/acero-ia/conversations/route.ts` — GET (listar) y POST (crear)
- [ ] `app/api/acero-ia/conversations/[id]/route.ts` — GET (detalle), PATCH (actualizar título), DELETE
- [ ] `app/api/acero-ia/conversations/[id]/messages/route.ts` — GET historial de mensajes
- [ ] Persistencia: crear conversación al primer mensaje, guardar cada mensaje en `aia_messages`
- [ ] Título automático: después del primer par de mensajes, llamar a Haiku para generar título (máx 50 chars)

**Rendering de respuestas:**
- [ ] Markdown completo con `react-markdown` + `remark-gfm`
- [ ] Syntax highlighting en bloques de código con `rehype-highlight`
- [ ] Botón "Copiar" en cada bloque de código
- [ ] Preview de HTML en iframe sandboxed con botón "Preview"
- [ ] Tablas renderizadas con estilos del tema
- [ ] Links clicables

**Dependencias:** Sprint 0 completo.

---

### Sprint 2 — Routing inteligente + selector manual de modelo

**Objetivo:** El sistema clasifica la complejidad de cada mensaje y sugiere el modelo adecuado. El usuario puede forzar un modelo manualmente. Sonnet y Opus quedan disponibles como modelos de respuesta.

**UI:**
- [ ] Activar el selector de modelo en la barra de input (reemplazar bloque gris del Sprint 1):
  - Dropdown compacto: Auto / Haiku / Sonnet / Opus / Imagen
  - Cada opción muestra nombre + color del modelo (ámbar/cyan/violeta/magenta)
  - El selector muestra el modo actual con un dot de color
- [ ] Componente de sugerencia inline en el chat:
  - Card con fondo `--aia-bg-elevated`, borde del color del modelo sugerido
  - Texto: "Esta tarea parece compleja. ¿Quieres que use **{modelo}**?"
  - Subtexto: "Costo estimado: ~${costo}"
  - Dos botones: "Sí, usar {modelo}" (color del modelo) / "No, continuar con {modelo_actual}" (gris)
- [ ] Badge de modelo en cada mensaje del asistente (reemplazar bloque gris del Sprint 1):
  - Pill pequeña con el nombre del modelo y su color de acento
- [ ] El borde izquierdo de los mensajes del asistente cambia de color según el modelo que respondió

**Backend:**
- [ ] `lib/acero-ia/classifier.ts` — función que envía a Haiku el prompt de clasificación y parsea el JSON de respuesta
- [ ] `app/api/acero-ia/classify/route.ts` — endpoint POST de clasificación
- [ ] Integrar Sonnet (`claude-sonnet-4-6`) y Opus (`claude-opus-4-8`) como modelos disponibles en el endpoint de chat
- [ ] Lógica: si modo = "Auto" → clasificar primero → sugerir → esperar respuesta del usuario → responder con modelo elegido
- [ ] Lógica: si modo = manual → saltar clasificación, responder directo con el modelo elegido
- [ ] Guardar `model_used`, `model_suggested`, `user_accepted` en `aia_messages`
- [ ] Actualizar `last_model_used` en `aia_conversations` después de cada respuesta
- [ ] Memoria de modelo: si la conversación ya escaló, sugerir ese modelo como default

**Dependencias:** Sprint 1 completo.

---

### Sprint 3 — System Prompts (Presets)

**Objetivo:** El usuario puede crear, gestionar y usar presets de system prompt. El preset activo se inyecta en el contexto del chat y se muestra como badge.

**UI:**
- [ ] Activar botón "Presets" en el sidebar (reemplazar bloque gris):
  - Abre un panel/modal con lista de presets del usuario + presets globales
  - Cada preset: nombre, badge "Global" si aplica, botón "Editar", botón "Eliminar", indicador "Default"
  - Botón "Crear preset" → formulario: nombre (input), system prompt (textarea)
  - Toggle "Usar como default" en cada preset
- [ ] Selector de preset al crear nueva conversación:
  - Debajo del input de la primera conversación, un selector: "Preset: {nombre} ▾" o "Sin preset"
- [ ] Badge del preset activo en la cabecera del chat:
  - Pill con nombre del preset, fondo `--aia-bg-elevated`, borde `--aia-border-active`
  - Si no hay preset, no se muestra nada

**Backend:**
- [ ] `app/api/acero-ia/presets/route.ts` — GET (listar propios + globales) y POST (crear)
- [ ] `app/api/acero-ia/presets/[id]/route.ts` — PATCH (editar) y DELETE (eliminar)
- [ ] Inyectar system prompt del preset como primer mensaje del contexto al llamar al modelo
- [ ] Guardar `preset_id` en `aia_conversations` al crear conversación con preset
- [ ] Validación: no permitir editar/eliminar presets globales si no es admin

**Dependencias:** Sprint 1 completo.

---

### Sprint 4 — Generación de imágenes

**Objetivo:** El usuario puede generar imágenes con GPT Image 2, verlas inline en el chat, descargarlas, generar variaciones y editar el prompt.

**UI:**
- [ ] Cuando el modo es "Imagen" (manual o sugerido), mostrar opciones de generación arriba del input:
  - Selector de tamaño: Cuadrado / Horizontal / Vertical (con iconos de aspect ratio)
  - Selector de calidad: Low / Medium / High
- [ ] Imagen renderizada inline en el mensaje del asistente:
  - Imagen con border-radius 12px, max-width 512px
  - Loading state: bloque gris pulsante del tamaño seleccionado con Prisma rotando
  - Barra de acciones debajo de la imagen:
    - Botón "Descargar" (icono flecha abajo)
    - Botón "Variación" (icono refresh)
    - Botón "Editar prompt" (icono lápiz) → abre el prompt en el input para modificar y re-enviar
  - Badge `[GPT Image 2]` en magenta
- [ ] Estado de error: si la generación falla, mostrar mensaje de error inline con opción de reintentar

**Backend:**
- [ ] `app/api/acero-ia/images/generate/route.ts` — POST: recibe prompt + tamaño + calidad, llama a OpenAI API, almacena imagen en Supabase Storage, retorna URL + metadata
- [ ] `lib/acero-ia/image-utils.ts` — utilidades para subir a Storage, generar paths, calcular costo por tamaño/calidad
- [ ] Flujo de variación: re-envía el mismo prompt con seed diferente
- [ ] Guardar registro en `aia_images` con toda la metadata
- [ ] Guardar referencia de imagen en `aia_messages.image_ids`
- [ ] Calcular y registrar costo en `aia_usage_logs`

**Dependencias:** Sprint 2 completo (necesita clasificador para detectar intención de imagen + selector de modo).

---

### Sprint 5 — Registro de costos y widget del usuario

**Objetivo:** Cada interacción registra su costo. El usuario ve cuánto ha gastado en tiempo real. Si excede el límite, se bloquea el uso.

**UI:**
- [ ] Activar widget de consumo en el sidebar (reemplazar bloque gris):
  - Barra de progreso horizontal con porcentaje
  - Texto: "$X.XX / $10.00"
  - Colores: verde (<50%), amarillo `--aia-warning` (50-80%), rojo `--aia-error` (>80%)
  - Click abre página de consumo detallado
  - Se actualiza en tiempo real después de cada mensaje (sin recargar)
- [ ] Página `/acero-ia/usage`:
  - Tarjeta de resumen: gasto del mes, límite, % usado, días restantes
  - Desglose por modelo: gráfico de barras horizontales con color de cada modelo
    - Bloque gris `{monto}` al lado de cada barra
  - Historial de consumo: gráfica de línea (últimos 7/30 días toggle)
    - Ejes: bloque gris `{fecha}` en X, bloque gris `{monto}` en Y
  - Tabla de últimas interacciones: columnas fecha, modelo (con color), tokens, costo
    - Cada celda: bloque gris `{dato}`
  - Proyección: texto "A este ritmo, llegarás al límite el {fecha}"
- [ ] Estado de límite alcanzado:
  - El input se deshabilita con mensaje: "Has alcanzado tu límite de $10.00 este mes. Contacta al admin."
  - Barra de progreso en rojo al 100%

**Backend:**
- [ ] Integrar registro de costos en el endpoint de chat (Sprint 1): después de cada respuesta, calcular tokens, costo, insertar en `aia_usage_logs`, actualizar `aia_messages`
- [ ] Integrar registro de costos en generación de imágenes (Sprint 4): registrar costo de cada imagen
- [ ] `app/api/acero-ia/usage/route.ts` — GET: retorna gasto del mes actual, desglose por modelo, historial diario, límite
- [ ] Crear `aia_usage_limits` automáticamente para cada usuario al primer uso (default $10.00)
- [ ] Verificación de límite ANTES de cada respuesta: si `gasto_mes >= monthly_limit && !is_unlimited`, retornar error 429
- [ ] Cálculo de proyección: `(gasto_actual / días_transcurridos) * 30`

**Dependencias:** Sprint 1 completo. (Se integra retroactivamente con Sprint 2 y Sprint 4 si ya están completos.)

---

### Sprint 6 — Acciones avanzadas del chat

**Objetivo:** Regenerar respuestas, editar mensajes enviados (fork), archivos adjuntos, archivar conversaciones.

**UI:**
- [ ] Botón "Regenerar" en cada mensaje del asistente:
  - Aparece en hover (desktop) o siempre visible (mobile)
  - Icono refresh, posición debajo del mensaje junto al badge de modelo
  - Loading state: Prisma rotando mientras regenera
- [ ] Editar mensaje del usuario:
  - Botón "Editar" aparece en hover sobre mensajes del usuario
  - Al hacer click, el contenido del mensaje se carga en el input para editar
  - Al enviar, se crea fork: mensajes anteriores se preservan, nuevos se generan desde el editado
  - Navegación entre ramas: flechas "<" / ">" en la parte superior del mensaje editado, con indicador "Rama 1/3"
- [ ] Activar botón de adjuntar archivo en el input (reemplazar bloque gris):
  - Icono clip, abre selector de archivos
  - Preview del archivo adjunto debajo del input: nombre, tamaño, botón X para quitar
  - Tipos permitidos: imágenes, PDFs, texto/código
  - Indicador de tamaño máximo
- [ ] Archivar conversaciones:
  - Opción en menú contextual (click derecho o icono "...") de cada conversación en el sidebar
  - Conversaciones archivadas se muestran en sección colapsable "Archivadas" al final del sidebar
  - Opción de desarchivar

**Backend:**
- [ ] Regenerar: endpoint de chat acepta parámetro `regenerate_message_id`. Marca el mensaje anterior como `is_regenerated = true`, genera nueva respuesta
- [ ] Editar/fork: al enviar mensaje editado, se crea nuevo mensaje con `parent_id` apuntando al original. Los mensajes posteriores al original se marcan como rama inactiva
- [ ] Archivos adjuntos:
  - `app/api/acero-ia/attachments/route.ts` — POST: recibe archivo, valida tipo y tamaño (máx 10MB, máx 5 por mensaje), almacena en Supabase Storage temporalmente
  - Para imágenes: enviar como content type imagen al modelo (visión)
  - Para PDFs: extraer texto con `pdf-parse` e incluir en el contexto
  - Para texto/código: incluir contenido directo en el contexto
- [ ] Archivar: PATCH en `aia_conversations` toggleando `is_archived`
- [ ] Instalar dependencia: `pdf-parse`

**Dependencias:** Sprint 2 completo (necesita modelo seleccionado para regenerar con el mismo modelo).

---

### Sprint 7 — Galería de imágenes

**Objetivo:** Vista centralizada de todas las imágenes generadas por el usuario, con filtros, descarga y acceso rápido.

**UI:**
- [ ] Activar botón "Galería" en el sidebar (reemplazar bloque gris):
  - Navega a `/acero-ia/gallery`
- [ ] Página `/acero-ia/gallery`:
  - Cabecera: "Galería" + contador total de imágenes (bloque gris `{N} imágenes`)
  - Filtros: selector de rango de fechas, selector de tamaño (todos/cuadrado/horizontal/vertical), selector de calidad (todos/low/medium/high)
  - Grid responsivo de imágenes:
    - Cada imagen: thumbnail con border-radius 8px, hover muestra overlay con prompt truncado
    - Debajo: bloque gris `{prompt}` (truncado), bloque gris `{fecha}`, bloque gris `${costo}`
  - Click en imagen → modal a pantalla completa:
    - Imagen a tamaño real
    - Prompt completo
    - Metadata: tamaño, calidad, costo, fecha
    - Botones: "Descargar", "Generar variación", "Ver conversación"
  - Estado vacío: Prisma + "Aún no has generado imágenes"

**Backend:**
- [ ] `app/api/acero-ia/images/route.ts` — GET: listar imágenes del usuario con filtros (fecha, tamaño, calidad), paginadas
- [ ] Generar URLs firmadas de Supabase Storage para visualización
- [ ] Link a conversación: usar `conversation_id` de `aia_images`

**Dependencias:** Sprint 4 completo (necesita imágenes generadas).

---

### Sprint 8 — Panel de Admin

**Objetivo:** El admin puede ver costos totales, costos por usuario, gestionar límites, configurar alertas y revisar logs detallados. También puede crear presets globales.

**UI:**
- [ ] Dashboard `/acero-ia/admin`:
  - Verificación de rol admin al entrar (redirect si no es admin)
  - Tarjetas de resumen: gasto total del mes (bloque gris `${total}`), N usuarios activos (bloque gris `{N}`), N conversaciones (bloque gris `{N}`), N mensajes (bloque gris `{N}`)
  - Gráfica de gasto por día del mes actual (línea temporal)
  - Desglose por modelo (barras horizontales con colores de modelo)
  - Top 5 usuarios por gasto (tabla: nombre, gasto, % del total)
  - Sección de alertas activas (notificaciones de usuarios que superaron umbral)
- [ ] Costos por usuario `/acero-ia/admin/users`:
  - Tabla: nombre, gasto del mes, límite, % usado, N conversaciones, N mensajes
  - Cada celda: bloque gris `{dato}`
  - Filtro por rango de fechas
  - Click en fila → detalle del usuario con gráfica individual de uso
- [ ] Gestión de límites `/acero-ia/admin/limits`:
  - Tabla: usuario, límite actual, toggle ilimitado, botón editar
  - Modal de edición: input numérico para nuevo límite en USD
  - Campo de límite global por defecto (aplica a nuevos usuarios)
- [ ] Logs de uso `/acero-ia/admin/logs`:
  - Tabla: timestamp, usuario, modelo (con color), tokens in, tokens out, costo, conversación
  - Filtros: por usuario, por modelo, por rango de fechas, por rango de costo
  - Botón "Exportar CSV"
  - Paginación
- [ ] Presets globales:
  - Sección en el dashboard o página separada
  - CRUD de presets con `is_global = true`

**Backend:**
- [ ] `app/api/acero-ia/admin/dashboard/route.ts` — GET: gasto total, desglose por modelo, top usuarios, serie temporal diaria. Validar rol admin
- [ ] `app/api/acero-ia/admin/limits/route.ts` — GET (listar límites) y PATCH (actualizar límite de un usuario). Validar rol admin
- [ ] `app/api/acero-ia/admin/logs/route.ts` — GET con filtros y paginación. Validar rol admin
- [ ] `app/api/acero-ia/admin/alerts/route.ts` — GET (listar alertas) y POST (crear umbral). Validar rol admin
- [ ] `app/api/acero-ia/presets/global/route.ts` — POST (crear preset global), solo admin
- [ ] Lógica de alertas: después de cada registro de costo, verificar si el usuario cruzó algún umbral. Si sí, marcar alerta como `notified = true` y hacerla visible en el dashboard admin
- [ ] Exportar CSV: generar archivo CSV con los logs filtrados y retornar como descarga

**Dependencias:** Sprint 5 completo (necesita datos de costos y límites).

---

## Resumen de sprints

| Sprint | Qué se construye | Depende de |
|---|---|---|
| 0 | DB, permisos, estructura, Storage, tema visual, Prisma, fuentes | — |
| 1 | Chat con Haiku, streaming SSE, sidebar, markdown, título auto | Sprint 0 |
| 2 | Clasificador, sugerencia de modelo, selector manual, Sonnet+Opus | Sprint 1 |
| 3 | Presets (CRUD), selector en conversación, badge, inyección de prompt | Sprint 1 |
| 4 | Generación de imágenes GPT Image 2, inline, variaciones, editar prompt | Sprint 2 |
| 5 | Registro de costos, widget sidebar, página consumo, verificación límite | Sprint 1 |
| 6 | Regenerar, editar/fork, archivos adjuntos, archivar conversaciones | Sprint 2 |
| 7 | Galería de imágenes con filtros, descarga, vista completa | Sprint 4 |
| 8 | Panel admin: dashboard, costos/usuario, límites, alertas, logs, presets globales | Sprint 5 |

### Orden de ejecución recomendado

```
Sprint 0  →  Sprint 1  →  Sprint 2  →  Sprint 4  →  Sprint 7
                       →  Sprint 3     Sprint 6
                       →  Sprint 5  →  Sprint 8
```

**Fase 1:** Sprint 0 → Sprint 1 (chat funcional básico)
**Fase 2:** Sprints 2, 3 y 5 en paralelo (todos dependen solo de Sprint 1)
**Fase 3:** Sprints 4 y 6 en paralelo (ambos dependen de Sprint 2)
**Fase 4:** Sprint 7 (depende de Sprint 4) y Sprint 8 (depende de Sprint 5) en paralelo

---

## Roadmap futuro (post-MVP)

Estas funcionalidades se documentan para desarrollo futuro. No están incluidas en los sprints actuales.

### Generación de video (Kling 3.0)
- Integrar API de Kling 3.0 para generar videos cortos
- Nuevo modelo en el selector: "Video"
- Almacenamiento de videos en Supabase Storage
- Galería de videos (similar a galería de imágenes)
- Tracking de costos de video

### Análisis de documentos (RAG)
- Subir PDFs largos y hacer preguntas sobre ellos
- Embeddings con modelo de embeddings (ej: OpenAI text-embedding-3-small)
- Almacenar chunks y embeddings en Supabase (pgvector)
- Retrieval-Augmented Generation: buscar chunks relevantes y pasarlos como contexto

### Búsqueda web
- Integrar búsqueda web para respuestas con información actualizada
- Usar API de búsqueda (ej: Tavily, Brave Search, o similar)
- El modelo puede decidir cuándo necesita buscar en la web

### Voz
- Input por voz: Whisper API (OpenAI) para transcribir audio a texto
- Text-to-speech: respuestas del asistente en audio
- Botón de micrófono en la barra de input

### Agentes
- Cadenas de tareas donde el modelo ejecuta pasos secuenciales
- Flujo: investigar → resumir → generar borrador
- El usuario define el objetivo, el agente ejecuta los pasos
- Mostrar progreso paso a paso en el chat

---

## Variables de entorno necesarias

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ya existe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya existe |
| `SUPABASE_SERVICE_ROLE_KEY` | ya existe |
| `ANTHROPIC_API_KEY` | Claude Haiku, Sonnet, Opus |
| `OPENAI_API_KEY` | GPT Image 2 (y futuro: Whisper, embeddings) |

---

## Notas para el desarrollo

1. **Streaming es crítico:** las respuestas de Opus pueden tardar 10+ segundos. Sin streaming la UX es inaceptable.
2. **Clasificación barata:** la clasificación con Haiku usa ~100 tokens. A $1/1M tokens, son fracciones de centavo. No escatimar en clasificación.
3. **Costos en tiempo real:** el widget del sidebar debe actualizarse después de cada mensaje sin necesidad de recargar la página.
4. **Imágenes en Storage:** usar paths organizados por usuario: `acero-ia-images/{userId}/{imageId}.png`.
5. **Mobile first:** el sidebar de conversaciones debe ser un drawer en móvil, no visible por defecto.
6. **Librería de markdown:** usar `react-markdown` + `remark-gfm` + `rehype-highlight` para renderizado completo.
7. **Librería de gráficas (admin):** usar Recharts para las gráficas del dashboard de admin y panel de consumo.
8. **Context window:** limitar el historial enviado al modelo (últimos N mensajes o X tokens máximo) para no inflar costos innecesariamente.
9. **Rate limiting:** implementar rate limiting en los API routes para evitar abusos (además del límite de gasto).
10. **Archivos adjuntos:** extraer texto de PDFs con `pdf-parse` en el servidor.
11. **UI skeleton:** todos los placeholders de datos usan bloques grises de tamaño apropiado (no texto falso). Formato: `<div className="h-4 w-24 bg-[--aia-bg-hover] rounded animate-pulse" />` o similar.
12. **Íconos:** usar Lucide React exclusivamente, stroke width 1.5px.
13. **Transiciones:** todas las interacciones usan `transition-all duration-200` mínimo.
