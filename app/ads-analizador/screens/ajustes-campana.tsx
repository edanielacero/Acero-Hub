'use client'

import { useEffect, useState } from 'react'
import { IconPlayerPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { MULTIPLICADOR_ROAS_OBJETIVO, roasEquilibrio } from '@/lib/ads-analizador/calc'
import { fmtRoas, montoParaInput, numeroDeInput, paraInput, parseNumeroInput } from '@/lib/ads-analizador/format'
import { useAds } from '../components/data'
import type { ModoCorte } from '@/lib/ads-analizador/types'
import { Aviso, Barra, Boton, Campo, Entrada, Esqueleto, Hoja, Pagina, Segmentado, Tarjeta } from '../components/ui'
import { useAdsRouter } from '../router'
import { rutas } from './paths'

export function AjustesCampanaScreen() {
  const { campanas, estado, editar, borrar } = useAds()
  const { query, navigate } = useAdsRouter()
  const id = query.get('id')
  const item = campanas.find(c => c.campana.id === id)
  const c = item?.campana

  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [margen, setMargen] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [cpa, setCpa] = useState('')
  const [modo, setModo] = useState<ModoCorte>('conservador')
  const [show, setShow] = useState('')
  const [close, setClose] = useState('')
  const [capacidad, setCapacidad] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [borrando, setBorrando] = useState(false)

  // Precarga una sola vez por campaña: sin la dependencia en el id, cada
  // recarga de la lista pisaría lo que el usuario está tipeando.
  useEffect(() => {
    if (!c) return
    setNombre(c.nombre)
    setPrecio(montoParaInput(c.precioVenta))
    setMargen(montoParaInput(c.margenVenta))
    setObjetivo(paraInput(c.roasObjetivo))
    setCpa(c.cpaEsperado != null ? montoParaInput(c.cpaEsperado) : '')
    setModo(c.modoCorte)
    setShow(c.showEstimado != null ? String(Math.round(c.showEstimado * 100)) : '')
    setClose(c.closeEstimado != null ? String(Math.round(c.closeEstimado * 100)) : '')
    setCapacidad(c.capacidadChatsDia != null ? String(c.capacidadChatsDia) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id])

  if (estado === 'cargando') {
    return <><Barra angosta titulo="Ajustes" atras={rutas.home} /><Pagina angosta><Esqueleto className="h-96" /></Pagina></>
  }
  if (!c) {
    return (
      <>
        <Barra angosta titulo="Ajustes" atras={rutas.home} />
        <Pagina angosta><Aviso>Esa campaña no existe o fue borrada.</Aviso></Pagina>
      </>
    )
  }

  const p = numeroDeInput(precio)
  const m = numeroDeInput(margen)
  const eq = p > 0 && m > 0 && m <= p ? roasEquilibrio(p, m) : null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(false)
    setGuardando(true)
    const obj = objetivo.trim() === '' ? null : numeroDeInput(objetivo)
    const r = await editar(c!.id, {
      nombre: nombre.trim(), precioVenta: p, margenVenta: m, roasObjetivo: obj,
      cpaEsperado: cpa.trim() === '' ? null : numeroDeInput(cpa),
      modoCorte: modo,
      ...(c!.tipoConversion === 'llamadas' ? { showEstimado: show.trim() === '' ? null : show, closeEstimado: close.trim() === '' ? null : close } : {}),
      ...(c!.tipoConversion === 'venta_manual' ? { capacidadChatsDia: capacidad.trim() === '' ? null : Number(capacidad) } : {}),
    })
    setGuardando(false)
    if (r.ok) setOk(true)
    else setError(r.error)
  }

  async function alternarPausa() {
    setError(null)
    const r = await editar(c!.id, { activo: !c!.activo })
    if (!r.ok) setError(r.error)
  }

  async function confirmarBorrado() {
    setBorrando(true)
    const r = await borrar(c!.id)
    setBorrando(false)
    if (r.ok) navigate(rutas.home)
    else { setConfirmarBorrar(false); setError(r.error) }
  }

  return (
    <>
      <Barra angosta titulo="Ajustes" subtitulo={c.nombre} atras={rutas.campana(c.id)} />
      <Pagina angosta>
        <form onSubmit={guardar} className="flex flex-col gap-5">
          <Tarjeta className="flex flex-col gap-5 p-5">
            <Campo etiqueta="Nombre" htmlFor="nombre">
              <Entrada id="nombre" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} required />
            </Campo>
            <div className="grid gap-5 sm:grid-cols-2">
              <Campo etiqueta="Precio de venta" htmlFor="precio">
                <Entrada id="precio" inputMode="decimal" prefijo={c.moneda === 'BOB' ? 'Bs' : '$'} value={precio} onChange={e => setPrecio(parseNumeroInput(e.target.value))} required />
              </Campo>
              <Campo etiqueta="Margen por venta" htmlFor="margen">
                <Entrada id="margen" inputMode="decimal" prefijo={c.moneda === 'BOB' ? 'Bs' : '$'} value={margen} onChange={e => setMargen(parseNumeroInput(e.target.value))} required />
              </Campo>
            </div>
            <Campo
              etiqueta="ROAS piso"
              htmlFor="objetivo"
              ayuda={eq != null
                ? `Vacío = automático: ${fmtRoas(eq * MULTIPLICADOR_ROAS_OBJETIVO)} (empate ${fmtRoas(eq)} + 35 %). Es el mínimo para considerarse rentable: decide si se escala.`
                : 'Vacío = automático (empate + 35 %).'}
            >
              <Entrada id="objetivo" inputMode="decimal" value={objetivo} onChange={e => setObjetivo(parseNumeroInput(e.target.value))} placeholder={eq != null ? paraInput(Math.round(eq * MULTIPLICADOR_ROAS_OBJETIVO * 100) / 100) : 'Automático'} />
            </Campo>

          </Tarjeta>

          <Tarjeta className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ads-ink-3)]">Reglas de corte</h2>
            <Campo
              etiqueta={`Costo esperado por ${c.tipoConversion === 'llamadas' ? 'llamada' : 'venta'} (opcional)`}
              htmlFor="cpa"
              ayuda={`Vacío = automático: el de una campaña tuya comparable o, sin datos, ${c.tipoConversion === 'llamadas' ? 'el 45 % del valor por llamada' : 'el margen'}. Con 5 conversiones la app pasa a usar tu costo real.`}
            >
              <Entrada id="cpa" inputMode="decimal" prefijo={c.moneda === 'BOB' ? 'Bs' : '$'} value={cpa} onChange={e => setCpa(parseNumeroInput(e.target.value))} placeholder="Automático" />
            </Campo>
            <Campo etiqueta="Modo de corte">
              <Segmentado nombre="Modo de corte" valor={modo} onChange={setModo} opciones={[
                { valor: 'conservador', etiqueta: 'Conservador', detalle: 'Corte al día 5 · ~0,7 % de cortar una buena' },
                { valor: 'estandar', etiqueta: 'Estándar', detalle: 'Corte al día 3 · ~5 % de cortar una buena' },
              ]} />
            </Campo>
            {c.tipoConversion === 'llamadas' && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Campo etiqueta="Asistencia estimada (%)" htmlFor="show" ayuda="Vacío = 60 %. Se reemplaza por la real con 10 llamadas.">
                  <Entrada id="show" inputMode="numeric" value={show} onChange={e => setShow(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder="60" />
                </Campo>
                <Campo etiqueta="Cierre estimado (%)" htmlFor="close" ayuda="Vacío = 20 %. Se reemplaza por el real con 10 asistidas.">
                  <Entrada id="close" inputMode="numeric" value={close} onChange={e => setClose(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder="20" />
                </Campo>
              </div>
            )}
            {c.tipoConversion === 'venta_manual' && (
              <Campo etiqueta="Chats que puedes atender por día (opcional)" htmlFor="capacidad" ayuda="Para avisarte si un presupuesto más alto traería más conversaciones de las que puedes responder.">
                <Entrada id="capacidad" inputMode="numeric" value={capacidad} onChange={e => setCapacidad(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="30" />
              </Campo>
            )}

            {error && <Aviso>{error}</Aviso>}
            {ok && <Aviso tono="info">Cambios guardados.</Aviso>}

            <div className="flex justify-end">
              <Boton type="submit" cargando={guardando}>Guardar cambios</Boton>
            </div>
          </Tarjeta>
        </form>

        <Tarjeta className="mt-5 flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{c.activo ? 'Pausar seguimiento' : 'Reanudar seguimiento'}</p>
              <p className="text-sm text-[var(--ads-ink-2)]">
                {c.activo
                  ? 'Deja de sincronizarse. No pausa nada en Meta y no borra el historial.'
                  : 'Vuelve a sincronizarse todos los días.'}
              </p>
            </div>
            <Boton variante="secundario" onClick={alternarPausa} icono={c.activo ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}>
              {c.activo ? 'Pausar' : 'Reanudar'}
            </Boton>
          </div>
          <div className="border-t border-[var(--ads-hairline)]" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--ads-rojo)]">Borrar campaña</p>
              <p className="text-sm text-[var(--ads-ink-2)]">Borra también todo su historial de métricas, ventas y cambios.</p>
            </div>
            <Boton variante="peligro" onClick={() => setConfirmarBorrar(true)} icono={<IconTrash size={18} />}>Borrar</Boton>
          </div>
        </Tarjeta>
      </Pagina>

      <Hoja abierta={confirmarBorrar} onCerrar={() => setConfirmarBorrar(false)} titulo="¿Borrar esta campaña?">
        <p className="text-sm leading-relaxed text-[var(--ads-ink-2)]">
          Se borra <strong className="text-[var(--ads-ink)]">{c.nombre}</strong> y todo su historial de métricas, ventas y cambios.
          No toca nada en Meta. No se puede deshacer.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Boton variante="fantasma" onClick={() => setConfirmarBorrar(false)}>Cancelar</Boton>
          <Boton variante="peligro" cargando={borrando} onClick={confirmarBorrado} icono={<IconTrash size={18} />}>Sí, borrar</Boton>
        </div>
      </Hoja>
    </>
  )
}
