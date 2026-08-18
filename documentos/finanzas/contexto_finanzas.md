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
| Gastos compartidos | Se registra el **bruto**; los reembolsos son movimientos aparte. Detalle **por persona**. Aplica a cualquier gasto, no solo suscripciones |
| Pasanaku | Modelo completo: participantes, rondas, turno, fechas esperadas |
| Alertas | Panel in-app + email para las importantes (Resend, ya integrado) |
| Apple Wallet con push | Descartado por completo |
| Gráficas | SVG propio, sin agregar librería |
| Metodología | Sprints por **feature**, cada uno una versión usable de la app |

---

## 5. Preguntas abiertas

Ninguna bloquea el Sprint 1, pero hay que resolverlas antes de los sprints que
las tocan:

1. **Última cuota de la deuda:** ¿$57 o son 10 cuotas de $100 ($1.000)?
   → *Bloquea el sprint de "Dinero por cobrar".*
2. ~~**Compartidos en bruto o neto.**~~ **Resuelto el 2026-08-18: bruto +
   reembolsos + neto.** El gasto se registra completo (lo que sale del bolsillo)
   y las tres cifras existen en la app. Además: seguimiento **por persona**, y
   el mecanismo sirve para **cualquier** gasto compartido, no solo las dos
   suscripciones. → *Especificado en `sprint_2_compartidos.md`.*
3. **Tipo de cambio para el pasanaku:** ¿a qué tasa se valúan los 300 Bs — la
   oficial, la paralela, o la del día de cada aporte?
   → *Parcialmente resuelto en Sprint 1: tasa manual editable.*
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
| 2 | Compartidos y reembolsos | Spotify, TradingView | ✅ Construido |
| 3 | **Fijos** (era la 8) | Spotify, TradingView, alquiler | ✅ Construido |
| 3b | Dinero por cobrar | Las cuotas de los $957 | ⏸ Bloqueado por la pregunta #1 |
| 4 | Pasanaku | Los 300 Bs mensuales | — |
| 5 | Presupuesto mensual | Requiere historial del 1 | — |
| 6 | Reportes | Requiere 2–5 | — |
| 7 | Objetivos y bolsillos | Requiere 5, 6 | — |
| 8 | ~~Recurrentes / suscripciones~~ → **adelantado al 3** | Requiere 2 | ✅ Construido |
| 9 | Fondo de crecimiento y ROI | Requiere 1 | — |
| 11 | Alertas | Requiere 5, 8 | — |

Los tres primeros después de Movimientos (compartidos, por cobrar, pasanaku) son
cosas que **ya le están pasando cada mes**. Por eso van antes que presupuesto y
reportes, que necesitan meses de datos acumulados para valer algo.
