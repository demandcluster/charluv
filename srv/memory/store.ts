import { v4 } from 'uuid'
import { getDb } from '../db/client'
import { embed } from './embed'
import { logger } from '../middleware'
import { classify, isTextLlmConfigured, parseJsonObject } from '../textgen'

// Memory text is user PII (names, preferences, etc.). Logs carry only metadata by
// default; set MEMORY_DEBUG_LOG_TEXT=1 (dev only) to include the text for verification.
const LOG_TEXT = process.env.MEMORY_DEBUG_LOG_TEXT === '1'

/**
 * Long-term relationship memory. Scoped per user + character so memories persist
 * across all chats with that companion. Each document stores its own embedding
 * vector; retrieval loads a character's memories and ranks them by cosine
 * similarity in Node (brute-force — the per-character set is small).
 */
export type LongTermMemory = {
  _id: string
  userId: string
  characterId: string
  text: string
  embedding: number[]
  /** How the memory was created: the model's `remember` tool, automatic, or the
   * user adding it by hand in the memory pane. */
  source: 'tool' | 'auto' | 'manual'
  createdAt: string
}

const collection = () => getDb().collection<LongTermMemory>('longterm-memory')

/**
 * Cosine similarity above which a new fact is treated as a duplicate of an
 * existing one (the same thing said with slightly different words). The
 * all-MiniLM embeddings put genuine paraphrases ~0.85+; distinct facts sit well
 * below, so this only collapses true restatements.
 */
const DUP_SIMILARITY = 0.85

/**
 * Cosine floor for a stored memory to be considered "related" to a new fact and
 * therefore worth examining for redundancy/contradiction. Below this they're
 * about different things and are left untouched (cheap path, no LLM call).
 */
const RELATED_MIN = 0.6

/** Cap on related memories sent to the LLM in one reconciliation prompt. */
const MAX_RECONCILE = 8

type ReconcileDecision = {
  /** A new fact already covered by this existing one; do not store the new fact. */
  skip?: LongTermMemory
  /** Existing memories the new fact makes obsolete (contradicts/updates). */
  removeIds: string[]
  reason?: string
}

/**
 * Decide what to do with a new fact given the existing memories. Asks the text
 * LLM (vLLM, OpenAI-compatible) to compare the new fact against the related
 * ones: which existing facts it makes obsolete (same attribute, new/contradicting
 * value) and whether it's redundant. Falls back to a deterministic cosine
 * near-duplicate skip when the LLM is unconfigured or fails.
 */
async function reconcile(
  text: string,
  embedding: number[],
  docs: LongTermMemory[]
): Promise<ReconcileDecision> {
  const related = docs
    .map((d) => ({ d, score: cosine(embedding, d.embedding) }))
    .filter((s) => s.score >= RELATED_MIN)
    .sort((a, b) => b.score - a.score)

  if (!related.length) return { removeIds: [] }

  // Deterministic fallback: no LLM available -> treat a very close match as a
  // duplicate and skip, otherwise store without touching anything.
  if (!isTextLlmConfigured()) {
    const top = related[0]
    return top.score >= DUP_SIMILARITY
      ? { skip: top.d, removeIds: [], reason: 'near-duplicate' }
      : { removeIds: [] }
  }

  const candidates = related.slice(0, MAX_RECONCILE)
  const system =
    'You maintain a store of durable facts about two people in a relationship. ' +
    'Compare a NEW fact to the numbered EXISTING facts. An existing fact is OBSOLETE if the new ' +
    'fact states the same attribute with a different or updated value, or directly contradicts it ' +
    '(e.g. a different name for the same pet, a changed job or location). The new fact is REDUNDANT ' +
    'if an existing fact already conveys the same information. Facts about different attributes are ' +
    'independent — keep both. Respond with ONLY JSON: ' +
    '{"obsolete":[<numbers of existing facts to remove>],"redundant":<true|false>}.'
  const list = candidates.map((c, i) => `${i + 1}. ${c.d.text}`).join('\n')
  const user = `NEW: ${text}\n\nEXISTING:\n${list}`

  const raw = await classify(system, user, { maxTokens: 120 })
  const parsed = parseJsonObject<{ obsolete?: number[]; redundant?: boolean }>(raw)

  if (!parsed) {
    // LLM failed/garbled -> safe deterministic fallback.
    const top = related[0]
    return top.score >= DUP_SIMILARITY
      ? { skip: top.d, removeIds: [], reason: 'near-duplicate (llm fallback)' }
      : { removeIds: [] }
  }

  const removeIds = (parsed.obsolete || [])
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= candidates.length)
    .map((n) => candidates[n - 1].d._id)

  // If redundant AND nothing is being replaced, skip storing the new fact. When
  // it supersedes something, store the new fact even if "redundant" was flagged.
  if (parsed.redundant && !removeIds.length) {
    return { skip: candidates[0].d, removeIds: [], reason: 'redundant' }
  }

  return { removeIds, reason: removeIds.length ? 'contradiction' : undefined }
}

/**
 * Reject transient, scene-level statements that aren't worth remembering long
 * term — e.g. "Pete arrived at Julia's apartment", "she is sitting on the
 * couch", "it's raining right now". These describe the current moment, not a
 * durable fact about the people. Lasting facts (names, relationships,
 * preferences, history, promises) don't match these episodic patterns.
 */
const EPHEMERAL_PATTERNS: RegExp[] = [
  // momentary time anchors
  /\b(right now|just now|at the moment|currently|this morning|this afternoon|this evening|tonight|today|earlier (today|tonight)|a (moment|minute|second) ago)\b/i,
  // one-off motion / scene events
  /\b(just )?(arrived|arrives|arriving|left|leaving|walked|walks|walking|entered|enters|came over|comes over|showed up|shows up|stepped|knocked|sat down|sits down|stood up|stands up|got up|lay down|opened the door|closed the door|went (to|into|over))\b/i,
  // describing a present pose / ongoing action (transient state)
  /\bis (now |currently )?(sitting|standing|lying|kneeling|walking|running|driving|eating|drinking|sleeping|crying|smiling|laughing|holding|wearing|waiting|heading|on (her|his|their) way)\b/i,
]

function isEphemeral(text: string): boolean {
  return EPHEMERAL_PATTERNS.some((re) => re.test(text))
}

/** Store a fact the model chose to remember. Returns the created doc (or null). */
export async function rememberFact(
  userId: string,
  characterId: string,
  text: string,
  source: LongTermMemory['source'] = 'tool'
): Promise<LongTermMemory | null> {
  const trimmed = text.trim()
  if (!trimmed || !characterId) return null

  // Model-sourced facts get filtered for transient/scene content; a manual add
  // is the user's deliberate choice, so it's trusted.
  if (source !== 'manual' && isEphemeral(trimmed)) {
    logger.debug(
      { characterId, source, length: trimmed.length, ...(LOG_TEXT ? { text: trimmed } : {}) },
      'memory: ephemeral, skipped'
    )
    return null
  }

  // Skip exact duplicates (same character already has this exact fact).
  const existing = await collection().findOne({ userId, characterId, text: trimmed })
  if (existing) {
    logger.debug(
      { characterId, length: trimmed.length, ...(LOG_TEXT ? { text: trimmed } : {}) },
      'memory: duplicate, skipped'
    )
    return existing
  }

  const embedding = await embed(trimmed)

  // Reconcile against existing memories: a new fact may be a paraphrase (skip),
  // may contradict/update an older fact (replace it), or be unrelated (store).
  // Manual adds are the user's deliberate choice and are stored as-is.
  if (source !== 'manual') {
    const docs = await collection().find({ userId, characterId }).toArray()
    const decision = await reconcile(trimmed, embedding, docs)

    if (decision.removeIds.length) {
      await collection().deleteMany({ _id: { $in: decision.removeIds }, userId })
      logger.info(
        { characterId, removed: decision.removeIds.length, reason: decision.reason },
        'memory: superseded outdated memories'
      )
    }

    if (decision.skip) {
      logger.debug(
        {
          characterId,
          reason: decision.reason,
          ...(LOG_TEXT ? { text: trimmed, existing: decision.skip.text } : {}),
        },
        'memory: redundant, skipped'
      )
      return decision.skip
    }
  }

  const doc: LongTermMemory = {
    _id: v4(),
    userId,
    characterId,
    text: trimmed,
    embedding,
    source,
    createdAt: new Date().toISOString(),
  }
  await collection().insertOne(doc)
  logger.info(
    { characterId, source, length: trimmed.length, ...(LOG_TEXT ? { text: trimmed } : {}) },
    'memory: stored'
  )
  return doc
}

/**
 * Retrieve the memories most relevant to `query` for this user+character, ranked
 * by cosine similarity. `minScore` filters out weak matches.
 */
export async function recallMemories(
  userId: string,
  characterId: string,
  query: string,
  opts: { k?: number; minScore?: number } = {}
): Promise<LongTermMemory[]> {
  const k = opts.k ?? 5
  const minScore = opts.minScore ?? 0.3
  if (!characterId || !query.trim()) return []

  const docs = await collection().find({ userId, characterId }).toArray()
  if (!docs.length) return []

  const q = await embed(query)
  const scored = docs
    .map((d) => ({ d, score: cosine(q, d.embedding) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  if (scored.length) {
    logger.debug(
      {
        characterId,
        count: scored.length,
        topScore: +scored[0].score.toFixed(3),
        ...(LOG_TEXT
          ? { recalled: scored.map((s) => ({ score: +s.score.toFixed(3), text: s.d.text })) }
          : {}),
      },
      'memory: recalled'
    )
  }
  return scored.map((s) => s.d)
}

/** All stored memories for a user+character (newest first) — for a management UI. */
export async function listMemories(userId: string, characterId: string) {
  return collection().find({ userId, characterId }).sort({ createdAt: -1 }).toArray()
}

export async function deleteMemory(userId: string, id: string) {
  await collection().deleteOne({ _id: id, userId })
}

/** Wipe every stored memory for a user+character (used by the character reset). */
export async function deleteAllMemories(userId: string, characterId: string) {
  if (!characterId) return
  await collection().deleteMany({ userId, characterId })
}

/** Cosine similarity. Embeddings are L2-normalized, but compute fully for safety. */
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom ? dot / denom : 0
}
