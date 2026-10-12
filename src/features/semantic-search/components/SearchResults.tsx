import { Sparkles, Type } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { SearchMode, SearchResult } from '../types'

interface SearchResultsProps {
  mode: SearchMode
  query: string
  results: SearchResult[]
  /** True when the active mode is semantic but nothing is indexed yet. */
  needsIndex: boolean
}

/** Format a score for display and give it a label appropriate to the mode. */
function formatScore(score: number): string {
  return score.toFixed(3)
}

/**
 * The ranked result list for the active search mode. Each row shows the ticket
 * and its score, with a small bar visualizing relative rank. The score caption
 * is honest about what the number means for each mode.
 */
export function SearchResults({ mode, query, results, needsIndex }: SearchResultsProps) {
  const semantic = mode === 'semantic'

  if (!query) {
    return (
      <p className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
        Enter a query above and run a search to see ranked results.
      </p>
    )
  }

  if (semantic && needsIndex) {
    return (
      <p className="rounded-md border border-amber-400/30 bg-amber-500/10 p-4 text-center text-sm text-amber-200">
        No documents are indexed yet. Click <span className="font-semibold">Index documents</span> to
        generate embeddings, then search again.
      </p>
    )
  }

  if (results.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
        {semantic
          ? 'No results. Try indexing more documents or a different query.'
          : 'No documents contain those keywords. Try different words — or switch to Semantic Search, which can match meaning rather than exact words.'}
      </p>
    )
  }

  const maxScore = Math.max(...results.map((r) => r.score), 0.0001)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {semantic ? (
            <>
              <Sparkles className="size-3.5 text-indigo-300" aria-hidden="true" />
              Semantic results
            </>
          ) : (
            <>
              <Type className="size-3.5 text-sky-300" aria-hidden="true" />
              Keyword results
            </>
          )}
        </p>
        <span className="text-xs text-gray-500">
          {results.length} result{results.length === 1 ? '' : 's'}
        </span>
      </div>

      <ol className="space-y-2">
        {results.map((r, i) => (
          <li
            key={r.doc.id}
            className="rounded-md border border-white/10 bg-white/[0.02] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-xs text-gray-500">#{i + 1}</span>
                  <span className="text-sm font-medium text-gray-100">{r.doc.title}</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                    {r.doc.category}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{r.doc.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    'tabular-nums text-sm font-semibold',
                    semantic ? 'text-indigo-300' : 'text-sky-300',
                  )}
                >
                  {formatScore(r.score)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                  {semantic ? 'cosine' : 'overlap'}
                </div>
              </div>
            </div>
            {/* Relative-rank bar (scaled to the top result in this set).
                Decorative — the numeric score above conveys the same info. */}
            <div
              aria-hidden="true"
              className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  semantic ? 'bg-indigo-400' : 'bg-sky-400',
                )}
                style={{ width: `${Math.max(2, Math.round((r.score / maxScore) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
