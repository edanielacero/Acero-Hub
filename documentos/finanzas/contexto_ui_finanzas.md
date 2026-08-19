# Finanzas — Documento de Contexto UI

> Dirección visual de la mini-app, extraída de las referencias que entregó el
> usuario (2026-08-17). Es la fuente de verdad de diseño: el
> `documento_maestro_finanzas.md` describe **qué** se construye, este describe
> **cómo se ve y se siente**.
>
> Aplica la regla de independencia (§5.1 del maestro): todo esto se implementa
> desde cero en `app/finanzas/theme.css` y `app/finanzas/components/`. No se
> toma nada de otra mini-app.

---

## 1. La consigna

> **En móvil tiene que verse y sentirse como una app nativa. En desktop, como un
> dashboard.**

No es la misma pantalla estirada. Son **dos layouts distintos sobre el mismo
sistema de diseño** — mismos colores, misma tipografía, mismos componentes
atómicos, distinta composición y distinta navegación.

| | Móvil (< 900px) | Desktop (≥ 900px) |
|---|---|---|
| Navegación | Tab bar flotante abajo + FAB central | Sidebar fija a la izquierda |
| Composición | 1 columna, scroll vertical largo | 2–3 columnas, cada panel con su propio scroll |
| Registro rápido | Bottom sheet a pantalla completa | Modal centrado de 480px |
| Densidad | Aireada, targets de 44px+ | Compacta, más datos por pantalla |
| Gesto principal | Pulgar (FAB abajo al centro) | Cursor (botón primario en el header) |

---

## 2. Lo que aporta cada referencia

### Referencia 1 — app de finanzas, canvas claro, acento índigo

**Es la referencia principal para móvil.** De acá sale:

- **Canvas gris muy claro** con paneles blancos redondeados encima. No es blanco
  sobre blanco: la jerarquía se construye con tono de superficie, no con sombras.
- **Tarjeta hero oscura** (casi negra) con el número grande de balance. Es el
  único bloque oscuro de la pantalla y por eso atrae toda la mirada. Lleva un
  affordance discreto arriba a la derecha (`••`) para ocultar el monto.
- **Dos tiles pasteles lado a lado** — Ingreso en menta, Gasto en durazno.
  Cada uno con un ícono en chip cuadrado redondeado (squircle) y su total abajo.
- **Filas de transacción** con chip de ícono a la izquierda, título + subtítulo
  apilados, y el monto a la derecha en verde (+) o rojo (−).
- **Tab bar con FAB circular central** en el color de acento, flotando por
  encima de la barra.
- Su acento es índigo; **nosotros lo cambiamos por verde** (ver §4). Todo lo
  demás de esta referencia se toma tal cual.

### Referencia 2 — app de finanzas, canvas verde oscuro, acento lima

De acá se toma **estructura e interacción**, no la paleta:

- **Bottom sheet** con handle de arrastre arriba, esquinas superiores muy
  redondeadas, y el fondo detrás atenuado. Es el patrón exacto del quick-add.
- **Grilla de montos preseleccionados** (`$10 · $25 · $50 · $100 · $200 · •••`)
  — acelerador de entrada que vale la pena robar para los montos frecuentes.
- **Control segmentado** Día / Semana / Mes dentro de la tarjeta de gráfica.
- **Tab bar con etiquetas de texto** bajo cada ícono, y el ítem activo en color.
- **Tiles de Income / Expenses** con dos tonos distintos y flecha direccional
  (↗ entra, ↘ sale) en vez de solo color.
- Su **canvas oscuro** queda archivado como la dirección de un futuro modo
  oscuro. No es la v1.

### Referencia 3 — dashboard de escritorio

**Es la referencia para desktop.** De acá sale:

- **Tres zonas**: sidebar izquierda fija · contenido central · rail derecho.
- **Canvas gris con paneles blancos flotando** — misma lógica de superficies que
  la referencia 1, así que las dos conviven sin fricción.
- **Sidebar** con marca arriba, lista de navegación con íconos de línea, y una
  **tarjeta al pie** que en la referencia es "Upgrade to Pro". En Finanzas ese
  slot lo ocupa el **tipo de cambio USD/BOB** editable.
- **Fila de stats** arriba del contenido: 3 métricas con ícono, valor y delta.
- **Header con saludo** (`Hello, Margaret`) y fecha a la derecha.
- **Rail derecho** con información secundaria en flujo vertical.
- **Tooltip de gráfica** oscuro con esquinas redondeadas.

---

## 3. Principios

1. **La jerarquía la hace la superficie, no la sombra.** Canvas gris → panel
   blanco → tile pastel → chip de ícono. Las sombras son casi imperceptibles y
   solo existen para despegar elementos flotantes (tab bar, FAB, sheet, modal).

2. **Un solo bloque oscuro por pantalla.** La tarjeta hero con el patrimonio. Si
   hay dos cosas oscuras, ninguna es el foco.

3. **El color es semántico, no decorativo.** Verde bosque = acción. Rojo = sale.
   Los pasteles solo tiñen contenedores y chips; nunca texto.

4. **El verde de marca y el verde de "entró plata" no se pisan.** En una app de
   finanzas el verde ya significa ingreso, así que los separamos por *forma*, no
   por tono: el verde de marca aparece **solo como superficie llena** (FAB,
   botones, chip activo) y siempre con texto blanco encima. El verde de ingreso
   aparece **solo como texto** y siempre con un `+` adelante. Nunca hay un tile
   lleno de verde de marca representando ingresos.

5. **Los números son los protagonistas.** Pesados, apretados, grandes. El texto
   descriptivo es liviano y secundario.

6. **Nada de bordes duros.** El radio es alto y consistente. Un borde de 1px solo
   aparece cuando dos superficies del mismo tono se tocan.

7. **Móvil primero, de verdad.** El quick-add se diseña para usarse parado en una
   tienda, con una mano. Si algo funciona en desktop pero no con el pulgar, se
   rediseña.

---

## 4. Tokens

Todo vive en `app/finanzas/theme.css`, aplicado sobre el div wrapper de
`app/finanzas/layout.tsx`. **No toca `app/globals.css`.**

```css
#fz-root {
  /* ── Superficies ─────────────────────────────────── */
  --fz-canvas:        #F3F4F6;  /* fondo de la página */
  --fz-surface:       #FFFFFF;  /* paneles y cards */
  --fz-surface-sunk:  #FAFAFB;  /* inputs, filas alternas */
  --fz-hero:          #12281D;  /* tarjeta oscura del patrimonio (verde) */
  --fz-hairline:      #ECEDF0;  /* separadores de 1px */

  /* ── Texto ───────────────────────────────────────── */
  --fz-ink:           #12131A;  /* títulos y montos */
  --fz-ink-2:         #6B7078;  /* descripciones */
  --fz-ink-3:         #9CA1A9;  /* horas, metadatos */
  --fz-ink-invert:    #FFFFFF;  /* sobre --fz-hero */

  /* ── 1 color principal + 1 secundario + neutros. Nada más ────────────
     Revisado 2026-08-19 (feedback directo del usuario): la app tenía "gasto"
     en rojo en Movimientos y en ámbar en Home, y siete pasteles distintos
     repartidos por categoría — mucho color para lo que tenía que decir cada
     uno. Ahora hay exactamente cuatro roles de color y ninguno más: marca,
     su contraparte sobre oscuro, semántica de dinero, y un solo neutro para
     todo lo que no es dinero. Ver §20. ── */

  /* ── Principal: verde bosque ─────────────────────── */
  --fz-accent:        #16613C;  /* FAB, botones, activo — SOLO superficies llenas */
  --fz-accent-press:  #0F4A2D;
  --fz-accent-tint:   #E4F0E9;  /* fondo de chips y tiles de marca */

  /* ── Secundario: lima, la contraparte del acento sobre superficies
     OSCURAS. Nunca sobre el canvas claro — no tiene contraste suficiente.
     Uso escaso a propósito: vidrio de la tab bar, pie de la sidebar. ── */
  --fz-lime:          #C8F169;
  --fz-lime-ink:      #12281D;

  /* ── Vidrio (tab bar) ────────────────────────────── */
  --fz-glass-bg:      rgba(18,40,29,0.72);   /* verde oscuro translúcido */
  --fz-glass-edge:    rgba(255,255,255,0.14); /* el filo de luz */
  --fz-glass-pill:    rgba(255,255,255,0.16);

  /* ── Semántica de dinero: la ÚNICA razón para usar rojo o verde fuera de
     la marca. Ingreso es siempre este verde, gasto es siempre este rojo, en
     cualquier pantalla — nunca un tercer tono para el mismo concepto. ── */
  --fz-in:            #16A34A;  /* chips, íconos, montos grandes */
  --fz-in-text:       #15803D;  /* montos chicos sobre blanco */
  --fz-in-tint:       #E3F5E9;
  --fz-out:           #E5484D;
  --fz-out-text:      #C62A2F;
  --fz-out-tint:      #FDE9EA;

  /* ── Tinte neutro de categoría/persona/nav ──────────
     Un solo tono sobrio para todo ícono que no es dinero. El glifo de línea
     diferencia una categoría de otra; el color ya no tiene que hacerlo. ── */
  --fz-tint-neutral:    #EEF0F2;
  --fz-tint-neutral-fg: #4B5259;

  /* ── Radios ──────────────────────────────────────── */
  --fz-r-card:   24px;   /* paneles, hero, sheet */
  --fz-r-tile:   20px;   /* tiles de resumen */
  --fz-r-chip:   14px;   /* squircle de ícono */
  --fz-r-field:  16px;   /* inputs */
  --fz-r-pill:   999px;  /* botones pill, tab bar, FAB */

  /* ── Sombras (casi invisibles a propósito) ───────── */
  --fz-sh-rest:  0 1px 2px rgba(16,24,40,.04);
  --fz-sh-float: 0 4px 12px rgba(16,24,40,.06), 0 16px 32px rgba(16,24,40,.06);
  --fz-sh-modal: 0 24px 64px rgba(16,24,40,.18);

  /* ── Espaciado (múltiplos de 4) ──────────────────── */
  --fz-s1: 4px;  --fz-s2: 8px;  --fz-s3: 12px; --fz-s4: 16px;
  --fz-s5: 20px; --fz-s6: 24px; --fz-s8: 32px; --fz-s10: 40px;
}
```

**El tinte neutro** es el único fondo de chip que existe para categoría,
persona y navegación — no hay una asignación por hash ni variedad de color
que guardar. Lo que identifica a una categoría es su ícono (§15), no un color
distinto por cada una.

---

## 5. Tipografía

**Plus Jakarta Sans** (`next/font/google`), un solo family para toda la app.
Geométrica, ligeramente redondeada, con numerales apretados — es la que más se
acerca al peso y la personalidad de las referencias.

```
Hero (patrimonio)    40px / 700 / tracking -0.02em / line-height 1.05
Stat grande          26px / 700 / tracking -0.01em
Título de sección    19px / 700
Título de fila       15px / 600
Cuerpo               15px / 500
Campo de formulario  16px / 500  ← mínimo obligatorio, ver abajo
Monto en lista       15px / 600 / tabular-nums
Etiqueta             13px / 500
Caption / hora       12px / 500 / --fz-ink-3
```

- **Todos los montos en listas y tablas llevan `font-variant-numeric:
  tabular-nums`** para que las columnas se alineen.
- El hero usa cifras proporcionales — se ve más apretado y deliberado.
- Pesos usados: 500, 600, 700. Nada de 400 (se ve lavado sobre gris claro) ni
  800.
- **Todo `input`, `select` y `textarea` va en 16px como mínimo.** Safari en iOS
  hace zoom automático al enfocar un campo con menos de 16px, y después no
  vuelve solo. No es una preferencia estética: por debajo de ese número la app
  se siente rota en el celular.

### Formato de montos

| Caso | Formato |
|---|---|
| USD | `$1,299.00` |
| BOB | `Bs 300.00` |
| Gasto en lista | `−$5.03` con `--fz-out-text` |
| Ingreso en lista | `+$100.00` con `--fz-in-text` |
| Transferencia | `$100.00` neutro, con ícono de flechas |
| Equivalencia | `Bs 300.00 · ≈ $43.10` — el equivalente en `--fz-ink-3` |
| Oculto | `••••` |

El signo `−` es el menos tipográfico (U+2212), no un guion.

---

## 6. Componentes base

Todos se escriben en `app/finanzas/components/`.

### Chip de ícono (`<IconChip>`)
Cuadrado de 40×40 (48×48 en el hero), `border-radius: var(--fz-r-chip)`, fondo
en el tinte de la categoría, ícono de línea de 20px en el `-fg` de ese tinte.
Es el átomo visual que más se repite en toda la app.

### Ícono de moneda (`<CurrencyIcon>`)

Logos reales, embebidos como SVG dentro del componente:

| | Ícono | Origen |
|---|---|---|
| USD | Bandera de EEUU | HatScripts/circle-flags (MIT) |
| BOB | Bandera de Bolivia | HatScripts/circle-flags (MIT) |
| USDT | Logo de Tether | spothq/cryptocurrency-icons (CC0) |
| USDC | Logo de USD Coin | spothq/cryptocurrency-icons (CC0) |
| BTC | Logo de Bitcoin | spothq/cryptocurrency-icons (CC0) |

**Van inline, no como `<img src>` ni vía paquete npm.** Los cinco juntos pesan
~4 KB: no dependen de que un CDN siga vivo, no agregan cinco requests a cada
pantalla, no parpadean al cargar, y no meten una dependencia nueva en el
`package.json` del Hub.

Dos detalles que hicieron falta al integrarlos:

- **El círculo lo recorta el contenedor por CSS, no una `<mask>` del SVG.**
  Las banderas venían recortadas con una máscara referenciada por `id`. Al
  repetirse el ícono en la página — hay 9 cuentas en Bs — quedaban 9 elementos
  con el mismo id, y WebKit dejaba de resolver la referencia: **la bandera se
  dibujaba cuadrada en el iPhone**. Ahora el componente no tiene ningún `id`
  interno, así que no hay nada que colisionar.

  Se recorta con `clip-path: circle(50%)` **además** de `overflow: hidden` +
  `border-radius`: WebKit no siempre recorta por radio cuando el elemento
  comparte contexto con un `backdrop-filter`, que es justo el caso de la tab bar.
- **Llevan un aro de `rgba(0,0,0,0.1)`**, ahora como `box-shadow: inset` del
  contenedor. Sin él, las franjas blancas de la bandera de EEUU se funden con el
  canvas claro y el ícono pierde el filo. En CSS escala solo y no depende del
  viewBox, que no es igual entre banderas (512) y cripto (32).

Aparece en cuatro lugares: el selector al crear una cuenta, las listas de
cuentas (Home y Cuentas), la lista de tasas en Ajustes, y la tarjeta de tipo de
cambio del dashboard.

### Tarjeta hero (`<HeroBalance>`)
Fondo `--fz-hero`, radio `--fz-r-card`, padding 24px. Contiene: etiqueta
("Patrimonio total") en blanco al 60%, el monto en 40/700, y debajo el delta
neto del mes con signo (§16.1/§18) en `--fz-in`/`--fz-out` — nunca lima, ver
§20. **Sin toggle de ocultar propio** (el del header alcanza, §20) y **sin
marca de agua** (§20).

### Tile de resumen (`<StatTile>`)
Fondo en tinte, radio `--fz-r-tile`, padding 16px. Chip de ícono arriba,
etiqueta, y valor en 26/700. En móvil van de a dos; en desktop de a tres o
cuatro en fila.

### Fila de movimiento (`<TxRow>`)
`[chip 40px] [título / descripción] ......... [monto / hora]`
Altura mínima 64px. Se agrupan por día con un encabezado sticky que muestra la
fecha y el neto del día.

### Panel (`<Panel>`)
Fondo `--fz-surface`, radio `--fz-r-card`, `--fz-sh-rest`, padding 20–24px. Es
el contenedor de todo en desktop, y de los bloques agrupados en móvil.

### Tab bar (`<TabBar>`) — solo móvil · **frosted glass**

**Pill flotante ancho**, al estilo de las tab bars de iOS 26: llega casi a los
bordes pero nunca los toca.

```css
.fz-tabbar {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  left: 12px; right: 12px; width: auto;   /* no max-content */
  border-radius: 999px;
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border: 0.5px solid rgba(255,255,255,0.7);   /* el filo de luz */
  box-shadow: 0 8px 32px rgba(16,24,40,0.12), 0 2px 8px rgba(16,24,40,0.06);
  padding: 8px;
}
```

**Por qué neutro y no verde:** con la tarjeta del patrimonio, el acento de los
botones y la barra, había tres verdes peleando y ninguno mandaba. El vidrio
blanco escarchado deja que el verde signifique una sola cosa: acción.

`saturate(180%)` es lo que hace que se vea el color de lo que scrollea debajo;
solo con `blur` el panel se lee como un gris plano. Donde más se aprecia es
cuando la tarjeta oscura del patrimonio pasa por detrás.

**Los tabs son flexibles** (`flex: 1 1 0; max-width: 96px`), no de ancho fijo:
cinco slots de 64px más el padding se salían de una pantalla de 320px. Por eso
el pill indicador **también mide su ancho** además de su posición — no hay un
valor que el CSS pueda asumir.

Cinco slots, con etiqueta bajo cada ícono:

```
  Inicio   Movimientos   ( + )   Cuentas   Ajustes
```

- Ítem activo: ícono `*Filled` + etiqueta en `--fz-accent`, con el pill detrás.
- El `(+)` es un círculo de 46px en `--fz-accent`.
- Del CSS rescatado se conserva la curva con rebote
  `cubic-bezier(0.32, 1.2, 0.4, 1)`, el `env(safe-area-inset-bottom)`, y la
  medición con `getBoundingClientRect()` + `nav.clientLeft` en `useLayoutEffect`.
- **La reserva de scroll va como `padding-bottom` del contenedor**
  (`88px + safe-area`), no como un div al final: un spacer suelto agregaba
  scroll fantasma en páginas que entraban en pantalla.

### Hasta dónde llega el vidrio en Safari

La refracción de Apple —el borde que deforma lo que hay detrás— se implementa
con filtros SVG `feDisplacementMap` aplicados al backdrop. **WebKit no los
aplica**, así que en iPhone no es reproducible, con librería o sin ella.

Lo que Safari sí soporta, y que se usa para dar grosor al vidrio:

| Técnica | Para qué |
|---|---|
| `blur(30px) saturate(180%)` | Difumina y deja pasar el color de lo que scrollea debajo |
| `brightness(1.06)` | Simula la luz que atraviesa el vidrio |
| Gradiente vertical en el fondo | Sin él el panel se lee como plástico plano |
| `inset 0 1px 0 rgba(255,255,255,0.85)` | Reflejo especular en el canto superior |
| `inset 0 -1px 0 rgba(16,24,40,0.05)` | Sombra interna abajo: sensación de espesor |

### El negro del Hub en iOS

El Hub pinta `html, body` en `#0a0a0a`. Ese negro asomaba **detrás de la barra
de estado del iPhone** y en el rebote del scroll — y en Finanzas no hay ningún
negro. Se corrige en dos frentes, los dos dentro de la mini-app:

```css
/* :has() hace que la regla solo aplique cuando Finanzas está montada, así que
   el tema del Hub y el de las otras mini-apps quedan intactos. */
html:has(#fz-root), body:has(#fz-root) {
  background-color: #F3F4F6;
  overscroll-behavior-y: none;   /* el rebote deja de descubrir el fondo */
}
```

```ts
// app/finanzas/layout.tsx — pinta la barra del navegador en iOS
export const viewport: Viewport = { themeColor: '#F3F4F6', viewportFit: 'cover' }
```

Si el navegador no soporta `:has()`, la regla se ignora y el `themeColor` sigue
resolviendo la barra de estado: degrada sin romper nada.

### Campo de monto del quick-add

```
  [🇧🇴] BOB    1,354.29
       Disponible Bs 1,354.29   [MAX]
```

La moneda va **siempre a la izquierda**, con el ícono circular y el código a
ancho fijo. Antes el símbolo cambiaba de lado según la moneda — `$` y `Bs` a la
izquierda, `USDT` y `BTC` a la derecha y con otro cuerpo de letra — así que el
campo cambiaba de forma al elegir otra cuenta.

Dos detalles que hacen que nada se mueva:

- **El código tiene ancho fijo (48px).** `USDT` y `USDC` tienen cuatro letras y
  `USD`/`BOB`/`BTC` tres: sin ancho fijo el número arrancaba en un punto
  distinto según la cuenta, que era el mismo salto que se quería eliminar.
- **El ícono reemplaza al símbolo.** Ya identifica la moneda sin ambigüedad y
  reusa el sistema de íconos, en vez de mezclar tres convenciones distintas.

### Bottom sheet (`<Sheet>`) — móvil
Sube desde abajo, esquinas superiores a 28px, handle de 36×4px centrado arriba,
backdrop `rgba(16,24,40,.35)`. Cierra por gesto hacia abajo, tap en el backdrop
o `Esc`. En desktop el mismo contenido se renderiza como modal centrado de
480px con radio `--fz-r-card`.

### Sidebar (`<Sidebar>`) — solo desktop
Panel blanco de 248px, fijo, con: marca "Finanzas" arriba, navegación con íconos
de línea (ítem activo con fondo `--fz-accent-tint` y texto `--fz-accent`),
y al pie la **tarjeta de tipo de cambio** — el slot que en la referencia 3 ocupa
"Upgrade to Pro".

---

## 7. Layout móvil (< 900px)

```
┌─────────────────────────────┐
│  Buenos días                │  ← saludo + nombre
│  Daniel              🔔     │
│                             │
│ ┌─────────────────────────┐ │
│ │ Patrimonio total    ••  │ │  ← hero oscuro
│ │ $3,209.00               │ │
│ │ ▬▬▬▬▬▬▬▬░░░░░░░░░░      │ │
│ └─────────────────────────┘ │
│                             │
│ ┌──────────┐ ┌──────────┐   │
│ │ 📥       │ │ 📤       │   │  ← tiles menta / durazno
│ │ Ingresos │ │ Gastos   │   │
│ │ $900     │ │ $142     │   │
│ └──────────┘ └──────────┘   │
│                             │
│ Cuentas          Ver todas  │
│ ● Airtm            $1,299   │
│ ● Broker             $980   │
│                             │
│ Movimientos      Ver todos  │
│ [🍽] Almuerzo      −$5.03   │
│ [🚕] Taxi          −$2.15   │
│                             │
│     ╭───────────────╮       │
│     │ ⌂  ⇄ (+) ▣  ⚙ │       │  ← tab bar flotante
│     ╰───────────────╯       │
└─────────────────────────────┘
```

- El contenido lleva `padding-bottom: 104px` para no quedar bajo la tab bar.
- Scroll con momentum, sin scrollbars visibles.
- Todo target táctil ≥ 44×44px.
- Sin hovers: los estados son `:active` con `transform: scale(0.97)`.

---

## 8. Layout desktop (≥ 900px)

**Dos columnas, no tres.** Revisado 2026-08-19 — ver §20. La sidebar es fija;
todo lo demás, incluida la que antes era una tercera columna de "Cuentas",
vive en una sola columna de contenido que scrollea entera.

```
┌────────┬────────────────────────────────────────┐
│        │  Buenos días, Daniel              [👁]  │
│ Finanzas│  domingo 17 de agosto                  │
│        │                                        │
│ ⌂ Inicio│  Patrimonio total                      │
│ ⇄ Movim.│  $27,120.45                            │
│ ▣ Cuent.│  ↗ +$758.42 este mes                    │
│ ⚙ Ajust.│                                        │
│        │  [ Gasto ] [ Ingreso ] [ Transferir ]   │
│        │  ┌────────┐ ┌────────┐                 │
│        │  │ Ingr.  │ │ Gasto  │                  │
│ ┌─────┐│  │  900   │ │  142   │                  │
│ │ USD ││  └────────┘ └────────┘                  │
│ │ BOB ││                                        │
│ │6.96 ││  Cuentas                    Ver todas   │
│ └─────┘│  ┌────────┐ ┌────────┐                 │
│        │  │ Airtm  │ │ Broker │ →                │
│        │  │ $1,299 │ │  $980  │                  │
│        │  └────────┘ └────────┘                  │
│        │                                        │
│        │  Movimientos                Ver todos   │
│        │  ┌──────────────────────────┐          │
│        │  │ hoy, 17 ago       −$7.18 │          │
│        │  │ Almuerzo          −$5.03 │          │
│        │  └──────────────────────────┘          │
└────────┴────────────────────────────────────────┘
   248px         fluido, una sola columna que scrollea
```

- **Sin tab bar ni FAB.** Tampoco hay un botón "+ Nuevo movimiento" aparte: los
  tres botones Gasto/Ingreso/Transferir bajo el hero son la única puerta de
  entrada, en desktop igual que en móvil (§16.3 / §20).
- Contenedor con `max-width: 1440px`, centrado, gap de 20px entre sidebar y
  contenido.
- La sidebar es `sticky`; el contenido es una columna normal que scrollea con
  la página — no hay una zona con su propio scroll interno independiente.

### Regla anti-desborde (mobile first)

El desborde horizontal en móvil no es cosmético: la página gana scroll lateral y
el tab bar —que es `position: fixed` contra el viewport— **se desincroniza del
contenido** al desplazarse. Se ve como si la barra cambiara de tamaño y saltara.

La causa casi siempre es la misma: **los hijos de un grid o de un flex tienen
`min-width: auto` por defecto**, así que no encogen por debajo de su contenido y
estiran al contenedor. Tres reglas:

1. **Todo hijo de grid/flex que contenga texto lleva `min-w-0`.** Sin eso,
   `truncate` no hace nada: el elemento nunca llega a estar apretado.
2. **Los montos grandes bajan de cuerpo en pantallas angostas**
   (`text-[21px] min-[400px]:text-[26px]`) además de truncar. Un monto cortado
   con elipsis es peor que uno chico: `$1,04…` no se puede leer.
3. **Los campos llevan `min-w-0` en su clase base.** Un `<select>` se dimensiona
   por su opción más larga; como hijo directo de un grid estiraba la columna
   entera.

Como red de seguridad, el contenedor del contenido lleva `overflow-x: clip`. Va
ahí y no en `#fz-root` porque `<TabBar>` es **hermano** de ese contenedor, no
descendiente: recortar ahí nunca puede afectar su posicionamiento fijo.

### Breakpoints

| Rango | Modo |
|---|---|
| `< 900px` | **App**: 1 columna, tab bar + FAB, sheets |
| `≥ 900px` | **Dashboard**: sidebar fija + 1 columna de contenido que scrollea entera. No hay un tercer nivel a partir de 1280px: la vieja distinción "compacto / completo" desaparece con el rail derecho (§20) |

Un solo árbol de componentes con CSS responsive. Nada de renderizar dos veces
según el ancho.

---

## 9. Accesibilidad

- **Contraste verificado sobre blanco:** el acento `#16613C` da **7.48:1** —
  pasa AA a cualquier tamaño, así que sirve tanto de superficie como de texto
  (una ventaja concreta del verde bosque sobre el índigo anterior, que no
  llegaba a 4.5:1 en texto chico). En el dinero sí hay dos tonos:
  `--fz-in: #16A34A` (3.30:1) para chips e íconos, `--fz-in-text: #15803D`
  (5.02:1) para montos en lista, y `--fz-out-text: #C62A2F` (5.57:1).
- **La lima `#C8F169` nunca va sobre el canvas claro** (1.3:1, ilegible). Vive
  exclusivamente sobre `--fz-hero` y sobre el vidrio de la tab bar, donde da
  14:1 contra el verde oscuro.
- **Nunca solo color.** Ingreso y gasto siempre llevan además el signo `+`/`−`,
  y los tiles llevan flecha direccional ↗ / ↘.
- `prefers-reduced-motion: reduce` → se desactivan el deslizamiento del pill y
  las transiciones de sheet; los cambios de estado quedan instantáneos.
- Foco visible: anillo de 2px en `--fz-accent` con 2px de offset.
- El toggle de ocultar montos anuncia su estado por `aria-pressed`.

---

## 10. Movimiento

Discreto y rápido. Sirve para explicar de dónde viene algo, no para lucirse.

| Elemento | Duración | Curva |
|---|---|---|
| Pill de la tab bar | 260ms | `cubic-bezier(.32,.72,0,1)` |
| Bottom sheet entrando | 320ms | `cubic-bezier(.32,.72,0,1)` |
| Modal desktop | 180ms | `ease-out` |
| Press de botón | 120ms | `ease-out` |
| Actualización de monto | 200ms | fade, sin contador animado |

Sin animaciones de entrada en las listas — retrasan la lectura del dato, que es
lo único que importa acá.

---

## 11. Qué NO se hace

| Fuera | Razón |
|---|---|
| Modo oscuro | Una sola paleta bien resuelta primero. La referencia 2 queda archivada como dirección futura |
| Librería de React para el efecto vidrio | Evaluada `rdev/liquid-glass-react` (5.9k ★, MIT). Su propio README avisa: *"Safari and Firefox only partially support the effect (displacement will not be visible)"*. Usa `feDisplacementMap` sobre el backdrop, que WebKit no aplica — y **todo navegador en iOS es WebKit**. El tab bar solo existe en móvil, así que la refracción no se vería nunca donde importa. Último commit: junio 2025 |
| Logos de marcas en las filas | Las referencias muestran Netflix, Spotify, Wise. Requiere un catálogo de assets. Se usan chips de categoría con ícono |
| Fotos de perfil / avatares | Es una app de un solo usuario |
| Librería de componentes o de gráficas | Se escribe todo a mano con Tailwind v4 y SVG. Los íconos de moneda son la excepción: son logos reales, embebidos |
| Gráficas | No hay ninguna en el Sprint 1. El estilo (línea fina, tooltip oscuro, control segmentado) queda documentado para cuando lleguen |
| Ilustraciones en estados vacíos | Un ícono, una frase y un botón. Nada más |

---

## 12. Decisiones cerradas y abiertas

### ✅ Cerradas

1. **Acento: verde.** Verde bosque `#16613C` para superficies de marca, lima
   `#C8F169` como su contraparte sobre oscuro, hero card en `#12281D`. El canvas
   sigue **claro** — el verde es la identidad, no el fondo.

2. **Liquid glass: sí, con el CSS propio.** No se agrega ninguna librería de
   React. El material se reformula a vidrio verde oscuro (§6). Razones en
   `documento_maestro_finanzas.md` §5.1 (regla de independencia) y en el análisis
   de esta decisión: lo que ya está escrito resuelve la parte difícil —
   posicionar el pill con `getBoundingClientRect()`, el `clientLeft`, el
   `useLayoutEffect` para no ver el salto en el primer paint, la curva con
   rebote, el safe-area. Una librería aporta el material, no eso.

### 🔲 Abiertas

3. **Saludo con hora.** "Buenos días / Buenas tardes / Buenas noches" según la
   hora, o un encabezado fijo con el mes en curso. Lo primero es más cálido, lo
   segundo más útil.

4. **Barra de proporción en el hero.** La referencia 1 tiene un degradado dentro
   de la tarjeta oscura. Puede representar gasto vs. ingreso del mes, o no
   incluirse hasta que haya presupuesto (sprint 5) y signifique algo concreto.

5. **Verificar el vidrio en Safari iOS real.** `backdrop-filter` sobre un
   elemento fijo, encima de una lista que scrollea, es el caso donde más se
   degrada. Si aparece jank en el dispositivo del usuario, el plan B es un
   fallback opaco (`--fz-glass-bg` sin alpha) detrás de
   `@supports not (backdrop-filter: blur(1px))`.

---

# Segunda ronda de referencias — 2026-08-19

> Esta parte se agrega sobre el documento original, no lo reemplaza. Los §1–12
> siguen vigentes salvo donde acá se diga explícitamente que se revisan (§18).
> Disparador: **la UI actual usa emojis y se lee infantil.**

---

## 13. Por qué se van los emojis

No es una cuestión de gusto. Los emojis rompen tres sistemas que el documento
original ya había definido bien:

1. **Anulan el sistema de tintes.** `IconChip` pinta el glifo con
   `color: var(--fz-tint-*-fg)`. Un emoji es una **imagen a color**: ignora esa
   propiedad. El resultado es que los 7 tintes cuidadosamente elegidos quedan de
   fondo mientras 14 paletas ajenas —el naranja del 🍽️, el amarillo del 💡, el
   rosa del 🎁— pelean encima. Esa es la causa real del efecto infantil: no es
   el emoji, es que hay quince paletas donde el documento definió una.

2. **Cambian por plataforma.** 🍽️ en iOS, en Android y en Windows son tres
   dibujos distintos, con tres pesos y tres cajas ópticas. Una app que se quiere
   ver nativa no puede delegar su iconografía al sistema operativo.

3. **No se alinean.** Cada emoji tiene métricas propias, así que dentro de un
   chip de 40×40 ninguno cae en el mismo centro óptico que el anterior. En una
   lista de movimientos —que es la pantalla más larga de la app— el ruido se
   acumula fila a fila.

Y hay una cuarta señal, más barata de leer: **hoy hay tres fallbacks distintos
para el mismo hueco.**

| Lugar | Fallback |
|---|---|
| `components/tx-row.tsx:73` | `category?.emoji ?? '•'` |
| `screens/fijos.tsx:146` | `r.emoji ?? r.name.charAt(0)` |
| `screens/deudas.tsx:77` | `d.person.emoji ?? d.person.name.charAt(0)` |

Tres respuestas para "¿y si no hay emoji?" es la definición de que no hay
sistema. Se suman los 6 emojis hardcodeados en estados vacíos (📡 🏦 📝 🔍 🤝 🔁)
y el editor de Ajustes, que es literalmente **un `<input type=text>` donde se
pega un emoji con el teclado del sistema** (`screens/ajustes.tsx:363-370` y
`:447-454`). Eso no es un control: es un hueco.

**Ninguna de las seis referencias que entregó el usuario usa un solo emoji.**

---

## 14. Lo que aportan las referencias nuevas

### Referencia 4 — Wallet, canvas gris claro, acento lima

- **Tarjeta lima como objeto físico**, con degradado, número enmascarado
  (`•••• 3090`), el ícono de contactless, "Total due" abajo a la izquierda y un
  botón pill negro "Pay now" **dentro** de la tarjeta.
- **Puntos de paginación** bajo la tarjeta: hay más de una y se desliza.
- **Filas de cuenta como pills independientes** con gap entre ellas, cada una
  con ícono a color, nombre, monto y chevron. No es una lista con divisores.
- **Título de sección que ES el link**: `Accounts ›`, `Watch list ›`. Un solo
  elemento en vez de título + "Ver todas" a la derecha.
- **Tarjeta de gráfica**: título con ícono, período a la derecha ("Last 7 days"),
  etiqueta "Total growth", monto grande, **delta en verde entre paréntesis**
  `(+6.2%)` en línea con el monto, y barras verdes/rojas con iniciales de día.
- **Watch list**: logo real de cada activo en círculo, ticker + símbolo apilados
  a la izquierda, precio + delta apilados a la derecha, delta coloreado.
- Tab bar de 4 íconos de línea monocromos, **sin etiquetas**, activo en relleno.

### Referencia 5 — canvas verde, paneles de vidrio, hero amarillo

- **Hero amarillo con tinta oscura.** Etiqueta de moneda arriba, ojo tachado a la
  derecha, monto enorme, y **delta debajo** (`+$421.03`).
- **Micro-línea de tipo de cambio** bajo el nombre de la moneda:
  `1 USD = EUR 0.95 = GBP 0.79`. Información, no adorno.
- **Tres acciones rápidas en fila** bajo el hero: Pay · Transfer · Receive, cada
  una ícono circular de línea + etiqueta.
- **Selector de cuenta en el header**, como pill: `[mastercard] •••• 2872 ⌄`.
  Cambiar de cuenta no requiere ir a otra pantalla.
- **Filas de transacción identificadas por persona o marca** —foto de Eva Novak,
  logo de Binance, de Nike, de Megogo— y el subtítulo es el **estado**
  (`Received ⓘ` / `Paid ⓘ`), no la categoría.
- Agrupación por día con encabezados `Today` / `Yesterday` / `19 November`.
- **Tiles de moneda** abajo: cuadrados chicos con bandera, código y tasa, más un
  tile negro `+ Add Currency` que cierra la grilla.
- **Pantalla de monto con teclado propio**: destinatario arriba, monto gigante,
  `Balance: $126,887.09` debajo, campo de nota, teclado numérico y pill negro
  "Send" a lo ancho.

### Referencia 6 — Neobank, blanco, tarjetas lima

- **Saludo de dos líneas**: `Good morning, Terry` en bold + `Welcome to Neobank`
  chico debajo. Campana de notificación con badge a la derecha.
- **Tarjeta de balance con el CTA adentro**: monto, ojo tachado, y un pill negro
  "Add money" a todo el ancho **dentro** de la tarjeta.
- **Carrusel horizontal de tarjetas con peek**: la siguiente asoma por el borde
  derecho. El recorte es el affordance — dice "deslizá" sin escribirlo.
- **Marca de agua repetida** (`N.NEO.NEO.NEO`) a muy baja opacidad sobre la
  tarjeta lima. Es lo que la hace sentir un objeto y no un div de color.
- **Chip de cashback** `+$1.65` en pastilla lima **bajo el monto**, en la columna
  derecha de la fila.
- **Selector horizontal con estado seleccionado** (aro oscuro alrededor de la
  tarjeta elegida) y lista de métodos con ícono de línea + etiqueta + chevron.
- **Perfil**: avatar grande con lápiz de editar, y tarjetas agrupadas
  (`Personal info` con "Edit" en el encabezado) de filas etiqueta/valor con
  ícono de línea a la izquierda.
- Jerarquía por **hairline de 1px**, casi sin sombras. Muchísimo aire.

---

## 15. El sistema que reemplaza al emoji

Las tres referencias nuevas coinciden en algo más fuerte que "no usar emojis":
usan **tres familias de marca visual, y la forma dice de qué tipo de cosa se
trata antes de leer el texto.**

| Familia | Forma | Identifica | En las refs |
|---|---|---|---|
| Ícono de línea monocromo | **Squircle** en tinte | Una categoría o una acción | Tab bars, `Move your direct deposit`, Pay/Transfer/Receive |
| Logo de marca a color | **Círculo** | Un comercio o un activo | BTC/ETH/SOL, Netflix, Nike, Binance, Starbucks |
| Foto o monograma | **Círculo** | Una persona | Eva Novak, Matteo Ricci, el avatar de perfil |

Hoy en Finanzas **categorías, personas y fijos usan todos el mismo squircle con
emoji**: se leen como la misma clase de objeto cuando son tres cosas distintas.
La app ya tiene la cuarta familia bien resuelta —`CurrencyIcon`, círculo con
bandera o logo cripto— así que el sistema ya existe, solo que aplicado a una
sola dimensión.

### Mapa de categorías → íconos

`@tabler/icons-react` **ya es dependencia del proyecto** (lo usan `tx-row.tsx`,
`home.tsx`, `tab-bar.tsx`). No hace falta agregar nada. Nombres verificados
contra el paquete instalado:

| Categoría | Ícono | Categoría | Ícono |
|---|---|---|---|
| Comida | `IconToolsKitchen2` | Educación | `IconBook2` |
| Transporte | `IconCar` | Otros (gasto) | `IconPackage` |
| Vivienda | `IconHome` | Sueldo | `IconBriefcase` |
| Servicios | `IconBolt` | Freelance | `IconDeviceLaptop` |
| Suscripciones | `IconDeviceMobile` | Extraordinario | `IconGift` |
| Salud | `IconHeartbeat` | Otros (ingreso) | `IconCoins` |
| Personal | `IconSparkles` | | |
| Ocio | `IconMovie` | | |

### Cómo se guarda

La columna `emoji` de `categories`, `people` y `recurring` pasa a guardar un
**slug** (`comida`, `transporte`, …) en vez de un carácter. Un componente
`<CategoryIcon slug>` mapea slug → componente de Tabler, con **un único
fallback**: monograma con la inicial en el tinte de la categoría. Un solo
fallback, no tres.

El editor de Ajustes deja de ser un campo de texto y pasa a ser una **grilla de
íconos seleccionables** — el mismo patrón del selector de tarjetas de la ref 6,
con aro oscuro en el elegido.

---

## 16. Hallazgos concretos sobre lo que ya tenemos

Ordenados por cuánto cambian la percepción de la app, no por esfuerzo.

### 16.1 El hero dice metadatos donde podría decir un número

Hoy la tercera línea es `3 cuentas · convertido a la tasa de hoy`. Las tres
referencias ponen en ese lugar un **delta**: ref 4 `(+6.2%)`, ref 5 `+$421.03`.

Propuesta: `↗ +$421.03 este mes` bajo el patrimonio, y la tasa baja a una
**micro-línea al estilo ref 5** — `1 USD = Bs 6.96`. En Bolivia esa cifra se
mira todos los días: decirla es más útil que decir que se usó.

*Cierra la decisión abierta #4 del documento original con algo mejor que la
barra de proporción: un número, no una barra sin escala.*

### 16.2 El toggle de ocultar está fuera de la tarjeta

`HideToggle` vive en el `PageHeader` (`home.tsx:88`). Ref 5 y ref 6 lo ponen
**dentro de la tarjeta de balance**, arriba a la derecha, como ojo tachado.

**Revertido en §20**: se implementó así y el usuario lo sacó — con uno en el
header y otro adentro del hero eran dos botones para la misma acción a
centímetros de distancia. Queda uno solo, en el header.

### 16.3 No hay acciones rápidas bajo el hero

Hoy el único camino para registrar es el FAB genérico → abrir sheet → elegir
tipo. Ref 5 tiene Pay · Transfer · Receive en fila bajo el hero.

Tres botones —**Gasto · Ingreso · Transferencia**— que abran el sheet con el tipo
ya puesto ahorran un toque en **todos** los registros.

**Ajustado en §20**: el tipo solo son tres — gasto, ingreso, transferencia —
no hay un cuarto caso "no sé todavía qué es" que justifique un botón genérico
al lado. Por eso el header de Home dejó de tener un "+ Nuevo movimiento": era
la misma acción que estos tres botones, con un paso extra. Y el sheet que
abren ya no muestra el selector de tipo — mostrarlo dejaba elegir cualquier
otro tipo desde ahí, así que el botón específico no cambiaba nada. El FAB
genérico de la tab bar (móvil) y el "Nuevo" de Movimientos sí lo conservan:
son la única entrada en pantallas sin los tres botones.

### 16.4 Las cuentas son una lista truncada a 3

`home.tsx:266` corta con `.slice(0, 3)` y manda el resto a "Ver todas". Ref 6 las
muestra como **carrusel horizontal con peek**: la siguiente asoma por el borde.

`CurrencyIcon` ya existe; una tarjeta de cuenta con bandera, nombre, saldo y
equivalencia en USD llena ese formato sin un solo asset nuevo, y deja de esconder
información detrás de un link.

### 16.5 El hero es un rectángulo plano

`#12281D` sólido se lee como un div de color. Las tres referencias tratan la
tarjeta de dinero como **objeto físico**: degradado (ref 4), marca de agua
repetida a ~4% de opacidad (ref 6), logo de red arriba a la derecha (ref 5 y 6).

Un gradiente radial muy sutil desde la esquina superior derecha + una marca de
agua tipográfica no suman ni un KB y son la diferencia entre "una tarjeta" y
"un rectángulo verde".

### 16.6 La lima está desaprovechada

El §4 la encierra en *"solo sobre `--fz-hero` y sobre el vidrio de la tab bar"*.
Pero **las tres referencias nuevas usan lima o amarillo como superficie de una
tarjeta entera, con tinta oscura encima** — es su firma visual, lo que hace que
se vean como se ven.

`#C8F169` sobre `#12281D` da **≈11.8:1**. La regla que hay que conservar es
*"lima nunca como **texto** sobre canvas claro"* (ahí sí es ilegible, 1.3:1).
Como **superficie** con tinta oscura es legítima, accesible, y es exactamente lo
que falta para que la app se parezca a las referencias.

Candidatos: la tarjeta de una cuenta destacada, el bloque de "Te deben", el chip
de "tu parte". **No el hero** — el §3.2 sigue mandando: un solo bloque dominante.

### 16.7 Falta la pastilla de delta en la columna derecha

Ref 4: `+$1,204.50 (+1.47%)`. Ref 6: `+$1.65` en pastilla lima bajo el monto.

Hoy la columna derecha de `TxRow` tiene monto + equivalencia o "tu parte" en
texto pelado, y el chip de "generó N deudas" está **pegado al título** —
compitiendo con el nombre del movimiento. La pastilla bajo el monto es su lugar
natural: es donde el ojo ya está mirando cuando le importa la plata.

### 16.8 Los `StatTile` no comparan contra nada

`Gastos de agosto · $142` sin referencia no dice nada. Ref 4 rotula el período
("Last 7 days") y muestra el crecimiento en %.

Un `vs. julio ↓12%` convierte el tile de **dato** en **juicio**, que es para lo
que uno abre una app de finanzas.

### 16.9 Los estados vacíos usan emoji de 32px

📡 🏦 📝 🔍 🤝 🔁 en `home.tsx`, `movimientos.tsx`, `deudas.tsx`, `fijos.tsx`.
Reemplazo directo: ícono de línea de 24px dentro de un **círculo de 56px en
tinte neutro** (`IconWifiOff`, `IconBuildingBank`, `IconNotes`, `IconSearch`,
`IconUsersGroup`, `IconRepeat`).

### 16.10 Las personas usan el mismo chip que las categorías

`deudas.tsx:77` renderiza `IconChip` (squircle) con el emoji de la persona.
Según §15, una persona va en **círculo con monograma** — inicial sobre tinte
determinístico por nombre, igual que `tintFor()` ya hace. Separa "persona" de
"categoría" de un vistazo, sin leer.

### 16.11 Los fijos son marcas, no categorías

Spotify y TradingView no son "Suscripciones": son Spotify y TradingView. Ref 5 y
ref 6 muestran Netflix, Nike, Binance y Starbucks **con su logo real**, y de ahí
sale buena parte del aire premium que tienen.

El §11 descartó esto por *"requiere un catálogo de assets"* — correcto para un
catálogo general. Pero **un set curado de 8–12 marcas que el usuario realmente
paga** es tractable: SVG inline, exactamente el patrón ya validado en
`CurrencyIcon` (§6), con fallback al ícono de categoría cuando no hay logo.

### 16.12 Detalles menores que suman

| Hoy | Referencia | Cambio |
|---|---|---|
| `SectionTitle` + "Ver todas ›" a la derecha | Ref 4: `Accounts ›`, el título **es** el link | Un elemento menos por sección |
| Header sin notificaciones | Ref 4 y 6: campana con badge | En Finanzas tendría contenido real: fijos que faltan, deudas por cobrar |
| Home sin gráfica | Ref 4: barras de 7 días verde/rojo con delta | §11 lo difirió; con varios meses cargados ya es el bloque que más eleva la Home |
| Filas dentro de un panel con `divide-y` | Ref 4: cada fila es un pill independiente con gap | Es una alternativa, no una mejora — ref 6 usa divisores igual que nosotros. **Se queda como está.** |

---

## 17. Lo que ya está bien y no se toca

Vale decirlo para no rehacer lo que las referencias confirman:

- **Canvas gris + paneles blancos + un bloque oscuro.** Ref 4 y ref 6 hacen
  exactamente eso.
- **Agrupación por día con `Hoy` / `Ayer`** — ya implementada en
  `movimientos.tsx` vía `groupByDay()` + `formatDayLabel()`. Es literalmente el
  patrón de ref 5.
- **`CurrencyIcon` con logos reales inline.** Es la familia de íconos que las
  referencias usan para activos, y ya está resuelta, incluidos los bugs de
  WebKit documentados en §6.
- **Tab bar de vidrio con etiquetas y FAB central.** Ref 5 tiene el círculo
  central; ref 6 tiene las etiquetas. Está respaldada.
- **Flechas direccionales ↗ ↘ en los tiles** además del color (§9).
- **`tabular-nums` en montos**, `min-w-0` anti-desborde, 16px en campos.

---

## 18. Revisiones al documento original

| § | Decía | Ahora |
|---|---|---|
| §4 / §9 | La lima **solo** sobre `--fz-hero` y sobre el vidrio | La lima **como superficie** con tinta oscura es válida en cualquier lado (≈11.8:1). Sigue prohibida **como texto** sobre canvas claro |
| §11 | "Fotos de perfil / avatares — es una app de un solo usuario" | Cierto para el **dueño** de la app; **falso para las personas de Deudas y splits**, que sí son varias. Van con monograma en círculo |
| §11 | "Logos de marcas — requiere un catálogo de assets" | Se acota: **set curado de 8–12 marcas** para los fijos del usuario, inline como `CurrencyIcon`. No un catálogo general |
| §11 | "Gráficas: ninguna en el Sprint 1" | Sigue fuera del alcance inmediato, pero sube de prioridad: es el bloque de mayor impacto visual pendiente |
| Decisión abierta #4 | "Barra de proporción en el hero" | **Se resuelve como delta numérico** (§16.1), no como barra. Un número con signo dice más que una barra sin escala |

---

## 19. Orden de ataque sugerido

1. **Erradicar el emoji** (§15) — `<CategoryIcon>`, mapa de las 14 semillas,
   migración de la columna a slug, grilla de selección en Ajustes, estados
   vacíos con ícono, monograma para personas. *Es el pedido explícito y toca
   todas las pantallas.*
2. **Rediseñar el hero** (§16.1, §16.2, §16.5) — delta, micro-línea de tasa, ojo
   adentro, textura. *Máximo impacto por línea de código.*
3. **Acciones rápidas bajo el hero** (§16.3). *Gana un toque en cada registro.*
4. **Carrusel de cuentas** (§16.4) y **lima como superficie** (§16.6).
5. **Pastilla de delta en filas** (§16.7) y **comparación en tiles** (§16.8).
6. **Logos de fijos** (§16.11) y **gráfica de la Home** (§16.12).

---

## 20. Revisión 2026-08-19 — feedback directo sobre lo construido

> A diferencia de §13-19 (análisis de referencias, antes de tocar código), esto
> es feedback sobre la implementación real del §19, ya en producción. Se
> aplicó directo; esta sección deja constancia de qué cambió y por qué, para
> que no se repitan las mismas inconsistencias en la próxima pantalla nueva.

### 20.1 Una sola paleta, no una por pantalla

El síntoma que lo disparó: "gasto" salía **ámbar** en los tiles de la Home y
**rojo** en los totales de Movimientos — la misma idea, dos colores. Debajo de
eso estaba un problema más grande: el sistema de 7 tintes pastel pensado para
categorías (§4 original) se había filtrado a lugares que no eran categorías —
los tiles de Ingresos/Gastos de Home usaban `tint="mint"/"peach"` en vez de la
semántica de dinero que ya existía y que Movimientos, Deudas y Fijos sí usaban
(`--fz-in-tint`/`--fz-out-tint`).

**Regla que queda fija:** cuatro roles de color, nunca un quinto.

1. **Principal** — `--fz-accent` (verde bosque). Solo superficies llenas de marca.
2. **Secundario** — `--fz-lime`. Solo sobre superficies oscuras, uso escaso.
3. **Semántica de dinero** — `--fz-in` / `--fz-out`. La única razón válida para
   que algo sea rojo o verde fuera de la marca. Un mismo concepto (ingreso,
   gasto) es siempre el mismo token, en cualquier pantalla.
4. **Neutro** — `--fz-tint-neutral`. Todo lo que no es dinero: categoría,
   persona, ítem de navegación.

**Lo que se fue:** los 7 tintes pastel por categoría (`lavender/peach/mint/
sky/rose/sand/slate`) y la función `tintFor()` que los repartía por hash de
nombre. Antes cada categoría tenía un color de fondo distinto — variedad de
color que no comunicaba nada que el ícono de línea (§15) no dijera ya, y que
es lo que hacía que la app se sintiera un tablero de colores en vez de una
herramienta seria. `<CategoryIcon>`, `<PersonAvatar>` y las tarjetas de "Más"
son ahora siempre neutras; lo único que las diferencia es el glifo.

`Tint` pasó de 7 valores decorativos a 3 funcionales: `'neutral' | 'in' | 'out'`.

### 20.2 El hero pierde la marca de agua

El texto `FINANZAS` a 5% de opacidad en la esquina del hero (§16.5) se sacó.
Quedó el degradado radial sutil, que sigue dando la sensación de superficie
sin escribir nada encima.

### 20.3 Un solo ojo, una sola puerta de entrada

Dos inconsistencias que compartían la misma raíz — duplicar una acción en dos
lugares no la refuerza, la vuelve ambigua:

- El toggle de ocultar montos vivía en el header **y** dentro del hero (§16.2
  había propuesto justo esto último). Con los dos a la vista, no quedaba claro
  cuál era "el" control. Se saca el del hero; el del header alcanza.
- Home tenía un botón "+ Nuevo movimiento" en el header **y** los tres botones
  Gasto/Ingreso/Transferir bajo el hero (§16.3). Los tres botones ya cubren el
  100% de los tipos posibles — no existe un cuarto caso ambiguo que el botón
  genérico resolviera — así que el genérico se saca.

  Encima, el botón específico no cambiaba nada en la práctica: tocar "Ingreso"
  abría el mismo sheet con los tres tipos seleccionables, así que terminabas
  en el mismo lugar que tocando cualquiera de los tres. Se agregó `lockType`
  al contexto del quick-add: cuando se entra por un botón puntual, el sheet
  fija ese tipo y **no muestra el selector** — el título dice "Nuevo gasto" /
  "Nuevo ingreso" / "Nueva transferencia" en su lugar. El selector se queda
  visible solo donde sigue haciendo falta elegir: al editar un movimiento
  existente, y en las dos entradas genéricas que no tienen tres botones al
  lado (el FAB de la tab bar en móvil, el "Nuevo" de Movimientos).

### 20.4 Desktop: dos columnas, no tres

La sidebar es la única columna fija; todo lo demás —incluida la que era una
columna de "Cuentas" con `sticky` propio (§8 original)— pasa a ser un panel
más dentro de una sola columna de contenido que scrollea entera. Tener una
segunda zona con scroll independiente al lado de la principal partía la
atención y no aportaba nada que el panel no resolviera estando en el flujo.

`home.tsx` pierde el grid `1fr_320px` a partir de 1280px: a cualquier ancho
desktop es sidebar + una columna, sin un tercer nivel de layout que distinga
"compacto" de "completo" (la tabla de breakpoints de §8 se achica de tres
filas a dos).

---

## 21. Ajuste 2026-08-19 (2) — orden de Home y guindo en vez de rojo

- **Movimientos antes que Cuentas.** Es lo que se quiere ver primero al abrir
  la app. El panel de Cuentas no se toca en nada más — mismo carrusel, mismo
  contenido — solo baja un lugar en el flujo (§20.4).
- **Guindo en vez de rojo puro para "sale plata".** `--fz-out` pasó de
  `#E5484D` (rojo brillante, se leía como alarma) a `#B8434A` — un rojo más
  oscuro y menos saturado, con `--fz-out-text` en `#8B2E33`. Es el mismo
  token en todos lados (§20.1), así que gastos y deudas cambian juntos con
  una sola edición en `theme.css`. Única salvedad: `--fz-out` es el que se ve
  sobre el hero oscuro (delta negativo del mes) y ahí el contraste baja a
  ~3:1 — el límite aceptable para una etiqueta chica; no oscurecer más este
  token sin volver a medirlo contra `--fz-hero`.

---

## 22. Home desktop: bento, no mobile estirado (2026-08-19, 3)

El Home en desktop repetía la composición de mobile con más aire alrededor —
todo apilado en una sola columna angosta, aunque el viewport fuera de 1440px.
Se probaron 3 propuestas de lado a lado (previews en el chat); se eligió
**"Hero + acciones al lado"**. Todo lo de abajo sigue siendo el mismo flujo
que scrollea con la sidebar fija — nada de esto agrega una zona con scroll
propio (§20 sigue mandando).

- **Hero + acciones rápidas comparten fila** desde 900px, en un grid
  `[1fr_240px]`. En mobile siguen apiladas (grid de 1 columna: mismo
  resultado que dos bloques sueltos). `<QuickAction>` se reacomoda de
  ícono-sobre-etiqueta a ícono-etiqueta-chevron en fila, y se estira con
  `flex-1` para repartir el alto del hero entre las tres.
- **Ingresos/Gastos/Fijos/Deudas en una fila de 4** desde 900px
  (`grid-cols-2 → grid-cols-4`). Fijos y Deudas ganaron una versión tile
  (`<SummaryLinkTile>`, mismo cuerpo que `<StatTile>` con un chevron) que
  **solo se muestra desde 900px**; la barra ancha de siempre se queda para
  mobile sin tocar un solo pixel (`min-[900px]:hidden` de un lado,
  `hidden min-[900px]:block` del otro — nunca los dos visibles a la vez).
- **Movimientos + Cuentas lado a lado** desde 900px (`[1fr_320px]`),
  Movimientos más ancho por ser la lista que más se lee. En mobile, grid de 1
  columna con el mismo orden que ya fijó §21 (Movimientos primero).
