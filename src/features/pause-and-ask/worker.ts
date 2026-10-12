/// <reference lib="webworker" />
/**
 * Inference Web Worker for Pause & Ask.
 *
 * Running the vision-language model off the main thread keeps the camera
 * preview and UI responsive during the (multi-second) model load and the
 * per-question generation. The worker owns the whole Transformers.js lifecycle
 * and contains no React code.
 *
 * Model: onnx-community/LFM2.5-VL-450M-ONNX (LiquidAI). A compact (~450M)
 * instruction-tuned vision-language model that performs genuine visual question
 * answering — it accepts an image plus a natural-language question and generates
 * an answer grounded in that image. The same model is reused for the optional
 * short scene captions, so only one model is ever downloaded. Runs on WebGPU
 * when available, falling back to the WASM (CPU) backend.
 *
 * Lifecycle messages (see ./types):
 *   check     -> report WebGPU availability (no download)
 *   load      -> lazily download + initialize the model (singleton, reused)
 *   generate  -> run one VQA or caption request; streams tokens then the final text
 *   interrupt -> stop the current generation early
 *
 * Only one generation runs at a time. A `generate` that arrives while another
 * is in flight is rejected with an error so the UI never queues unbounded work.
 */

import {
  AutoProcessor,
  AutoModelForImageTextToText,
  TextStreamer,
  InterruptableStoppingCriteria,
  load_image,
  type ProgressInfo,
} from '@huggingface/transformers'

import type {
  InferenceDevice,
  InferenceKind,
  ModelFileProgress,
  WorkerRequest,
  WorkerResponse,
} from './types'

const MODEL_ID = 'onnx-community/LFM2.5-VL-450M-ONNX'

/**
 * The Transformers.js processor/model objects are dynamically shaped and the
 * library's published types are loose, so we treat them as opaque here. This is
 * the single, contained use of `any` in the worker.
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
 * Lazy-loaded singleton holding the processor + model. The first `load`/
 * `generate` triggers the one-time download; later calls reuse the instances so
 * subsequent questions about the same (or a new) frame don't reload weights.
 */
class Pipeline {
  private static instance: Pipeline | null = null
  private static loading: Promise<Pipeline> | null = null

  readonly processor: AnyPipe
  readonly model: AnyPipe
  readonly device: InferenceDevice

  private constructor(processor: AnyPipe, model: AnyPipe, device: InferenceDevice) {
    this.processor = processor
    this.model = model
    this.device = device
  }

  static async get(onProgress: (info: ProgressInfo) => void): Promise<Pipeline> {
    if (Pipeline.instance) return Pipeline.instance
    // Collapse concurrent load attempts into a single in-flight promise.
    if (Pipeline.loading) return Pipeline.loading

    Pipeline.loading = (async () => {
      const { webgpu, fp16 } = await detectWebGpu()
      const device: InferenceDevice = webgpu ? 'webgpu' : 'wasm'

      const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: onProgress,
      })

      // Per-submodel quantization. On WebGPU with f16 support we follow the
      // model card's recommended mix (fp16 vision/embeddings, q4f16 decoder,
      // ~350 MB total). Without f16, or on the WASM/CPU fallback, we use q4
      // everywhere since fp16 is poorly supported there.
      const dtype =
        device === 'webgpu' && fp16
          ? {
              embed_tokens: 'fp16' as const,
              vision_encoder: 'fp16' as const,
              decoder_model_merged: 'q4f16' as const,
            }
          : {
              embed_tokens: 'q4' as const,
              vision_encoder: 'q4' as const,
              decoder_model_merged: 'q4' as const,
            }

      const model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
        dtype,
        device,
        progress_callback: onProgress,
      })

      // One image per frame — skip multi-tile splitting for lower latency and
      // peak memory, which matters most for the optional live-caption loop.
      // These fields are not in the library's published types, so poke them
      // through the opaque `AnyPipe` views.
      try {
        const imageProcessor = (processor as AnyPipe).image_processor
        if (imageProcessor) imageProcessor.do_image_splitting = false
      } catch {
        /* best-effort; defaults are fine if these fields are absent */
      }

      Pipeline.instance = new Pipeline(processor, model, device)
      return Pipeline.instance
    })()

    try {
      return await Pipeline.loading
    } finally {
      Pipeline.loading = null
    }
  }
}

let stoppingCriteria: InstanceType<typeof InterruptableStoppingCriteria> | null = null
/** True while a generation is running — guards against overlapping requests. */
let busy = false

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
    reply({ status: 'error', requestId: null, kind: null, message: toMessage(err) })
  }
}

/** Max tokens to generate per kind — captions stay short; answers can be longer. */
function maxTokensFor(kind: InferenceKind): number {
  return kind === 'caption' ? 64 : 256
}

/**
 * Run one image+text request against the loaded model and stream the answer.
 * Both VQA and caption requests go through here — only the prompt and token
 * budget differ.
 */
async function generate(
  requestId: number,
  kind: InferenceKind,
  image: string,
  prompt: string,
): Promise<void> {
  if (busy) {
    reply({
      status: 'error',
      requestId,
      kind,
      message: 'The model is still working on the previous request.',
    })
    return
  }
  busy = true
  try {
    const pipeline = await Pipeline.get(handleProgress)
    reply({ status: 'generating', requestId, kind, device: pipeline.device })

    const rawImage = await load_image(image)

    const messages = [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text:
              'You are a helpful multimodal assistant. Answer strictly based on what is ' +
              'visible in the image. If something cannot be determined from the image, ' +
              'say that you are not sure rather than guessing.',
          },
        ],
      },
      { role: 'user', content: [{ type: 'image' }, { type: 'text', text: prompt }] },
    ]

    const text = pipeline.processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    })
    // Note the LFM2-VL processor signature: (image, prompt, options).
    const inputs = await pipeline.processor(rawImage, text, {
      add_special_tokens: false,
    })

    stoppingCriteria = new InterruptableStoppingCriteria()

    let startTime: number | null = null
    let numTokens = 0
    let tps: number | null = null

    const streamer = new TextStreamer(pipeline.processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      token_callback_function: () => {
        if (startTime === null) startTime = performance.now()
        else tps = (numTokens / (performance.now() - startTime)) * 1000
        numTokens++
      },
      callback_function: (output: string) => {
        reply({ status: 'token', requestId, kind, text: output, tokensPerSecond: tps })
      },
    })

    const output = await pipeline.model.generate({
      ...inputs,
      // Low-temperature sampling per the model card for stable, grounded text.
      do_sample: true,
      temperature: 0.1,
      min_p: 0.15,
      repetition_penalty: 1.05,
      max_new_tokens: maxTokensFor(kind),
      streamer,
      stopping_criteria: stoppingCriteria,
      return_dict_in_generate: true,
    })

    const promptLength: number = inputs.input_ids.dims.at(-1)
    const generatedOnly = output.sequences.slice(null, [promptLength, null])
    const decoded: string[] = pipeline.processor.batch_decode(generatedOnly, {
      skip_special_tokens: true,
    })

    reply({ status: 'complete', requestId, kind, text: (decoded[0] ?? '').trim() })
  } catch (err) {
    reply({ status: 'error', requestId, kind, message: toMessage(err) })
  } finally {
    stoppingCriteria = null
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
      void detectWebGpu().then(({ webgpu, fp16 }) =>
        reply({ status: 'check-result', webgpu, fp16 }),
      )
      break
    case 'load':
      void load()
      break
    case 'generate':
      void generate(data.requestId, data.kind, data.image, data.prompt)
      break
    case 'interrupt':
      stoppingCriteria?.interrupt()
      break
  }
})
