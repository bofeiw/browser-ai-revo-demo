/**
 * Type definitions for the AI Accessibility — Local Alt Text Generator.
 *
 * Three concerns are kept separate:
 *  1. The caption "detail" level the user can choose.
 *  2. The messages exchanged with the inference Web Worker.
 *  3. Per-file download progress for the model status UI.
 */

/**
 * Florence-2 is a *task-prompted* captioning model, not an instruction-following
 * VLM. It only responds to a fixed set of task tokens. For alt text we expose
 * its three caption tasks and map them to friendlier labels in the UI.
 *
 *  - `<CAPTION>`              — a short, one-line description.
 *  - `<DETAILED_CAPTION>`     — a fuller sentence or two.
 *  - `<MORE_DETAILED_CAPTION>`— the most descriptive output.
 *
 * See the Florence-2 model card:
 * https://huggingface.co/onnx-community/Florence-2-base-ft
 */
/**
 * Hugging Face model id used for alt-text generation. Single source of truth,
 * imported by both the worker (to load it) and the UI (to display it).
 */
export const MODEL_ID = 'onnx-community/Florence-2-base-ft'

export type CaptionDetail = 'concise' | 'detailed' | 'rich'

/** Maps a UI detail level to the exact Florence-2 task token. */
export const CAPTION_TASKS: Record<CaptionDetail, string> = {
  concise: '<CAPTION>',
  detailed: '<DETAILED_CAPTION>',
  rich: '<MORE_DETAILED_CAPTION>',
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

/** Messages sent from the UI thread to the worker. */
export type WorkerRequest =
  | { type: 'check' }
  | { type: 'load' }
  | {
      type: 'generate'
      /** Object URL (or data URL) for the image to caption. */
      image: string
      /** Which Florence-2 caption task to run. */
      detail: CaptionDetail
    }
  /** Drop the cached vision inputs so the next image is re-encoded. */
  | { type: 'reset-image' }

/** Messages sent from the worker back to the UI thread. */
export type WorkerResponse =
  | { status: 'check-result'; webgpu: boolean; fp16: boolean }
  | { status: 'loading'; message: string }
  | { status: 'progress'; file: ModelFileProgress }
  | { status: 'ready'; device: InferenceDevice }
  | { status: 'generating'; device: InferenceDevice }
  /** Final caption text, straight from the model (before any post-processing). */
  | { status: 'complete'; caption: string; detail: CaptionDetail }
  | { status: 'error'; message: string }
