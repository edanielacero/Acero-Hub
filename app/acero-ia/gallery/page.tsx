'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface GalleryImage {
  id: string
  prompt: string
  imageUrl: string | null
  size: string
  quality: string
  cost_usd: number
  conversation_id: string | null
  created_at: string
}

const SIZE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: '1024x1024', label: 'Cuadrado' },
  { value: '1792x1024', label: 'Horizontal' },
  { value: '1024x1792', label: 'Vertical' },
]

const QUALITY_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export default function GalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [sizeFilter, setSizeFilter] = useState('')
  const [qualityFilter, setQualityFilter] = useState('')
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const router = useRouter()

  const fetchImages = useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (sizeFilter) params.set('size', sizeFilter)
    if (qualityFilter) params.set('quality', qualityFilter)

    try {
      const res = await fetch(`/api/acero-ia/images?${params}`)
      if (res.ok) {
        const data = await res.json()
        setImages(data.images)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [page, sizeFilter, qualityFilter])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  useEffect(() => {
    setPage(1)
  }, [sizeFilter, qualityFilter])

  const handleDownload = async (img: GalleryImage) => {
    if (!img.imageUrl) return
    const res = await fetch(img.imageUrl)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `acero-ia-${img.id.slice(0, 8)}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/acero-ia')}
            className="p-1 rounded cursor-pointer"
            style={{ color: 'var(--aia-text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h1 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>
            Galería
          </h1>
          <span className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>
            {total} {total === 1 ? 'imagen' : 'imágenes'}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 px-4 py-3 text-[11px]" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--aia-text-muted)' }}>Tamaño:</span>
          <div className="flex gap-1">
            {SIZE_OPTIONS.map(s => (
              <button
                key={s.value}
                onClick={() => setSizeFilter(s.value)}
                className="px-2 py-1 rounded cursor-pointer transition-colors duration-200"
                style={{
                  backgroundColor: sizeFilter === s.value ? 'var(--aia-bg-hover)' : 'transparent',
                  color: sizeFilter === s.value ? 'var(--aia-amber)' : 'var(--aia-text-secondary)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--aia-text-muted)' }}>Calidad:</span>
          <div className="flex gap-1">
            {QUALITY_OPTIONS.map(q => (
              <button
                key={q.value}
                onClick={() => setQualityFilter(q.value)}
                className="px-2 py-1 rounded cursor-pointer transition-colors duration-200"
                style={{
                  backgroundColor: qualityFilter === q.value ? 'var(--aia-bg-hover)' : 'transparent',
                  color: qualityFilter === q.value ? 'var(--aia-amber)' : 'var(--aia-text-secondary)',
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square rounded-xl animate-pulse" style={{ backgroundColor: 'var(--aia-bg-elevated)' }} />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-30">
              <polygon points="12,2 20,8 17,18 7,18 4,8" />
              <line x1="12" y1="2" x2="17" y2="18" />
              <line x1="12" y1="2" x2="7" y2="18" />
              <line x1="4" y1="8" x2="20" y2="8" />
            </svg>
            <p className="text-[14px]" style={{ color: 'var(--aia-text-muted)' }}>
              Aún no has generado imágenes
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map(img => (
                <div
                  key={img.id}
                  className="group relative cursor-pointer rounded-xl overflow-hidden transition-transform duration-200 hover:scale-[1.02]"
                  style={{ backgroundColor: 'var(--aia-bg-elevated)' }}
                  onClick={() => setSelectedImage(img)}
                >
                  {img.imageUrl ? (
                    <img
                      src={img.imageUrl}
                      alt={img.prompt}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: 'var(--aia-bg-hover)' }}>
                      <span className="text-[11px]" style={{ color: 'var(--aia-text-muted)' }}>Sin preview</span>
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3"
                    style={{ background: 'linear-gradient(transparent 40%, rgba(8,9,10,0.85))' }}
                  >
                    <p className="text-[11px] line-clamp-2" style={{ color: 'var(--aia-text-primary)' }}>
                      {img.prompt}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors duration-200"
                  style={{
                    backgroundColor: 'var(--aia-bg-elevated)',
                    color: page <= 1 ? 'var(--aia-text-muted)' : 'var(--aia-text-secondary)',
                    opacity: page <= 1 ? 0.5 : 1,
                  }}
                >
                  Anterior
                </button>
                <span className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors duration-200"
                  style={{
                    backgroundColor: 'var(--aia-bg-elevated)',
                    color: page >= totalPages ? 'var(--aia-text-muted)' : 'var(--aia-text-secondary)',
                    opacity: page >= totalPages ? 0.5 : 1,
                  }}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Image modal */}
      {selectedImage && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
            onClick={() => setSelectedImage(null)}
          />
          <div
            className="fixed inset-4 md:inset-10 z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--aia-bg-surface)' }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--aia-border)' }}>
              <div className="flex items-center gap-3">
                <span className="text-[12px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}>
                  {selectedImage.size === '1024x1024' ? 'Cuadrado' : selectedImage.size === '1792x1024' ? 'Horizontal' : 'Vertical'}
                </span>
                <span className="text-[12px] px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}>
                  {selectedImage.quality}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--aia-text-muted)', fontFamily: 'var(--font-aia-mono)' }}>
                  ${selectedImage.cost_usd.toFixed(4)}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>
                  {new Date(selectedImage.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded cursor-pointer"
                style={{ color: 'var(--aia-text-muted)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
              {selectedImage.imageUrl ? (
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.prompt}
                  className="max-w-full max-h-full rounded-xl object-contain"
                />
              ) : (
                <p style={{ color: 'var(--aia-text-muted)' }}>Imagen no disponible</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--aia-border)' }}>
              <p className="text-[13px] mb-3" style={{ color: 'var(--aia-text-secondary)' }}>
                {selectedImage.prompt}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-colors duration-200"
                  style={{ backgroundColor: 'var(--aia-amber)', color: '#08090a' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Descargar
                </button>
                {selectedImage.conversation_id && (
                  <button
                    onClick={() => {
                      setSelectedImage(null)
                      router.push(`/acero-ia/${selectedImage.conversation_id}`)
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] cursor-pointer transition-colors duration-200"
                    style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-text-secondary)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Ver conversación
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
