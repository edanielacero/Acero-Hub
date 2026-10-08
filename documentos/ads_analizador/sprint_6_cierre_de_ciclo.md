# Ads Analizador — Sprint 6: "Cierre de ciclo y Campaña en curso"

> Documento maestro: `documento_maestro_ads_analizador.md`.
> Reglas de cálculo: `sprint_5_reglas_v2.md` (incluye el corte por inversión).
>
> Fuente: la especificación "Cambio: fin de ciclo → «Campaña en curso» +
> historial en «Ciclos anteriores»" que pasó el usuario el 2026-10-08.
>
> Última actualización: 2026-10-08 · Estado: **construido y probado**.

---

## 1. Los tres modos del panel

| Modo | Cuándo | Qué muestra |
|---|---|---|
| **Ciclo** | Hay un ciclo abierto | Semáforo de la acción, etapas, barras de días y ventas, «Toda la campaña», «Ciclos anteriores» |
| **Cierre de ciclo** | El último ciclo cerró y no se confirmó | La foto del ciclo congelada, veredicto, alertas en vivo, «Desde el cierre…», botón **Continuar a Campaña en curso** |
| **Campaña en curso** | El cierre ya se confirmó y no hubo cambios | Semáforo de la campaña, ROAS, ventas, inversión y profit con selector **Total / Desde el cambio**, último veredicto, últimos 7 días contra el total, próxima revisión, alertas, «Ciclos anteriores» |

Flujo: Ciclo → (último día) → Cierre → (confirmar) → Campaña en curso →
(registrar un cambio) → Ciclo. Un cambio estando en el cierre lo deja revisado y
abre el ciclo nuevo directo.

## 2. Datos

Migración `20261009000000_ads_analizador_ciclos.sql` (aplicada): tabla
`ads_ciclos` (inicio, fin, dias_ciclo, estado `abierto | cerrado | cortado |
interrumpido`, snapshot jsonb, cerrado_en, revisado_en), única por
(campaign_id, inicio), RLS por `user_id` y FK compuesta a la campaña.

## 3. Motor (`lib/ads-analizador/ciclos.ts`, puro)

- **Duración fija**: `max(7, día de corte)` con `k = presupuesto diario de
  Meta / costo esperado` (costo esperado con los datos previos al ciclo). Se
  fija el mismo día del inicio y no se mueve ni se estira. Solo se usa un
  presupuesto leído de Meta el día del inicio o después (si es anterior podría
  ser el de antes del cambio; se espera a la siguiente actualización). Sin
  presupuesto diario en Meta (presupuesto total): gasto real promedio de los
  días 1 a 3, al cerrar el día 3; mientras, «días est.». Historia: día 1 y
  presupuesto del cambio → promedio real de 3 días → presupuesto de Meta
  (2026-10-08, a pedido del usuario: fija la fecha desde el inicio).
  Cada ciclo guarda con qué base se fijó (`duracion_base`: `presupuesto_meta`
  o `gasto_real`; migración `20261010010000_…_duracion_base.sql`). Un ciclo
  **abierto** sin base (fijado con una regla anterior) se recalcula una vez con
  la regla vigente; con base, o ya cerrado, no se toca. Caso real: TOEFL MBA
  tenía 15 días por el gasto del día 1 ($8,09, arranque a mitad de día); con el
  presupuesto de Meta ($20 / $23,60 de costo esperado) queda en 7.
- **Presupuesto de Meta** (migración `20261010000000_…_presupuesto_meta.sql`):
  el sync guarda `presupuesto_meta` (CBO o suma de conjuntos activos; null con
  presupuesto total). Es referencia: se muestra en Probabilidades y en el
  escalado, y solo entra en los cálculos si todavía no hay ningún día con
  gasto, en la duración del ciclo y en el aviso de presupuesto bajo. Reserva,
  escalado y estimaciones usan el gasto real promedio de los últimos 3 días
  completos.
- **Cierre**: al pasar el último día → `cerrado`. Con 0 ventas al alcanzar la
  inversión de corte → `cortado` (se evalúa el día del corte: una venta
  posterior no lo deshace). Un cambio con el ciclo abierto → `interrumpido`, con
  foto parcial y revisado.
- **Veredicto** (`veredictoCiclo`): cortado · pausar (bajo el empate) ·
  mantener (entre empate y piso, sobre el piso con < 10 ventas, o corte
  pendiente) · escalar (sobre el piso con margen y ≥ 10) · cambiar (sobre el
  piso pero a menos de 10 % de él: anuncios nuevos).
- **Semáforo del ciclo**: ventas ≥ piso verde, ≥ empate amarillo, si no rojo.
- **Foto** (`SnapshotCiclo`): la `VistaCiclo` (etapas con su estado final,
  días transcurridos, ventas, empate, piso, meta, ventas esperadas = inversión /
  costo esperado, ROAS) + gasto, costo por venta, profit, veredicto, nota,
  semáforo, corte cumplido e inversión de corte. El panel dibuja igual una
  vista en vivo y una foto.
- **No hay cron**: `planificarCiclos` corre al abrir la campaña y devuelve qué
  escribir; el cliente lo manda con `PUT …/ciclos` y recarga. Da lo mismo que
  a medianoche porque solo mira días completos dentro del ciclo.
- **Congelado**: un ciclo cerrado y revisado no se vuelve a calcular (ni el
  servidor lo sobrescribe). Mientras no se confirma, la foto se recalcula solo
  con los días del ciclo: una venta cargada tarde de esos días entra; lo que
  pasa después del cierre, no.
- **Ciclos anteriores sin fila** (de antes de este sprint): `legacy`, solo su
  semáforo calculado al vuelo. No se inventa su foto. Solo el ciclo vigente al
  desplegar recibe fila (y si ya terminó, se cierra al abrir la campaña).
- **Cambio deshecho**: el ciclo guardado que abría se borra.
- **Próxima revisión**: cada 7 días desde el fin del ciclo.
- **Alertas en vivo** (siempre desde el último cambio): stop-loss, corte
  pendiente (% de la inversión necesaria), últimos 7 días bajo el empate,
  frecuencia ≥ 3,5, costo por venta de los últimos 3 días ≥ 25 % sobre la
  semana anterior.

## 4. API

| Ruta | Qué |
|---|---|
| `GET /campaigns/[id]` | trae `ciclosGuardados` |
| `PUT /campaigns/[id]/ciclos` | `{ escribir, borrar }` del plan; valida forma y fechas; el servidor pone `cerrado_en` y `revisado_en`; no toca ciclos revisados |
| `PATCH /campaigns/[id]/ciclos` | `{ id }`: confirma la revisión de un ciclo cerrado (404 si no está cerrado o ya se revisó) |

## 5. Pruebas

- `unit`: 279 (51 nuevas, entre ellas: cierre, foto, veredictos, semáforo, interrumpido,
  cortado, legacy, foto congelada aunque cambie el margen, orden de claves de
  jsonb, cambio deshecho, duración fija, próxima revisión, alertas).
- `api`: 157 (ruta de ciclos con aislamiento entre usuarios, presupuesto de Meta en el sync).

## 6. Decisiones

- «Ventas esperadas» = lo que predice el modelo (inversión / costo esperado);
  va en las cifras del ciclo. La marca de la barra es «para hoy» en vivo y el
  empate en un ciclo cerrado.
- **Durante el ciclo no hay veredicto** (2026-10-08): cada campaña trae su
  `modo` (`modoDeCampana` en `load.ts`). En ciclo, la píldora de la tarjeta y del
  dashboard dice «En ciclo» (azul) y el título del semáforo es «Espera a que
  termine el ciclo para tomar decisiones»; el mensaje de abajo se mantiene.
  Excepciones: sin datos y un chequeo técnico que falla («Falla técnica»). Un
  cierre sin revisar dice «Revisar cierre». El home cuenta «En ciclo» aparte de
  Sana / Revisar / Foco rojo y ordena primero los cierres por revisar. La
  tarjeta de escalado solo aparece en «Campaña en curso».
- **Tarjetas del inicio** (2026-10-08): el medidor de ROAS y el color son de
  toda la campaña (`estadoTotal`, que arma `cargarCampanas`), no del ciclo. Ya
  no muestran banderas ni el mensaje del semáforo: nombre, tipo, píldora del
  modo, medidor y gasto / ventas / costo por venta. El contador Sana / Revisar /
  Foco rojo usa ese mismo color total.
- **Hoy en el panel** (2026-10-08): el panel del ciclo, «Toda la campaña», la
  vista «Campaña en curso» y la tarjeta del inicio suman los datos de hoy
  (`conHoy` / `resumenConHoy` en `load.ts`), igual que la tabla y los KPIs. Las
  fases, fechas, cierres, veredictos y alertas siguen usando solo días
  completos. La foto de un cierre sin revisar sigue congelada; lo nuevo se ve en
  «Desde el cierre».
