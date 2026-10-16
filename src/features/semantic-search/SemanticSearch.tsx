import { useCallback, useRef, useState } from 'react'
import {
  Search as SearchIcon,
  Sparkles,
  Type,
  Database,
  RotateCcw,
  AlertTriangle,
  Loader2,
  FileText,
} from 'lucide-react'
import { FeaturePanel } from '../../components/ui/FeaturePanel'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { ModelStatus } from './components/ModelStatus'
import { DocumentList } from './components/DocumentList'
import { SearchResults } from './components/SearchResults'
import { useSemanticSearch } from './useSemanticSearch'
import type { SearchMode } from './types'

const EXAMPLE_QUERIES = [
  'My edits disappear after I leave the page',
  'The app feels really slow lately',
  "I can't get into my account",
  'I never got my receipt by email',
]

const MODES: { key: SearchMode; label: string; icon: typeof Sparkles }[] = [
  { key: 'semantic', label: 'Semantic Search', icon: Sparkles },
  { key: 'keyword', label: 'Keyword Search', icon: Type },
]

export function SemanticSearch() {
  const {
    status,
    support,
    device,
    progress,
    indexProgress,
    error,
    docs,
    indexMap,
    indexedCount,
    indexUpToDate,
    hasIndex,
    mode,
    setMode,
    lastQuery,
    results,
    index,
    search,
    clearResults,
    addDoc,
    updateDoc,
    removeDoc,
    resetDocs,
  } = useSemanticSearch()

  const [query, setQuery] = useState('')
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([])

  const busy = status === 'loading-model' || status === 'indexing' || status === 'searching'
  const indexing = status === 'loading-model' || status === 'indexing'

  const runSearch = useCallback(() => {
    search(query)
  }, [query, search])

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      runSearch()
    },
    [runSearch],
  )

  const loadExample = useCallback(
    (q: string) => {
      setQuery(q)
      search(q)
    },
    [search],
  )

  // Roving-focus arrow-key navigation for the mode radiogroup.
  const onModeKeyDown = useCallback(
    (e: React.KeyboardEvent, i: number) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const next = (i + dir + MODES.length) % MODES.length
      setMode(MODES[next].key)
      modeRefs.current[next]?.focus()
    },
    [setMode],
  )

  const needsIndex = !hasIndex
  const staleForSearch = mode === 'semantic' && lastQuery !== '' && !indexUpToDate

  // A single, human-readable line describing what's happening right now. Used
  // for the screen-reader live region so progress/completion is announced.
  const liveMessage = indexing
    ? indexProgress
      ? `Embedding documents, ${indexProgress.done} of ${indexProgress.total} done.`
      : 'Loading the embedding model.'
    : status === 'searching'
      ? 'Searching.'
      : status === 'error'
        ? 'Search failed.'
        : lastQuery
          ? `${results.length} result${results.length === 1 ? '' : 's'} for ${lastQuery}.`
          : ''

  return (
    <FeaturePanel
      icon={SearchIcon}
      title="Semantic Search"
      description="Search a collection of support tickets by meaning — embeddings, indexing, and ranking all run locally in your browser."
    >
      <section aria-label="Semantic search" className="space-y-5">
        {/* Screen-reader-only live status. Keeps SR users in sync with the
            spinner/progress bar without any visual change. */}
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>

        <div className="technical-details flex flex-wrap gap-2">
          <Badge>all-MiniLM-L6-v2</Badge>
          <Badge>Transformers.js v4</Badge>
          <Badge>384-dim embeddings</Badge>
          <Badge>Cosine similarity</Badge>
          <Badge>100% on-device</Badge>
        </div>

        {/* Mode toggle */}
        <div
          role="radiogroup"
          aria-label="Search mode"
          className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1"
        >
          {MODES.map(({ key, label, icon: Icon }, i) => (
            <button
              key={key}
              ref={(el) => {
                modeRefs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={mode === key}
              tabIndex={mode === key ? 0 : -1}
              onClick={() => setMode(key)}
              onKeyDown={(e) => onModeKeyDown(e, i)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                mode === key ? 'bg-indigo-500 text-white' : 'text-gray-300 hover:bg-white/5',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {/* Search box */}
        <form onSubmit={onSubmit} className="space-y-1.5">
          <label htmlFor="ss-query" className="block text-sm font-medium text-gray-300">
            Search by meaning
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500"
                aria-hidden="true"
              />
              <input
                id="ss-query"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. My edits disappear after I leave the page"
                aria-describedby="ss-mode-hint"
                className="w-full rounded-md border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-400/60 focus:outline-none focus:ring-1 focus:ring-indigo-400/60"
              />
            </div>
            <button
              type="submit"
              disabled={!query.trim() || status === 'searching'}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
            >
              {status === 'searching' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SearchIcon className="size-4" aria-hidden="true" />
              )}
              Search
            </button>
          </div>
          <p id="ss-mode-hint" className="text-xs text-gray-500">
            {mode === 'semantic'
              ? 'Semantic mode embeds your query locally and ranks by cosine similarity — it can match different wording for the same meaning.'
              : 'Keyword mode is a deterministic, non-AI text matcher — it only finds documents containing your literal words (with light stemming).'}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-gray-500">Try:</span>
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => loadExample(q)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {q}
              </button>
            ))}
          </div>
        </form>

        {/* Model status / download + indexing progress (only while relevant) */}
        {(busy || (support.checked && !hasIndex)) && (
          <ModelStatus
            status={status}
            support={support}
            device={device}
            progress={progress}
            indexProgress={indexProgress}
          />
        )}

        {/* Error */}
        {status === 'error' && error && (
          <div
            role="alert"
            className="space-y-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-sm text-rose-200"
          >
            <p className="font-medium">Something went wrong</p>
            <p className="text-rose-300/90">{error}</p>
            <p className="text-xs text-rose-300/70">
              Embedding runs locally in your browser. This can happen if the model download was
              interrupted or the browser ran out of memory. Try again, or use a modern desktop browser.
            </p>
          </div>
        )}

        {/* Primary workspace: documents + results, side by side and up top so
            query → results is a single glance with no scrolling. */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Documents column */}
          <section aria-labelledby="ss-docs-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="ss-docs-heading"
                className="flex items-center gap-2 text-sm font-semibold text-gray-200"
              >
                <FileText className="size-4 text-indigo-300" aria-hidden="true" />
                Document collection
                <span className="font-normal text-gray-500">({docs.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={index}
                  disabled={busy || indexUpToDate || docs.length === 0}
                  className="inline-flex items-center gap-2 rounded-md border border-indigo-400/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {indexing ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Database className="size-3.5" aria-hidden="true" />
                  )}
                  {indexing ? 'Indexing…' : hasIndex ? 'Reindex' : 'Index documents'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    resetDocs()
                    clearResults()
                  }}
                  disabled={indexing}
                  aria-label="Reset collection to the sample tickets"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>

            {/* Index state line */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>
                {indexedCount} / {docs.length} documents embedded
              </span>
              {hasIndex && !indexUpToDate && !indexing && (
                <span
                  role="status"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 font-medium text-amber-300"
                >
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  Index outdated — reindex to include your changes
                </span>
              )}
              {indexUpToDate && !indexing && (
                <span
                  role="status"
                  className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-300"
                >
                  Index up to date
                </span>
              )}
            </div>

            <DocumentList
              docs={docs}
              index={indexMap}
              disabled={indexing}
              onAdd={addDoc}
              onUpdate={updateDoc}
              onRemove={removeDoc}
            />
          </section>

          {/* Results column */}
          <section aria-labelledby="ss-results-heading" className="space-y-3">
            <h2
              id="ss-results-heading"
              className="flex items-center gap-2 text-sm font-semibold text-gray-200"
            >
              {mode === 'semantic' ? (
                <Sparkles className="size-4 text-indigo-300" aria-hidden="true" />
              ) : (
                <Type className="size-4 text-sky-300" aria-hidden="true" />
              )}
              Results
              {lastQuery && (
                <span className="truncate font-normal text-gray-500">for “{lastQuery}”</span>
              )}
            </h2>

            {staleForSearch && (
              <p
                role="status"
                className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                These semantic results reflect the last indexed state. You’ve changed the collection
                since — reindex for up-to-date matches.
              </p>
            )}

            <SearchResults mode={mode} query={lastQuery} results={results} needsIndex={needsIndex} />
          </section>
        </div>

        {/* Secondary explainer content, tucked into a disclosure so it doesn't
            push the primary task down the page. */}
        <details className="rounded-md border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            How this works &amp; how to read the scores
          </summary>
          <div className="space-y-3 border-t border-white/10 px-3 py-3 text-xs text-gray-500">
            <p>
              Similarity scores are <span className="text-gray-300">relative ranking signals</span> for a
              given query, not calibrated confidence probabilities. A higher score means “more similar
              than the others here,” and absolute values are only meaningful compared within the same
              result list.
            </p>
            <p>
              Everything here is on-device: the embedding model is downloaded once from the Hugging Face
              Hub (then cached by your browser), and your documents and queries are never sent to any
              server. Keyword Search uses no AI at all — it is included so you can compare literal
              matching with meaning-based matching on the same data.
            </p>
          </div>
        </details>
      </section>
    </FeaturePanel>
  )
}

export default SemanticSearch
