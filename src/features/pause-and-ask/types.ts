/**
 * Type definitions for the Pause & Ask feature.
 *
 * Three separate concerns are kept apart here:
 *  1. The inference Web Worker message protocol (request / response).
 *  2. The device/support information surfaced to the UI.
 *  3. Small shared value types (captured frame, chat answer).
 */

/** Device the model ended up running on. */
export type InferenceDevice = 'webgpu' | 'wasm'

/** Per-file download progress emitted by Transformers.js. */
export interface ModelFileProgress {
  file: string
  /** 0–100, present once the total size is known. */
  progress?: number
  loaded?: number
  total?: number
}

/**
 * A still frame captured from the live camera. The frame is kept as a data URL
 * (encoded PNG/JPEG) so it can be passed to the worker, previewed in an <img>,
 * and re-used for multiple questions without touching the live stream again.
 */
export interface CapturedFrame {
  /** Data URL (e.g. "data:image/jpeg;base64,…") of the frozen frame. */
  dataUrl: string
  width: number
  height: number
  /** Monotonic id so the UI can tell one capture apart from the next. */
  id: number
}

/**
 * What a given inference run is for. VQA answers a user question about the
 * paused frame; "caption" produces a short description for the optional Live
 * AI Description mode. Both use the same underlying model.
 */
export type InferenceKind = 'vqa' | 'caption'

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

/** Messages sent from the UI thread to the worker. */
export type WorkerRequest =
  | { type: 'check' }
  | { type: 'load' }
  | {
      type: 'generate'
      /** Correlates the response with the request that produced it. */
      requestId: number
      kind: InferenceKind
      /** Data URL for the captured frame to analyze. */
      image: string
      /** The user question (VQA) or caption instruction. */
      prompt: string
    }
  | { type: 'interrupt' }

/** Messages sent from the worker back to the UI thread. */
export type WorkerResponse =
  | { status: 'check-result'; webgpu: boolean; fp16: boolean }
  | { status: 'loading'; message: string }
  | { status: 'progress'; file: ModelFileProgress }
  | { status: 'ready'; device: InferenceDevice }
  | { status: 'generating'; requestId: number; kind: InferenceKind; device: InferenceDevice }
  /** Streamed partial text for the active generation. */
  | {
      status: 'token'
      requestId: number
      kind: InferenceKind
      text: string
      tokensPerSecond: number | null
    }
  /** Final assembled answer text for the active generation. */
  | { status: 'complete'; requestId: number; kind: InferenceKind; text: string }
  | { status: 'error'; requestId: number | null; kind: InferenceKind | null; message: string }
