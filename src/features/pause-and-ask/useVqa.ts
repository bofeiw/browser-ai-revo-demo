/**
 * React hook that orchestrates the inference worker for Pause & Ask.
 *
 * It keeps all worker/message plumbing out of the view and exposes a small,
 * declarative surface: model status, download progress, the live streamed
 * answer, the finished answer, plus `ask`, `interrupt` and `reset` actions.
 * It also exposes a `caption` action used by the optional live-description loop.
 *
 * The worker (and therefore the model) is created lazily on the first use and
 * reused for every subsequent question. Only one generation runs at a time; the
 * hook tracks the active requestId so stale responses are ignored.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  InferenceDevice,
  InferenceKind,
  ModelFileProgress,
  WorkerResponse,
} from './types'

export type VqaStatus =
  | 'idle' // nothing happening
  | 'loading-model' // downloading / initializing weights
  | 'generating' // running inference
  | 'done' // an answer is ready
  | 'error' // something failed

export interface WebGpuSupport {
  checked: boolean
  webgpu: boolean
  fp16: boolean
}

export interface UseVqa {
  status: VqaStatus
  support: WebGpuSupport
  device: InferenceDevice | null
  progress: ModelFileProgress[]
  /** What the active generation is for (null when idle). */
  activeKind: InferenceKind | null
  /** Streamed partial answer for the active VQA question. */
  streamedText: string
  /** The finished VQA answer, once generation completes. */
  answer: string | null
  error: string | null
  /** Ask a question about a captured frame (data URL). Ignored if busy. */
  ask: (image: string, question: string) => void
  /**
   * Request a short caption for a frame. Resolves with the caption text, or
   * null if the request could not run (e.g. busy / interrupted). Used by the
   * live-description loop, which awaits each result before scheduling the next.
   */
  caption: (image: string) => Promise<string | null>
  /** Stop an in-flight generation. */
  interrupt: () => void
  /** Clear the current answer/output (keeps the model loaded). */
  reset: () => void
}

const CAPTION_PROMPT =
  'In one short sentence, describe the main thing visible in this image.'

export function useVqa(): UseVqa {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const activeRequestRef = useRef<number | null>(null)
  const bufferRef = useRef('')
  // Pending caption promise resolver, keyed by the request it belongs to.
  const captionWaiterRef = useRef<{
    id: number
    resolve: (text: string | null) => void
  } | null>(null)

  const [status, setStatus] = useState<VqaStatus>('idle')
  const [support, setSupport] = useState<WebGpuSupport>({
    checked: false,
    webgpu: false,
    fp16: false,
  })
  const [device, setDevice] = useState<InferenceDevice | null>(null)
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const [activeKind, setActiveKind] = useState<InferenceKind | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data

      // Resolve a pending caption request regardless of staleness bookkeeping.
      const settleCaption = (text: string | null) => {
        const waiter = captionWaiterRef.current
        if (waiter) {
          captionWaiterRef.current = null
          waiter.resolve(text)
        }
      }

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
          // Only reflect VQA generations in the visible status; captions run
          // quietly in the background.
          if (msg.kind === 'vqa') setStatus('generating')
          setActiveKind(msg.kind)
          break
        case 'token':
          if (msg.requestId !== activeRequestRef.current) break
          if (msg.kind === 'vqa') {
            bufferRef.current += msg.text
            setStreamedText(bufferRef.current)
          }
          break
        case 'complete':
          if (msg.requestId !== activeRequestRef.current) break
          activeRequestRef.current = null
          setActiveKind(null)
          if (msg.kind === 'vqa') {
            setAnswer(msg.text)
            setStreamedText(msg.text)
            setStatus('done')
          } else {
            settleCaption(msg.text)
          }
          break
        case 'error':
          // A busy-rejection carries a requestId that was never made active.
          if (msg.kind === 'caption') {
            settleCaption(null)
            break
          }
          if (msg.requestId !== null && msg.requestId !== activeRequestRef.current) {
            // Stale / rejected VQA request — surface only if nothing active.
            if (activeRequestRef.current === null) {
              setError(msg.message)
              setStatus('error')
            }
            break
          }
          activeRequestRef.current = null
          setActiveKind(null)
          setError(msg.message)
          setStatus('error')
          break
      }
    })

    workerRef.current = worker
    return worker
  }, [])

  // Probe WebGPU once on mount (cheap, no model download).
  useEffect(() => {
    const worker = ensureWorker()
    worker.postMessage({ type: 'check' })
  }, [ensureWorker])

  // Tear down the worker on unmount (releases GPU/model memory).
  useEffect(() => {
    return () => {
      // Reject any outstanding caption waiter so awaiting loops can exit.
      captionWaiterRef.current?.resolve(null)
      captionWaiterRef.current = null
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const ask = useCallback(
    (image: string, question: string) => {
      if (activeRequestRef.current !== null) return // prevent overlap
      const worker = ensureWorker()
      const requestId = ++requestIdRef.current
      activeRequestRef.current = requestId
      bufferRef.current = ''
      setStreamedText('')
      setAnswer(null)
      setError(null)
      setProgress([])
      setStatus('loading-model') // flips to generating when the worker replies
      worker.postMessage({
        type: 'generate',
        requestId,
        kind: 'vqa',
        image,
        prompt: question,
      })
    },
    [ensureWorker],
  )

  const caption = useCallback(
    (image: string): Promise<string | null> => {
      // Never run a caption while a VQA (or another caption) is active.
      if (activeRequestRef.current !== null || captionWaiterRef.current) {
        return Promise.resolve(null)
      }
      const worker = ensureWorker()
      const requestId = ++requestIdRef.current
      activeRequestRef.current = requestId
      return new Promise<string | null>((resolve) => {
        captionWaiterRef.current = {
          id: requestId,
          resolve: (text) => {
            if (activeRequestRef.current === requestId) activeRequestRef.current = null
            resolve(text)
          },
        }
        worker.postMessage({
          type: 'generate',
          requestId,
          kind: 'caption',
          image,
          prompt: CAPTION_PROMPT,
        })
      })
    },
    [ensureWorker],
  )

  const interrupt = useCallback(() => {
    workerRef.current?.postMessage({ type: 'interrupt' })
  }, [])

  const reset = useCallback(() => {
    bufferRef.current = ''
    setStreamedText('')
    setAnswer(null)
    setError(null)
    if (activeRequestRef.current === null) setStatus('idle')
  }, [])

  return {
    status,
    support,
    device,
    progress,
    activeKind,
    streamedText,
    answer,
    error,
    ask,
    caption,
    interrupt,
    reset,
  }
}
