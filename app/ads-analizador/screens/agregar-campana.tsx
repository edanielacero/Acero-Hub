'use client'

import { useState } from 'react'
import { IconBrandWhatsapp, IconShoppingCart, IconListSearch, IconLoader2, IconPencil } from '@tabler/icons-react'
import { MULTIPLICADOR_ROAS_OBJETIVO, roasEquilibrio } from '@/lib/ads-analizador/calc'
import { fmtRoas, numeroDeInput, parseNumeroInput } from '@/lib/ads-analizador/format'
import type { Moneda, TipoConversion } from '@/lib/ads-analizador/types'
import { mutar, useAds } from '../components/data'
import { Aviso, Barra, Boton, Campo, Entrada, Pagina, Segmentado, Tarjeta } from '../components/ui'
import { useAdsRouter } from '../router'
import { rutas } from './paths'

type Disponible = { id: string; nombre: string; estado: string }

export function AgregarCampanaScreen() {
  const { crear } = useAds()
  const { navigate } = useAdsRouter()

  const [modo, setModo] = useState<'pegar' | 'lista'>('pegar')
  const [cuenta, setCuenta] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState<Moneda | null>(null)
  const [tipo, setTipo] = useState<TipoConversion | null>(null)
  const [precio, setPrecio] = useState('')
  const [margen, setMargen] = useState('')
  const [margenTocado, setMargenTocado] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lista, setLista] = useState<Disponible[] | null>(null)
  const [cargandoLista, setCargandoLista] = useState(false)
  const [errorLista, setErrorLista] = useState<string | null>(null)

  const p = numeroDeInput(precio)
  const m = numeroDeInput(margen)
  const eq = p > 0 && m > 0 && m <= p ? roasEquilibrio(p, m) : null

  async function buscar() {
    setCargandoLista(true)
    setErrorLista(null)
    setLista(null)
    const r = await mutar(
      `/api/ads-analizador/meta/campaigns-disponibles?ad_account_id=${encodeURIComponent(cuenta.trim())}`,
      { method: 'GET' },
      j => j.campaigns as Disponible[],
    )
    setCargandoLista(false)
    if (r.ok) setLista(r.valor)
    else setErrorLista(r.error)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!moneda) return setError('Elige la moneda de la cuenta publicitaria.')
    if (!tipo) return setError('Elige cómo se cierra la venta.')
    setEnviando(true)
    const r = await crear({
      metaCampaignId: campaignId.trim(),
      metaAdAccountId: cuenta.trim(),
      nombre: nombre.trim(),
      moneda,
      tipoConversion: tipo,
      precioVenta: p,
      margenVenta: m,
    })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    navigate(rutas.campana(r.valor.id))
  }

  return (
    <>
      <Barra angosta titulo="Agregar campaña" atras={rutas.home} />
      <Pagina angosta>
        <form onSubmit={enviar} className="flex flex-col gap-5">
          <Tarjeta className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ads-ink-3)]">Campaña de Meta</h2>

            <Campo etiqueta="Cuenta publicitaria" htmlFor="cuenta" ayuda="El número de la cuenta, con o sin act_ adelante. Lo ves arriba a la izquierda en Ads Manager.">
              <Entrada id="cuenta" value={cuenta} onChange={e => setCuenta(e.target.value)} placeholder="act_1234567890" autoComplete="off" required />
            </Campo>

            <Segmentado
              nombre="Cómo elegir la campaña"
              valor={modo}
              onChange={setModo}
              opciones={[
                { valor: 'pegar', etiqueta: <span className="inline-flex items-center gap-1.5"><IconPencil size={16} />Pegar ID</span> },
                { valor: 'lista', etiqueta: <span className="inline-flex items-center gap-1.5"><IconListSearch size={16} />Elegir de la lista</span> },
              ]}
            />

            {modo === 'pegar' ? (
              <Campo etiqueta="ID de campaña" htmlFor="cid" ayuda="Solo números. En Ads Manager, activa la columna “ID de la campaña”.">
                <Entrada id="cid" inputMode="numeric" value={campaignId} onChange={e => setCampaignId(e.target.value.replace(/\D/g, ''))} placeholder="120211234567890123" autoComplete="off" required />
              </Campo>
            ) : (
              <div className="flex flex-col gap-3">
                <Boton type="button" variante="secundario" onClick={buscar} cargando={cargandoLista} disabled={!cuenta.trim()}>
                  Buscar campañas activas
                </Boton>
                {errorLista && <Aviso tono="amarillo">{errorLista}</Aviso>}
                {lista && lista.length === 0 && <p className="text-sm text-[var(--ads-ink-2)]">No hay campañas activas en esa cuenta.</p>}
                {lista && lista.length > 0 && (
                  <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {lista.map(c => {
                      const elegida = c.id === campaignId
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => { setCampaignId(c.id); if (!nombre) setNombre(c.nombre) }}
                            className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${elegida ? 'border-[var(--ads-accent)] bg-[var(--ads-accent-tint)] ring-1 ring-[var(--ads-accent)]' : 'border-[var(--ads-hairline-2)] bg-white hover:bg-[var(--ads-surface-2)]'}`}
                          >
                            <span className="block font-medium">{c.nombre}</span>
                            <span className="block text-xs text-[var(--ads-ink-3)]">{c.id}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {cargandoLista && <IconLoader2 className="mx-auto animate-spin text-[var(--ads-ink-3)]" />}
              </div>
            )}

            <Campo etiqueta="Nombre" htmlFor="nombre" ayuda="Cómo quieres verla en la app.">
              <Entrada id="nombre" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Curso TOEFL" maxLength={120} required />
            </Campo>

            <Campo etiqueta="Moneda de la cuenta">
              <Segmentado nombre="Moneda" valor={moneda} onChange={setMoneda} opciones={[
                { valor: 'USD', etiqueta: 'USD', detalle: 'Dólares' },
                { valor: 'BOB', etiqueta: 'BOB', detalle: 'Bolivianos' },
              ]} />
            </Campo>
          </Tarjeta>

          <Tarjeta className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ads-ink-3)]">La venta</h2>

            <Campo etiqueta="¿Dónde se cierra la venta?">
              <Segmentado nombre="Tipo de conversión" valor={tipo} onChange={setTipo} opciones={[
                { valor: 'compra_stripe', etiqueta: <span className="inline-flex items-center gap-1.5"><IconShoppingCart size={16} />Compras web</span>, detalle: 'Las compras las trae Meta' },
                { valor: 'venta_manual', etiqueta: <span className="inline-flex items-center gap-1.5"><IconBrandWhatsapp size={16} />WhatsApp</span>, detalle: 'Cargas las ventas a mano' },
              ]} />
            </Campo>

            <div className="grid gap-5 sm:grid-cols-2">
              <Campo etiqueta="Precio de venta" htmlFor="precio">
                <Entrada
                  id="precio" inputMode="decimal" prefijo={moneda === 'BOB' ? 'Bs' : '$'} placeholder="24,00" required
                  value={precio}
                  onChange={e => {
                    const v = parseNumeroInput(e.target.value)
                    setPrecio(v)
                    // En digital el margen suele ser el precio: se copia mientras no lo toquen.
                    if (!margenTocado) setMargen(v)
                  }}
                />
              </Campo>
              <Campo etiqueta="Margen por venta" htmlFor="margen">
                <Entrada
                  id="margen" inputMode="decimal" prefijo={moneda === 'BOB' ? 'Bs' : '$'} placeholder="24,00" required
                  value={margen}
                  onChange={e => { setMargenTocado(true); setMargen(parseNumeroInput(e.target.value)) }}
                />
              </Campo>
            </div>
            <p className="-mt-2 text-xs leading-relaxed text-[var(--ads-ink-2)]">
              El margen es lo que te queda de cada venta después del costo del producto y comisiones.
              En un curso o ebook suele ser igual al precio.
            </p>

            {eq != null && (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--ads-surface-2)] p-3 ring-1 ring-inset ring-[var(--ads-hairline)]">
                <div>
                  <p className="text-xs text-[var(--ads-ink-2)]">ROAS de equilibrio</p>
                  <p className="text-lg font-semibold">{fmtRoas(eq)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--ads-ink-2)]">Objetivo para escalar</p>
                  <p className="text-lg font-semibold">{fmtRoas(eq * MULTIPLICADOR_ROAS_OBJETIVO)}</p>
                </div>
              </div>
            )}
          </Tarjeta>

          {error && <Aviso>{error}</Aviso>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Boton type="button" variante="fantasma" onClick={() => navigate(rutas.home)}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando} disabled={!campaignId || !cuenta.trim()}>Agregar campaña</Boton>
          </div>
        </form>
      </Pagina>
    </>
  )
}
