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

  /* ── Acento: verde bosque ────────────────────────── */
  --fz-accent:        #16613C;  /* FAB, botones, activo — SOLO superficies llenas */
  --fz-accent-press:  #0F4A2D;
  --fz-accent-tint:   #E4F0E9;  /* fondo de chips y tiles de marca */

  /* Lima: la contraparte del acento sobre superficies OSCURAS.
     Nunca sobre el canvas claro — no tiene contraste suficiente. */
  --fz-lime:          #C8F169;
  --fz-lime-ink:      #12281D;

  /* ── Vidrio (tab bar) ────────────────────────────── */
  --fz-glass-bg:      rgba(18,40,29,0.72);   /* verde oscuro translúcido */
  --fz-glass-edge:    rgba(255,255,255,0.14); /* el filo de luz */
  --fz-glass-pill:    rgba(255,255,255,0.16);

  /* ── Semántica de dinero ─────────────────────────── */
  --fz-in:            #16A34A;  /* chips, íconos, montos grandes */
  --fz-in-text:       #15803D;  /* montos chicos sobre blanco */
  --fz-in-tint:       #E3F5E9;
  --fz-out:           #E5484D;
  --fz-out-text:      #C62A2F;
  --fz-out-tint:      #FDE9EA;

  /* ── Tintes de categoría ─────────────────────────── */
  --fz-tint-lavender: #EDEBFB;   --fz-tint-lavender-fg: #6D5BD0;
  --fz-tint-peach:    #FDF0DF;   --fz-tint-peach-fg:    #E07C1F;
  --fz-tint-mint:     #E3F5E9;   --fz-tint-mint-fg:     #15803D;
  --fz-tint-sky:      #E6F1FD;   --fz-tint-sky-fg:      #1D74D0;
  --fz-tint-rose:     #FDE9EA;   --fz-tint-rose-fg:     #C62A2F;
  --fz-tint-sand:     #F6F1E7;   --fz-tint-sand-fg:     #9A7B33;
  --fz-tint-slate:    #EEEFF2;   --fz-tint-slate-fg:    #5A616B;

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

**Los 7 tintes de categoría** se asignan a las 14 categorías semilla de forma
determinística (hash del nombre → índice) para que cada categoría siempre tenga
el mismo color sin guardarlo en la base.

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
Monto en lista       15px / 600 / tabular-nums
Etiqueta             13px / 500
Caption / hora       12px / 500 / --fz-ink-3
```

- **Todos los montos en listas y tablas llevan `font-variant-numeric:
  tabular-nums`** para que las columnas se alineen.
- El hero usa cifras proporcionales — se ve más apretado y deliberado.
- Pesos usados: 500, 600, 700. Nada de 400 (se ve lavado sobre gris claro) ni
  800.

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

### Tarjeta hero (`<HeroBalance>`)
Fondo `--fz-hero`, radio `--fz-r-card`, padding 24px. Contiene: etiqueta
("Patrimonio total") en blanco al 60%, el monto en 40/700, y el toggle de
ocultar arriba a la derecha. Opcionalmente una barra fina de proporción
ingreso/gasto del mes, como el degradado de la referencia 1.

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

### Tab bar (`<TabBar>`) — solo móvil · **liquid glass**

Se implementa con el CSS ya rescatado en `documentos/design/liquid-glass-menu.md`,
con **una sola modificación**: el panel deja de ser vidrio claro sobre fondo
oscuro y pasa a ser **vidrio verde oscuro sobre el canvas claro**.

```css
.fz-tabbar {
  background: var(--fz-glass-bg);              /* rgba(18,40,29,0.72) */
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border: 0.5px solid var(--fz-glass-edge);
  box-shadow: var(--fz-sh-float);
}
.fz-tab-pill { background: var(--fz-glass-pill); }
.fz-tab        { color: rgba(255,255,255,0.55); }
.fz-tab-active { color: var(--fz-lime); }
```

**Por qué funciona sobre canvas claro:** el vidrio se lee cuando hay contraste
entre el panel y lo que pasa por detrás. Vidrio *claro* sobre canvas claro no se
nota; vidrio *oscuro* sobre contenido claro sí — se ven las formas del scroll
difuminándose a través del tinte verde. La regla original del documento
rescatado ("íconos y texto van claros") se mantiene intacta: sigue siendo un
panel oscuro, solo que ahora flota sobre claro en vez de sobre oscuro.

Del CSS rescatado se conserva sin tocar: la geometría del pill deslizante, la
curva con rebote `cubic-bezier(0.32, 1.2, 0.4, 1)`, el `env(safe-area-inset-bottom)`,
el `.fz-tabbar-spacer`, la medición con `getBoundingClientRect()` + `nav.clientLeft`
en `useLayoutEffect`, y los íconos Tabler con variante `*Filled` en activo.

Cinco slots:

```
  Inicio   Movimientos   ( + )   Cuentas   Ajustes
```

- Ítem activo: ícono `*Filled` en `--fz-lime` + el pill deslizándose detrás.
- El `(+)` es un círculo elevado en `--fz-accent` con el glifo blanco.
- El breakpoint de la barra sube de 1024px a **900px**, para coincidir con el
  corte app/dashboard de §8.

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

```
┌────────┬──────────────────────────────┬─────────────┐
│        │  Buenos días, Daniel         │  Cuentas    │
│ Finanzas│  domingo 17 de agosto        │  ┌────────┐ │
│        │                              │  │ Airtm  │ │
│ ⌂ Inicio│ ┌────┐ ┌────┐ ┌────┐         │  │ $1,299 │ │
│ ⇄ Movim.│ │Patr│ │Ingr│ │Gast│         │  └────────┘ │
│ ▣ Cuent.│ │3209│ │ 900│ │ 142│         │  ┌────────┐ │
│ ⚙ Ajust.│ └────┘ └────┘ └────┘         │  │ Broker │ │
│        │                              │  │  $980  │ │
│        │ Movimientos      [filtros]   │  └────────┘ │
│        │ ┌──────────────────────────┐ │             │
│        │ │ hoy, 17 ago       −$7.18 │ │  Tipo de    │
│ ┌─────┐│ │ [🍽] Almuerzo     −$5.03 │ │  cambio     │
│ │ USD ││ │ [🚕] Taxi         −$2.15 │ │  6.96       │
│ │ BOB ││ │                          │ │             │
│ │6.96 ││ │ ayer, 16 ago     +$100.0 │ │             │
│ └─────┘│ └──────────────────────────┘ │             │
└────────┴──────────────────────────────┴─────────────┘
   248px            fluido                  320px
```

- **Sin tab bar ni FAB.** El botón primario **"+ Nuevo movimiento"** vive en el
  header del contenido central, a la derecha del saludo.
- Contenedor con `max-width: 1440px`, centrado, gap de 20px entre zonas.
- Cada zona scrollea por separado; la página no scrollea.
- La lista de movimientos pasa de tarjetas apiladas a **tabla densa** con
  columnas: fecha · categoría · descripción · cuenta · monto.
- Acá sí hay hover: fila resaltada con `--fz-surface-sunk` y acciones de editar
  y borrar que aparecen a la derecha.

### Breakpoints

| Rango | Modo |
|---|---|
| `< 900px` | **App**: 1 columna, tab bar + FAB, sheets |
| `900–1279px` | **Dashboard compacto**: sidebar + contenido. Sin rail derecho — cuentas y tipo de cambio pasan al flujo central |
| `≥ 1280px` | **Dashboard completo**: 3 zonas |

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
| Librería de React para el efecto vidrio | El CSS propio ya resuelve el material y lo difícil (medición del pill, safe-area, rebote). Ver §12 |
| Logos de marcas en las filas | Las referencias muestran Netflix, Spotify, Wise. Requiere un catálogo de assets. Se usan chips de categoría con ícono |
| Fotos de perfil / avatares | Es una app de un solo usuario |
| Librería de componentes o de gráficas | Se escribe todo a mano con Tailwind v4 y SVG |
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
