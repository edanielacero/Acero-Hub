'use client'

import { useMemo, useState } from 'react'
import {
  IconArrowsHorizontal, IconArrowUpRight, IconClockPause, IconHandStop, IconHourglass, IconSettings,
} from '@tabler/icons-react'
import { sumarDias } from '@/lib/ads-analizador/calc'
import { fmtEntero, fmtMoneda } from '@/lib/ads-analizador/format'
import { armarEstado, ventasPorDia, type DetalleCampana } from '@/lib/ads-analizador/load'
import { promptCampana } from '@/lib/ads-analizador/prompt'
import { AnalizarConClaude } from '../components/analizar-con-claude'
import type { Accion } from '@/lib/ads-analizador/types'
import { BarrasDiarias } from '../components/barras-diarias'
import { TipoChip } from '../components/campaign-card'
import { useAds, useDetalle } from '../components/data'
import { DeclineReasonsTable } from '../components/decline-reasons-table'
import { EstadoBadges, explicacion } from '../components/estado-badges'
import { FunnelChart } from '../components/funnel-chart'
import { RoasMedidor } from '../components/roas-badge'
import { Aviso, Barra, Chip, Dato, Esqueleto, Pagina, PillEstado, Segmentado, Tarjeta, estiloEstado } from '../components/ui'
import { TablaDiaria } from '../components/tabla-diaria'
import { AdsLink, useAdsRouter } from '../router'
import { rutas } from './paths'

type Rango = '7' | '14' | '30' | 'todo'

const ACCION: Record<Accion, { titulo: string; icono: React.ReactNode }> = {
  sin_datos: { titulo: 'Esperando datos', icono: <IconClockPause size={20} /> },
  frenar: { titulo: 'Frena y revisa', icono: <IconHandStop size={20} /> },
  esperar: { titulo: 'Todavía es pronto', icono: <IconHourglass size={20} /> },
  escalar_horizontal: { titulo: 'Prueba algo nuevo', icono: <IconArrowsHorizontal size={20} /> },
  escalar_vertical: { titulo: 'Puedes escalar', icono: <IconArrowUpRight size={20} /> },
}

export function CampanaScreen() {
  const { query } = useAdsRouter()
  const id = query.get('id')
  const { detalle, estado, recargar } = useDetalle(id)
  const ads = useAds()

  // Cualquier escritura cambia el semáforo del home también.
  const refrescar = () => { void recargar(); void ads.recargar() }

  return (
    <>
      <Barra
        titulo={detalle?.campana.nombre ?? 'Campaña'}
        subtitulo={ads.sincronizando ? 'Actualizando con Meta…' : detalle && `${detalle.campana.moneda} · ${detalle.campana.tipoConversion === 'venta_manual' ? 'Venta por WhatsApp' : 'Compra por Stripe'}${detalle.campana.activo ? '' : ' · pausada'}`}
        atras={rutas.home}
        acciones={id && (
          <>
            {detalle && (
              <AnalizarConClaude
                compacto
                nombreArchivo={`${detalle.campana.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${detalle.hoy}`}
                armar={() => promptCampana(detalle)}
              />
            )}
            <AdsLink href={rutas.ajustes(id)} aria-label="Ajustes de la campaña" className="grid h-10 w-10 place-items-center rounded-full text-[var(--ads-ink-2)] transition hover:bg-black/5">
              <IconSettings size={20} />
            </AdsLink>
          </>
        )}
      />
      <Pagina>
        {estado === 'cargando' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Esqueleto className="h-64 lg:col-span-2" /><Esqueleto className="h-64" />
          </div>
        )}
        {estado === 'no_existe' && <Aviso>Esa campaña no existe o fue borrada.</Aviso>}
        {estado === 'error' && (
          <Aviso>No se pudo cargar la campaña. <button className="font-semibold underline" onClick={() => void recargar()}>Reintentar</button></Aviso>
        )}
        {detalle && estado === 'listo' && <Dashboard d={detalle} refrescar={refrescar} />}
      </Pagina>
    </>
  )
}

/** Las banderas que deciden el color. La fatiga solo acompaña (Sprint 1 §4.8). */
const DECIDE = new Set(['foco_rojo', 'en_aprendizaje', 'muestra_chica', 'reajuste_tecnico', 'ventana_decision'])

function Dashboard({ d, refrescar }: { d: DetalleCampana; refrescar: () => void }) {
  const { campana: c } = d
  // "Todo" por defecto: así el semáforo coincide con el de la tarjeta del home.
  const [rango, setRango] = useState<Rango>('todo')
  const manual = c.tipoConversion === 'venta_manual'
  const fuente = d.totales.fuenteVentas

  const desde = rango === 'todo' ? '0000-00-00' : sumarDias(d.hoy, -Number(rango))
  const enRango = useMemo(() => ({
    metricas: d.metricas.filter(m => m.fecha >= desde),
    ventas: d.ventas.filter(v => v.fecha >= desde),
    pagos: d.pagos.filter(p => p.fecha >= desde),
  }), [d, desde])

  // El filtro manda sobre TODO, incluido el semáforo: se recalcula con las
  // mismas reglas sobre el rango. La fuente de ventas sigue siendo la del
  // historial completo (un rango sin días de Stripe no pasa a "Meta").
  const { estado: e, totales: t } = useMemo(
    () => armarEstado(c, enRango.metricas, enRango.ventas, enRango.pagos, d.cambios[0]?.fecha ?? null, d.hoy, fuente),
    [c, enRango, d.cambios, d.hoy, fuente],
  )
  const porDia = useMemo(
    () => ventasPorDia(c, enRango.metricas, enRango.ventas, enRango.pagos, fuente),
    [c, enRango, fuente],
  )

  const est = estiloEstado(e)
  const accion = ACCION[e.accion]
  // Si una bandera ya explica el color, el mensaje de arriba la repetiría.
  const explicadoAbajo = e.banderas.some(b => DECIDE.has(b.tipo))
  const nombreVenta = manual ? 'Ventas' : 'Compras'
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const dias = enRango.metricas.map(m => m.fecha)
  const estimado = fuente !== 'stripe'

  const escalones = manual
    ? [
      { etiqueta: 'Impresiones', valor: t.impresiones },
      { etiqueta: 'Clics', valor: t.clics },
      { etiqueta: 'Conversaciones', valor: t.resultadosMeta },
      { etiqueta: 'Ventas', valor: t.conversiones },
    ]
    : [
      { etiqueta: 'Impresiones', valor: t.impresiones },
      { etiqueta: 'Clics', valor: t.clics },
      { etiqueta: 'Landing', valor: t.landingPageViews },
      { etiqueta: 'Pago iniciado', valor: t.pagosIniciados },
      { etiqueta: 'Compras', valor: t.conversiones },
    ]

  // Conversaciones en WhatsApp; visitas a la landing en compras.
  const paso = manual
    ? { nombre: 'Conversaciones', n: t.resultadosMeta, costo: 'Costo por conversación' }
    : { nombre: 'Visitas a la landing', n: t.landingPageViews, costo: 'Costo por visita' }

  const kpis: { etiqueta: string; valor: string; detalle?: string; color?: string }[] = [
    { etiqueta: 'Inversión', valor: m$(t.gasto) },
    { etiqueta: 'Facturación', valor: m$(t.ingreso), detalle: fuente === 'meta' ? 'estimada (sin Stripe)' : estimado ? `${t.conversiones} × ${m$(c.precioVenta)}` : 'cobrado en Stripe' },
    { etiqueta: 'Profit', valor: m$(t.profit), color: t.profit >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)', detalle: `margen ${m$(c.margenVenta)}/venta` },
    { etiqueta: nombreVenta, valor: fmtEntero(t.conversiones), detalle: fuente === 'meta' ? 'según Meta' : undefined },
    { etiqueta: `Costo por ${manual ? 'venta' : 'compra'}`, valor: t.costoPorConversion == null ? '—' : m$(t.costoPorConversion) },
    { etiqueta: paso.nombre, valor: fmtEntero(paso.n) },
    { etiqueta: paso.costo, valor: paso.n > 0 ? m$(t.gasto / paso.n) : '—' },
    { etiqueta: '% de conversión', valor: paso.n > 0 ? `${((t.conversiones / paso.n) * 100).toFixed(1)}%` : '—', detalle: `${nombreVenta.toLowerCase()} / ${manual ? 'conversaciones' : 'visitas'}` },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* ── El filtro, arriba de todo: manda sobre todo lo de abajo. ── */}
      <div className="sm:ml-auto sm:w-[26rem]">
        <Segmentado nombre="Rango de días" valor={rango} onChange={setRango} opciones={[
          { valor: '7', etiqueta: <span className="whitespace-nowrap">7 días</span> },
          { valor: '14', etiqueta: <span className="whitespace-nowrap">14 días</span> },
          { valor: '30', etiqueta: <span className="whitespace-nowrap">30 días</span> },
          { valor: 'todo', etiqueta: 'Todo' },
        ]} />
      </div>

      {/* ── Semáforo ── */}
      <Tarjeta className="overflow-hidden">
        <div className="flex items-start gap-3 border-b px-5 py-4" style={{ backgroundColor: est.tinte, borderColor: est.linea }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm" style={{ color: est.texto }}>
            {accion.icono}
          </span>
          <div className="min-w-0 flex-1 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.01em]" style={{ color: est.texto }}>{accion.titulo}</h2>
              <PillEstado estado={e} />
            </div>
            {!explicadoAbajo && <p className="mt-1 text-sm leading-relaxed text-[var(--ads-ink)]">{e.mensaje}</p>}
          </div>
        </div>
        {/* Medidor a la izquierda y, si hay, las banderas a la derecha. Los
            cambios ya no van acá: se registran desde el día en la tabla. */}
        <div className={`grid gap-5 p-5 ${e.banderas.length > 0 ? 'lg:grid-cols-2' : ''}`}>
          <RoasMedidor estado={e} />
          {e.banderas.length > 0 && (
            <ul className="flex flex-col gap-2 border-t border-[var(--ads-hairline)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              {e.banderas.map(b => (
                <li key={b.tipo} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-3">
                  <span className="shrink-0"><EstadoBadges banderas={[b]} /></span>
                  <span className="text-[var(--ads-ink-2)]">{explicacion(b)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Tarjeta>

      {fuente === 'meta' && (
        <Aviso tono="info">
          Stripe todavía no tiene datos de esta campaña: las compras y la facturación salen de lo que reporta Meta.
        </Aviso>
      )}

      {/* ── Indicadores del rango ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map(k => (
          <div key={k.etiqueta} className="rounded-2xl border border-[var(--ads-hairline)] bg-white px-4 py-3">
            <Dato etiqueta={k.etiqueta} valor={<span style={k.color ? { color: k.color } : undefined}>{k.valor}</span>} detalle={k.detalle} />
          </div>
        ))}
      </div>

      {/* ── Día por día ── */}
      <Tarjeta className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold">Día por día</h3>
          <div className="flex gap-1.5"><TipoChip tipo={c.tipoConversion} /><Chip>{c.moneda}</Chip></div>
        </div>
        <TablaDiaria
          campana={c} hoy={d.hoy} desde={desde}
          metricas={enRango.metricas} ventas={d.ventas} porDia={porDia} cambios={d.cambios}
          onGuardado={refrescar}
        />
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta className="p-5">
          <h3 className="mb-4 font-semibold">Embudo</h3>
          {t.impresiones === 0 && t.conversiones === 0
            ? <p className="py-6 text-center text-sm text-[var(--ads-ink-3)]">Sin datos en este rango.</p>
            : <FunnelChart escalones={escalones} />}
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-6 p-5">
          <div>
            <h3 className="mb-6 font-semibold">Inversión por día</h3>
            <BarrasDiarias titulo="Inversión por día" puntos={enRango.metricas.map(m => ({ fecha: m.fecha, valor: m.gasto }))} formato={m$} />
          </div>
          <div>
            <h3 className="mb-6 font-semibold">{nombreVenta} por día</h3>
            <BarrasDiarias titulo={`${nombreVenta} por día`} puntos={dias.map(f => ({ fecha: f, valor: porDia.get(f)?.ventas ?? 0 }))} formato={n => fmtEntero(n)} />
          </div>
        </Tarjeta>
      </div>

      {!manual && fuente === 'stripe' && (
        <Tarjeta className="p-5">
          <h3 className="mb-4 font-semibold">Pagos en Stripe</h3>
          <DeclineReasonsTable pagos={enRango.pagos} />
        </Tarjeta>
      )}
    </div>
  )
}
