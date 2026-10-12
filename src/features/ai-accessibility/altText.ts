/**
 * Alt-text post-processing.
 *
 * IMPORTANT — honest capability boundary:
 * Florence-2 is a *task-prompted captioning* model, not an instruction-following
 * VLM. It cannot be given free-form directions like "describe this as a product
 * photo" and have them influence the generated caption. Its model card only
 * documents fixed task tokens (`<CAPTION>`, `<DETAILED_CAPTION>`,
 * `<MORE_DETAILED_CAPTION>`). See:
 *   https://huggingface.co/onnx-community/Florence-2-base-ft
 *
 * So we do NOT feed the user's "image context" to the model and pretend it was
 * understood. Instead:
 *   1. The model produces a plain visual caption from the pixels only.
 *   2. We clean that caption into alt-text-appropriate phrasing in code
 *      (strip "Image of…"/"A picture of…", trim, de-pad).
 *   3. The optional context is applied as a transparent, in-code suggestion —
 *      it never changes what the model "saw". The UI labels this clearly.
 *
 * This keeps the model output honest and the editing workflow transparent.
 */

/**
 * Leading phrases a screen reader shouldn't hear ("Image of a cat" → "A cat").
 * WCAG/WAI guidance is that alt text should not start with "image of" or
 * "picture of" because the assistive tech already announces it as an image.
 * https://www.w3.org/WAI/tutorials/images/
 */
const REDUNDANT_PREFIXES = [
  /^the image shows\s+/i,
  /^this image shows\s+/i,
  /^the image depicts\s+/i,
  /^image showing\s+/i,
  /^image of\s+/i,
  /^an image of\s+/i,
  /^a image of\s+/i,
  /^picture of\s+/i,
  /^a picture of\s+/i,
  /^picture showing\s+/i,
  /^a photo of\s+/i,
  /^photo of\s+/i,
  /^a photograph of\s+/i,
  /^there is\s+/i,
  /^there are\s+/i,
]

/**
 * Clean a raw Florence-2 caption into alt-text-appropriate phrasing.
 *
 * - Collapses whitespace (Florence-2 sometimes emits a trailing space/newline).
 * - Strips redundant "Image of…" style openers.
 * - Re-capitalizes the first letter and ensures a single trailing period.
 *
 * We intentionally do NOT truncate to an arbitrary character limit: some images
 * genuinely need more words than others. Conciseness is encouraged by offering
 * a "concise" detail level, not by hard-cutting the model's output.
 */
export function cleanCaption(raw: string): string {
  let text = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''

  // Strip a redundant opener (only the first match — captions rarely stack them).
  for (const prefix of REDUNDANT_PREFIXES) {
    if (prefix.test(text)) {
      text = text.replace(prefix, '')
      break
    }
  }

  text = text.trim()
  if (!text) return ''

  // Capitalize first letter.
  text = text.charAt(0).toUpperCase() + text.slice(1)

  // Normalize trailing punctuation to a single period.
  text = text.replace(/[.\s]+$/, '')
  if (text) text += '.'

  return text
}

/**
 * Apply the optional user context to a cleaned caption as a TRANSPARENT,
 * in-code suggestion — not as model-understood instruction.
 *
 * We keep this deliberately simple and visible: the model's visual description
 * is preserved verbatim, and the user's note about how the image is used is
 * appended as a parenthetical purpose hint for the human reviewer to fold in.
 * The user is expected to edit the final text; this is a starting point, not a
 * context-aware generation.
 *
 * Returns the caption unchanged when no context is supplied.
 */
export function applyContext(caption: string, context: string): string {
  const ctx = context.trim()
  if (!ctx || !caption) return caption

  // Avoid duplicating a note the model already happens to include.
  if (caption.toLowerCase().includes(ctx.toLowerCase())) return caption

  const base = caption.replace(/\.\s*$/, '')
  const hint = ctx.replace(/\.\s*$/, '')
  return `${base} — used as: ${hint}.`
}

/** Count characters the way the UI displays them (post-trim, Unicode-aware). */
export function characterCount(text: string): number {
  // Array spread counts code points, so emoji/combined glyphs count as 1.
  return [...text].length
}
