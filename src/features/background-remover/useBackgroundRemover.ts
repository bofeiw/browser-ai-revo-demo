/**
 * React hook that orchestrates the inference worker for the Background Remover.
 *
 * It keeps all worker/message plumbing out of the view component and exposes a
 * small, declarative surface: a status, WebGPU support, download progress, the
 * finished cut-out, and `segment` / `reset` actions.
 *
 * Design points that satisfy the brief:
 *  - The worker (and therefore the model) is created lazily on the first
 *    segmentation and reused for subsequent images.
 *  - A monotonic `requestId` tags every request; results for anything but the
 *    latest request are dropped, so a stale async result can never overwrite a
 *    newer image (e.g. the user swaps images mid-inference).
 *  - Compositing the alpha matte onto the original pixels and PNG encoding
 *    happen here (main thread) via ./compose, and the previous cut-out's object
 *    URL is revoked whenever a new one replaces it — including on unmount — so
 *    repeated uploads don't leak memory.
 *  - The worker is torn down on unmount, which also covers route changes while
 *    the model is loading or an image is processing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { InferenceDevice, ModelFileProgress, WorkerResponse } from './types'
import { composeCutout, releaseCutout, type Cutout } from './compose'
import { prepareImage, releaseImage } from './image'

export type RemoverStatus =
  | 'idle' // nothing happening yet
  | 'loading-model' // downloading / initializing weights
  | 'segmenting' // running inference
  | 'compositing' // applying the matte + encoding the PNG
  | 'done' // a cut-out is ready
  | 'error' // something failed

export interface WebGpuSupport {
  checked: boolean
  webgpu: boolean
}

export interface UseBackgroundRemover {
  status: RemoverStatus
  support: WebGpuSupport
  /** Device the active/last run used (null until known). */
  device: InferenceDevice | null
  /** Per-file model download progress (keyed by filename). */
  progress: ModelFileProgress[]
  /** The finished transparent-PNG cut-out, once ready. */
  cutout: Cutout | null
  error: string | null
  /** Segment the image at `imageUrl` (original dimensions required). */
  segment: (imageUrl: string, width: number, height: number) => void
  /** Clear the current result/output (keeps the model loaded). */
  reset: () => void
}

export function useBackgroundRemover(): UseBackgroundRemover {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<RemoverStatus>('idle')
  const [support, setSupport] = useState<WebGpuSupport>({ checked: false, webgpu: false })
  const [device, setDevice] = useState<InferenceDevice | null>(null)
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const [cutout, setCutout] = useState<Cutout | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Monotonic request id; only results matching the latest id are accepted.
  const requestIdRef = useRef(0)
  // The source image URL for the in-flight request, needed to composite.
  const pendingImageRef = useRef<string | null>(null)
  // Hold the latest cut-out in a ref too so unmount cleanup can revoke it.
  const cutoutRef = useRef<Cutout | null>(null)

  const setCutoutSafe = useCallback((next: Cutout | null) => {
    // Revoke the previous cut-out's object URL before replacing it.
    if (cutoutRef.current && cutoutRef.current !== next) {
      releaseCutout(cutoutRef.current.url)
    }
    cutoutRef.current = next
    setCutout(next)
  }, [])

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
          setSupport({ checked: true, webgpu: msg.webgpu })
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
        case 'segmenting':
          if (msg.requestId !== requestIdRef.current) break
          setDevice(msg.device)
          setStatus('segmenting')
          break
        case 'complete': {
          // Drop stale results: the user may have moved on to a newer image.
          if (msg.requestId !== requestIdRef.current) break
          const imageUrl = pendingImageRef.current
          if (!imageUrl) break
          setStatus('compositing')
          composeCutout(imageUrl, msg.mask)
            .then((result) => {
              // Guard again — compositing is async and the id may have advanced.
              if (msg.requestId !== requestIdRef.current) {
                releaseCutout(result.url)
                return
              }
              setCutoutSafe(result)
              setStatus('done')
            })
            .catch((err: unknown) => {
              if (msg.requestId !== requestIdRef.current) return
              setError(err instanceof Error ? err.message : 'Failed to build the cut-out.')
              setStatus('error')
            })
          break
        }
        case 'error':
          // Ignore errors tagged for a superseded request.
          if (msg.requestId !== null && msg.requestId !== requestIdRef.current) break
          setError(msg.message)
          setStatus('error')
          break
      }
    })

    workerRef.current = worker
    return worker
  }, [setCutoutSafe])

  // Probe WebGPU availability once on mount (cheap, no model download).
  useEffect(() => {
    const worker = ensureWorker()
    worker.postMessage({ type: 'check' })
  }, [ensureWorker])

  // Tear down the worker and release the last cut-out on unmount (covers route
  // changes during loading/processing).
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      releaseCutout(cutoutRef.current?.url)
      cutoutRef.current = null
    }
  }, [])

  const segment = useCallback(
    (imageUrl: string, width: number, height: number) => {
      const worker = ensureWorker()
      const requestId = ++requestIdRef.current
      pendingImageRef.current = imageUrl
      setCutoutSafe(null)
      setError(null)
      setProgress([])
      setStatus('loading-model') // flips to segmenting/compositing via messages
      worker.postMessage({ type: 'segment', requestId, image: imageUrl, width, height })
    },
    [ensureWorker, setCutoutSafe],
  )

  const reset = useCallback(() => {
    // Invalidate any in-flight request so its result is discarded.
    requestIdRef.current++
    pendingImageRef.current = null
    setCutoutSafe(null)
    setError(null)
    setProgress([])
    setStatus('idle')
  }, [setCutoutSafe])

  return { status, support, device, progress, cutout, error, segment, reset }
}

// Re-export the image + export helpers so the view imports from one place.
export { prepareImage, releaseImage }
export { downloadBlob, cutoutFilename } from './compose'
export type { Cutout } from './compose'
