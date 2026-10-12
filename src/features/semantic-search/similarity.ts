/**
 * Vector similarity for semantic search.
 *
 * The embedding worker returns vectors that are already L2-normalized (the
 * `normalize: true` option on the feature-extraction pipeline). For unit
 * vectors, cosine similarity simplifies to a plain dot product:
 *
 *   cos(a, b) = (a · b) / (‖a‖ ‖b‖)   and   ‖a‖ = ‖b‖ = 1   ⇒   cos(a, b) = a · b
 *
 * We still expose a defensive `cosineSimilarity` that divides by the norms, so
 * the math is correct even if a caller passes un-normalized vectors.
 */

import type { IndexedDoc, SearchResult, TicketDoc } from './types'

/** Dot product of two equal-length vectors. */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i++) sum += a[i] * b[i]
  return sum
}

/** Euclidean (L2) norm of a vector. */
export function norm(a: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i]
  return Math.sqrt(sum)
}

/**
 * Cosine similarity in [-1, 1]. Defensive: it normalizes by the vector norms
 * so it is correct for any input. For the already-normalized vectors this app
 * produces, the division is by ~1 and this equals the dot product.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const na = norm(a)
  const nb = norm(b)
  if (na === 0 || nb === 0) return 0
  return dot(a, b) / (na * nb)
}

/**
 * Rank indexed documents against a query embedding by cosine similarity,
 * highest first. Returns at most `topK` results.
 *
 * The scores are *relative ranking signals* for this query, not calibrated
 * probabilities — see the UI copy. We deliberately do not apply an arbitrary
 * universal relevance threshold.
 */
export function rankBySimilarity(
  queryVector: ArrayLike<number>,
  index: IndexedDoc[],
  topK: number,
): SearchResult[] {
  const scored: SearchResult[] = index.map((entry) => ({
    doc: entry.doc,
    // entry.vector is already normalized; using the defensive cosine here keeps
    // the result identical while staying correct if that ever changes.
    score: cosineSimilarity(queryVector, entry.vector),
    mode: 'semantic' as const,
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

/** Convenience: pull the plain {@link TicketDoc}s out of a result list. */
export function resultsToDocs(results: SearchResult[]): TicketDoc[] {
  return results.map((r) => r.doc)
}
