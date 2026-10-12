/// <reference lib="webworker" />
/**
 * Inference Web Worker for the Smart Ticket Creator.
 *
 * Running the model off the main thread keeps the UI responsive during the
 * (potentially multi-second) load and generation. The worker owns the entire
 * Transformers.js lifecycle and contains no React code.
 *
 * Lifecycle messages (see ./types):
 *   check    -> report WebGPU availability
 *   load     -> lazily download + initialize the model (singleton, reused)
 *   generate -> run one generation; streams tokens, then the validated ticket
 *   interrupt-> stop the current generation early
 *
 * Model: onnx-community/Qwen2.5-1.5B-Instruct — a text-generation model chosen
 * for its documented instruction-following and JSON output quality. It is run
 * via WebGPU (q4f16) when available, falling back to the WASM/CPU backend (q4).
 *
 * Structured output: Transformers.js has no constrained/grammar decoding, so we
 * prompt for JSON, parse + validate it with Zod, and retry once locally if the
 * first attempt is unparseable. There is no remote repair step by design.
 */

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
  type ProgressInfo,
} from '@huggingface/transformers'

import type {
  InferenceDevice,
  ModelFileProgress,
  WorkerRequest,
  WorkerResponse,
} from './types'
import { buildMessages, buildRetryMessages, type ChatMessage } from './prompt'
import { parseTicket } from './parseTicket'

// Qwen2.5-0.5B-Instruct, not the 1.5B sibling. The 1.5B model in `q4` (f32
// activations, the only numerically stable option on WebGPU — see the dtype
// note below) needs ~1.79 GB of weights plus session buffers, which overflows
// available memory on many machines and fails ONNX session creation with
// `std::bad_alloc`. The 0.5B `q4` build is ~786 MB and loads reliably, at the
// cost of some instruction-following quality (mitigated by a firm prompt,
// defensive JSON parsing, and a local retry).
const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

/**
 * Transformers.js tokenizer/model objects are dynamically shaped and the
 * library's published types are loose, so we treat them as opaque here. This is
 * the single, contained use of `any` in the feature.
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
 * Lazy-loaded singleton holding the tokenizer + model. The first `load` triggers
 * the download; subsequent `generate` calls reuse the instances.
 */
class Pipeline {
  private static instance: Pipeline | null = null

  readonly tokenizer: AnyPipe
  readonly model: AnyPipe
  readonly device: InferenceDevice

  private constructor(tokenizer: AnyPipe, model: AnyPipe, device: InferenceDevice) {
    this.tokenizer = tokenizer
    this.model = model
    this.device = device
  }

  static async get(onProgress: (info: ProgressInfo) => void): Promise<Pipeline> {
    if (Pipeline.instance) return Pipeline.instance

    const { webgpu } = await detectWebGpu()
    const device: InferenceDevice = webgpu ? 'webgpu' : 'wasm'
    // Use plain `q4` on BOTH backends (not `q4f16` on WebGPU).
    //
    // q4f16 keeps f16 activations, and f16 overflows to NaN inside the current
    // ONNX Runtime WebGPU kernels for this model — the symptom is a logit
    // collapse that makes the model emit token 0 forever, i.e. an endless
    // "!!!!!" loop with no valid JSON. This is a known ONNX Runtime / WebGPU
    // f16 issue (microsoft/onnxruntime#26732, huggingface/transformers.js#1317),
    // not a prompt or model-quality problem. `q4` keeps 4-bit weights but f32
    // activations, which is numerically stable on WebGPU and still accelerated;
    // the trade-off is a larger download (~1.79 GB vs ~1.22 GB).
    const dtype = 'q4'

    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    })
    const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: onProgress,
    })

    Pipeline.instance = new Pipeline(tokenizer, model, device)
    return Pipeline.instance
  }
}

let stoppingCriteria: InstanceType<typeof InterruptableStoppingCriteria> | null = null

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
    // Warm up: run a 1-token generation to compile WebGPU shaders so the first
    // real request isn't penalized by shader compilation.
    const warm = pipeline.tokenizer('a')
    await pipeline.model.generate({ ...warm, max_new_tokens: 1 })
    reply({ status: 'ready', device: pipeline.device })
  } catch (err) {
    reply({ status: 'error', message: toMessage(err) })
  }
}

/**
 * Run one generation pass for the given chat messages and return the full
 * decoded completion (prompt stripped). Tokens are streamed to the UI as they
 * arrive so the user sees live progress and tokens/second.
 */
async function runOnce(
  pipeline: Pipeline,
  messages: ChatMessage[],
  maxNewTokens: number,
): Promise<string> {
  // Render the chat prompt to a string and *prefill* the assistant turn with an
  // opening brace. This forces the model to start the JSON object immediately
  // instead of prefacing it with "Sure, here is the ticket:" (which is what
  // leaves the output with no parseable `{`). We stitch the "{" back onto the
  // decoded completion afterwards so the parser sees a complete object.
  const promptText: string = pipeline.tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    tokenize: false,
  })
  const prefill = '{'
  const inputs = pipeline.tokenizer(promptText + prefill, {
    add_special_tokens: false,
  })

  stoppingCriteria = new InterruptableStoppingCriteria()

  let startTime: number | null = null
  let numTokens = 0
  let tps: number | null = null

  const streamer = new TextStreamer(pipeline.tokenizer, {
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
    // Deterministic decoding: this is an extraction task, not a creative one,
    // and greedy decoding is the most reliable way to get well-formed JSON.
    do_sample: false,
    // IMPORTANT: do NOT use no_repeat_ngram_size or a strong repetition_penalty
    // here. JSON is inherently repetitive (`", "`, `": "`, `""`, `[]`), and
    // those settings corrupt structured output — blocking the very tokens the
    // grammar requires and pushing the model off valid JSON. We rely on the
    // model stopping at its EOS/<|im_end|> token instead.
    max_new_tokens: maxNewTokens,
    streamer,
    stopping_criteria: stoppingCriteria,
    return_dict_in_generate: true,
  })

  const promptLength: number = inputs.input_ids.dims.at(-1)
  const generatedOnly = output.sequences.slice(null, [promptLength, null])
  const decoded: string[] = pipeline.tokenizer.batch_decode(generatedOnly, {
    skip_special_tokens: true,
  })
  // Re-attach the prefilled "{" so downstream parsing sees the whole object.
  return (prefill + (decoded[0] ?? '')).trim()
}

/**
 * Generate a ticket from a complaint. Validates the model's JSON with Zod and,
 * if the first attempt is unparseable, retries once with a firmer prompt. If
 * both attempts fail, surfaces an error — never a fabricated/hardcoded ticket.
 */
async function generate(complaint: string): Promise<void> {
  try {
    const pipeline = await Pipeline.get(handleProgress)
    reply({ status: 'generating', device: pipeline.device })

    // First attempt with the full policy prompt.
    let raw = await runOnce(pipeline, buildMessages(complaint), 768)
    // Log the raw completion so failures can be diagnosed from the worker
    // console instead of guessing at what the model produced.
    console.debug('[ticket] raw attempt #1:', JSON.stringify(raw))
    let parsed = parseTicket(raw)

    // Local recovery: one firmer retry if the output wasn't valid. No remote
    // model is involved; this stays entirely on-device.
    if (!parsed.ok && !(stoppingCriteria?.interrupted ?? false)) {
      const retryRaw = await runOnce(pipeline, buildRetryMessages(complaint), 768)
      console.debug('[ticket] raw attempt #2:', JSON.stringify(retryRaw))
      const retryParsed = parseTicket(retryRaw)
      raw = retryRaw
      parsed = retryParsed
    }

    if (!parsed.ok) {
      const preview = raw.trim().slice(0, 200)
      reply({
        status: 'error',
        message:
          'The model did not return a valid ticket (' +
          parsed.reason +
          '). This can happen with a small on-device model — try again or rephrase the complaint.' +
          (preview ? `\n\nModel output started with:\n"${preview}${raw.length > 200 ? '…' : ''}"` : '\n\n(The model returned no text.)'),
      })
      return
    }

    reply({ status: 'complete', ticket: parsed.ticket, raw })
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
    case 'generate':
      void generate(data.complaint)
      break
    case 'interrupt':
      stoppingCriteria?.interrupt()
      break
  }
})
