import { v4 } from 'uuid'
import { getDb } from '../db/client'
import { embed } from './embed'
import { logger } from '../middleware'

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
  /** How the memory was created: the model's `remember` tool, or automatic. */
  source: 'tool' | 'auto'
  createdAt: string
}

const collection = () => getDb().collection<LongTermMemory>('longterm-memory')

/** Store a fact the model chose to remember. Returns the created doc (or null). */
export async function rememberFact(
  userId: string,
  characterId: string,
  text: string,
  source: LongTermMemory['source'] = 'tool'
): Promise<LongTermMemory | null> {
  const trimmed = text.trim()
  if (!trimmed || !characterId) return null

  // Skip near-duplicates (same character already has this exact fact).
  const existing = await collection().findOne({ userId, characterId, text: trimmed })
  if (existing) {
    logger.debug({ characterId, text: trimmed }, 'memory: duplicate, skipped')
    return existing
  }

  const embedding = await embed(trimmed)
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
  logger.info({ characterId, source, text: trimmed }, 'memory: stored')
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
      { characterId, recalled: scored.map((s) => ({ score: +s.score.toFixed(3), text: s.d.text })) },
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
