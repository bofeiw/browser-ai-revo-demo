import { useCallback, useEffect, useRef, useState } from 'react'
import { Bug, Sparkles, Copy, Check, RotateCcw, X, Loader2 } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { Dropzone } from './components/Dropzone'
import { ModelStatus } from './components/ModelStatus'
import { ReportEditor } from './components/ReportEditor'
import { useBugReporter, prepareImage, releaseImage } from './useBugReporter'
import { reportToMarkdown } from './formatReport'
import type { AnalysisStepKey, BugReport } from './types'

const STEP_LABELS: Record<AnalysisStepKey, string> = {
  description: 'Describing the screenshot',
  errors: 'Looking for error messages',
  elements: 'Identifying UI elements',
}

export function ScreenshotBugReporter() {
  const {
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
  } = useBugReporter()

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [userContext, setUserContext] = useState('')
  const [draft, setDraft] = useState<BugReport | null>(null)
  const [copied, setCopied] = useState(false)

  // Keep an editable local copy of the report once the model finishes.
  useEffect(() => {
    if (report) setDraft(report)
  }, [report])

  // Revoke the current object URL whenever it changes or on unmount.
  const imageUrlRef = useRef<string | null>(null)
  useEffect(() => {
    imageUrlRef.current = imageUrl
  }, [imageUrl])
  useEffect(() => {
    return () => releaseImage(imageUrlRef.current)
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setImageError(null)
      reset()
      setDraft(null)
      try {
        const prepared = await prepareImage(file)
        // Release the previous image before swapping in the new one.
        releaseImage(imageUrlRef.current)
        setImageUrl(prepared.url)
      } catch (err) {
        setImageError(err instanceof Error ? err.message : 'Could not load that image.')
      }
    },
    [reset],
  )

  const handleAnalyze = useCallback(() => {
    if (!imageUrl) return
    setDraft(null)
    analyze(imageUrl, userContext)
  }, [analyze, imageUrl, userContext])

  const handleReset = useCallback(() => {
    releaseImage(imageUrlRef.current)
    setImageUrl(null)
    setUserContext('')
    setDraft(null)
    setImageError(null)
    reset()
  }, [reset])

  const handleCopy = useCallback(async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(reportToMarkdown(draft))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setImageError('Could not copy to clipboard. Your browser may have blocked it.')
    }
  }, [draft])

  const busy = status === 'loading-model' || status === 'generating'

  return (
    <FeaturePanel
      icon={Bug}
      title="Screenshot Bug Reporter"
      description="Upload a screenshot and generate a structured bug report — fully on-device."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge>SmolVLM-2.2B</Badge>
          <Badge>Transformers.js v4</Badge>
          <Badge>WebGPU</Badge>
          <Badge>100% on-device</Badge>
        </div>

        {/* Upload / preview */}
        {!imageUrl ? (
          <Dropzone onFile={handleFile} disabled={busy} />
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30">
              <img
                src={imageUrl}
                alt="Uploaded screenshot to analyze"
                className="mx-auto max-h-80 w-auto object-contain"
              />
              {!busy && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/60 px-2 py-1 text-xs text-gray-200 backdrop-blur transition-colors hover:bg-black/80"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
          </div>
        )}

        {imageError && (
          <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {imageError}
          </p>
        )}

        {/* Optional context */}
        <div className="space-y-1.5">
          <label htmlFor="br-context" className="block text-sm font-medium text-gray-300">
            Additional context <span className="text-gray-500">(optional)</span>
          </label>
          <input
            id="br-context"
            type="text"
            value={userContext}
            onChange={(e) => setUserContext(e.target.value)}
            disabled={busy}
            placeholder='e.g. "The Save button doesn&apos;t do anything when clicked"'
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60 disabled:opacity-60"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!imageUrl || busy}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
              'bg-indigo-500 text-white hover:bg-indigo-400',
              'disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500',
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {status === 'loading-model'
              ? 'Loading model…'
              : status === 'generating'
                ? 'Analyzing…'
                : 'Analyze Screenshot'}
          </button>

          {busy && (
            <button
              type="button"
              onClick={interrupt}
              className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
            >
              <X className="size-4" aria-hidden="true" />
              Stop
            </button>
          )}

          {(imageUrl || draft) && !busy && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset
            </button>
          )}
        </div>

        {/* Model status / download progress */}
        {(busy || support.checked) && (
          <ModelStatus status={status} support={support} device={device} progress={progress} />
        )}

        {/* Live streamed output while generating */}
        {status === 'generating' && (step || streamedText) && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {step
                ? `Step ${step.index + 1}/${step.total}: ${STEP_LABELS[step.key]}`
                : 'Model output (streaming)'}
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-3 text-xs text-gray-300">
              {streamedText || '…'}
            </pre>
          </div>
        )}

        {/* Inference error */}
        {status === 'error' && error && (
          <div className="space-y-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
            <p className="font-medium">Analysis failed</p>
            <p className="text-rose-300/90">{error}</p>
            <p className="text-xs text-rose-300/70">
              This can happen if the browser lacks WebGPU and has insufficient memory
              for the CPU fallback. Try a Chromium-based desktop browser with WebGPU
              enabled.
            </p>
          </div>
        )}

        {/* Editable report */}
        {draft && (
          <div className="space-y-4 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Draft bug report</h3>
                <p className="text-xs text-gray-500">
                  Generated locally. Treat as a draft and review every field before filing.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy as Markdown'}
              </button>
            </div>

            <ReportEditor report={draft} onChange={setDraft} />
          </div>
        )}
      </div>
    </FeaturePanel>
  )
}

export default ScreenshotBugReporter
