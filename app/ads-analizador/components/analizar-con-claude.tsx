'use client'

import { useState } from 'react'
import { IconCheck, IconCopy, IconDownload, IconExternalLink, IconSparkles } from '@tabler/icons-react'
import { Aviso, Boton, Hoja } from './ui'

/**
 * "Analizar con Claude": arma el prompt con los datos, lo copia y te manda a la
 * app de Claude para pegarlo. Sin API ni costo extra — usa tu suscripción.
 *
 * El texto se arma y se copia DENTRO del click: Safari de iPhone solo deja
 * escribir el portapapeles en el gesto del usuario, y cualquier espera en el
 * medio (un fetch) hace que falle en silencio. Por eso `armar` es síncrono y
 * trabaja con los datos que la pantalla ya tiene.
 */
export function AnalizarConClaude({ armar, nombreArchivo, etiqueta = 'Analizar con Claude', compacto = false, deshabilitado = false }: {
  armar: () => string
  nombreArchivo: string
  etiqueta?: string
  /** Solo el ícono en celular (para barras con poco espacio). */
  compacto?: boolean
  deshabilitado?: boolean
}) {
  const [texto, setTexto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t)
      setCopiado('si')
    } catch {
      // Sin permiso de portapapeles (o navegador viejo): el texto se abre
      // a la vista para copiarlo a mano.
      setCopiado('no')
    }
  }

  function abrir() {
    const t = armar()
    setTexto(t)
    setCopiado(null)
    void copiar(t)
  }

  function descargar() {
    if (!texto) return
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${nombreArchivo}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const kb = texto ? Math.max(1, Math.round(new Blob([texto]).size / 1024)) : 0

  return (
    <>
      <Boton
        variante="secundario"
        onClick={abrir}
        disabled={deshabilitado}
        icono={<IconSparkles size={18} className="text-[var(--ads-accent)]" />}
        aria-label={etiqueta}
      >
        <span className={compacto ? 'hidden sm:inline' : ''}>{etiqueta}</span>
      </Boton>

      <Hoja abierta={texto != null} onCerrar={() => setTexto(null)} titulo="Analizar con Claude">
        <div className="flex flex-col gap-4">
          {copiado === 'si' && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--ads-verde-tint)] px-3.5 py-2.5 text-sm font-medium text-[var(--ads-verde)] ring-1 ring-inset ring-[var(--ads-verde-line)]" role="status">
              <IconCheck size={18} /> Prompt y datos copiados ({kb} KB)
            </div>
          )}
          {copiado === 'no' && (
            <Aviso tono="amarillo">No se pudo copiar solo. Toca “Copiar” o selecciona el texto de abajo.</Aviso>
          )}

          <ol className="flex flex-col gap-2.5 text-sm text-[var(--ads-ink-2)]">
            {[
              <>Abre Claude y empieza un chat nuevo.</>,
              <><span className="hidden sm:inline">Pega con <kbd className="rounded border border-[var(--ads-hairline-2)] bg-[var(--ads-surface-2)] px-1 text-xs">⌘ V</kbd> o <kbd className="rounded border border-[var(--ads-hairline-2)] bg-[var(--ads-surface-2)] px-1 text-xs">Ctrl V</kbd></span><span className="sm:hidden">Mantén presionado el campo de texto y elige <strong>Pegar</strong></span> y envía.</>,
              <>Claude te devuelve diagnóstico, prioridades y qué hacer esta semana.</>,
            ].map((paso, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ads-accent-tint)] text-xs font-semibold text-[var(--ads-accent)]">{i + 1}</span>
                <span className="pt-0.5">{paso}</span>
              </li>
            ))}
          </ol>

          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href="https://claude.ai/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--ads-accent)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--ads-accent-press)] active:scale-[0.98]"
            >
              <IconExternalLink size={18} /> Abrir Claude
            </a>
            <Boton variante="secundario" onClick={() => texto && void copiar(texto)} icono={copiado === 'si' ? <IconCheck size={18} /> : <IconCopy size={18} />}>
              {copiado === 'si' ? 'Copiado' : 'Copiar'}
            </Boton>
          </div>

          <details open={copiado === 'no'} className="group rounded-xl ring-1 ring-inset ring-[var(--ads-hairline)]">
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-sm font-medium text-[var(--ads-ink-2)]">
              Ver qué se envía
            </summary>
            <div className="border-t border-[var(--ads-hairline)] p-3">
              <textarea
                readOnly
                value={texto ?? ''}
                onFocus={e => e.currentTarget.select()}
                className="h-56 w-full resize-none rounded-lg bg-[var(--ads-surface-2)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ads-ink-2)] outline-none"
              />
              <button onClick={descargar} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ads-accent)] hover:underline">
                <IconDownload size={16} /> Descargar como archivo .md
              </button>
            </div>
          </details>

          <p className="text-xs leading-relaxed text-[var(--ads-ink-3)]">
            Se copian las reglas de la app, su veredicto y los números — nada de claves ni datos de acceso.
          </p>
        </div>
      </Hoja>
    </>
  )
}
