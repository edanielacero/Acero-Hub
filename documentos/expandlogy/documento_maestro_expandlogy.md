# Expandlogy — Documento Maestro de Planificación

## Qué es

Dashboard de organización de clientes para una agencia de marketing. Permite
hacer el onboarding de clientes (dejar toda su información en un solo lugar),
ver el avance del proceso de onboarding por integrante del equipo, y — a
futuro — generar creativos/copys con IA y revisar el estado diario de las
cuentas publicitarias conectadas.

**Estado actual: MVP hardcodeado, sin base de datos.** Se decidió (2026-07-29)
que por ahora Expandlogy es un prototipo visual: todos los datos son mockup,
viven en memoria del navegador (React Context) y se pierden al recargar la
página. No hay tablas propias, ni API routes, ni persistencia real. Cuando se
decida construir la versión con datos reales, hay que rediseñar el modelo
(ver "De MVP a versión real" al final).

## Proyecto individual dentro del Hub

Mini-app **privada**: requiere login y que un admin le dé acceso a la mini-app
desde `/admin` (patrón idéntico a Trading Journal). Esta parte **sí** es real
y usa las tablas compartidas del Hub (`profiles`, `projects`, `project_access`)
— es el único punto de contacto de Expandlogy con Supabase. Todo lo que pasa
*dentro* de la mini-app (clientes, checklist, accesos por cliente) es mockup.

- Slug: `expandlogy`
- Ruta: `/expandlogy`
- Tablas usadas: ninguna propia — solo el gate genérico del Hub (`projects`/`project_access`)

## Decisiones de arquitectura

**Todo hardcodeado, sin backend propio.** No hay `app/api/expandlogy/*` ni
tablas `exp_*`. El estado (clientes, checklist de proceso, accesos por
cliente) vive en un React Context (`MockDataProvider`, ver
`app/expandlogy/components/mock-store.tsx`) montado en el layout de la
mini-app. Se comparte entre las 3 pestañas y el detalle de cliente durante la
sesión del navegador, pero se reinicia por completo al recargar — no hay
persistencia ni sincronización entre usuarios.

**3 pestañas.** `/expandlogy` (Onboardings), `/expandlogy/ad-generator`
(Ad Generator) y `/expandlogy/campanas` (Campañas), con una barra de tabs
compartida (`components/tab-nav.tsx`). Onboardings es la única con
funcionalidad real (dentro del mockup); las otras dos son cascarones
visuales "en construcción".

**Onboarding con un solo campo de texto libre.** En vez de un formulario con
muchos campos estructurados (industria, audiencia, contacto, etc.), el alta
de cliente pide solo **"Nombre del negocio"** e **"Información"** — un
textarea libre donde se pega/escribe todo el detalle del onboarding tal como
lo manda el cliente. Las URLs sueltas dentro de ese texto se detectan y se
muestran como links clicables (`linkify()` en `components/ui.tsx`).

**Sección "Proceso" por cliente.** Cada cliente tiene una checklist de pasos
de onboarding, una copia independiente por integrante del equipo (hoy:
**Daniel** y **Luis**, hardcodeados en `mock-data.ts`). Cada checklist tiene
su propia barra de progreso, más una barra de progreso total combinando
ambas. Es puramente visual — tildar un ítem no llama a ninguna API.

**Acceso por cliente, simplificado.** En vez de buscar/invitar usuarios
reales, "dar acceso a un cliente" es elegir entre los mismos dos nombres
hardcodeados (Daniel/Luis) — no hay tabla de accesos ni verificación real de
permisos dentro de la mini-app.

**IA y Facebook MCP: sin implementar todavía.** Las pestañas "Ad Generator" y
"Campañas" son solo UI de marcador de posición. La idea original (Creativos
con OpenAI `gpt-image-2`, Copys con Claude, integración con Meta Business
API) sigue siendo el plan a futuro, pero no se programa hasta decidir pasar
del prototipo a la versión funcional.

## Estructura de archivos (actual)

```
app/expandlogy/
  layout.tsx                    — auth + acceso a la mini-app (gate del Hub) + tema propio
                                   + monta <MockDataProvider>
  page.tsx                      — Tab "Onboardings": lista de clientes mockup, buscador,
                                   + Nuevo cliente
  ad-generator/
    page.tsx                    — Tab "Ad Generator" (placeholder, en construcción)
  campanas/
    page.tsx                    — Tab "Campañas" (placeholder, en construcción)
  clients/
    [clientId]/
      page.tsx                  — Detalle del cliente: Proceso (checklist), Información,
                                   Acceso al cliente
  components/
    tab-nav.tsx                 — Barra de las 3 pestañas
    ui.tsx                      — BottomSheet, estilos de input compartidos, linkify()
    client-form.tsx             — Alta/edición: Nombre del negocio + Información (+ Estado al editar)
    client-access.tsx           — Dar/quitar acceso (Daniel/Luis) a un cliente
    client-process.tsx          — Checklist de proceso por usuario + barras de progreso
    mock-store.tsx              — Context con todo el estado mockup (clientes, accesos)
  mock-data.ts                  — Seed: cliente "Lulos" + lista de integrantes del equipo
  status.ts                     — Labels/colores de estado del cliente (onboarding/activo/pausado/archivado)
  types.ts                      — type Client = { id, name, info, status }
```

No existen `app/api/expandlogy/*` ni `lib/expandlogy/*` — se eliminaron junto
con las tablas al pasar a mockup (ver "Historial" al final).

## Modelo de datos (mockup, en memoria)

```ts
type ClientStatus = 'onboarding' | 'active' | 'paused' | 'archived'

interface Client {
  id: string
  name: string      // "Nombre del negocio", ej. "Lulos"
  info: string      // Texto libre con todo el detalle de onboarding
  status: ClientStatus
}
```

Equipo hardcodeado (`TEAM_MEMBERS` en `mock-data.ts`): `['Daniel', 'Luis']`.
Usado tanto para la checklist de Proceso como para el picker de acceso por
cliente.

Cliente semilla: **Lulos** (Lulos Painting & Home Restoration, Atlanta/Duluth
GA) — datos personales, del negocio, del servicio y accesos (Drive, Sheets,
dominio) cargados de ejemplo en el campo "Información".

## Flujo: Onboarding de un cliente (mockup)

1. Usuario entra a `/expandlogy` (tab Onboardings), click "+ Nuevo cliente".
2. Llena solo "Nombre del negocio" e "Información" (texto libre).
3. Al guardar, el cliente se agrega al estado del `MockDataProvider` — visible
   de inmediato en la lista, pero solo para esta sesión del navegador.
4. Desde el detalle del cliente: tilda ítems de la checklist de Proceso (por
   Daniel y por Luis), edita el estado (Onboarding/Activo/Pausado/Archivado)
   y da/quita acceso al cliente entre Daniel y Luis.
5. Nada de esto sobrevive a un refresh de página.

## Fuera de alcance (por ahora)

- **Persistencia real** — es justamente el punto del MVP actual: validar la
  UX/flujo antes de invertir en backend.
- **Generación de Creativos/Copys con IA** — pestaña "Ad Generator" es solo UI.
- **Integración real con Meta/Facebook Ads (MCP)** — pestaña "Campañas" es
  solo UI.
- **Multiusuario real / sincronización entre personas** — hoy Daniel y Luis
  son solo etiquetas de texto, no usuarios del Hub con sesión propia dentro
  de la mini-app.

## De MVP a versión real (para cuando se decida)

Si más adelante se quiere pasar de prototipo a producto funcional, esto es
lo que hay que reconstruir (no antes, para no invertir en algo que puede
cambiar mientras se valida el prototipo):

- Tablas reales (`exp_clients`, accesos, etc.) + RLS + rutas API — el diseño
  original de este documento (antes del pivot a mockup) es un buen punto de
  partida, ajustado a lo aprendido con el prototipo (ej. el campo único
  "Información" en vez de muchos campos estructurados, si se valida que
  funciona mejor así).
- Persistencia de la checklist de Proceso por cliente y por usuario real
  (hoy Daniel/Luis son hardcodeados; en la versión real serían usuarios reales
  del Hub con `project_access` a Expandlogy).
- Recién ahí conectar Ad Generator (OpenAI `gpt-image-2` + Claude) y Campañas
  (Meta Business API).

## Variables de entorno necesarias

Ninguna por ahora — el MVP no llama a ninguna API externa. `OPENAI_API_KEY` y
`ANTHROPIC_API_KEY` (ya configuradas en el Hub) se retomarán cuando se
implemente Ad Generator de verdad.

## Historial

- **Sprint 0** (completado, luego revertido parcialmente): fundación con
  tablas `exp_*` + RLS + registro en `projects`. El registro en `projects`
  se conservó; las tablas se eliminaron al pivotar a mockup.
- **Sprint 1** (completado, luego reconstruido como mockup): lista de
  clientes, formulario, detalle, acceso por cliente — primero contra
  Supabase real, después reescrito 100% hardcodeado por decisión explícita
  del 2026-07-29.
- **2026-07-29**: pivot a MVP hardcodeado. Se agregaron las 3 pestañas
  (Onboardings/Ad Generator/Campañas), la sección "Proceso" (checklist +
  progreso por Daniel/Luis), se simplificó el onboarding a un solo campo
  "Información", se cargó el cliente semilla "Lulos", y se eliminaron las
  tablas `exp_*` + rutas API + `lib/expandlogy/access.ts` por quedar sin uso.

## Notas para el desarrollo

- Mientras siga siendo MVP: no agregar backend/DB para Expandlogy sin que se
  pida explícitamente — el punto es iterar rápido sobre la UI/UX con datos
  de mentira.
- Si se agregan más clientes de ejemplo o más integrantes del equipo, van en
  `app/expandlogy/mock-data.ts`.
