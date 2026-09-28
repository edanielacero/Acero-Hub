'use client'

import { useState } from 'react'
import { IconChartBar, IconPlus, IconRefresh } from '@tabler/icons-react'
import { haceCuanto, hoyBolivia } from '@/lib/ads-analizador/format'
import { promptPortafolio } from '@/lib/ads-analizador/prompt'
import { AnalizarConClaude } from '../components/analizar-con-claude'
import type { Color } from '@/lib/ads-analizador/types'
import { useAds } from '../components/data'
import { CampaignCard } from '../components/campaign-card'
import { Aviso, Barra, Boton, Esqueleto, Hoja, Pagina, SEMAFORO } from '../components/ui'
import { AdsLink, useAdsRouter } from '../router'
import { rutas } from './paths'

export function HomeScreen() {
  const { campanas, estado, hoy, recargar, sincronizar, sincronizando, ultimoResultado } = useAds()
  const { navigate } = useAdsRouter()
  const [verDetalle, setVerDetalle] = useState(false)
  // El sync automático al abrir no avisa "todo bien" cada vez: solo el botón.
  const [manual, setManual] = useState(false)

  const resultado = ultimoResultado?.ok ? ultimoResultado.valor : null
  const errorSync = ultimoResultado && !ultimoResultado.ok && manual ? ultimoResultado.error : null

  const activas = campanas.filter(c => c.campana.activo)
  const pausadas = campanas.filter(c => !c.campana.activo)

  const ultimaSync = activas
    .map(c => c.campana.ultimaSync)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1) ?? null

  const conteo = (color: Color) => activas.filter(c => c.estado.color === color && c.estado.accion !== 'sin_datos').length

  async function actualizar() {
    setManual(true)
    await sincronizar()
  }

  const fallidas = resultado?.resultados.filter(r => !r.ok) ?? []
  // Sin clave de Stripe, el aviso saldría en cada apertura: el dashboard ya
  // explica que las compras vienen de Meta. Solo se muestra si se pidió a mano.
  const omitidas = (resultado?.omitidas ?? []).filter(o => manual || o.motivo !== 'stripe_sin_credenciales')
  const hayAviso = fallidas.length > 0 || omitidas.length > 0

  return (
    <>
      <Barra
        titulo="Ads Analizador"
        subtitulo={sincronizando ? 'Actualizando con Meta…' : ultimaSync ? `Última sincronización ${haceCuanto(ultimaSync)}` : 'Tus campañas de Meta, con semáforo'}
        acciones={
          <>
            {campanas.length > 0 && (
              <AnalizarConClaude
                compacto
                etiqueta="Analizar todo con Claude"
                nombreArchivo={`ads-analizador-${hoy ?? 'campanas'}`}
                armar={() => promptPortafolio(campanas, hoy ?? hoyBolivia())}
              />
            )}
            {activas.length > 0 && (
              <Boton variante="secundario" onClick={actualizar} cargando={sincronizando} icono={<IconRefresh size={18} />} aria-label="Actualizar ahora">
                <span className="hidden sm:inline">Actualizar</span>
              </Boton>
            )}
            <Boton onClick={() => navigate(rutas.agregar)} icono={<IconPlus size={18} />} aria-label="Agregar campaña">
              <span className="hidden sm:inline">Agregar campaña</span>
            </Boton>
          </>
        }
      />

      <Pagina>
        {errorSync && <div className="mb-4"><Aviso>{errorSync}</Aviso></div>}
        {resultado && (hayAviso || manual) && (
          <div className="mb-4">
            {hayAviso ? (
              <Aviso tono="amarillo">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {fallidas.length > 0 && `${fallidas.length} campaña${fallidas.length > 1 ? 's' : ''} no se pudo sincronizar. `}
                    {omitidas.length > 0 && 'Stripe no se sincronizó (ver detalle).'}
                  </span>
                  <button className="font-semibold underline" onClick={() => setVerDetalle(true)}>Ver detalle</button>
                </div>
              </Aviso>
            ) : (
              <Aviso tono="info">Sincronizado: {resultado.procesadas} campaña{resultado.procesadas === 1 ? '' : 's'} al día.</Aviso>
            )}
          </div>
        )}

        {estado === 'cargando' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Esqueleto className="h-72" /><Esqueleto className="h-72" />
          </div>
        )}

        {estado === 'error' && (
          <Aviso>
            No se pudieron cargar las campañas. <button className="font-semibold underline" onClick={() => void recargar()}>Reintentar</button>
          </Aviso>
        )}

        {estado === 'listo' && campanas.length === 0 && <Vacio />}

        {estado === 'listo' && activas.length > 0 && (
          <>
            <div className="mb-5 grid grid-cols-3 gap-3">
              {(['verde', 'amarillo', 'rojo'] as const).map(color => (
                <div key={color} className="rounded-2xl border border-[var(--ads-hairline)] bg-white px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEMAFORO[color].punto }} />
                    <span className="text-xs font-medium text-[var(--ads-ink-2)]">{SEMAFORO[color].etiqueta}</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold tracking-[-0.02em]">{conteo(color)}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {ordenar(activas).map(item => <CampaignCard key={item.campana.id} item={item} />)}
            </div>
          </>
        )}

        {estado === 'listo' && pausadas.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ads-ink-3)]">Pausadas</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {pausadas.map(item => <CampaignCard key={item.campana.id} item={item} />)}
            </div>
          </section>
        )}
      </Pagina>

      <Hoja abierta={verDetalle} onCerrar={() => setVerDetalle(false)} titulo="Detalle de la sincronización">
        <ul className="flex flex-col gap-3 text-sm">
          {omitidas.map(o => (
            <li key={o.motivo} className="rounded-xl bg-[var(--ads-amarillo-tint)] p-3 text-[var(--ads-amarillo)]">
              {o.motivo === 'mas_de_una_campana_stripe_activa'
                ? 'Hay más de una campaña de Stripe activa. Como Stripe no sabe de qué campaña viene cada pago, no se repartieron pagos a ninguna. Pausa las que no estén vendiendo.'
                : o.motivo === 'stripe_sin_credenciales'
                  ? 'Falta configurar la clave de Stripe (STRIPE_SECRET_KEY_ADS).'
                  : o.motivo}
            </li>
          ))}
          {resultado?.resultados.map(r => (
            <li key={r.campaign_id} className="flex items-start justify-between gap-3 border-b border-[var(--ads-hairline)] pb-3 last:border-0">
              <span className="font-medium">{r.nombre ?? 'Campaña'}</span>
              <span className={r.ok ? 'text-[var(--ads-verde)]' : 'text-right text-[var(--ads-rojo)]'}>
                {r.ok ? `${r.dias_sincronizados ?? 0} días` : r.error}
              </span>
            </li>
          ))}
        </ul>
      </Hoja>
    </>
  )
}

/** Primero lo que pide atención: rojo, amarillo, verde. */
function ordenar<T extends { estado: { color: Color } }>(xs: T[]): T[] {
  const peso: Record<Color, number> = { rojo: 0, amarillo: 1, verde: 2 }
  return [...xs].sort((a, b) => peso[a.estado.color] - peso[b.estado.color])
}

function Vacio() {
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center rounded-3xl border border-dashed border-[var(--ads-hairline-2)] bg-white px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--ads-accent-tint)] text-[var(--ads-accent)]">
        <IconChartBar size={28} />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Todavía no trackeas ninguna campaña</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ads-ink-2)]">
        Agrega una campaña de Meta con su precio y margen, y la app te dirá si es pronto,
        si puedes escalar o si hay que revisar algo.
      </p>
      <AdsLink
        href={rutas.agregar}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--ads-accent)] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--ads-accent-press)]"
      >
        <IconPlus size={18} /> Agregar la primera
      </AdsLink>
    </div>
  )
}
