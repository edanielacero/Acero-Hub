# Finanzas — Documento de Contexto

> Este documento **no** es un plan de desarrollo. Es el retrato de la realidad
> financiera que la mini-app tiene que representar, más las decisiones de
> producto ya cerradas y las lecciones del intento anterior. El plan de
> construcción vive en `documento_maestro_finanzas.md`.
>
> Última actualización: 2026-08-27 (§4, §7 y §7.4: se congelan Reportes,
> Fondo de crecimiento y Reglas; entra Perfiles como próximo sprint)

---

## 1. Qué es la mini-app

Mini-app **personal** de finanzas dentro de Acero Hub, en `/finanzas`.

- **Un solo usuario: el admin (Daniel).** No se comparte con nadie, no hay
  colaboradores, no hay vistas de "otro usuario". Cualquier feature que
  implique compartir datos está fuera de alcance por definición.
- **Un usuario, varios perfiles** (Sprint 8, 2026-08-27): el
  mismo usuario puede tener **cuantos perfiles quiera** —personales, de una
  empresa, de un proyecto— con finanzas completamente aisladas entre sí, cada
  uno con su propio patrimonio y su propio color. Sigue sin haber
  colaboradores: los perfiles no se comparten, son cajones separados del mismo
  dueño. → *§7.4*.
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

> **Cómo quedó implementado (Sprint 7, revisado el 2026-08-26).** La intuición
> de arriba resultó ser la correcta, y el camino para llegar ahí fue largo.
>
> El sprint arrancó con lo opuesto —**cuentas dedicadas** al ahorro, un flag
> `is_savings` que las marcaba— y al usarlo se rompió por todos lados: obligaba
> a justificar cualquier gasto que saliera de esa cuenta, perdía ingresos del
> reporte del mes, y ataba un plan de ahorro a una billetera física.
>
> El flag se **eliminó**. Hoy es exactamente lo que dice este párrafo: una
> separación conceptual sobre las mismas cuentas de siempre. Cualquier cuenta
> tiene una **sección de saldo usable** y una **sección de ahorro**, las dos
> derivadas de los movimientos; y un plan de ahorro puede tener plata repartida
> en varias cuentas. Ver §3.2 del documento maestro y `sprint_7_ahorro.md` §0.8.

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
| Perfiles | **Sin tipos y sin límite** (2026-08-27). Un perfil `default` indeleble más los que crees desde Ajustes; lo que los distingue es el **nombre** y el **color de acento**, no un enum. Cada perfil tiene su propio patrimonio, **sin total consolidado**. → *§7.4* |
| Movimientos entre perfiles | **No se mueven.** Si se registró en el equivocado, se borra y se vuelve a cargar → *§7.4* |
| Import CSV de banco/exchange | **Nunca.** Entrada 100% manual |
| Auto-categorización | Reglas simples por palabra clave, editables. Sin IA en v1 |
| Suscripciones recurrentes | Solo **recuerdan**. Nunca se auto-postea un gasto |
| Reparto por encima del costo | **Permitido.** Cobrar de más y ganar la diferencia es una decisión válida; tu parte queda negativa y se llama ganancia |
| Fijos vs. compartidos | Son atributos **independientes**. Un solo módulo de fijos donde el reparto es opcional, no dos módulos |
| Deuda vs. compartido | **Conceptos distintos.** Compartido = responsabilidad recurrente sobre un servicio, atributo del fijo. Deuda = alguien te debe plata por lo que sea, entidad propia sin gasto padre obligatorio |
| Gastos compartidos | Se registra el **bruto**; los reembolsos son movimientos aparte. Detalle **por persona**. Aplica a cualquier gasto, no solo suscripciones |
| Pasanaku | **Personal, no de grupo** (revisado 2026-08-21): sin participantes ni rondas ajenas. Solo tu lado — aporte, puestos totales, tu puesto. La fecha de tu turno se deriva, no se pregunta. → *Especificado en `sprint_5_pasanaku.md`* |
| Notificaciones | **Push del navegador** (2026-08-27), con un switch por tipo de aviso y otro por perfil. Se evaluó email + panel in-app y se descartó. Programadas con `pg_cron` dentro de Supabase, no con el cron de Vercel → *`sprint_9_notificaciones.md`* |
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
4. ~~**Reparto de los extraordinarios:** ¿se fija el 40/30/20/10 o se decide
   cuota por cuota?~~ **Resuelto el 2026-08-26: las dos cosas, y en ese orden.**
   Cada plan de ahorro guarda su regla —monto fijo o porcentaje del sobrante— y
   un **cajón de sastre** se lleva lo que ninguna regla asignó, así que nunca
   queda plata sin destino. Pero la regla **nunca se aplica sola**: al terminar
   el mes, cada plan muestra lo que le tocaría y vos confirmás plan por plan,
   pudiendo cambiar el monto. La regla propone; la decisión es tuya cada mes.
   → *Especificado en `sprint_7_ahorro.md` §4.3 y §4.13.*
5. **Confirmar saldos actuales** de las 6 cuentas antes de cargarlas.
   → *Bloquea la carga inicial del Sprint 1 (no el desarrollo).*
6. ~~**Perfiles (feature #13):** cuántos, qué queda global, si hay vista
   consolidada, si se borran, si se mueven movimientos, qué recuerda el cambio
   y cómo migra lo existente.~~ **Resuelto el 2026-08-27**, las ocho preguntas.
   → *Todo cerrado en §7.4; el Sprint 8 está listo para especificarse.*

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

### Construido

| # | Feature | Qué desbloquea | Estado |
|---|---|---|---|
| 1 | **Movimientos y Cuentas** — registrar, saldo derivado, multi-moneda con tasa congelada | Todo lo demás | ✅ `documento_maestro_finanzas.md` |
| 2 | **Deudas** (era "compartidos") | Lo que te deben, venga de donde venga | ✅ `sprint_2_compartidos.md` |
| 3 | **Fijos** | Alquiler, Spotify, TradingView — y desde el Sprint 7, también los fijos de ahorro | ✅ `sprint_3_fijos.md` |
| 4 | **Planes de pago** | Calendario de cuotas sobre cualquier deuda, con o sin interés | ✅ `sprint_4_planes_de_pago.md` |
| 5 | **Pasanaku** | Los 300 Bs mensuales — recortado a tracker personal | ✅ `sprint_5_pasanaku.md` |
| 6 | **Presupuesto mensual** | Cuánto queda por gastar, por categoría y en general | ✅ `sprint_6_presupuesto.md` |
| 7 | **Ahorro** | Apartar el sobrante del mes en planes con reparto propio, sin cuentas dedicadas | ✅ `sprint_7_ahorro.md` |
| 11 | **Cuentas de inversión** | Ajustar su valor sin que cuente como gasto/ingreso real | ✅ §7.1 de este documento |

### Por construir (orden vigente al 2026-08-27)

| Orden | # | Feature | Qué desbloquea | Estado |
|---|---|---|---|---|
| **Sprint 8** | 13 | **Perfiles** | N cajones de finanzas aislados —patrimonio, movimientos y categorías propios— dentro de la misma cuenta | ✅ **Construido** (2026-08-27) · `sprint_8_perfiles.md` |
| Sprint 9 | 10 | **Notificaciones** (era "Alertas") | Push del navegador: fijo por vencer, presupuesto al límite, mes por organizar, deuda vieja, y recordar anotar | ✅ **Construido** (2026-08-27) · `sprint_9_notificaciones.md` |

### Congelados (2026-08-27)

Fuera de alcance **por ahora**, por decisión del usuario. No están descartados
—la especificación de cada uno sigue valiendo si vuelven— pero no se planifican
ni se usan como argumento para diseñar nada nuevo.

| # | Feature | Por qué existía | Estado |
|---|---|---|---|
| 8 | **Reportes** | Ver la evolución: en qué se va la plata mes a mes, tendencias, comparar períodos | ⏸️ Congelado |
| 9 | **Fondo de crecimiento y ROI** | Distinguir el ahorro que *trabaja* del que solo espera. Se apoyaba en el #7 | ⏸️ Congelado |
| 12 | **Reglas y automatismos** | "Cada vez que entre el sueldo, aparta X" | ⏸️ Congelado |

> **Los números no se renumeran.** Los sprints 2, 3, 4, 6 y 7 tienen secciones
> de "qué desbloquea" que apuntan a `#8`, `#9`, `#10` y `#12` por número. Cambiar
> la numeración rompería esas referencias sin ganar nada, así que el orden de
> construcción vive en la columna **Orden**, no en la columna **#**. Perfiles
> entra como **#13** por ser el siguiente número libre.

Los tres primeros después de Movimientos (compartidos, por cobrar, pasanaku) son
cosas que **ya le están pasando cada mes**. Por eso fueron antes que presupuesto,
que necesita meses de datos acumulados para valer algo.

### 7.4 Feature #13 — Perfiles (construido el 2026-08-27)

**Construido el 2026-08-27**, mismo día en que se decidió. Todo lo que sigue
está cerrado y no hay que volver a preguntarlo. El detalle técnico —modelo,
migración, API, UI, checklist y las cinco desviaciones que salieron al
construir— está en `sprint_8_perfiles.md`.

#### Qué problema resuelve

Hoy la app tiene un solo cajón: el sueldo, el alquiler, el pasanaku y los
ahorros viven todos juntos. El usuario necesita **separar finanzas que no
tienen nada que ver entre sí** —las de una empresa, las de un proyecto— sin
mezclar los números, sin salir de la app y sin cambiar de cuenta.

#### El modelo

| Tema | Decisión |
|---|---|
| **Sin tipos** | No hay "personal" ni "empresa" como tipo. Se evaluó y **se descartó**: los dos se comportarían idénticamente, y una columna `type` con dos valores que no se diferencian en nada solo invita a bifurcar lógica sin una decisión detrás. Lo que distingue a un perfil es su **nombre** y su **color**, no un enum |
| **Cuántos** | **Sin límite.** El costo de código de 1 vs. N es el mismo; un tope solo sería un número que después hay que sacar |
| **El default** | Uno y solo uno, marcado con `is_default`. **No se borra ni se archiva nunca.** Es donde cae todo lo que ya existe. Se llama **como el usuario** (su nombre de pila), no "Personal", y se puede renombrar |
| **Usuario nuevo** | Al entrar por primera vez a la mini-app, se le crea su perfil default solo. Nunca hay un usuario sin perfil |
| **Cómo nace uno nuevo** | Se crea a mano desde **Ajustes**. Nace con las **categorías semilla** sembradas y **nada más**: sin cuentas, sin movimientos, sin personas, sin fijos, sin ahorros |
| **Renombrar** | **Sí, todos, incluido el default.** Indeleble no es lo mismo que inmutable: quizá el default se llama "Daniel" y no "Personal" |
| **Color** | Cada perfil tiene su propio acento — ver *El acento por perfil*, abajo |

Forma de la tabla: `fin_profiles(id, user_id, name, accent, is_default,
archived, sort_order, created_at)`. Sin `type`.

#### Qué es del perfil y qué es global

De las **20 tablas `fin_*`** vivas, casi todas pasan a ser del perfil. Solo tres
quedan afuera:

| Alcance | Tablas | Por qué |
|---|---|---|
| **Del perfil** | `fin_accounts`, `fin_transactions`, `fin_categories`, `fin_people`, `fin_debts`, `fin_debt_plans`, `fin_recurring`, `fin_recurring_splits`, `fin_pasanaku`, `fin_pasanaku_historico`, `fin_budget_periods`, `fin_budget_lines`, `fin_budget_line_categories`, `fin_budget_extensions`, `fin_budget_closures`, `fin_savings_goals`, `fin_savings_closures` | Todo lo que es "cuánto tengo, cuánto gasté, quién me debe" es exactamente lo que se quiere aislar |
| **Global** | `fin_rates`, `fin_quotes` | La tasa del día y las cotizaciones de mercado son **hechos del mundo**, no de un cajón. Duplicarlas significaría que el mismo día un perfil muestra Bs a 6,96 y el otro a 7,20 |
| **Global** | `fin_settings` | Hoy es esencialmente la tasa. Si algún día guarda preferencias de UI, se parte ahí |

Dos que se discutieron y **quedaron del perfil**:

- **`fin_categories`.** Las categorías de una empresa no se parecen a las
  personales. Si fueran globales, el picker del quick-add de cada perfil se
  llenaría de ruido irrelevante y Presupuesto —que es por categoría— heredaría
  ese ruido. El costo aceptado: si querés la misma categoría en dos perfiles,
  la creás dos veces.
- **`fin_people`.** Se propuso dejarlas globales (una persona es la misma
  persona con cualquier sombrero) y el usuario decidió lo contrario: **por
  perfil, para aislar de verdad.** El costo aceptado: si la misma persona te
  debe plata en dos perfiles, existe dos veces y sus deudas no se suman.

`fin_asset_valuations` no necesita `profile_id`: cuelga de `fin_accounts` y
hereda el perfil por su FK. Lo mismo las tablas hijas de presupuesto y deudas.

#### Patrimonio: aislado, y sin consolidado

`patrimonio = Σ saldo(cuenta)` (§4.3 del maestro) y `saldo(cuenta)` se deriva de
los movimientos de esa cuenta (§4.2). Como **la cuenta pertenece a un perfil**,
el aislamiento sale solo: patrimonio, gasto del mes, sobrante, presupuesto,
piso de ahorro y deudas quedan separados sin un solo caso especial.

**Se evaluó el patrimonio compartido y se descartó**, por tres razones:

1. *"El saldo de este perfil"* sería una ficción. Si una cuenta tiene $500 con
   movimientos de dos perfiles, la plata es fungible: no hay $200 que sean "de
   la empresa" salvo que se declare por fuera.
2. **Rompería el piso de ahorro** (Sprint 7 §4.11), que valida cada gasto
   contra el saldo de la cuenta. ¿Contra cuál — el total, el del perfil? Con
   cuentas compartidas se podría gastar la plata de un perfil desde otro.
3. **Ya se construyó y se tiró.** La migración
   `20260813000000_finanzas_profiles.sql` del intento anterior (§6) decía
   textualmente *"separar entre distintos sombreros **sin dividir el
   patrimonio, que sigue compartido**"* — `profile_id` nullable solo en
   transacciones, o sea una etiqueta. Duró cuatro días.

**Sin total consolidado.** Se propuso mostrar la suma de todos los perfiles en
el selector y el usuario lo rechazó: el hero de cada Home muestra el patrimonio
de **su** perfil y nada más. *"Quiero saber cómo va cada perfil aislado."* Si
hace falta el total, se suma mentalmente.

**El costo aceptado:** si la plata de dos perfiles vive físicamente en la misma
cuenta bancaria, hay que crear la cuenta dos veces y repartir el saldo a mano. Y
mover plata entre perfiles son dos registros —un gasto en uno, un ingreso en el
otro—, que es lo que pasa de verdad entre dos entidades distintas.

#### Borrado y archivado

Copia exacta de la regla que la app ya aplica a las cuentas (§4.5 del maestro):

- **Perfil sin movimientos** → se borra de verdad.
- **Perfil con movimientos** → **no se borra, se archiva.** Sale del selector;
  sus datos quedan intactos y se puede reactivar.
- **El default** → ni una cosa ni la otra, nunca.
- Si se archiva el perfil activo, la app salta al default.

Por qué no un cascade: borrar un perfil con historia sería la acción más
destructiva de toda la app —N cuentas por meses de carga manual—, y esta app se
define por la entrada 100% manual (§1). Hoy borrar *una* cuenta con movimientos
devuelve 409 justamente para evitar eso. Sumado a que los movimientos no se
mueven entre perfiles, un borrado equivocado no se desharía de ninguna forma.

Un "vaciar y borrar" en dos pasos desde el perfil ya archivado es fácil de
agregar después. **No entra en el Sprint 8.**

#### Los movimientos no se mueven entre perfiles

Decidido: no existe "cambiar este movimiento de perfil". Si se registró en el
equivocado, se borra y se vuelve a cargar.

**Consecuencia que hay que tener presente al diseñar la UI:** registrar en el
perfil equivocado es el único error irreversible que introduce este sprint. Por
eso el acento de color y el nombre del perfil en el quick-add no son adorno.

#### El acento por perfil

Cada perfil tiene su propio color de acento, y eso es lo que responde *"¿en qué
perfil estoy?"* desde cualquier pantalla.

**Es barato:** hay 88 usos de `--fz-accent` en 25 archivos y **todos leen el
token** —ninguno tiene un hex escrito a mano—, la app no tiene modo oscuro y
todos los tokens cuelgan de `#fz-root` (`theme.css:23`). Cambiar de perfil es
sobrescribir unas variables CSS en el nodo raíz, sin tocar un solo componente.
Se aplica **global**, no solo al hero y a los botones: así tiñe también la tab
bar activa, los focus rings y los sheets.

**No es un color, es un set de 4–5 tokens:** `--fz-accent`,
`--fz-accent-press`, `--fz-accent-tint` y `--fz-glass-pill` (el acento al 10%
de la píldora del tab bar). Cambiar solo el primero deja los otros en verde y se
ve sucio. Falta decidir al implementar si `--fz-lime` —la contraparte del
acento sobre el hero oscuro, de uso escaso— también cambia por perfil.

**El azul está reservado: significa ahorro.** El sistema ya tiene cuatro colores
con significado fijo —verde marca, verde ingreso, guindo gasto, azul ahorro— y
el acento de perfil tiene que esquivar los cuatro. El azul se eligió en la
Ronda 9 del Sprint 7 precisamente porque *"con el verde de la marca el botón
'Ahorrar' se confundía con cualquier acción primaria"* (comentario en
`theme.css`). Un perfil con acento azul recrearía ese mismo bug.

| Perfil | Acento |
|---|---|
| 1 (default) | **Verde bosque** `#16613C` — es la marca, se queda |
| 2 | **Naranja tipo Claude** |
| 3 | **Violeta** |
| 4 | **Magenta o teal oscuro** (teal roza el verde: confirmar el hex al elegirlo) |
| 5+ | Se **reciclan** las paletas. Nadie va a llegar ahí, y si llega, el perfil funciona igual: solo repite color |
| — | ~~Azul~~ **reservado para ahorro** |

**El color se guarda en el perfil, no se deriva del orden** (columna `accent`).
Se asigna solo al crear —la siguiente paleta libre— y se puede cambiar después.
Si dependiera de la posición, borrar el perfil 2 recolorearía al 3 de golpe, y
el perfil al que ya tenías el ojo entrenado cambiaría de color: exactamente lo
que provoca registrar en el lugar equivocado.

#### Cómo se cambia de perfil

- **Un ícono de perfil en el header del Home**, al lado del engranaje — que hoy
  convive ahí con el toggle del ojo (`home.tsx:224-236`).
- **Solo aparece si hay 2 o más perfiles.** Con uno solo no hay nada que elegir.
- **El perfil activo se recuerda por dispositivo** (`localStorage`): cambiarlo
  en el celular no debe cambiarlo en la computadora. Además evita un viaje al
  servidor por navegación.
- **El perfil NO viaja en la URL.** Finanzas es una sola ruta `[[...slug]]` con
  router de cliente; meterlo ahí obligaría a reescribir el router y a resolver
  qué pasa al abrir el link de un perfil archivado, a cambio de nada — es una
  app de un solo usuario que no comparte links.
- **El nombre del perfil aparece en el header del quick-add.** Una línea de
  texto chica, no un selector: cubre el caso de mirar la pantalla sin registrar
  el color, y el quick-add se abre desde cualquier pantalla.

#### Migración de lo que ya existe

**Todo lo construido y cargado hasta hoy —los 7 sprints— cae en el perfil
default.** Ningún dato se toca ni se reasigna; se crea el perfil default y todo
lo existente pasa a apuntarle.

#### Qué NO entra

- **Compartir un perfil con otra persona.** Sigue habiendo un solo usuario
  (§1): los perfiles son cajones del mismo dueño, no colaboración.
- **Total consolidado** entre perfiles (rechazado explícitamente, arriba).
- **Mover movimientos** entre perfiles.
- **Borrado duro de un perfil con historia.**
- **Comparativas entre perfiles**, si algún día llegan: eso es Reportes, hoy
  congelado.

#### Preguntas abiertas

**Ninguna.** El sprint está especificado en `sprint_8_perfiles.md`.

Una sola nota de dependencia, que no bloquea nada: **Alertas (Sprint 9) va a
tener que decir de qué perfil es cada aviso.**

---

### 7.3 Feature #7 — Ahorro (construido el 2026-08-24, rediseñado hasta el 26/8)

El usuario pidió, en conversación, poder **apartar el sobrante del mes** en
varios planes de ahorro, cada uno con su propia distribución. Se especificó y
construyó el mismo día; después vinieron **nueve rondas de uso real** que lo
dieron vuelta casi entero. Lo que quedó:

**El modelo**

- **Ninguna cuenta "es de ahorro".** Existió un flag `is_savings` entre el 24 y
  el 26 de agosto y se eliminó. Toda cuenta tiene una sección de saldo usable y
  una de ahorro, las dos derivadas.
- **Un movimiento es de ahorro porque vos lo dijiste** (`savings_goal_id`
  puesto a mano), y cruza en la dirección que declaraste (`savings_flow`:
  `aporte`, `retiro` o `traslado`). Nunca se infiere de dónde cae la plata ni
  de qué campo quedó vacío.
- **El saldo de un plan es derivado**, igual que el de una cuenta, y es
  exactamente la suma de lo apartado en cada cuenta.

**Cómo se usa**

| Acción | Dónde vive | Por qué |
|---|---|---|
| **Aportar** | un **fijo de ahorro**, o el botón **Ahorrar** de cada plan al terminar el mes | Es una decisión de plan, periódica |
| **Retirar** | el **gasto** que rompe el ahorro, en Movimientos | Pasa en el momento y sin plan; pide justificativo |
| **Trasladar** | *"Mover de cuenta"* en Ahorros | Ni gasto ni ingreso: la misma plata en otra billetera |

- **El piso de ahorro**: un movimiento común nunca puede gastar lo apartado.
  Aplica en los cinco caminos que sacan plata de una cuenta, no solo en el
  quick-add.
- **El reparto es plan por plan**, no un trámite mensual global. Cada card
  tiene su botón, se apaga cuando ese mes ya se guardó, y el detalle muestra
  una tabla mes a mes con check o guion.
- **Responde la pregunta abierta #4** (§5): el reparto es mixto (monto fijo o %
  por plan) pero se confirma cada mes, nunca se aplica ciego. Y el **cajón de
  sastre** se lleva lo que sobre, así que nunca queda plata "sin asignar".

El detalle completo, con las nueve rondas y los bugs que encontró cada una,
está en `sprint_7_ahorro.md`.

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
