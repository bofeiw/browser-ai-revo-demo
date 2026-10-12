/**
 * Type definitions and validation schema for the Smart Ticket Creator.
 *
 * Three concerns are kept intentionally separate:
 *  1. The structured ticket the model is asked to produce (type + Zod schema).
 *  2. The messages exchanged with the inference Web Worker.
 *  3. The high-level status the UI renders.
 *
 * The Zod schema is the single source of truth for the ticket shape: the model
 * output is parsed and validated against it, and the TypeScript `Ticket` type is
 * inferred from it so the two can never drift apart.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Ticket category. "Other" is the honest fallback when it is unclear. */
export const TICKET_TYPES = ['Bug', 'Feature Request', 'Improvement', 'Other'] as const
export type TicketType = (typeof TICKET_TYPES)[number]

/**
 * Suggested priority. "Unknown" is the default — the model is told to only
 * raise priority when there is actual evidence of impact, not emotion.
 */
export const PRIORITIES = ['Low', 'Medium', 'High', 'Unknown'] as const
export type Priority = (typeof PRIORITIES)[number]

// ---------------------------------------------------------------------------
// Ticket schema (source of truth)
// ---------------------------------------------------------------------------

/**
 * Zod schema for a generated ticket. Every field is lenient about the *input*
 * (the model may omit fields, send a string where a list is expected, or use a
 * slightly different casing) but normalizes to a strict, predictable shape:
 * strings default to "", lists default to [], and the enums fall back to the
 * honest "Other"/"Unknown" defaults instead of throwing.
 *
 * This leniency is deliberate: a small model's JSON is validated, not trusted,
 * and we would rather coerce a near-miss into a reviewable draft than reject the
 * whole generation over one malformed field.
 */
/**
 * A string-list field that is lenient about shape: a small model sometimes
 * returns a single string (or a comma/newline-joined one) where an array was
 * asked for. Rather than reject the whole ticket, coerce such near-misses into a
 * list; anything genuinely unusable becomes [].
 */
const stringList = z
  .union([z.array(z.unknown()), z.string()])
  .transform((value): string[] => {
    const items = Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v : String(v ?? '')))
      : value.split(/\r?\n|(?<=[.!?])\s+/)
    return items.map((s) => s.trim()).filter((s) => s.length > 0)
  })
  .catch([])
  .default([])

export const ticketSchema = z.object({
  /** Concise, actionable summary. */
  title: z.string().catch('').default(''),
  /** Clear, professional restatement of the reported problem. */
  description: z.string().catch('').default(''),
  /** Category of the ticket. */
  type: z.enum(TICKET_TYPES).catch('Other'),
  /** Cautious priority suggestion. */
  priority: z.enum(PRIORITIES).catch('Unknown'),
  /** What the user expected to happen, if stated. "" when unknown. */
  expectedBehavior: z.string().catch('').default(''),
  /** What the user actually observed. "" when unknown. */
  actualBehavior: z.string().catch('').default(''),
  /** Only steps explicitly mentioned or clearly extractable. */
  stepsToReproduce: stringList,
  /** Questions a developer would need answered to investigate. */
  missingInformation: stringList,
})

/** A structured, human-editable issue ticket. */
export type Ticket = z.infer<typeof ticketSchema>

/** The {@link Ticket} fields holding a single free-form string. */
export type TicketTextField =
  | 'title'
  | 'description'
  | 'expectedBehavior'
  | 'actualBehavior'

/** The {@link Ticket} fields holding a list of strings. */
export type TicketListField = 'stepsToReproduce' | 'missingInformation'

/** An empty ticket used as a safe starting point for the editor. */
export function emptyTicket(): Ticket {
  return {
    title: '',
    description: '',
    type: 'Other',
    priority: 'Unknown',
    expectedBehavior: '',
    actualBehavior: '',
    stepsToReproduce: [],
    missingInformation: [],
  }
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
      /** The raw, unstructured complaint typed by the user. */
      complaint: string
    }
  | { type: 'interrupt' }

/** Messages sent from the worker back to the UI thread. */
export type WorkerResponse =
  | { status: 'check-result'; webgpu: boolean; fp16: boolean }
  | { status: 'loading'; message: string }
  | { status: 'progress'; file: ModelFileProgress }
  | { status: 'ready'; device: InferenceDevice }
  | { status: 'generating'; device: InferenceDevice }
  /** Streamed partial text while the model emits its JSON. */
  | { status: 'token'; text: string; tokensPerSecond: number | null }
  /** Final validated ticket plus the raw model text (for transparency). */
  | { status: 'complete'; ticket: Ticket; raw: string }
  | { status: 'error'; message: string }
