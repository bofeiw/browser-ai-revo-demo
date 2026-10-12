/**
 * Type definitions for the AI Background Remover.
 *
 * Three concerns are kept separate:
 *  1. The Hugging Face model id (single source of truth, shared by worker + UI).
 *  2. The messages exchanged with the inference Web Worker.
 *  3. Per-file download progress for the model status UI.
 */

/**
 * Hugging Face model id used for background removal.
 *
 * `briaai/RMBG-1.4` is BRIA AI's IS-Net-based *saliency segmentation* model. It
 * predicts a single-channel foreground alpha matte for a broad range of subjects
 * (products / e-commerce, people, animals, everyday objects), which is why it was
 * chosen over the portrait-only MODNet. It ships ONNX weights tagged for
 * Transformers.js and is used by several published browser demos.
 *
 * LICENSE — IMPORTANT: RMBG v1.4 is released under BRIA's `bria-rmbg-1.4`
 * license (Creative Commons, **non-commercial use only**). Commercial use
 * requires a separate agreement with BRIA. This demo is a non-commercial proof
 * of concept; see the README for details and a commercial-friendly alternative
 * (`Xenova/modnet`, Apache-2.0, portrait-only).
 *   https://huggingface.co/briaai/RMBG-1.4
 */
export const MODEL_ID = 'briaai/RMBG-1.4'

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

/**
 * The alpha matte the worker produces for an image, transferred back to the UI.
 *
 * It is a single-channel (grayscale) mask already resized to the original image
 * dimensions, so the UI can composite it against the original pixels at full
 * resolution. `data` is a plain `Uint8ClampedArray` of length `width * height`
 * (0 = fully transparent background, 255 = fully opaque foreground), sent via a
 * transferable `ArrayBuffer` to avoid a copy.
 */
export interface AlphaMask {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Messages sent from the UI thread to the worker. */
export type WorkerRequest =
  | { type: 'check' }
  | { type: 'load' }
  | {
      type: 'segment'
      /** Monotonic id so stale results can be discarded by the UI. */
      requestId: number
      /** Object URL (or data URL) for the image to segment. */
      image: string
      /** Original image dimensions — the mask is resized back to these. */
      width: number
      height: number
    }

/** Messages sent from the worker back to the UI thread. */
export type WorkerResponse =
  | { status: 'check-result'; webgpu: boolean }
  | { status: 'loading'; message: string }
  | { status: 'progress'; file: ModelFileProgress }
  | { status: 'ready'; device: InferenceDevice }
  | { status: 'segmenting'; device: InferenceDevice; requestId: number }
  /** The finished alpha matte for `requestId`, resized to the original image. */
  | { status: 'complete'; requestId: number; mask: AlphaMask }
  | { status: 'error'; requestId: number | null; message: string }
