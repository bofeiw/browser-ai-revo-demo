/**
 * Type definitions and the worker message protocol for Local Semantic Search.
 *
 * Four concerns are kept intentionally separate:
 *  1. The documents the user searches over (a ticket-shaped record).
 *  2. The in-memory vector index entry (a document plus its embedding).
 *  3. A single search result (document + similarity score + mode).
 *  4. The messages exchanged with the embedding Web Worker.
 *
 * There is deliberately no "vector database" abstraction here: for a handful of
 * short documents an array of Float32Array vectors scored by a dot product is
 * both correct and more than fast enough.
 */

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * A short document to search over. Modeled on a support ticket, but the
 * `title` + `description` are the only fields that get embedded — `category`
 * is a human-facing label shown in the UI, not part of the semantic signal.
 */
export interface TicketDoc {
  /** Stable id. Example tickets use "T-xxx"; user-added ones use "u-<n>". */
  id: string
  title: string
  description: string
  /** Human-facing label/grouping (e.g. "Data integrity"). */
  category: string
  /** True when the user created this document (so the UI can mark it). */
  custom?: boolean
}

/**
 * The exact text that gets embedded for a document. Kept in one place so the
 * index can detect when a document's embeddable content changed (and therefore
 * its cached vector is stale) without re-embedding everything.
 */
export function embeddableText(doc: Pick<TicketDoc, 'title' | 'description'>): string {
  return `${doc.title}\n${doc.description}`.trim()
}

// ---------------------------------------------------------------------------
// Vector index
// ---------------------------------------------------------------------------

/**
 * An indexed document: the document itself, the L2-normalized embedding, and a
 * hash of the exact text that was embedded. The hash lets a reindex skip
 * documents whose embeddable text is unchanged (so edits/additions only embed
 * what actually changed).
 */
export interface IndexedDoc {
  doc: TicketDoc
  /** L2-normalized 384-d embedding. */
  vector: Float32Array
  /** Hash of {@link embeddableText} at the time of embedding. */
  textHash: string
}

/** Cheap, deterministic string hash (djb2) used to detect stale vectors. */
export function hashText(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  }
  // Fold in the length too, as an extra guard against collisions.
  return `${(h >>> 0).toString(36)}:${text.length}`
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Which algorithm produced a result set. */
export type SearchMode = 'semantic' | 'keyword'

/** One ranked search result. */
export interface SearchResult {
  doc: TicketDoc
  /**
   * The ranking score.
   *  - semantic: cosine similarity in [-1, 1] (typically ~0–0.8 for this model).
   *  - keyword:  a normalized overlap score in [0, 1].
   * Both are *relative ranking signals*, not calibrated probabilities.
   */
  score: number
  mode: SearchMode
}

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

/** Per-file download progress emitted by Transformers.js. */
export interface ModelFileProgress {
  file: string
  /** 0–100, present once the total size is known. */
  progress?: number
  loaded?: number
  total?: number
}

/** Device the model ended up running on. */
export type InferenceDevice = 'webgpu' | 'wasm'

/** A document handed to the worker for embedding. */
export interface EmbedItem {
  id: string
  text: string
}

/** Messages sent from the UI thread to the worker. */
export type WorkerRequest =
  | { type: 'check' }
  /** Lazily download + initialize the embedding model (no inference yet). */
  | { type: 'load' }
  /**
   * Embed a batch of documents. The worker streams `embed-progress` as it goes
   * and finishes with `embedded`.
   */
  | { type: 'embed'; items: EmbedItem[] }
  /** Embed a single query string; finishes with `query-embedded`. */
  | { type: 'embed-query'; text: string }

/** A single document's computed embedding, sent back to the UI thread. */
export interface EmbeddedItem {
  id: string
  /** Plain array so it structured-clones cleanly across the worker boundary. */
  vector: number[]
}

/** Messages sent from the worker back to the UI thread. */
export type WorkerResponse =
  | { status: 'check-result'; webgpu: boolean; fp16: boolean }
  | { status: 'loading'; message: string }
  | { status: 'progress'; file: ModelFileProgress }
  | { status: 'ready'; device: InferenceDevice }
  /** Incremental indexing progress: `done` of `total` documents embedded. */
  | { status: 'embed-progress'; done: number; total: number; device: InferenceDevice }
  /** All requested documents embedded. */
  | { status: 'embedded'; items: EmbeddedItem[]; device: InferenceDevice }
  /** The query embedding is ready. */
  | { status: 'query-embedded'; vector: number[]; device: InferenceDevice }
  | { status: 'error'; message: string }
