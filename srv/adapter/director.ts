import { AppSchema } from '../../common/types/schema'
import { AppLog } from '../middleware'
import {
  buildDirectorPrompt,
  buildDirectorEventPrompt,
  buildDirectorEventSchema,
  buildSpeakerSchema,
} from '../../common/event'
import { inferenceAsync } from './generate'

type ElectOpts = {
  user: AppSchema.User
  log: AppLog
  event: { location: string; description: string; when?: string; vibe?: string; note?: string }
  roster: Array<{ id: string; name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
  repliedThisTurn: string[]
  /** The human participant — listed as present but never an electable speaker. */
  present?: { name: string; hook: string }
  /** Names of present characters without a line in the recent history — the
   * director prefers them on otherwise-even elections (airtime balance). */
  quiet?: string[]
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
    user: opts.present,
    // Only hint about characters that are still electable this turn.
    quiet: opts.quiet?.filter((name) => roster.some((r) => r.name === name)),
  })

  try {
    const { generated } = await inferenceAsync({
      user: opts.user,
      log: opts.log,
      prompt,
      maxTokens: 24,
      temp: 0.2,
      jsonSchema: buildSpeakerSchema(ids),
      // Orchestration (speaker election + world beats) runs on the original Qwen
      // model via the mod endpoint — it follows structured/JSON instructions far
      // better than the chat finetune (tutu), which broke delegation. tutu only
      // does the in-character replies. Falls back to the text endpoint if no mod
      // endpoint is configured.
      moderation: true,
      // Clean utility system prompt: override any roleplay default baked into the
      // served model's chat template (and protect against the tutu fallback when
      // no mod endpoint is set) so the model does the tool task, not in-character
      // prose. The schema (guided_json) still forces the output shape on top.
      system: `You are a scene director that picks the next speaker. Respond only with the requested JSON. Do not roleplay or answer in character.`,
    })

    const picked = parseSpeaker(generated, ids)
    return picked
  } catch (err) {
    opts.log.warn({ err }, 'director: election failed, defaulting to none')
    return 'none'
  }
}

type DirectorEventOpts = {
  user: AppSchema.User
  log: AppLog
  event: { location: string; description: string; when?: string; vibe?: string; note?: string }
  roster: Array<{ name: string; hook: string }>
  recent: Array<{ name: string; text: string }>
}

/**
 * One director inference: optionally produce a short world/narration beat to push
 * the scene forward (announcement, arrival, environment shift). Returns the beat
 * text, or '' when the director declines / on any model or parse failure (a beat
 * is never essential, so it must never crash a turn).
 */
export async function proposeDirectorEvent(opts: DirectorEventOpts): Promise<string> {
  const prompt = buildDirectorEventPrompt({
    event: opts.event,
    roster: opts.roster,
    recent: opts.recent,
  })

  try {
    const { generated } = await inferenceAsync({
      user: opts.user,
      log: opts.log,
      prompt,
      maxTokens: 100,
      temp: 0.7,
      jsonSchema: buildDirectorEventSchema(),
      // World-beat narration is orchestration too — run it on the original Qwen
      // model (mod endpoint), not the chat finetune. See electSpeaker.
      moderation: true,
      // Clean utility system prompt so the model narrates the world as a director
      // tool, not in character — overrides any roleplay default on the served
      // model (and the tutu fallback). See electSpeaker.
      system: `You are an unseen scene director narrating world events. Respond only with the requested JSON. Do not roleplay or speak as any character.`,
    })
    return parseNarration(generated)
  } catch (err) {
    opts.log.warn({ err }, 'director: world-beat generation failed, skipping')
    return ''
  }
}

/** Pull the narration string out of `{ "narration": "..." }`, tolerating chatter. */
function parseNarration(generated: string): string {
  const text = (generated || '').trim()
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const obj = JSON.parse(match[0])
      const s = String(obj?.narration ?? '').trim()
      // Guard against a model echoing a literal empty-marker.
      if (s.toLowerCase() === 'empty string' || s === '""') return ''
      return s
    }
  } catch {}
  return ''
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
