# Expandlogy — Documento Maestro de Planificación

## Qué es

Dashboard de organización de clientes para una agencia de marketing. Permite
hacer el onboarding de clientes (dejar toda su información en un solo lugar,
compartida entre el equipo con acceso a ese cliente), generar creativos y
copys con IA usando esa información, y — a futuro — revisar el estado diario
de las cuentas publicitarias conectadas.

## Proyecto individual dentro del Hub

Mini-app **privada**: requiere login y que un admin le dé acceso a la mini-app
desde `/admin` (patrón idéntico a Trading Journal / Acero IA). Dentro de la
mini-app hay una capa de acceso adicional, granular por cliente (ver
"Decisiones de arquitectura").

- Slug: `expandlogy`
- Ruta: `/expandlogy`
- Prefijo de tablas: `exp_`

## Decisiones de arquitectura

**Datos compartidos, no tiempo real.** Cuando alguien guarda/edita un cliente,
el cambio queda disponible para todos los que tengan acceso a ese cliente la
próxima vez que carguen esa pantalla (fetch normal, sin websockets/Supabase
Realtime). Más simple de construir y mantener; se puede sumar Realtime más
adelante si hace falta.

**Acceso por cliente, no solo por mini-app.** Además del gate general del Hub
(login + `project_access` para poder entrar a `/expandlogy`), cada **cliente**
tiene su propia lista de usuarios con acceso (tabla `exp_client_access`). Un
usuario con acceso a Expandlogy puede agregar o quitar compañeros de un
cliente puntual — no hace falta pasar por un admin cada vez. Un cliente que
creás te da acceso automático a vos como creador.

Los clientes a los que no tenés acceso ni siquiera aparecen en tu lista — no
es "acceso de solo lectura oculto", es invisible.

**IA con contexto de texto, no de Drive (v1).** El link de Drive con material
(fotos/videos) se guarda y se muestra, pero por ahora es solo referencia
humana — la IA no lo lee ni lo analiza. Creativos y Copys usan los campos de
texto del onboarding (industria, marca, audiencia, objetivos, etc.) como
contexto. Leer/analizar los archivos del Drive queda documentado como fase
futura (ver "Fuera de alcance").

**Generación de imágenes con OpenAI.** Para "Creativos": OpenAI `gpt-image-2`
(`openai` SDK, `OPENAI_API_KEY` ya configurada en el Hub) + subida del
resultado a Supabase Storage (bucket propio de Expandlogy) + URL firmada para
mostrarlo. Enfoque ya probado en este Hub, autocontenido dentro de la propia
mini-app (sin depender de código de otra mini-app).

**Copys con Claude.** Generación de texto (copys para Facebook Ads) vía
Anthropic (`ANTHROPIC_API_KEY`, ya configurada en el Hub) — mismo proveedor
que ya usa el resto del Hub para tareas de texto.

**"Revisión Campañas" — solo UI por ahora.** Esta pestaña se construye como
cascarón visual (con estado vacío), sin tabla de datos ni integración real.
La integración con el MCP de Facebook (estado de cuentas publicitarias, cron
diario ~8am revisando errores de pago, cercanía al límite de gasto, gasto del
día anterior) es trabajo futuro, fuera de este plan.

## Estructura de archivos

```
app/expandlogy/
  layout.tsx                    — auth + acceso a la mini-app (gate del Hub) + tema propio
  page.tsx                      — "Clientes": lista de clientes con acceso, buscar, + Nuevo cliente
  clients/
    [clientId]/
      page.tsx                  — Detalle del cliente: datos de onboarding, link de Drive,
                                   gestión de acceso (compañeros con acceso a este cliente)
  anuncios/
    page.tsx                    — Selector de cliente → tabs Creativos / Copys
  campanas/
    page.tsx                    — Revisión Campañas (solo UI, estado vacío)
  components/
    client-form.tsx             — Formulario de alta/edición de cliente (onboarding)
    client-access.tsx           — UI de agregar/quitar compañeros de un cliente
    creative-generator.tsx       — UI de generación de creativos
    copy-generator.tsx           — UI de generación de copys

app/api/expandlogy/
  clients/
    route.ts                    — GET (lista con acceso), POST (crear)
    [clientId]/
      route.ts                  — GET, PATCH, DELETE
      access/
        route.ts                — GET (quién tiene acceso), POST (otorgar), DELETE (quitar)
  creatives/
    route.ts                    — POST (generar imagen), GET (historial por cliente)
  copies/
    route.ts                    — POST (generar copy), GET (historial por cliente)

lib/expandlogy/
  access.ts                     — helpers de chequeo de acceso a un cliente (server-side)
```

## Base de datos

### `exp_clients`
```sql
id                uuid PK
name              text not null                 -- nombre del cliente/empresa
industry          text                          -- rubro/industria
description       text                          -- descripción del negocio
target_audience   text                          -- público objetivo
brand_voice       text                          -- tono/voz de marca
goals             text                          -- objetivos de marketing
contact_name      text
contact_email     text
contact_phone     text
drive_link        text                          -- URL de la carpeta de Drive (material)
status            text default 'onboarding'     -- 'onboarding' | 'active' | 'paused' | 'archived'
notes             text
created_by        uuid FK → profiles(id)
created_at        timestamptz
updated_at        timestamptz
```

> Lista de campos de onboarding propuesta — confirmá o ajustá antes de
> programar (agregar/quitar campos es barato ahora, más caro después de
> tener datos reales cargados).

### `exp_client_access`
```sql
id           uuid PK
client_id    uuid FK → exp_clients(id) ON DELETE CASCADE
user_id      uuid FK → profiles(id) ON DELETE CASCADE
granted_by   uuid FK → profiles(id)
created_at   timestamptz
unique(client_id, user_id)
```

### `exp_creatives` (Creativos generados)
```sql
id            uuid PK
client_id     uuid FK → exp_clients(id) ON DELETE CASCADE
user_id       uuid FK → profiles(id)          -- quién lo generó
prompt        text not null
storage_path  text not null                    -- ruta en el bucket de Storage propio de Expandlogy
size          text                             -- '1024x1024' | '1792x1024' | '1024x1792'
quality       text                             -- 'low' | 'medium' | 'high'
cost_usd      numeric
created_at    timestamptz
```

### `exp_copies` (Copys generados)
```sql
id           uuid PK
client_id    uuid FK → exp_clients(id) ON DELETE CASCADE
user_id      uuid FK → profiles(id)
prompt       text not null                     -- brief/instrucciones dadas
content      text not null                     -- copy generado
platform     text default 'facebook_ads'
created_at   timestamptz
```

### RLS

Mismo patrón que el resto del Hub (policies de SELECT para el dueño de los
datos vía `exp_client_access`; los INSERT/UPDATE/DELETE pasan por las rutas
de API con `createAdminClient()`, no directo desde el cliente):

```sql
-- exp_clients: visible solo si tenés acceso a ese cliente
create policy "exp: leer clientes con acceso" on exp_clients for select
  using (
    exists (select 1 from exp_client_access where client_id = id and user_id = auth.uid())
  );

-- exp_client_access: podés ver quién tiene acceso a un cliente si vos también lo tenés
create policy "exp: leer accesos de mis clientes" on exp_client_access for select
  using (
    exists (select 1 from exp_client_access a2 where a2.client_id = client_id and a2.user_id = auth.uid())
  );

-- exp_creatives / exp_copies: visibles si tenés acceso al cliente dueño
create policy "exp: leer creativos de mis clientes" on exp_creatives for select
  using (
    exists (select 1 from exp_client_access where client_id = exp_creatives.client_id and user_id = auth.uid())
  );
create policy "exp: leer copys de mis clientes" on exp_copies for select
  using (
    exists (select 1 from exp_client_access where client_id = exp_copies.client_id and user_id = auth.uid())
  );
```

## Flujo: Onboarding de un cliente

1. Usuario con acceso a Expandlogy entra a `/expandlogy`, click "+ Nuevo cliente".
2. Llena el formulario de onboarding (nombre, industria, descripción, audiencia,
   voz de marca, objetivos, contacto, link de Drive).
3. Al guardar: se crea la fila en `exp_clients` + una fila en `exp_client_access`
   dándole acceso automático al creador.
4. Desde el detalle del cliente, agrega a compañeros de equipo (busca por
   nombre/email entre los usuarios que ya tienen acceso a Expandlogy) →
   se crean más filas en `exp_client_access`.
5. Cualquiera con acceso puede editar los datos — el próximo que entre a esa
   pantalla ve los cambios.

## Flujo: Anuncios (Creativos / Copys)

1. Usuario entra a la pestaña "Anuncios", selecciona un cliente (de los que
   tiene acceso).
2. Elige "Creativos" o "Copys".
3. **Creativos**: escribe un prompt/brief adicional (opcional); el sistema arma
   el prompt final combinando ese texto + los campos del cliente (industria,
   marca, audiencia, objetivos) → `POST /api/expandlogy/creatives` → OpenAI
   `gpt-image-2` → imagen sube a Storage → se muestra + queda en el historial
   del cliente.
4. **Copys**: mismo esquema, pero el resultado es texto (copy para Facebook
   Ads) generado con Claude → `POST /api/expandlogy/copies` → se guarda y se
   muestra, con opción de copiar al portapapeles.

## Fuera de alcance (por ahora)

- **Lectura/análisis de archivos de Drive por la IA** — requeriría integrar la
  API de Google Drive (OAuth o cuenta de servicio con acceso a carpetas
  compartidas por cada cliente) más un paso de análisis de imagen. Se deja
  para una fase posterior.
- **Integración real con Meta/Facebook Ads (MCP)** — estado de cuentas
  publicitarias, detección de errores de pago, alerta de límite de gasto,
  verificación de gasto diario, cron ~8am. La pestaña "Revisión Campañas" es
  solo UI por ahora; esto exige acceso a la Business API de Meta (proceso de
  autorización aparte) y no se implementa en este plan.
- **Supabase Realtime** — decidido explícitamente que no hace falta para v1.
- **Multi-plataforma en Copys** — hoy es Facebook Ads únicamente (aunque el
  campo `platform` queda listo por si se agrega Instagram/Google Ads después).

## Sprint 0 — Fundación y DB

- Migración: tablas `exp_clients`, `exp_client_access`, `exp_creatives`,
  `exp_copies` + RLS.
- Registro en `projects` (`insert into projects ... slug = 'expandlogy'`).
- Ícono + banner en `lib/project-assets.tsx` (si falta, la tarjeta no aparece
  en el Hub).
- `app/expandlogy/layout.tsx` con el gate de auth + `project_access` (mismo
  patrón que Trading Journal/Acero IA).

## Sprint 1 — Clientes

- Lista de clientes con acceso (`/expandlogy`), buscador.
- Formulario de alta/edición (onboarding).
- Detalle del cliente + gestión de acceso (agregar/quitar compañeros).

## Sprint 2 — Anuncios

- Selector de cliente + tabs Creativos/Copys.
- Generación de creativos (reutilizando el patrón de Acero IA).
- Generación de copys (Claude).
- Historial de generados por cliente.

## Sprint 3 — Revisión Campañas (UI)

- Cascarón visual: lista de cuentas publicitarias (estado vacío por ahora),
  tarjetas de estado (errores de pago / cerca del límite / gasto de ayer)
  sin datos reales todavía.

## Variables de entorno necesarias

Ninguna nueva — reutiliza `OPENAI_API_KEY` y `ANTHROPIC_API_KEY`, ya
configuradas en el Hub.

## Notas para el desarrollo

- Nada de esto se programa todavía — este documento es el plan a confirmar
  antes de tocar código, siguiendo el mismo formato que
  `documentos/trading_journal/documento_maestro_trading.md`.
- Cada sprint se implementa y se verifica contra la base real antes de pasar
  al siguiente (mismo criterio de rigor que se usó en Trading Journal).
