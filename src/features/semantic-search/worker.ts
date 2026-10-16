/// <reference lib="webworker" />
import '../shared/runtime'
/**
 * Embedding Web Worker for Local Semantic Search.
 *
 * Running the model off the main thread keeps the UI responsive during the
 * one-time model download and during (batched) embedding. The worker owns the
 * entire Transformers.js lifecycle and contains no React code.
 *
 * Lifecycle messages (see ./types):
 *   check       -> report WebGPU availability
 *   load        -> lazily download + initialize the model (singleton, reused)
 *   embed       -> embed a batch of documents; streams progress, then vectors
 *   embed-query -> embed a single query string
 *
 * Model: Xenova/all-MiniLM-L6-v2 — a sentence-transformers model that maps text
 * to a 384-d dense vector for semantic similarity. We use the `feature-
 * extraction` pipeline with `{ pooling: 'mean', normalize: true }`, exactly as
 * documented on the model card. With L2-normalized vectors, cosine similarity
 * reduces to a dot product (done on the UI thread in ./similarity).
 *
 * Backend: WebGPU when available, otherwise full-precision CPU/WASM.
 */

import { env, pipeline, type ProgressInfo } from '@huggingface/transformers'

import type {
  EmbedItem,
  EmbeddedItem,
  InferenceDevice,
  ModelFileProgress,
  WorkerRequest,
  WorkerResponse,
} from './types'

// Only the CPU backend uses plain WASM. WebGPU needs the default Asyncify
// runtime for asynchronous GPU callbacks.
function configureCpu(): void {
  const wasm = env.backends.onnx.wasm
  if (wasm && typeof wasm.wasmPaths === 'object') {
    const paths = wasm.wasmPaths
    wasm.wasmPaths = {
      mjs: paths.mjs?.toString().replace('.asyncify.mjs', '.mjs'),
      wasm: paths.wasm?.toString().replace('.asyncify.wasm', '.wasm'),
    }
    wasm.numThreads = 1
    wasm.proxy = false
  }
}

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

/** How many documents to embed per model call. */
const BATCH_SIZE = 1

/**
 * Transformers.js pipeline objects are dynamically shaped and the library's
 * published types are loose, so we treat the extractor as opaque here. This is
 * the single, contained use of `any` in the feature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extractor = any

/** Typed wrapper around postMessage so every reply matches the protocol. */
function reply(message: WorkerResponse): void {
  self.postMessage(message)
}

/** Detect WebGPU support and f16 capability. Never throws. */
async function detectWebGpu(): Promise<{ webgpu: boolean; fp16: boolean }> {
  try {
    const gpu = (navigator as unknown as { gpu?: GPU }).gpu
    if (!gpu) return { webgpu: false, fp16: false }
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { webgpu: false, fp16: false }
    return { webgpu: true, fp16: adapter.features.has('shader-f16') }
  } catch {
    return { webgpu: false, fp16: false }
  }
}

/**
 * Lazy-loaded singleton holding the feature-extraction pipeline. The first
 * `load`/`embed`/`embed-query` triggers the download; later calls reuse it.
 */
class Embedder {
  private static instance: Embedder | null = null
  private static loading: Promise<Embedder> | null = null

  readonly extractor: Extractor
  readonly device: InferenceDevice

  private constructor(extractor: Extractor, device: InferenceDevice) {
    this.extractor = extractor
    this.device = device
  }

  static async get(onProgress: (info: ProgressInfo) => void): Promise<Embedder> {
    if (Embedder.instance) return Embedder.instance
    // Coalesce concurrent callers (e.g. an index + a query fired together) onto
    // a single in-flight load so the model is never downloaded twice.
    if (Embedder.loading) return Embedder.loading

    Embedder.loading = (async () => {
      const { webgpu } = await detectWebGpu()
      if (webgpu) {
        try {
          const extractor = await pipeline('feature-extraction', MODEL_ID, {
            device: 'webgpu',
            dtype: 'fp32',
            progress_callback: onProgress,
          })
          Embedder.instance = new Embedder(extractor, 'webgpu')
          Embedder.loading = null
          return Embedder.instance
        } catch (err) {
          // WebGPU can fail to initialize on some adapters; fall back to WASM.
          console.warn('[semantic-search worker] WebGPU unavailable, falling back to WASM', err)
        }
      }

      configureCpu()
      const extractor = await pipeline('feature-extraction', MODEL_ID, {
        device: 'wasm',
        dtype: 'fp32',
        progress_callback: onProgress,
      })
      Embedder.instance = new Embedder(extractor, 'wasm')
      Embedder.loading = null
      return Embedder.instance
    })()

    try {
      return await Embedder.loading
    } catch (err) {
      // Allow a retry after a failed load.
      Embedder.loading = null
      throw err
    }
  }
}

/** Forward Transformers.js progress events as typed protocol messages. */
function handleProgress(info: ProgressInfo): void {
  const anyInfo = info as unknown as {
    status?: string
    file?: string
    progress?: number
    loaded?: number
    total?: number
  }
  if (anyInfo.status === 'progress' && typeof anyInfo.file === 'string') {
    const file: ModelFileProgress = {
      file: anyInfo.file,
      progress: anyInfo.progress,
      loaded: anyInfo.loaded,
      total: anyInfo.total,
    }
    reply({ status: 'progress', file })
  }
}

async function load(): Promise<void> {
  try {
    reply({ status: 'loading', message: 'Downloading and initializing the embedding model…' })
    const embedder = await Embedder.get(handleProgress)
    reply({ status: 'ready', device: embedder.device })
  } catch (err) {
    reply({ status: 'error', message: toMessage(err) })
  }
}

/**
 * Embed an array of texts in one model call and return one normalized vector
 * per text. `pooling: 'mean'` + `normalize: true` are the documented settings
 * for this sentence-transformers model.
 */
async function embedTexts(embedder: Embedder, texts: string[]): Promise<number[][]> {
  const output = await embedder.extractor(texts, {
    pooling: 'mean',
    normalize: true,
  })

  // Robustly slice the [n, dim] tensor into one plain number[] per text,
  // regardless of whether `tolist()` nests or the data is a flat typed array.
  // `output.dims` is like [texts.length, 384]; `output.data` is the flat
  // Float32Array backing it. Reading from `data` with the known dim is the
  // most reliable path across backends.
  const dims: number[] = Array.isArray(output?.dims) ? output.dims : []
  const flat: ArrayLike<number> | undefined = output?.data
  if (dims.length === 2 && flat && typeof flat.length === 'number') {
    const [n, dim] = dims
    const vectors: number[][] = []
    for (let i = 0; i < n; i++) {
      const vec = new Array<number>(dim)
      for (let j = 0; j < dim; j++) vec[j] = flat[i * dim + j]
      vectors.push(vec)
    }
    return vectors
  }

  // Fallback: trust tolist() if the tensor shape wasn't what we expected.
  return output.tolist() as number[][]
}

/**
 * Embed a batch of documents, streaming incremental progress so the UI can show
 * a genuine indexing bar, then return every vector at once.
 */
async function embed(items: EmbedItem[]): Promise<void> {
  try {
    const embedder = await Embedder.get(handleProgress)
    reply({ status: 'embed-progress', done: 0, total: items.length, device: embedder.device })

    const out: EmbeddedItem[] = []
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE)
      const vectors = await embedTexts(
        embedder,
        batch.map((it) => it.text),
      )
      for (let i = 0; i < batch.length; i++) {
        out.push({ id: batch[i].id, vector: vectors[i] })
      }
      reply({
        status: 'embed-progress',
        done: Math.min(items.length, start + batch.length),
        total: items.length,
        device: embedder.device,
      })
    }

    reply({ status: 'embedded', items: out, device: embedder.device })
  } catch (err) {
    reply({ status: 'error', message: toMessage(err) })
  }
}

/** Embed a single query string with the same model + pooling/normalization. */
async function embedQuery(text: string): Promise<void> {
  try {
    const embedder = await Embedder.get(handleProgress)
    const [vector] = await embedTexts(embedder, [text])
    reply({ status: 'query-embedded', vector, device: embedder.device })
  } catch (err) {
    reply({ status: 'error', message: toMessage(err) })
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const data = event.data
  switch (data.type) {
    case 'check':
      void detectWebGpu().then(({ webgpu, fp16 }) =>
        reply({ status: 'check-result', webgpu, fp16 }),
      )
      break
    case 'load':
      void load()
      break
    case 'embed':
      void embed(data.items)
      break
    case 'embed-query':
      void embedQuery(data.text)
      break
  }
})
