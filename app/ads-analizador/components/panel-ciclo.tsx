'use client'

import { IconArrowsHorizontal, IconArrowUpRight, IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import { PRESUPUESTO_MINIMO_RELATIVO, fechaCorta, sumarDias } from '@/lib/ads-analizador/calc'
import { fmtEntero, fmtMoneda } from '@/lib/ads-analizador/format'
import { vistaDeEstado } from '@/lib/ads-analizador/ciclos'
import type { Campana, EstadoCampana, VistaCiclo } from '@/lib/ads-analizador/types'
import { Tarjeta } from './ui'

const pct = (n: number | null | undefined, dec = 0) => (n == null ? '—' : `${(n * 100).toFixed(dec)} %`)

const FUENTE_CPA: Record<EstadoCampana['cpa']['fuente'], string> = {
  real: 'real',
  usuario: 'de ajustes',
  referencia: 'de otra campaña',
  margen: 'sin datos: el margen',
  llamada: 'sin datos: 45 % del valor',
}

export function unidad(c: Campana, plural = true) {
  if (c.tipoConversion === 'llamadas') return plural ? 'llamadas' : 'llamada'
  if (c.tipoConversion === 'venta_manual') return plural ? 'ventas' : 'venta'
  return plural ? 'compras' : 'compra'
}

/** `4 oct` y `6 oct` → `4–6 oct`; si cambia el mes, `30 sep – 2 oct`. */
function entre(a: string, b: string) {
  const [da, ma] = a.split(' '), [db, mb] = b.split(' ')
  return ma === mb ? `${da}–${db} ${mb}` : `${a} – ${b}`
}

/**
 * Una fila del panel: la etiqueta a la izquierda, la barra en la columna común
 * y, a la derecha, el final de la barra (total de días, meta de ventas).
 */
function Fila({ etiqueta, fin, children }: { etiqueta: string; fin?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_3.25rem] items-center gap-x-3 sm:grid-cols-[4.75rem_minmax(0,1fr)_3.5rem]">
      <span className="text-xs font-semibold text-[var(--ads-ink-2)]">{etiqueta}</span>
      <div className="relative">{children}</div>
      <span className="text-right text-[11px] leading-tight text-[var(--ads-ink-2)]">{fin}</span>
    </div>
  )
}

const Fin = ({ valor, texto }: { valor: string; texto: string }) => (
  <><strong className="block text-sm text-[var(--ads-ink)]">{valor}</strong>{texto}</>
)

/** Marca vertical sobre una barra. */
const Marca = ({ en }: { en: string }) => (
  <span className="absolute -top-[5px] h-5 w-[3px] -translate-x-1/2 rounded-full bg-[var(--ads-ink)] ring-2 ring-white" style={{ left: en }} />
)

/** Un calendario chiquito: el mes arriba, el día abajo. */
function Calendario({ fecha }: { fecha: string }) {
  const [d, m] = fechaCorta(fecha).split(' ')
  return (
    <span
      className="inline-flex w-[22px] shrink-0 flex-col overflow-hidden rounded-[4px] bg-white text-center leading-none ring-1 ring-[var(--ads-hairline-2)]"
      title={fechaCorta(fecha)}
      aria-label={fechaCorta(fecha)}
    >
      <span className="bg-[var(--ads-accent)] py-px text-[6.5px] font-bold uppercase tracking-wide text-white">{m}</span>
      <span className="py-[2px] text-[10px] font-semibold tabular-nums text-[var(--ads-ink)]">{d}</span>
    </span>
  )
}

/**
 * El corazón del semáforo: el ciclo en el tiempo y las ventas que lleva. Dibuja
 * una `VistaCiclo`, así que sirve igual en vivo (ciclo abierto), congelado
 * (cierre sin revisar) y en cada ciclo anterior.
 *
 * - Etapas arriba: solo la actual va a color y con calendario; las demás en
 *   gris con la fecha escrita. Un corte hecho (o que no aplica por haber
 *   ventas) no lleva fecha.
 * - Días: llena con los días completos, con una marca entre etapas.
 * - Ventas: se llena hacia la meta (el piso al cierre). En vivo, la marca es lo
 *   que deberías llevar hoy; en un ciclo cerrado, el empate.
 */
export function PanelCiclo({ c, v, titulo, derecha, pronto = false, presupuestoBajo = null, compacto = false }: {
  c: Campana
  v: VistaCiclo
  titulo?: React.ReactNode
  derecha?: React.ReactNode
  /** Antes del corte ir por debajo es normal: el número no se pinta de alarma. */
  pronto?: boolean
  /** Presupuesto diario y recomendado, si es bajo y todavía se espera el corte. */
  presupuestoBajo?: { actual: number; recomendado: number } | null
  compacto?: boolean
}) {
  const total = v.diasCiclo
  const dia = (k: number) => sumarDias(v.inicio, k - 1)
  const posDia = (k: number) => `${(Math.min(k, total) / total) * 100}%`
  const marcas = v.etapas.filter(k => k.estado !== 'apagada' && k.hasta > 0 && k.hasta < total).map(k => k.hasta)

  const S = v.ventas
  const escala = Math.max(v.meta, S, 1)
  const x = (k: number) => Math.min(100, (k / escala) * 100)
  const zona = S < v.empate ? 'rojo' : S < v.piso ? 'amarillo' : 'verde'
  const marca = v.paraHoy != null
    ? { n: v.paraHoy, texto: 'para hoy' }
    : { n: v.empate, texto: 'empate' }
  const verMarca = marca.n > 0 && marca.n < escala
  const u = unidad(c)
  const clamp = (n: number) => `${Math.max(14, Math.min(86, n))}%`

  return (
    <div>
      {(titulo || derecha) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="text-sm font-semibold">{titulo}</div>
          <div className="text-xs text-[var(--ads-ink-2)]">{derecha}</div>
        </div>
      )}

      {/* ── Etapas arriba; las barras de días y ventas quedan juntas debajo ── */}
      <ol className={`mb-4 grid grid-cols-2 gap-x-3 gap-y-2.5 ${compacto ? '' : 'sm:mx-[4.25rem] sm:pl-[1.25rem]'} ${v.etapas.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {v.etapas.map(k => {
          const ahora = k.estado === 'actual'
          const gris = k.estado === 'hecha' || k.estado === 'apagada'
          const conCheck = k.estado === 'hecha' || (k.estado === 'apagada' && k.clave === 'corte')
          const conFecha = k.hasta > 0 && !(k.clave === 'corte' && (k.estado === 'hecha' || k.estado === 'apagada')) && !(k.estado === 'apagada')
          const fechaTexto = k.desde === k.hasta ? fechaCorta(dia(k.desde)) : entre(fechaCorta(dia(k.desde)), fechaCorta(dia(k.hasta)))
          return (
            <li key={k.clave} className={`flex min-w-0 items-center gap-2 ${gris ? 'opacity-50' : ''}`}>
              <span
                className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${ahora ? 'bg-[var(--ads-accent)] ring-4 ring-[var(--ads-accent-tint)]' : conCheck ? 'bg-[var(--ads-ink-3)]' : 'border-2 border-[var(--ads-hairline-2)] bg-white'}`}
              >
                {conCheck && <IconCheck size={10} stroke={3} className="text-white" />}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className={`text-xs font-semibold ${ahora ? 'text-[var(--ads-accent-press)]' : 'text-[var(--ads-ink-3)]'}`}>{k.titulo}</span>
                {conFecha && (ahora ? (
                  <span className="flex items-center gap-0.5 text-[10px] text-[var(--ads-ink-3)]">
                    <Calendario fecha={dia(k.desde)} />
                    {k.desde !== k.hasta && <>–<Calendario fecha={dia(k.hasta)} /></>}
                    {k.est && <span className="ml-0.5">est.</span>}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--ads-ink-3)]">{fechaTexto}{k.est ? ' (est.)' : ''}</span>
                ))}
              </span>
            </li>
          )
        })}
      </ol>

      <Fila etiqueta="Días" fin={<Fin valor={String(total)} texto="días" />}>
        <div className="relative h-2.5 rounded-full bg-[var(--ads-surface-2)] ring-1 ring-inset ring-[var(--ads-hairline-2)]" aria-hidden>
          <div className="h-full rounded-full bg-[var(--ads-accent)]" style={{ width: posDia(v.diasTranscurridos) }} />
          {marcas.map(d => <Marca key={d} en={posDia(d)} />)}
        </div>
      </Fila>

      {/* ── Ventas: etiquetas sobre la barra ── */}
      <div className="mt-1">
        <Fila etiqueta={capital(u)} fin={<Fin valor={fmtEntero(v.meta)} texto={v.paraHoy != null ? 'meta' : 'piso'} />}>
          <div className="relative h-5 text-[11px]">
            <span
              className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap font-semibold"
              style={{ left: clamp(x(S)), color: pronto ? 'var(--ads-ink-2)' : `var(--ads-${zona})` }}
            >
              {fmtEntero(S)} {unidad(c, S !== 1)}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-[var(--ads-surface-2)] ring-1 ring-inset ring-[var(--ads-hairline-2)]" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${x(S)}%`, backgroundColor: `var(--ads-${zona}-dot)` }} />
            {verMarca && <Marca en={`${x(marca.n)}%`} />}
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-[var(--ads-ink-2)]">
            {verMarca && (
              <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: clamp(x(marca.n)) }}>
                <strong className="text-[var(--ads-ink)]">{fmtEntero(marca.n)}</strong> {marca.texto}
              </span>
            )}
          </div>
        </Fila>
      </div>

      {presupuestoBajo && (
        <p className="mt-4 rounded-lg bg-[var(--ads-amarillo-tint)] px-3 py-2 text-xs text-[var(--ads-amarillo)] ring-1 ring-inset ring-[var(--ads-amarillo-line)]">
          Presupuesto bajo: {fmtMoneda(presupuestoBajo.actual, c.moneda)}/día. Se recomienda al menos {fmtMoneda(presupuestoBajo.recomendado, c.moneda)}/día.
        </p>
      )}
    </div>
  )
}

/** El panel del ciclo en vivo, a partir del estado actual. */
export function PanelCicloVivo({ c, e }: { c: Campana; e: EstadoCampana }) {
  if (!e.ciclo.inicio || e.ciclo.fase === 'sin_datos') return null
  const v = vistaDeEstado(e)
  const bajo = e.ciclo.primeraConversion == null && e.banderas.some(b => b.tipo === 'presupuesto_bajo')
  return (
    <PanelCiclo
      c={c}
      v={v}
      titulo="Ciclo actual"
      derecha={<>
        Día <strong className="text-[var(--ads-ink)]">{Math.min(e.ciclo.dias + 1, v.diasCiclo)}</strong> de {v.diasCiclo}
        {e.roasActual != null && <> · ROAS <strong className="text-[var(--ads-ink)]">{e.roasActual.toFixed(2)}x</strong></>}
      </>}
      pronto={e.accion === 'muy_pronto' || e.accion === 'chequeo'}
      presupuestoBajo={bajo ? { actual: e.riesgo.gastoDia, recomendado: e.cpa.esperado * PRESUPUESTO_MINIMO_RELATIVO } : null}
    />
  )
}

/** Un número grande con su pregunta debajo. */
function Prob({ valor, titulo, nota, tono = 'neutro' }: {
  valor: string; titulo: string; nota?: string; tono?: 'neutro' | 'amarillo' | 'rojo'
}) {
  const color = { neutro: 'var(--ads-ink)', amarillo: 'var(--ads-amarillo)', rojo: 'var(--ads-rojo)' }[tono]
  const fondo = { neutro: 'var(--ads-surface-2)', amarillo: 'var(--ads-amarillo-tint)', rojo: 'var(--ads-rojo-tint)' }[tono]
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: fondo }}>
      <p className="text-2xl font-bold tabular-nums tracking-[-0.02em]" style={{ color }}>{valor}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-[var(--ads-ink)]">{titulo}</p>
      {nota && <p className="mt-0.5 text-[11px] text-[var(--ads-ink-3)]">{nota}</p>}
    </div>
  )
}

const capital = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`

/** §3 y §8.2, para leer de un vistazo: qué tan normal es lo que está pasando. */
export function PanelProbabilidades({ c, e, ventana = 'Ciclo actual' }: { c: Campana; e: EstadoCampana; ventana?: string }) {
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const u = unidad(c)
  const { riesgo: r } = e
  if (e.ciclo.fase === 'sin_datos') return null

  const pp = (n: number) => (n < 0.001 ? '< 0,1 %' : n < 0.1 ? pct(n, 1) : pct(n))
  const tonoProb = (n: number) => (n < 0.05 ? 'rojo' : n < 0.2 ? 'amarillo' : 'neutro') as 'rojo' | 'amarillo' | 'neutro'
  // "Por azar" solo tiene sentido si va por debajo de lo esperado.
  const debajo = e.ritmo && e.ciclo.conversiones < e.ritmo.lambdaTotal

  return (
    <Tarjeta className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold">Probabilidades</h3>
        <p className="text-xs text-[var(--ads-ink-3)]">
          {ventana} · esperas {r.lambdaDia.toLocaleString('es', { maximumFractionDigits: 1 })} {u} por día
        </p>
      </div>

      {e.chequeo && (
        <ul className="mb-4 flex flex-col gap-1.5 rounded-xl bg-[var(--ads-surface-2)] p-3 ring-1 ring-inset ring-[var(--ads-hairline)]">
          {e.chequeo.map(ch => (
            <li key={ch.texto} className="flex items-center gap-2 text-sm">
              {ch.ok ? <IconCheck size={16} className="text-[var(--ads-verde)]" /> : <IconX size={16} className="text-[var(--ads-rojo)]" />}
              {ch.texto}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Prob valor={pp(r.pCeroHoy)} titulo={`Un día sin ${u}`} nota={`en la práctica ~${pct(Math.min(1, r.pCeroHoy + 0.075))}`} />
        <Prob valor={pp(r.pCeroVentana.d3)} titulo={`3 días seguidos sin ${u}`} />
        <Prob valor={pp(r.pCeroVentana.d7)} titulo={`7 días seguidos sin ${u}`} />
        {r.racha > 0 && r.pRacha != null ? (
          <Prob
            valor={pp(r.pRacha)}
            titulo="Que sea solo mala suerte"
            nota={`${r.racha} día${r.racha === 1 ? '' : 's'} seguido${r.racha === 1 ? '' : 's'} en cero`}
            tono={tonoProb(r.pRacha)}
          />
        ) : debajo && e.ritmo ? (
          <Prob
            valor={pp(e.ritmo.pBaja)}
            titulo="Que sea solo mala suerte"
            nota={`llevas ${fmtEntero(e.ciclo.conversiones)}; esperabas ~${fmtEntero(Math.round(e.ritmo.lambdaTotal))}`}
            tono={tonoProb(e.ritmo.pBaja)}
          />
        ) : (
          <Prob valor="En ritmo" titulo="Vas igual o mejor de lo esperado" nota={`llevas ${fmtEntero(e.ciclo.conversiones)}; esperabas ~${fmtEntero(Math.round(e.ritmo?.lambdaTotal ?? 0))}`} />
        )}
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-[var(--ads-hairline)] pt-3 text-xs text-[var(--ads-ink-2)] sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt>Costo esperado por {unidad(c, false)}</dt><dd className="font-semibold text-[var(--ads-ink)]">{m$(e.cpa.esperado)} <span className="font-normal text-[var(--ads-ink-3)]">({FUENTE_CPA[e.cpa.fuente]})</span></dd></div>
        <div className="flex justify-between gap-3"><dt>Máximo para el piso</dt><dd className="font-semibold text-[var(--ads-ink)]">{m$(e.cpa.maxPiso)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Reserva hasta el corte</dt><dd className="font-semibold text-[var(--ads-ink)]">{m$(r.reservaCorte)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Reserva hasta el día 7</dt><dd className="font-semibold text-[var(--ads-ink)]">{m$(r.reservaDecision)}</dd></div>
        {e.llamadas && (
          <>
            <div className="flex justify-between gap-3"><dt>Asistencia · cierre</dt><dd className="font-semibold text-[var(--ads-ink)]">{pct(e.llamadas.show)} · {pct(e.llamadas.close)} <span className="font-normal text-[var(--ads-ink-3)]">({{ reales: 'reales', estimadas: 'estimadas', mixtas: 'una estimada' }[e.llamadas.fuenteTasas]})</span></dd></div>
            <div className="flex justify-between gap-3"><dt>Valor por llamada</dt><dd className="font-semibold text-[var(--ads-ink)]">{m$(e.llamadas.valorPorLlamada)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Presupuesto sugerido</dt><dd className="font-semibold text-[var(--ads-ink)]">{m$(e.llamadas.presupuestoSugeridoMin)}–{m$(e.llamadas.presupuestoSugeridoMax)}</dd></div>
          </>
        )}
        {e.mensajes?.conversacionesEsperadasDia != null && (
          <div className="flex justify-between gap-3"><dt>Chats esperados por día</dt><dd className="font-semibold text-[var(--ads-ink)]">{e.mensajes.conversacionesEsperadasDia.toFixed(1)}{c.capacidadChatsDia ? <span className="font-normal text-[var(--ads-ink-3)]"> de {c.capacidadChatsDia} que atiendes</span> : null}</dd></div>
        )}
      </dl>

      {e.bajarCosto && (
        <p className="mt-3 flex gap-2 text-xs text-[var(--ads-ink-2)]">
          <IconInfoCircle size={16} className="shrink-0 text-[var(--ads-ink-3)]" />
          <span>
            Bajar el costo a {m$(e.bajarCosto.objetivo)} en 3 días pide {e.bajarCosto.nuevasNecesarias} {u} nuevas: <strong className="text-[var(--ads-ink)]">{pp(e.bajarCosto.probabilidad)}</strong>. Solo informativo.
          </span>
        </p>
      )}
    </Tarjeta>
  )
}

/** §4.5–4.6: la recomendación de escalado, con sus condiciones. */
export function TarjetaEscalado({ c, e }: { c: Campana; e: EstadoCampana }) {
  const s = e.escalado
  if (!s) return null
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const vertical = s.tipo === 'vertical'

  return (
    <Tarjeta className="border-[var(--ads-verde-line)] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--ads-verde-tint)] text-[var(--ads-verde)]">
          {vertical ? <IconArrowUpRight size={18} /> : <IconArrowsHorizontal size={18} />}
        </span>
        <h3 className="font-semibold">{vertical ? 'Escalado vertical' : 'Escalado horizontal'}</h3>
      </div>
      {vertical ? (
        <ul className="flex flex-col gap-1.5 text-sm text-[var(--ads-ink-2)]">
          <li>Sube de <strong className="text-[var(--ads-ink)]">{m$(s.presupuestoActual)}</strong> a <strong className="text-[var(--ads-ink)]">{m$(s.presupuestoSugerido)}</strong> por día (+{Math.round(s.pasoMin * 100)}–{Math.round(s.pasoMax * 100)} %).</li>
          {s.cpaMaxParaConvenir != null && (
            <li>Solo mejora tu ganancia diaria si el costo por {unidad(c, false)} queda bajo <strong className="text-[var(--ads-ink)]">{m$(s.cpaMaxParaConvenir)}</strong>.</li>
          )}
          <li>Registra el cambio en la tabla (con el presupuesto nuevo): arranca un ciclo nuevo y no se escala otra vez hasta su revisión.</li>
          <li>Si prefieres duplicar de golpe: reinicia la exploración, controles a los 4 y 7 días, pérdida máxima {m$(s.perdidaMaximaSiDuplica)}.</li>
        </ul>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm text-[var(--ads-ink-2)]">
          <li>No subas más este presupuesto: el ROAS ya está a menos de 10 % del piso.</li>
          <li>Crea un conjunto aparte con 1–2 anuncios nuevos y unos <strong className="text-[var(--ads-ink)]">{m$(s.presupuestoSugerido - s.presupuestoActual)}</strong> por día, sin tocar el ganador.</li>
          <li>Con {m$(s.presupuestoSugerido)} por día en total, el máximo de conjuntos aprendiendo a la vez es <strong className="text-[var(--ads-ink)]">{s.maxConjuntos}</strong>.</li>
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--ads-ink-3)]">No combines vertical y horizontal en la misma semana: no sabrías qué causó el cambio.</p>
    </Tarjeta>
  )
}
