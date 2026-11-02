/**
 * Term extraction for the notebook.
 *
 * The dashboard needs a word-frequency view, and the chat assistant needs to be
 * able to answer "which words do I use most". Both are the same primitive: count
 * terms across text.
 *
 * Chinese has no spaces, so this works on character bigrams; Latin text is split
 * on word boundaries. A stop list removes function characters and common English
 * words, which is what keeps bigram noise out of the ranking. This is a
 * descriptive tally, not a tokenizer for anything semantic.
 */

/** Characters that carry no topic on their own. */
const CJK_STOP = new Set(
  '的了着过是在有和与及或就都也不很会要对他她它们这那我你其之为以于而但所被把从向并等个中上下前后里外时年月日一二三四五六七八九十'.split(''),
)

/** Common English words that would otherwise dominate every tally. */
const LATIN_STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'not',
  'are', 'was', 'were', 'you', 'your', 'but', 'all', 'can', 'has', 'had', 'how',
  'what', 'when', 'which', 'their', 'its', 'our', 'use', 'used', 'using', 'into',
  'than', 'then', 'them', 'they', 'there', 'here', 'also', 'more', 'most', 'some',
  'any', 'each', 'other', 'only', 'over', 'such', 'about', 'been', 'because',
  'would', 'could', 'should', 'does', 'did', 'doing', 'done', 'just', 'like',
  'make', 'made', 'much', 'many', 'very', 'well', 'need', 'needs', 'want',
])

const CJK_RUN = /[\u4e00-\u9fff]+/g
const LATIN_RUN = /[a-z][a-z0-9+#.-]+/gi

/**
 * Rank terms by frequency across `texts`.
 *
 * `limit` caps the result; `minCount` drops one-offs, which matters once there are
 * enough notes that a single occurrence is noise.
 */
export function topTerms(texts, { limit = 12, minCount = 1, minLatinLength = 2 } = {}) {
  const counts = new Map()
  const bump = (term) => {
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }

  for (const raw of Array.isArray(texts) ? texts : []) {
    const text = String(raw ?? '')
    if (text === '') continue

    for (const run of text.match(CJK_RUN) ?? []) {
      // Two-character units, stepped by two: adjacent pairs without the
      // overlapping windows that otherwise dominate the tally.
      let index = 0
      while (index + 1 < run.length) {
        const pair = run.slice(index, index + 2)
        if (CJK_STOP.has(pair[0]) || CJK_STOP.has(pair[1])) {
          // A stop character ends the current word; realign and continue.
          index += 1
          continue
        }
        bump(pair)
        index += 2
      }
    }

    for (const word of text.match(LATIN_RUN) ?? []) {
      const lower = word.toLowerCase().replace(/[.-]+$/, '')
      if (lower.length < minLatinLength) continue
      if (LATIN_STOP.has(lower)) continue
      bump(lower)
    }
  }

  return [...counts.entries()]
    .filter(([, value]) => value >= minCount)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}
