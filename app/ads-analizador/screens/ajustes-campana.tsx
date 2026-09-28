'use client'

import { useEffect, useState } from 'react'
import { IconPlayerPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { MULTIPLICADOR_ROAS_OBJETIVO, roasEquilibrio } from '@/lib/ads-analizador/calc'
import { fmtRoas, montoParaInput, numeroDeInput, paraInput, parseNumeroInput } from '@/lib/ads-analizador/format'
import { useAds } from '../components/data'
import { Aviso, Barra, Boton, Campo, Entrada, Esqueleto, Hoja, Pagina, Tarjeta } from '../components/ui'
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
    const r = await editar(c!.id, { nombre: nombre.trim(), precioVenta: p, margenVenta: m, roasObjetivo: obj })
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
              etiqueta="ROAS objetivo"
              htmlFor="objetivo"
              ayuda={eq != null
                ? `Vacío = automático: ${fmtRoas(eq * MULTIPLICADOR_ROAS_OBJETIVO)} (equilibrio ${fmtRoas(eq)} + 35%). Por debajo de esto la app sugiere probar anuncios nuevos en vez de subir presupuesto.`
                : 'Vacío = automático (equilibrio + 35%).'}
            >
              <Entrada id="objetivo" inputMode="decimal" value={objetivo} onChange={e => setObjetivo(parseNumeroInput(e.target.value))} placeholder={eq != null ? paraInput(Math.round(eq * MULTIPLICADOR_ROAS_OBJETIVO * 100) / 100) : 'Automático'} />
            </Campo>

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
