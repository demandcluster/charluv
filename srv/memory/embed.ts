import { logger } from '../middleware'

/**
 * Server-side text embeddings via @xenova/transformers (transformers.js), run
 * in-process on CPU. This is the PoC backend; the rest of the memory system
 * only depends on `embed()`, so this can be swapped for an OpenAI-compatible
 * /v1/embeddings endpoint later without touching the tool or RAG code.
 *
 * Model: all-MiniLM-L6-v2 (384-dim, ~25MB quantized, downloaded + cached once).
 */
const MODEL = 'Xenova/all-MiniLM-L6-v2'

export const EMBED_DIM = 384

let pipe: any
let loading: Promise<any> | null = null

async function getEmbedder() {
  if (pipe) return pipe
  if (!loading) {
    loading = (async () => {
      // ESM-only package; dynamic import keeps it out of the require graph.
      const { pipeline } = await import('@xenova/transformers')
      const created = await pipeline('feature-extraction', MODEL, { quantized: true })
      pipe = created
      return created
    })().catch((err) => {
      loading = null
      throw err
    })
  }
  return loading
}

/** Embed a single string into a normalized 384-dim vector. */
export async function embed(text: string): Promise<number[]> {
  const p = await getEmbedder()
  const output = await p(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array)
}

/** Best-effort preload at boot so the first memory op isn't slow. */
export async function warmupEmbedder() {
  try {
    await getEmbedder()
    logger.info('Long-term memory embedder ready')
  } catch (err) {
    logger.warn({ err }, 'Long-term memory embedder failed to load')
  }
}
