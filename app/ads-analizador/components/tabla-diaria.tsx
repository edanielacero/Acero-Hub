'use client'

import { useEffect, useRef, useState } from 'react'
import { IconArrowBackUp, IconCheck, IconFlag, IconPencil, IconX } from '@tabler/icons-react'
import { fechaBolivia, fmtEntero, fmtFecha, fmtMoneda, numeroDeInput, paraInput, parseNumeroInput } from '@/lib/ads-analizador/format'
import { netoDia, type VentaDia } from '@/lib/ads-analizador/load'
import type { Cambio, Campana, MetricaDiaria, VentaManual } from '@/lib/ads-analizador/types'
import { ETIQUETA, ICONO, ListaCambios, RegistrarCambio } from './cambios'
import { json, mutar } from './data'
import { Boton, Hoja } from './ui'

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')

/**
 * El día a día de la campaña, con columnas distintas según el objetivo:
 *
 *   Conversaciones: Fecha · Inversión · Ventas · Facturación · Profit ·
 *                   Conversaciones · Costo/conv. · % conversión · Acciones
 *   Compras:        Fecha · Inversión · Clics · Landing · Checkout · Ventas ·
 *                   Costo/resultado · Facturación · Neto · Profit · % conversión · Acciones
 *
 * Neto (solo compras): lo que Stripe depositó después de comisiones, que
 * cambian según el país de la tarjeta. Se carga con el lápiz; mientras no se
 * cargue se muestra estimado (≈ facturación × margen / precio).
 *
 * Acciones, por fila: editar las ventas de ese día y registrar un cambio en
 * esa fecha. Fecha y Acciones quedan fijas a los costados al deslizar la tabla
 * en el celular: se ve de qué día es y se puede actuar sin ir hasta el final.
 */
export function TablaDiaria({ campana, hoy, desde, metricas, ventas, porDia, cambios, onGuardado }: {
  campana: Campana
  hoy: string
  desde: string
  /** Métricas ya filtradas por el rango. */
  metricas: MetricaDiaria[]
  /** Todas las ventas cargadas o corregidas (para la nota). */
  ventas: VentaManual[]
  /** Ventas por día ya resueltas (ver `ventasPorDia`). */
  porDia: Map<string, VentaDia>
  cambios: Cambio[]
  onGuardado: () => void
}) {
  const manual = campana.tipoConversion === 'venta_manual'
  const porFecha = new Map(metricas.map(m => [m.fecha, m]))
  const notas = new Map(ventas.map(v => [v.fecha, v.nota]))
  const cambiosPorDia = new Map<string, Cambio[]>()
  for (const c of cambios) {
    const f = fechaBolivia(c.fecha)
    cambiosPorDia.set(f, [...(cambiosPorDia.get(f) ?? []), c])
  }

  // Siempre HOY (el sync llega hasta ayer, y es el día que más se carga y en
  // el que más se cambia algo), más los días con venta cargada o con un
  // cambio aunque Meta todavía no los haya traído.
  const fechas = new Set(metricas.map(m => m.fecha))
  for (const f of [...porDia.keys(), ...cambiosPorDia.keys()]) if (f >= desde && f <= hoy) fechas.add(f)
  fechas.add(hoy)
  const filas = [...fechas].sort((a, b) => b.localeCompare(a))

  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [borradorNeto, setBorradorNeto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null)
  const [registrandoEn, setRegistrandoEn] = useState<string | null>(null)
  const [viendoCambiosDe, setViendoCambiosDe] = useState<string | null>(null)

  const urlVentas = `/api/ads-analizador/campaigns/${campana.id}/ventas`

  function empezar(fecha: string) {
    setEditando(fecha)
    const v = porDia.get(fecha)
    setBorrador(String(v?.ventas ?? 0))
    setBorradorNeto(v?.neto != null ? paraInput(v.neto) : '')
    setErrorEdicion(null)
  }
  function cancelar() {
    setEditando(null)
    setErrorEdicion(null)
  }
  async function guardar() {
    if (!editando) return
    const n = Number(borrador)
    if (borrador.trim() === '' || !Number.isInteger(n) || n < 0) return setErrorEdicion('Número entero, 0 o más')
    const v = porDia.get(editando)

    let cantidad: number | null = n
    let neto: number | null = null
    if (!manual) {
      // En compras, si las ventas siguen en automático y no se tocaron, no se
      // mandan: así cargar solo el neto no convierte las ventas en "editado".
      if (v?.origen !== 'editada' && n === (v?.ventas ?? 0)) cantidad = null
      if (borradorNeto.trim() !== '') {
        neto = numeroDeInput(borradorNeto)
        if (!Number.isFinite(neto) || neto < 0) return setErrorEdicion('El neto tiene que ser un monto, 0 o más')
      }
      // Nada que corregir: si había una corrección, se vuelve al automático.
      if (cantidad == null && neto == null) {
        if (v?.origen === 'editada' || v?.neto != null) return volverAlAutomatico()
        return cancelar()
      }
    }

    setGuardando(true)
    // La nota se reenvía tal cual: sin ella, el upsert la borraría.
    const r = await mutar(urlVentas, json('POST', { fecha: editando, cantidad, neto, nota: notas.get(editando) ?? null }), () => null)
    setGuardando(false)
    if (!r.ok) return setErrorEdicion(r.error)
    setEditando(null)
    onGuardado()
  }
  async function volverAlAutomatico() {
    if (!editando) return
    setGuardando(true)
    const r = await mutar(`${urlVentas}?fecha=${editando}`, { method: 'DELETE' }, () => null)
    setGuardando(false)
    if (!r.ok) return setErrorEdicion(r.error)
    setEditando(null)
    onGuardado()
  }

  const m$ = (n: number) => fmtMoneda(n, campana.moneda)
  const nombreDia = (f: string) => (f === hoy ? 'hoy' : fmtFecha(f))
  const th = 'whitespace-nowrap px-1.5 py-2 text-right font-medium'
  const td = 'whitespace-nowrap px-1.5 py-1.5 text-right'
  // Fijas a los costados; el fondo tapa lo que se desliza por debajo.
  const fijaIzq = 'sticky left-0 z-[1] bg-white'
  const fijaDer = 'sticky right-0 z-[1] bg-white shadow-[-8px_0_8px_-8px_rgba(16,24,40,0.12)]'

  return (
    <>
      <div className="-mx-5 max-h-[30rem] overflow-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="sticky top-0 z-[2] bg-white">
            <tr className="text-xs text-[var(--ads-ink-3)]">
              <th className={`${fijaIzq} whitespace-nowrap py-2 pl-5 pr-2 text-left font-medium`}>Fecha</th>
              <th className={th}>Inversión</th>
              {manual ? (
                <>
                  <th className={th}>Ventas</th>
                  <th className={th}>Facturación</th>
                  <th className={th}>Profit</th>
                  <th className={th}>Conversaciones</th>
                  <th className={th}>Costo/conv.</th>
                  <th className={th}>% conv.</th>
                </>
              ) : (
                <>
                  <th className={th}>Clics</th>
                  <th className={th}>Landing</th>
                  <th className={th}>Checkout</th>
                  <th className={th}>Ventas</th>
                  <th className={th}>Costo/result.</th>
                  <th className={th}>Facturación</th>
                  <th className={th} title="Lo que depositó Stripe después de comisiones">Neto</th>
                  <th className={th}>Profit</th>
                  <th className={th}>% conv.</th>
                </>
              )}
              <th className={`${fijaDer} whitespace-nowrap py-2 pl-2 pr-5 text-center font-medium`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(fecha => {
              const m = porFecha.get(fecha)
              const v = porDia.get(fecha)
              const n = v?.ventas ?? 0
              const ingreso = v?.ingreso ?? 0
              const inversion = m?.gasto ?? 0
              const neto = netoDia(campana, v)
              const p = neto - inversion
              const cambiosDelDia = cambiosPorDia.get(fecha) ?? []
              const enEdicion = editando === fecha
              const celdaVentas = (
                <td className={`${td} font-semibold`}>
                  {enEdicion
                    ? <CampoVentas fecha={fecha} valor={borrador} error={errorEdicion} deshabilitado={guardando}
                        onChange={t => { setBorrador(t); setErrorEdicion(null) }}
                        onEnter={() => void guardar()} onEscape={cancelar} />
                    : (
                      <span className="inline-flex items-center gap-1.5">
                        {v?.origen === 'editada' && (
                          <span className="rounded bg-[var(--ads-accent-tint)] px-1 text-[10px] font-medium text-[var(--ads-accent-press)]" title="Corregido a mano">editado</span>
                        )}
                        {fmtEntero(n)}
                      </span>
                    )}
                </td>
              )
              return (
                <tr key={fecha} className={`border-t border-[var(--ads-hairline)] ${enEdicion ? 'bg-[var(--ads-accent-tint)]' : ''}`}>
                  <td className={`${fijaIzq} ${enEdicion ? '!bg-[var(--ads-accent-tint)]' : ''} whitespace-nowrap py-1.5 pl-5 pr-2`}>
                    <span className="inline-flex items-center gap-1.5">
                      {fecha === hoy ? <span className="font-semibold">Hoy</span> : fmtFecha(fecha)}
                      {cambiosDelDia.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setViendoCambiosDe(fecha)}
                          title={cambiosDelDia.map(c => ETIQUETA[c.tipo] + (c.detalle ? `: ${c.detalle}` : '')).join(' · ')}
                          aria-label={`Ver ${cambiosDelDia.length} cambio${cambiosDelDia.length > 1 ? 's' : ''} del ${nombreDia(fecha)}`}
                          className="inline-flex items-center gap-0.5 rounded-md bg-[var(--ads-accent-tint)] px-1 py-0.5 text-[var(--ads-accent-press)] transition hover:ring-1 hover:ring-[var(--ads-accent)]"
                        >
                          {ICONO[cambiosDelDia[0].tipo]}
                          {cambiosDelDia.length > 1 && <span className="text-[10px] font-semibold">{cambiosDelDia.length}</span>}
                        </button>
                      )}
                    </span>
                  </td>
                  <td className={td}>{m ? m$(inversion) : <Vacio />}</td>
                  {manual ? (
                    <>
                      {celdaVentas}
                      <td className={td}>{m$(ingreso)}</td>
                      <td className={`${td} font-medium`} style={{ color: p >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)' }}>{m$(p)}</td>
                      <td className={td}>{m ? fmtEntero(m.resultados) : <Vacio />}</td>
                      <td className={`${td} text-[var(--ads-ink-2)]`}>{m && m.resultados > 0 ? m$(inversion / m.resultados) : '—'}</td>
                      <td className={`${td} text-[var(--ads-ink-2)]`}>{pct(n, m?.resultados ?? 0)}</td>
                    </>
                  ) : (
                    <>
                      <td className={td}>{m ? fmtEntero(m.clicsEnlace ?? 0) : <Vacio />}</td>
                      <td className={td}>{m ? fmtEntero(m.landingPageViews ?? 0) : <Vacio />}</td>
                      <td className={td}>{m ? fmtEntero(m.pagosIniciados ?? 0) : <Vacio />}</td>
                      {celdaVentas}
                      <td className={`${td} text-[var(--ads-ink-2)]`}>{n > 0 ? m$(inversion / n) : '—'}</td>
                      <td className={td}>{m$(ingreso)}</td>
                      <td className={td}>
                        {enEdicion
                          ? <CampoNeto fecha={fecha} valor={borradorNeto} prefijo={campana.moneda === 'BOB' ? 'Bs' : '$'}
                              placeholder={paraInput(Math.round(neto * 100) / 100)} deshabilitado={guardando}
                              onChange={t => { setBorradorNeto(t); setErrorEdicion(null) }}
                              onEnter={() => void guardar()} onEscape={cancelar} />
                          : v?.neto != null
                            ? <span className="inline-flex items-center gap-1.5">
                                <span className="rounded bg-[var(--ads-accent-tint)] px-1 text-[10px] font-medium text-[var(--ads-accent-press)]" title="Cargado a mano desde Stripe">real</span>
                                {m$(neto)}
                              </span>
                            : <span className="text-[var(--ads-ink-3)]" title="Estimado: facturación × margen / precio">≈ {m$(neto)}</span>}
                      </td>
                      <td className={`${td} font-medium`} style={{ color: p >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)' }}>{m$(p)}</td>
                      <td className={`${td} text-[var(--ads-ink-2)]`}>{pct(n, m?.landingPageViews ?? 0)}</td>
                    </>
                  )}
                  <td className={`${fijaDer} ${enEdicion ? '!bg-[var(--ads-accent-tint)]' : ''} py-1 pl-2 pr-4`}>
                    {enEdicion ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <Accion etiqueta="Guardar" onClick={() => void guardar()} deshabilitado={guardando} primaria>
                          <IconCheck size={16} />
                        </Accion>
                        <Accion etiqueta="Cancelar" onClick={cancelar} deshabilitado={guardando}>
                          <IconX size={16} />
                        </Accion>
                        {!manual && (v?.origen === 'editada' || v?.neto != null) && (
                          <Accion etiqueta="Volver al dato automático" onClick={() => void volverAlAutomatico()} deshabilitado={guardando}>
                            <IconArrowBackUp size={16} />
                          </Accion>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-0.5">
                        <Accion etiqueta={`Editar ventas del ${nombreDia(fecha)}`} onClick={() => empezar(fecha)} deshabilitado={editando != null}>
                          <IconPencil size={16} />
                        </Accion>
                        <Accion etiqueta={`Registrar un cambio el ${nombreDia(fecha)}`} onClick={() => setRegistrandoEn(fecha)}>
                          <IconFlag size={16} />
                        </Accion>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {registrandoEn && (
        <RegistrarCambio
          campanaId={campana.id}
          fecha={registrandoEn}
          etiquetaFecha={nombreDia(registrandoEn)}
          abierta
          onCerrar={() => setRegistrandoEn(null)}
          onGuardado={onGuardado}
        />
      )}

      <Hoja
        abierta={viendoCambiosDe != null}
        onCerrar={() => setViendoCambiosDe(null)}
        titulo={viendoCambiosDe ? `Cambios del ${nombreDia(viendoCambiosDe)}` : 'Cambios'}
      >
        {viendoCambiosDe && (
          <div className="flex flex-col gap-4">
            <ListaCambios
              campanaId={campana.id}
              cambios={cambiosPorDia.get(viendoCambiosDe) ?? []}
              onBorrado={onGuardado}
            />
            <Boton variante="secundario" icono={<IconFlag size={16} />} onClick={() => { setRegistrandoEn(viendoCambiosDe); setViendoCambiosDe(null) }}>
              Registrar otro cambio este día
            </Boton>
          </div>
        )}
      </Hoja>
    </>
  )
}

function Accion({ etiqueta, onClick, children, primaria = false, deshabilitado = false }: {
  etiqueta: string; onClick: () => void; children: React.ReactNode; primaria?: boolean; deshabilitado?: boolean
}) {
  return (
    <button
      type="button" aria-label={etiqueta} title={etiqueta} onClick={onClick} disabled={deshabilitado}
      className={`grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-40 ${
        primaria
          ? 'bg-[var(--ads-accent)] text-white hover:bg-[var(--ads-accent-press)]'
          : 'text-[var(--ads-ink-2)] hover:bg-black/5 hover:text-[var(--ads-accent)]'
      }`}
    >
      {children}
    </button>
  )
}

function Vacio() {
  return <span className="text-[var(--ads-ink-3)]" title="Meta todavía no trajo este día">·</span>
}

/** Solo el número. Enter guarda, Escape cancela; ✓ y ✕ están en Acciones. */
function CampoVentas({ fecha, valor, error, deshabilitado, onChange, onEnter, onEscape }: {
  fecha: string; valor: string; error: string | null; deshabilitado: boolean
  onChange: (t: string) => void; onEnter: () => void; onEscape: () => void
}) {
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => { campo.current?.select() }, [])
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <input
        ref={campo}
        aria-label={`Ventas del ${fecha}`}
        inputMode="numeric"
        value={valor}
        disabled={deshabilitado}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={e => {
          if (e.key === 'Enter') onEnter()
          if (e.key === 'Escape') onEscape()
        }}
        className="h-8 w-16 rounded-lg border border-[var(--ads-accent)] bg-white px-2 text-right text-base font-semibold outline-none ring-2 ring-[var(--ads-accent-tint)] sm:text-sm"
      />
      {error && <span className="text-[11px] font-normal text-[var(--ads-rojo)]">{error}</span>}
    </span>
  )
}

/** El neto recibido: acepta coma decimal. Enter guarda, Escape cancela. */
function CampoNeto({ fecha, valor, prefijo, placeholder, deshabilitado, onChange, onEnter, onEscape }: {
  fecha: string; valor: string; prefijo: string; placeholder: string; deshabilitado: boolean
  onChange: (t: string) => void; onEnter: () => void; onEscape: () => void
}) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ads-accent)] bg-white px-2 ring-2 ring-[var(--ads-accent-tint)]">
      <span className="text-xs text-[var(--ads-ink-3)]">{prefijo}</span>
      <input
        aria-label={`Neto recibido el ${fecha}`}
        inputMode="decimal"
        value={valor}
        placeholder={placeholder}
        disabled={deshabilitado}
        onChange={e => onChange(parseNumeroInput(e.target.value))}
        onKeyDown={e => {
          if (e.key === 'Enter') onEnter()
          if (e.key === 'Escape') onEscape()
        }}
        className="w-20 bg-transparent text-right text-base font-semibold outline-none placeholder:font-normal placeholder:text-[var(--ads-ink-3)] sm:text-sm"
      />
    </span>
  )
}
