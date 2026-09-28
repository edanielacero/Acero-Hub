'use client'

import { useState } from 'react'
import { IconAdjustments, IconPhoto, IconTrash, IconUsersGroup, IconWallet } from '@tabler/icons-react'
import type { Cambio, TipoCambio } from '@/lib/ads-analizador/types'
import { json, mutar } from './data'
import { Aviso, Boton, Campo, Entrada, Hoja, Segmentado } from './ui'

export const ETIQUETA: Record<TipoCambio, string> = {
  presupuesto: 'Presupuesto', creativo: 'Creativo', audiencia: 'Audiencia', otro: 'Otro',
}
export const ICONO: Record<TipoCambio, React.ReactNode> = {
  presupuesto: <IconWallet size={16} />, creativo: <IconPhoto size={16} />,
  audiencia: <IconUsersGroup size={16} />, otro: <IconAdjustments size={16} />,
}

const fmtCuando = (iso: string) => new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(iso)).replace('.', '')

/**
 * Hoja para registrar un cambio hecho en Ads Manager, en el día de la fila
 * desde donde se abrió. Arranca el reloj de cooldown desde ese día.
 */
export function RegistrarCambio({ campanaId, fecha, etiquetaFecha, abierta, onCerrar, onGuardado }: {
  campanaId: string; fecha: string; etiquetaFecha: string; abierta: boolean; onCerrar: () => void; onGuardado: () => void
}) {
  const [tipo, setTipo] = useState<TipoCambio | null>(null)
  const [detalle, setDetalle] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tipo) return setError('Elige qué cambiaste.')
    setGuardando(true)
    setError(null)
    const r = await mutar(`/api/ads-analizador/campaigns/${campanaId}/cambios`, json('POST', { tipo, detalle, fecha }), () => null)
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    setTipo(null)
    setDetalle('')
    onGuardado()
    onCerrar()
  }

  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo={`Registrar un cambio · ${etiquetaFecha}`}>
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-[var(--ads-ink-2)]">
          Anótalo cada vez que cambies algo en Ads Manager. La campaña entra 4 días en reajuste técnico
          y la app no te sugiere otro cambio grande hasta que pasen 7.
        </p>
        <Campo etiqueta="¿Qué cambiaste?">
          <Segmentado
            nombre="Tipo de cambio" valor={tipo} onChange={setTipo} columnas={2}
            opciones={(Object.keys(ETIQUETA) as TipoCambio[]).map(t => ({
              valor: t,
              etiqueta: <span className="inline-flex items-center gap-1.5">{ICONO[t]}{ETIQUETA[t]}</span>,
            }))}
          />
        </Campo>
        <Campo etiqueta="Detalle (opcional)" htmlFor="detalle-cambio">
          <Entrada id="detalle-cambio" value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={500} placeholder="Subí de 25 a 30 Bs/día" />
        </Campo>
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" cargando={guardando}>Registrar cambio</Boton>
      </form>
    </Hoja>
  )
}

export function ListaCambios({ campanaId, cambios, onBorrado }: { campanaId: string; cambios: Cambio[]; onBorrado: () => void }) {
  const [borrando, setBorrando] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (cambios.length === 0) {
    return <p className="text-sm text-[var(--ads-ink-3)]">Todavía no registraste ningún cambio.</p>
  }

  async function borrar(id: string) {
    setBorrando(id)
    setError(null)
    const r = await mutar<null>(`/api/ads-analizador/campaigns/${campanaId}/cambios?cambio=${id}`, { method: 'DELETE' }, () => null)
    setBorrando(null)
    setConfirmar(null)
    if (r.ok) onBorrado()
    else setError(r.error)
  }

  return (
    <>
      {error && <div className="mb-3"><Aviso>{error}</Aviso></div>}
      <ol className="relative flex flex-col gap-4 border-l border-[var(--ads-hairline-2)] pl-5">
        {cambios.map(c => (
          <li key={c.id} className="relative">
            <span className="absolute -left-[29px] top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-white text-[var(--ads-accent)] ring-2 ring-[var(--ads-accent-tint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--ads-accent)]" />
            </span>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">{ICONO[c.tipo]}{ETIQUETA[c.tipo]}</p>
                {c.detalle && <p className="text-sm text-[var(--ads-ink-2)]">{c.detalle}</p>}
                <p className="text-xs text-[var(--ads-ink-3)]">{fmtCuando(c.fecha)}</p>
              </div>
              {confirmar === c.id ? (
                <div className="flex shrink-0 gap-1">
                  <Boton variante="fantasma" className="h-9 px-2 text-xs" onClick={() => setConfirmar(null)}>No</Boton>
                  <Boton variante="peligro" className="h-9 px-2 text-xs" cargando={borrando === c.id} onClick={() => borrar(c.id)}>Borrar</Boton>
                </div>
              ) : (
                <button
                  aria-label="Borrar cambio"
                  onClick={() => setConfirmar(c.id)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ads-ink-3)] hover:bg-black/5 hover:text-[var(--ads-rojo)]"
                >
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}
