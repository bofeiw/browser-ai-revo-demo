import { useCallback, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { characterCount } from '../altText'

interface AltTextResultProps {
  /** The editable alt text. */
  value: string
  onChange: (value: string) => void
}

const inputBase =
  'w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60'

/**
 * Editable alt-text output: a textarea bound to the suggested text, a live
 * character count, and a copy-to-clipboard button. The user is expected to
 * refine the suggestion before using it, so everything here is editable.
 */
export function AltTextResult({ value, onChange }: AltTextResultProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const count = characterCount(value)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyError(null)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError('Could not copy. Your browser may have blocked clipboard access.')
    }
  }, [value])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="alt-text-output" className="block text-sm font-medium text-gray-300">
          Suggested alt text
        </label>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!value.trim()}
          className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <textarea
        id="alt-text-output"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="The generated alt text will appear here — edit it as needed."
        className={cn(inputBase, 'resize-y')}
      />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span aria-live="polite" className="tabular-nums">
          {count} character{count === 1 ? '' : 's'}
        </span>
        <span className="text-gray-600">Edit freely before using</span>
      </div>

      {copyError && <p className="text-xs text-rose-300">{copyError}</p>}
    </div>
  )
}
