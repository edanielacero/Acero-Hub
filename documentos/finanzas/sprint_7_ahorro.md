# Finanzas — Sprint 7: "Ahorro"

> Contexto financiero y de producto: `contexto_finanzas.md` (§7.3 tiene el
> resumen de por qué este sprint se adelantó y reemplaza a "Objetivos y
> bolsillos").
> Dirección visual: `contexto_ui_finanzas.md`.
> Sprints anteriores: `documento_maestro_finanzas.md` (1), `sprint_2_compartidos.md` (2),
> `sprint_3_fijos.md` (3), `sprint_4_planes_de_pago.md` (4), `sprint_5_pasanaku.md` (5),
> `sprint_6_presupuesto.md` (6).
>
> Este documento especifica **únicamente el Sprint 7** — lo suficiente para
> empezar a programar sin volver a decidir nada.
>
> Última actualización: 2026-08-24 · Estado: **construido y revisado**,
> 606/182/597 pruebas en verde (unit/db/api). Dos simplificaciones de
> implementación respecto de este documento (§0.2) y siete bugs corregidos
> en una revisión posterior (§8).

---

## 0. Preguntas que este sprint cierra

El roadmap (`contexto_finanzas.md` §7.3) solo tenía la idea suelta que trajo
el usuario en conversación. Todo lo demás se decidió en tres rondas
(2026-08-24):

### Ronda 1 — el modelo general

| Pregunta | Decisión |
|---|---|
| ¿Cómo se relacionan las cuentas dedicadas con los ahorros? | **Independientes.** Un ahorro es una entidad propia con su reparto; el usuario elige en qué cuenta(s) dedicada(s) vive la plata. Una cuenta puede alojar varios ahorros, y un ahorro puede tener plata repartida en más de una cuenta |
| ¿Cómo se calcula y se aporta el sobrante del mes? | **Automático, con confirmación.** Al cerrar el mes la app calcula el sobrante y arma la transferencia repartida entre ahorros; el usuario confirma o ajusta antes de que se registre |
| ¿El reparto entre ahorros es fijo o se decide cada vez? (pregunta abierta #4 del roadmap) | **Mixto**, y se confirma cada mes: cada ahorro puede tener un monto fijo o un %, pero la propuesta final siempre pasa por la pantalla de confirmación mensual antes de convertirse en movimientos reales |
| ¿Qué tan estricta es la regla de "ahí no entra/sale nada que no sea ahorro"? | **Blanda** en cuanto a *poder* mover plata: no hay confirmación, ni tope propio, ni la cuenta desaparece del picker. Pero el **justificativo sí es obligatorio** y el servidor lo exige (§4.10, corregido el 26/8) — es lo que se pidió al abrir el sprint |

### Ronda 2 — comportamiento fino

| Pregunta | Decisión |
|---|---|
| ¿Un retiro de un ahorro cuenta como gasto real? | **Depende de a dónde va.** Si es una transferencia a otra cuenta propia, es movimiento financiero (no ensucia Presupuesto/Reportes). Si en el mismo momento se marca como gastado, cuenta como gasto real |
| ¿Los ahorros tienen meta? | **Meta opcional** (monto, y fecha opcional) |
| ¿Qué pasa si los ahorros con monto fijo no alcanzan con el sobrante del mes? | **La app pregunta qué hacer** — no decide sola ni prioriza ni prorratea automáticamente |
| ¿Dónde vive Ahorro en la navegación? | **Pantalla propia en "Más"** — no ocupa una ranura de la tab bar, no vive dentro de Presupuesto |

### Ronda 3 — detalles finos

| Pregunta | Decisión |
|---|---|
| ¿Cómo se captura el justificativo de un retiro? | **Categorías + texto opcional**: `emergencia`, `meta_cumplida`, `cambio_planes`, `otro`, con un campo de descripción libre además |
| ¿En qué moneda vive el monto de un ahorro? | **Cada ahorro elige su moneda** — mismo patrón que quedó en Presupuesto tras su rediseño (`input_currency` propia, ver `sprint_6_presupuesto.md` §0.3) |
| ¿Qué pasa si el mes cierra con sobrante negativo? | **Igual pregunta**: "cerraste en rojo, ¿retirás de algún ahorro para cubrirlo o lo dejás así?" — mismo trato que un mes en rojo en el cierre de Presupuesto |
| ¿El reparto de un ahorro se puede editar después de creado? | **Editable siempre**, efectivo desde el próximo cierre — no hay `retroactive` como en Presupuesto porque no hay nada que recalcular hacia atrás |

### 0.1 Decisiones de implementación que tomé yo

No se le preguntaron al usuario porque son mecánica interna, no producto —
mismo espíritu que el §0.2 de `sprint_6_presupuesto.md`:

1. **El saldo de un ahorro es derivado, nunca guardado.** Se calcula sumando
   sus propios movimientos (aportes − retiros, en USD con la tasa que cada
   uno congeló), sin importar en qué cuenta dedicada haya caído la plata
   físicamente. Mismo principio que el saldo de una cuenta (Sprint 1 §4.2) y
   que "disponible" en Presupuesto — nunca una columna que se pueda
   desincronizar de su historial.
2. **Una transferencia entre dos cuentas de ahorro no afecta a ningún
   ahorro.** Es solo reacomodar en qué billetera física vive la plata del
   ahorro en general; no lleva `savings_goal_id`. Si en el futuro hace falta
   "mover la plata de un ahorro específico de una cuenta a otra", se hace
   con un retiro + un aporte, cada uno tageado — dos movimientos, no uno.
3. **Un ahorro con meta cumplida se excluye de la propuesta automática de
   reparto**, tanto si es de monto fijo como de %, y muestra un badge "🎉
   Meta cumplida". No se bloquea: el usuario puede seguir aportando a mano
   desde el quick-add si quiere pasarse de la meta.
4. **`fin_accounts.is_savings` y `is_investment` son mutuamente
   excluyentes.** Una cuenta no puede ser las dos cosas — conceptualmente no
   tiene sentido (una es "no cuenta como gasto/ingreso porque el mercado se
   mueve solo", la otra es "no cuenta porque es plata que ya aparté").
5. **El reparto por % no exige sumar 100 entre todos los ahorros.** Si suman
   menos, el resto lo absorbe el cajón de sastre (§0.4); sin ninguno marcado
   queda sin asignar y se muestra en la confirmación mensual. Si sumaran más
   de 100 tampoco se rechaza: la propuesta automática simplemente no va a
   alcanzar y el usuario ajusta a mano, mismo camino que "fijos sin fondos"
   (Ronda 2).

### 0.4 Ronda 4 — el sobrante no asignado (2026-08-24, post-construcción)

Al revisar qué pasaba cuando el sobrante cubría todos los ahorros y aún
sobraba, el usuario cerró dos decisiones que la spec original no tenía:

| Pregunta | Decisión |
|---|---|
| ¿Qué pasa con lo que el reparto no asigna? | **Un ahorro designado lo absorbe.** Se marca uno como "acá va lo que sobre" (`is_catchall`) y recibe todo el remanente, así se reparte el 100% del sobrante y "sin asignar" deja de existir en la práctica |
| Un fijo de $50 al que solo le faltan $20 para su meta, ¿cuánto recibe? | **Solo los $20.** El reparto automático nunca se pasa de la meta; pasarse sigue siendo posible a mano desde el quick-add (§4.7), donde el usuario lo decide explícitamente |

Tres consecuencias de diseño:

- **El cajón de sastre ignora su propia meta al recibir.** Es el único que lo
  hace, y a propósito: si la respetara volvería a quedar un remanente suelto,
  que es justo lo que vino a evitar. Su meta queda como referencia visual.
- **Tampoco lo excluye `goal_reached`.** El resto de los ahorros sale del
  reparto al cumplir su meta (§4.7); el cajón no, por la misma razón.
- **Como mucho uno activo por usuario**, garantizado por un índice único
  parcial. Marcar uno nuevo desmarca al anterior desde la API en vez de
  rebotar con el error crudo de Postgres — "que este reciba el resto" implica
  que el otro deja de hacerlo. Archivarlo libera el lugar, mismo criterio que
  `fin_budget_lines` con sus categorías.
- **Sin ningún cajón marcado, el comportamiento anterior sigue vigente**: el
  remanente queda en `unassignedUsd` y la pantalla explica que se queda en la
  cuenta sin etiquetar, con la sugerencia de marcar uno.

⚠️ **Aclaración que hubo que hacer explícita:** asignar plata a un ahorro **no
suma nada al patrimonio**. Un aporte es una transferencia entre dos cuentas
propias, y esas no mueven el patrimonio total (Sprint 1 §4.3). El sobrante sin
asignar ya estaba en el patrimonio; lo único que cambia al asignarlo es en qué
cuenta física vive y si queda etiquetado a un ahorro.

### 0.5 Ronda 5 — el fijo que aporta a un ahorro (2026-08-24)

El reparto mensual (§4.3) es **retrospectivo**: se ejecuta al cerrar el mes y
sale del sobrante. El usuario pidió lo contrario — *"pagarme a mí primero"*:
apartar $X el día que le toca, sin depender de que haya sobrado nada.

**Un fijo puede ser un aporte a un ahorro.** Con `savings_goal_id` +
`to_account_id`, registrar el fijo genera una **transferencia** tageada en vez
del gasto de siempre. Todo lo demás de Fijos se reusa tal cual: el día del mes,
pendiente/vencido, los meses atrasados que se recuperan de a uno, el sheet de
registrar, la idempotencia por período.

Es **un atributo opcional del fijo, no un módulo paralelo** — exactamente el
mismo criterio que ya rige para los compartidos (`contexto_finanzas.md` §4,
"Fijos vs. compartidos: un solo módulo de fijos donde el reparto es opcional,
no dos módulos").

| | Ahorro con reparto "Monto fijo" (§4.3) | Fijo de ahorro (§0.5) |
|---|---|---|
| Cuándo | Al cerrar el mes, retrospectivo | El día X del mes, prospectivo |
| De dónde sale | Del sobrante | De la cuenta, sin importar el sobrante |
| Mes en rojo | No aporta nada | Aporta igual |
| Cómo avisa | Pregunta al cerrar el mes | Pendiente/vencido durante el mes |

Los dos pueden convivir: no se excluyen, son dos disparadores distintos para
el mismo tipo de movimiento.

**Cuatro reglas de forma**, sostenidas por `fin_recurring_savings_shape`:

- `savings_goal_id` y `to_account_id` van **juntos o ninguno**: sin cuenta
  destino no hay transferencia posible, y sin ahorro el aporte no sabría a qué
  corresponde.
- **No lleva categoría.** No es un gasto que presupuestar — y por eso tampoco
  entra en el "comprometido" de ninguna línea (`comprometido` filtra por
  `category_id`, que acá es `null`).
- **Nunca genera deudas.** No le cobrás a nadie una parte de tu propio ahorro,
  y una deuda cuelga de un gasto (`fin_debts.transaction_id`), no de una
  transferencia. La UI oculta el reparto y el server lo ignora aunque la
  plantilla traiga partes viejas de cuando era un fijo compartido.
- **La cuenta destino tiene que ser `is_savings`.** Si no, el aporte iría a una
  cuenta común y `computeGoalBalancesUsd` no lo contaría como entrada: el saldo
  del ahorro no se movería y no habría ningún error que lo explicara.

Las dos FK van con `on delete restrict`, mismo criterio que
`fin_recurring.account_id` y que la corrección de categorías del
`20260824000000`: borrar un ahorro o una cuenta que un fijo usa lo dejaría en
un estado que la propia validación rechaza, y el fijo quedaría sin poder
editarse ni pausarse.

### 0.6 Ronda 6 — cuatro ajustes de uso real (2026-08-26)

Probando la app en el celular, el usuario levantó cuatro cosas. **Las cuatro
eran válidas, y dos señalaban inconsistencias introducidas contra patrones que
la propia app ya tenía resueltos.**

| Ajuste | Qué pasaba | Cómo quedó |
|---|---|---|
| **El cajón de sastre pedía un monto > 0** | Peor que un formulario molesto: ese número **nunca se lee**. `proposeAllocation` excluye al cajón del reparto normal, así que su `allocation_type`/`allocation_value` eran datos muertos — y encima imposibles de contestar ("¿cuánto va a sobrar?") | `allocation_type`/`allocation_value` pasan a **nullables**, obligatorios solo para los ahorros que sí reparten (`fin_savings_goal_allocation_shape`). Al marcar el cajón, los campos desaparecen del formulario y la card dice *"Recibe lo que sobre del reparto"* |
| **No se podían marcar cuentas de ahorro desde Ahorros** | Callejón sin salida: entrabas a Ahorros, no podías hacer nada, y nada indicaba que primero había que ir a Cuentas | Sección **"Cuentas de ahorro"** dentro de Ahorros, con un toggle por cuenta. El flag sigue viviendo en la cuenta — es el mismo dato desde dos lugares, no una copia |
| **La cuenta destino se pedía al CREAR el fijo** | Rompía la simetría con `fin_recurring.account_id`, que ya es nullable con este comentario: *"la cuenta se elige recién al registrar cada instancia; la plantilla solo necesita saber en qué moneda está el monto"* | `to_account_id` pasa a opcional en la plantilla y se pide en **RegisterSheet**, validando ahí que sea `is_savings`. La plantilla guarda la última usada como default |
| **La moneda no era editable** | Se congelaba al crear, sin motivo | Editable **mientras el ahorro no tenga movimientos**, exactamente el criterio de `PATCH /accounts/[id]` con la moneda de una cuenta. `SavingsGoalWithBalance.has_movements` es lo que lo decide, y con movimientos la UI muestra la moneda fija explicando por qué |

Y un quinto, cosmético pero real: **faltaba la bandera de la moneda** en los
ahorros. `CurrencyIcon` ya estaba en Cuentas y en el quick-add; Ahorros usaba
un ícono genérico. Ahora la card, el detalle y el selector de cuentas la
muestran.

#### Un bug que encontró la propia suite en esa corrida

Crear un fijo de ahorro **con categoría** devolvía `201` en vez de `400`: la
categoría se limpiaba *antes* de validar, dejando esa rama de
`validateRecurring` como código muerto que mentía sobre lo que hacía.

Se resolvió siguiendo el precedente del propio código —
`PATCH /transactions/[id]` limpia la categoría en silencio al pasar un
movimiento a transferencia — así que **se normaliza, no se rechaza**, y la rama
muerta se borró. La prueba pasó a verificar la normalización (`category_id`
queda en `null`) en vez de un error que ya no corresponde.

### 0.7 El desglose del reparto en el detalle de un fijo (2026-08-26)

Al tocar un fijo compartido, el detalle decía solo *"Compartido con: 2
personas"*. Ahora lista **cada persona con su monto**, más *"Tu parte"* (o
*"Ganas"* en verde si el reparto supera el gasto, mismo tratamiento que el
sheet de registrar).

Los montos se **resuelven, no se leen**: una parte pareja se guarda como `null`
en la plantilla y solo existe cuando se calcula con el monto del mes
(`resolveSplits`). Se reusan las dos mismas funciones que usa
`<RegisterSheet>` (`resolveSplits` + `shareBreakdown`), así que **lo que se ve
en el detalle es exactamente lo que se va a generar al pagarlo** — no un
segundo cálculo que pueda desincronizarse.

### 0.8 Ronda 7 — el rediseño de fondo: el ahorro es una etiqueta (2026-08-26)

La feature nació con una **cuenta marcada como de ahorro** (`fin_accounts.is_savings`)
y todo lo demás derivado de ahí: si el origen era una cuenta de ahorro, era un
retiro; si el destino lo era, un aporte. Al usarla de verdad, esa deducción se
rompió por todos lados a la vez, y el usuario lo dijo en tres pasos:

| Lo que dijo | Lo que estaba mal |
|---|---|
| *"¿Por qué me pregunta 'de qué ahorro retirás' y me muestra todos los ahorros? ¿Y si solo tengo ahí guardados ingresos mezclados con ahorros?"* | La cuenta obligaba a justificar **todo** gasto que saliera de ella, ahorro o no |
| *"Y no quiero hacer que un ahorro esté ligado a una cuenta necesariamente"* | El modelo ya era correcto (un ahorro nunca tuvo columna de cuenta) — la **capa de enforcement** era la que lo ataba |
| *"Entonces todas las cuentas deberían poder ser para ahorro, ya no necesito un selector"* | La marca no aportaba nada: solo restringía |
| *"No uses la presencia del motivo para definir si es ahorro o no. Pregunta explícitamente."* | `savings_reason is null` significaba a la vez *"es un aporte"* y *"no puse motivo"* |

Tenía razón en las cuatro. El modelo quedó así:

1. **`fin_accounts.is_savings` se eliminó** (`20260826010000`). Ninguna cuenta
   "es de ahorro". Cualquiera puede alojar ahorros.
2. **Un movimiento es de ahorro porque vos lo dijiste** — `savings_goal_id`
   puesto a mano, nunca inferido de dónde cae la plata.
3. **La dirección se declara, no se deduce** — `savings_flow` (`'aporte'` /
   `'retiro'`, `20260826020000`). Para un `gasto` o un `ingreso` el tipo ya la
   determina y el servidor la impone; solo una `transferencia` la pregunta,
   porque ahí el tipo no alcanza.
4. **Cada cuenta deriva cuánto de su saldo está apartado**
   (`savings_balance`), y el quick-add usa ese número: un gasto común tiene
   como máximo `saldo − apartado`, y para tocar lo apartado hay que encender
   *"gastar de mis ahorros"* — que es cuando recién pregunta de qué ahorro y
   por qué.

Sacar la marca resolvió una familia entera de problemas de una vez: preguntas
forzadas en gastos que no eran de ahorro, ingresos que se perdían del reporte
del mes (`flowTypeFor` los pasaba a `'movimiento'` solo por caer en esa
cuenta), aportes fantasma cuando la cuenta destino se desmarcaba, y filas que
no se podían leer sin adivinar la intención de quien las cargó.

### 0.9 Ronda 8 — cada cosa en su pantalla (2026-08-26)

El usuario preguntó por qué una transferencia pregunta si aporta o retira, y
la pregunta destapó que el modelo estaba puesto en el lugar equivocado:

> *"Un aporte solo puede entrar a fin de mes desde la sección de ahorros. No
> desde «Agregar Ingreso», y solo puede salir desde «Registrar Gasto». Una
> transferencia por sí sola solo mueve el saldo disponible, no toca el saldo
> de ahorros. Si se quiere mover un ahorro de una cuenta a otra, se lo debería
> hacer desde la sección de Ahorros."*

Tiene razón, y la razón es una **asimetría real de cómo se comporta el
ahorro**:

| | Cómo pasa | Dónde vive |
|---|---|---|
| **Aportar** | Por plan, y periódicamente: un fijo de ahorro o el reparto del cierre de mes | **Ahorros** y **Fijos** |
| **Retirar** | Por circunstancia, en el momento: una emergencia, un cambio de idea | **Movimientos** (el gasto que lo rompe) |
| **Trasladar** | Reacomodo de billeteras, no gasto ni ingreso | **Ahorros** |

Aportar es una **decisión de plan**; Movimientos es donde se registra **lo que
pasó**. Meter la decisión en el registro era lo que obligaba a preguntar
"¿aporta o retira?" en medio de una transferencia — una pregunta que solo
existía porque la pantalla estaba haciendo dos trabajos.

Qué cambió:

1. **`POST /transactions` solo acepta la etiqueta en un `gasto`.** Un `ingreso`
   tageado y una `transferencia` tageada devuelven `400` con el mensaje que
   dice a dónde ir.
2. **Editar tampoco es la puerta de atrás.** Cargar un retiro y después
   cambiarle el tipo a `ingreso` lo convertía en un aporte hecho desde
   Movimientos. Ahora se rechaza — pero editar una transferencia tageada que
   *ya existía* (la del fijo, la del cierre, la del traslado) sigue
   funcionando: archivar o cambiar una regla no congela la historia (b08fdb4).
3. **El quick-add perdió el selector de dirección.** Con solo retiros posibles,
   el tipo ya la declara y no hay nada que preguntar. Queda un único botón,
   *"Gastar de mis ahorros"*, y solo en un gasto desde una cuenta que tenga
   algo apartado.
4. **Nace el traslado** (§4.12), que era el hueco anotado en §4.9.

### 0.10 Ronda 9 — el reparto deja de ser un trámite (2026-08-26)

El cierre mensual funcionaba pero se sentía como una obligación administrativa:
un banner rojo con triángulo de advertencia (*"Tienes un mes por repartir"*),
un botón **Revisar**, y un formulario que pedía una cuenta de origen y una de
destino para **todos** los ahorros de una sola vez, listándolos con montos sin
moneda. El usuario lo dijo entero:

> *"El mensaje parece un mensaje de error. Debería invitar al usuario a
> organizar sus ahorros... En vez de un botón «Revisar» donde se haga toda la
> repartición, cada card de ahorro debe tener su botón de «Ahorrar»."*

| Antes | Ahora |
|---|---|
| ⚠️ *"Tienes un mes por repartir"* + **Revisar** | ✨ *"Es hora de organizar tus ahorros"*, en azul y sin botón |
| Un reparto global para todos los planes | Un botón **Ahorrar** en la card de cada plan |
| *"¿De qué cuenta sale?"*, un picker en blanco | **Dónde quedó la plata de ese mes**, cuenta por cuenta, filtrado por la moneda del plan |
| *"¿A qué cuenta de ahorro entra?"* | *"¿En qué cuenta ahorrar?"*, con la misma cuenta por defecto |
| Montos sin moneda | Monto con su moneda; y si el plan es por %, el % **y** cuánto es |

Cuatro decisiones de fondo:

1. **Guardar sin mover de banco.** Lo normal al ahorrar es que la plata ya esté
   donde tiene que estar: lo que cambia es que pasa a estar apartada. Se
   registra como una transferencia de la cuenta **a sí misma** — el saldo no se
   mueve un peso (sale y entra el mismo monto) y lo apartado sube. Hubo que
   abrir `fin_tx_transfer_shape` para ese caso (§4.13).
2. **El origen sale de la plata del mes, no de un picker.** `month_funds` dice,
   por cuenta, cuánto dejó ese mes **y** sigue libre hoy — el mínimo de las dos
   cosas, porque no se puede guardar plata ya gastada ni plata ya apartada.
3. **Una vez por mes y por plan.** `savings_period` en el aporte dice a qué mes
   pertenece; con eso el botón se apaga y la tabla del detalle se dibuja.
4. **Callejón sin salida, no.** Si el mes dejó plata pero en otra moneda, el
   sheet no dice "no se puede": dice cuánto hay y qué hacer — convertir con una
   transferencia y volver.

El azul (`--fz-save`) es la cuarta excepción a *"el color es solo marca y
dinero"*. Guardar no es ni ingreso ni gasto: es plata tuya que cambia de
estado, y con el verde de la marca el botón se confundía con cualquier otra
acción primaria. Vive acotado a la pantalla de Ahorros.

### 0.2 Simplificaciones que se tomaron al construir

Dos decisiones de alcance que se tomaron durante la construcción, no antes —
ninguna cambia el modelo de datos ni bloquea ampliarlas después:

1. **Una sola cuenta de origen y una sola cuenta de ahorro de destino por
   cierre**, en vez de un picker por línea del reparto. El modelo sí soporta
   que cada ahorro tenga su propia cuenta de destino (§4.4) y la API ya lo
   acepta línea por línea — la pantalla de confirmación mensual
   (`<SavingsClosureSheet>`) todavía no expone esa granularidad, para no
   pedir una cuenta por cada ahorro activo en la pantalla más usada del mes.
2. **Un mes en rojo no arma un flujo de retiro dentro del cierre.** La
   pantalla igual pregunta (Ronda 3 lo pedía explícitamente) pero la única
   acción es "Entendido, no repartir nada" — cerrar la pregunta pendiente
   sin crear ningún movimiento. Retirar de un ahorro para cubrir un mes en
   rojo se hace como cualquier retiro normal, desde Ahorros o el quick-add;
   no hace falta que el cierre lo orqueste.

---

## 1. Objetivo del sprint

> **Apartar automáticamente el sobrante de cada mes (lo que gané − lo que
> gasté) en cuentas 100% dedicadas a ahorro, repartido entre distintos
> ahorros con su propio ritmo y meta — y verlos crecer sin que se mezclen
> nunca con el gasto corriente.**

### Definición de "terminado"

- [ ] Puedo marcar cualquier cuenta existente como "dedicada a ahorro"
- [ ] Puedo crear varios ahorros, cada uno con su moneda, su reparto (fijo o %) y una meta opcional
- [ ] Al cerrar un mes, veo cuánto fue mi sobrante y una propuesta de reparto entre mis ahorros, editable antes de confirmar
- [ ] Confirmar arma las transferencias reales hacia las cuentas de ahorro, tageadas por ahorro
- [ ] Si el sobrante no alcanza para los montos fijos, la app me lo dice y me deja decidir, no decide sola
- [ ] Un mes en rojo también me pregunta qué hacer, no lo ignora en silencio
- [ ] Puedo retirar de un ahorro con un justificativo, y elijo si ese retiro fue un gasto real o una transferencia a otra cuenta mía
- [ ] Veo el saldo de cada ahorro, su meta si tiene, y cuándo llegó a ella
- [ ] `npm run build` pasa sin errores

---

## 2. Alcance

### Entra

| Pieza | Alcance exacto |
|---|---|
| **Cuentas dedicadas** | Flag `is_savings` en `fin_accounts`, excluyente con `is_investment` |
| **Ahorros** | Entidad propia: nombre, moneda, reparto (fijo o %), meta opcional (monto + fecha), archivar |
| **Cálculo del sobrante** | `ingreso_real_usd(mes) − gasto_real_usd(mes)`, mismo filtro `isConsumo` que ya usan Presupuesto y Reportes |
| **Cierre mensual** | Propuesta de reparto editable, cubre el caso "no alcanza" y el caso "mes en rojo", ambos preguntando en vez de decidir solo |
| **Aportes y retiros** | Movimientos normales (`ingreso`/`gasto`/`transferencia`) tageados con `savings_goal_id`, en cualquier cuenta `is_savings` |
| **Justificativo de retiro** | Categoría (`emergencia`/`meta_cumplida`/`cambio_planes`/`otro`) + texto libre opcional, obligatorio al retirar |
| **Pantalla** | `/finanzas/ahorro`, entra por "Más" |
| **Integración con quick-add** | Elegir una cuenta de ahorro habilita el picker de ahorro; un retiro pide el justificativo antes de guardar |

### No entra en este sprint

| Fuera | Razón |
|---|---|
| Bloqueo duro en el servidor | Decisión cerrada (Ronda 1): blando, como el resto de la app |
| Panel en la Home | Se puede sumar después, mismo criterio que Presupuesto — no es parte de "terminado" acá |
| Reportes históricos de ahorros a través de meses | Vive en el sprint de Reportes (#8), que puede reusar directamente el cálculo del sobrante de este sprint |
| Notificación cuando un ahorro llega a su meta | Sprint de Alertas (#10) |
| Mover la plata de un ahorro específico entre cuentas de ahorro en un solo paso | Se resuelve con retiro + aporte (§0.1.2); una operación dedicada de "mover" queda para si hace falta después |
| Sugerencia de reparto por historial | Mismo criterio que Presupuesto v1.1: necesita meses de datos que hoy no existen |

---

## 3. Modelo de datos

Dos tablas nuevas y dos columnas agregadas. Migración:
`supabase/migrations/2026XXXXXXXXXX_finanzas_ahorro.sql`. Nada de lo que
existe cambia de forma más allá de esto.

### 3.1 `fin_accounts` — modificada

```sql
alter table fin_accounts
  add column is_savings boolean not null default false;

alter table fin_accounts
  add constraint fin_accounts_savings_investment_excl
  check (not (is_investment and is_savings));
```

Mismo patrón que `is_investment` (Feature 11, `contexto_finanzas.md` §7.1):
un flag en la cuenta, escala sola a N cuentas, nada que marcar en cada
movimiento.

### 3.2 `fin_savings_goals` — los ahorros

```sql
create table fin_savings_goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  input_currency    text not null check (input_currency in ('USD','BOB','USDT','USDC','BTC')),
  allocation_type   text not null check (allocation_type in ('fixed','percent')),
  allocation_value  numeric(24,8) not null check (allocation_value > 0),
  target_amount     numeric(24,8) check (target_amount is null or target_amount > 0),
  target_date       date,
  sort_order        integer not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint fin_savings_goal_percent_range
    check (allocation_type = 'fixed' or allocation_value <= 100)
);
create index on fin_savings_goals (user_id, archived, sort_order);
```

`allocation_value` es un monto en `input_currency` cuando `allocation_type =
'fixed'`, o un porcentaje 0–100 cuando es `'percent'` (§4.3 tiene el
algoritmo completo). `target_amount` está en la misma `input_currency` que
el resto del ahorro — no tiene sentido una meta en una moneda distinta del
monto que se está juntando.

### 3.3 `fin_transactions` — modificada

```sql
alter table fin_transactions
  add column savings_goal_id uuid references fin_savings_goals(id) on delete set null,
  add column savings_reason  text check (
    savings_reason is null or savings_reason in ('emergencia','meta_cumplida','cambio_planes','otro')
  );
```

Mismo patrón que `pasanaku_id`/`recurring_id`: una FK nullable sobre la
tabla que ya existe, cero cambios de forma. `savings_reason` solo tiene
sentido en una salida desde una cuenta de ahorro — se valida en el server
(§4.6), no con un `check` cruzado a otra tabla, que Postgres no permite sin
un trigger.

### 3.4 `fin_savings_closures` — la decisión de cada mes

```sql
create table fin_savings_closures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period       date not null,           -- primer día del mes que se cierra
  surplus_usd  numeric(14,2) not null,  -- congelado al decidir, puede ser negativo
  decided_at   timestamptz not null default now(),

  unique (user_id, period)
);
```

Mismo mecanismo que `fin_budget_closures` (Sprint 6 §3.4): **la ausencia de
fila es la pregunta pendiente.** Un período vencido sin fila acá es lo que
la UI detecta para mostrar el banner "tenés un mes por repartir". No guarda
el detalle de cuánto fue a cada ahorro — eso ya quedó registrado como
`fin_transactions` reales tageadas con `savings_goal_id`; esta tabla solo
marca que la pregunta del período ya se respondió, para no volver a
mostrarla.

### 3.5 RLS

Las 2 tablas nuevas: `enable row level security` y las 4 policies
(`select`/`insert`/`update`/`delete`) con `user_id = auth.uid()`. Sin
excepciones, sin `createAdminClient()` — mismo criterio de siempre.

---

## 4. Reglas de negocio

### 4.1 Ingreso real y gasto real del mes

Reutiliza exactamente lo que ya existe — cero funciones nuevas acá:

```
sobrante_usd(mes) = ingresoUsd(txs del mes) − gastoUsd(txs del mes)
```

`ingresoUsd`/`gastoUsd` (`lib/finanzas/transactions.ts`) ya filtran por
`isConsumo` — reembolsos, cobros de deuda, aportes de pasanaku recibidos y
ajustes de cuentas de inversión ya quedan afuera, porque no son ingreso o
gasto real. Un aporte o retiro de ahorro **tampoco** debe contar ahí — ver
§4.5, que es justamente lo que lo garantiza.

### 4.2 Saldo de un ahorro — derivado, nunca guardado

```
saldo(ahorro) = Σ amount_usd  donde tx.savings_goal_id = ahorro, tx.type = 'ingreso' o 'transferencia' entrante
              − Σ amount_usd  donde tx.savings_goal_id = ahorro, tx.type = 'gasto' o 'transferencia' saliente
```

Mismo principio que el saldo de una cuenta (Sprint 1 §4.2): nunca una
columna que se pueda desincronizar de su historial. Se muestra también en
`input_currency` del ahorro, convertido con la tasa de HOY (igual que
Presupuesto) — cada movimiento individual sigue guardando su propia tasa
congelada para auditar.

### 4.3 Propuesta de reparto al cerrar un mes

Con `sobrante_usd > 0`:

```
ahorros_activos = ahorros sin archivar Y (sin meta O saldo(ahorro) < target_amount_usd)

fijos    = ahorros_activos con allocation_type = 'fixed'
pctuales = ahorros_activos con allocation_type = 'percent'

suma_fijos_usd = Σ allocation_value convertido a USD, de los `fijos`

si suma_fijos_usd <= sobrante_usd:
    cada fijo recibe exactamente su allocation_value
    resto_usd = sobrante_usd − suma_fijos_usd
    cada pctual recibe resto_usd × (allocation_value / 100)
    → si los % no suman 100, el remanente queda "sin asignar" (§0.1.5)

si suma_fijos_usd > sobrante_usd:
    NO se prorratea ni se prioriza solo.
    Se muestra cada fijo con su monto pedido vs. lo disponible,
    y el usuario ajusta a mano antes de confirmar (Ronda 2).
    Los `pctuales` proponen $0 hasta que el usuario libere margen.
```

Con `sobrante_usd <= 0`: no hay propuesta automática. La pantalla de cierre
muestra igual el número (negativo o cero) y pregunta si se quiere retirar
de algún ahorro para cubrirlo, o dejarlo así (Ronda 3) — un "dejarlo así"
simplemente no genera ningún movimiento, solo la fila de
`fin_savings_closures` que cierra la pregunta.

### 4.4 Confirmar el cierre

Al confirmar (con ajustes o sin ellos), por cada ahorro con monto > 0
propuesto se crea una `transferencia` real: `account_id` = una cuenta
regular elegida por el usuario en la confirmación (de dónde sale la
plata), `to_account_id` = una cuenta `is_savings` (a elección, si el ahorro
vive en más de una), `savings_goal_id` = el ahorro, fecha = hoy. Después se
inserta la fila de `fin_savings_closures` con el `surplus_usd` congelado.
Las dos escrituras son atómicas en el sentido de Sprint 2 §4.7/Sprint 4
§4.8: si falla la segunda, se deshace la primera tanda de transferencias y
se devuelve `500`.

### 4.5 `flow_type` — el ahorro ya no entra en la cuenta

⚠️ **Reescrito el 2026-08-26 (Ronda 7).** Esta sección describía una tabla
donde `account.is_savings` cambiaba el `flow_type`. Esa columna ya no existe.

```
flowTypeFor(type, account):
  type = 'transferencia'   → 'movimiento'
  account.is_investment    → 'movimiento'
  cualquier otro caso      → 'consumo'
```

El ahorro **no participa** de esta decisión, y eso arregló un bug real: con la
regla vieja, un `ingreso` que caía en una cuenta marcada pasaba a
`'movimiento'` y **desaparecía del ingreso real del mes**, así que bajaba el
sobrante sin que nada lo explicara. Hoy un ingreso es un ingreso caiga donde
caiga; lo que decide si ensucia el mes es el tipo, no dónde está la plata.

La distinción de la Ronda 2 sobrevive intacta por otro camino: un aporte o un
traslado entre cuentas propias se cargan como `transferencia` (siempre
`'movimiento'`), y un retiro que se gastó de verdad se carga como `gasto`
(`'consumo'`).

### 4.6 Etiqueta y dirección — qué exige el servidor

⚠️ **Reescrito el 2026-08-26 (Ronda 7).**

Un movimiento **no es de ahorro por dónde cae**. Es de ahorro si trae
`savings_goal_id`, y entonces:

⚠️ **Reescrito otra vez el 2026-08-26 (Ronda 8).** La dirección ya no se
pregunta nunca: la determina de dónde viene el movimiento.

| Dirección | Quién la escribe | Por dónde |
|---|---|---|
| `aporte` | el servidor | registrar un **fijo de ahorro**, o confirmar el **cierre de mes** |
| `retiro` | el servidor (`savingsFlowForType`) | un **gasto** etiquetado en el quick-add |
| `traslado` | el servidor | **"Mover de cuenta"** en Ahorros (§4.12) |

Reglas duras, todas con `400`:

- `POST /transactions` acepta `savings_goal_id` **solo en un `gasto`**. Un
  `ingreso` o una `transferencia` tageados se rechazan con el mensaje que dice
  a dónde ir.
- El `PATCH` no es la puerta de atrás: cambiarle el tipo a un retiro para
  volverlo aporte se rechaza. Editar una transferencia tageada **que ya era
  así** sigue permitido.
- Una dirección **declarada que contradice al tipo** se rechaza (un `gasto`
  declarado como `aporte`), en vez de pisarla en silencio.
- Un retiro **sin** `savings_reason` válido se rechaza — el justificativo en
  cada salida es lo que se pidió al abrir el sprint.
- Un movimiento **sin** `savings_goal_id` no lleva ni dirección ni motivo: son
  un solo dato y viajan juntos. Lo sostiene también la base
  (`fin_tx_savings_flow_shape`).

Y una regla blanda, deliberada: un movimiento **sin etiquetar no pregunta
nada**. Gastar de una cuenta que además guarda ahorros es un gasto común, y
una transferencia común es solo plata cambiando de billetera.

### 4.7 Meta cumplida

`saldo(ahorro) >= target_amount_usd` (cuando el ahorro tiene meta): se
excluye de la propuesta automática (§4.3) y la UI le pone un badge "🎉 Meta
cumplida". No se bloquea nada — el usuario puede seguir aportando a mano
desde el quick-add si quiere pasarse. El **cajón de sastre es la excepción**:
absorbe el sobrante restante aunque ya haya llegado a su meta, porque su
trabajo es que no quede plata sin destino (§0.4).

### 4.8 Edición del reparto — sin retroactividad

Cambiar `allocation_type`/`allocation_value` de un ahorro se aplica desde
el **próximo** cierre — no hay tabla de "montos por período" como en
Presupuesto porque no hace falta recalcular nada hacia atrás: los cierres ya
confirmados guardan su `surplus_usd` y los movimientos reales quedan tal
cual se generaron, ambos inmutables por diseño (mismo criterio que
`exchange_rate` congelado).

La **moneda**, en cambio, se congela con el primer movimiento
(`409` si ya hay aportes): cambiarla reinterpretaría lo que ya se aportó.
`has_movements` es lo que la pantalla usa para habilitar el selector.

### 4.9 Cuánto de una cuenta está apartado

`savings_balance` por cuenta se deriva de los movimientos tageados
(`computeSavingsByAccountUsd`), nunca se guarda:

```
ingreso        + monto  en account_id
gasto          − monto  en account_id
transferencia  aporte → + lo que ENTRÓ en to_account_id
               retiro → − lo que SALIÓ de account_id
```

Solo se mueve **un lado** de una transferencia: la otra cuenta no gana ni
pierde plata *apartada* por el traslado. El resultado se clampea en 0 — una
cuenta no puede tener ahorro negativo.

**Invariante que sostiene la pantalla de Cuentas:** el saldo de un ahorro es
exactamente la suma de lo apartado en cada cuenta. Hay una regresión que lo
prueba en `api.mjs` (§ "regresiones de los tres bugs de la revisión").

✅ **Resuelto en la Ronda 8.** Acá estaba anotado que mover plata *ya
ahorrada* entre cuentas no tenía forma de expresarse: como `aporte` se contaba
dos veces, como `retiro` salía del ahorro. La tercera dirección existe y vive
en §4.12.

### 4.10 Qué bloquea de verdad, y qué no

⚠️ **Reescrito el 2026-08-26 (Ronda 7).**

**Duro, en el servidor:**

- Etiqueta, dirección y motivo, con las reglas de §4.6.
- La forma en la base: `fin_tx_savings_flow_shape` no deja existir una fila
  tageada sin dirección, ni una dirección sin etiqueta.
- Elegir un ahorro **archivado** para un movimiento nuevo, incluido registrar
  un fijo de ahorro.
- Una transferencia de una cuenta **a sí misma**, en el cierre mensual y al
  registrar un fijo.
- Cambiar la moneda de un ahorro que ya tiene movimientos.

- **El piso de ahorro**, en los cinco caminos que sacan plata de una cuenta
  (§4.11).

**Blando, y a propósito:**

- **Ninguna cuenta desaparece del picker.** No hay cuentas "de ahorro" que
  esconder, a diferencia de las de inversión.
- **No hay confirmación al retirar.** Se puede romper un ahorro cuando se
  quiera; lo único obligatorio es decir por qué.
- **La historia previa nunca queda congelada** (ver abajo).

### 4.11 El piso de ahorro — lo apartado no es plata disponible

**Agregado el 2026-08-26.** Hasta acá el tope lo aplicaba **solo el
quick-add**: el servidor medía contra el saldo total, así que registrar un
fijo o aportar a un pasanaku se comía lo apartado sin decir una palabra.
El usuario lo señaló: *"creo que es algo que debería estar en toda la app para
que ahorrar tenga sentido"*. Tiene razón — un límite que se esquiva por
cualquier otra pantalla no es un límite, es una decoración.

La regla vive en `assertBalance` (`lib/finanzas/load.ts`), que es el punto por
el que pasan **los cinco caminos** que sacan plata de una cuenta: crear un
movimiento, editarlo, registrar un fijo, aportar a un pasanaku y repartir el
cierre del mes.

```
movimiento común    → tope = saldo − apartado
retiro declarado    → tope = apartado   (acotado por el saldo real)
```

Consecuencias que valen la pena decir en voz alta:

- **Un fijo que no entra sin romper un ahorro, no entra.** Para pagarlo hay que
  retirar del ahorro primero, a mano y con su motivo. Es incómodo a propósito:
  es exactamente la fricción que hace que ahorrar signifique algo.
- **No se puede retirar de una cuenta donde ese ahorro no tiene nada
  apartado.** No se saca lo que no se puso. El quick-add ni siquiera ofrece el
  toggle en ese caso, así que cliente y servidor coinciden.
- **Una cuota de deuda cobrada no se ve afectada**: es un `ingreso`, plata que
  **entra**, y `consumesBalance` ya la deja afuera. Lo aclaró el usuario en la
  misma conversación, y estaba en lo cierto.
- `<RegisterSheet>` y `<PasanakuAporteSheet>` muestran ahora el mismo
  `disponible` que aplica el servidor, con la aclaración *"· X en ahorros"* al
  lado, para que el número no aparezca sin explicación.

#### Lo apartado se calcula en la moneda de la cuenta, no en USD

`computeSavingsByAccount` (nativa) convive con `computeSavingsByAccountUsd`
(para comparar cuentas entre sí). La nativa no usa ninguna tasa: `amount` ya
está en la moneda de `account_id` y `to_amount` en la de `to_account_id` — el
mismo par de campos con el que `computeBalances` deriva los saldos.

Pasar por USD y volver arrastraba centavos: aportar **Bs 700** y ver *"Bs
699,99 apartados"* es un número que el usuario sabe que está mal, y además
dejaba el tope un centavo corrido respecto del saldo del que se resta.

### 4.12 El traslado — mover un ahorro de cuenta

`POST /api/finanzas/savings-goals/[id]/move`, desde **"Mover de cuenta"** en el
menú de cada ahorro. No vive en el quick-add porque no es un movimiento del
mes: no ganaste ni gastaste nada, solo cambiaste de billetera plata que ya
estaba guardada.

Pero **se ve como una transferencia**, porque lo es (rehecho en la Ronda 9 a
pedido del usuario): mismo formulario que "Transferir" en el quick-add —monto
grande arriba con su MAX, *Desde*, *Hacia*, y "cuánto llegó a X" cuando cambian
de moneda, con la comisión calculada igual. Lo único distinto es de qué
bolsillo sale y a cuál entra: **cada cuenta tiene su sección de ahorros**, y
esto mueve de una a la otra. Por eso las tarjetas muestran lo que este plan
tiene guardado en cada cuenta, no el saldo entero.

```
saldo real       A −X, B +X    (transferencia normal)
lo apartado      A −X, B +X    (los DOS lados, a diferencia de aporte y retiro)
saldo del ahorro    sin cambios
```

Se registra como `transferencia` con `flow_type: 'movimiento'` — no ensucia
ingreso ni gasto real — y `savings_flow: 'traslado'`, sin motivo: no se está
rompiendo nada.

**El tope es por ahorro y por cuenta, no por cuenta.** Si en Efectivo hay
Bs 500 del auto y Bs 300 de emergencias, del auto se pueden mover 500, no 800.
Lo calcula `computeGoalBalancesByAccountUsd`, y lo mismo alimenta el campo
`by_account` que la pantalla usa para listar los orígenes posibles y para
mostrar *"Dónde está guardado"* en el detalle.

Además pasa por `assertBalance` como salida de la alcancía (igual que un
retiro): lo apartado es un dato **derivado**, no una caja aparte — si la plata
se gastó por otro lado, no está, y el traslado se rechaza.

---

### 4.13 "Ahorrar" — el reparto plan por plan

`POST /api/finanzas/savings-goals/[id]/save`, desde el botón **Ahorrar** de
cada card. Reemplaza a `POST /savings-goals/close`, que repartía todo de una.

```
guardar en la MISMA cuenta   saldo sin cambios, apartado +X
guardar en OTRA cuenta       A −X, B +X   ·   apartado +X en B
saldo del ahorro             +X en los dos casos
```

Lo que valida, en orden:

- El plan existe y no está archivado.
- El período es un mes **ya terminado** — nunca el mes en curso: todavía no se
  sabe cuánto va a sobrar.
- Ese plan **no guardó ya** en ese período (`409`).
- La cuenta de origen está en **la moneda del plan**. Un ahorro en Bs no se
  alimenta con dólares sin decidir a qué tasa, y esa decisión no va escondida
  en un endpoint.
- El monto entra en lo que **ese mes dejó libre** en esa cuenta
  (`month_funds`), no en el saldo entero.

#### `available_funds` — de dónde se puede sacar

Por cuenta: **saldo menos lo ya apartado**, clampeado en cero, sin cuentas
archivadas ni de inversión.

⚠️ **Corregido el 2026-08-26, reportado desde la cuenta demo.** La primera
versión devolvía "lo que ese mes dejó en esa cuenta" — el mínimo entre cuánto
creció su saldo durante el período y cuánto sigue libre hoy. Suena razonable y
era un callejón sin salida:

> *"Acabo de cambiar 1000 Bs a USDT pero aún no me deja ingresar el ahorro.
> Incluso veo que ya tenía saldo disponible en Binance USDT que podía poner al
> ahorro."*

Las dos mitades del reporte eran ciertas:

- Binance tenía 266 USDT libres y el sheet no la ofrecía, porque el mes
  pendiente (julio) no la había tocado.
- Y el propio consejo del sheet —*"convertí tus bolivianos a USDT y volvé a
  registrar el ahorro"*— era **imposible de seguir**: la conversión ocurre hoy,
  que cae en el mes en curso, no en el que se está organizando. Por más que se
  convirtiera, la cuenta destino nunca sumaba nada al período pendiente.

La plata es fungible. El sobrante del mes es un **monto**, no un lugar: dice
cuánto te quedó, no en qué billetera está parado hoy. El usuario lo confirmó:
*"al ahorro debe ir todo dinero del saldo disponible para usar, aunque no se
haya ingresado este mes"*. Así que el sobrante quedó donde corresponde —como la
**sugerencia** de cuánto guardar (§4.3)— y el tope por cuenta pasó a ser lo que
de verdad hay libre. Regresión en `probe.mjs` §AP, que reproduce el reporte
entero: convertir hoy y poder guardar.

#### `savings_period` — a qué mes pertenece un aporte

La fecha del movimiento no alcanza: el aporte del reparto de julio se registra
en agosto. Lo escriben los dos caminos que aportan — el reparto con el mes que
organiza, un fijo con el mes en que cae su fecha. De ahí salen el botón que se
apaga y la tabla de meses del detalle (check si hubo aporte, guion si no).

---

#### Un movimiento anterior a la regla no se vuelve ineditable

Un `gasto` cargado antes de que existiera el ahorro quedaba imposible de
editar: el `PATCH` lo reclasificaba como retiro y le exigía un ahorro y un
motivo que nunca tuvo — ni la descripción se le podía corregir. Lo encontró
`tests/finanzas/probe.mjs` §T.

Es la **tercera aparición de la misma clase de bug** (la categoría de un fijo
en `b08fdb4`, el ahorro archivado en §8, y esta): una regla nueva no puede
congelar la historia que la precede. Ahora el ahorro y el motivo se exigen
solo cuando el movimiento **ya era de ahorro**, o cuando el cliente manda uno
explícitamente — que es cuando de verdad lo está convirtiendo. El picker se
sigue mostrando, por si se lo quiere tagear.

Misma regla, otro extremo: **archivar sí frena lo nuevo**. Un fijo cuyo ahorro
se archivó se sigue pausando, renombrando y editando, pero ya no se puede
registrar (§8, bug 3).

---

## 5. Estructura de archivos

### Nuevos

```
app/finanzas/
├── screens/ahorro.tsx                  — lista de ahorros + card de cada uno + banner de cierre pendiente
└── components/
    ├── savings-goal-sheet.tsx          — crear/editar un ahorro (nombre, moneda, reparto, meta)
    ├── savings-closure-sheet.tsx       — la confirmación mensual del reparto, editable antes de guardar
    └── savings-withdraw-reason.tsx     — el picker de justificativo, usado desde quick-add en un retiro

app/api/finanzas/
├── savings-goals/route.ts              — GET lista con saldo derivado · POST crear
├── savings-goals/[id]/route.ts         — PATCH (reparto, meta, archivar) · DELETE
└── savings-goals/close/route.ts        — GET la propuesta del período pendiente · POST confirmar (con ajustes)

lib/finanzas/
└── savings.ts                          — sobrante, saldo por ahorro, algoritmo de propuesta, needsSavingsClosure
```

### Modificados

| Archivo | Cambio |
|---|---|
| `lib/finanzas/types.ts` | `SavingsGoal`, `SavingsGoalProgress`, `SavingsClosure`, `SavingsProposal` |
| `lib/finanzas/transactions.ts` | `flowTypeFor`/`flowTypeOnEdit` ganan el caso `is_savings` (§4.5) |
| `lib/finanzas/load.ts` | `loadSavingsGoals()` |
| `app/api/finanzas/bootstrap/route.ts` | Un load más en el mismo viaje — el quick-add necesita los ahorros en cualquier pantalla para el picker |
| `lib/finanzas/snapshot.ts` | `savingsGoals` en el snapshot · sube `VERSION` |
| `app/finanzas/components/data-context.tsx` | Expone `savingsGoals` y `savingsGoalFor(accountId)` |
| `app/finanzas/components/quick-add.tsx` | Cuenta `is_savings` habilita el picker de ahorro (entrada) o el de justificativo (salida) en vez de guardar directo |
| `app/finanzas/components/nav-items.tsx` | Entrada "Ahorro", sin `tab: true` |
| `app/finanzas/screens/cuentas.tsx` | Toggle "Cuenta de ahorro", mismo patrón que "Cuenta de inversión", mutuamente excluyentes en el formulario |

---

## 6. Contratos de API

Todas las rutas: `requireUser()`, `401` sin usuario, cliente con RLS.
**Nunca** `createAdminClient()`.

### `GET /api/finanzas/savings-goals`
```jsonc
{
  "goals": [{
    "id": "uuid", "name": "Emergencia", "input_currency": "USD",
    "allocation_type": "fixed", "allocation_value": 50.00,
    "target_amount": 1000.00, "target_date": null,
    "balance": 320.00, "balance_usd": 320.00,
    "goal_reached": false, "archived": false
  }]
}
```

### `POST /api/finanzas/savings-goals`
Body: `{ name, currency, allocation_type, allocation_value, target_amount?, target_date? }`.

### `PATCH /api/finanzas/savings-goals/[id]`
Body: cualquier subconjunto de `{ name, allocation_type, allocation_value, target_amount, target_date, archived }`.

### `DELETE /api/finanzas/savings-goals/[id]`
Borra el ahorro. Sus movimientos ya registrados **no se tocan** —
`savings_goal_id` cae a `null` por el `on delete set null`, mismo criterio
que borrar un fijo o un pasanaku.

### `GET /api/finanzas/savings-goals/close`
Devuelve el período pendiente más antiguo (si hay), con la propuesta ya
calculada:
```jsonc
{
  "pending_period": "2026-07-01",
  "surplus_usd": 245.60,
  "proposal": [
    { "goal_id": "uuid", "name": "Emergencia", "amount": 50.00, "currency": "USD", "amount_usd": 50.00, "capped": false },
    { "goal_id": "uuid", "name": "Viaje", "amount": 1358.40, "currency": "BOB", "amount_usd": 195.60, "capped": false }
  ],
  "unassigned_usd": 0,
  "insufficient_for_fixed": false
}
```
`insufficient_for_fixed: true` cuando `suma_fijos_usd > sobrante_usd` — la
UI muestra el modo de ajuste manual en vez de la propuesta automática.

### `POST /api/finanzas/savings-goals/close`
Body: `{ period, allocations: [{ goal_id, amount, from_account_id, to_account_id }], skip? }`.
`skip: true` cuando el usuario decide no repartir nada ese mes (mes en rojo,
o simplemente "no" a la propuesta) — crea solo la fila de
`fin_savings_closures`, cero transferencias. `409` si el período ya tiene
cierre.

---

## 7. UI

### Pantalla principal — `/finanzas/ahorro`

```
Ahorro                                            [ + Nuevo ahorro ]
────────────────────────────────────────────────────────
⚠ Tenés un mes por repartir (julio)      [ Revisar ]

🛡️ Emergencia                              $320 / $1.000
▓▓▓▓▓▓▓▓░░░░░░░░░░░░  32%
Aporte fijo: $50/mes

🌴 Viaje a Brasil                     Bs 2.400 / Bs 5.000
▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  48%
30% del sobrante cada mes

🚀 Crecimiento                                    $1.240
(sin meta — solo acumula)
20% del sobrante cada mes
```

Tocar una card abre el detalle (saldo, historial de aportes/retiros,
editar reparto/meta, "Registrar retiro"). El botón "+ Nuevo ahorro" abre
`<SavingsGoalSheet>`.

### Confirmación mensual — `<SavingsClosureSheet>`

```
Julio — tu sobrante fue $245,60
──────────────────────────────
🛡️ Emergencia (fijo)              $ [ 50,00 ]
🌴 Viaje a Brasil (30%)            $ [ 58,68 ]
🚀 Crecimiento (20%)               $ [ 39,12 ]

Sin asignar: $97,80

[ Confirmar reparto ]     [ No repartir este mes ]
```

Si `insufficient_for_fixed`, la primera línea de arriba se reemplaza por un
aviso: *"Tus ahorros fijos piden $180 pero solo tenés $120 de sobrante —
ajustá los montos abajo"*, y cada campo fijo arranca editable con el pedido
original como referencia tachada al lado.

Con `sobrante_usd <= 0`:
```
Julio cerró en rojo: −$32,40
──────────────────────────────
¿Retirás de algún ahorro para cubrirlo, o lo dejás así?

[ Elegir de dónde retirar ]     [ Dejarlo así ]
```

### Retiro — dentro del quick-add

Al elegir `gasto` o `transferencia` con una cuenta de origen `is_savings`,
antes del botón de guardar:

```
¿Por qué retirás de Emergencia?
──────────────────────────────
[ Emergencia real ]  [ Se cumplió la meta ]
[ Cambio de planes ]  [ Otro ]

Detalle (opcional)
[                                        ]
```

---

## 8. Verificación

**606/182/597 pruebas en verde** (2026-08-24, unit/db/api, ya con los siete
arreglos de la revisión posterior). Eran 548/156/548 al cerrar el Sprint 6 —
este sprint suma **58 pruebas en `unit`, 26 en `db` y 49 en `api`**.

```bash
node tests/finanzas/run.mjs          # las tres suites
node tests/finanzas/run.mjs unit     # solo una
```

| Suite | Sprint 6 | Ahora | Qué cubre de este sprint |
|---|---|---|---|
| `unit.mjs` | 548 | **606** | `flowTypeFor`/`isSavingsContribution`/`isSavingsWithdrawal` con cuentas de ahorro, `surplusUsd`, `pendingSavingsPeriod`, `goalReached`, `computeGoalBalancesUsd` (aporte directo, aporte por transferencia con comisión, retiro directo, retiro por transferencia, dos ahorros que no se mezclan), el algoritmo completo de `proposeAllocation` (fijos cubiertos, fijos sin fondos, resto por %, % sin asignar, meta cumplida excluida, archivado excluido), validaciones |
| `db.mjs` | 156 | **182** | El `check` de exclusión mutua `is_investment`/`is_savings` (en alta y en `PATCH`), constraints de `fin_savings_goals` (moneda, tipo de reparto, valor > 0, % ≤ 100, meta > 0), la FK y el `check` de `savings_reason` en `fin_transactions`, `on delete set null` al borrar un ahorro, RLS y `unique(user_id, period)` de `fin_savings_closures`, precisión de 8 decimales en un reparto en BTC |
| `api.mjs` | 548 | **597** | CRUD de ahorros con sus validaciones, el flujo completo del quick-add (bloqueo sin `savings_goal_id`, bloqueo de retiro sin `savings_reason`, `flow_type` correcto en cada caso, saldo derivado correcto), el rechazo de cuentas de ahorro en Pasanaku, y el cierre mensual **end-to-end**: un ahorro retrocedido a un mes real, ingreso/gasto reales ese mes, la propuesta calculada por el server, la confirmación armando la transferencia real, el saldo del ahorro actualizado, y el mismo período rechazado si se intenta cerrar dos veces |

No quedan pruebas manuales pendientes específicas de este sprint — a
diferencia de Pasanaku (Sprint 5), la verificación de este sprint fue
enteramente automatizada contra el dev server real, incluido el flujo de
cierre con fechas retrocedidas a propósito para simular un mes ya
terminado.

### Siete bugs encontrados en la revisión posterior, no al escribirlo

Una relectura completa del código (2026-08-24, después de dar el sprint por
construido) encontró siete problemas reales. Ninguno lo agarró la primera
tanda de pruebas: los tres primeros son de la clase que solo aparece cuando
alguien usa la app de una forma que el camino feliz no recorre.

1. **La cuenta de ORIGEN del reparto podía ser una cuenta de ahorro, y el
   aporte restaba en vez de sumar.** `computeGoalBalancesUsd` decide el signo
   mirando de qué lado está la cuenta de ahorro, así que una "transferencia
   entre dos cuentas de ahorro" tageada se leía como un RETIRO: el saldo del
   ahorro **bajaba** al aportarle. Sin error visible, sin nada en la
   pantalla que lo delatara — el peor tipo de bug para una app de plata. La
   UI ya solo ofrecía cuentas regulares como origen, pero la API lo
   aceptaba. Ahora `applySavingsClosure` lo rechaza (y también el origen ==
   destino, que antes moría con el mensaje crudo del constraint de Postgres).

2. **Editar un aporte o un retiro perdía su ahorro y su motivo.** `TX_COLS`
   en `lib/finanzas/load.ts` no incluía `savings_goal_id`/`savings_reason`,
   así que la lista de movimientos los devolvía vacíos; al abrir uno para
   editarlo, el quick-add mostraba el picker de ahorro sin nada marcado y
   bloqueaba el guardado exigiendo re-elegir un dato que ya estaba guardado.

3. **Archivar un ahorro dejaba sus movimientos ineditables para siempre.**
   `assertSavingsGoal` rechazaba cualquier ahorro archivado, incluso cuando
   el `PATCH` solo heredaba el mismo `savings_goal_id` que la fila ya tenía —
   así que no se le podía ni corregir la descripción. Es **el mismo bug que
   ya había aparecido con los fijos y su categoría** (`b08fdb4`): archivar
   algo no puede congelar la historia que lo referencia. Ahora se acepta
   cuando el ahorro no cambia (`allowArchived`), y el chip del ahorro
   archivado se sigue mostrando en el picker mientras sea el elegido — mismo
   criterio que `accountOptions` con una cuenta que pasó a inversión.

4. **`pendingSavingsPeriod` escondía meses pendientes con más de 24 meses de
   historia.** El tope de 24 acotaba cuántos meses se *recorrían*, no la
   ventana hacia atrás — con tres años de cierres ya respondidos el barrido
   se agotaba antes de llegar al mes pendiente y devolvía `null`. `needsClosure`
   de Presupuesto no tiene el problema porque su tope cuenta lo que
   *acumula*, no lo que recorre. Ahora la ventana arranca, como mucho, 24
   meses antes del mes vigente.

5. **Se podía repartir un mes que todavía no había terminado.** Nada
   impedía cerrar el mes en curso —repartiendo un sobrante a medias— ni uno
   futuro; y como los períodos ya cerrados se saltean, ese mes no volvía a
   preguntarse nunca cuando de verdad terminaba.

6. **`onDone()` se llamaba durante el render** del sheet de cierre cuando ya
   no quedaba nada pendiente — un `setState` del padre en pleno render del
   hijo. Pasó a un `useEffect`, mismo patrón que `<BudgetClosureSheet>`.

7. **Sin ninguna cuenta de ahorro creada, el cierre era un callejón sin
   salida:** el selector quedaba vacío y "Confirmar" fallaba con un "Elige a
   qué cuenta de ahorro entra" imposible de satisfacer, sin decir en ningún
   lado que faltaba crear la cuenta primero.

Los siete se corrigieron y las suites se volvieron a correr en verde, con
pruebas de regresión propias para los cinco que son verificables
automáticamente (1–5).

### Cuatro bugs más en la revisión de la Ronda 7 (2026-08-26)

Encontrados después del rediseño, corriendo las tres suites contra la base
real y ampliando el probe con seis secciones nuevas (§AB–§AK).

1. **El `CHECK` de forma no atajaba nada — la trampa de la lógica de tres
   valores.** El constraint decía:

   ```sql
   (savings_goal_id is null and savings_flow is null)
   or (savings_goal_id is not null and savings_flow in ('aporte','retiro'))
   ```

   Con la etiqueta puesta y la dirección en `NULL`, la segunda rama evalúa
   `true AND NULL` = `NULL`, la primera evalúa `false`, y `false OR NULL` es
   `NULL`. **Un `CHECK` que da `NULL` no se viola**: la fila entraba igual.
   Comprobado por REST: `insert` con `savings_goal_id` y sin `savings_flow`
   devolvía `201` y guardaba la dirección en null — exactamente el dato
   ilegible que la Ronda 7 vino a eliminar. Se cierra con un `savings_flow is
   not null` explícito (`20260826030000`).

   Se destapó, además, que el `add constraint` de `20260826020000` **nunca
   había llegado a la base**: la fila del ledger ya estaba marcada como
   aplicada cuando el archivo se completó, así que todo `db push` posterior la
   salteaba. Por eso va en una migración nueva y no editando la vieja.

2. **Borrar un ahorro con movimientos era imposible.** `savings_goal_id` es
   `on delete set null`, pero `savings_flow` se quedaba con su valor: la fila
   intermedia (etiqueta en null, dirección en `'retiro'`) sí viola las dos
   ramas, y el `DELETE` moría con el mensaje crudo de Postgres. **Todo ahorro
   que alguna vez recibió un aporte quedaba imborrable.** El primer intento de
   arreglo —un trigger que limpiaba dirección y motivo antes— fallaba igual,
   porque un `CHECK` **no es diferible** y la fila intermedia (etiqueta puesta,
   dirección en null) violaba el constraint en el acto. Se sueltan los tres
   campos **juntos, en un solo `UPDATE`** (`20260826040000`).

3. **Un fijo aportaba a un ahorro archivado, con `201` y en silencio.**
   `POST /transactions` ya rechaza elegir un ahorro archivado para un
   movimiento nuevo, pero el registro de un fijo no pasaba por esa validación:
   leía `base.savings_goal_id` y lo escribía. Archivar un ahorro y dejar su
   fijo activo hacía que cada registro metiera plata en un ahorro que la
   pantalla de Ahorros **ni siquiera lista**. Ahora devuelve `400` diciendo qué
   hacer, sin romper la regla b08fdb4: el fijo se sigue pausando, renombrando
   y editando.

4. **Los ahorros no se podían alimentar a mano.** El botón de ahorro del
   quick-add se mostraba solo si `savings_balance > 0` **y** el tipo consumía
   saldo. Las dos condiciones juntas dejaban afuera todo aporte manual: no se
   podía marcar un **ingreso** como aporte (el tipo no consume saldo), ni hacer
   el **primer** aporte por transferencia desde una cuenta que todavía no tenía
   nada apartado. Los ahorros solo podían nacer del cierre mensual o de un fijo
   — la pantalla los mostraba y el modelo los soportaba, pero el único camino
   manual estaba cerrado. Ahora el botón aparece siempre que se pueda aportar
   (ingreso o transferencia); **retirar** sí sigue pidiendo que haya algo
   apartado, que es la misma regla del piso (§4.11).

   De paso, dos correcciones de la misma pantalla:
   - Los chips de ahorro se filtraban por la moneda de la cuenta de ORIGEN. En
     un aporte por transferencia la plata queda en la de **destino**, así que
     ahora es esa la que manda.
   - El selector de dirección decía *"Aporta al ahorro"* / *"Retira del
     ahorro"* sin explicar qué significaba ninguno. Pasó a **"Guarda plata"** /
     **"Saca plata"**, con una línea debajo que dice qué le hace al ahorro.

Los cuatro tienen regresión propia en `api.mjs`
(§ "regresiones de los tres bugs de la revisión") y en `db.mjs`.

**Dos hallazgos que resultaron ser tests mal escritos, no bugs** — vale
anotarlos porque el impulso fue asumir lo contrario:

- El saldo del ahorro daba 250 donde yo esperaba 150 al mover plata entre dos
  cuentas propias. **250 era correcto**: los 100 transferidos eran plata
  *libre* del origen pasando a estar ahorrada en el destino, un aporte nuevo,
  no un doble conteo. El límite real que sí existe está en §4.9 (no hay
  "traslado" de plata ya ahorrada).
- El aporte cross-currency fallaba con *"Indica cuánto llegó realmente"*. Es
  la regla del Sprint 1 funcionando: al probe le faltaba mandar `to_amount`.

### Probe adversario de Fijos + Ahorros — `tests/finanzas/probe.mjs`

Después de sumar el fijo de ahorro (§0.5) se escribió un probe **diseñado para
romper**, no para confirmar: 39 casos que atacan los bordes de los dos módulos
juntos (cross-currency, borrados con referencias vivas, archivados, conversión
de un fijo compartido en ahorro, meses atrasados, regresiones de Fijos). Se
corre solo, contra el dev server:

```bash
FZ_BASE_URL=http://localhost:3000 node tests/finanzas/probe.mjs
```

**Encontró cuatro problemas en la primera corrida**, tres de ellos reales:

1. **"Aporte fantasma" — el más grave.** Desmarcar como "de ahorro" la cuenta
   destino de un fijo estaba permitido mientras no hubiera movimientos
   tageados todavía. A partir de ahí el fijo seguía funcionando, creaba su
   transferencia tageada con el ahorro… y el saldo del ahorro **no se movía**,
   porque `computeGoalBalancesUsd` exigía que el destino siguiera marcado.
   Plata registrada que no contaba en ningún lado, sin un solo error. Se cerró
   por los dos lados: el `PATCH` de cuentas ahora lo rechaza con `409`
   nombrando el fijo, y `computeGoalBalancesUsd` dejó de exigir el flag del
   destino — el signo lo decide el origen, así que una transferencia tageada
   que no sale de una cuenta de ahorro solo puede ser un aporte. La segunda
   capa importa porque la primera no puede arreglar historia ya guardada.
2. **Borrar un ahorro que un fijo usa** devolvía el mensaje crudo del
   constraint de Postgres (`violates foreign key constraint …`). Ahora es un
   `409` que nombra los fijos que lo están usando.
3. **Borrar una cuenta que un fijo usa** (como origen o como destino de
   ahorro): mismo mensaje crudo, mismo arreglo.
4. Un cuarto caso falló por un **test mal escrito**, no por el código: medía el
   sobrante de un mes sin retroceder el `created_at` del ahorro, así que no
   había período pendiente y la propuesta salía vacía por diseño. Se corrigió
   la prueba.

Lo que el probe **confirmó sano**: el cross-currency congela lo que llegó y el
ahorro refleja eso (no lo que salió); un fijo de ahorro no entra en el
`comprometido` de ningún presupuesto ni toca el sobrante del mes; borrar el
movimiento devuelve el saldo y vuelve a dejar el fijo pendiente; editar la
descripción no pierde el tageo; un retiro no puede exceder el saldo; un fijo
compartido convertido en ahorro no arrastra sus deudas viejas; un fijo de
ahorro atrasado recupera sus meses de a uno y los acumula; y los fijos
normales (gasto + reparto + validación de anuales) siguen intactos tras el
refactor de `validateRecurring`.

---

### El sobrante ya descuenta lo que los fijos guardaron (2026-08-26)

Encontrado al verificar la Ronda 8, y arreglado.

`monthSurplusUsd` calculaba `ingresos − gastos`, ambos filtrados a `'consumo'`.
Un aporte es una `transferencia` (`'movimiento'`), así que **nunca se restaba**.
Con un fijo de ahorro de $100 corriendo, al cerrar el mes el reparto proponía
repartir el sobrante **entero**, esos $100 incluidos: te pedía ahorrar plata
que ya estaba ahorrada.

Ahora se descuentan **solo los aportes de un fijo** (`recurring_id` no nulo),
que desde la Ronda 8 son lo único que puede aportar a mitad de mes. Se usa el
monto que **llegó** (`to_amount_usd ?? amount_usd`), no el que salió: en un
aporte cross-currency son distintos, y lo que quedó guardado es el lado que
entró.

Tres cosas quedan deliberadamente afuera del descuento:

- **Las transferencias del propio cierre.** Nacen con fecha de hoy, que cae en
  el mes *siguiente* al que cierran: descontarlas arruinaría el sobrante de un
  mes que todavía no terminó. Es la razón de elegir el filtro por
  `recurring_id` y no "todos los aportes".
- **Los traslados.** No ahorran nada nuevo, solo cambian de cuenta plata ya
  guardada.
- **Los aportes de otros meses.** El filtro de período ya los deja fuera.

**Asimetría deliberada, no olvido:** un **retiro** sí sigue bajando el
sobrante, porque para `gastoUsd` es un gasto normal. Se puede defender de las
dos maneras —romper un ahorro deja menos para guardar el mes que viene— y no
se tocó porque no se pidió. Si algún día se quiere simétrico, la fórmula
completa es `ingresos − gastos − (aportes − retiros)`, que es exactamente el
cambio de la plata **libre** del mes.

Regresión en `probe.mjs` §AN y en `api.mjs`
(§ "el sobrante descuenta lo que los fijos ya guardaron"); §F del probe, que
afirmaba lo contrario, pasó a afirmar lo nuevo.

---

### El bug que la Ronda 9 dejó abierto: el mes pendiente no avanzaba

Encontrado al preguntarse *"¿de verdad probamos todo?"*, que era la pregunta
correcta: las tres suites estaban en verde y el bug igual estaba ahí.

`pendingSavingsPeriod` devolvía *"el período vencido más viejo sin una fila en
`fin_savings_closures`"*. Esa tabla la escribía el **reparto global**, que la
Ronda 9 reemplazó por el botón de cada plan. Al dejar de escribirse:

- guardabas en todos tus planes → los botones desaparecían (eso funcionaba,
  porque sale de `saved_periods`);
- pero `pending_period` se quedaba clavado en el mismo mes **para siempre**;
- cuando terminaba el mes siguiente, la app seguía ofreciendo organizar el mes
  viejo, y el nuevo no aparecía nunca.

O sea: **la feature dejaba de funcionar sola a los treinta días de usarla**, en
silencio y sin un solo test en rojo. Ninguna suite lo agarraba porque todas
corren dentro de un mismo instante: nunca ven pasar un mes.

Ahora el mes pendiente es **el mes pasado, y solo ese**. Sin tabla de estado,
sin nada que escribir, siempre avanza. Un mes que decidiste no fondear no queda
pendiente para siempre: pasa, y queda con su guion en la tabla del detalle. No
hace falta un "saltar mes" porque no hay nada trabado.

Y un plan solo organiza meses que **vivió**: uno creado en agosto no ofrece
julio (`canSaveForPeriod`).

#### Se borró el reparto global, no se dejó apagado

`GET/POST /savings-goals/close`, `loadSavingsClosureProposal` y
`applySavingsClosure` se eliminaron. No eran código muerto inofensivo:
escribían aportes **sin `savings_period`**, así que una llamada desde un
cliente viejo o desde `curl` habría metido plata en un ahorro sin marcar el
mes — el botón seguiría ofreciéndose y la tabla mostraría un guion sobre un mes
que sí recibió plata. `fin_savings_closures` queda en la base con lo escrito,
pero ya nadie la lee.

#### Consecuencia deliberada, para confirmar

Un plan que **ya recibió el aporte de su fijo** ese mes tiene el botón apagado
(`saved_periods` no distingue de dónde vino el aporte). Es la lectura literal
de lo que se pidió —*"cuando ya se haya ahorrado en ese plan ese mes, ya no
debe haber botón"*— y es coherente: un plan con fijo se financia por el fijo, y
el sobrante va a los demás. Si se quisiera que un plan con fijo además reciba
del reparto, hay que separar los dos marcadores.

---

## 9. Qué desbloquea

| Qué | Cómo |
|---|---|
| **Feature #8 — Reportes** | El cálculo de `sobrante_usd` de este sprint es directamente "cuánto ahorraste cada mes", uno de los números centrales de cualquier reporte |
| **Feature #10 — Alertas** | Los cierres pendientes y las metas cumplidas ya están calculados; falta solo el envío pasivo |
| **Panel en la Home** | Mismo camino que Presupuesto: los datos ya viajan en `/bootstrap` desde el día uno, exponerlos en una card es barato si se decide después |

⚠️ **Recordatorio de infraestructura:** Vercel Hobby permite **1 cron al
día** y ya está usado. Este sprint no agrega ninguno — la detección de "mes
por repartir" es bajo demanda, al cargar la pantalla, mismo criterio que
Presupuesto.

---

## Avisos en la Home (2026-08-26)

**Pedido del usuario:** debajo de Presupuestos, un banner cuando llega la
fecha de registrar ahorros —parecido al que ya vive adentro de Ahorros— y
otro igual para cuando toca aportar al pasanaku, cada uno con el atajo a su
pantalla, una X para cerrarlo, y que desaparezca solo una vez completada la
tarea.

Los dos son **una lectura de los datos, no un flag que haya que limpiar**:

- **Ahorros:** aparece con `savings.pending_period` + algún plan sin
  guardar ese período. Es la misma condición del aviso de adentro de
  Ahorros, a propósito: si los dos preguntan distinto, uno de los dos
  miente. Se apaga solo al guardar el último plan del mes.
- **Pasanaku:** `aportePendiente(start_date, roundsOf(p), hoy)` en
  `lib/finanzas/pasanaku.ts` — falta el aporte del mes corriente (una vez
  que llegó su día) o el de algún mes anterior. Es más estricto que
  `canAportar` (§4.11 del sprint 5), que sigue en `true` aunque ya hayas
  aportado: para el botón alcanza con que se pueda, para el aviso tiene que
  faltar. Se apaga solo al registrar el aporte, y con el ciclo entero
  aportado no vuelve nunca.
- `roundsOf(p)` —aportes reales + históricos— quedó en la librería y ahora
  la comparten la tabla del detalle, el botón "Aportar" y este aviso: los
  tres tienen que contar los mismos meses.

La X vive en `useDismissedBanners` (`components/banner-dismiss.tsx`),
localStorage igual que `fz:hero`. La clave lleva el período adentro
(`ahorro:2026-07`, `pasanaku:2026-08:<ids>`), así cerrar el de este mes no
esconde el del que viene; en el del pasanaku los ids hacen que un pasanaku
nuevo lo traiga de vuelta. Lo guardado es "ya lo vi", nunca "ya lo hice" —
la tarea sigue viva en su pantalla. `ready` evita el parpadeo de pintar el
aviso antes de leer localStorage, mismo criterio que `useHeroPref`.
