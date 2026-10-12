/**
 * Prompt construction for bug-report generation.
 *
 * SmolVLM-500M is a very small model. Asking it for one large JSON object with
 * a six-field schema reliably triggers two failure modes documented for small
 * VLMs: hallucinated content (it drifts into its training distribution) and
 * repetition degeneration (it gets stuck looping a token). "Prompting harder"
 * does not fix this.
 *
 * Instead we ask a few short, focused questions — the kind small VLMs actually
 * handle well — and assemble the structured report deterministically in code
 * (see worker.ts). Each prompt targets exactly one thing and keeps the expected
 * answer short, which both improves grounding and limits room to loop.
 */

/** A single focused question put to the model about the screenshot. */
export interface AnalysisStep {
  key: 'description' | 'errors' | 'elements'
  prompt: string
  /** Upper bound on generated tokens for this step. */
  maxNewTokens: number
}

/**
 * Build the ordered list of questions for one analysis.
 *
 * The user's optional context is appended only to the first (description)
 * question as a gentle hint, and is explicitly framed as a user claim so the
 * model does not treat it as established fact.
 */
export function buildAnalysisSteps(userContext: string): AnalysisStep[] {
  const trimmed = userContext.trim()
  const hint = trimmed
    ? ` The user mentioned: "${trimmed}". Only note it if you can actually see something related; do not assume it is true.`
    : ''

  return [
    {
      key: 'description',
      // Concrete, naming-oriented question. Asking the model to *name* what it
      // sees (headings, the current screen, highlighted state) grounds it far
      // better than an open "describe the screenshot", which small models tend
      // to answer with a vague one-line summary.
      prompt:
        'Describe what you see in this screenshot of a web app in 2-4 sentences. What is the page title, what is the main area for, and is anything shown in red or marked as a problem? Describe only what is visible.' +
        hint,
      maxNewTokens: 180,
    },
    {
      key: 'errors',
      // Do NOT include in-prompt examples of error text: small VLMs copy the
      // example into their answer instead of reading the image. Keep it a plain
      // question whose answer is the on-screen text itself.
      prompt:
        'What does the red or error text in this image say? Answer with that text only. If there is no red or error text, answer: NONE.',
      maxNewTokens: 96,
    },
    {
      key: 'elements',
      // No example labels here either — a sample list ("Save button, Email
      // field, ...") gets copied verbatim by small models. Just ask the
      // question plainly.
      prompt:
        'What are the button labels and field labels visible in this image? Answer with a short comma-separated list of the labels you can actually read.',
      maxNewTokens: 96,
    },
  ]
}
