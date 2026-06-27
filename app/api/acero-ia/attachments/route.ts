import { createAdminClient, createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
  'application/json', 'application/xml',
]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máx 10MB)' }, { status: 400 })
  }

  const isAllowed = ALLOWED_TYPES.includes(file.type) || file.type.startsWith('image/')
  if (!isAllowed) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 })
  }

  const fileId = crypto.randomUUID()
  const ext = file.name.split('.').pop() || 'bin'
  const storagePath = `${user.id}/attachments/${fileId}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const admin = createAdminClient()

  const { error: uploadError } = await admin.storage
    .from('acero-ia-images')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  let extractedText: string | null = null

  if (file.type === 'application/pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfModule = require('pdf-parse')
      const parser = new pdfModule.PDFParse({ data: new Uint8Array(buffer) })
      await (parser as { load: () => Promise<void> }).load()
      const textResult = await parser.getText()
      extractedText = String(textResult.text || textResult).slice(0, 50000)
    } catch {
      extractedText = '[Error extrayendo texto del PDF]'
    }
  } else if (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml') {
    extractedText = buffer.toString('utf-8').slice(0, 50000)
  }

  return NextResponse.json({
    fileId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    storagePath,
    extractedText,
    isImage: file.type.startsWith('image/'),
  })
}
