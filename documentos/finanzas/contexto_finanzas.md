# Finanzas — Documento de Contexto

> Este documento **no** es un plan de desarrollo. Es el retrato de la realidad
> financiera que la mini-app tiene que representar, más las decisiones de
> producto ya cerradas y las lecciones del intento anterior. El plan de
> construcción vive en `documento_maestro_finanzas.md`.
>
> Última actualización: 2026-08-18

---

## 1. Qué es la mini-app

Mini-app **personal** de finanzas dentro de Acero Hub, en `/finanzas`.

- **Un solo usuario: el admin (Daniel).** No se comparte con nadie, no hay
  colaboradores, no hay vistas de "otro usuario". Cualquier feature que
  implique compartir datos está fuera de alcance por definición.
- **Totalmente independiente del resto de mini-apps.** No reutiliza componentes,
  utilidades, lógica, tipos ni estilos de Expandlogy, Trading Journal ni de
  ninguna otra. Lo único compartido son las primitivas del Hub (sesión, tabla
  `profiles`, gate de acceso). Diseño propio y nuevo.
- **Entrada 100% manual.** Nunca habrá import de CSV de banco ni conexión a
  exchanges. Todo se registra a mano. Esto no es una limitación temporal, es
  una decisión: el acto de registrar es parte del valor.

---

## 2. La realidad financiera que hay que modelar

### 2.1 Ingresos

| Concepto | Monto | Frecuencia | Notas |
|---|---|---|---|
| Ingreso base | ~900 USD | Mensual | Es la línea sobre la que se planifica todo |
| Cuota de deuda por cobrar | 100 USD | Mensual, 10 meses | Dinero **extraordinario**, no entra al presupuesto normal |

### 2.2 La deuda por cobrar (los $957)

Alguien le debe **957 USD** y se los paga en cuotas mensuales de **100 USD
durante 10 meses**.

- $100 × 10 = $1.000, pero la deuda es de $957. La interpretación de trabajo
  es **9 cuotas de $100 + una última de $57**. ⚠️ *Sin confirmar con el deudor.*
- **No se cuenta como dinero disponible hoy.** El saldo por cobrar es un activo
  aparte; solo se convierte en plata real cuando la cuota efectivamente entra.
- Cada cuota que entra es **dinero extraordinario**: no infla el presupuesto
  mensual, se asigna a destinos específicos.

Reparto propuesto para cada cuota extraordinaria (**tentativo, no fijado**):

| Destino | % | De $100 |
|---|---|---|
| 🛡️ Fondo de seguridad | 40% | $40 |
| 🚀 Fondo para hacer más dinero | 30% | $30 |
| 📈 Patrimonio / inversión | 20% | $20 |
| 🎯 Objetivos / gastos futuros | 10% | $10 |

### 2.3 Gastos compartidos (paga completo y luego cobra)

Dos suscripciones donde él pone el 100% y recupera parte después:

- **Spotify** — paga el plan familiar completo, lo divide entre **3 amigos**, él
  se encarga de cobrarles.
- **TradingView** — paga completo y le cobra su parte a **otra persona**.

Implicación de modelado: existe un **gasto bruto** que sale de su bolsillo cada
mes y **reembolsos** que entran después, en fechas distintas. Su costo real es
el **neto**, pero su flujo de caja mensual sí siente el **bruto**. Los dos
números tienen que existir en la app; no se puede simplificar a uno solo.

### 2.4 Pasanaku

Aporta **300 Bs cada mes** a un pasanaku (ahorro rotativo entre conocidos: todos
ponen, y cada mes le toca el pote completo a uno).

Dos cosas que lo hacen especial:

1. **Está en bolivianos, no en dólares.** Es la razón principal por la que la
   app necesita ser multi-moneda desde el día uno.
2. **No es un gasto.** Es plata que sale todos los meses y vuelve completa
   cuando le toca el turno. Contarlo como gasto de consumo distorsiona
   cualquier cálculo de "cuánto gasto realmente".

### 2.5 Patrimonio actual (aproximado)

Cifras que venían del intento anterior. ⚠️ **Requieren re-confirmación antes de
cargarlas** — son de hace algunos meses.

| Cuenta | Saldo | Moneda |
|---|---|---|
| Airtm | 1.299 | USD |
| Broker | 980 | USD |
| Bitcoin | 900 | USD (valuación) |
| USDT | 30 | USD |
| Efectivo | 0 | — |
| Bancos | 0 | — |
| **Total** | **~3.209 USD** | |

---

## 3. Modelo mental del usuario

Tres ideas que atraviesan todo y que la app tiene que respetar:

### 3.1 "Gasto real" vs "Movimiento financiero"

No toda plata que sale es un gasto.

- **Gasto real (consumo):** comida, transporte, suscripciones. Plata que se fue
  y no vuelve.
- **Movimiento financiero:** aportes al pasanaku, transferencias entre cuentas
  propias, aportes a objetivos, inversiones. La plata cambia de lugar, no
  desaparece.

Los reportes de "cuánto gasté" y "tasa de ahorro" solo deben sumar **consumo**.
El patrimonio y la liquidez usan **todos** los movimientos. Confundirlos es el
error más caro que puede cometer esta app.

### 3.2 Bolsillos

Separación **conceptual**, no cuentas físicas separadas. Los cinco bolsillos que
el usuario tiene en la cabeza:

- 🛡️ Seguridad (fondo de emergencia)
- 🚀 Crecimiento (fondo para hacer más dinero / experimentos con ROI)
- 📈 Patrimonio (inversiones, cripto, broker)
- 🎯 Objetivos (metas de ahorro concretas)
- 🍽️ Vivir (gasto corriente)

### 3.3 Multi-moneda con tasa congelada

Vive entre USD y BOB. La conversión de una transacción se **congela en el
momento de registrarla** — si mañana cambia el tipo de cambio, un gasto de hace
tres meses no puede cambiar de valor retroactivamente. Esto es no negociable.

---

## 4. Decisiones de producto ya cerradas

No volver a preguntar por estas:

| Tema | Decisión |
|---|---|
| Usuarios | Uno solo (el admin). Sin compartir |
| Import CSV de banco/exchange | **Nunca.** Entrada 100% manual |
| Auto-categorización | Reglas simples por palabra clave, editables. Sin IA en v1 |
| Suscripciones recurrentes | Solo **recuerdan**. Nunca se auto-postea un gasto |
| Reparto por encima del costo | **Permitido.** Cobrar de más y ganar la diferencia es una decisión válida; tu parte queda negativa y se llama ganancia |
| Fijos vs. compartidos | Son atributos **independientes**. Un solo módulo de fijos donde el reparto es opcional, no dos módulos |
| Deuda vs. compartido | **Conceptos distintos.** Compartido = responsabilidad recurrente sobre un servicio, atributo del fijo. Deuda = alguien te debe plata por lo que sea, entidad propia sin gasto padre obligatorio |
| Gastos compartidos | Se registra el **bruto**; los reembolsos son movimientos aparte. Detalle **por persona**. Aplica a cualquier gasto, no solo suscripciones |
| Pasanaku | **Personal, no de grupo** (revisado 2026-08-21): sin participantes ni rondas ajenas. Solo tu lado — aporte, puestos totales, tu puesto. La fecha de tu turno se deriva, no se pregunta. → *Especificado en `sprint_5_pasanaku.md`* |
| Alertas | Panel in-app + email para las importantes (Resend, ya integrado) |
| Apple Wallet con push | Descartado por completo |
| Gráficas | SVG propio, sin agregar librería |
| Metodología | Sprints por **feature**, cada uno una versión usable de la app |

---

## 5. Preguntas abiertas

Ninguna bloquea el Sprint 1, pero hay que resolverlas antes de los sprints que
las tocan:

1. ~~**Última cuota de la deuda:** ¿$57 o son 10 cuotas de $100 ($1.000)?~~
   **Resuelto el 2026-08-19: no importa.** El usuario arma el plan de cuotas
   dentro de la app — cuántas, de cuánto, con o sin interés — y lo edita
   cuando el deudor confirme. Deja de ser una pregunta que bloquee nada.
   → *Especificado en `sprint_4_planes_de_pago.md`.*
2. ~~**Compartidos en bruto o neto.**~~ **Resuelto el 2026-08-18: bruto +
   reembolsos + neto.** El gasto se registra completo (lo que sale del bolsillo)
   y las tres cifras existen en la app. Además: seguimiento **por persona**, y
   el mecanismo sirve para **cualquier** gasto compartido, no solo las dos
   suscripciones. → *Especificado en `sprint_2_compartidos.md`.*
3. ~~**Tipo de cambio para el pasanaku:** ¿a qué tasa se valúan los 300 Bs —
   la oficial, la paralela, o la del día de cada aporte?~~ **Resuelto de hecho
   el 2026-08-21:** cada aporte es una transacción normal en Bs, así que usa
   el mismo mecanismo de tasa congelada que cualquier otra — la del día en
   que se registra, editable en Ajustes. No hizo falta una decisión aparte.
   → *Sprint 5, `sprint_5_pasanaku.md`.*
4. **Reparto de los extraordinarios:** ¿se fija el 40/30/20/10 o se decide cuota
   por cuota?
   → *Bloquea el sprint de "Objetivos".*
5. **Confirmar saldos actuales** de las 6 cuentas antes de cargarlas.
   → *Bloquea la carga inicial del Sprint 1 (no el desarrollo).*

---

## 6. Historia: el intento anterior y por qué se borró

Hubo una primera versión de Finanzas, **eliminada el 2026-08-17** (commits
`92de007` y `eff143f`, migración `20260817000000_remove_finanzas.sql`).

**Qué se había construido:** 7 tablas (`fin_accounts`, `fin_categories`,
`fin_category_rules`, `fin_transactions`, `fin_asset_valuations`,
`fin_exchange_rates`, `fin_profiles`), 8 páginas, ~18 endpoints, un cron de
tipo de cambio con 3 APIs externas. **47 archivos, ~4.000 líneas.**

**Por qué se borró:** el plan original tenía 14 sprints ordenados por
dependencia, pero el "Sprint 1" era **Cuentas + Categorías + Tipo de cambio** —
pura infraestructura. Al terminarlo todavía **no se podía registrar un solo
gasto**. Se escribieron 4.000 líneas antes de que la app sirviera para algo, y
cuando se quiso corregir el rumbo era más barato empezar de cero. No se perdió
ningún dato real: había 0 cuentas, 0 transacciones y 0 tasas cargadas.

**Lecciones que rigen la reconstrucción:**

1. **Un sprint que no se puede usar no es un sprint.** Cada sprint tiene que
   responder una pregunta que le importe al usuario **el día que se termina**.
2. **La infraestructura se difiere hasta que duela.** El cron de tipo de cambio
   con 3 APIs se reemplaza por un campo editable a mano. Se automatiza cuando
   escribir el número a mano se vuelva molesto, no antes.
3. **Primero lo que ya está pasando.** Compartidos, deuda por cobrar y pasanaku
   ocurren cada mes en su vida real. Presupuesto y reportes necesitan historial
   acumulado — van después, aunque suenen más importantes.
4. **Empezar sin datos previos.** El único sprint que puede arrancar con la base
   vacía es el de registrar movimientos. Todo lo demás se alimenta de él.

**Lo único que sobrevivió:** el diseño del tab bar flotante, rescatado en
`documentos/design/liquid-glass-menu.md`.

---

## 7. Roadmap de features (orden propuesto)

Cada uno es una versión usable. Solo el Sprint 1 está especificado en detalle.

| # | Feature | Qué desbloquea | Estado |
|---|---|---|---|
| 1 | **Movimientos** — registrar, ver saldo, 5 activos, tasas automáticas | Todo lo demás | ✅ Construido |
| 2 | **Deudas** (era "compartidos") | Lo que te deben, venga de donde venga | ✅ Construido · modelo corregido el 19/8 |
| 3 | **Fijos** (era la 8; incluye Recurrentes) | Spotify, TradingView, alquiler | ✅ Construido |
| 4 | **Planes de pago** | Calendario de cuotas sobre cualquier deuda, con o sin interés — desbloquea los $957 sin esperar al deudor | ✅ Construido |
| 5 | Pasanaku | Los 300 Bs mensuales — recortado a tracker personal | ✅ Construido |
| 6 | Presupuesto mensual | Requiere historial del 1 | — |
| 7 | Reportes | Requiere 2–6 | — |
| 8 | Objetivos y bolsillos | Requiere 6, 7 | — |
| 9 | Fondo de crecimiento y ROI | Requiere 1 | — |
| 10 | Alertas | Requiere 6, 3 | — |
| 11 | **Cuentas de inversión** (Broker, y las que se sumen después) | Ajustar su valor sin que cuente como gasto/ingreso real del mes | ✅ Construido |

Los tres primeros después de Movimientos (compartidos, por cobrar, pasanaku) son
cosas que **ya le están pasando cada mes**. Por eso van antes que presupuesto y
reportes, que necesitan meses de datos acumulados para valer algo.

### 7.1 Feature 11 — Cuentas de inversión (construido el 2026-08-19)

Antes de esto, la cuenta **Broker** (§2.5) era una cuenta normal: cualquier
ajuste de su valor cargado como `ingreso`/`gasto` se contaba como consumo real
(Sprint 1 grababa `flow_type: 'consumo'` siempre para esos dos tipos), así que
ensuciaba el gasto/ingreso del mes con algo que era solo el mercado moviéndose.

**No es lo mismo que la #9 (Fondo de crecimiento y ROI)** ni que
`fin_asset_valuations` (documento_maestro_finanzas.md §2, "No entra" — el
sprint de patrimonio con snapshots históricos y gráfico de evolución). Esta
#11 fue el recorte chico: solo evitar que el ajuste ensucie los reportes, sin
guardar histórico de cuánto ganó/perdió cada mes. Eso sigue pendiente.

**Lo construido:**
- Migración `20260819060000_finanzas_cuentas_inversion.sql`: columna nueva en
  `fin_accounts`, `is_investment boolean not null default false`.
- [transactions/route.ts](../../app/api/finanzas/transactions/route.ts) (POST)
  y [transactions/[id]/route.ts](../../app/api/finanzas/transactions/%5Bid%5D/route.ts)
  (PATCH) dejan de asumir `'consumo'` siempre: si la cuenta de origen es
  `is_investment`, graban `flow_type: 'movimiento'` — el mismo mecanismo que ya
  usan los reembolsos y el cobro de deudas. Cero columnas nuevas en
  `fin_transactions`. El PATCH nunca *revierte* un `'movimiento'` existente a
  `'consumo'` (protege reembolsos y cobros editados desde el mismo endpoint).
- Toggle "Cuenta de inversión" en el formulario de
  [Cuentas](../../app/finanzas/screens/cuentas.tsx), mismo patrón que
  `archived`, con un badge en la fila y en el detalle.
- Aviso en el quick-add cuando la cuenta elegida es de inversión: "esto no
  cuenta como gasto/ingreso real del mes", antes de guardar.
- Escala sola a N cuentas: el flag vive en la cuenta, no hay que marcar nada
  cada vez que se carga un movimiento ahí.
- `flowTypeFor` / `flowTypeOnEdit` en
  [transactions.ts](../../lib/finanzas/transactions.ts), compartidas por el
  POST y el PATCH en vez de repetir la regla en cada ruta — y ahora con
  pruebas unitarias propias.
- [tx-row.tsx](../../app/finanzas/components/tx-row.tsx): un gasto/ingreso de
  inversión se distingue en Movimientos y en "Últimos movimientos" (Home) con
  el mismo tratamiento que ya tenía un reembolso — ícono propio (`IconChartLine`),
  "Inversión" en el subtítulo, y el campo en el detalle. Se decide por
  `account.is_investment` y no por `flow_type` solo, porque `flow_type =
  'movimiento'` en un `ingreso` tiene dos causas distintas (reembolso/cobro de
  deuda, o cuenta de inversión) y hay que poder distinguirlas; para un `gasto`
  la cuenta es la única causa posible, así que no hay ambigüedad.

#### Bug encontrado en la primera pasada, y corregido

El primer despliegue de esta feature (antes del testing dedicado) rechazaba
**todo** gasto y buena parte de los ingresos de una cuenta de inversión con
`"new row for relation fin_transactions violates check constraint
fin_tx_flow_shape"`. La constraint (`20260818040000_finanzas_compartidos.sql`)
solo contemplaba tres formas — transferencia, `ingreso` de reembolso sin
categoría, o consumo normal — y `(type = 'gasto', flow_type = 'movimiento')`
no encajaba en ninguna. Un `ingreso` de inversión CON categoría (el quick-add
sí deja elegir una) tampoco.

Arreglado en `20260819070000_finanzas_flow_shape_inversion.sql`: la constraint
ya no exige `category_id is null` para un `'movimiento'` — esa regla seguía
viva de todos modos en `/debts/settle`, que graba `category_id: null` él solo
sin depender de la base para eso.

#### Verificación

`npm run build` y `tsc --noEmit` limpios. Las tres suites de
`tests/finanzas/` en verde: `unit` (335/335, incluye 18 casos nuevos de
`flowTypeFor`/`flowTypeOnEdit`), `db` (104/104, incluye el default/toggle de
`is_investment`) y `api` (306/306, incluye el flujo completo contra el
endpoint real: gasto e ingreso de inversión excluidos de los totales del mes,
el saldo sí se mueve, y que sacar la cuenta de inversión de un movimiento ya
`'movimiento'` no lo degrada a consumo).

De paso, `unit.mjs` traía una suite entera rota desde antes (`currentUserId`
había salido de `snapshot.ts` hacia `lib/session-claims.ts` sin actualizar el
test) — quedó corregida para poder correr esta verificación.

### 7.2 Feature 11.1 — "Actualizar valor" separado de Gasto/Ingreso (construido el 2026-08-20)

La 11 (§7.1) resolvió que un ajuste de cuenta de inversión no ensuciara los
reportes, pero lo seguía haciendo entrar por Gasto/Ingreso: el usuario tenía
que restar mentalmente cuánto valía antes, elegir el signo correcto y cargar
un delta — una resta disfrazada de "registrar un movimiento con dirección".
Esta vuelta separa el mecanismo (que no cambia) de la puerta de entrada.

**Dos superficies en vez de una:**
- **QuickAdd** (gasto/ingreso/transferencia) deja de listar cuentas
  `is_investment` en el picker de cuenta para Gasto e Ingreso — directamente no
  aparecen como opción, así que el aviso de texto que tenía la 11 ("esto no
  cuenta como gasto/ingreso real del mes") ya no hace falta y se retira.
  Transferencia no cambia: las cuentas de inversión se siguen viendo, tanto de
  origen como de destino — aportar o retirar plata real de una inversión sigue
  siendo una transferencia legítima.
- **"Actualizar valor"** ([account-value-sheet.tsx](../../app/finanzas/components/account-value-sheet.tsx),
  con su contexto en [account-value-context.tsx](../../app/finanzas/components/account-value-context.tsx)):
  sheet nuevo y chico, sin selector de tipo, cuenta, categoría ni fecha. Un
  solo campo — "¿Cuánto hay en tu inversión hoy?" — precargado con el saldo
  actual de la cuenta, más una línea de diferencia en vivo (↑/↓, mismo
  verde/rojo semántico que `SignedAmount`). Al guardar arma el mismo `POST`
  de siempre contra `/api/finanzas/transactions` — `type: 'ingreso'|'gasto'`
  según el signo del delta, `date` siempre `todayISO()`, `flow_type` lo sigue
  decidiendo `flowTypeFor` en el server. Cero cambios de esquema.
- **Sin fecha editable, a propósito.** No es un registro histórico de una
  fecha puntual, es una foto de cuánto vale la inversión ahora — así que
  siempre queda fechada hoy, sin picker. Encaja con que el saldo de
  referencia contra el que se mide el cambio también es siempre el de hoy
  (el saldo de una cuenta es una suma acumulada sin orden, no algo
  reconstruible por fecha).
- **Dos puntos de entrada**: el ⋮ de la cuenta en
  [cuentas.tsx](../../app/finanzas/screens/cuentas.tsx) (`AccountRow`), y un
  tercer botón junto a Editar/Eliminar en su `DetailSheet`. Para lo segundo,
  [DetailSheet](../../app/finanzas/components/detail-sheet.tsx) — compartido
  con Movimientos, Deudas y Fijos — ganó un `extraAction` genérico (label +
  ícono + onClick) en vez de hardcodear "Actualizar valor" en un componente
  que a las otras tres pantallas no les significa nada.
- **No aparece en Movimientos ni en "Últimos movimientos" de la Home.**
  Decisión explícita: una actualización de valor no es un movimiento de
  cuentas, es un ajuste del valor de una cuenta — no tiene nada que hacer en
  una lista de movimientos. `loadTransactions()`
  ([load.ts](../../lib/finanzas/load.ts)) la excluye del array que devuelve
  (los totales del mes ya la excluían de antes, por `flow_type`; esto además
  la saca de la lista visible). Sigue siendo, por debajo, la misma fila de
  `fin_transactions` que ya movía el saldo — nada cambia en cómo se calcula
  `balance`.
- **Sin modo edición.** Como consecuencia directa de lo anterior: si nunca
  aparece en ninguna lista, no hay desde dónde tocarla para editarla o
  borrarla. El sheet quedó simplificado a un único modo, "alta nueva" —
  se sacaron `editing`, el botón Eliminar, y el ruteo que decidía a qué
  sheet mandar "Editar" (`useEditTransaction`, ya no existe). Corregir una
  actualización pasada es volver a abrir "Actualizar valor" con el número
  correcto de hoy, que registra un ajuste nuevo en vez de tocar el viejo.
  `isInvestmentAdjustment()` ([transactions.ts](../../lib/finanzas/transactions.ts))
  sigue existiendo — la sigue usando `TxRow` para el ícono/subtítulo y ahora
  también `loadTransactions` para el filtro — pero en la práctica una
  actualización de valor ya no vuelve a pasar por `TxRow`.
- **Disponible desde el día 1**: sin movimientos todavía, la referencia es
  `initial_balance`.
- **Se permite cargar $0 o negativo** como valor actual (inversión liquidada,
  cuenta apalancada en rojo). Guardar solo se deshabilita cuando el delta da
  exactamente 0 — el valor tipeado coincide con el de referencia, no hay nada
  que registrar.
- **El toggle "Cuenta de inversión" directamente no se ofrece** en el form de
  Cuentas una vez que la cuenta ya tiene alguna actualización de valor
  registrada — antes se dejaba destildar y se rechazaba recién al guardar
  (409); ahora el control se reemplaza por un indicador fijo, no interactivo
  ([cuentas.tsx](../../app/finanzas/screens/cuentas.tsx)). El dato sale de
  `has_value_updates`, un flag nuevo en `AccountWithBalance`
  ([types.ts](../../lib/finanzas/types.ts)) que `loadAccounts()` calcula con
  el mismo criterio de `isInvestmentAdjustment` sobre los movimientos que ya
  trae para el saldo — sin viaje extra a la base. El **PATCH sigue
  rechazando con 409** si de todos modos llega un intento de desmarcarla
  (misma regla de antes, mismo patrón que bloquea cambiar la moneda de una
  cuenta con movimientos) — la UI ya no ofrece el camino, pero la ruta sigue
  validando en el server como defensa en profundidad, no confiando solo en
  que el cliente no mande el campo. No→Sí queda libre siempre: no genera
  mezcla de historia, y de ahí en más solo entra por "Actualizar valor". El
  gatillo es específico — al menos un gasto/ingreso con `flow_type:
  'movimiento'` en esa cuenta — no "tiene movimientos" en general, para no
  bloquear una cuenta que solo recibió transferencias.
- **Eliminar cuentas no cambia.** `fin_transactions.account_id` es
  `on delete restrict`: cualquier cuenta con movimientos —de inversión o
  no— ya rechazaba el borrado antes de esta feature, sin importar el saldo.
  Se evaluó permitir borrar una inversión en $0, pero saldo $0 no implica cero
  filas (aportar y retirar el mismo monto deja 2 transferencias que además
  son parte del historial de la OTRA cuenta), así que la salida sigue siendo
  archivar — reversible, sin arriesgar el historial ajeno.

**Bug de paso, encontrado al pensar el caso de saldo negativo:** `assertBalance`
([load.ts](../../lib/finanzas/load.ts)) rechazaba cualquier `gasto` que dejara
el saldo de la cuenta en negativo, sin excepción — la misma regla que impide
gastar más efectivo del que hay en una cuenta normal. Eso ya bloqueaba,
silenciosamente, un ajuste de valor a la baja que llevara a una cuenta de
inversión por debajo de $0 desde el día de la 11, no algo nuevo de esta
vuelta. Corregido: la cuenta sigue necesitando saldo real para una
*transferencia* que sale de ella (inversión o no — no se puede retirar más de
lo que vale), pero un `gasto` en una cuenta `is_investment` ya no pasa por
ese guard, porque no es plata saliendo, es el mercado moviendo el número.

#### Verificación

`npm run build` y `tsc --noEmit` limpios. Las tres suites de
`tests/finanzas/` en verde: `unit` (363/363), `db` (104/104, sin cambios de
esquema en toda la vuelta — nada que migrar) y `api` (357/357).

Casos nuevos cubiertos: `isInvestmentAdjustment` (unit); `valueUpdateDelta`
con BTC de 8 decimales, cero, negativo y modo edición — la función sigue
soportando `editing` aunque la UI ya no lo use, por si un futuro historial lo
necesita (unit); un gasto de inversión SÍ puede dejar el saldo en negativo, y
una transferencia desde una cuenta de inversión en rojo lo sigue rechazando
(api); el toggle se bloquea con una actualización de valor cargada y se
libera sin ella, y una cuenta que solo recibió transferencias no queda
bloqueada (api); una actualización de valor no aparece en la lista de
`GET /transactions` aunque esté dentro del rango pedido, y `has_value_updates`
prende y apaga correctamente en `GET /accounts` (api).

**Bugs encontrados en la revisión posterior y corregidos antes de este
cierre**, ninguno alcanzado por el uso normal hasta ahí:
- `account-value-sheet.tsx` calculaba la diferencia con `round2` (fijo a 2
  decimales) en vez de `roundFor` (precisión según la moneda) — en una
  cuenta de inversión en BTC esto habría destruido la magnitud de un ajuste
  chico. Corregido extrayendo el cálculo a `valueUpdateDelta()`, que sí usa
  `roundFor`.
- Dos efectos de `quick-add.tsx` (el que resetea la cuenta elegida al
  cambiar de tipo, y el que completa una cuenta por defecto cuando las
  cuentas llegan tarde) no tenían guardia contra modo edición: en un primer
  render en frío editando un movimiento cuya cuenta ya es de inversión,
  podían pisar la cuenta correcta con un default equivocado. Ambos ahora se
  saltan explícitamente mientras se está editando.
- Editar un gasto/ingreso viejo, de antes de que su cuenta se marcara como
  inversión, dejaba el chip de cuenta sin ningún elegido en el picker (el
  filtro nuevo la sacaba de las opciones visibles). La cuenta ya elegida
  ahora se mantiene visible aunque el filtro normalmente la excluya.
- Se actualizó además un comentario de test de la 11 que documentaba, como
  intencional, una restricción que la decisión §4 revierte a propósito (que
  un gasto de inversión respetara la regla dura de saldo) — quedaba
  desactualizado frente a permitir valores negativos.
