/**
 * Type definitions for the Screenshot Bug Reporter feature.
 *
 * These cover three concerns that are intentionally kept separate:
 *  1. The structured bug report the model is asked to produce.
 *  2. The messages exchanged with the inference Web Worker.
 *  3. The high-level status the UI renders.
 */

/** Suggested severity for a report. "Unknown" is the honest default. */
export type Severity = 'Low' | 'Medium' | 'High' | 'Unknown'

export const SEVERITIES: readonly Severity[] = ['Low', 'Medium', 'High', 'Unknown']

/**
 * A structured, human-editable bug report draft.
 *
 * Every field is a plain string (or string list) so the UI can bind directly
 * to editable inputs. The report is explicitly a *draft*: the model is prompted
 * to separate what is observable from what is only reported or hypothesized,
 * and to say so when information is missing.
 */
export interface BugReport {
  /** Concise summary of the suspected issue. */
  title: string
  /** What is actually visible in the screenshot. */
  description: string
  /** Exact text of any readable error/warning messages ("" if none). */
  visibleErrors: string
  /** UI elements that appear relevant (buttons, fields, dialogs, ...). */
  affectedElements: string[]
  /** Model's severity guess. Defaults to "Unknown" when unclear. */
  severity: Severity
  /** Details a human would need to investigate properly. */
  missingInformation: string[]
}

/** The fields of a {@link BugReport} that hold free-form text. */
export type BugReportTextField =
  | 'title'
  | 'description'
  | 'visibleErrors'

/** The fields of a {@link BugReport} that hold string lists. */
export type BugReportListField = 'affectedElements' | 'missingInformation'

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

/** Messages sent from the UI thread to the worker. */
export type WorkerRequest =
  | { type: 'check' }
  | { type: 'load' }
  | {
      type: 'generate'
      /** Object URL (or data URL) for the screenshot to analyze. */
      image: string
      /** Optional user-supplied context, e.g. "The Save button does nothing". */
      userContext: string
    }
  | { type: 'interrupt' }

/** Device the model ended up running on. */
export type InferenceDevice = 'webgpu' | 'wasm'

/** Which analysis step is currently running (for progress labelling). */
export type AnalysisStepKey = 'description' | 'errors' | 'elements'

/** Messages sent from the worker back to the UI thread. */
export type WorkerResponse =
  | { status: 'check-result'; webgpu: boolean; fp16: boolean }
  | { status: 'loading'; message: string }
  | { status: 'progress'; file: ModelFileProgress }
  | { status: 'ready'; device: InferenceDevice }
  | { status: 'generating'; device: InferenceDevice }
  /** A new analysis step started. `index`/`total` drive a step counter. */
  | { status: 'step'; step: AnalysisStepKey; index: number; total: number }
  /** Streamed partial text for the current step. */
  | { status: 'token'; text: string; tokensPerSecond: number | null }
  /** Final assembled report, built deterministically from the step answers. */
  | { status: 'complete'; report: BugReport }
  | { status: 'error'; message: string }
