export function createSSEStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController | null = null

  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
  })

  function send(event: string, data: string) {
    controller?.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
  }

  function sendToken(token: string) {
    send('token', JSON.stringify({ token }))
  }

  function sendDone(metadata: {
    messageId: string
    tokensInput: number
    tokensOutput: number
    costUsd: number
    model: string
  }) {
    send('done', JSON.stringify(metadata))
  }

  function sendError(error: string) {
    send('error', JSON.stringify({ error }))
  }

  function close() {
    controller?.close()
  }

  return { stream, send, sendToken, sendDone, sendError, close }
}

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  }
}
