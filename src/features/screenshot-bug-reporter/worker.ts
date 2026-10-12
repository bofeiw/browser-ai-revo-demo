/// <reference lib="webworker" />
/**
 * Inference Web Worker for the Screenshot Bug Reporter.
 *
 * Running the model off the main thread keeps the UI responsive during the
 * (potentially multi-second) load and generation steps. The worker owns the
 * entire Transformers.js lifecycle and is intentionally free of any React code.
 *
 * Lifecycle messages (see ./types):
 *   check    -> report WebGPU availability
 *   load     -> lazily download + initialize the model (singleton, reused)
 *   generate -> run one analysis; streams tokens, then the final raw string
 *   interrupt-> stop the current generation early
 *
 * Model: HuggingFaceTB/SmolVLM-500M-Instruct (instruction-tuned VLM), run with
 * WebGPU when available, falling back to the WASM backend otherwise.
 */

import {
  AutoProcessor,
  AutoModelForVision2Seq,
  TextStreamer,
  InterruptableStoppingCriteria,
  load_image,
  type ProgressInfo,
} from '@huggingface/transformers'

import type {
  BugReport,
  InferenceDevice,
  ModelFileProgress,
  WorkerRequest,
  WorkerResponse,
} from './types'
import { buildAnalysisSteps } from './prompt'

const MODEL_ID = 'HuggingFaceTB/SmolVLM-Instruct'

/**
 * The Transformers.js processor/model objects are dynamically shaped and the
 * library's published types are loose, so we deliberately treat them as opaque
 * here. This is the single, contained use of `any` in the feature.
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
 * Lazy-loaded singleton holding the processor + model. The first `load` call
 * triggers the download; subsequent `generate` calls reuse the instances.
 */
class Pipeline {
  private static instance: Pipeline | null = null

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

    const { webgpu } = await detectWebGpu()
    const device: InferenceDevice = webgpu ? 'webgpu' : 'wasm'

    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    })

    // Per-submodel quantization for SmolVLM-Instruct (2.2B). On WebGPU we use
    // q4f16 (~1.4 GB total: decoder ~965 MB, vision ~248 MB, embeddings
    // ~201 MB) which retains enough quality to actually read UI text and error
    // messages — the 500M model could not. q4f16 relies on WebGPU f16 support;
    // on the CPU/WASM fallback we drop to plain q4 since f16 is poorly
    // supported there.
    const quant = device === 'webgpu' ? 'q4f16' : 'q4'
    const model = await AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      dtype: {
        embed_tokens: quant,
        vision_encoder: quant,
        decoder_model_merged: quant,
      },
      device,
      progress_callback: onProgress,
    })

    Pipeline.instance = new Pipeline(processor, model, device)
    return Pipeline.instance
  }
}

let stoppingCriteria: InstanceType<typeof InterruptableStoppingCriteria> | null = null

/** Forward Transformers.js progress events as typed protocol messages. */
function handleProgress(info: ProgressInfo): void {
  // ProgressInfo is a union; only the download-progress variants carry a file.
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

/**
 * Ask the model one focused question about an already-loaded image and return
 * only the newly generated text.
 *
 * Generation settings are tuned to prevent the degeneration seen with small
 * VLMs on long structured prompts:
 *  - `no_repeat_ngram_size: 3` hard-bans repeating any 3-gram, which stops the
 *    "K. K. K." style loops outright.
 *  - `repetition_penalty: 1.3` discourages softer repetition.
 *  - a modest per-step `max_new_tokens` keeps each answer short.
 */
async function askOne(
  pipeline: Pipeline,
  rawImage: unknown,
  prompt: string,
  maxNewTokens: number,
): Promise<string> {
  const messages = [
    { role: 'user', content: [{ type: 'image' }, { type: 'text', text: prompt }] },
  ]

  const text = pipeline.processor.apply_chat_template(messages, {
    add_generation_prompt: true,
  })
  // do_image_splitting: false — a screenshot is one image; skipping multi-patch
  // splitting reduces token count and peak memory.
  const inputs = await pipeline.processor(text, [rawImage], {
    do_image_splitting: false,
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
      reply({ status: 'token', text: output, tokensPerSecond: tps })
    },
  })

  const output = await pipeline.model.generate({
    ...inputs,
    do_sample: false,
    repetition_penalty: 1.3,
    no_repeat_ngram_size: 3,
    max_new_tokens: maxNewTokens,
    streamer,
    stopping_criteria: stoppingCriteria,
    return_dict_in_generate: true,
  })

  const promptLength: number = inputs.input_ids.dims.at(-1)
  const generatedOnly = output.sequences.slice(null, [promptLength, null])
  const decoded: string[] = pipeline.processor.batch_decode(generatedOnly, {
    skip_special_tokens: true,
  })
  return cleanAnswer(decoded[0] ?? '')
}

/**
 * Run the full analysis as a sequence of short, focused questions and assemble
 * the structured report in code. This is far more reliable for a 500M model
 * than asking it to emit one large JSON object.
 */
async function generate(image: string, userContext: string): Promise<void> {
  try {
    const pipeline = await Pipeline.get(handleProgress)
    reply({ status: 'generating', device: pipeline.device })

    const rawImage = await load_image(image)
    const steps = buildAnalysisSteps(userContext)

    const answers: Record<string, string> = {}
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      reply({ status: 'step', step: step.key, index: i, total: steps.length })
      answers[step.key] = await askOne(pipeline, rawImage, step.prompt, step.maxNewTokens)
    }

    const report = assembleReport(answers, userContext)
    reply({ status: 'complete', report })
  } catch (err) {
    reply({ status: 'error', message: toMessage(err) })
  }
}

/** Strip the leading "Assistant:" marker and surrounding whitespace. */
function cleanAnswer(full: string): string {
  let out = full.trim()
  const idx = out.lastIndexOf('Assistant:')
  if (idx !== -1) out = out.slice(idx + 'Assistant:'.length).trim()
  return out
}

/** True when an "errors" answer effectively says there are none. */
function isNoneAnswer(answer: string): boolean {
  const a = answer.trim().toLowerCase()
  if (!a) return true
  if (a === 'none' || a === 'none.') return true
  // Short answers that explicitly deny any error message.
  return /\b(no|none|not any|there (is|are) no)\b.*\b(error|warning|alert|message)\b/.test(a)
}

/**
 * Detect answers where a small model echoed the instruction back instead of
 * performing it (e.g. "Yes. Copy and paste all of it here."). These are
 * meaningless as error text and must not leak into the report.
 */
function isInstructionEcho(answer: string): boolean {
  const a = answer.trim().toLowerCase()
  return (
    /copy (and )?paste|word for word|write (it|them) out|type (it|them)|each (message|one) on its own line|all of it here|here\.?$/.test(
      a,
    ) || /^(yes|sure|okay|ok)[.,!]?\s*$/.test(a)
  )
}

/**
 * Clean the raw "errors" answer: drop lines that are instruction echoes or
 * generic affirmations, keep only what looks like real on-screen text.
 */
function sanitizeErrors(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0 && !isInstructionEcho(line) && !isNoneAnswer(line))
    .join('\n')
    .trim()
}

/** Split a comma / newline / semicolon separated answer into clean items. */
function toList(answer: string): string[] {
  return answer
    .split(/\r?\n|[;,]/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'none')
    .slice(0, 12)
}

/**
 * Build a {@link BugReport} from the per-step answers. All content is grounded
 * in what the model reported about the image; severity stays "Unknown" (a
 * screenshot alone does not establish severity), and missingInformation always
 * reminds the reviewer this is a draft.
 */
function assembleReport(
  answers: Record<string, string>,
  userContext: string,
): BugReport {
  const description = (answers.description ?? '').trim()
  const errorsRaw = (answers.errors ?? '').trim()
  // Drop instruction echoes / "none" answers before deciding whether real
  // error text was actually read.
  const errorsClean = isNoneAnswer(errorsRaw) ? '' : sanitizeErrors(errorsRaw)
  const hasErrors = errorsClean.length > 0

  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? ''
  const title = firstSentence
    ? truncate(firstSentence, 90)
    : 'Screenshot review (draft)'

  const missing = [
    'Steps to reproduce the issue.',
    'Expected vs. actual behavior.',
    'Environment (browser, OS, app version).',
  ]
  if (!userContext.trim()) {
    missing.unshift('What specifically is wrong — no user context was provided.')
  }

  return {
    title,
    description: description || 'The model did not return a usable description. Please describe the screenshot manually.',
    visibleErrors: hasErrors ? errorsClean : '',
    affectedElements: toList(answers.elements ?? ''),
    severity: 'Unknown',
    missingInformation: missing,
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
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
      void generate(data.image, data.userContext)
      break
    case 'interrupt':
      stoppingCriteria?.interrupt()
      break
  }
})
