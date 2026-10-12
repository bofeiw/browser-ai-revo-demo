/**
 * React hook that orchestrates the embedding worker and owns the in-memory
 * vector index for Local Semantic Search.
 *
 * Responsibilities:
 *  - manage the document collection (seeded from the sample tickets, plus any
 *    the user adds/edits/removes),
 *  - track whether the index is up to date with the collection,
 *  - run (re)indexing, reusing embeddings for unchanged documents so only new
 *    or edited text is sent to the model,
 *  - embed a query and rank the index by cosine similarity,
 *  - expose everything the view needs declaratively.
 *
 * The worker (and therefore the model) is created lazily and reused. All
 * worker/message plumbing lives here so the view component stays declarative.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SAMPLE_TICKETS } from './sampleTickets'
import { rankBySimilarity } from './similarity'
import { keywordSearch } from './keywordSearch'
import {
  embeddableText,
  hashText,
  type EmbedItem,
  type IndexedDoc,
  type InferenceDevice,
  type ModelFileProgress,
  type SearchMode,
  type SearchResult,
  type TicketDoc,
  type WorkerResponse,
} from './types'

export type SearchStatus =
  | 'idle' // nothing happening
  | 'loading-model' // downloading / initializing weights
  | 'indexing' // embedding documents
  | 'searching' // embedding the query
  | 'error' // something failed

export interface WebGpuSupport {
  checked: boolean
  webgpu: boolean
  fp16: boolean
}

/** How many results each mode returns. */
const TOP_K = 8

export interface UseSemanticSearch {
  status: SearchStatus
  support: WebGpuSupport
  device: InferenceDevice | null
  progress: ModelFileProgress[]
  /** Indexing progress (documents embedded / total this run). */
  indexProgress: { done: number; total: number } | null
  error: string | null

  /** The current document collection. */
  docs: TicketDoc[]
  /** The in-memory vector index, so the UI can show per-document state. */
  indexMap: Map<string, IndexedDoc>
  /** Ids of documents that currently have an up-to-date embedding. */
  indexedCount: number
  /** True when every document in the collection is embedded and current. */
  indexUpToDate: boolean
  /** True once at least one indexing pass has produced vectors. */
  hasIndex: boolean

  /** Current search mode. */
  mode: SearchMode
  setMode: (mode: SearchMode) => void

  /** The last query that was run (for display). */
  lastQuery: string
  /** Ranked results for the active mode (empty until a search runs). */
  results: SearchResult[]

  // actions
  index: () => void
  search: (query: string) => void
  clearResults: () => void
  addDoc: (input: { title: string; description: string; category?: string }) => void
  updateDoc: (id: string, patch: Partial<Pick<TicketDoc, 'title' | 'description' | 'category'>>) => void
  removeDoc: (id: string) => void
  resetDocs: () => void
}

export function useSemanticSearch(): UseSemanticSearch {
  const workerRef = useRef<Worker | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])
  // Main-thread watchdog also works when WASM blocks the worker event loop.
  const armWatchdog = useCallback((worker: Worker, milliseconds: number) => {
    clearWatchdog()
    timeoutRef.current = setTimeout(() => {
      worker.terminate()
      workerRef.current = null
      pendingRef.current = new Map()
      setIndexProgress(null)
      setError('The embedding worker stopped responding. Retry indexing to restart it.')
      setStatus('error')
    }, milliseconds)
  }, [clearWatchdog])

  const [status, setStatus] = useState<SearchStatus>('idle')
  const [support, setSupport] = useState<WebGpuSupport>({
    checked: false,
    webgpu: false,
    fp16: false,
  })
  const [device, setDevice] = useState<InferenceDevice | null>(null)
  const [progress, setProgress] = useState<ModelFileProgress[]>([])
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [docs, setDocs] = useState<TicketDoc[]>(() => SAMPLE_TICKETS)
  /** The in-memory vector index, keyed by document id. */
  const [index, setIndex] = useState<Map<string, IndexedDoc>>(() => new Map())

  const [mode, setMode] = useState<SearchMode>('semantic')
  const [lastQuery, setLastQuery] = useState('')
  // Results are stored per mode so toggling the control doesn't lose the other
  // mode's output; the view reads the active mode's list.
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([])
  const [keywordResults, setKeywordResults] = useState<SearchResult[]>([])

  // Counter so the user id of added docs is unique within a session.
  const customCounter = useRef(0)

  /** Create the worker on demand and wire up its message handler. */
  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('error', (e) => {
      // A hard worker error (e.g. the module failed to import) never arrives as
      // a normal 'message'. Surface it instead of silently doing nothing.
      console.error('[semantic-search] worker error', e.message, e)
      clearWatchdog()
      worker.terminate()
      workerRef.current = null
      setIndexProgress(null)
      setError(`Worker failed: ${e.message || 'unknown error'}`)
      setStatus('error')
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
          armWatchdog(worker, 180_000)
          setProgress((prev) => {
            const next = prev.filter((p) => p.file !== msg.file.file)
            next.push(msg.file)
            return next
          })
          break
        case 'ready':
          setDevice(msg.device)
          break
        case 'embed-progress':
          armWatchdog(worker, 60_000)
          setStatus('indexing')
          setDevice(msg.device)
          setIndexProgress({ done: msg.done, total: msg.total })
          break
        case 'embedded': {
          clearWatchdog()
          const pending = pendingRef.current
          setDevice(msg.device)
          // Merge the freshly embedded vectors into the index. We look the
          // document up by id from the pending-embed map so the stored vector
          // is paired with the exact text hash it was computed from.
          setIndex((prev) => {
            const next = new Map(prev)
            for (const item of msg.items) {
              const entry = pending.get(item.id)
              if (!entry) continue
              next.set(item.id, {
                doc: entry.doc,
                vector: Float32Array.from(item.vector),
                textHash: entry.textHash,
              })
            }
            return next
          })
          pendingRef.current = new Map()
          setIndexProgress(null)
          setStatus('idle')
          break
        }
        case 'query-embedded': {
          clearWatchdog()
          setDevice(msg.device)
          // Rank the current index against the query embedding.
          const ranked = rankBySimilarity(msg.vector, currentIndexRef.current, TOP_K)
          setSemanticResults(ranked)
          setStatus('idle')
          break
        }
        case 'error':
          clearWatchdog()
          worker.terminate()
          workerRef.current = null
          pendingRef.current = new Map()
          setError(msg.message)
          setStatus('error')
          setIndexProgress(null)
          break
      }
    })

    workerRef.current = worker
    return worker
  }, [armWatchdog, clearWatchdog])

  // Keep a ref to the latest index so the (stable) message handler can read it
  // when a query embedding arrives without re-subscribing.
  const currentIndexRef = useRef<IndexedDoc[]>([])
  useEffect(() => {
    currentIndexRef.current = Array.from(index.values())
  }, [index])

  // Documents awaiting embedding, keyed by id, so the 'embedded' handler can
  // pair each returned vector with the doc + text hash it was computed from.
  const pendingRef = useRef<Map<string, { doc: TicketDoc; textHash: string }>>(new Map())

  // Probe WebGPU availability once on mount (cheap, no model download).
  useEffect(() => {
    const worker = ensureWorker()
    worker.postMessage({ type: 'check' })
  }, [ensureWorker])

  // Tear down the worker on unmount.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      clearWatchdog()
      workerRef.current = null
    }
  }, [clearWatchdog])

  // Which documents are embedded and current (hash matches current text).
  const staleIds = useMemo(() => {
    const stale: TicketDoc[] = []
    for (const doc of docs) {
      const entry = index.get(doc.id)
      if (!entry || entry.textHash !== hashText(embeddableText(doc))) {
        stale.push(doc)
      }
    }
    return stale
  }, [docs, index])

  const indexedCount = useMemo(
    () => docs.filter((d) => index.get(d.id)?.textHash === hashText(embeddableText(d))).length,
    [docs, index],
  )

  const indexUpToDate = staleIds.length === 0 && docs.length > 0
  const hasIndex = index.size > 0

  /**
   * (Re)index the collection. Only documents whose embeddable text changed (or
   * that were never embedded) are sent to the model; unchanged documents keep
   * their cached vectors. Stale entries for removed documents are pruned.
   */
  const index_ = useCallback(() => {
    // Prune vectors for documents no longer in the collection.
    setIndex((prev) => {
      const liveIds = new Set(docs.map((d) => d.id))
      let changed = false
      const next = new Map(prev)
      for (const id of next.keys()) {
        if (!liveIds.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })

    if (staleIds.length === 0) return

    const items: EmbedItem[] = []
    const pending = new Map<string, { doc: TicketDoc; textHash: string }>()
    for (const doc of staleIds) {
      const text = embeddableText(doc)
      items.push({ id: doc.id, text })
      pending.set(doc.id, { doc, textHash: hashText(text) })
    }
    pendingRef.current = pending

    const worker = ensureWorker()
    setError(null)
    setProgress([])
    setIndexProgress({ done: 0, total: items.length })
    setStatus('loading-model') // flips to indexing via embed-progress
    armWatchdog(worker, 180_000)
    worker.postMessage({ type: 'embed', items })
  }, [docs, ensureWorker, staleIds, armWatchdog])

  const search = useCallback(
    (query: string) => {
      const q = query.trim()
      setLastQuery(q)
      if (!q) {
        setSemanticResults([])
        setKeywordResults([])
        return
      }

      // Keyword search is synchronous and needs no model.
      setKeywordResults(keywordSearch(q, docs, TOP_K))

      // Semantic search needs a query embedding against the current index.
      if (currentIndexRef.current.length === 0) {
        // Nothing indexed yet — leave semantic results empty; the UI prompts
        // the user to index first.
        setSemanticResults([])
        return
      }
      const worker = ensureWorker()
      setError(null)
      setStatus('searching')
      armWatchdog(worker, 60_000)
      worker.postMessage({ type: 'embed-query', text: q })
    },
    [docs, ensureWorker, armWatchdog],
  )

  const clearResults = useCallback(() => {
    setLastQuery('')
    setSemanticResults([])
    setKeywordResults([])
    if (status !== 'indexing' && status !== 'loading-model') setStatus('idle')
  }, [status])

  const addDoc = useCallback(
    (input: { title: string; description: string; category?: string }) => {
      const title = input.title.trim()
      const description = input.description.trim()
      if (!title && !description) return
      customCounter.current += 1
      const doc: TicketDoc = {
        id: `u-${customCounter.current}`,
        title: title || '(untitled)',
        description,
        category: input.category?.trim() || 'Custom',
        custom: true,
      }
      setDocs((prev) => [doc, ...prev])
    },
    [],
  )

  const updateDoc = useCallback(
    (id: string, patch: Partial<Pick<TicketDoc, 'title' | 'description' | 'category'>>) => {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
    },
    [],
  )

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id))
    setIndex((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const resetDocs = useCallback(() => {
    setDocs(SAMPLE_TICKETS)
    setIndex(new Map())
    setSemanticResults([])
    setKeywordResults([])
    setLastQuery('')
    setStatus('idle')
  }, [])

  const results = mode === 'semantic' ? semanticResults : keywordResults

  return {
    status,
    support,
    device,
    progress,
    indexProgress,
    error,
    docs,
    indexMap: index,
    indexedCount,
    indexUpToDate,
    hasIndex,
    mode,
    setMode,
    lastQuery,
    results,
    index: index_,
    search,
    clearResults,
    addDoc,
    updateDoc,
    removeDoc,
    resetDocs,
  }
}
