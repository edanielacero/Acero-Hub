'use client'

import { useState, useCallback, memo, lazy, Suspense } from 'react'
import 'highlight.js/styles/atom-one-dark.css'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-[11px] rounded cursor-pointer transition-colors duration-200"
      style={{
        backgroundColor: copied ? 'var(--aia-success)' : 'var(--aia-bg-hover)',
        color: copied ? '#fff' : 'var(--aia-text-secondary)',
      }}
    >
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

function HtmlPreview({ code }: { code: string }) {
  const [show, setShow] = useState(false)

  return (
    <div className="mt-2">
      <button
        onClick={() => setShow(!show)}
        className="text-[11px] px-2 py-1 rounded cursor-pointer transition-colors duration-200"
        style={{
          backgroundColor: 'var(--aia-bg-hover)',
          color: 'var(--aia-text-secondary)',
        }}
      >
        {show ? 'Ocultar preview' : 'Preview'}
      </button>
      {show && (
        <iframe
          srcDoc={code}
          sandbox="allow-scripts"
          className="w-full mt-2 rounded-lg border"
          style={{
            height: '300px',
            borderColor: 'var(--aia-border)',
            backgroundColor: '#fff',
          }}
        />
      )}
    </div>
  )
}

const MarkdownInner = lazy(() =>
  Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
    import('rehype-highlight'),
  ]).then(([ReactMarkdown, remarkGfm, rehypeHighlight]) => {
    const Md = ReactMarkdown.default
    const gfm = remarkGfm.default
    const highlight = rehypeHighlight.default

    function Inner({ content }: { content: string }) {
      return (
        <Md
          remarkPlugins={[gfm]}
          rehypePlugins={[highlight]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              const isBlock = match || (typeof children === 'string' && children.includes('\n'))
              const codeText = String(children).replace(/\n$/, '')

              if (!isBlock) {
                return (
                  <code
                    className="px-1.5 py-0.5 rounded text-[13px]"
                    style={{
                      backgroundColor: 'var(--aia-bg-hover)',
                      color: 'var(--aia-amber)',
                      fontFamily: 'var(--font-aia-mono)',
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                )
              }

              const language = match?.[1] || ''
              const isHtml = language === 'html'

              return (
                <div className="relative my-3">
                  {language && (
                    <div
                      className="text-[11px] px-3 py-1 rounded-t-lg"
                      style={{
                        backgroundColor: 'var(--aia-bg-hover)',
                        color: 'var(--aia-text-muted)',
                        fontFamily: 'var(--font-aia-mono)',
                      }}
                    >
                      {language}
                    </div>
                  )}
                  <div className="relative">
                    <CopyButton text={codeText} />
                    <pre
                      className={`p-4 overflow-x-auto text-[13px] leading-relaxed ${language ? 'rounded-b-lg' : 'rounded-lg'}`}
                      style={{
                        backgroundColor: '#0d0e11',
                        fontFamily: 'var(--font-aia-mono)',
                      }}
                    >
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  </div>
                  {isHtml && <HtmlPreview code={codeText} />}
                </div>
              )
            },
            table({ children }) {
              return (
                <div className="overflow-x-auto my-3">
                  <table className="w-full text-[13px] border-collapse" style={{ borderColor: 'var(--aia-border)' }}>
                    {children}
                  </table>
                </div>
              )
            },
            th({ children }) {
              return (
                <th className="px-3 py-2 text-left text-[12px] font-medium border-b" style={{ borderColor: 'var(--aia-border)', color: 'var(--aia-text-secondary)', backgroundColor: 'var(--aia-bg-surface)' }}>
                  {children}
                </th>
              )
            },
            td({ children }) {
              return (
                <td className="px-3 py-2 border-b" style={{ borderColor: 'var(--aia-border)' }}>
                  {children}
                </td>
              )
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="underline transition-colors duration-200" style={{ color: 'var(--aia-cyan)' }}>
                  {children}
                </a>
              )
            },
            blockquote({ children }) {
              return (
                <blockquote className="pl-4 my-3 border-l-2 italic" style={{ borderColor: 'var(--aia-border-active)', color: 'var(--aia-text-secondary)' }}>
                  {children}
                </blockquote>
              )
            },
          }}
        >
          {content}
        </Md>
      )
    }

    return { default: Inner }
  })
)

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="aia-markdown">
      <Suspense fallback={<div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>}>
        <MarkdownInner content={content} />
      </Suspense>
      <style>{`
        .aia-markdown p { margin: 0.5em 0; line-height: 1.65; }
        .aia-markdown h1 { font-size: 1.4em; font-weight: 600; margin: 1em 0 0.5em; font-family: var(--font-aia-heading); }
        .aia-markdown h2 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.4em; font-family: var(--font-aia-heading); }
        .aia-markdown h3 { font-size: 1.05em; font-weight: 600; margin: 0.6em 0 0.3em; font-family: var(--font-aia-heading); }
        .aia-markdown ul, .aia-markdown ol { padding-left: 1.5em; margin: 0.5em 0; }
        .aia-markdown li { margin: 0.2em 0; }
        .aia-markdown ul li { list-style-type: disc; }
        .aia-markdown ol li { list-style-type: decimal; }
        .aia-markdown hr { border: none; border-top: 1px solid var(--aia-border); margin: 1em 0; }
        .aia-markdown strong { font-weight: 600; }
        .hljs { background: transparent !important; }
      `}</style>
    </div>
  )
}

export default memo(MarkdownRenderer)
