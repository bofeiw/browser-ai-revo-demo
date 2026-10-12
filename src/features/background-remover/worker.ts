/// <reference lib="webworker" />
/**
 * Inference Web Worker for the AI Background Remover.
 *
 * Running the model off the main thread keeps the UI responsive during the
 * (one-time) model download and the per-image segmentation. The worker owns the
 * entire Transformers.js lifecycle and contains no React code.
 *
 * Lifecycle messages (see ./types):
 *   check   -> report WebGPU availability (cheap, no model download)
 *   load    -> lazily download + initialize the model (singleton, reused)
 *   segment -> predict a foreground alpha matte for the given image
 *
 * Model: briaai/RMBG-1.4 — BRIA AI's IS-Net saliency segmentation model
 * (non-commercial license; see ./types and the README). This worker follows the
 * documented Transformers.js usage: AutoModel + AutoProcessor + RawImage, with
 * the model output (a single-channel 0–1 matte) scaled to 0–255 and resized back
 * to the original image dimensions before being handed to the UI for compositing.
 *   https://huggingface.co/briaai/RMBG-1.4
 *   https://huggingface.co/Xenova/modnet (same output format, documents the API)
 */

import {
  AutoModel,
  AutoProcessor,
  RawImage,
  type ProgressInfo,
} from '@huggingface/transformers'

import type {
  AlphaMask,
  InferenceDevice,
  ModelFileProgress,
  WorkerRequest,
  WorkerResponse,
} from './types'
import { MODEL_ID } from './types'

/**
 * The Transformers.js model/processor objects are dynamically shaped and the
 * library's published types are loose, so we treat them as opaque here. This is
 * the single, contained use of `any` in the worker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPipe = any

/** Typed wrapper around postMessage so every reply matches the protocol. */
function reply(message: WorkerResponse, transfer?: Transferable[]): void {
  if (transfer) {
    self.postMessage(message, transfer)
  } else {
    self.postMessage(message)
  }
}

/** Detect WebGPU support. Never throws. */
async function detectWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: GPU }).gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    return adapter != null
  } catch {
    return false
  }
}

/**
 * Lazy-loaded singleton holding the model and processor. The first
 * `load`/`segment` triggers the download; later calls reuse the instances so
 * subsequent images don't re-download or re-initialize the model.
 */
class Pipeline {
  private static instance: Pipeline | null = null
  private static loading: Promise<Pipeline> | null = null

  readonly model: AnyPipe
  readonly processor: AnyPipe
  readonly device: InferenceDevice

  private constructor(model: AnyPipe, processor: AnyPipe, device: InferenceDevice) {
    this.model = model
    this.processor = processor
    this.device = device
  }

  static async get(onProgress: (info: ProgressInfo) => void): Promise<Pipeline> {
    if (Pipeline.instance) return Pipeline.instance
    // Collapse concurrent initializations onto a single in-flight promise so a
    // rapid second request can't start a second download.
    if (Pipeline.loading) return Pipeline.loading

    Pipeline.loading = (async () => {
      const webgpu = await detectWebGpu()
      const device: InferenceDevice = webgpu ? 'webgpu' : 'wasm'

      // RMBG-1.4's ONNX export is fp32. There is no reliable q4f16 variant, and
      // f16 is poorly supported on the CPU/WASM backend — fp32 is the safe,
      // documented precision on both devices.
      const model = await AutoModel.from_pretrained(MODEL_ID, {
        device,
        dtype: 'fp32',
        progress_callback: onProgress,
      })
      const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: onProgress,
      })

      Pipeline.instance = new Pipeline(model, processor, device)
      Pipeline.loading = null
      return Pipeline.instance
    })()

    try {
      return await Pipeline.loading
    } catch (err) {
      // Reset so a later attempt can retry from scratch.
      Pipeline.loading = null
      throw err
    }
  }

  static current(): Pipeline | null {
    return Pipeline.instance
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
    reply({ status: 'loading', message: 'Downloading and initializing the model…' })
    const pipeline = await Pipeline.get(handleProgress)
    reply({ status: 'ready', device: pipeline.device })
  } catch (err) {
    reply({ status: 'error', requestId: null, message: toMessage(err) })
  }
}

/**
 * Predict the foreground alpha matte for one image and reply with a mask resized
 * to the original dimensions. Only one segmentation runs at a time (serialized
 * by `busy`); the UI also guards against overlapping requests.
 */
let busy = false

async function segment(
  requestId: number,
  image: string,
  width: number,
  height: number,
): Promise<void> {
  if (busy) {
    reply({
      status: 'error',
      requestId,
      message: 'Another image is still being processed. Please wait.',
    })
    return
  }
  busy = true
  try {
    const wasLoaded = Pipeline.current() != null
    if (!wasLoaded) {
      reply({ status: 'loading', message: 'Downloading and initializing the model…' })
    }
    const pipeline = await Pipeline.get(handleProgress)
    if (!wasLoaded) reply({ status: 'ready', device: pipeline.device })

    reply({ status: 'segmenting', device: pipeline.device, requestId })

    const raw = await RawImage.fromURL(image)

    // Processor resizes to the model's input size (1024×1024) and normalizes.
    const { pixel_values } = await pipeline.processor(raw)

    // RMBG returns a single-channel saliency map in [0, 1]. Scale to [0, 255]
    // and resize back to the *original* image size so the matte aligns exactly
    // with the full-resolution pixels the UI will composite against.
    const { output } = await pipeline.model({ input: pixel_values })
    const maskImage: AnyPipe = await RawImage.fromTensor(
      output[0].mul(255).to('uint8'),
    ).resize(width, height)

    // `maskImage.data` is a single-channel Uint8 buffer (length = width*height).
    const src: Uint8Array = maskImage.data
    const data = new Uint8ClampedArray(src.length)
    data.set(src)

    const mask: AlphaMask = { width, height, data }

    // Transfer the underlying buffer to avoid copying the matte across threads.
    reply({ status: 'complete', requestId, mask }, [data.buffer])
  } catch (err) {
    reply({ status: 'error', requestId, message: toMessage(err) })
  } finally {
    busy = false
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
      void detectWebGpu().then((webgpu) => reply({ status: 'check-result', webgpu }))
      break
    case 'load':
      void load()
      break
    case 'segment':
      void segment(data.requestId, data.image, data.width, data.height)
      break
  }
})
