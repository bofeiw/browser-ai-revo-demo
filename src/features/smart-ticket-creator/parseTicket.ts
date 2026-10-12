/**
 * Turn a small model's raw text output into a validated {@link Ticket}.
 *
 * Small instruction-tuned models usually produce valid JSON for this task, but
 * not always: they may wrap it in ```json fences, add a sentence before it, or
 * trail off after it. This module recovers the JSON object defensively and then
 * validates it with the Zod schema — never trusting the model's shape.
 *
 * Everything here is pure and local. There is deliberately no remote "repair"
 * step: if we cannot extract a valid object, the caller retries locally or
 * surfaces an error.
 */

import { ticketSchema, type Ticket } from './types'

export interface ParseSuccess {
  ok: true
  ticket: Ticket
}

export interface ParseFailure {
  ok: false
  /** Human-readable reason, used for the retry decision and error display. */
  reason: string
}

export type ParseResult = ParseSuccess | ParseFailure

/**
 * Extract the first balanced top-level JSON object from arbitrary text.
 *
 * We scan for the first `{` and walk forward tracking brace depth while
 * respecting string literals and escapes, so a `}` inside a string value does
 * not end the object prematurely. Returns the substring of the first complete
 * object, or null if none is found.
 */
export function extractJsonObject(text: string): string | null {
  // Strip code fences up front — models love to wrap JSON in ```json ... ```.
  const unfenced = text.replace(/```(?:json)?/gi, '')

  const start = unfenced.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return unfenced.slice(start, i + 1)
      }
    }
  }

  // Unterminated object (model was cut off / ran out of tokens).
  return null
}

/**
 * Detect a degenerate "stuck token" loop (e.g. "!!!!!!…", "AAAA…", ": : : …").
 *
 * This is the signature of a logit collapse — most notably the f16 overflow in
 * q4f16 models on the ONNX Runtime WebGPU backend, which makes the model emit
 * token 0 ("!") indefinitely. We flag it so the UI can give an accurate reason
 * instead of a misleading "no JSON found".
 */
export function isDegenerateLoop(text: string): boolean {
  const t = text.trim()
  if (t.length < 24) return false

  // Count non-space characters; if a single char dominates the output, or the
  // output is almost entirely punctuation/symbols, treat it as degenerate.
  const chars = t.replace(/\s+/g, '')
  if (chars.length < 24) return false

  const counts = new Map<string, number>()
  for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const maxCount = Math.max(...counts.values())
  if (maxCount / chars.length > 0.6) return true

  // A long run of a single repeated character anywhere in the output.
  if (/(.)\1{19,}/.test(t)) return true

  return false
}

/**
 * Best-effort cleanup for the common malformations that otherwise make
 * `JSON.parse` throw: trailing commas before a closing brace/bracket, and
 * "smart" quotes substituted for ASCII quotes.
 */
function repairCommonJsonIssues(json: string): string {
  return json
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes -> "
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes -> '
    .replace(/,\s*([}\]])/g, '$1') // trailing commas
}

/**
 * Parse and validate raw model text into a {@link Ticket}.
 *
 * Pipeline: extract the JSON object -> JSON.parse (with a light repair retry)
 * -> Zod validation. Zod coerces lenient-but-recognizable output into the
 * strict ticket shape (see `ticketSchema`); only a genuinely unusable payload
 * fails.
 */
export function parseTicket(raw: string): ParseResult {
  // Detect a degenerate output *before* blaming "no JSON". When the model's
  // logits collapse (e.g. the known q4f16/WebGPU f16 overflow), it emits one
  // character forever — "!!!!!…" or "AAAA…". That is a runtime/numeric failure,
  // not a malformed ticket, so report it as such with an actionable hint.
  if (isDegenerateLoop(raw)) {
    return {
      ok: false,
      reason:
        'the model produced a repeating-character loop (a numeric/runtime failure, often the q4f16 WebGPU overflow bug), not a ticket',
    }
  }

  const candidate = extractJsonObject(raw)
  if (!candidate) {
    return { ok: false, reason: 'No JSON object was found in the model output.' }
  }

  let data: unknown
  try {
    data = JSON.parse(candidate)
  } catch {
    try {
      data = JSON.parse(repairCommonJsonIssues(candidate))
    } catch {
      return { ok: false, reason: 'The model output was not valid JSON.' }
    }
  }

  const result = ticketSchema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      reason: 'The JSON did not match the expected ticket shape.',
    }
  }

  return { ok: true, ticket: normalize(result.data) }
}

/**
 * Light post-validation tidy-up: trim strings, drop empty list items, cap the
 * title length, and de-duplicate list entries. Keeps the editor clean without
 * changing meaning.
 */
function normalize(ticket: Ticket): Ticket {
  const cleanList = (items: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of items) {
      const trimmed = item.trim().replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      if (trimmed && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase())
        out.push(trimmed)
      }
    }
    return out
  }

  const title = ticket.title.trim()
  return {
    ...ticket,
    title: title.length > 90 ? title.slice(0, 89).trimEnd() + '…' : title,
    description: ticket.description.trim(),
    expectedBehavior: ticket.expectedBehavior.trim(),
    actualBehavior: ticket.actualBehavior.trim(),
    stepsToReproduce: cleanList(ticket.stepsToReproduce),
    missingInformation: cleanList(ticket.missingInformation),
  }
}
