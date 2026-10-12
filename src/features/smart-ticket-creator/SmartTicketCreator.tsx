import { useCallback, useEffect, useState } from 'react'
import { Ticket as TicketIcon, Sparkles, Copy, Check, RotateCcw, X, Loader2 } from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { ModelStatus } from './components/ModelStatus'
import { TicketEditor } from './components/TicketEditor'
import { useTicketCreator } from './useTicketCreator'
import { ticketToJson, ticketToMarkdown } from './formatTicket'
import { EXAMPLE_COMPLAINTS } from './examples'
import type { Ticket } from './types'

type CopyKind = 'ticket' | 'json'

export function SmartTicketCreator() {
  const {
    status,
    support,
    device,
    progress,
    streamedText,
    tokensPerSecond,
    ticket,
    error,
    generate,
    interrupt,
    reset,
  } = useTicketCreator()

  const [complaint, setComplaint] = useState('')
  const [draft, setDraft] = useState<Ticket | null>(null)
  const [copied, setCopied] = useState<CopyKind | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  // Keep an editable local copy of the ticket once the model finishes.
  useEffect(() => {
    if (ticket) setDraft(ticket)
  }, [ticket])

  const busy = status === 'loading-model' || status === 'generating'

  const handleGenerate = useCallback(() => {
    if (!complaint.trim() || busy) return
    setDraft(null)
    setCopyError(null)
    generate(complaint)
  }, [busy, complaint, generate])

  const handleReset = useCallback(() => {
    setComplaint('')
    setDraft(null)
    setCopyError(null)
    reset()
  }, [reset])

  const loadExample = useCallback(
    (text: string) => {
      if (busy) return
      setComplaint(text)
      setDraft(null)
      setCopyError(null)
      reset()
    },
    [busy, reset],
  )

  const copy = useCallback(
    async (kind: CopyKind) => {
      if (!draft) return
      const text = kind === 'json' ? ticketToJson(draft) : ticketToMarkdown(draft)
      try {
        await navigator.clipboard.writeText(text)
        setCopied(kind)
        setTimeout(() => setCopied(null), 2000)
      } catch {
        setCopyError('Could not copy to clipboard. Your browser may have blocked it.')
      }
    },
    [draft],
  )

  return (
    <FeaturePanel
      icon={TicketIcon}
      title="Smart Ticket Creator"
      description="Turn a messy, unstructured complaint into a clear, structured issue ticket — fully on-device."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge>Qwen2.5-0.5B-Instruct</Badge>
          <Badge>Transformers.js v4</Badge>
          <Badge>WebGPU</Badge>
          <Badge>100% on-device</Badge>
        </div>

        {/* Complaint input */}
        <div className="space-y-1.5">
          <label htmlFor="tc-complaint" className="block text-sm font-medium text-gray-300">
            Describe your issue
          </label>
          <p className="text-xs text-gray-500">
            Write naturally, in your own words — don&apos;t worry about structure,
            spelling, or sounding technical. The model will reorganize it into a
            ticket for you to review.
          </p>
          <textarea
            id="tc-complaint"
            rows={5}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            disabled={busy}
            placeholder="e.g. So I clicked save a bunch of times and nothing happened, then the page froze…"
            className={cn(
              'w-full resize-y rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600',
              'focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60 disabled:opacity-60',
            )}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-gray-500">Try an example:</span>
            {EXAMPLE_COMPLAINTS.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => loadExample(ex.text)}
                disabled={busy}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!complaint.trim() || busy}
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
                ? 'Generating…'
                : 'Generate Ticket'}
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

          {(complaint || draft) && !busy && (
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
        {status === 'generating' && streamedText && (
          <div className="space-y-1.5">
            <p className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <span>Model output (streaming)</span>
              {tokensPerSecond != null && (
                <span className="font-normal tabular-nums text-gray-500">
                  {tokensPerSecond.toFixed(1)} tok/s
                </span>
              )}
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-3 text-xs text-gray-300">
              {streamedText}
            </pre>
          </div>
        )}

        {/* Inference error */}
        {status === 'error' && error && (
          <div className="space-y-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
            <p className="font-medium">Generation failed</p>
            <p className="text-rose-300/90">{error}</p>
            <p className="text-xs text-rose-300/70">
              This can happen if the browser lacks WebGPU and has insufficient memory
              for the CPU fallback, or if the small model did not return valid JSON.
              Try again, rephrase the complaint, or use a Chromium-based desktop
              browser with WebGPU enabled.
            </p>
          </div>
        )}

        {copyError && (
          <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {copyError}
          </p>
        )}

        {/* Editable ticket */}
        {draft && (
          <div className="space-y-4 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Draft ticket</h3>
                <p className="text-xs text-gray-500">
                  Generated locally. Treat as a draft and review every field before filing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => copy('ticket')}
                  className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
                >
                  {copied === 'ticket' ? (
                    <Check className="size-4 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                  {copied === 'ticket' ? 'Copied' : 'Copy Ticket'}
                </button>
                <button
                  type="button"
                  onClick={() => copy('json')}
                  className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
                >
                  {copied === 'json' ? (
                    <Check className="size-4 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                  {copied === 'json' ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
            </div>

            <TicketEditor ticket={draft} onChange={setDraft} />
          </div>
        )}
      </div>
    </FeaturePanel>
  )
}

export default SmartTicketCreator
