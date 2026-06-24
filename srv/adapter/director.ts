import { AppSchema } from '../../common/types/schema'
import { AppLog } from '../middleware'
import { buildDirectorPrompt, buildSpeakerSchema } from '../../common/event'
import { inferenceAsync } from './generate'

type ElectOpts = {
  user: AppSchema.User
  log: AppLog
  event: { location: string; description: string }
  roster: Array<{ id: string; name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
  repliedThisTurn: string[]
}

/**
 * One director inference: elect who speaks next in an event. Returns a present
 * character id or 'none'. Any model/parse failure resolves to 'none' so a turn
 * can never crash on the director.
 */
export async function electSpeaker(opts: ElectOpts): Promise<string> {
  // A character speaks at most once per turn: drop anyone who already replied
  // from BOTH the roster the director sees and the schema enum, so the model
  // physically cannot re-elect them (the prompt hint alone doesn't hold a small
  // model at low temp — it would otherwise pick the same char every iteration).
  const replied = new Set(opts.repliedThisTurn)
  const roster = opts.roster.filter((r) => !replied.has(r.id))
  const ids = roster.map((r) => r.id)
  if (!ids.length) return 'none'

  const prompt = buildDirectorPrompt({
    event: opts.event,
    roster,
    recent: opts.recent,
    repliedThisTurn: opts.repliedThisTurn,
  })

  try {
    const { generated } = await inferenceAsync({
      user: opts.user,
      log: opts.log,
      prompt,
      maxTokens: 24,
      temp: 0.2,
      jsonSchema: buildSpeakerSchema(ids),
    })

    const picked = parseSpeaker(generated, ids)
    return picked
  } catch (err) {
    opts.log.warn({ err }, 'director: election failed, defaulting to none')
    return 'none'
  }
}

/** Tolerant parse: accept strict JSON `{ "speaker": "<id>" }` or a bare id/"none". */
function parseSpeaker(generated: string, ids: string[]): string {
  const text = (generated || '').trim()
  try {
    const obj = JSON.parse(text)
    const s = String(obj?.speaker || '').trim()
    if (s === 'none' || ids.includes(s)) return s
  } catch {}
  // Fallback: the raw text might be an id or "none".
  if (text === 'none' || ids.includes(text)) return text
  const found = ids.find((id) => text.includes(id))
  return found || 'none'
}
