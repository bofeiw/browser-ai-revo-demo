/**
 * React hook that orchestrates the inference worker for the Bug Reporter.
 *
 * It keeps all worker/message plumbing out of the view component and exposes a
 * small, declarative surface: a status, download progress, the live streamed
 * text, the parsed report, and `analyze` / `reset` / `interrupt` actions.
 *
 * The worker (and therefore the model) is created lazily on the first analysis
 * and reused for subsequent ones. The hook also tears the worker down on unmount
 * and revokes any image object URLs it created.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AnalysisStepKey,
  BugReport,
  InferenceDevice,
  ModelFileProgress,
  WorkerResponse,
} from './types'
import { prepareImage, releaseImage } from './image'

export type ReporterStatus =
  | 'idle' // nothing happening yet
  | 'loading-model' // downloading / initializing weights
  | 'generating' // running inference
  | 'done' // a report is ready
  | 'error' // something failed

export interface WebGpuSupport {
  checked: boolean
  webgpu: boolean
  fp16: boolean
}

export interface UseBugReporter {
  status: ReporterStatus
  support: WebGpuSupport
  /** Device the active/last run used (null until known). */
  device: InferenceDevice | null
  /** Per-file model download progress (keyed by filename). */
  progress: ModelFileProgress[]
  /** Streamed partial text for the current step (for a live preview). */
  streamedText: string
  /** Current analysis step and position, while generating. */
  step: { key: AnalysisStepKey; index: number; total: number } | null
  /** The assembled report once generation completes. */
  report: BugReport | null
  error: string | null
  /** Analyze a prepared image URL with optional user context. */
  analyze: (imageUrl: string, userContext: string) => void
  /** Stop an in-flight generation. */
  interrupt: () => void
  /** Clear the current report/output (keeps the model loaded). */
  reset: () => void
}

export function useBugReporter(): UseBugReporter {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<ReporterStatus>('idle')
  const [support, setSupport] = useState<WebGpuSupport>({
    checked: false,
    webgpu: false,
    fp16: false,
  })
  const [device, setDevice] = useState<InferenceDevice | null>(null)
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const [streamedText, setStreamedText] = useState('')
  const [step, setStep] = useState<
    { key: AnalysisStepKey; index: number; total: number } | null
  >(null)
  const [report, setReport] = useState<BugReport | null>(null)
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
        case 'step':
          // Reset the streamed buffer at the start of each focused question.
          bufferRef.current = ''
          setStreamedText('')
          setStep({ key: msg.step, index: msg.index, total: msg.total })
          break
        case 'token':
          bufferRef.current += msg.text
          setStreamedText(bufferRef.current)
          break
        case 'complete': {
          setReport(msg.report)
          setStep(null)
          setStatus('done')
          break
        }
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

  const analyze = useCallback(
    (imageUrl: string, userContext: string) => {
      const worker = ensureWorker()
      bufferRef.current = ''
      setStreamedText('')
      setStep(null)
      setReport(null)
      setError(null)
      setProgress([])
      // Status flips to loading-model or generating based on worker messages.
      setStatus('loading-model')
      worker.postMessage({ type: 'generate', image: imageUrl, userContext })
    },
    [ensureWorker],
  )

  const interrupt = useCallback(() => {
    workerRef.current?.postMessage({ type: 'interrupt' })
  }, [])

  const reset = useCallback(() => {
    bufferRef.current = ''
    setStreamedText('')
    setStep(null)
    setReport(null)
    setError(null)
    setStatus('idle')
  }, [])

  return {
    status,
    support,
    device,
    progress,
    streamedText,
    step,
    report,
    error,
    analyze,
    interrupt,
    reset,
  }
}

// Re-export the image helpers so the view imports preprocessing from one place.
export { prepareImage, releaseImage }
