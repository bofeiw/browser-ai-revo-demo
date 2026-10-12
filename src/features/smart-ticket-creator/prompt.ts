/**
 * Prompt construction for ticket generation.
 *
 * Transformers.js runs ONNX models and does **not** support constrained /
 * grammar-based decoding (that is a WebLLM + XGrammar capability). So instead of
 * forcing the grammar, we lean on Qwen2.5-Instruct's documented strength at
 * following instructions and emitting JSON, and then validate the result with
 * Zod in code (see worker.ts). The prompt therefore has to be unambiguous about
 * the exact shape and about the honesty rules.
 *
 * The chat messages are kept separate from the worker so the "AI behavior"
 * policy lives in one readable place.
 */

import { PRIORITIES, TICKET_TYPES } from './types'

/** A single chat message in the format Transformers.js expects. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * The system prompt encodes the whole policy:
 *  - the exact JSON shape (keys, types, allowed enum values),
 *  - the "do not invent facts" rules (no fabricated browser, no inferred
 *    backend crash, cautious priority),
 *  - the instruction to separate facts from assumptions and to surface missing
 *    information rather than guessing it.
 */
const SYSTEM_PROMPT = `You are a careful issue-tracking assistant. You convert a messy, informal user complaint into one structured issue ticket.

Return ONLY a single JSON object. No markdown, no code fences, no commentary before or after it.

The JSON object must have exactly these keys:
{
  "title": string,              // concise, actionable summary (max ~90 chars)
  "description": string,        // clear, professional restatement of the problem
  "type": ${JSON.stringify([...TICKET_TYPES])},
  "priority": ${JSON.stringify([...PRIORITIES])},
  "expectedBehavior": string,   // what the user expected; "" if not stated
  "actualBehavior": string,     // what the user observed; "" if not stated
  "stepsToReproduce": string[], // only steps the user actually mentioned
  "missingInformation": string[]// questions a developer would need answered
}

Rules you MUST follow:
- Rewrite informal, emotional text into neutral, professional language.
- Remove repetition, insults, and venting. Keep every concrete technical detail.
- Preserve specific facts exactly (e.g. "clicked Save five times", "happened twice today", "had to refresh").
- Do NOT invent facts. If the user never says their browser, OS, URL, or account, do not state one — instead add it as a question under missingInformation.
- Do NOT escalate a described symptom into a cause. "The page froze" does not mean "the backend crashed".
- Set priority cautiously and ONLY from real evidence of impact (data loss, blocked work, many users). The user saying "urgent" or "annoying" is NOT enough on its own — prefer "Medium" or "Unknown".
- Use "Unknown" for priority and "Other" for type when there is not enough information.
- Use "" for unknown string fields and [] for unknown lists. Never write "N/A" or make something up.
- stepsToReproduce must contain only steps that are stated or clearly implied, as short imperative phrases.

Output the JSON object only.`

/**
 * A worked example (one-shot). A 0.5B model follows a concrete input→output
 * demonstration far more reliably than a list of rules alone: it anchors the
 * exact JSON shape, shows facts being preserved ("three times"), a cautious
 * priority despite emotive wording, and a missing-info question instead of an
 * invented browser. The complaint here is deliberately different from the app's
 * built-in examples so it steers the format without leaking into real answers.
 */
const EXAMPLE_COMPLAINT =
  'ugh the search bar is useless, i type a product name and hit enter and it just spins forever, tried it three times. pls fix'

const EXAMPLE_TICKET = JSON.stringify({
  title: 'Search does not return results; spinner never resolves',
  description:
    'When a product name is entered and submitted, the search does not complete — a loading spinner continues indefinitely instead of showing results.',
  type: 'Bug',
  priority: 'Medium',
  expectedBehavior: 'Submitting a search returns matching products.',
  actualBehavior: 'The search shows a spinner that never finishes and no results appear.',
  stepsToReproduce: [
    'Type a product name in the search bar',
    'Press Enter',
    'Observe the spinner continue indefinitely',
  ],
  missingInformation: [
    'Which browser and operating system?',
    'Does it affect all search terms or specific ones?',
    'Are there any console or network errors?',
  ],
})

/**
 * Build the chat messages for one generation. A system prompt sets the policy,
 * a one-shot example fixes the format, then the real complaint is passed.
 */
export function buildMessages(complaint: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Convert this complaint into the JSON ticket:\n\n"""\n${EXAMPLE_COMPLAINT}\n"""`,
    },
    { role: 'assistant', content: EXAMPLE_TICKET },
    {
      role: 'user',
      content: `Convert this complaint into the JSON ticket:\n\n"""\n${complaint.trim()}\n"""`,
    },
  ]
}

/**
 * A shorter, firmer retry prompt used when the first attempt did not yield
 * parseable JSON. It restates only the hard requirement (one JSON object, these
 * keys) to nudge the model back on track without a remote repair step.
 */
export function buildRetryMessages(complaint: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Output ONE JSON object and nothing else. No prose, no code fences.
Keys: "title" (string), "description" (string), "type" (one of ${JSON.stringify([...TICKET_TYPES])}), "priority" (one of ${JSON.stringify([...PRIORITIES])}), "expectedBehavior" (string), "actualBehavior" (string), "stepsToReproduce" (string array), "missingInformation" (string array).
Use "" for unknown strings and [] for unknown lists. Do not invent facts.`,
    },
    {
      role: 'user',
      content: `Complaint:\n"""\n${complaint.trim()}\n"""`,
    },
  ]
}
