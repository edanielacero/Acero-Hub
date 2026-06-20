# Mundial 2026 — Documento Maestro

## Qué es

Quiniela de apuestas de resultados entre amigos para el FIFA Mundial 2026. Cada participante apuesta el marcador exacto de cada partido antes de que empiece. El que acierte el marcador exacto gana el bote del partido. Si nadie acierta, el bote se acumula al siguiente partido.

No es un sistema de apuestas con dinero real en línea — es una quiniela privada entre un grupo cerrado de personas que se conocen.

---

## Estructura de archivos

```
app/
├── mundial/
│   ├── layout.tsx          — metadata del tab del navegador
│   ├── page.tsx            — página principal (toda la UI del usuario)
│   └── admin/
│       └── page.tsx        — panel de administración (solo para admin hub)
└── api/mundial/
    ├── bets/route.ts       — POST: crear/editar apuesta
    ├── live/route.ts       — GET: actualizar un partido en vivo (usado para partidos próximos a empezar)
    ├── live-all/route.ts   — GET: actualizar todos los partidos en vivo de una vez
    ├── sync/route.ts       — GET/POST: sincronizar todos los partidos desde football-data.org
    └── admin/
        ├── bets/route.ts       — admin: editar/eliminar apuestas
        ├── matches/route.ts    — admin: editar monto por partido
        ├── profiles/route.ts   — admin: crear/eliminar perfiles
        ├── settings/route.ts   — admin: guardar configuración global
        └── upload-qr/route.ts  — admin: subir imagen QR de pago

lib/mundial/
├── football-api.ts         — cliente HTTP para football-data.org v4
└── team-names-es.ts        — nombres y siglas de países en español

supabase/mundial/
└── schema.sql              — definición de tablas, RLS y seed inicial
```

---

## Base de datos

Cuatro tablas, todas con prefijo `mundial_` para no colisionar con el hub.

### `mundial_profiles`
Un perfil por participante. La autenticación es por token (no requiere cuenta).

| columna | tipo | notas |
|---|---|---|
| id | uuid | PK |
| name | text | nombre visible |
| token | text | string aleatorio de 8 chars, guardado en localStorage |
| color | text | hex, usado para avatar y UI |
| created_by | uuid | FK → hub.profiles (quien lo creó) |

### `mundial_matches`
Todos los partidos del Mundial. Se sincronizan desde la API externa. El ID es el ID de football-data.org, no un autoincremental.

| columna | tipo | notas |
|---|---|---|
| id | bigint | PK (viene de football-data.org) |
| home_team / away_team | text | nombre en inglés |
| home_tla / away_tla | text | sigla 3 letras (API en inglés, se traduce en el frontend) |
| home_crest / away_crest | text | URL del escudo |
| match_date | timestamptz | hora UTC del partido programado |
| status | text | SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED |
| home_score / away_score | int | null hasta que empieza |
| stage | text | GROUP_STAGE, LAST_16, QUARTER_FINALS, etc. |
| group_name | text | GROUP_A … GROUP_L, null en eliminatorias |
| kickoff_at | timestamptz | hora real de inicio (se escribe cuando se detecta IN_PLAY) |
| synced_at | timestamptz | última vez que se actualizó desde la API |

### `mundial_bets`
Una apuesta por participante por partido (unique constraint).

| columna | tipo | notas |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK → mundial_profiles |
| match_id | bigint | FK → mundial_matches |
| home_score_bet | int | marcador apostado local |
| away_score_bet | int | marcador apostado visitante |
| payment_confirmed | boolean | el admin confirma que cobró el dinero físico |
| prize_paid | boolean | el admin confirma que entregó el premio |
| confirmed_by | uuid | FK → hub.profiles (quien confirmó) |

### `mundial_settings`
Fila única (constraint `id = 1`). Configuración global del juego.

| columna | tipo | notas |
|---|---|---|
| qr_image_url | text | imagen para pagar (Supabase Storage) |
| bet_amount | numeric | monto base por apuesta en Bs |
| pot_carryover | numeric | bote acumulado pendiente (legacy, hoy se calcula en memoria) |

---

## Lógica de negocio

### Apuestas
- Las apuestas se pueden crear o editar hasta **1 minuto antes** del partido (`isClosed`: `match_date - now < 60s`).
- Solo se puede apostar si el participante existe en `mundial_profiles` y tiene su token.
- La apuesta se hace con el marcador exacto (ej. `2-1`). No hay handicap ni resultado (1X2).
- Al apostar, el sistema muestra instrucciones de pago (QR o efectivo). El admin confirma el pago manualmente (`payment_confirmed = true`).

### Bote y acumulado
- El bote de cada partido = número de apuestas con `payment_confirmed = true` × monto + bote acumulado de partidos anteriores sin ganador.
- El bote se calcula en memoria en el frontend al cargar, iterando los partidos en orden cronológico.
- Si nadie acierta el marcador exacto → bote pasa al siguiente partido.
- Si hay **múltiples ganadores** → el bote se divide en partes iguales (`Math.floor(pot / winners.length)`).
- El monto puede ser global (de `mundial_settings`) o sobreescrito por partido (columna `bet_amount` en `mundial_matches`).

### Clasificación WC 2026
El Mundial 2026 tiene 48 equipos en 12 grupos de 4. La fase previa a octavos se llama **Dieciseisavos**.

Clasifican a Dieciseisavos:
- Los **2 primeros** de cada grupo (24 equipos)
- Los **8 mejores terceros** entre los 12 grupos (8 equipos)
- **Total: 32 equipos**

Criterio de desempate entre terceros: Puntos → Diferencia de goles → Goles a favor → Nombre alfabético.

La tabla de posiciones se computa en el frontend desde los partidos de `mundial_matches` con `status = FINISHED`. No usa la API de standings (requiere plan de pago).

---

## API externa: football-data.org v4

**Plan gratuito.** Límite: 10 requests/minuto.

| endpoint | funciona | uso |
|---|---|---|
| `/competitions/WC/matches?season=2026` | ✅ | sync diario de todos los partidos |
| `/competitions/WC/matches?season=2026&status=IN_PLAY` | ✅ | polling batch de partidos en vivo |
| `/matches/{id}` | ✅ | polling individual de partido próximo a empezar |
| `/competitions/WC/teams?season=2026` | ✅ | plantillas y DT de cada equipo |
| `/competitions/WC/standings` | ❌ 403 | solo plan de pago |
| `/competitions/WC/scorers` | ❌ 403 | solo plan de pago |

Los partidos se sincronizan a la base de datos en Supabase. La UI siempre lee desde Supabase, nunca directamente desde football-data.org.

---

## Sincronización y datos en vivo

### Sync diario (Vercel Cron)
`vercel.json` define un cron que llama `GET /api/mundial/sync` a las 08:00 UTC todos los días. Este endpoint trae todos los partidos del Mundial y hace upsert por ID.

### Polling en vivo
Cuando hay partidos con `status IN_PLAY`:
- El cliente llama `GET /api/mundial/live-all` cada **10 segundos**.
- Este endpoint hace **1 sola llamada** a football-data.org (`?status=IN_PLAY`) independientemente de cuántos partidos estén en vivo simultáneamente. Esto evita exceder el rate limit durante la fase de grupos donde pueden haber 4 partidos simultáneos.
- Los marcadores nunca bajan: `safeScore()` en el servidor y la misma protección en el cliente evitan que una race condition en la API externa borre un gol.

### Polling de partidos próximos a empezar
Partidos con status `SCHEDULED/TIMED` que empiezan en menos de 2 horas se revisan cada **20 segundos** individualmente via `/api/mundial/live?id={id}` para detectar la transición a `IN_PLAY` rápidamente.

### Realtime (Supabase)
El cliente suscribe a `postgres_changes` en `mundial_matches` y `mundial_bets`. Cuando el servidor escribe un nuevo marcador en DB, Supabase lo propaga al cliente instantáneamente sin esperar el siguiente ciclo de polling.

### `kickoff_at`
Cuando se detecta la transición `SCHEDULED → IN_PLAY`, el servidor escribe `kickoff_at = now() - 60s` en la fila del partido. El `- 60s` compensa el delay del plan gratuito de football-data.org (~1 min de retraso en live). Esta columna es la referencia para calcular el minuto de juego si en el futuro se quisiera mostrar el reloj en vivo.

---

## Indicador EN VIVO

El badge "EN VIVO" se muestra basado puramente en la hora local del cliente:

```
live = !finished && Date.now() >= new Date(match.match_date).getTime()
```

No depende de la API ni del status en la base de datos. Aparece exactamente cuando llega la hora programada del partido y desaparece cuando el status pasa a `FINISHED`. Muestra `con delay` para informar al usuario que los marcadores tienen retraso.

---

## Panel de administración

Ruta: `/mundial/admin`. Solo accesible para usuarios con `role = 'admin'` en la tabla `profiles` del hub.

Funciones:
- Crear/eliminar perfiles de participantes
- Sincronizar partidos manualmente
- Confirmar pagos (`payment_confirmed`)
- Marcar premios como entregados (`prize_paid`)
- Editar apuestas de cualquier participante
- Configurar monto global de apuesta
- Subir imagen de QR para pagos
- Configurar monto por partido individual

---

## Variables de entorno

| variable | uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | clave privada para operaciones admin (server-only) |
| `FOOTBALL_DATA_API_KEY` | token de football-data.org |
| `CRON_SECRET` | token para autenticar el cron de Vercel en `/api/mundial/sync` |

Gestionadas en Vercel Dashboard → Settings → Environment Variables. El `.env.local` nunca se sube al repositorio.

---

## Deploy

- **Plataforma:** Vercel (conectado a GitHub `edanielacero/Acero-Hub`, rama `master`)
- **Auto-deploy:** cada push a `master` dispara un deploy automático
- **Cron:** definido en `vercel.json`, ejecuta sync diario a las 08:00 UTC

---

## Traducciones

Los datos de football-data.org vienen en inglés. El frontend los traduce:

- **Nombres de equipos:** `teamNameEs(name)` — mapeo completo en `lib/mundial/team-names-es.ts`
- **Siglas (TLA):** `tlaEs(tla)` — solo las 11 que difieren en español (ENG→ING, GER→ALE, NED→HOL, USA→EUA, JPN→JAP, KOR→COR, IRN→IRA, KSA→ARS, SCO→ESC, SWE→SUE, CIV→CDM)
- **Stages:** `stageLabel(stage)` — en `lib/mundial/football-api.ts`
- El buscador acepta nombres y siglas tanto en inglés como en español

---

## UI / Flujo del usuario

1. El usuario entra a `/mundial`
2. Se busca su token en `localStorage`. Si existe y coincide con un perfil → entra directo.
3. Si no → pantalla de selección de perfil.
4. Pantalla principal con tres tabs:
   - **Próximos** — partidos por jugarse, agrupados por fecha con filtro de fecha (pills). Muestra bote, countdown al cierre de apuestas, formulario de apuesta.
   - **Anteriores** — partidos finalizados, agrupados por fecha, más reciente primero. Muestra resultado, quién ganó, cuánto ganó.
   - **Grupos** — tabla de posiciones calculada en tiempo real. Verde = clasificado, ámbar = tercer lugar fuera del top 8.
5. El buscador (lupa) filtra partidos en los tres tabs simultáneamente.
