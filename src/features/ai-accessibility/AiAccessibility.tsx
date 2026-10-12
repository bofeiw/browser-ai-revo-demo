import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Accessibility, Sparkles, RotateCcw, X, Loader2, Info } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { Dropzone } from './components/Dropzone'
import { ModelStatus } from './components/ModelStatus'
import { AltTextResult } from './components/AltTextResult'
import { useAltText, prepareImage, releaseImage } from './useAltText'
import { cleanCaption, applyContext } from './altText'
import type { CaptionDetail } from './types'

/** Detail levels shown as a segmented control, mapped to Florence-2 tasks. */
const DETAIL_OPTIONS: { value: CaptionDetail; label: string; hint: string }[] = [
  { value: 'concise', label: 'Concise', hint: 'A short, one-line description' },
  { value: 'detailed', label: 'Detailed', hint: 'A fuller sentence or two' },
  { value: 'rich', label: 'Rich', hint: 'The most descriptive output' },
]

export function AiAccessibility() {
  const { status, support, device, progress, result, error, generate, reset, resetImage } =
    useAltText()

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [context, setContext] = useState('')
  const [detail, setDetail] = useState<CaptionDetail>('detailed')
  const [altText, setAltText] = useState('')
  // Remember the context that was applied so toggling it is predictable.
  const lastResultRef = useRef<string | null>(null)

  // When the model returns a caption, clean it and (transparently) fold in the
  // optional context, then seed the editable field.
  useEffect(() => {
    if (!result) return
    const cleaned = cleanCaption(result.caption)
    const withContext = applyContext(cleaned, context)
    lastResultRef.current = withContext
    setAltText(withContext)
    // We intentionally depend only on `result`: regenerating produces a new
    // result object, which is the moment we want to reseed the textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

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
      setAltText('')
      lastResultRef.current = null
      try {
        const prepared = await prepareImage(file)
        releaseImage(imageUrlRef.current)
        setImageUrl(prepared.url)
        // New image: tell the worker to drop any cached vision inputs.
        resetImage()
      } catch (err) {
        setImageError(err instanceof Error ? err.message : 'Could not load that image.')
      }
    },
    [reset, resetImage],
  )

  const handleGenerate = useCallback(() => {
    if (!imageUrl) return
    setAltText('')
    generate(imageUrl, detail)
  }, [generate, imageUrl, detail])

  const handleReset = useCallback(() => {
    releaseImage(imageUrlRef.current)
    setImageUrl(null)
    setContext('')
    setDetail('detailed')
    setAltText('')
    setImageError(null)
    lastResultRef.current = null
    resetImage()
    reset()
  }, [reset, resetImage])

  const busy = status === 'loading-model' || status === 'generating'
  const hasResult = status === 'done' && lastResultRef.current !== null

  const buttonLabel = useMemo(() => {
    if (status === 'loading-model') return 'Loading model…'
    if (status === 'generating') return 'Generating…'
    return hasResult ? 'Regenerate' : 'Generate Alt Text'
  }, [status, hasResult])

  return (
    <FeaturePanel
      icon={Accessibility}
      title="AI Accessibility — Alt Text Generator"
      description="Upload an image and generate suggested alt text — fully on-device."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge>Florence-2-base</Badge>
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
                alt="Uploaded image to describe"
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

        {/* Detail level */}
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-gray-300">Description detail</span>
          <div className="flex flex-wrap gap-2">
            {DETAIL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDetail(opt.value)}
                disabled={busy}
                aria-pressed={detail === opt.value}
                title={opt.hint}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                  detail === opt.value
                    ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200'
                    : 'border-white/10 bg-transparent text-gray-400 hover:text-gray-200',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Optional context */}
        <div className="space-y-1.5">
          <label htmlFor="alt-context" className="block text-sm font-medium text-gray-300">
            Image context <span className="text-gray-500">(optional)</span>
          </label>
          <input
            id="alt-context"
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            disabled={busy}
            placeholder='e.g. "Hero image on the pricing page"'
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60 disabled:opacity-60"
          />
          <p className="text-xs text-gray-500">
            The model describes only what it sees in the pixels. Context you add here is
            folded into the suggestion afterwards (as a purpose hint) — it does not change
            what the model detects. Edit the result to phrase it for its real purpose.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
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
            {buttonLabel}
          </button>

          {(imageUrl || altText) && !busy && (
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

        {/* Inference error */}
        {status === 'error' && error && (
          <div className="space-y-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
            <p className="font-medium">Generation failed</p>
            <p className="text-rose-300/90">{error}</p>
            <p className="text-xs text-rose-300/70">
              This can happen if the browser lacks WebGPU and has insufficient memory for
              the CPU fallback. Try a Chromium-based desktop browser with WebGPU enabled.
            </p>
          </div>
        )}

        {/* Editable result */}
        {hasResult && (
          <div className="space-y-4 border-t border-white/10 pt-6">
            <AltTextResult value={altText} onChange={setAltText} />

            <div className="flex items-start gap-2 rounded-md border border-sky-400/20 bg-sky-500/5 px-3 py-2.5 text-xs text-sky-200/90">
              <Info className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden="true" />
              <p>
                AI-generated alt text is a starting point, not a finished answer. A model
                describes pixels; it does not know an image&apos;s purpose on your page, and it
                can miss, misread, or invent details. Always review and edit before publishing —
                good alt text depends on <em>why</em> the image is used, which only you know.
              </p>
            </div>
          </div>
        )}
      </div>
    </FeaturePanel>
  )
}

export default AiAccessibility
