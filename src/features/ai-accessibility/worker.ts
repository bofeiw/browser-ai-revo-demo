/// <reference lib="webworker" />
/**
 * Inference Web Worker for the AI Accessibility alt-text generator.
 *
 * Running the model off the main thread keeps the UI responsive during the
 * (potentially multi-second) load and generation steps. The worker owns the
 * entire Transformers.js lifecycle and contains no React code.
 *
 * Lifecycle messages (see ./types):
 *   check       -> report WebGPU availability
 *   load        -> lazily download + initialize the model (singleton, reused)
 *   generate    -> caption the given image at the requested detail level
 *   reset-image -> drop cached vision inputs so the next image is re-encoded
 *
 * Model: onnx-community/Florence-2-base-ft — a 0.23B task-prompted captioning
 * model (MIT). This worker follows the official Transformers.js WebGPU example
 * (huggingface/transformers.js-examples → florence2-webgpu), including the
 * mixed-precision dtype map and the shader warm-up run.
 *   https://huggingface.co/onnx-community/Florence-2-base-ft
 *   https://huggingface.co/spaces/Xenova/florence2-webgpu
 */

import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  full,
  type ProgressInfo,
} from '@huggingface/transformers'

import type {
  CaptionDetail,
  InferenceDevice,
  ModelFileProgress,
  WorkerRequest,
  WorkerResponse,
} from './types'
import { CAPTION_TASKS } from './types'

const MODEL_ID = 'onnx-community/Florence-2-base-ft'

/**
 * The Transformers.js model/processor/tokenizer objects are dynamically shaped
 * and the library's published types are loose, so we treat them as opaque here.
 * This is the single, contained use of `any` in the worker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPipe = any

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
 * Lazy-loaded singleton holding the model, processor, and tokenizer. The first
 * `load`/`generate` triggers the download; later calls reuse the instances so
 * subsequent images don't re-download or re-initialize the model.
 */
class Pipeline {
  private static instance: Pipeline | null = null

  readonly model: AnyPipe
  readonly processor: AnyPipe
  readonly tokenizer: AnyPipe
  readonly device: InferenceDevice

  private constructor(
    model: AnyPipe,
    processor: AnyPipe,
    tokenizer: AnyPipe,
    device: InferenceDevice,
  ) {
    this.model = model
    this.processor = processor
    this.tokenizer = tokenizer
    this.device = device
  }

  static async get(onProgress: (info: ProgressInfo) => void): Promise<Pipeline> {
    if (Pipeline.instance) return Pipeline.instance

    const { webgpu, fp16 } = await detectWebGpu()
    const device: InferenceDevice = webgpu ? 'webgpu' : 'wasm'

    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    })
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    })

    // Mixed-precision dtype map from the official florence2-webgpu example.
    // On WebGPU: fp16 vision/embeddings when the adapter supports shader-f16,
    // else fp32; the encoder/decoder stay q4 to keep the download small. On the
    // CPU/WASM fallback f16 is poorly supported, so everything drops to fp32/q4.
    const useFp16 = device === 'webgpu' && fp16
    const dtype = {
      embed_tokens: useFp16 ? 'fp16' : 'fp32',
      vision_encoder: useFp16 ? 'fp16' : 'fp32',
      encoder_model: 'q4',
      decoder_model_merged: 'q4',
    } as const

    const model = await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: onProgress,
    })

    // Warm up: compile WebGPU shaders with a dummy forward pass so the first
    // real caption isn't penalized by shader compilation. Mirrors the example.
    try {
      const textInputs = tokenizer('a')
      const pixelValues = full([1, 3, 768, 768], 0.0)
      await model.generate({ ...textInputs, pixel_values: pixelValues, max_new_tokens: 1 })
    } catch {
      // Warm-up is best-effort; a failure here shouldn't block real generation.
    }

    Pipeline.instance = new Pipeline(model, processor, tokenizer, device)
    return Pipeline.instance
  }
}

// Cache the preprocessed vision inputs for the current image so switching the
// caption detail level (or re-generating) doesn't re-encode the same pixels.
let cachedUrl: string | null = null
let cachedVisionInputs: AnyPipe = null
let cachedImageSize: [number, number] | null = null

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
    reply({ status: 'error', message: toMessage(err) })
  }
}

async function generate(image: string, detail: CaptionDetail): Promise<void> {
  try {
    const pipeline = await Pipeline.get(handleProgress)
    reply({ status: 'generating', device: pipeline.device })

    // Encode the image once; reuse for subsequent detail levels on the same URL.
    if (cachedUrl !== image || !cachedVisionInputs) {
      const raw = await RawImage.fromURL(image)
      cachedImageSize = raw.size as [number, number]
      cachedVisionInputs = await pipeline.processor(raw)
      cachedUrl = image
    }

    const task = CAPTION_TASKS[detail]
    const prompts = pipeline.processor.construct_prompts(task)
    const textInputs = pipeline.tokenizer(prompts)

    const generatedIds = await pipeline.model.generate({
      ...textInputs,
      ...cachedVisionInputs,
      max_new_tokens: 256,
      num_beams: 1,
      do_sample: false,
    })

    const generatedText: string = pipeline.tokenizer.batch_decode(generatedIds, {
      skip_special_tokens: false,
    })[0]

    // post_process_generation returns an object keyed by the task token.
    const result = pipeline.processor.post_process_generation(
      generatedText,
      task,
      cachedImageSize,
    )
    const caption = extractCaption(result, task)

    reply({ status: 'complete', caption, detail })
  } catch (err) {
    reply({ status: 'error', message: toMessage(err) })
  }
}

/** Pull the string caption out of Florence-2's post-processed result object. */
function extractCaption(result: unknown, task: string): string {
  if (result && typeof result === 'object' && task in (result as Record<string, unknown>)) {
    const value = (result as Record<string, unknown>)[task]
    if (typeof value === 'string') return value.trim()
  }
  // Fallback: some versions return a bare string.
  if (typeof result === 'string') return result.trim()
  return ''
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
    case 'generate':
      void generate(data.image, data.detail)
      break
    case 'reset-image':
      cachedUrl = null
      cachedVisionInputs = null
      cachedImageSize = null
      break
  }
})
