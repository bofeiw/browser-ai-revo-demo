/**
 * React hook that orchestrates the inference worker for the Smart Ticket
 * Creator.
 *
 * It keeps all worker/message plumbing out of the view component and exposes a
 * small declarative surface: a status, WebGPU support, download progress, the
 * live streamed text, the validated ticket, the raw model output (for
 * transparency), and `generate` / `interrupt` / `reset` actions.
 *
 * The worker (and therefore the model) is created lazily on the first
 * generation and reused for subsequent ones. The hook tears the worker down on
 * unmount. A fresh worker per feature means visiting this tab never pulls the
 * weights used by the other demos — and vice versa.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  InferenceDevice,
  ModelFileProgress,
  Ticket,
  WorkerResponse,
} from './types'

export type CreatorStatus =
  | 'idle' // nothing happening yet
  | 'loading-model' // downloading / initializing weights
  | 'generating' // running inference
  | 'done' // a ticket is ready
  | 'error' // something failed

export interface WebGpuSupport {
  checked: boolean
  webgpu: boolean
  fp16: boolean
}

export interface UseTicketCreator {
  status: CreatorStatus
  support: WebGpuSupport
  /** Device the active/last run used (null until known). */
  device: InferenceDevice | null
  /** Per-file model download progress (keyed by filename). */
  progress: ModelFileProgress[]
  /** Streamed partial text for the current generation (live preview). */
  streamedText: string
  /** Tokens/second for the current generation, when known. */
  tokensPerSecond: number | null
  /** The validated ticket once generation completes. */
  ticket: Ticket | null
  /** The raw model output behind the current ticket (for transparency). */
  raw: string | null
  error: string | null
  /** Generate a ticket from a raw complaint. */
  generate: (complaint: string) => void
  /** Stop an in-flight generation. */
  interrupt: () => void
  /** Clear the current ticket/output (keeps the model loaded). */
  reset: () => void
}

export function useTicketCreator(): UseTicketCreator {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<CreatorStatus>('idle')
  const [support, setSupport] = useState<WebGpuSupport>({
    checked: false,
    webgpu: false,
    fp16: false,
  })
  const [device, setDevice] = useState<InferenceDevice | null>(null)
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const [streamedText, setStreamedText] = useState('')
  const [tokensPerSecond, setTokensPerSecond] = useState<number | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Accumulates streamed tokens for the current generation.
  const bufferRef = useRef('')

  /** Create the worker on demand and wire up its message handler. */
  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      switch (msg.status) {
        case 'check-result':
          setSupport({ checked: true, webgpu: msg.webgpu, fp16: msg.fp16 })
          break
        case 'loading':
          setStatus('loading-model')
          break
        case 'progress':
          setProgress((prev) => {
            const next = prev.filter((p) => p.file !== msg.file.file)
            next.push(msg.file)
            return next
          })
          break
        case 'ready':
          setDevice(msg.device)
          break
        case 'generating':
          setDevice(msg.device)
          setStatus('generating')
          break
        case 'token':
          bufferRef.current += msg.text
          setStreamedText(bufferRef.current)
          setTokensPerSecond(msg.tokensPerSecond)
          break
        case 'complete':
          setTicket(msg.ticket)
          setRaw(msg.raw)
          setStatus('done')
          break
        case 'error':
          setError(msg.message)
          setStatus('error')
          break
      }
    })

    workerRef.current = worker
    return worker
  }, [])

  // Probe WebGPU availability once on mount (cheap, no model download).
  useEffect(() => {
    const worker = ensureWorker()
    worker.postMessage({ type: 'check' })
  }, [ensureWorker])

  // Tear down the worker on unmount.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const generate = useCallback(
    (complaint: string) => {
      const worker = ensureWorker()
      bufferRef.current = ''
      setStreamedText('')
      setTokensPerSecond(null)
      setTicket(null)
      setRaw(null)
      setError(null)
      setProgress([])
      // Status flips to loading-model or generating based on worker messages.
      setStatus('loading-model')
      worker.postMessage({ type: 'generate', complaint })
    },
    [ensureWorker],
  )

  const interrupt = useCallback(() => {
    workerRef.current?.postMessage({ type: 'interrupt' })
  }, [])

  const reset = useCallback(() => {
    bufferRef.current = ''
    setStreamedText('')
    setTokensPerSecond(null)
    setTicket(null)
    setRaw(null)
    setError(null)
    setStatus('idle')
  }, [])

  return {
    status,
    support,
    device,
    progress,
    streamedText,
    tokensPerSecond,
    ticket,
    raw,
    error,
    generate,
    interrupt,
    reset,
  }
}
