'use client'

import { useState } from 'react'
import { Aviso, Boton, Campo, CampoNota, Comprobante, Corte, Renglon } from './ui'
import { useGas } from './data'
import { fmtBs, fmtFechaHora, fmtKm, fmtOdometro, numeroDeInput, paraInput, parseNumeroInput } from '@/lib/gas/format'
import { costoTotal, esCompartido, kmRecorridos, miParte, round2 } from '@/lib/gas/calc'
import type { Auto, Movimiento, Viaje } from '@/lib/gas/types'

/* ─── Cargar gasolina ─────────────────────────────────────────────────────────── */

export function ComprobanteCarga({ auto, saldo, onCerrar }: {
  auto: Auto
  saldo: number
  onCerrar: () => void
}) {
  const { cargarSaldo } = useGas()
  const [monto, setMonto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const valor = numeroDeInput(monto)
  const valido = Number.isFinite(valor) && valor > 0

  const confirmar = async () => {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const r = await cargarSaldo(auto.id, valor)
    if (r.ok) { onCerrar(); return }
    setError(r.error)
    setEnviando(false)
  }

  return (
    <Comprobante rotulo={`Gas · ${auto.nombre}`} titulo="Cargar gasolina" onCerrar={onCerrar}>
      <Campo
        etiqueta="Cuánto cargaste"
        sufijo="Bs"
        placeholder="0,00"
        value={monto}
        autoFocus
        onChange={e => setMonto(parseNumeroInput(e.target.value))}
      />

      <Corte />

      <Renglon etiqueta="Saldo actual" valor={fmtBs(saldo)} tono={saldo < 0 ? 'malo' : undefined} />
      <Renglon
        etiqueta="Queda"
        valor={valido ? fmtBs(round2(saldo + valor)) : '—'}
        fuerte
        tono={valido && round2(saldo + valor) < 0 ? 'malo' : undefined}
      />

      {saldo < 0 && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--gas-ink-2)]">
          El saldo está en rojo: lo que cargues primero cubre los {fmtBs(Math.abs(saldo))} que debés.
        </p>
      )}

      {error && <Aviso>{error}</Aviso>}

      <Boton className="mt-4 w-full" disabled={!valido || enviando} onClick={confirmar}>
        {enviando ? 'Cargando…' : 'Cargar gasolina'}
      </Boton>
    </Comprobante>
  )
}

/* ─── Usar auto ────────────────────────────────────────────────────────── */

const MAX_PERSONAS = 12

export function ComprobanteInicio({ auto, ultimoKm, onCerrar }: {
  auto: Auto
  /** El kilometraje con que terminó el viaje anterior, si hubo alguno. */
  ultimoKm: number | null
  onCerrar: () => void
}) {
  const { iniciarViaje } = useGas()
  // Pre-cargado con el final del viaje anterior: en el 99% de los casos el
  // odómetro no se movió entre medio, y así solo hay que confirmar.
  const [km, setKm] = useState(ultimoKm === null ? '' : paraInput(ultimoKm))
  const [personas, setPersonas] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const valor = numeroDeInput(km)
  const valido = Number.isFinite(valor) && valor >= 0

  const confirmar = async () => {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const r = await iniciarViaje(auto.id, valor, personas)
    if (r.ok) { onCerrar(); return }
    setError(r.error)
    setEnviando(false)
  }

  return (
    <Comprobante rotulo={`Gas · ${auto.nombre}`} titulo="Usar auto" onCerrar={onCerrar}>
      <Campo
        etiqueta="Kilometraje inicial"
        sufijo="km"
        placeholder="0"
        value={km}
        autoFocus={ultimoKm === null}
        onChange={e => setKm(parseNumeroInput(e.target.value, 1))}
        ayuda={ultimoKm !== null && <>El uso anterior terminó en {fmtOdometro(ultimoKm)} km</>}
      />

      <div className="mt-5">
        <span className="mb-2.5 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--gas-ink-3)]">
          Cuántos van en el auto
        </span>
        <div className="flex items-center gap-2">
          <Paso etiqueta="Uno menos" onClick={() => setPersonas(p => Math.max(1, p - 1))} disabled={personas <= 1}>−</Paso>
          <div className="flex-1 text-center">
            <p className="text-[30px] font-bold leading-none tabular-nums text-[var(--gas-ink)]">{personas}</p>
            <p className="mt-1 text-[11px] text-[var(--gas-ink-3)]">
              {personas === 1 ? 'vas solo' : 'contándote a vos'}
            </p>
          </div>
          <Paso etiqueta="Uno más" onClick={() => setPersonas(p => Math.min(MAX_PERSONAS, p + 1))} disabled={personas >= MAX_PERSONAS}>+</Paso>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <Boton tono="naranja" className="mt-5 w-full" disabled={!valido || enviando} onClick={confirmar}>
        {enviando ? 'Empezando…' : 'Usar auto'}
      </Boton>
    </Comprobante>
  )
}

function Paso({ etiqueta, children, ...rest }: { etiqueta: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={etiqueta}
      className="h-12 w-12 shrink-0 rounded-xl border border-[var(--gas-hairline)] bg-[var(--gas-surface-alto)] text-[21px] font-bold text-[var(--gas-ink-2)] transition-colors hover:text-[var(--gas-ink)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
      {...rest}
    >
      {children}
    </button>
  )
}

/* ─── Dejar de usar auto ──────────────────────────────────────────────────────── */

export function ComprobanteCierre({ auto, viaje, onCerrar, onCerrado }: {
  auto: Auto
  viaje: Viaje
  onCerrar: () => void
  onCerrado: (cerrado: Viaje) => void
}) {
  const { finalizarViaje, cancelarViaje } = useGas()
  const [km, setKm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)

  const valor = numeroDeInput(km)
  const valido = Number.isFinite(valor) && valor >= viaje.kmInicial

  // Vista previa en vivo, con el mismo cálculo que va a hacer el resumen.
  const previa = valido ? { ...viaje, kmFinal: valor } : null
  const recorrido = previa ? round2(valor - viaje.kmInicial) : null

  const confirmar = async () => {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const r = await finalizarViaje(viaje.id, valor)
    if (r.ok) { onCerrado(r.valor); return }
    setError(r.error)
    setEnviando(false)
  }

  const cancelar = async () => {
    setEnviando(true)
    setError(null)
    const r = await cancelarViaje(viaje.id)
    if (r.ok) { onCerrar(); return }
    setError(r.error)
    setEnviando(false)
  }

  return (
    <Comprobante rotulo={`Gas · ${auto.nombre}`} titulo="Dejar de usar auto" onCerrar={onCerrar}>
      <Campo
        etiqueta="Kilometraje final"
        sufijo="km"
        placeholder={fmtOdometro(viaje.kmInicial)}
        value={km}
        autoFocus
        onChange={e => setKm(parseNumeroInput(e.target.value, 1))}
      />

      {km !== '' && !valido && (
        <Aviso>El kilometraje final no puede ser menor a {fmtOdometro(viaje.kmInicial)}.</Aviso>
      )}

      <Corte />

      <Renglon etiqueta="Saliste con" valor={`${fmtOdometro(viaje.kmInicial)} km`} />
      <Renglon etiqueta="Recorrido" valor={recorrido === null ? '—' : fmtKm(recorrido)} />
      <Renglon
        etiqueta={previa && esCompartido(previa) ? `Te toca (entre ${viaje.personas})` : 'Te cuesta'}
        valor={previa ? fmtBs(miParte(previa) ?? 0) : '—'}
        fuerte
        tono="acento"
      />

      {error && <Aviso>{error}</Aviso>}

      <Boton tono="naranja" className="mt-4 w-full" disabled={!valido || enviando} onClick={confirmar}>
        {enviando ? 'Cerrando…' : 'Dejar de usar auto'}
      </Boton>

      {/* Salida para el viaje que se abrió sin querer. Solo borra viajes EN
          CURSO —el servidor no acepta otra cosa—, así que no hay forma de
          perder acá un viaje que ya movió el saldo. */}
      {confirmandoCancelar ? (
        <div className="mt-3 flex items-center gap-2">
          <Boton tono="peligro" tamano="chico" className="flex-1" disabled={enviando} onClick={cancelar}>
            Sí, descartarlo
          </Boton>
          <Boton tono="fantasma" tamano="chico" className="flex-1" onClick={() => setConfirmandoCancelar(false)}>
            Volver
          </Boton>
        </div>
      ) : (
        <button
          onClick={() => setConfirmandoCancelar(true)}
          className="mt-3.5 w-full text-center text-[11.5px] text-[var(--gas-ink-3)] transition-colors hover:text-[var(--gas-malo)] cursor-pointer"
        >
          Lo marqué sin querer, descartar este uso
        </button>
      )}
    </Comprobante>
  )
}

/* ─── Resumen del viaje ────────────────────────────────────────────────────── */

/**
 * Lo que se ve apenas se cierra un viaje.
 *
 * El número grande es lo que le tocó pagar A ÉL: en un viaje compartido el
 * total no se muestra, que fue el pedido explícito.
 */
export function ComprobanteResumen({ auto, viaje, saldoNuevo, onCerrar }: {
  auto: Auto
  viaje: Viaje
  saldoNuevo: number
  onCerrar: () => void
}) {
  const { corregirMovimiento } = useGas()
  const km = round2((viaje.kmFinal ?? 0) - viaje.kmInicial)
  const mio = miParte(viaje) ?? 0
  const compartido = esCompartido(viaje)

  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  // La nota es opcional y se guarda al cerrar: si no se escribió nada, cerrar
  // no cuesta ningún request. Siempre se puede agregar después desde el
  // historial, así que un fallo acá tampoco pierde nada — se cierra igual.
  const listo = async () => {
    if (nota.trim() === '') { onCerrar(); return }
    setGuardando(true)
    await corregirMovimiento(viaje.id, { nota: nota.trim() })
    onCerrar()
  }

  return (
    <Comprobante rotulo={`Gas · ${auto.nombre}`} titulo="Uso terminado" onCerrar={onCerrar}>
      <div className="py-1 text-center">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--gas-ink-3)]">
          Te costó
        </p>
        <p className="mt-2 text-[46px] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--gas-ink)]">
          {fmtBs(mio)}
        </p>
        {/* Sin línea cuando fue solo: no hay reparto del que hablar. */}
        {compartido && (
          <p className="mt-2.5 text-[13px] text-[var(--gas-ink-2)]">
            Dividido entre {viaje.personas} personas
          </p>
        )}
      </div>

      <Corte />

      <Renglon etiqueta="Recorrido" valor={fmtKm(km)} fuerte />
      <Renglon etiqueta="Odómetro" valor={`${fmtOdometro(viaje.kmInicial)} → ${fmtOdometro(viaje.kmFinal ?? 0)}`} />
      <Renglon etiqueta={`Costo del uso · ${fmtBs(viaje.bsPorKm)}/km`} valor={fmtBs(costoTotal(viaje) ?? 0)} />

      <Corte />

      <Renglon
        etiqueta={`Saldo de ${auto.nombre}`}
        valor={fmtBs(saldoNuevo)}
        fuerte
        tono={saldoNuevo < 0 ? 'malo' : undefined}
      />

      {saldoNuevo < 0 && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--gas-malo)]">
          Quedaste debiendo {fmtBs(Math.abs(saldoNuevo))}. Se descuenta de la próxima carga.
        </p>
      )}

      <div className="mt-4">
        <CampoNota
          etiqueta="Nota (opcional)"
          placeholder="¿A dónde fuiste?"
          value={nota}
          onChange={e => setNota(e.target.value)}
        />
      </div>

      <Boton tono="fantasma" className="mt-4 w-full" disabled={guardando} onClick={listo}>
        {guardando ? 'Guardando…' : 'Listo'}
      </Boton>
    </Comprobante>
  )
}

/* ─── Corregir un movimiento ───────────────────────────────────────────────── */

/**
 * Se abre tocando cualquier renglón del historial.
 *
 * Es la salida para el error de tipeo que se descubre después: un odómetro con
 * un dígito de más, una carga por el monto equivocado, un viaje que en realidad
 * era compartido. Y el borrado, para lo que no tiene arreglo.
 */
export function ComprobanteCorreccion({ auto, mov, onCerrar }: {
  auto: Auto
  mov: Movimiento
  onCerrar: () => void
}) {
  const { corregirMovimiento, borrarMovimiento } = useGas()
  const esCarga = mov.tipo === 'carga'

  const [monto, setMonto] = useState(esCarga ? paraInput(mov.monto) : '')
  const [kmIni, setKmIni] = useState(mov.tipo === 'viaje' ? paraInput(mov.kmInicial) : '')
  const [kmFin, setKmFin] = useState(
    mov.tipo === 'viaje' && mov.kmFinal !== null ? paraInput(mov.kmFinal) : '',
  )
  const [personas, setPersonas] = useState(mov.tipo === 'viaje' ? mov.personas : 1)
  const [nota, setNota] = useState(mov.nota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false)

  const abierto = mov.tipo === 'viaje' && mov.kmFinal === null

  const nMonto = numeroDeInput(monto)
  const nIni = numeroDeInput(kmIni)
  const nFin = numeroDeInput(kmFin)

  const valido = esCarga
    ? Number.isFinite(nMonto) && nMonto > 0
    : Number.isFinite(nIni) && nIni >= 0 && (abierto || (Number.isFinite(nFin) && nFin >= nIni))

  // Vista previa con los valores tipeados, para ver el costo antes de guardar.
  const previa = !esCarga && !abierto && valido && mov.tipo === 'viaje'
    ? { ...mov, kmInicial: nIni, kmFinal: nFin, personas }
    : null

  const guardar = async () => {
    if (!valido) return
    setEnviando(true)
    setError(null)
    // La nota vacía viaja como `null` y no como '': eso es lo que la borra.
    const laNota = nota.trim() === '' ? null : nota.trim()
    const r = await corregirMovimiento(
      mov.id,
      esCarga
        ? { monto: nMonto, nota: laNota }
        : { kmInicial: nIni, personas, nota: laNota, ...(abierto ? {} : { kmFinal: nFin }) },
    )
    if (r.ok) { onCerrar(); return }
    setError(r.error)
    setEnviando(false)
  }

  const borrar = async () => {
    setEnviando(true)
    setError(null)
    const r = await borrarMovimiento(mov.id)
    if (r.ok) { onCerrar(); return }
    setError(r.error)
    setEnviando(false)
  }

  return (
    <Comprobante
      rotulo={`Gas · ${auto.nombre}`}
      titulo={esCarga ? 'Corregir gasolina' : abierto ? 'Corregir uso en curso' : 'Corregir uso de auto'}
      onCerrar={onCerrar}
    >
      <p className="-mt-3 mb-5 text-[11.5px] text-[var(--gas-ink-3)]">{fmtFechaHora(mov.ocurridoEn)}</p>

      {esCarga ? (
        <Campo
          etiqueta="Cuánto cargaste"
          sufijo="Bs"
          placeholder="0,00"
          value={monto}
          onChange={e => setMonto(parseNumeroInput(e.target.value))}
        />
      ) : (
        <>
          <Campo
            etiqueta="Kilometraje inicial"
            sufijo="km"
            value={kmIni}
            onChange={e => setKmIni(parseNumeroInput(e.target.value, 1))}
          />

          {!abierto && (
            <div className="mt-5">
              <Campo
                etiqueta="Kilometraje final"
                sufijo="km"
                value={kmFin}
                onChange={e => setKmFin(parseNumeroInput(e.target.value, 1))}
              />
            </div>
          )}

          {kmFin !== '' && !abierto && Number.isFinite(nFin) && Number.isFinite(nIni) && nFin < nIni && (
            <Aviso>El kilometraje final no puede ser menor al inicial.</Aviso>
          )}

          <div className="mt-5">
            <span className="mb-2.5 block text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--gas-ink-3)]">
              Cuántos iban en el auto
            </span>
            <div className="flex items-center gap-2">
              <Paso etiqueta="Uno menos" onClick={() => setPersonas(p => Math.max(1, p - 1))} disabled={personas <= 1}>−</Paso>
              <div className="flex-1 text-center">
                <p className="text-[30px] font-bold leading-none tabular-nums text-[var(--gas-ink)]">{personas}</p>
                <p className="mt-1 text-[11px] text-[var(--gas-ink-3)]">
                  {personas === 1 ? 'ibas solo' : 'contándote a vos'}
                </p>
              </div>
              <Paso etiqueta="Uno más" onClick={() => setPersonas(p => Math.min(MAX_PERSONAS, p + 1))} disabled={personas >= MAX_PERSONAS}>+</Paso>
            </div>
          </div>
        </>
      )}

      {!esCarga && (
        <div className="mt-5">
          <CampoNota
            etiqueta="Nota (opcional)"
            placeholder="¿A dónde fuiste?"
            value={nota}
            onChange={e => setNota(e.target.value)}
          />
        </div>
      )}

      {previa && (
        <>
          <Corte />
          <Renglon etiqueta="Recorrido" valor={fmtKm(round2(nFin - nIni))} />
          <Renglon etiqueta="Te cuesta" valor={fmtBs(miParte(previa) ?? 0)} fuerte tono="acento" />
        </>
      )}

      {error && <Aviso>{error}</Aviso>}

      <Boton className="mt-5 w-full" disabled={!valido || enviando} onClick={guardar}>
        {enviando ? 'Guardando…' : 'Guardar cambios'}
      </Boton>

      {confirmandoBorrar ? (
        <div className="mt-3 flex items-center gap-2">
          <Boton tono="peligro" tamano="chico" className="flex-1" disabled={enviando} onClick={borrar}>
            Sí, borrarlo
          </Boton>
          <Boton tono="fantasma" tamano="chico" className="flex-1" onClick={() => setConfirmandoBorrar(false)}>
            Volver
          </Boton>
        </div>
      ) : (
        <button
          onClick={() => setConfirmandoBorrar(true)}
          className="mt-3.5 w-full text-center text-[11.5px] text-[var(--gas-ink-3)] transition-colors hover:text-[var(--gas-malo)] cursor-pointer"
        >
          Borrar este movimiento del historial
        </button>
      )}
    </Comprobante>
  )
}

/* ─── Corregir el promedio del auto ────────────────────────────────────────── */

/**
 * Se abre tocando el `Bs X/km` de la tarjeta.
 *
 * Cambiarlo **no reescribe el pasado**: cada viaje guarda el promedio que el
 * auto tenía cuando se inició. Está dicho en el comprobante porque es lo
 * primero que uno se pregunta al tocarlo.
 */
export function ComprobantePromedio({ auto, onCerrar }: { auto: Auto; onCerrar: () => void }) {
  const { corregirAuto } = useGas()
  const [valor, setValor] = useState(paraInput(auto.bsPorKm))
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const n = numeroDeInput(valor)
  const valido = Number.isFinite(n) && n > 0

  const guardar = async () => {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const r = await corregirAuto(auto.id, { bsPorKm: n })
    if (r.ok) { onCerrar(); return }
    setError(r.error)
    setEnviando(false)
  }

  return (
    <Comprobante rotulo={`Gas · ${auto.nombre}`} titulo="Promedio del auto" onCerrar={onCerrar}>
      <Campo
        etiqueta="Cuánto gasta por kilómetro"
        sufijo="Bs/km"
        placeholder="0,00"
        value={valor}
        autoFocus
        onChange={e => setValor(parseNumeroInput(e.target.value))}
        ayuda="Los viajes ya registrados conservan el promedio que tenían: esto rige de acá en adelante."
      />

      <Corte />

      <Renglon etiqueta="100 km te costarían" valor={fmtBs(round2(n * 100))} fuerte tono="acento" />

      {error && <Aviso>{error}</Aviso>}

      <Boton className="mt-5 w-full" disabled={!valido || enviando} onClick={guardar}>
        {enviando ? 'Guardando…' : 'Guardar promedio'}
      </Boton>
    </Comprobante>
  )
}

/* ─── Detalle de un movimiento ─────────────────────────────────────────────── */

/**
 * Lo que se abre al tocar un renglón del historial.
 *
 * Es de SOLO LECTURA a propósito: tocar para mirar es lo que uno hace mil
 * veces, y editar es lo excepcional. Antes el toque abría el editor directo, lo
 * que dejaba los campos de kilometraje a un dedazo de cambiarse sin querer.
 * Para editar hay que pedirlo con el botón.
 */
export function ComprobanteDetalle({ auto, mov, saldo, onEditar, onCerrar }: {
  auto: Auto
  mov: Movimiento
  /** El saldo en que quedó el auto después de este movimiento. */
  saldo: number
  onEditar: () => void
  onCerrar: () => void
}) {
  const esCarga = mov.tipo === 'carga'
  const abierto = mov.tipo === 'viaje' && mov.kmFinal === null

  return (
    <Comprobante
      rotulo={`Gas · ${auto.nombre}`}
      titulo={esCarga ? 'Gasolina pagada' : abierto ? 'Usando el auto' : 'Uso de auto'}
      onCerrar={onCerrar}
    >
      <p className="-mt-3 text-[11.5px] text-[var(--gas-ink-3)]">{fmtFechaHora(mov.ocurridoEn)}</p>

      {/* La cifra grande: lo que el movimiento significa de un vistazo. */}
      <div className="py-4 text-center">
        {esCarga ? (
          <>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--gas-ink-3)]">
              Cargaste
            </p>
            <p className="mt-2 text-[42px] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--gas-bueno)]">
              +{fmtBs(mov.monto)}
            </p>
          </>
        ) : abierto ? (
          <>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--gas-ink-3)]">
              Saliste con
            </p>
            <p className="mt-2 text-[38px] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--gas-ink)]">
              {fmtOdometro(mov.kmInicial)} km
            </p>
            <p className="mt-2.5 text-[13px] text-[var(--gas-accent)]">Todavía lo estás usando</p>
          </>
        ) : (
          <>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--gas-ink-3)]">
              Te costó
            </p>
            <p className="mt-2 text-[42px] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--gas-ink)]">
              {fmtBs(miParte(mov) ?? 0)}
            </p>
            {esCompartido(mov) && (
              <p className="mt-2.5 text-[13px] text-[var(--gas-ink-2)]">
                Dividido entre {mov.personas} personas
              </p>
            )}
          </>
        )}
      </div>

      <Corte />

      {mov.tipo === 'viaje' && (
        <>
          <Renglon
            etiqueta="Odómetro"
            valor={abierto
              ? `${fmtOdometro(mov.kmInicial)} → …`
              : `${fmtOdometro(mov.kmInicial)} → ${fmtOdometro(mov.kmFinal ?? 0)}`}
          />
          {!abierto && <Renglon etiqueta="Recorrido" valor={fmtKm(kmRecorridos(mov) ?? 0)} fuerte />}
          {esCompartido(mov) && <Renglon etiqueta="En el auto" valor={`${mov.personas} personas`} />}
          {!abierto && <Renglon etiqueta="Costo del uso" valor={fmtBs(costoTotal(mov) ?? 0)} />}
          <Renglon etiqueta="Promedio de entonces" valor={`${fmtBs(mov.bsPorKm)}/km`} />
        </>
      )}

      <Corte />

      <Renglon
        etiqueta="Saldo después"
        valor={fmtBs(saldo)}
        fuerte
        tono={saldo < 0 ? 'malo' : undefined}
      />

      {mov.nota && (
        <p className="mt-5 rounded-xl bg-[var(--gas-surface-alto)] px-3.5 py-3 text-[13.5px] italic leading-relaxed text-[var(--gas-ink-2)]">
          {mov.nota}
        </p>
      )}

      <Boton className="mt-5 w-full" onClick={onEditar}>Editar</Boton>
    </Comprobante>
  )
}
