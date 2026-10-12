/**
 * React hook that orchestrates the inference worker for the alt-text generator.
 *
 * It keeps all worker/message plumbing out of the view component and exposes a
 * small, declarative surface: a status, WebGPU support, download progress, the
 * raw caption the model returned, and `generate` / `reset` / `resetImage`
 * actions.
 *
 * The worker (and therefore the model) is created lazily on the first
 * generation and reused for subsequent images. The hook tears the worker down
 * on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CaptionDetail,
  InferenceDevice,
  ModelFileProgress,
  WorkerResponse,
} from './types'
import { prepareImage, releaseImage } from './image'

export type AltTextStatus =
  | 'idle' // nothing happening yet
  | 'loading-model' // downloading / initializing weights
  | 'generating' // running inference
  | 'done' // a caption is ready
  | 'error' // something failed

export interface WebGpuSupport {
  checked: boolean
  webgpu: boolean
  fp16: boolean
}

/** A caption result paired with the detail level that produced it. */
export interface CaptionResult {
  caption: string
  detail: CaptionDetail
}

export interface UseAltText {
  status: AltTextStatus
  support: WebGpuSupport
  /** Device the active/last run used (null until known). */
  device: InferenceDevice | null
  /** Per-file model download progress (keyed by filename). */
  progress: ModelFileProgress[]
  /** The raw caption from the model once generation completes. */
  result: CaptionResult | null
  error: string | null
  /** Caption a prepared image URL at the chosen detail level. */
  generate: (imageUrl: string, detail: CaptionDetail) => void
  /** Clear the current result/output (keeps the model loaded). */
  reset: () => void
  /** Tell the worker to drop its cached vision inputs (new image uploaded). */
  resetImage: () => void
}

export function useAltText(): UseAltText {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<AltTextStatus>('idle')
  const [support, setSupport] = useState<WebGpuSupport>({
    checked: false,
    webgpu: false,
    fp16: false,
  })
  const [device, setDevice] = useState<InferenceDevice | null>(null)
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const [result, setResult] = useState<CaptionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        case 'complete':
          setResult({ caption: msg.caption, detail: msg.detail })
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
    (imageUrl: string, detail: CaptionDetail) => {
      const worker = ensureWorker()
      setResult(null)
      setError(null)
      setProgress([])
      // Status flips to loading-model or generating based on worker messages.
      setStatus('loading-model')
      worker.postMessage({ type: 'generate', image: imageUrl, detail })
    },
    [ensureWorker],
  )

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setStatus('idle')
  }, [])

  const resetImage = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset-image' })
  }, [])

  return {
    status,
    support,
    device,
    progress,
    result,
    error,
    generate,
    reset,
    resetImage,
  }
}

// Re-export the image helpers so the view imports preprocessing from one place.
export { prepareImage, releaseImage }
