'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useGas } from '../components/data'
import { AutoDibujo } from '../components/car-art'
import { Boton } from '../components/ui'
import { ComprobanteCarga, ComprobanteCierre, ComprobanteCorreccion, ComprobanteInicio, ComprobantePromedio, ComprobanteResumen } from '../components/sheets'
import { esCompartido, historial, kmDisponibles, kmRecorridos, miParte, saldo as calcSaldo, viajeEnCurso } from '@/lib/gas/calc'
import { fmtBs, fmtFechaHora, fmtHora, fmtKm, fmtMes, fmtOdometro, mesDe } from '@/lib/gas/format'
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
  | { tipo: 'corregir'; autoId: string; movId: string }
  | null

type FiltroTipo = 'todo' | 'carga' | 'viaje'

export function HomeScreen() {
  const { autos, movimientos, estado } = useGas()
  const [activo, setActivo] = useState(0)
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

  if (estado === 'cargando') return <Esqueleto />
  if (estado === 'error') return <Fallo />

  const autoDe = (id: string) => autos.find(a => a.id === id)
  const abierto = popup ? autoDe(popup.autoId) : undefined

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">

      {/* ── Sección superior: fija ─────────────────────────────────────────── */}
      <section className="shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
        <Carrusel onActivo={setActivo}>
          {autos.map(a => (
            <Tarjeta
              key={a.id}
              auto={a}
              movimientos={movimientos.filter(m => m.autoId === a.id)}
              onCargar={() => setPopup({ tipo: 'cargar', autoId: a.id })}
              onIniciar={() => setPopup({ tipo: 'iniciar', autoId: a.id })}
              onFinalizar={() => setPopup({ tipo: 'finalizar', autoId: a.id })}
              onPromedio={() => setPopup({ tipo: 'promedio', autoId: a.id })}
            />
          ))}
        </Carrusel>
      </section>

      {/* ── Filtros: fijos ─────────────────────────────────────────────────── */}
      <section className="shrink-0 border-t border-[var(--gas-hairline)] bg-[var(--gas-surface)]/60 px-5 py-2.5">
        <Meses meses={meses} activo={mesActivo} onElegir={setMes} />
        <Tipos activo={tipo} onElegir={setTipo} />
      </section>

      {/* ── Historial: lo único que scrollea ───────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {filas.length === 0 ? (
          <p className="py-14 text-center text-[12.5px] leading-relaxed text-[var(--gas-ink-3)]">
            {propios.length === 0
              ? <>Todavía no hay movimientos con {auto?.nombre ?? 'este auto'}.</>
              : <>Ningún movimiento con estos filtros.</>}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filas.map(({ mov, saldo }) => (
              <FilaMovimiento
                key={mov.id}
                mov={mov}
                saldo={saldo}
                onCorregir={() => setPopup({ tipo: 'corregir', autoId: mov.autoId, movId: mov.id })}
              />
            ))}
          </ul>
        )}
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

      {popup?.tipo === 'corregir' && abierto && (() => {
        // Se busca por id en el estado y no se guarda el movimiento dentro del
        // popup: así el comprobante siempre muestra lo último que hay.
        const mov = movimientos.find(m => m.id === popup.movId)
        if (!mov) return null
        return <ComprobanteCorreccion auto={abierto} mov={mov} onCerrar={() => setPopup(null)} />
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
      className="gas-sin-barra flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3"
    >
      {children.map((hijo, i) => (
        <div key={i} className="w-[86%] shrink-0 snap-center">{hijo}</div>
      ))}
    </div>
  )
}

/* ─── La tarjeta ───────────────────────────────────────────────────────────── */

function Tarjeta({ auto, movimientos, onCargar, onIniciar, onFinalizar, onPromedio }: {
  auto: Auto
  movimientos: Movimiento[]
  onCargar: () => void
  onIniciar: () => void
  onFinalizar: () => void
  onPromedio: () => void
}) {
  const saldo = calcSaldo(movimientos)
  const km = kmDisponibles(saldo, auto)
  const enCurso = viajeEnCurso(movimientos)
  const debe = saldo < 0

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--gas-hairline)] bg-[var(--gas-surface)] shadow-[0_1px_2px_rgba(23,24,28,0.04)]">
      <div className="px-4 pt-3">
        <AutoDibujo color={auto.color} className="h-auto w-full" />
      </div>

      <div className="flex items-baseline justify-between px-4 pb-3">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-[var(--gas-ink)]">{auto.nombre}</h2>
        {/* El promedio es un botón: es el único lugar desde donde se corrige,
            y tocarlo donde está escrito es más directo que una pantalla de
            ajustes aparte. */}
        <button
          onClick={onPromedio}
          className="-mr-1 rounded-lg px-1 py-0.5 text-[11.5px] font-semibold tabular-nums text-[var(--gas-ink-2)] underline decoration-dotted decoration-[var(--gas-hairline-2)] underline-offset-4 transition-colors hover:text-[var(--gas-ink)] cursor-pointer"
        >
          {fmtBs(auto.bsPorKm)}/km
        </button>
      </div>

      <div className="border-t border-[var(--gas-hairline)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--gas-ink-3)]">
              Saldo
            </span>
            <p
              className="mt-0.5 text-[24px] font-bold leading-none tabular-nums tracking-[-0.02em]"
              style={{ color: debe ? 'var(--gas-malo)' : 'var(--gas-ink)' }}
            >
              {fmtBs(saldo)}
            </p>
          </div>
          <Boton tamano="chico" className="shrink-0" onClick={onCargar}>
            Cargar saldo
          </Boton>
        </div>

        {/* Los km que quedan, y nada más: el saldo de arriba ya dice de dónde
            sale el número, y con saldo en rojo son 0. */}
        <p
          className="mt-1 text-[12px] font-semibold tabular-nums"
          style={{ color: debe ? 'var(--gas-malo)' : 'var(--gas-ink-2)' }}
        >
          {km} km
        </p>
      </div>

      {enCurso && (
        <div className="flex items-center gap-2 border-t border-[var(--gas-accent-line)] bg-[var(--gas-accent-tint)] px-4 py-2">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--gas-accent-fuerte)]" />
          <p className="truncate text-[10.5px] text-[var(--gas-accent)]">
            <strong className="font-bold">En curso</strong> desde {fmtHora(enCurso.ocurridoEn)} ·{' '}
            {fmtOdometro(enCurso.kmInicial)} km ·{' '}
            {enCurso.personas === 1 ? 'solo' : `${enCurso.personas} personas`}
          </p>
        </div>
      )}

      {/* `mt-auto` empuja la acción al pie: el sobrante de la tarjeta más baja
          queda acá arriba en vez de dejar las dos de distinto alto. */}
      <div className="mt-auto border-t border-[var(--gas-hairline)] p-3">
        <Boton tono="naranja" className="w-full" onClick={enCurso ? onFinalizar : onIniciar}>
          {enCurso ? 'Finalizar viaje' : 'Iniciar viaje'}
        </Boton>
      </div>
    </section>
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
    <div className="gas-sin-barra -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
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
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
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
          className={`flex-1 rounded-[9px] py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
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

function FilaMovimiento({ mov, saldo, onCorregir }: {
  mov: Movimiento
  saldo: number
  onCorregir: () => void
}) {
  const carga = mov.tipo === 'carga'
  const abierto = mov.tipo === 'viaje' && mov.kmFinal === null
  const importe = carga ? mov.monto : mov.tipo === 'viaje' ? miParte(mov) : null

  return (
    <li>
      <button
        onClick={onCorregir}
        className="flex w-full items-start justify-between gap-3 rounded-xl border border-[var(--gas-hairline)] bg-[var(--gas-surface)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--gas-hairline-2)] cursor-pointer"
      >
      <div className="min-w-0">
        <p className="text-[12.5px] font-bold text-[var(--gas-ink)]">
          {carga ? 'Carga de saldo' : abierto ? 'Viaje en curso' : 'Viaje'}
        </p>
        <p className="mt-0.5 text-[10.5px] text-[var(--gas-ink-3)]">{fmtFechaHora(mov.ocurridoEn)}</p>
        {mov.tipo === 'viaje' && !abierto && (
          <p className="mt-0.5 text-[10.5px] text-[var(--gas-ink-2)]">
            {fmtKm(kmRecorridos(mov) ?? 0)} · {esCompartido(mov) ? `compartido entre ${mov.personas}` : 'fuiste solo'}
          </p>
        )}
        {mov.nota && (
          <p className="mt-1 truncate text-[11px] italic text-[var(--gas-ink-2)]">{mov.nota}</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {abierto || importe === null ? (
          <span className="text-[12.5px] text-[var(--gas-ink-3)]">—</span>
        ) : (
          <span
            className="text-[13.5px] font-bold tabular-nums"
            style={{ color: carga ? 'var(--gas-bueno)' : 'var(--gas-ink)' }}
          >
            {carga ? '+' : '−'}{fmtBs(importe).replace('-', '')}
          </span>
        )}
        <p
          className="mt-0.5 text-[9.5px] tabular-nums"
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
