# Liquid Glass — tab bar flotante (iOS 26)

Rescatado de la primera versión de Finanzas (borrada el 2026-08-17) para reutilizar.
Es un menú inferior **flotante, traslúcido**, con blur + saturación fuerte y un filo
de luz que simula el borde de un vidrio. Un único "pill" se desliza en X hacia la
pestaña activa, en vez de que cada pestaña prenda y apague su propio fondo.

Regla de contraste que lo hace funcionar: los íconos y el texto van **claros**. El
panel es vidrio sobre un fondo oscuro, no una card blanca opaca — si se trata como
superficie clara, el efecto se pierde por completo.

## Tokens que necesita

Solo depende de dos, el resto son literales:

```css
--fill-accent: #5B6EF5;  /* botón de acción central */
--surface-2:   #000000;  /* el fondo oscuro detrás — el blur necesita algo que saturar */
```

El vidrio asume fondo oscuro. Sobre fondo claro hay que reformular los `rgba(255,255,255,·)`
a negros con alpha, y el efecto queda notablemente más débil.

## CSS

```css
.fz-tabbar {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 16px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 32px);
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);   /* Safari lo sigue necesitando */
  border: 0.5px solid rgba(255,255,255,0.12);           /* el "filo de luz" */
  box-shadow: 0 6px 18px rgba(0,0,0,0.3);
  padding: 8px;
  z-index: 40;
}

/* Pill compartido que se desliza. */
.fz-tab-pill {
  position: absolute;
  /* El bloque contenedor de un position:absolute es el PADDING box de .fz-tabbar,
     no su content box. Con top:0 quedaba pegado arriba del padding, desalineado
     respecto a los tabs (que sí están corridos por el padding, al ser flex children).
     top:50% + translateY(-50%) lo centra sin hardcodear el padding. */
  top: 50%;
  left: 0;
  width: 46px;
  height: 40px;
  border-radius: 999px;
  background: rgba(255,255,255,0.14);
  transition: transform 0.4s cubic-bezier(0.32, 1.2, 0.4, 1), opacity 0.2s ease;
  z-index: 0;
  pointer-events: none;
}

.fz-tab {
  position: relative;
  z-index: 1;                      /* por encima del pill */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;                     /* debe coincidir con .fz-tab-pill */
  height: 40px;
  border-radius: 999px;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: color 0.2s ease;
}
.fz-tab-active { color: #FFFFFF; }

/* Botón de acción central (+). No recibe el pill. */
.fz-tab-action {
  position: relative;
  z-index: 1;
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px;
  cursor: pointer;
}
.fz-tab-action-badge {
  width: 34px; height: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--fill-accent);
  color: #FFFFFF;
}

/* Reserva de scroll para que el contenido no quede debajo del panel flotante. */
.fz-tabbar-spacer { height: calc(72px + env(safe-area-inset-bottom)); }

/* Es un patrón mobile: en desktop se cambia por sidebar. */
@media (min-width: 1024px) {
  .fz-tabbar, .fz-tabbar-spacer { display: none; }
}
```

La curva `cubic-bezier(0.32, 1.2, 0.4, 1)` pasa de 1 a propósito — da el pequeño
rebote al final del deslizamiento. Sin eso el movimiento se siente muerto.

## Medición del pill

La parte no obvia. Se mide en coordenadas de viewport con `getBoundingClientRect()`,
no con `offsetLeft`, para no depender de dónde cae el borde/padding del contenedor;
`nav.clientLeft` (= el `border-left-width` real) corrige el único desfase que sí
importa, sin asumir ningún valor fijo.

```tsx
const navRef = useRef<HTMLElement | null>(null)
const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
const [pill, setPill] = useState<{ x: number; visible: boolean }>({ x: 0, visible: false })

const activeHref = ALL_TABS.find(t => isActive(pathname, t.href, t.exact))?.href

useLayoutEffect(() => {
  function measure() {
    const nav = navRef.current
    const el = activeHref ? tabRefs.current[activeHref] : null
    if (!nav || !el) {
      setPill(p => (p.visible ? { ...p, visible: false } : p))
      return
    }
    const navRect = nav.getBoundingClientRect()
    const tabRect = el.getBoundingClientRect()
    setPill({ x: tabRect.left - navRect.left - nav.clientLeft, visible: true })
  }
  measure()
  window.addEventListener('resize', measure)
  return () => window.removeEventListener('resize', measure)
}, [activeHref])
```

`useLayoutEffect` y no `useEffect`: mide y posiciona antes del paint, si no el pill
se ve saltar desde x=0 en la primera carga. Se aplica con
`style={{ transform: \`translate(${pill.x}px, -50%)\`, opacity: pill.visible ? 1 : 0 }}`
— el `-50%` en Y va en el mismo transform porque pisaría el `translateY(-50%)` del CSS.

Cuando no hay tab activo (ruta fuera del menú) se oculta con opacidad en vez de
desmontarlo, así no reaparece animando desde x=0 al volver.

## Íconos

Tabler (`@tabler/icons-react`), `size={23} stroke={1.7}`, con la variante `*Filled`
para el estado activo — ej. `IconHome2` / `IconHome2Filled`. El cambio de relleno
refuerza el estado activo además del color y del pill.
