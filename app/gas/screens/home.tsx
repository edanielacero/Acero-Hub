'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGas } from '../components/data'
import { AutoDibujo } from '../components/car-art'
import { MarcaGas } from '../components/marca'
import { Boton } from '../components/ui'
import { ComprobanteCarga, ComprobanteCierre, ComprobanteCorreccion, ComprobanteDetalle, ComprobanteInicio, ComprobantePromedio, ComprobanteResumen } from '../components/sheets'
import { esCompartido, historial, kmDisponibles, kmRecorridos, miParte, saldo as calcSaldo, viajeEnCurso } from '@/lib/gas/calc'
import { fmtBs, fmtFechaHora, fmtKm, fmtMes, fmtOdometro, mesDe } from '@/lib/gas/format'
import type { Auto, Movimiento, Viaje } from '@/lib/gas/types'

/**
 * La pantalla única de Gas, en dos secciones.
 *
 *   Arriba  · el carrusel de autos. Fijo, nunca se va de la vista.
 *   Abajo   · los filtros (también fijos) y el historial, que es lo único que
 *             scrollea.
 *
 * El alto lo fija el layout con `h-[100dvh] overflow-hidden`; acá adentro es
 * una columna flex donde solo la lista tiene `overflow-y-auto`.
 */

type Popup =
  | { tipo: 'cargar' | 'iniciar' | 'finalizar' | 'promedio'; autoId: string }
  | { tipo: 'resumen'; autoId: string; viaje: Viaje; saldoNuevo: number }
  | { tipo: 'detalle' | 'corregir'; autoId: string; movId: string }
  | null

type FiltroTipo = 'todo' | 'carga' | 'viaje'

/** Alto de la tarjeta plegada. Fijo: la horizontal siempre mide lo mismo. */
const ALTO_COMPACTO = 78

export function HomeScreen() {
  const { autos, movimientos, estado } = useGas()
  const [activo, setActivo] = useState(0)
  const [compacto, setCompacto] = useState(false)
  const [altoExpandido, setAltoExpandido] = useState<number | null>(null)
  const [altoTitulo, setAltoTitulo] = useState(0)
  // Un plegado "forzado" es el que dejó al contenido más corto que la pantalla:
  // el navegador lleva el scroll a cero y no hay que confundir eso con que el
  // usuario haya vuelto arriba por su cuenta.
  const [plegadoForzado, setPlegadoForzado] = useState(false)
  const listaRef = useRef<HTMLDivElement>(null)
  const tituloRef = useRef<HTMLElement>(null)
  const [mes, setMes] = useState<string>('todo')
  const [tipo, setTipo] = useState<FiltroTipo>('todo')
  const [popup, setPopup] = useState<Popup>(null)

  const auto = autos[activo]
  const propios = useMemo(
    () => (auto ? movimientos.filter(m => m.autoId === auto.id) : []),
    [movimientos, auto],
  )

  // Solo los meses que tienen movimientos con ESTE auto, del más nuevo al más
  // viejo. Cambiar de auto cambia la lista, así que el mes elegido puede dejar
  // de existir: en vez de un efecto que lo corrija, se resuelve al leerlo.
  const meses = useMemo(
    () => [...new Set(propios.map(m => mesDe(m.ocurridoEn)))].sort().reverse(),
    [propios],
  )
  const mesActivo = meses.includes(mes) ? mes : 'todo'

  // El saldo corriente se calcula sobre TODOS los movimientos del auto y recién
  // después se filtra: si se filtrara antes, la columna de saldo mostraría el
  // acumulado de un subconjunto, que no es el saldo de nada.
  const filas = useMemo(() => {
    const todas = historial(propios)
    return todas.filter(({ mov }) => {
      if (mesActivo !== 'todo' && mesDe(mov.ocurridoEn) !== mesActivo) return false
      if (tipo !== 'todo' && mov.tipo !== tipo) return false
      return true
    })
  }, [propios, mesActivo, tipo])

  /*
    El plegado es un interruptor con transición de CSS, y NO una altura atada
    punto a punto al scroll: si el alto siguiera al scroll, plegarse achica el
    máximo scrolleable, el navegador recorta la posición, se despliega, y la
    pantalla tiembla. Como interruptor el cambio ocurre una vez, y la histéresis
    (se pliega cuando el título ya casi se fue, se despliega solo al volver
    arriba del todo) impide que se dispare de ida y vuelta.
  */
  /*
    El plegado ocurre SIEMPRE que se scrollea, tenga la lista los movimientos
    que tenga. Lo que cambia según el largo de la lista es cómo se vuelve atrás.

    Con la lista larga, plegar deja scroll de sobra: volver arriba del todo
    despliega la tarjeta sola, como uno espera.

    Con la lista corta, plegar libera ~300px y el contenido pasa a entrar entero
    en la pantalla: ya no queda scroll y el navegador lleva la posición a cero.
    Si eso desplegara la tarjeta, el plegado no llegaría a verse nunca — y
    rellenar el final con espacio en blanco para evitarlo fue peor, porque al
    terminar el scroll los movimientos se iban para arriba y abajo quedaba un
    vacío. Así que ese plegado se marca como forzado y NO se deshace solo: se
    deshace tirando hacia abajo, que es el gesto con el que uno pide ver lo que
    quedó arriba.
  */
  const UMBRAL_PLEGAR = 36
  const UMBRAL_DESPLEGAR = 6

  const alScrollear = () => {
    const el = listaRef.current
    if (!el || altoExpandido === null) return

    if (!compacto) {
      if (el.scrollTop <= UMBRAL_PLEGAR) return

      const gana = altoExpandido - ALTO_COMPACTO
      const sobraTrasPlegar = el.scrollHeight - el.clientHeight - gana
      const forzado = sobraTrasPlegar < UMBRAL_DESPLEGAR

      /*
        Con el plegado forzado, el contenido pasa a entrar entero y el navegador
        termina llevando el scroll a cero por su cuenta — pero lo hace unos
        cuadros después, ya empezada la animación. Filmado: el contenido subía a
        42 y volvía a 0 en el cuadro siguiente, y ese ida y vuelta es lo que se
        siente como un rebote. Asentarlo acá mismo lo convierte en un solo
        movimiento.
      */
      if (forzado) el.scrollTop = Math.max(0, sobraTrasPlegar)

      setPlegadoForzado(forzado)
      setCompacto(true)
    } else if (!plegadoForzado && el.scrollTop < UMBRAL_DESPLEGAR) {
      setCompacto(false)
    }
  }

  /*
    Desplegar tirando hacia abajo estando arriba del todo.

    Es la única salida cuando el plegado fue forzado: ahí no queda scroll, así
    que no hay evento de scroll que avise. Se escucha el gesto en crudo —el
    dedo en el teléfono, la rueda en el escritorio— y alcanza con la intención,
    sin necesidad de que la pantalla se llegue a mover.
  */
  useEffect(() => {
    const el = listaRef.current
    if (!el || !compacto) return

    let desdeY = 0
    const arribaDelTodo = () => el.scrollTop <= 2
    const desplegar = () => { setPlegadoForzado(false); setCompacto(false) }

    const alTocar = (e: TouchEvent) => { desdeY = e.touches[0]?.clientY ?? 0 }
    const alArrastrar = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0
      if (arribaDelTodo() && y - desdeY > 24) desplegar()
    }
    const alRodar = (e: WheelEvent) => {
      if (arribaDelTodo() && e.deltaY < -4) desplegar()
    }

    el.addEventListener('touchstart', alTocar, { passive: true })
    el.addEventListener('touchmove', alArrastrar, { passive: true })
    el.addEventListener('wheel', alRodar, { passive: true })
    return () => {
      el.removeEventListener('touchstart', alTocar)
      el.removeEventListener('touchmove', alArrastrar)
      el.removeEventListener('wheel', alRodar)
    }
  }, [compacto])

  // El alto del título define cuándo plegar: el momento natural es cuando
  // termina de irse y el carrusel llega arriba.
  useEffect(() => {
    const el = tituloRef.current
    if (!el) return
    const medir = () => setAltoTitulo(el.offsetHeight)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [estado])

  if (estado === 'cargando') return <Esqueleto />
  if (estado === 'error') return <Fallo />

  const autoDe = (id: string) => autos.find(a => a.id === id)
  const abierto = popup ? autoDe(popup.autoId) : undefined

  return (
    /*
      UN SOLO contenedor con scroll para toda la pantalla, y no una lista con
      scroll propio debajo de un encabezado fijo. La diferencia se siente: así
      el gesto funciona en cualquier parte —también arrastrando sobre el auto—,
      que es como uno espera que se comporte una pantalla.

      El encabezado (carrusel + filtros) va `sticky top-0`: queda clavado arriba
      desde el primer pixel y los movimientos pasan por debajo. Cuando el
      carrusel se pliega, el bloque pegajoso ocupa menos y la lista gana ese
      alto sin que nada más cambie de lugar.
    */
    <div
      ref={listaRef}
      onScroll={alScrollear}
      className="gas-sin-ancla h-full overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto w-full max-w-md">

      {/* ── Título: se va con el scroll, como el "Today" del App Store ─────── */}
      <header
        ref={tituloRef}
        className="flex items-center justify-between px-5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4"
      >
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.035em] text-[var(--gas-ink)]">
          Gasolina
        </h1>
        {/* Decorativa: la marca de la mini-app y nada más. No lleva a ningún
            lado a propósito — para volver al Hub está el gesto de atrás. */}
        <MarcaGas size={44} />
      </header>

      {/* ── Pegajoso: el carrusel y los filtros ───────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[var(--gas-canvas)]">
      <section className="pt-1">
        <Carrusel onActivo={setActivo}>
          {autos.map((a, i) => (
            <Tarjeta
              key={a.id}
              auto={a}
              movimientos={movimientos.filter(m => m.autoId === a.id)}
              compacto={compacto}
              altoExpandido={altoExpandido}
              // Se mide una sola tarjeta: las dos tienen la misma estructura.
              onMedir={i === 0 ? setAltoExpandido : undefined}
              onCargar={() => setPopup({ tipo: 'cargar', autoId: a.id })}
              onIniciar={() => setPopup({ tipo: 'iniciar', autoId: a.id })}
              onFinalizar={() => setPopup({ tipo: 'finalizar', autoId: a.id })}
              onPromedio={() => setPopup({ tipo: 'promedio', autoId: a.id })}
            />
          ))}
        </Carrusel>
      </section>

      {/* Opaco a propósito: es lo que hace que los movimientos desaparezcan
          por debajo en vez de transparentarse contra el encabezado. */}
      <section className="border-t border-[var(--gas-hairline)] bg-[var(--gas-surface-alto)] px-5 py-3">
        <Meses meses={meses} activo={mesActivo} onElegir={setMes} />
        <Tipos activo={tipo} onElegir={setTipo} />
      </section>
      </div>

      {/* ── Historial ──────────────────────────────────────────────────────── */}
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {filas.length === 0 ? (
          <p className="py-16 text-center text-[13.5px] leading-relaxed text-[var(--gas-ink-3)]">
            {propios.length === 0
              ? <>Todavía no hay movimientos con {auto?.nombre ?? 'este auto'}.</>
              : <>Ningún movimiento con estos filtros.</>}
          </p>
        ) : (
          <ul className="space-y-2">
            {filas.map(({ mov, saldo }) => (
              <FilaMovimiento
                key={mov.id}
                mov={mov}
                saldo={saldo}
                onAbrir={() => setPopup({ tipo: 'detalle', autoId: mov.autoId, movId: mov.id })}
              />
            ))}
          </ul>
        )}
      </div>

      </div>

      {/* ── Comprobantes ───────────────────────────────────────────────────── */}
      {popup?.tipo === 'cargar' && abierto && (
        <ComprobanteCarga
          auto={abierto}
          saldo={calcSaldo(movimientos.filter(m => m.autoId === abierto.id))}
          onCerrar={() => setPopup(null)}
        />
      )}

      {popup?.tipo === 'iniciar' && abierto && (
        <ComprobanteInicio
          auto={abierto}
          ultimoKm={ultimoKm(movimientos.filter(m => m.autoId === abierto.id))}
          onCerrar={() => setPopup(null)}
        />
      )}

      {popup?.tipo === 'finalizar' && abierto && (() => {
        const movs = movimientos.filter(m => m.autoId === abierto.id)
        const enCurso = viajeEnCurso(movs)
        if (!enCurso) return null
        const saldoAntes = calcSaldo(movs)
        return (
          <ComprobanteCierre
            auto={abierto}
            viaje={enCurso}
            onCerrar={() => setPopup(null)}
            // El viaje abierto no movía el saldo, así que el nuevo es el de
            // antes menos lo que le tocó pagar. Se calcula acá y no leyendo el
            // estado otra vez porque el resumen tiene que abrirse ya.
            onCerrado={cerrado => setPopup({
              tipo: 'resumen',
              autoId: abierto.id,
              viaje: cerrado,
              saldoNuevo: Math.round((saldoAntes - (miParte(cerrado) ?? 0)) * 100) / 100,
            })}
          />
        )
      })()}

      {popup?.tipo === 'resumen' && abierto && (
        <ComprobanteResumen
          auto={abierto}
          viaje={popup.viaje}
          saldoNuevo={popup.saldoNuevo}
          onCerrar={() => setPopup(null)}
        />
      )}

      {popup?.tipo === 'promedio' && abierto && (
        <ComprobantePromedio auto={abierto} onCerrar={() => setPopup(null)} />
      )}

      {(popup?.tipo === 'detalle' || popup?.tipo === 'corregir') && abierto && (() => {
        // Se busca por id en el estado y no se guarda el movimiento dentro del
        // popup: así el comprobante siempre muestra lo último que hay.
        const mov = movimientos.find(m => m.id === popup.movId)
        if (!mov) return null

        if (popup.tipo === 'corregir') {
          return <ComprobanteCorreccion auto={abierto} mov={mov} onCerrar={() => setPopup(null)} />
        }

        // El saldo se recalcula acá en vez de arrastrarlo en el estado del
        // popup: guardado quedaría viejo apenas se corrija algo anterior.
        const fila = historial(movimientos.filter(m => m.autoId === abierto.id))
          .find(f => f.mov.id === mov.id)

        return (
          <ComprobanteDetalle
            auto={abierto}
            mov={mov}
            saldo={fila?.saldo ?? 0}
            onEditar={() => setPopup({ tipo: 'corregir', autoId: abierto.id, movId: mov.id })}
            onCerrar={() => setPopup(null)}
          />
        )
      })()}
    </div>
  )
}

/** El kilometraje con que terminó el último viaje cerrado de este auto. */
function ultimoKm(movimientos: Movimiento[]): number | null {
  const cerrados = movimientos
    .filter((m): m is Viaje => m.tipo === 'viaje' && m.kmFinal !== null)
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn))

  return cerrados[0]?.kmFinal ?? null
}

/* ─── Carrusel ─────────────────────────────────────────────────────────────── */

/**
 * Las tarjetas de lado a lado, con scroll-snap.
 *
 * Cada una mide menos que el ancho disponible a propósito: el pedazo de la
 * siguiente que asoma es lo que dice "esto se desliza", sin necesidad de
 * explicarlo con una flecha.
 */
function Carrusel({ onActivo, children }: {
  onActivo: (i: number) => void
  children: React.ReactNode[]
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Cuál tarjeta quedó más cerca del centro. Se mide contra los hijos reales y
  // no dividiendo `scrollWidth`, que con el gap y el padding no da exacto.
  const alScrollear = useCallback(() => {
    const el = ref.current
    if (!el) return
    const centro = el.scrollLeft + el.clientWidth / 2

    let mejor = 0
    let minima = Infinity
    for (const [i, hijo] of Array.from(el.children).entries()) {
      const h = hijo as HTMLElement
      const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - centro)
      if (d < minima) { minima = d; mejor = i }
    }
    onActivo(mejor)
  }, [onActivo])

  // Sin puntos indicadores: el pedazo de la tarjeta siguiente que asoma ya dice
  // que esto se desliza, y era el único adorno entre el auto y los filtros.
  return (
    <div
      ref={ref}
      onScroll={alScrollear}
      className="gas-sin-barra flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4"
    >
      {children.map((hijo, i) => (
        <div key={i} className="w-[88%] shrink-0 snap-center">{hijo}</div>
      ))}
    </div>
  )
}

/* ─── La tarjeta ───────────────────────────────────────────────────────────── */

/**
 * La tarjeta del auto, en sus dos formas.
 *
 * Las dos están siempre en el árbol, superpuestas, y lo que cambia es cuál se
 * ve: el alto del contenedor va de una a la otra con transición, y las
 * opacidades se cruzan. Montar y desmontar en vez de cruzar haría imposible
 * animar el alto —no habría desde dónde ni hasta dónde— y además perdería la
 * medición de la forma expandida mientras está plegada.
 */
function Tarjeta({ auto, movimientos, compacto, altoExpandido, onMedir, onCargar, onIniciar, onFinalizar, onPromedio }: {
  auto: Auto
  movimientos: Movimiento[]
  compacto: boolean
  altoExpandido: number | null
  onMedir?: (alto: number) => void
  onCargar: () => void
  onIniciar: () => void
  onFinalizar: () => void
  onPromedio: () => void
}) {
  const saldo = calcSaldo(movimientos)
  const km = kmDisponibles(saldo, auto)
  const enCurso = viajeEnCurso(movimientos)
  const debe = saldo < 0

  const expandidaRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

  // El alto de la forma expandida depende del ancho de la tarjeta (la foto
  // tiene proporción fija), así que se mide en vez de calcularse.
  useEffect(() => {
    if (!onMedir) return
    const el = expandidaRef.current
    if (!el) return
    const medir = () => onMedir(el.offsetHeight)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [onMedir])

  // El ancho de la tarjeta: de él sale cuánto tiene que encoger la foto.
  useEffect(() => {
    const el = cajaRef.current
    if (!el) return
    const medir = () => setAncho(el.offsetWidth)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  /*
    LA FOTO ES EL MISMO ELEMENTO EN LOS DOS ESTADOS.

    Antes había dos tarjetas superpuestas cruzándose en opacidad, y eso se leía
    como "una se va y aparece otra", no como una transición. Ahora el auto se
    dibuja UNA sola vez, encima de las dos formas, y viaja de su lugar grande al
    chico encogiendo. Va con `transform`, que corre en el compositor y no
    dispara relayout en cada cuadro.

    Las dos formas siguen cruzándose por debajo, pero como el auto es lo que
    manda visualmente, el conjunto se lee como una sola cosa que se transforma.

    Los números salen de las clases de cada forma, y por eso viven juntos acá:
    la expandida tiene `px-5 pt-4` → esquina en (20,16); la compacta `px-3.5` y
    la foto centrada en su alto.
  */
  const FOTO_COMPACTA = 70
  const anchoFotoExpandida = Math.max(1, ancho - 40)
  const escalaFoto = ancho > 0 ? FOTO_COMPACTA / anchoFotoExpandida : 1
  const altoFotoCompacta = FOTO_COMPACTA / 2.15
  const dx = 14 - 20
  const dy = (ALTO_COMPACTO - altoFotoCompacta) / 2 - 16

  const CURVA = 'cubic-bezier(0.32,0.72,0,1)'

  return (
    <div
      ref={cajaRef}
      className="relative overflow-hidden transition-[height] duration-[420ms]"
      style={{
        height: compacto ? ALTO_COMPACTO : (altoExpandido ?? undefined),
        transitionTimingFunction: CURVA,
      }}
    >
      {/* ── Forma compacta ── */}
      <div
        className="absolute inset-x-0 top-0 transition-opacity duration-[220ms] ease-out"
        style={{
          opacity: compacto ? 1 : 0,
          // Entra recién cuando la expandida ya se fue, para que no se
          // superpongan las dos en el medio de la transición.
          transitionDelay: compacto ? '120ms' : '0ms',
          pointerEvents: compacto ? 'auto' : 'none',
        }}
        aria-hidden={!compacto}
      >
        <TarjetaCompacta
          auto={auto}
          saldo={saldo}
          km={km}
          enCurso={enCurso}
          debe={debe}
          onIniciar={onIniciar}
          onFinalizar={onFinalizar}
        />
      </div>

      {/* ── Forma expandida ── */}
      <div
        ref={expandidaRef}
        className="absolute inset-x-0 top-0 transition-[opacity,transform] duration-[220ms] ease-out"
        style={{
          opacity: compacto ? 0 : 1,
          // Se recoge un poco al irse en vez de quedar guillotinada por el
          // `overflow-hidden` mientras el contenedor se achica.
          transform: compacto ? 'scale(0.96)' : 'scale(1)',
          transformOrigin: 'top center',
          transitionDelay: compacto ? '0ms' : '120ms',
          pointerEvents: compacto ? 'none' : 'auto',
        }}
        aria-hidden={compacto}
      >
        <TarjetaExpandida
          auto={auto}
          saldo={saldo}
          km={km}
          enCurso={enCurso}
          debe={debe}
          onCargar={onCargar}
          onIniciar={onIniciar}
          onFinalizar={onFinalizar}
          onPromedio={onPromedio}
        />
      </div>

      {/* ── El auto: uno solo, encima de las dos formas ── */}
      <div
        className="pointer-events-none absolute transition-transform duration-[420ms]"
        style={{
          left: 20,
          top: 16,
          width: anchoFotoExpandida,
          transformOrigin: 'top left',
          transform: compacto ? `translate(${dx}px, ${dy}px) scale(${escalaFoto})` : 'none',
          transitionTimingFunction: CURVA,
        }}
      >
        <AutoDibujo color={auto.color} className="w-full" />
      </div>
    </div>
  )
}

interface Comun {
  auto: Auto
  saldo: number
  km: number
  enCurso: Viaje | null
  debe: boolean
}

/** La tarjeta horizontal: lo mínimo para saber con qué auto estás y salir. */
function TarjetaCompacta({ auto, saldo, km, enCurso, debe, onIniciar, onFinalizar }: Comun & {
  onIniciar: () => void
  onFinalizar: () => void
}) {
  return (
    <section
      className={`flex items-center gap-3 rounded-2xl border px-3.5 transition-colors duration-300 ${
        enCurso
          ? 'border-[var(--gas-accent-line)] bg-[var(--gas-accent-tint)] shadow-[0_0_0_2px_var(--gas-accent-line)]'
          : 'border-[var(--gas-hairline)] bg-[var(--gas-surface)] shadow-[0_1px_2px_rgba(23,24,28,0.04)]'
      }`}
      style={{ height: ALTO_COMPACTO }}
    >
      {/* Hueco: el auto lo dibuja la capa de arriba, que es la que viaja. */}
      <div className="aspect-[2.15/1] w-[70px] shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--gas-ink)]">
          {auto.nombre}
        </p>
        {enCurso ? (
          <p className="mt-1 flex items-center gap-1.5 truncate">
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--gas-accent)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-white">
              <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
              En uso
            </span>
          </p>
        ) : (
          <p
            className="mt-0.5 truncate text-[12.5px] font-semibold tabular-nums"
            style={{ color: debe ? 'var(--gas-malo)' : 'var(--gas-ink-2)' }}
          >
            {fmtBs(saldo)} · {km} km
          </p>
        )}
      </div>

      <Boton
        tono={enCurso ? 'activo' : 'naranja'}
        tamano="chico"
        className="shrink-0"
        onClick={enCurso ? onFinalizar : onIniciar}
      >
        {enCurso ? 'Dejar de usar' : 'Usar auto'}
      </Boton>
    </section>
  )
}

function TarjetaExpandida({ auto, saldo, km, enCurso, debe, onCargar, onIniciar, onFinalizar, onPromedio }: Comun & {
  onCargar: () => void
  onIniciar: () => void
  onFinalizar: () => void
  onPromedio: () => void
}) {
  return (
    /*
      Con el auto en uso NO cambia solo un renglón: cambia la tarjeta entera —
      fondo ámbar, borde ámbar y un anillo alrededor. Una línea de texto se
      pasa por alto; una tarjeta de otro color, no.
    */
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border transition-colors duration-300 ${
        enCurso
          ? 'border-[var(--gas-accent-line)] bg-[var(--gas-accent-tint)] shadow-[0_0_0_2px_var(--gas-accent-line),0_2px_10px_-2px_rgba(180,83,9,0.25)]'
          : 'border-[var(--gas-hairline)] bg-[var(--gas-surface)] shadow-[0_1px_2px_rgba(23,24,28,0.04)]'
      }`}
    >
      {/* Mismo hueco que arriba: reserva el alto para que la tarjeta mida bien. */}
      <div className="px-5 pt-4">
        <div className="aspect-[2.15/1] w-full" aria-hidden />
      </div>

      <div className="flex items-baseline justify-between px-5 pb-4">
        <h2 className="text-[19px] font-bold tracking-[-0.02em] text-[var(--gas-ink)]">{auto.nombre}</h2>
        {/* El promedio es un botón: es el único lugar desde donde se corrige,
            y tocarlo donde está escrito es más directo que una pantalla de
            ajustes aparte. */}
        <button
          onClick={onPromedio}
          className="-mr-1 rounded-lg px-1 py-0.5 text-[13px] font-semibold tabular-nums text-[var(--gas-ink-2)] underline decoration-dotted decoration-[var(--gas-hairline-2)] underline-offset-4 transition-colors hover:text-[var(--gas-ink)] cursor-pointer"
        >
          {fmtBs(auto.bsPorKm)}/km
        </button>
      </div>

      <div className={`border-t px-5 py-4 ${enCurso ? 'border-[var(--gas-accent-line)]' : 'border-[var(--gas-hairline)]'}`}>
        {/*
          El botón de cargar es un cuadrado con el surtidor, no una etiqueta.

          Con "Cargar gasolina" escrito entero medía 126px y al saldo le
          quedaban 128: "Bs 487,05" se partía en dos renglones. Así ocupa 44 y
          al saldo le sobran 200, sin mover nada de lugar. La etiqueta no se
          pierde — es el título del comprobante que abre.
        */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--gas-ink-3)]">
              Saldo
            </span>
            <p
              className="mt-1 text-[30px] font-bold leading-none tabular-nums tracking-[-0.02em]"
              style={{ color: debe ? 'var(--gas-malo)' : 'var(--gas-ink)' }}
            >
              {fmtBs(saldo)}
            </p>
          </div>

          <BotonCargar onClick={onCargar} />
        </div>

        {/* El estado va a todo el ancho, debajo: al lado del botón, "En uso ·
            88.400 km · 3 personas" se cortaba. */}
        {enCurso ? (
          <p className="mt-2.5 flex items-center gap-2 truncate text-[13px] text-[var(--gas-accent)]">
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--gas-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              En uso
            </span>
            <span className="truncate font-semibold">
              {fmtOdometro(enCurso.kmInicial)} km
              {enCurso.personas > 1 && ` · ${enCurso.personas} personas`}
            </span>
          </p>
        ) : (
          <p
            className="mt-2 text-[14px] font-semibold tabular-nums"
            style={{ color: debe ? 'var(--gas-malo)' : 'var(--gas-ink-2)' }}
          >
            {km} km
          </p>
        )}
      </div>

      {/* `mt-auto` empuja la acción al pie: el sobrante de la tarjeta más baja
          queda acá arriba en vez de dejar las dos de distinto alto. */}
      <div className={`mt-auto border-t p-4 ${enCurso ? 'border-[var(--gas-accent-line)]' : 'border-[var(--gas-hairline)]'}`}>
        <Boton tono={enCurso ? 'activo' : 'naranja'} tamano="grande" className="w-full" onClick={enCurso ? onFinalizar : onIniciar}>
          {enCurso ? 'Dejar de usar auto' : 'Usar auto'}
        </Boton>
      </div>
    </section>
  )
}

/** El surtidor: cargar gasolina, sin gastar el ancho de una etiqueta. */
function BotonCargar({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Cargar gasolina"
      title="Cargar gasolina"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--gas-ink)] text-white transition-colors hover:bg-[#2A2C33] cursor-pointer"
    >
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {/* Surtidor: cuerpo, visor, base y manguera. El mismo glifo que la
            tarjeta de Gas en el Hub. */}
        <rect x="3" y="3" width="10" height="18" rx="2" />
        <line x1="2" y1="21" x2="14" y2="21" />
        <rect x="6" y="6.5" width="4" height="3.5" rx="0.6" opacity="0.55" />
        <path d="M13 9h3.2a1.8 1.8 0 0 1 1.8 1.8v6a1.5 1.5 0 0 0 3 0v-5.6L18.4 9" />
      </svg>
    </button>
  )
}

/* ─── Filtros ──────────────────────────────────────────────────────────────── */

function Meses({ meses, activo, onElegir }: {
  meses: string[]
  activo: string
  onElegir: (m: string) => void
}) {
  if (meses.length === 0) return null

  return (
    <div className="gas-sin-barra -mx-1 flex gap-2 overflow-x-auto px-1 pb-2.5">
      <Chip activo={activo === 'todo'} onClick={() => onElegir('todo')}>Todo</Chip>
      {meses.map(m => (
        <Chip key={m} activo={activo === m} onClick={() => onElegir(m)}>{fmtMes(m)}</Chip>
      ))}
    </div>
  )
}

function Chip({ activo, children, ...rest }: {
  activo: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors cursor-pointer ${
        activo
          ? 'border-[var(--gas-ink)] bg-[var(--gas-ink)] text-[var(--gas-ink-invert)]'
          : 'border-[var(--gas-hairline)] bg-[var(--gas-surface)] text-[var(--gas-ink-2)] hover:text-[var(--gas-ink)]'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

const TIPOS: Array<{ id: FiltroTipo; etiqueta: string }> = [
  { id: 'todo',  etiqueta: 'Todo' },
  { id: 'carga', etiqueta: 'Gasolina pagada' },
  { id: 'viaje', etiqueta: 'Km recorridos' },
]

function Tipos({ activo, onElegir }: { activo: FiltroTipo; onElegir: (t: FiltroTipo) => void }) {
  return (
    <div className="flex gap-1 rounded-xl border border-[var(--gas-hairline)] bg-[var(--gas-surface-alto)] p-0.5">
      {TIPOS.map(t => (
        <button
          key={t.id}
          onClick={() => onElegir(t.id)}
          className={`flex-1 rounded-[10px] py-2 text-[12.5px] font-semibold transition-colors cursor-pointer ${
            activo === t.id
              ? 'bg-[var(--gas-surface)] text-[var(--gas-ink)] shadow-[0_1px_2px_rgba(23,24,28,0.08)]'
              : 'text-[var(--gas-ink-3)] hover:text-[var(--gas-ink-2)]'
          }`}
        >
          {t.etiqueta}
        </button>
      ))}
    </div>
  )
}

/* ─── Historial ────────────────────────────────────────────────────────────── */

function FilaMovimiento({ mov, saldo, onAbrir }: {
  mov: Movimiento
  saldo: number
  onAbrir: () => void
}) {
  const carga = mov.tipo === 'carga'
  const abierto = mov.tipo === 'viaje' && mov.kmFinal === null
  const importe = carga ? mov.monto : mov.tipo === 'viaje' ? miParte(mov) : null

  return (
    <li>
      <button
        onClick={onAbrir}
        className="flex w-full items-start justify-between gap-3 rounded-2xl border border-[var(--gas-hairline)] bg-[var(--gas-surface)] px-4 py-3.5 text-left transition-colors hover:border-[var(--gas-hairline-2)] cursor-pointer"
      >
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-[var(--gas-ink)]">
          {carga ? 'Gasolina pagada' : abierto ? 'Usando el auto' : 'Uso de auto'}
        </p>
        <p className="mt-1 text-[11.5px] text-[var(--gas-ink-3)]">{fmtFechaHora(mov.ocurridoEn)}</p>
        {mov.tipo === 'viaje' && !abierto && (
          <p className="mt-1 text-[11.5px] text-[var(--gas-ink-2)]">
            {/* Ir solo es lo normal y no se menciona: el reparto solo se
                nombra cuando efectivamente hubo con quién repartir. */}
            {fmtKm(kmRecorridos(mov) ?? 0)}
            {esCompartido(mov) && ` · Compartido entre ${mov.personas}`}
          </p>
        )}
        {mov.nota && (
          <p className="mt-1.5 truncate text-[12px] italic text-[var(--gas-ink-2)]">{mov.nota}</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {abierto || importe === null ? (
          <span className="text-[14px] text-[var(--gas-ink-3)]">—</span>
        ) : (
          <span
            className="text-[15.5px] font-bold tabular-nums"
            style={{ color: carga ? 'var(--gas-bueno)' : 'var(--gas-ink)' }}
          >
            {carga ? '+' : '−'}{fmtBs(importe).replace('-', '')}
          </span>
        )}
        <p
          className="mt-1 text-[10.5px] tabular-nums"
          style={{ color: saldo < 0 ? 'var(--gas-malo)' : 'var(--gas-ink-3)' }}
        >
          saldo {fmtBs(saldo)}
        </p>
        </div>
      </button>
    </li>
  )
}

/* ─── Estados ──────────────────────────────────────────────────────────────── */

function Esqueleto() {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-6">
      <div className="h-5 w-16 animate-pulse rounded bg-black/5" />
      <div className="mt-4 h-[300px] animate-pulse rounded-2xl bg-black/5" />
      <div className="mt-4 h-9 animate-pulse rounded-xl bg-black/5" />
    </div>
  )
}

function Fallo() {
  const { recargar } = useGas()
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-[13px] text-[var(--gas-ink-2)]">No se pudieron cargar tus autos.</p>
      <Boton tono="fantasma" className="mt-4" onClick={() => void recargar()}>Reintentar</Boton>
    </div>
  )
}
