'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconArrowsHorizontal, IconArrowUpRight, IconClockPause, IconHandOff, IconHandStop, IconHourglass, IconRefresh, IconScale, IconSettings, IconStethoscope,
} from '@tabler/icons-react'
import { sumarDias } from '@/lib/ads-analizador/calc'
import { fmtEntero, fmtMoneda } from '@/lib/ads-analizador/format'
import { alertasEnVivo, planificarCiclos, ventana, type PlanCiclos } from '@/lib/ads-analizador/ciclos'
import { armarEstado, calcularTotales, colorPorResultado, cpaDeReferencia, profitDelTramo, ventasPorDia, type DetalleCampana } from '@/lib/ads-analizador/load'
import { promptCampana } from '@/lib/ads-analizador/prompt'
import { AnalizarConClaude } from '../components/analizar-con-claude'
import type { Accion, EstadoCampana } from '@/lib/ads-analizador/types'
import { BarrasDiarias } from '../components/barras-diarias'
import { TipoChip } from '../components/campaign-card'
import { json, mutar, useAds, useDetalle } from '../components/data'
import { FunnelChart } from '../components/funnel-chart'
import { Aviso, Barra, Boton, Chip, Dato, Esqueleto, Pagina, PillEstado, Segmentado, Tarjeta, estiloModo } from '../components/ui'
import { TablaDiaria } from '../components/tabla-diaria'
import { PanelCicloVivo, PanelProbabilidades, TarjetaEscalado } from '../components/panel-ciclo'
import { SemaforoCiclos } from '../components/semaforo-ciclos'
import { VistaCierre, VistaEnCurso } from '../components/vistas-ciclo'
import { AdsLink, useAdsRouter } from '../router'
import { rutas } from './paths'

type Rango = '7' | '14' | '30' | 'todo'

const ACCION: Record<Accion, { titulo: string; icono: React.ReactNode }> = {
  sin_datos: { titulo: 'Esperando datos', icono: <IconClockPause size={20} /> },
  chequeo: { titulo: 'Chequeo técnico', icono: <IconStethoscope size={20} /> },
  frenar: { titulo: 'Frena y revisa', icono: <IconHandStop size={20} /> },
  decidir: { titulo: 'Decide: seguir o pausar', icono: <IconScale size={20} /> },
  muy_pronto: { titulo: 'Muy pronto para evaluar', icono: <IconHourglass size={20} /> },
  esperar: { titulo: 'No toques nada', icono: <IconHandOff size={20} /> },
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

  // El semáforo se calcula acá y no en el servidor: el costo de referencia sale
  // de tus otras campañas, que el detalle del servidor no conoce. Lo usan el
  // dashboard y el prompt de Claude, así los dos dicen lo mismo.
  // Los ciclos (abiertos, cerrados, legacy) y el modo del panel salen de
  // `planificarCiclos`; lo que haya que guardar se manda una vez y se recarga.
  const calculo = useMemo(() => {
    if (!detalle) return null
    const ref = cpaDeReferencia(detalle.campana, ads.campanas)
    const plan = planificarCiclos({
      campana: detalle.campana, metricas: detalle.metricas, ventas: detalle.ventas, llamadas: detalle.llamadas,
      cambios: detalle.cambios, guardados: detalle.ciclosGuardados, hoy: detalle.hoy, cpaReferencia: ref,
    })
    const estado = armarEstado(
      detalle.campana, detalle.metricas, detalle.ventas, detalle.llamadas, detalle.cambios[0] ?? null, detalle.hoy, ref,
      plan.ciclos.filter(k => k.diasCiclo).map(k => ({ inicio: k.inicio, diasCiclo: k.diasCiclo })),
    ).estado
    return { plan, estado }
  }, [detalle, ads.campanas])
  const estadoCliente = calculo?.estado ?? null

  const enviado = useRef('')
  useEffect(() => {
    if (!calculo || !id) return
    const { escribir, borrar } = calculo.plan
    if (escribir.length === 0 && borrar.length === 0) return
    const clave = JSON.stringify([escribir, borrar])
    if (enviado.current === clave) return
    enviado.current = clave
    void mutar(`/api/ads-analizador/campaigns/${id}/ciclos`, json('PUT', { escribir, borrar }), () => null)
      .then(r => { if (r.ok) void recargar() })
  }, [calculo, id, recargar])

  async function confirmarCierre() {
    const k = calculo?.plan.actual
    if (!id || !k?.guardadoId) return
    const r = await mutar(`/api/ads-analizador/campaigns/${id}/ciclos`, json('PATCH', { id: k.guardadoId }), () => null)
    if (r.ok) await recargar()
  }

  // Actualizar solo esta campaña con Meta.
  const [errorSync, setErrorSync] = useState<string | null>(null)
  async function actualizar() {
    if (!id) return
    setErrorSync(null)
    const r = await ads.sincronizar(id)
    if (!r.ok) setErrorSync(r.error)
    else if (r.valor.resultados.some(x => !x.ok)) setErrorSync(r.valor.resultados.find(x => !x.ok)?.error ?? 'Meta no respondió.')
  }

  return (
    <>
      <Barra
        titulo={detalle?.campana.nombre ?? 'Campaña'}
        subtitulo={ads.sincronizando ? 'Actualizando con Meta…' : detalle && `${detalle.campana.moneda} · ${{ venta_manual: 'Venta por WhatsApp', compra_stripe: 'Compras en la web', llamadas: 'Llamadas (High Ticket)' }[detalle.campana.tipoConversion]}${detalle.campana.activo ? '' : ' · pausada'}`}
        atras={rutas.home}
        acciones={id && (
          <>
            {detalle?.campana.activo && (
              <Boton variante="secundario" onClick={() => void actualizar()} cargando={ads.sincronizando} icono={<IconRefresh size={18} />} aria-label="Actualizar con Meta" className="px-3">
                <span className="hidden sm:inline">Actualizar</span>
              </Boton>
            )}
            {detalle && (
              <AnalizarConClaude
                compacto
                nombreArchivo={`${detalle.campana.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${detalle.hoy}`}
                armar={() => promptCampana({ ...detalle, estado: estadoCliente ?? detalle.estado, ciclos: calculo?.plan.ciclos.map(k => k.resumen) })}
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
        {errorSync && <div className="mb-4"><Aviso tono="amarillo">No se pudo actualizar: {errorSync}</Aviso></div>}
        {estado === 'no_existe' && <Aviso>Esa campaña no existe o fue borrada.</Aviso>}
        {estado === 'error' && (
          <Aviso>No se pudo cargar la campaña. <button className="font-semibold underline" onClick={() => void recargar()}>Reintentar</button></Aviso>
        )}
        {detalle && calculo && estado === 'listo' && (
          <Dashboard d={detalle} e={calculo.estado} plan={calculo.plan} refrescar={refrescar} onConfirmar={confirmarCierre} />
        )}
      </Pagina>
    </>
  )
}

function Dashboard({ d, e, plan, refrescar, onConfirmar }: {
  d: DetalleCampana; e: EstadoCampana; plan: PlanCiclos; refrescar: () => void; onConfirmar: () => Promise<void>
}) {
  const { campana: c } = d
  const actual = plan.actual
  // En «ciclo» y «cierre» el último ciclo es el de arriba; en «en curso» ya es un anterior más.
  const anteriores = plan.modo === 'en_curso' ? plan.ciclos : plan.ciclos.slice(0, -1)
  const alertas = useMemo(() => alertasEnVivo(d, e), [d, e])
  // "Todo" por defecto. El filtro mueve los indicadores, la tabla y los
  // gráficos; el semáforo no: se mide por ciclo (desde el inicio o el último
  // cambio), con sus días 1, corte y 7 (reglas v2).
  const [rango, setRango] = useState<Rango>('todo')
  const manual = c.tipoConversion === 'venta_manual'
  const conLlamadas = c.tipoConversion === 'llamadas'

  const desde = rango === 'todo' ? '0000-00-00' : sumarDias(d.hoy, -Number(rango))
  const enRango = useMemo(() => ({
    metricas: d.metricas.filter(m => m.fecha >= desde),
    ventas: d.ventas.filter(v => v.fecha >= desde),
    llamadas: d.llamadas.filter(l => l.fecha >= desde),
  }), [d, desde])

  const t = useMemo(() => calcularTotales(c, enRango.metricas, enRango.ventas, enRango.llamadas), [c, enRango])
  const porDia = useMemo(() => ventasPorDia(c, enRango.metricas, enRango.ventas, enRango.llamadas), [c, enRango])

  // Durante el ciclo no hay veredicto: el título pide esperar y el mensaje de
  // abajo sigue explicando cómo va. Excepciones: sin datos y un chequeo que falla.
  const est = estiloModo('ciclo', e)
  const esperarCiclo = !(e.accion === 'sin_datos' || (e.accion === 'chequeo' && e.color === 'rojo'))
  const accion = esperarCiclo
    ? { titulo: 'Espera a que termine el ciclo para tomar decisiones', icono: <IconHourglass size={20} /> }
    : ACCION[e.accion]
  const nombreVenta = manual ? 'Ventas' : conLlamadas ? 'Cierres' : 'Compras'
  const m$ = (n: number) => fmtMoneda(n, c.moneda)
  const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')

  // Mínimo del día para recuperar lo invertido: inversión / margen por
  // conversión. En llamadas la conversión es la agendada (vale margen ×
  // asistencia × cierre), igual que en el semáforo: el cierre llega tarde.
  const agendadasDe = new Map(d.llamadas.map(l => [l.fecha, l.agendadas]))
  const puntosVentas = enRango.metricas.map(m => ({
    fecha: m.fecha,
    valor: conLlamadas ? agendadasDe.get(m.fecha) ?? 0 : porDia.get(m.fecha)?.ventas ?? 0,
    minimo: e.cpa.empate > 0 ? m.gasto / e.cpa.empate : undefined,
    enCurso: m.fecha >= d.hoy,
  }))

  const escalones = conLlamadas
    ? [
      { etiqueta: 'Impresiones', valor: t.impresiones },
      { etiqueta: 'Clics', valor: t.clics },
      { etiqueta: 'Leads', valor: t.resultadosMeta },
      { etiqueta: 'Agendadas', valor: t.llamadas?.agendadas ?? 0 },
      { etiqueta: 'Asistidas', valor: t.llamadas?.asistidas ?? 0 },
      { etiqueta: 'Cerradas', valor: t.llamadas?.cerradas ?? 0 },
    ]
    : manual
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

  const gananciaNeta = {
    etiqueta: 'Ganancia neta', valor: m$(t.neto),
    detalle: manual || conLlamadas
      ? `${t.conversiones} × ${m$(c.margenVenta)} de margen`
      : t.diasConNetoManual > 0
        ? `${t.diasConNetoManual} día${t.diasConNetoManual === 1 ? '' : 's'} real${t.diasConNetoManual === 1 ? '' : 'es'}, resto estimado`
        : 'estimada con el margen',
  }
  const profitKpi = { etiqueta: 'Profit', valor: m$(t.profit), color: t.profit >= 0 ? 'var(--ads-verde)' : 'var(--ads-rojo)', detalle: 'ganancia neta − inversión' }

  let kpis: { etiqueta: string; valor: string; detalle?: string; color?: string }[]
  if (conLlamadas) {
    const l = t.llamadas ?? { agendadas: 0, calificadas: 0, asistidas: 0, cerradas: 0 }
    kpis = [
      { etiqueta: 'Inversión', valor: m$(t.gasto) },
      gananciaNeta,
      profitKpi,
      { etiqueta: 'Llamadas agendadas', valor: fmtEntero(l.agendadas), detalle: l.calificadas ? `${fmtEntero(l.calificadas)} calificadas` : undefined },
      { etiqueta: 'Costo por llamada', valor: l.agendadas > 0 ? m$(t.gasto / l.agendadas) : '—', detalle: l.calificadas ? `${m$(t.gasto / l.calificadas)} por calificada` : undefined },
      { etiqueta: '% de asistencia', valor: pct(l.asistidas, l.agendadas), detalle: `${l.asistidas} de ${l.agendadas}` },
      { etiqueta: '% de cierre', valor: pct(l.cerradas, l.asistidas), detalle: `${l.cerradas} de ${l.asistidas}` },
      { etiqueta: 'ROAS real', valor: t.gasto > 0 ? `${(t.ingreso / t.gasto).toFixed(2)}x` : '—', detalle: 'tarda: el cierre llega semanas después' },
    ]
  } else {
    // Conversaciones en WhatsApp; visitas a la landing en compras.
    const paso = manual
      ? { nombre: 'Conversaciones', n: t.resultadosMeta, costo: 'Costo por conversación' }
      : { nombre: 'Visitas a la landing', n: t.landingPageViews, costo: 'Costo por visita' }
    kpis = [
      { etiqueta: 'Inversión', valor: m$(t.gasto) },
      gananciaNeta,
      profitKpi,
      { etiqueta: nombreVenta, valor: fmtEntero(t.conversiones), detalle: manual ? undefined : 'según Meta' },
      { etiqueta: `Costo por ${manual ? 'venta' : 'compra'}`, valor: t.costoPorConversion == null ? '—' : m$(t.costoPorConversion) },
      { etiqueta: paso.nombre, valor: fmtEntero(paso.n) },
      { etiqueta: paso.costo, valor: paso.n > 0 ? m$(t.gasto / paso.n) : '—' },
      { etiqueta: '% de conversión', valor: pct(t.conversiones, paso.n), detalle: `${nombreVenta.toLowerCase()} / ${manual ? 'conversaciones' : 'visitas'}` },
    ]
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── El filtro, arriba de todo. ── */}
      <div className="flex flex-col gap-1 sm:ml-auto sm:w-[26rem]">
        <Segmentado nombre="Rango de días" valor={rango} onChange={setRango} opciones={[
          { valor: '7', etiqueta: <span className="whitespace-nowrap">7 días</span> },
          { valor: '14', etiqueta: <span className="whitespace-nowrap">14 días</span> },
          { valor: '30', etiqueta: <span className="whitespace-nowrap">30 días</span> },
          { valor: 'todo', etiqueta: 'Todo' },
        ]} />
        <p className="text-right text-[11px] text-[var(--ads-ink-3)]">El semáforo mira el ciclo; el rango, lo demás.</p>
      </div>

      {/* ── Semáforo: ciclo abierto, cierre congelado o campaña en curso ── */}
      {plan.modo === 'cierre' && actual?.snapshot && (
        <VistaCierre
          c={c} k={actual} total={plan.total} anteriores={anteriores} alertas={alertas} hoy={d.hoy}
          desdeCierre={ventana(d, e, sumarDias(actual.snapshot.fin, 1), d.hoy)}
          onContinuar={onConfirmar}
        />
      )}
      {plan.modo === 'en_curso' && actual && (
        <VistaEnCurso
          c={c} e={e} ultimo={actual} total={plan.total} alertas={alertas} anteriores={anteriores} hoy={d.hoy}
          ultimos7={ventana(d, e, sumarDias(d.hoy, -7), d.hoy)}
          desdeCambio={{
            gasto: e.ciclo.gasto, conversiones: e.ciclo.conversiones, roas: e.roasActual, color: colorPorResultado(e),
            profit: profitDelTramo(c, d.metricas, d.ventas, d.llamadas, actual.inicio, d.hoy),
          }}
        />
      )}
      {plan.modo === 'ciclo' && <Tarjeta className="overflow-hidden">
        <div className="flex items-start gap-3 border-b px-5 py-4" style={{ backgroundColor: est.tinte, borderColor: est.linea }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm" style={{ color: est.texto }}>
            {accion.icono}
          </span>
          <div className="min-w-0 flex-1 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.01em]" style={{ color: est.texto }}>{accion.titulo}</h2>
              <PillEstado estado={e} modo="ciclo" />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ads-ink)]">{e.mensaje}</p>
          </div>
        </div>
        {e.ciclo.inicio && e.ciclo.fase !== 'sin_datos' && (
          <div className="p-5"><PanelCicloVivo c={c} e={e} /></div>
        )}
        <SemaforoCiclos c={c} total={plan.total} anteriores={anteriores} />
      </Tarjeta>}

      {plan.modo === 'en_curso' && <TarjetaEscalado c={c} e={e} />}
      <PanelProbabilidades c={c} e={e} ventana={plan.modo === 'ciclo' ? 'Ciclo actual' : 'Desde el último cambio'} />

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
          metricas={enRango.metricas} ventas={d.ventas} llamadas={d.llamadas} porDia={porDia} cambios={d.cambios}
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
            <h3 className="mb-6 font-semibold">{conLlamadas ? 'Llamadas agendadas' : nombreVenta} por día</h3>
            <BarrasDiarias
              titulo={`${conLlamadas ? 'Llamadas agendadas' : nombreVenta} por día`}
              puntos={puntosVentas}
              formato={n => fmtEntero(n)}
              factorPiso={e.roasObjetivo / e.roasEquilibrio}
            />
          </div>
        </Tarjeta>
      </div>
    </div>
  )
}
