# Finanzas — Sprint 3: "Fijos"

> Contexto financiero y de producto: `contexto_finanzas.md`.
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1) y
> `sprint_2_compartidos.md` (2).
>
> Última actualización: 2026-08-18 · Estado: **construido**, 618 pruebas en
> verde, verificado en navegador real.

---

## 0. Por qué se adelantó

Estaba planificado como **feature 8** del roadmap, después de presupuesto y
reportes. Se adelantó al 3 por la lección 3 del documento de contexto:

> **Primero lo que ya está pasando.**

Spotify y TradingView se pagan **todos los meses**, igual que el pasanaku y las
cuotas de los $957. Presupuesto y reportes siguen después porque necesitan
historial acumulado para valer algo.

Ayudó además que "Dinero por cobrar" está **bloqueado** hasta que se confirme
con el deudor si la última cuota es de $57 (pregunta #1 del contexto). Hacer
Fijos mientras tanto ordena la secuencia sin esperar a nadie.

---

## 1. Objetivo

> **Saber qué me falta pagar este mes, y registrarlo en un toque.**

Dos preguntas nuevas que la app responde:

1. ¿Qué fijos me faltan registrar?
2. ¿Cuánto me deben, acumulado, por cada cosa que comparto?

### Definición de "terminado"

- [x] Puedo cargar Spotify una vez y no volver a tipear su reparto nunca más
- [x] La Home me dice **"1 de 3 registrados"**
- [x] Registrar es **un toque**, con todo precargado
- [x] El gasto se anota **el día que le toca**, no el día que lo registré
- [x] Si Spotify sube de precio, el reparto parejo se ajusta **solo**
- [x] Puedo cargar el alquiler, que no comparto con nadie, en el mismo lugar
- [x] Puedo pausar un fijo sin borrar su historia
- [x] Borrar la plantilla **no** borra los gastos que generó
- [x] `npm run build` pasa sin errores

---

## 2. La idea que ordena todo

**"Compartido" y "recurrente" son atributos independientes.** Cualquier
combinación existe:

| | Solo mío | Compartido |
|---|---|---|
| **Suelto** | Almuerzo Bs 35 | Una cena dividida → *se arregla en el momento* |
| **Fijo** | Alquiler, iCloud | **Spotify, TradingView** |

Por eso **no** hay dos módulos ("suscripciones" y "compartidos"): hay **uno de
fijos donde el reparto es opcional**. Es el mismo patrón que el Sprint 2 ya
probó, un nivel más arriba:

```
fin_recurring   ──┬── fin_recurring_splits   (reparto por defecto, opcional)
                  │
                  └── al registrar, instancia ↓
                                fin_transactions ──── fin_splits
```

Una plantilla es literalmente **un gasto que todavía no pasó**. Registrarla es
instanciarla. No hay concepto nuevo que aprender ni para el usuario ni para el
código.

### Lo que el usuario dijo y que acotó el alcance

> *"No quiero controlar los gastos del día a día compartidos, eso lo arreglo con
> las personas en el momento. Quiero control de lo que me deben mes a mes por
> cosas fijas."*

Consecuencia de producto: **la casilla "Es compartido" del quick-add deja de ser
el camino principal** y pasa a ser la salida de emergencia. Se conserva —cuesta
una fila colapsada— pero el flujo real de deudas ahora nace en Fijos.

---

## 3. Modelo de datos

Migración `20260818060000_finanzas_fijos.sql`. Dos tablas y una columna; nada de
lo que existe cambia de forma.

### 3.1 `fin_recurring`

```sql
name, emoji, amount, account_id, category_id,
frequency ('mensual' | 'anual'), day_of_month, month_of_year,
active, note
```

**`amount` es un default, no una ley.** Se edita al confirmar cada mes. Spotify
sube de precio y la plantilla sigue sirviendo.

**`day_of_month` se topea contra el largo del mes** al calcularlo: un `31`
configurado cae el **28 en febrero** y el **30 en abril**. No se pierde ni se
corre al mes siguiente.

`fin_recurring_anual_shape` obliga a que un anual tenga mes y un mensual no lo
tenga. Sin eso quedarían filas medio configuradas que la UI tendría que
adivinar cómo interpretar.

### 3.2 `fin_recurring_splits`

```sql
recurring_id, person_id, amount   -- amount NULL = parte pareja
```

**`amount` nullable es la decisión importante.** `NULL` significa "parte
pareja": se calcula **al registrar**, con el monto de ese mes. Si Spotify pasa
de $11.99 a $12.99, a cada uno le toca un poco más sin que haya que acordarse de
editar nada. Con el monto congelado en la plantilla, les cobrarías de menos
todos los meses sin enterarte.

Un monto **fijo** manda tal cual: es el que deja cobrar por encima del costo
(§4.3) o invitar una parte.

### 3.3 `fin_transactions.recurring_id`

**"¿Ya lo registré este mes?" no se guarda: se deriva** de que exista un
movimiento con este `recurring_id` dentro del período. Mismo principio que los
estados de las deudas del Sprint 2 — un flag persistido se desincroniza del
hecho que describe, un puntero no.

### 3.4 Las tres claves foráneas, y por qué una va al revés

| FK | Regla | Por qué |
|---|---|---|
| `fin_recurring_splits.recurring_id` | **cascade** | Es **configuración**, no una deuda. Borrar la plantilla se lleva su reparto por defecto y no toca ninguna deuda ya generada |
| `fin_recurring_splits.person_id` | **restrict** | Una persona con historial no se borra, se archiva. Igual que en `fin_splits` |
| `fin_transactions.recurring_id` | **set null** | Borrar la plantilla **no** borra la historia de lo que pagaste: los movimientos quedan y solo pierden el vínculo |

El `cascade` del primero contrasta a propósito con el `restrict` que
`fin_splits.transaction_id` tiene en el Sprint 2. La diferencia es qué
representa cada fila: allá una deuda real, acá un ajuste.

### 3.5 RLS

Las 2 tablas: `enable row level security` y las 4 policies con
`user_id = auth.uid()`. Sin excepciones, sin `createAdminClient()`.

---

## 4. Reglas de negocio

### 4.1 Nunca se auto-postea

Es una decisión de producto ya cerrada en el contexto (§4) y sigue siendo la
correcta. La app **avisa**; el gasto lo confirma el usuario.

Si posteara sola, el día que Spotify cambie el precio o rebote el pago habría un
gasto que no ocurrió y un saldo que no cuadra con Airtm. El mejor caso posible
es *un toque por mes* — la pregunta era cuántos toques, no si los hay.

Corolario: **este sprint no agrega ningún cron.** Vercel Hobby permite uno solo
por día y ya está usado por el refresco de cotizaciones. El aviso es pasivo:
está en la pantalla cuando entrás.

### 4.2 La fecha por defecto es la del período, no hoy

Si Spotify cobra el 5 y lo registrás el 18, **el cargo fue el 5**. Anotarlo hoy
correría el gasto de mes en los bordes y ensuciaría cualquier reporte futuro. Es
editable, pero el default es el correcto.

### 4.3 El reparto puede superar al gasto — cambio sobre el Sprint 2

> *"Quiero poder editar el monto de lo que me deben, porque así puedo cobrar un
> poco más ganando un poco más, o cobrar menos invitando yo una parte."*

El Sprint 2 rechazaba `Σ partes > monto` con un 400. **Esa regla se eliminó.**

```
mi_parte = monto − Σ partes
```

- `mi_parte > 0` → **pagás** una parte (lo normal)
- `mi_parte = 0` → el reparto cubre todo
- `mi_parte < 0` → **ganás** la diferencia

Un reparto por encima del costo no es un error: es revender los lugares del plan
familiar con un margen. La UI lo nombra ("Ganás $1.51" en verde) en vez de
bloquearlo, y `gasto_real` puede dar negativo — que la Home lee como **"a favor
$1.51"** y no como un gasto de menos uno cincuenta y uno.

Lo único que sigue siendo inválido: una parte en **cero o negativa**.

### 4.4 Idempotencia al registrar

Dos toques al botón no generan dos gastos. Se chequea contra el **período**, no
contra la fecha exacta: el segundo toque podría traer otra fecha del mismo mes y
seguiría siendo el mismo cargo. Devuelve `409` con el id del que ya existe.

Se puede forzar con `force: true` para el caso raro de dos cobros reales en el
mismo mes.

### 4.5 Pausado gana sobre registrado

Un fijo pausado muestra **"Pausado"** aunque su período esté registrado. En la
lista, un pausado que dijera "Listo" se lee como activo y al día; lo que importa
de un pausado es que **no te lo van a volver a pedir**.

### 4.6 Actualizar la plantilla es explícito

Registrar un mes más caro **no** cambia el monto del fijo. Aparece una casilla
—"Cambiar también el monto del fijo"— y la decisión es del usuario. Un precio
que se actualiza solo porque un mes pagaste de más es la clase de efecto
colateral que hace desconfiar de la app.

---

## 5. Archivos

### Nuevos

```
app/finanzas/fijos/page.tsx                  — la lista con su estado
app/finanzas/components/recurring-sheet.tsx  — crear / editar una plantilla
app/finanzas/components/register-sheet.tsx   — confirmar el gasto del período
app/api/finanzas/recurring/route.ts          — GET · POST
app/api/finanzas/recurring/[id]/route.ts     — PATCH · DELETE
app/api/finanzas/recurring/[id]/register/route.ts
lib/finanzas/recurring.ts                    — períodos, estado, reparto resuelto
supabase/migrations/20260818060000_finanzas_fijos.sql
```

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/splits.ts` | Se quitó el tope `Σ ≤ monto`; nuevo `shareBreakdown()` |
| `lib/finanzas/load.ts` | `loadRecurring()` + `recurring_id` en `TX_COLS` |
| `lib/finanzas/types.ts` | `Recurring`, `RecurringSplit`, `RecurringWithState`, `Frequency` |
| `lib/finanzas/snapshot.ts` | `recurring` en el snapshot · **VERSION 1 → 2** |
| `app/api/finanzas/bootstrap/route.ts` | Un séptimo `load` en el mismo viaje |
| `app/api/finanzas/transactions/[id]/route.ts` | Se quitó el 400 de "bajar el monto" |
| `app/finanzas/components/split-editor.tsx` | "Ganás" en vez de bloquear |
| `app/finanzas/components/quick-add.tsx` | Ya no bloquea por reparto excedido |
| `app/finanzas/components/nav-items.tsx` | Fijos en la sidebar (la tab bar sigue en 4) |
| `app/finanzas/page.tsx` · `movimientos/page.tsx` | Panel de fijos; "a favor" cuando el neto es negativo |

**El snapshot sube de versión a propósito.** Cambió su forma, y los guardados
viejos se descartan en vez de migrarse: la primera apertura después del deploy
muestra el esqueleto una vez y vuelve a la normalidad.

---

## 6. API

### `GET /api/finanzas/recurring`
```jsonc
{
  "recurring": [{
    "id": "…", "name": "Spotify", "emoji": "📱", "amount": 11.99,
    "currency": "USD", "frequency": "mensual", "day_of_month": 5,
    "splits": [{ "person_id": "…", "amount": null }],
    "status": "pendiente",       // derivado
    "due": "2026-08-05",
    "days_late": 0,
    "registered_tx_id": null,
    "open_usd": 8.97             // lo que te deben de ESTE fijo, todos los períodos
  }],
  "done": 1, "total": 3, "pending": 2
}
```

También viaja dentro de `/api/finanzas/bootstrap`, que ahora manda `today` — el
día del usuario, no el del servidor, que en Vercel corre en UTC y decidiría mal
si un fijo está vencido.

### `POST /api/finanzas/recurring`
`{ name, amount, account_id, category_id?, frequency?, day_of_month?, month_of_year?, splits? }`

En `splits`, `amount: null` significa parte pareja. Las personas se pueden crear
al vuelo por `person_name`, igual que en el Sprint 2.

### `PATCH` / `DELETE /api/finanzas/recurring/[id]`
Mandar `splits` reemplaza el reparto entero; no mandarlo lo deja intacto.
`active: false` pausa.

### `POST /api/finanzas/recurring/[id]/register`
`{ amount?, account_id?, date?, description?, update_template?, force? }`

Crea el gasto (`gasto · consumo`, con `recurring_id`) y sus deudas en una sola
operación. Todo lo del body pisa a la plantilla **solo para esta instancia**.
`409` si el período ya está registrado.

Si el reparto falla, se borra el gasto: la misma compensación del Sprint 2, y el
peor caso posible sigue siendo *un gasto normal sin reparto*.

---

## 7. UI

**La tab bar se queda en 4.** Fijos entra por el panel de la Home, la sidebar de
desktop y su URL. Misma regla que Compartidos en el Sprint 2.

```
Fijos                                    Nuevo
─────────────────────────────────────────────
Este período
1 de 3 registrados            [2 pendientes]

🏠 Alquiler     Bs 2.100 · cada mes · 1 ago
                          ⚠ 17d  [Registrar]
📱 Spotify  👥3  $11.99 · cada mes · 5 ago
                          ⚠ 13d  [Registrar]
🧾 TradingView 👥1  $29.95 · 12 ago · te deben $17
                                    ✅ Listo
```

La fila **envuelve** en móvil (`flex-wrap` + `ml-auto`): a 390px las acciones
bajan solas en vez de estrujar el nombre. Sin eso "Spotify" se cortaba en
"Spoti…" y el monto en "Bs 2.100,00 · …" — la fila decía menos cuanto más chica
era la pantalla.

El sheet de registrar muestra **las deudas que se van a generar** antes de
confirmar, ya calculadas con el monto de ese mes.

---

## 8. Verificación

**618 pruebas en verde** (2026-08-18). Eran 486 al terminar el Sprint 2.

| Suite | Sprint 2 | Ahora | Qué cubre de este sprint |
|---|---|---|---|
| `unit.mjs` | 235 | **286** | Períodos y el tope de día (31 → 28 en febrero), estado derivado, reparto recalculado con el precio del mes, mezcla de fijos y parejos, orden y progreso, el margen |
| `db.mjs` | 62 | **83** | RLS de las dos tablas, los tres `on delete`, `fin_recurring_anual_shape`, parte pareja con `amount` null vs. cero rechazado |
| `api.mjs` | 189 | **249** | CRUD, registrar, idempotencia 409, suba de precio con `update_template`, pausa, borrar sin perder historia, el margen y el neto negativo |

**Tres pruebas del Sprint 2 se actualizaron** porque su regla cambió a propósito
(§4.3): las que afirmaban que repartir de más y bajar el monto por debajo del
reparto devolvían 400. Ahora devuelven 201/200 y están anotadas como cambio
deliberado, no como relajación silenciosa.

### En navegador real

Chrome a 390px y 1440px, con datos de los tres casos (compartido parejo,
compartido con monto fijo, y uno solo suyo):

| Comprobación | Resultado |
|---|---|
| Fijos y Home renderizan sin error de consola | ✅ |
| Sin scroll horizontal a 390px | ✅ |
| La tab bar sigue en **4** pestañas | ✅ |
| Vencidos arriba con sus días de atraso | ✅ |
| El sheet muestra las deudas antes de confirmar | ✅ |
| Cambiar el monto recalcula el reparto parejo en vivo | ✅ |
| Y ofrece actualizar la plantilla solo si cambió | ✅ |
| Registrar deja el fijo en "Listo" y suma al progreso | ✅ |

### Pendiente

| # | Prueba |
|---|---|
| 1 | Cargar los fijos reales (Spotify, TradingView) con sus personas |
| 2 | Registrar uno desde el iPhone y confirmar que es un toque |
| 3 | Verificar el mes que viene que el estado se reinicia solo |

La #3 es la única que el tiempo tiene que confirmar: el 1 de septiembre los tres
fijos deberían volver a aparecer como pendientes sin que nadie toque nada.

---

## 9. Qué desbloquea

| Sprint | Cómo se apoya |
|---|---|
| **4 · Pasanaku** | El aporte de 300 Bs es casi un fijo, pero es `gasto · movimiento` y el check del Sprint 2 hoy no lo permite. `fin_recurring` es donde va a colgar; hay que aflojar `fin_tx_flow_shape` y agregarle `flow_type` a la plantilla |
| **5 · Presupuesto** | Los fijos son la parte **predecible** del mes: un presupuesto que ya sabe que $42 están comprometidos arranca con información real |
| **11 · Alertas** | El estado `vencido` ya está calculado. Falta solo el envío, colgado del cron que ya existe |
