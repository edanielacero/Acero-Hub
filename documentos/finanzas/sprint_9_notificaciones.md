# Finanzas — Sprint 9: "Notificaciones"

> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1), `sprint_2_compartidos.md` (2),
> `sprint_3_fijos.md` (3), `sprint_4_planes_de_pago.md` (4), `sprint_5_pasanaku.md` (5),
> `sprint_6_presupuesto.md` (6), `sprint_7_ahorro.md` (7), `sprint_8_perfiles.md` (8).
>
> Este documento especifica **únicamente el Sprint 9** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-27 · Estado: **construido**. Cinco desviaciones
> respecto de lo especificado acá, en §0.3 — mandan sobre el resto del
> documento donde difieran.

---

## 0. Preguntas que este sprint cierra

El roadmap (`contexto_finanzas.md` §7) tenía una línea: *"Que la app avise sin
que entres: fijo por vencer, presupuesto al límite, mes por organizar"*, más una
advertencia de infraestructura. Todo lo demás se decidió en dos rondas el
2026-08-27.

### Ronda 1 — qué es y cuándo

| Pregunta | Decisión |
|---|---|
| ¿Por qué canal? | **Push del navegador**, como lo hace el CRM. No email, no panel in-app |
| ¿De qué avisa? | **Fijos y cuotas · Presupuesto · Ahorro · Deudas por cobrar**, más un tipo nuevo: **recordar anotar** |
| ¿Cuándo llegan? | **Al momento, apenas ocurre.** No hay resumen diario |
| ¿Cuánto se configura? | **Un switch por tipo de aviso** |

### Ronda 2 — el detalle

| Pregunta | Decisión |
|---|---|
| ¿Cuántos recordatorios de anotar? | **Dos: mediodía y noche**, con horarios editables |
| ¿Insiste si ya anotaste? | **Sí, siempre a la hora fijada.** Ver §4.6, que explica por qué se eligió lo simple |
| ¿Y con varios perfiles? | **Configurable por perfil**: cada uno decide si notifica |
| ¿En qué dispositivos? | **iPhone, Android y computadora** — los tres |

### 0.1 De dónde sale la arquitectura

De **Acrosoft CRM**, que resuelve exactamente este problema sobre el mismo
Vercel Hobby: `pg_cron` + `pg_net` dentro de Postgres llamando a Edge Functions
de Supabase, con jobs que corren hasta **cada minuto**. Su `vercel.json` no tiene
`crons`.

**No se comparte NADA con el CRM.** Ni cuentas, ni claves, ni proyecto Supabase,
ni tablas. El Hub tiene su propio proyecto (`ovrtiqxxzpulertzdwnt` contra
`rhlnjtrbydwzzuvqayfo`), va a tener sus propias claves VAPID y sus propias
tablas. Del CRM se toma el **patrón**, no la infraestructura.

Lo que sí conviene copiar tal cual, porque ya está probado en producción:

| Del CRM | Qué resuelve |
|---|---|
| `_shared/push.ts` (68 líneas) | `npm:web-push@3.6.7` en Deno con claves VAPID de env |
| `_shared/internal-auth.ts` | `requireInternal` contra la service role key |
| `config.toml` con `verify_jwt = false` | Las funciones invocadas por `pg_cron` no llevan JWT de usuario |
| Leer la cabecera de un job existente | No escribir el secreto a mano en el SQL del cron |

Y una advertencia de su auditoría de seguridad que **no hay que repetir**:
*"`pg_net` instalada en el esquema `public` — mover a `extensions`"*. Acá va en
`extensions` desde el principio.

### 0.2 La decisión de implementación que cambia el tamaño del sprint

**Las Edge Functions reusan `lib/finanzas/`, no la reescriben.**

El riesgo obvio de meter lógica en Deno es terminar con dos implementaciones de
*"¿este fijo está vencido?"* que divergen — y cuando diverjan, la app dirá una
cosa y la notificación otra. Se evita porque **`lib/finanzas/` es TypeScript
puro**: 5.760 líneas sin una sola API de Node, con un único import externo que
además es de tipo (`import type { SupabaseClient }`, se borra al compilar).

Corre en Deno con dos ajustes mecánicos:

- `from './money'` → `from './money.ts'` (Deno exige extensión explícita)
- El tipo de `SupabaseClient` → `https://esm.sh/@supabase/supabase-js@2`

**Ya existe un precedente exacto de esa transformación en este repo:**
`tests/finanzas/run.mjs` compila `lib/finanzas/` y reescribe los imports a
`.mjs` para poder correr las 662 pruebas unitarias. El script de este sprint es
el mismo con otra extensión.

### 0.3 Lo que cambió al construirlo

#### a) El disparo NO usa la service role key

El CRM pasa su service role key en el header del cron. Eso deja la llave de
toda la base escrita en una fila de `cron.job`, y rotarla obliga a reescribir
todos los jobs.

Acá el disparo usa **`FIN_CRON_SECRET`**, un secreto que solo sirve para
invocar estas funciones. Si se filtra, lo peor que alguien logra es pedir que se
evalúen las notificaciones — molesto, no grave.

La decisión salió de un hallazgo: el runtime de Edge Functions tiene la clave
**nueva** de Supabase (`sb_secret_…`, 41 caracteres) mientras que `.env.local`
guarda la **JWT legacy** (219). Las dos válidas y distintas, así que compararlas
entre sí nunca iba a funcionar.

El secreto vive en **Vault**, no en la migración: escribirlo en el `command` del
job lo dejaría en texto plano en `cron.job` y en el historial de git. La
migración lo lee en tiempo de ejecución.

#### b) `pg_net` ignora el esquema que le pidas

`create extension pg_net with schema extensions` **no** pone sus funciones ahí:
la extensión crea su propio esquema `net` y las deja adentro. Se llama
`net.http_post(…)`, no `extensions.net.http_post(…)`.

Lo importante del hallazgo del CRM se cumple igual: **no queda en `public`**.

#### c) El timeout de `pg_net` sube a 60 segundos

El default son 5. Con datos de varios perfiles la evaluación tarda ~4 segundos
—medido—, peligrosamente cerca de cortar corridas a la mitad. Una corrida
cortada no es inofensiva: manda parte de los avisos, registra esos, y los que
faltaron esperan 15 minutos más.

#### d) El aviso se registra aunque el envío falle

Si el servicio de push devuelve un 5xx, reintentar en la corrida siguiente
mandaría el mismo aviso otra vez. Se eligió **perder un aviso antes que
repetirlo en bucle**: un push duplicado cada 15 minutos es la forma más rápida
de que alguien apague las notificaciones para siempre.

La excepción son los 404/410, que sí borran la suscripción: ahí el dispositivo
dejó de existir y no hay nada que reintentar.

#### e) La PWA vive dentro de `/finanzas`, no en el Hub

`app/manifest.ts` es la convención de Next, pero inyecta el enlace en **todas**
las páginas del Hub, y las notificaciones son de una sola mini-app. El manifest
es una ruta (`/finanzas/manifest`) enlazada solo desde el layout de Finanzas, y
el service worker se sirve desde `public/finanzas/sw.js` con scope `/finanzas/`.

Así ni el portal ni Expandlogy ni Trading Journal quedan bajo un service worker
que no pidieron. Es la misma regla que ya seguían el tema y el layout de la
mini-app.

---

## 1. Objetivo del sprint

**Que la app avise sin que la abras.**

Al terminar, el usuario activa las notificaciones desde Ajustes, elige qué
avisos quiere, y le llegan al celular y a la computadora en el momento en que
pasan las cosas — sin abrir la app, y sabiendo de qué perfil viene cada una.

### Definición de "terminado"

1. Se puede activar el push desde Ajustes en iPhone, Android y escritorio.
2. En iPhone, la app se puede instalar en la pantalla de inicio y hay una
   pantalla que explica cómo (sin eso, el botón de activar no hace nada).
3. Los cinco tipos de aviso llegan cuando corresponde, cada uno con su switch.
4. **Ningún aviso llega dos veces.**
5. Cada aviso dice de qué perfil es, y un perfil con las notificaciones
   apagadas no manda ninguno.
6. Tocar un aviso abre la pantalla que corresponde.
7. La lógica de "cuándo avisar" es **la misma** que usa la app, no una copia.

---

## 2. Alcance

### Entra

- Andamiaje PWA: `manifest`, íconos, `sw.js`. **Hoy no existe nada de esto.**
- `supabase/functions/` con `config.toml` y `_shared/`.
- El puente que le da `lib/finanzas/` a Deno, con su verificación en CI.
- Tabla de suscripciones, de preferencias y de avisos ya enviados.
- Una Edge Function que evalúa y manda, programada con `pg_cron`.
- Ajustes → Notificaciones: activar, y un switch por tipo.
- Switch de notificaciones dentro de cada perfil.

### No entra en este sprint

| Fuera | Por qué |
|---|---|
| **Email** | Se evaluó y se descartó: el canal elegido es push. Resend ya está integrado si algún día vuelve |
| **Panel in-app de avisos** | El contexto (§4) lo daba por hecho junto con el email; con push al momento, una bandeja dentro de la app es otra cosa que mantener sin una pregunta que responda |
| **Resumen diario** | Rechazado en la Ronda 1: los avisos van al momento |
| **Umbrales configurables** | La Ronda 1 eligió encender/apagar por tipo. Los umbrales quedan fijos (§4.2) |
| **Notificaciones entre usuarios** | Sigue habiendo un solo usuario (`contexto_finanzas.md` §1) |

---

## 3. Modelo de datos

### 3.1 `fin_push_subscriptions` — un dispositivo que aceptó recibir

```sql
create table if not exists fin_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,

  -- El endpoint ES la identidad del dispositivo para el navegador. Reinstalar
  -- la PWA genera uno nuevo; volver a activar en el mismo navegador devuelve el
  -- mismo. Sin esto, cada visita a Ajustes sumaría una fila y llegarían avisos
  -- repetidos.
  unique (endpoint)
);
create index if not exists fin_push_subs_user_idx on fin_push_subscriptions (user_id);
```

**Es del usuario, no del perfil.** Un dispositivo es un dispositivo: recibe los
avisos de todos los perfiles que estén encendidos. El perfil se decide al
evaluar el aviso (§3.2), no al suscribirse.

### 3.2 Preferencias: dos niveles

**Por usuario, qué tipos quiere** — el switch de la Ronda 1:

```sql
create table if not exists fin_notif_prefs (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  fijos              boolean not null default true,
  presupuesto        boolean not null default true,
  ahorro             boolean not null default true,
  deudas             boolean not null default true,
  recordar_anotar    boolean not null default true,
  -- Los dos horarios del recordatorio (§4.6). Hora local del usuario.
  recordar_mediodia  time not null default '14:00',
  recordar_noche     time not null default '21:00',
  -- Sin esto, alguien en Bolivia recibe el de la noche a las 17:00.
  timezone           text not null default 'America/La_Paz',
  updated_at         timestamptz not null default now()
);
```

**Por perfil, si notifica o no** — la decisión de la Ronda 2:

```sql
alter table fin_profiles
  add column notify boolean not null default true;
```

Va como columna en `fin_profiles` y no como tabla aparte porque es un solo
booleano por perfil, y así viaja gratis en el `PROFILE_COLS` que Ajustes ya lee.

Los dos niveles se combinan con **y**: un aviso se manda si su tipo está
encendido **y** el perfil del que sale tiene `notify`.

### 3.3 `fin_notifications` — lo que ya se mandó

La tabla que hace posible "al momento" sin repetir.

```sql
create table if not exists fin_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid references fin_profiles(id) on delete cascade,
  kind        text not null,
  -- La identidad del HECHO, no del aviso: "el fijo X del período 2026-09".
  -- Es lo que evita que un job que corre cada 15 minutos avise 96 veces por día
  -- de lo mismo.
  dedupe_key  text not null,
  title       text not null,
  body        text not null,
  url         text,
  sent_at     timestamptz not null default now(),

  unique (user_id, dedupe_key)
);
create index if not exists fin_notifications_user_idx
  on fin_notifications (user_id, sent_at desc);
```

`profile_id` es nullable a propósito: el recordatorio de anotar no sale de
ningún perfil en particular.

**El `dedupe_key` es el corazón del sprint.** Cada tipo define el suyo en §4.2,
y si está mal el usuario recibe el mismo aviso cada vez que corre el job —
que es la forma más rápida de que apague las notificaciones para siempre.

### 3.4 RLS

Las tres tablas con las cuatro policies de siempre contra `auth.uid() = user_id`.

`fin_notifications` se escribe desde la Edge Function con la **service role
key**, que salta RLS: es un registro del sistema, no algo que el usuario cree.
Su policy de `select` existe igual, por si algún día se muestra el historial.

### 3.5 Extensiones

```sql
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;
```

⚠️ **En `extensions`, nunca en `public`** — es un hallazgo abierto de la
auditoría de seguridad del CRM que no vale la pena repetir.

**A verificar antes de escribir código:** que las dos estén disponibles en el
proyecto del Hub. Están en el del CRM, pero se habilitan por proyecto.

---

## 4. Reglas de negocio

### 4.1 La regla que ordena todo: el aviso se calcula, no se guarda

Ningún tipo de aviso agrega una columna de estado a las tablas del dominio.
El job **recalcula** con las mismas funciones que usa la app y compara contra
`fin_notifications` para saber qué es nuevo.

Es el mismo principio que el saldo de una cuenta (maestro §4.2) y el de un plan
de ahorro (Sprint 7 §4.2): **derivado, nunca guardado.** Un estado
`ya_avisado` en `fin_recurring` se desincronizaría el día que alguien edite el
fijo, y nadie se enteraría.

### 4.2 Los cinco tipos

Toda la lógica ya existe. La columna "de dónde sale" es literal.

| Tipo | Cuándo | De dónde sale | `dedupe_key` |
|---|---|---|---|
| **Fijos y cuotas** | Un fijo pasa a `vencido`, o vence en ≤2 días. Ídem cuota de plan y aporte de pasanaku | `statusOf` (`recurring.ts:126`), `nextAporteDue` (`pasanaku.ts:40`) | `fijo:{id}:{período}` |
| **Presupuesto** | Una categoría llega al 90% o se pasa. Y un cierre de mes sin responder | `disponible` (`budgets.ts:290`), `needsClosure` (`budgets.ts:385`) | `presu:{line_id}:{período}:{90\|100}` |
| **Ahorro** | Termina un mes con sobrante sin repartir. Un plan llega a su meta | `pendingSavingsPeriod` (`savings.ts:91`), `goalReached` (`savings.ts:117`) | `ahorro:{goal_id}:{período}` |
| **Deudas** | Una deuda abierta cumple 30 días | `oldest_days` (`splits.ts:208`) | `deuda:{debt_id}:30d` |
| **Recordar anotar** | A las dos horas configuradas | — (§4.6) | `anotar:{fecha}:{mediodia\|noche}` |

**Los umbrales son fijos** —2 días, 90%, 30 días— porque la Ronda 1 eligió
encender/apagar por tipo y nada más. Están en un solo módulo para que
convertirlos en configurables después sea cambiar dónde se leen, no buscarlos.

**Por qué el período va en el `dedupe_key`:** un fijo vence todos los meses. Sin
el período, el aviso de septiembre nunca saldría porque el de agosto ya está en
la tabla.

### 4.3 "Al momento" es cada 15 minutos

La Ronda 1 pidió avisos al momento y no un resumen. En la práctica eso es un
`pg_cron` frecuente:

```sql
select cron.schedule('finanzas-notificaciones', '*/15 * * * *', $$…$$);
```

**Por qué 15 y no cada minuto:** ninguno de los cinco tipos cambia de estado
dentro del minuto. Un fijo vence un día; un presupuesto se pasa cuando registrás
un gasto —y ahí la app ya te lo muestra en pantalla—; el recordatorio tiene hora
fija. Correr cada minuto sería despertar la función 1.440 veces por día para que
en 1.439 no haya nada que hacer.

Que el job sea idempotente (§3.3) es lo que permite subir o bajar esa frecuencia
después sin tocar nada más.

### 4.4 Un aviso, un toque, una pantalla

Cada notificación lleva una `url` de destino, y tocarla abre **esa** pantalla,
no la Home:

| Tipo | Abre |
|---|---|
| Fijos | `/finanzas/fijos` |
| Presupuesto | `/finanzas/presupuesto` |
| Ahorro | `/finanzas/ahorro` |
| Deudas | `/finanzas/deudas` |
| Recordar anotar | `/finanzas` con el quick-add abierto |

Si el aviso es de un perfil que no es el activo, la URL lleva el perfil y la app
**cambia sola** al abrirlo. Sin eso, tocar "Servidor vence hoy · Acros Software
LLC" te dejaría mirando el perfil personal, sin el fijo por ningún lado.

### 4.5 El texto

Corto, concreto, y **con el número adelante**. Sin signos de admiración ni
"¡Atención!": un aviso de plata que grita se apaga rápido.

| Tipo | Título | Cuerpo |
|---|---|---|
| Fijo vencido | `Alquiler venció` | `Bs 2.100 · vencía el 5 · Daniel` |
| Fijo por vencer | `Spotify vence en 2 días` | `$5,99 · Daniel` |
| Presupuesto al 90% | `Comida al 90%` | `Te quedan $32 de $320 · Daniel` |
| Presupuesto pasado | `Te pasaste en Comida` | `$38 por encima de $320 · Daniel` |
| Cierre pendiente | `Agosto quedó sin cerrar` | `Decidí qué hacer con lo que sobró · Daniel` |
| Sobrante sin repartir | `Te sobraron $214 en agosto` | `Sin repartir entre tus ahorros · Daniel` |
| Meta cumplida | `Viaje llegó a su meta` | `$1.200 de $1.200 · Daniel` |
| Deuda vieja | `Ana te debe hace 30 días` | `$20 · Le presté para el pasaje · Daniel` |
| Recordar anotar | `¿Gastaste algo hoy?` | `Anotalo antes de que se te olvide` |

**El nombre del perfil va al final del cuerpo**, después de un `·`. Es la
decisión de la Ronda 2 (avisos de todos los perfiles, diciendo cuál) llevada al
texto: se lee último porque casi siempre vas a tener uno solo activo, pero está
cuando hace falta.

### 4.6 El recordatorio de anotar

Dos por día, a las horas configuradas, **siempre** — anotes o no.

Se evaluó hacerlo condicional (que no llegue si ya registraste algo) y **se
eligió lo simple a propósito**. El costo aceptado y conocido: a veces vas a
recibir un recordatorio de una tarea que ya hiciste. A cambio, el aviso es
predecible y no depende de una consulta más ni de definir qué cuenta como "ya
anotaste".

Si con el uso resulta molesto, hacerlo condicional es agregar una condición al
job — no rediseñar nada.

**El horario es del usuario, no del servidor.** El job corre en UTC y hay que
convertir con `timezone` (§3.2). Es el mismo problema que ya resolvieron el
Sprint 6 y el 7 pasando `today` desde el cliente: en Vercel el servidor corre en
UTC y los días 1 y último del mes no coinciden con Bolivia.

**No lleva perfil.** Es un recordatorio de hábito, no un hecho financiero, y
mandarlo una vez por perfil sería avisar tres veces lo mismo.

### 4.7 Cuando un dispositivo deja de existir

`web-push` devuelve **404 o 410** cuando la suscripción murió: desinstalaron la
PWA, limpiaron los datos del navegador, expiró.

Esa fila **se borra** en el momento. Sin eso la tabla se llena de endpoints
muertos, cada corrida gasta llamadas en ellos y los errores tapan a los reales.

Cualquier otro error (red, 5xx del servicio de push) **no borra nada**: se
reintenta en la corrida siguiente, que llega en 15 minutos.

---

## 5. Estructura de archivos

### Nuevos — la mitad PWA (no existe nada hoy)

| Archivo | Qué hace |
|---|---|
| `app/manifest.ts` | Nombre, íconos, `display: standalone`. **Sin esto el iPhone no puede instalar la app, y sin instalar no hay push** |
| `public/sw.js` | Service worker: recibe el push, lo muestra, y maneja el toque |
| `public/icon-192.png`, `icon-512.png` | Íconos de instalación |
| `app/finanzas/components/push-setup.tsx` | Pedir permiso, suscribir, y explicar cómo instalar en iPhone |

### Nuevos — la mitad Supabase

| Archivo | Qué hace |
|---|---|
| `supabase/config.toml` | `verify_jwt = false` para la función del cron |
| `supabase/functions/_shared/push.ts` | `web-push` + VAPID. **Copiar del CRM** |
| `supabase/functions/_shared/internal-auth.ts` | `requireInternal`. **Copiar del CRM** |
| `supabase/functions/finanzas-notificaciones/index.ts` | Evalúa los cinco tipos y manda |
| `scripts/build-edge-shared.mjs` | Copia `lib/finanzas/` a `_shared/finanzas/` reescribiendo imports (§0.2) |
| `supabase/migrations/…_finanzas_notificaciones.sql` | Las tres tablas, la columna `notify`, las extensiones y el job |

### Nuevos — la app

| Archivo | Qué hace |
|---|---|
| `app/api/finanzas/push/subscribe/route.ts` | Guarda la suscripción del dispositivo |
| `app/api/finanzas/push/prefs/route.ts` | `GET`/`PATCH` de los switches |
| `app/finanzas/screens/ajustes/notificaciones.tsx` | La pantalla |
| `lib/finanzas/notifications.ts` | Los cinco evaluadores + umbrales + textos. **Puro, sin red** |

`notifications.ts` va en `lib/finanzas/` y no dentro de la Edge Function a
propósito: así se prueba con la suite `unit` que ya existe, sin levantar nada.

### Modificados

| Archivo | Cambio |
|---|---|
| `app/layout.tsx` | Enlazar el manifest y registrar el service worker |
| `app/finanzas/screens/ajustes/menu.tsx` | Fila "Notificaciones" |
| `app/finanzas/screens/ajustes/perfiles.tsx` | Switch `notify` por perfil |
| `lib/finanzas/types.ts` | `notify` en `Profile`, tipos de preferencias |
| `tests/finanzas/run.mjs` | Correr `build-edge-shared` y fallar si quedó desactualizado |

**`vercel.json` no se toca.** Sigue con su único cron diario.

---

## 6. Contratos de API

### `POST /api/finanzas/push/subscribe`

Recibe la `PushSubscription` del navegador. `upsert` por `endpoint`: volver a
activar en el mismo dispositivo actualiza la fila, no agrega otra.

### `DELETE /api/finanzas/push/subscribe`

Desactivar en **este** dispositivo. Los demás siguen recibiendo.

### `GET` / `PATCH /api/finanzas/push/prefs`

```jsonc
{
  "prefs": {
    "fijos": true, "presupuesto": true, "ahorro": true, "deudas": true,
    "recordar_anotar": true,
    "recordar_mediodia": "14:00", "recordar_noche": "21:00",
    "timezone": "America/La_Paz"
  },
  "devices": 2,          // para decir "activadas en 2 dispositivos"
  "this_device": true    // si ESTE navegador está suscrito
}
```

`this_device` es lo que le permite a la pantalla mostrar "Activar" o "Desactivar
en este dispositivo" sin adivinar.

### La Edge Function

`POST https://<ref>.supabase.co/functions/v1/finanzas-notificaciones`

Solo interna: `requireInternal` contra la service role key. La invoca `pg_cron`.

---

## 7. UI

### Ajustes → Notificaciones

Arriba, el estado real: **"Activadas en este dispositivo"** o el botón para
activarlas. Debajo, cuántos dispositivos hay en total.

Después, un switch por tipo con un ejemplo del aviso debajo, en gris chico. Es
más barato entender *"Comida al 90% · Te quedan $32"* que la etiqueta
"Presupuesto".

Al final, los dos horarios del recordatorio.

### El caso iPhone

Si es iOS y **no** está instalada en la pantalla de inicio, el botón de activar
no se muestra. En su lugar, las instrucciones: *Compartir → Agregar a inicio*.

Es el detalle que decide si esta feature funciona o parece rota en el celular:
en iOS, `Notification.requestPermission()` desde Safari **no falla** — no hace
nada. Un botón que no hace nada es peor que no tener botón.

### El switch por perfil

Una fila más en cada perfil de Ajustes → Perfiles: **"Notificar de este
perfil"**. Encendido por defecto.

### Permiso denegado

Si el navegador ya tiene el permiso bloqueado, no ofrecer un botón que no puede
funcionar: decirlo y explicar dónde se cambia. Mismo criterio que iOS.

---

## 8. Verificación

| # | Prueba | Tipo |
|---|---|---|
| 1 | Cada evaluador dispara con su umbral y no antes | `unit` |
| 2 | El `dedupe_key` de un fijo cambia de mes a mes | `unit` |
| 3 | Un aviso ya enviado no se vuelve a enviar | `db` |
| 4 | Dos corridas seguidas del job mandan una sola vez | `api` |
| 5 | Un tipo apagado no genera avisos | `api` |
| 6 | Un perfil con `notify = false` no genera avisos | `api` |
| 7 | Los avisos dicen de qué perfil son | `api` |
| 8 | El recordatorio respeta la zona horaria del usuario | `unit` |
| 9 | Suscribir dos veces el mismo endpoint no duplica | `db` |
| 10 | Un 410 borra la suscripción; un 500 no | `unit` |
| 11 | `lib/finanzas/` copiado a Deno está al día | `unit` |
| 12 | Tocar un aviso de otro perfil abre la app en ese perfil | ⏳ manual |
| 13 | Llega a iPhone instalado, Android y escritorio | ⏳ manual |

La **#11** es la que sostiene §0.2: si el script no corrió, el bundle de Deno
tiene una copia vieja de la lógica y la notificación puede decir algo distinto
de lo que muestra la app. Compara hashes y falla la suite.

La **#4** es la que sostiene todo lo demás: sin idempotencia, un job cada 15
minutos manda el mismo aviso 96 veces por día.

---

## 9. Qué desbloquea este sprint

| Qué | Cómo se apoya |
|---|---|
| **La PWA** | Manifest, íconos y service worker no existían. A partir de acá el Hub se puede instalar, lo use o no el push |
| **Cualquier trabajo programado** | `pg_cron` + `pg_net` quedan montados. El refresco de cotizaciones podría dejar el cron de Vercel y correr más de una vez al día |
| **Edge Functions con la lógica del Hub** | El puente de §0.2 sirve para cualquier función futura que necesite `lib/finanzas/` |
| **#8 · Reportes** (congelado) | Si vuelve, ya hay dónde correr un cálculo pesado fuera del request |

⚠️ **Recordatorio:** `vercel.json` sigue con **un solo cron diario** y así se
queda. Agregar un segundo hace fallar el deploy entero — ya rompió producción
dos veces. Todo lo programado nuevo va por `pg_cron`.
