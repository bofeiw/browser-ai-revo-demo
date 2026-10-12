/**
 * Deterministic keyword search — the non-AI comparison baseline.
 *
 * This is a straightforward, honest lexical matcher so users can see where
 * literal matching helps and where it falls short compared to semantic search.
 * It is intentionally reasonable, NOT sabotaged: it does case-insensitive
 * tokenization, light stemming (plural/`-ing`/`-ed` stripping), and a small
 * TF-style score with a phrase-match bonus. What it fundamentally cannot do is
 * match different *wording* for the same meaning — and that is exactly the
 * point of the comparison.
 */

import { embeddableText, type SearchResult, type TicketDoc } from './types'

/** A tiny English stop-word list so common words don't dominate scoring. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how',
  'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or',
  'so', 'that', 'the', 'their', 'then', 'there', 'they', 'this', 'to', 'too',
  'was', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
])

/** Lowercase, strip punctuation, and split into word tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Very light stemming so "profiles" matches "profile", "saving" matches "save",
 * etc. This is deliberately crude but symmetric (applied to both the query and
 * the documents), so it helps keyword search rather than handicapping it.
 */
function stem(token: string): string {
  let t = token
  if (t.length > 4 && t.endsWith('ing')) t = t.slice(0, -3)
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2)
  else if (t.length > 3 && t.endsWith('es')) t = t.slice(0, -2)
  else if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1)
  return t
}

/** Content tokens (stop-words removed, stemmed) for a piece of text. */
function contentTokens(text: string): string[] {
  return tokenize(text)
    .filter((t) => !STOP_WORDS.has(t))
    .map(stem)
}

/**
 * Score a document against the query terms. The score combines:
 *  - the fraction of distinct query terms that appear in the document
 *    (so matching more of the query ranks higher), and
 *  - a small bonus for repeated occurrences and for an exact phrase hit.
 * Normalized into roughly [0, 1] so it is comparable across documents.
 */
function scoreDoc(doc: TicketDoc, queryTerms: string[], rawQuery: string): number {
  if (queryTerms.length === 0) return 0

  const haystackRaw = `${doc.title} ${doc.description}`.toLowerCase()
  const docTokens = contentTokens(embeddableText(doc))
  const counts = new Map<string, number>()
  for (const t of docTokens) counts.set(t, (counts.get(t) ?? 0) + 1)

  const distinctQueryTerms = new Set(queryTerms)
  let matchedTerms = 0
  let occurrenceBonus = 0
  for (const term of distinctQueryTerms) {
    const c = counts.get(term) ?? 0
    if (c > 0) {
      matchedTerms++
      // Diminishing returns for repeats (log-ish, bounded).
      occurrenceBonus += Math.min(0.15, (c - 1) * 0.05)
    }
  }

  if (matchedTerms === 0) return 0

  const coverage = matchedTerms / distinctQueryTerms.size
  // Exact phrase appearing verbatim is a strong literal signal.
  const phraseBonus = rawQuery.trim().length > 2 && haystackRaw.includes(rawQuery.trim().toLowerCase())
    ? 0.25
    : 0

  return Math.min(1, coverage + occurrenceBonus + phraseBonus)
}

/**
 * Rank documents by literal keyword overlap with the query, highest first.
 * Only documents with at least one matching term are returned (a literal
 * matcher that matches nothing should return nothing), capped at `topK`.
 */
export function keywordSearch(
  query: string,
  docs: TicketDoc[],
  topK: number,
): SearchResult[] {
  const queryTerms = contentTokens(query)
  if (queryTerms.length === 0) return []

  const results: SearchResult[] = docs
    .map((doc) => ({
      doc,
      score: scoreDoc(doc, queryTerms, query),
      mode: 'keyword' as const,
    }))
    .filter((r) => r.score > 0)

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}
